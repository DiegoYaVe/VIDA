// Servicio de ruteo multi-pedido: ordena las paradas del repartidor
// (recolecciones en sucursal + entregas a clientes) con vecino más cercano
// respetando la precedencia recoger-antes-de-entregar, y calcula la hora
// estimada de entrega (ETA) de cada pedido a partir de la distancia.
//
// Las distancias son haversine * FACTOR_VIAL (aproximación de calles reales);
// no depende de APIs externas de direcciones, así que funciona sin costo y
// sin internet de terceros. Si algún día se quiere precisión de calles, solo
// hay que reemplazar distanciaKm() por una llamada a un motor de rutas.
import { getPool, sql } from '../db/sqlserver.js';
import { broadcast } from '../ws/ws.manager.js';

const FACTOR_VIAL = 1.35;

// Estados donde el pedido aún NO fue recogido en sucursal
const REQUIERE_PICKUP = ['REPARTIDOR_ASIGNADO', 'IR_A_SUCURSAL', 'EN_SUCURSAL'];
// Estados activos de un pedido en manos de un repartidor
export const STATUS_ACTIVOS_REPARTIDOR = [...REQUIERE_PICKUP, 'EN_CAMINO'];

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanciaKm(a, b) {
  return haversineKm(a.lat, a.lon, b.lat, b.lon) * FACTOR_VIAL;
}

async function getConfigNum(pool, idBranch, idCuenta, clave, defVal) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .input('clave', sql.VarChar(100), clave)
    .query(`SELECT Valor FROM VIDA_CONFIG_DELIVERY
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Clave=@clave`);
  const v = r.recordset.length ? parseFloat(r.recordset[0].Valor) : NaN;
  return Number.isFinite(v) && v > 0 ? v : defVal;
}

// Ordena las paradas con vecino más cercano respetando precedencia:
// la entrega de un pedido solo es elegible cuando su sucursal ya fue
// visitada en la ruta (o el pedido ya va EN_CAMINO).
//
// pedidos: [{ idPedido, idCliente, Status, idPuntoVenta,
//             pickup: {lat,lon}|null, dropoff: {lat,lon}|null, ... }]
// origen: { lat, lon } — última ubicación del repartidor
//
// Devuelve [{ tipo:'PICKUP'|'ENTREGA', lat, lon, kmAcum, minAcum,
//             idPuntoVenta?, NombreSucursal?, pedidos?: [idPedido] (pickup),
//             idPedido?, idCliente? (entrega) }]
export function ordenarParadas(origen, pedidos, { velocidadKmH = 22, minutosPorParada = 4 } = {}) {
  const paradas = [];

  // Pickups agrupados por sucursal (una parada recoge todos sus pedidos)
  const pickups = new Map();
  for (const p of pedidos) {
    if (!REQUIERE_PICKUP.includes(p.Status)) continue;
    if (!p.pickup) continue;
    const key = String(p.idPuntoVenta);
    if (!pickups.has(key)) {
      pickups.set(key, {
        tipo: 'PICKUP', idPuntoVenta: p.idPuntoVenta,
        NombreSucursal: p.NombreSucursal || '',
        lat: p.pickup.lat, lon: p.pickup.lon,
        pedidos: [], visitada: false,
      });
    }
    pickups.get(key).pedidos.push(p.idPedido);
  }

  const entregas = pedidos.map(p => ({
    tipo: 'ENTREGA', idPedido: p.idPedido, idCliente: p.idCliente,
    idPuntoVenta: p.idPuntoVenta,
    lat: p.dropoff?.lat ?? null, lon: p.dropoff?.lon ?? null,
    // sin pickup pendiente → elegible desde el inicio
    requierePickup: REQUIERE_PICKUP.includes(p.Status) && pickups.has(String(p.idPuntoVenta)),
    visitada: false,
  }));

  const sinCoords = entregas.filter(e => e.lat == null || e.lon == null);
  const candidatas = () => [
    ...[...pickups.values()].filter(pk => !pk.visitada),
    ...entregas.filter(e =>
      !e.visitada && e.lat != null && e.lon != null &&
      (!e.requierePickup || pickups.get(String(e.idPuntoVenta))?.visitada)),
  ];

  let cursor = origen && origen.lat != null ? { ...origen } : null;
  let kmAcum = 0;
  let minAcum = 0;

  let pendientes = candidatas();
  while (pendientes.length) {
    // más cercana al cursor; sin ubicación del repartidor, se toma en orden
    let siguiente = pendientes[0];
    if (cursor) {
      let mejor = Infinity;
      for (const c of pendientes) {
        const d = distanciaKm(cursor, c);
        if (d < mejor) { mejor = d; siguiente = c; }
      }
    }
    const tramo = cursor ? distanciaKm(cursor, siguiente) : 0;
    kmAcum += tramo;
    minAcum += (tramo / velocidadKmH) * 60 + minutosPorParada;
    siguiente.visitada = true;
    paradas.push({ ...siguiente, kmAcum: +kmAcum.toFixed(2), minAcum: Math.round(minAcum) });
    cursor = { lat: siguiente.lat, lon: siguiente.lon };
    pendientes = candidatas();
  }

  // Entregas sin coordenadas van al final, sin ETA calculable
  for (const e of sinCoords) {
    e.visitada = true;
    paradas.push({ ...e, kmAcum: null, minAcum: null });
  }

  return paradas;
}

