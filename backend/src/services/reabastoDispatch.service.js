// Despacho del envío proveedor → tienda (tarea 24, fase 2).
// Corre como job cada 60s (registrado en app.js). Solo LEE y avisa: no toca la
// base, así que es seguro aunque el viaje todavía no se pueda aceptar.
//
// A diferencia del despacho a clientes (dispatch.service.js), aquí el viaje va
// de la sucursal del proveedor a la tienda y se ofrece SOLO a repartidores de
// proveedores cuyo vehículo aguante el peso del paquete:
//   · el paquete está CONFIRMADO/LISTO para recoger y su pedido es ENVIO_VIDA
//   · sin repartidor asignado todavía
//   · se calcula su peso (Σ cantidad × PesoKg del producto)
//   · se ofrece a los repartidores PROVEEDORES/AMBOS, aprobados y disponibles,
//     dentro del radio de la sucursal, cuya CapacidadKg aguante el peso
//   · si falta el peso de algún producto, o nadie aguanta, VIDA lo asigna a mano
import { getPool, sql } from '../db/sqlserver.js';
import { broadcast } from '../ws/ws.manager.js';
import { enviarPush } from './push.service.js';
import { pesoPaqueteKg, candidatosPorCapacidad } from './reabastoProveedor.service.js';

const RADIO_KM = 15;      // los viajes a proveedor son más largos que los de cliente
const MAX_PAQUETES = 2;   // paquetes de proveedor activos a la vez por repartidor

// Memoria en proceso: a quién ya se le avisó cada paquete y si ya se pidió
// asignación manual, para no repetir el push cada 60s.
const memoria = new Map(); // idPedidoProveedor(string) → { notificados:Set, manual:bool }
const mem = (id) => {
  const k = String(id);
  if (!memoria.has(k)) memoria.set(k, { notificados: new Set(), manual: false });
  return memoria.get(k);
};

export async function procesarEnviosProveedor(log) {
  const pool = await getPool();

  // Paquetes listos para recoger, con envío de VIDA y sin repartidor.
  const r = await pool.request().query(`
    SELECT pp.idBranch, pp.idCuenta, pp.idPedidoProveedor, pp.idPedidoMatriz, pp.Folio,
           pp.idProveedor, pr.Nombre AS NombreProveedor,
           s.Nombre AS NombreSucursal, s.Direccion, s.Latitud AS LatSucursal, s.Longitud AS LonSucursal
    FROM VIDA_PEDIDOS_PROVEEDOR pp
    JOIN VIDA_PEDIDOS_MATRIZ pm
      ON pm.idBranch=pp.idBranch AND pm.idCuenta=pp.idCuenta AND pm.idPedidoMatriz=pp.idPedidoMatriz
    LEFT JOIN VIDA_PROVEEDORES pr
      ON pr.idBranch=pp.idBranch AND pr.idCuenta=pp.idCuenta AND pr.idProveedor=pp.idProveedor
    LEFT JOIN VIDA_PROVEEDORES_SUCURSALES s
      ON s.idBranch=pp.idBranch AND s.idCuenta=pp.idCuenta AND s.idProveedor=pp.idProveedor AND s.idSucursal=pp.idSucursal
    WHERE pm.ModoRecepcion='ENVIO_VIDA'
      AND pp.idRepartidor IS NULL
      AND pp.Status IN ('CONFIRMADO','LISTO')`);

  const activos = new Set();

  for (const p of r.recordset) {
    activos.add(String(p.idPedidoProveedor));
    try {
      // Peso del paquete: cada renglón del pedido que es de este proveedor.
      const det = await pool.request()
        .input('idBranch', sql.BigInt, p.idBranch)
        .input('idCuenta', sql.BigInt, p.idCuenta)
        .input('idPP', sql.BigInt, p.idPedidoProveedor)
        .query(`SELECT d.CantidadSolicitada AS Cantidad, inv.PesoKg
                FROM VIDA_PEDIDOS_MATRIZ_DETALLE d
                LEFT JOIN VIDA_INVENTARIO_PRODUCTOS inv
                  ON inv.idBranch=d.idBranch AND inv.idCuenta=d.idCuenta AND inv.idProducto=d.idProducto
                WHERE d.idBranch=@idBranch AND d.idCuenta=@idCuenta AND d.idPedidoProveedor=@idPP`);

      const { kg, completo } = pesoPaqueteKg(det.recordset);
      const m = mem(p.idPedidoProveedor);

      // Falta el peso de algún producto: el total no es confiable → a mano.
      if (!completo) { avisarManual(p, kg, 'faltan pesos de productos', m, log); continue; }

      // Repartidores de proveedores, aprobados y disponibles, dentro del radio.
      const reps = await candidatos(pool, p);
      const aptos = candidatosPorCapacidad(reps, kg);

      if (!aptos.length) { avisarManual(p, kg, 'ningún repartidor con capacidad', m, log); continue; }

      const nuevos = aptos.filter(x => !m.notificados.has(String(x.idRepartidor)));
      if (nuevos.length) {
        broadcast(p.idBranch, p.idCuenta, {
          tipo: 'envio_proveedor_disponible',
          idPedidoProveedor: p.idPedidoProveedor,
          Folio: p.Folio,
          NombreSucursal: p.NombreSucursal ?? '',
          Direccion: p.Direccion ?? '',
          PesoKg: kg,
          repartidores: nuevos.map(x => x.idRepartidor),
        });
        enviarPush(
          nuevos.map(x => x.FcmToken).filter(Boolean),
          {
            title: '📦 Recolección disponible',
            body: `${p.NombreSucursal ?? 'Proveedor'} — ${kg} kg`,
            data: { tipo: 'envio_proveedor_disponible', idPedidoProveedor: p.idPedidoProveedor },
          },
          log,
        );
        nuevos.forEach(x => m.notificados.add(String(x.idRepartidor)));
      }
    } catch (err) {
      log?.error?.(`procesarEnviosProveedor paquete ${p.idPedidoProveedor}: ${err.message}`);
    }
  }

  // Olvidar paquetes que ya no están pendientes.
  for (const k of memoria.keys()) if (!activos.has(k)) memoria.delete(k);
}

