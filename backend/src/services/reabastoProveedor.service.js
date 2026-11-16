// src/services/reabastoProveedor.service.js
// Reglas puras del reabasto por proveedor (tarea 24, sql/59): VIDA le vende a
// la tienda al precio de lista del proveedor y le paga al proveedor ese precio
// menos su comisión. Sin BD, para poder probarlas solas.
import { randomBytes } from 'node:crypto';

const dec4 = (v) => Math.round((Number(v) || 0) * 10000) / 10000;

// Elige el proveedor de cada producto: el de menor precio de lista y, si
// empatan, el de id más bajo (estable). `ofertas` son filas
// { idProducto, idProveedor, PrecioLista }; las de precio vacío o <= 0 no
// cuentan. Devuelve Map idProducto(string) → oferta elegida.
export function elegirProveedores(ofertas) {
  const elegido = new Map();
  for (const o of ofertas) {
    const precio = Number(o.PrecioLista);
    if (!(precio > 0)) continue;
    const k = String(o.idProducto);
    const actual = elegido.get(k);
    if (!actual || precio < actual.PrecioLista ||
        (precio === actual.PrecioLista && Number(o.idProveedor) < Number(actual.idProveedor))) {
      elegido.set(k, { ...o, PrecioLista: precio });
    }
  }
  return elegido;
}

// Lo que VIDA le paga al proveedor por un total de lista, y lo que se queda.
export function repartoComision(totalLista, comisionPct) {
  const pct = Number(comisionPct) || 0;
  if (pct < 0 || pct >= 100) throw new Error('La comisión de VIDA debe estar entre 0 y 100 %');
  const total = dec4(totalLista);
  const pagar = dec4(total * (1 - pct / 100));
  return { totalLista: total, pagarProveedor: pagar, comisionVida: dec4(total - pagar) };
}

// La sucursal activa más cercana a la tienda. Sin coordenadas de la tienda o
// de las sucursales, la primera (por id). null si el proveedor no tiene.
export function sucursalMasCercana(sucursales, lat, lng) {
  const activas = (sucursales || []).filter(s => s.Status == null || s.Status === 'ACTIVO')
    .sort((a, b) => Number(a.idSucursal) - Number(b.idSucursal));
  if (!activas.length) return null;
  const la = Number(lat), lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || (la === 0 && lo === 0)) return activas[0];
  let mejor = null, mejorD = Infinity;
  for (const s of activas) {
    const sla = Number(s.Latitud), slo = Number(s.Longitud);
    if (s.Latitud == null || s.Longitud == null || !Number.isFinite(sla) || !Number.isFinite(slo)) continue;
    const d = distanciaKm(la, lo, sla, slo);
    if (d < mejorD) { mejor = s; mejorD = d; }
  }
  return mejor || activas[0];
}

export function distanciaKm(lat1, lng1, lat2, lng2) {
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Código de retiro que va en el QR: 8 caracteres sin los que se confunden al
// dictarlo (0/O, 1/I/L).
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function codigoRetiro(largo = 8) {
  const bytes = randomBytes(largo);
  let s = '';
  for (let i = 0; i < largo; i++) s += ALFABETO[bytes[i] % ALFABETO.length];
  return s;
}

export const normalizarCodigo = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Folio que ve el proveedor: no dice nada de la tienda.
export function folioReabasto(idPedidoProveedor, fecha = new Date()) {
  return `VR-${fecha.getUTCFullYear()}-${String(idPedidoProveedor).padStart(6, '0')}`;
}

export function tokenPortal() {
  return randomBytes(24).toString('hex');
}

// Estado del pedido de la tienda una vez pagado, según sus paquetes: queda
// RECIBIDO cuando ya no hay paquetes pendientes y al menos uno llegó.
export function estadoTrasPaquetes(statusPaquetes) {
  const vivos = statusPaquetes.filter(s => s !== 'CANCELADO');
  if (!vivos.length) return 'CANCELADO';
  return vivos.every(s => s === 'RECIBIDO') ? 'RECIBIDO' : 'EN_PROCESO';
}

// ── Despacho por capacidad (envío proveedor → tienda) ──
// Peso total de un paquete, para saber en qué vehículo cabe. `lineas` son filas
// { Cantidad, PesoKg }. `completo` es false si algún producto no tiene peso
// cargado: en ese caso el total no es confiable y VIDA asigna a mano.
export function pesoPaqueteKg(lineas) {
  let kg = 0, completo = true;
  for (const l of lineas || []) {
    const cant = Number(l.Cantidad) || 0;
    const peso = Number(l.PesoKg);
    if (l.PesoKg == null || !Number.isFinite(peso) || peso < 0) { completo = false; continue; }
    kg += cant * peso;
  }
  return { kg: Math.round(kg * 1000) / 1000, completo };
}

// ¿El vehículo del repartidor aguanta el peso del paquete? Sin capacidad
// declarada (null/0) no se le ofrece; peso 0 o desconocido lo deja pasar a
// cualquiera con capacidad.
export function repartidorAguanta(capacidadKg, pesoKg) {
  const cap = Number(capacidadKg);
  if (!Number.isFinite(cap) || cap <= 0) return false;
  const peso = Number(pesoKg);
  if (!Number.isFinite(peso) || peso <= 0) return true;
  return cap >= peso;
}

// De una lista de repartidores { idRepartidor, CapacidadKg }, los que aguantan
// el peso, del de menor capacidad al mayor (se usa primero el vehículo más
// justo y se dejan libres los grandes para pedidos pesados).
export function candidatosPorCapacidad(repartidores, pesoKg) {
  return (repartidores || [])
    .filter(r => repartidorAguanta(r.CapacidadKg, pesoKg))
    .sort((a, b) => Number(a.CapacidadKg) - Number(b.CapacidadKg));
}