// Recalcula la ruta completa de un repartidor, persiste OrdenRuta /
// DistanciaKm / ETAEntrega en VIDA_PEDIDOS y avisa por WebSocket a los
// clientes (eta_pedido) y al panel/repartidor (ruta_actualizada).
export async function recalcularRuta(idBranch, idCuenta, idRepartidor, log) {
  const pool = await getPool();

  const [velocidadKmH, minutosPorParada] = await Promise.all([
    getConfigNum(pool, idBranch, idCuenta, 'VelocidadPromedioKmH', 22),
    getConfigNum(pool, idBranch, idCuenta, 'MinutosPorParada', 4),
  ]);

  const repR = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .input('idRepartidor', sql.BigInt, idRepartidor)
    .query(`SELECT UltimaLatitud, UltimaLongitud FROM VIDA_REPARTIDORES
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);
  const rep = repR.recordset[0];
  const origen = rep && rep.UltimaLatitud != null
    ? { lat: parseFloat(rep.UltimaLatitud), lon: parseFloat(rep.UltimaLongitud) }
    : null;

  const pedR = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .input('idRepartidor', sql.BigInt, idRepartidor)
    .query(`SELECT p.idPedido, p.idCliente, p.Status, p.idPuntoVenta,
                   p.UbicacionEntregaLat, p.UbicacionEntregaLon,
                   pv.NomComercial AS NombreSucursal,
                   pv.Latitud AS LatSucursal, pv.Longitud AS LonSucursal
            FROM VIDA_PEDIDOS p
            LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv
              ON pv.idBranch=p.idBranch AND pv.idCuenta=p.idCuenta AND pv.idPuntoVenta=p.idPuntoVenta
            WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
              AND p.idRepartidor=@idRepartidor
              AND p.Status IN ('${STATUS_ACTIVOS_REPARTIDOR.join("','")}')`);

  const pedidos = pedR.recordset.map(p => ({
    idPedido: p.idPedido,
    idCliente: p.idCliente,
    Status: p.Status,
    idPuntoVenta: p.idPuntoVenta,
    NombreSucursal: p.NombreSucursal,
    pickup: p.LatSucursal != null
      ? { lat: parseFloat(p.LatSucursal), lon: parseFloat(p.LonSucursal) } : null,
    dropoff: p.UbicacionEntregaLat != null
      ? { lat: parseFloat(p.UbicacionEntregaLat), lon: parseFloat(p.UbicacionEntregaLon) } : null,
  }));

  const paradas = ordenarParadas(origen, pedidos, { velocidadKmH, minutosPorParada });

  // Persistir orden/ETA por pedido (solo las paradas de ENTREGA)
  const ahora = Date.now();
  let ordenEntrega = 0;
  const etas = [];
  for (const parada of paradas) {
    if (parada.tipo !== 'ENTREGA') continue;
    ordenEntrega += 1;
    const eta = parada.minAcum != null ? new Date(ahora + parada.minAcum * 60000) : null;
    etas.push({
      idPedido: parada.idPedido, idCliente: parada.idCliente,
      OrdenRuta: ordenEntrega, DistanciaKm: parada.kmAcum,
      ETAEntrega: eta, MinutosRestantes: parada.minAcum,
      ParadasAntes: ordenEntrega - 1,
    });
    await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idPedido', sql.BigInt, parada.idPedido)
      .input('OrdenRuta', sql.Int, ordenEntrega)
      .input('DistanciaKm', sql.Decimal(8, 2), parada.kmAcum)
      .input('ETAEntrega', sql.DateTime, eta)
      .query(`UPDATE VIDA_PEDIDOS
              SET OrdenRuta=@OrdenRuta, DistanciaKm=@DistanciaKm, ETAEntrega=@ETAEntrega
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);
  }

  // Un solo mensaje con la ruta completa (app repartidor + panel web)
  broadcast(idBranch, idCuenta, {
    tipo: 'ruta_actualizada',
    idRepartidor,
    paradas,
    etas: etas.map(e => ({ ...e, ETAEntrega: e.ETAEntrega?.toISOString() ?? null })),
  });

  // Aviso individual por pedido (la app cliente filtra por idPedido)
  for (const e of etas) {
    broadcast(idBranch, idCuenta, {
      tipo: 'eta_pedido',
      idPedido: e.idPedido,
      idCliente: e.idCliente,
      ETAEntrega: e.ETAEntrega?.toISOString() ?? null,
      MinutosRestantes: e.MinutosRestantes,
      ParadasAntes: e.ParadasAntes,
      OrdenRuta: e.OrdenRuta,
    });
  }

  return { paradas, etas };
}

// Recalcular con límite de frecuencia — se usa desde el update de ubicación
// (cada 15s por repartidor); evita recomputar la ruta en cada ping GPS.
const ultimoRecalculo = new Map(); // idRepartidor → timestamp
const INTERVALO_RECALC_MS = 45000;

export async function recalcularRutaThrottled(idBranch, idCuenta, idRepartidor, log) {
  const key = `${idBranch}:${idCuenta}:${idRepartidor}`;
  const ultimo = ultimoRecalculo.get(key) ?? 0;
  if (Date.now() - ultimo < INTERVALO_RECALC_MS) return null;
  ultimoRecalculo.set(key, Date.now());
  try {
    return await recalcularRuta(idBranch, idCuenta, idRepartidor, log);
  } catch (err) {
    log?.error?.('recalcularRuta falló: ' + err.message);
    return null;
  }
}