// Avisa a VIDA (panel) que este paquete necesita asignación manual. Una sola vez.
function avisarManual(p, kg, motivo, m, log) {
  if (m.manual) return;
  m.manual = true;
  broadcast(p.idBranch, p.idCuenta, {
    tipo: 'envio_proveedor_asignar_manual',
    idPedidoProveedor: p.idPedidoProveedor,
    Folio: p.Folio,
    NombreSucursal: p.NombreSucursal ?? '',
    PesoKg: kg,
    Motivo: motivo,
  });
  log?.info?.(`envío proveedor ${p.idPedidoProveedor} a asignación manual: ${motivo}`);
}

// Repartidores de proveedores aprobados y disponibles, con cupo, dentro del
// radio de la sucursal. La capacidad se filtra después con el helper testeado.
async function candidatos(pool, p) {
  const conUbicacion = p.LatSucursal != null && p.LonSucursal != null;
  const req = pool.request()
    .input('idBranch', sql.BigInt, p.idBranch)
    .input('idCuenta', sql.BigInt, p.idCuenta)
    .input('maxPaquetes', sql.Int, MAX_PAQUETES);
  if (conUbicacion) {
    req.input('lat', sql.Float, parseFloat(p.LatSucursal))
       .input('lon', sql.Float, parseFloat(p.LonSucursal))
       .input('radioKm', sql.Float, RADIO_KM);
  }
  const r = await req.query(`
    SELECT r.idRepartidor, r.FcmToken, r.CapacidadKg
    FROM VIDA_REPARTIDORES r
    WHERE r.idBranch=@idBranch AND r.idCuenta=@idCuenta AND r.Status='ACTIVO'
      AND ISNULL(r.StatusAprobacion,'APROBADO') NOT IN ('PENDIENTE','RECHAZADO')
      AND ISNULL(r.TipoReparto,'CLIENTES') IN ('PROVEEDORES','AMBOS')
      AND r.StatusRepartidor IN ('DISPONIBLE','OCUPADO')
      AND (SELECT COUNT(*) FROM VIDA_PEDIDOS_PROVEEDOR pa
           WHERE pa.idBranch=r.idBranch AND pa.idCuenta=r.idCuenta
             AND pa.idRepartidor=r.idRepartidor
             AND pa.Status NOT IN ('RECIBIDO','CANCELADO')) < @maxPaquetes
      ${conUbicacion ? `
      AND (
        r.UltimaLatitud IS NULL OR r.UltimaLongitud IS NULL
        OR (6371 * ACOS(
          COS(RADIANS(@lat)) * COS(RADIANS(r.UltimaLatitud)) *
          COS(RADIANS(r.UltimaLongitud) - RADIANS(@lon)) +
          SIN(RADIANS(@lat)) * SIN(RADIANS(r.UltimaLatitud))
        )) <= @radioKm
      )` : ''}
  `);
  return r.recordset;
}
