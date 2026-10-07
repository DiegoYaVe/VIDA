// src/services/alcance.service.js
// Alcance (scope) de un usuario sobre las tiendas de la red.
//
// El HANDOFF advierte que hoy esta regla está escrita a mano en ocho lugares
// (`esRed` inline en dashboard, inventario, pedidos, caja, matriz…, más
// `pvEfectivo` en finanzas) y que van a divergir. Este módulo NO los refactoriza
// —eso sería tocar código que hoy funciona— pero es la fuente única para todo
// lo nuevo de compras y cuentas, y el lugar donde vive el ensanchamiento del
// ADMIN de la Matriz.
import { getPool, sql } from '../db/sqlserver.js';

// Roles que ven toda la red, sin importar su idPuntoVenta
export const ROLES_RED = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO'];

export function esRed(user) {
  return ROLES_RED.includes(user?.TipoUsuario);
}

// Roles de tienda: solo su propio punto de venta.
export const ROLES_TIENDA = ['ADMIN', 'SUPERVISOR', 'CAJERO', 'CASHIER'];

// ── Alcance geográfico sobre las tiendas ────────────────────────────────────
// "Rol de red" no significa "toda la red":
//  - SUPER_ADMIN: toda la cuenta.
//  - ADMIN_PAIS: las tiendas de su país si lo tiene asignado; si no, toda la
//    cuenta (comportamiento histórico, para no dejar sin acceso a nadie).
//  - ADMIN_ESTADO: solo las tiendas de su estado. Sin estado asignado, ninguna:
//    un error de configuración no debe abrirle toda la red.
//  - Roles de tienda: su tienda.

// Condición SQL sobre la tabla de tiendas (columnas con prefijo `alias`) y sus
// parámetros. La usan los reportes y los selectores de tiendas.
export function alcanceGeo(user, alias = 'pv') {
  const { TipoUsuario, idPuntoVenta, idEstado, idPais } = user || {};
  const col = (c) => (alias ? `${alias}.${c}` : c);
  if (ROLES_TIENDA.includes(TipoUsuario))
    return { sql: ` AND ${col('idPuntoVenta')} = @geoForzado`, params: [['geoForzado', sql.BigInt, idPuntoVenta ?? null]] };
  if (TipoUsuario === 'ADMIN_ESTADO')
    return idEstado != null
      ? { sql: ` AND ${col('idEstado')} = @geoAlcance`, params: [['geoAlcance', sql.BigInt, idEstado]] }
      : { sql: ' AND 1 = 0', params: [] };
  if (TipoUsuario === 'ADMIN_PAIS' && idPais != null)
    return { sql: ` AND ${col('idPais')} = @geoAlcance`, params: [['geoAlcance', sql.BigInt, idPais]] };
  return { sql: '', params: [] };
}

// Para los listados de red: restringe la columna de tienda `colPV` de
// cualquier consulta a las tiendas del alcance del usuario. Agrega sus
// parámetros a `dbReq`, que debe declarar @idBranch e @idCuenta. Para roles de
// tienda no hace nada (cada controller ya los fija a su tienda).
export function filtroTiendasRed(user, colPV, dbReq) {
  const { TipoUsuario, idEstado, idPais } = user || {};
  const sub = (campo) =>
    ` AND ${colPV} IN (SELECT alc.idPuntoVenta FROM VIDA_CUENTA_PUNTOS_VENTA alc
        WHERE alc.idBranch=@idBranch AND alc.idCuenta=@idCuenta AND alc.${campo}=@alcRed)`;
  if (TipoUsuario === 'ADMIN_ESTADO') {
    if (idEstado == null) return ' AND 1 = 0';
    dbReq.input('alcRed', sql.BigInt, idEstado);
    return sub('idEstado');
  }
  if (TipoUsuario === 'ADMIN_PAIS' && idPais != null) {
    dbReq.input('alcRed', sql.BigInt, idPais);
    return sub('idPais');
  }
  return '';
}

// ¿Puede este usuario ver u operar la tienda `idPuntoVenta`?
export async function tiendaEnAlcance(user, idPuntoVenta, pool = null) {
  if (idPuntoVenta == null || idPuntoVenta === '') return false;
  const { TipoUsuario, idEstado, idPais } = user || {};
  if (ROLES_TIENDA.includes(TipoUsuario)) return String(idPuntoVenta) === String(user.idPuntoVenta);
  if (TipoUsuario === 'SUPER_ADMIN') return true;
  if (TipoUsuario === 'ADMIN_PAIS' && idPais == null) return true;
  if (TipoUsuario === 'ADMIN_ESTADO' && idEstado == null) return false;
  if (!['ADMIN_PAIS', 'ADMIN_ESTADO'].includes(TipoUsuario)) return false;
  const p = pool || await getPool();
  const r = await p.request()
    .input('idBranch', sql.BigInt, user.idBranch)
    .input('idCuenta', sql.BigInt, user.idCuenta)
    .input('idPuntoVenta', sql.BigInt, idPuntoVenta)
    .query(`SELECT idEstado, idPais FROM VIDA_CUENTA_PUNTOS_VENTA
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@idPuntoVenta`);
  const t = r.recordset[0];
  if (!t) return false;
  return TipoUsuario === 'ADMIN_ESTADO'
    ? String(t.idEstado) === String(idEstado)
    : String(t.idPais) === String(idPais);
}

// idPuntoVenta de la Matriz de la cuenta, o null si no hay ninguna designada.
export async function idPuntoVentaMatriz(pool, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT TOP 1 idPuntoVenta FROM VIDA_CUENTA_PUNTOS_VENTA
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta
              AND EsMatriz=1 AND Status='ACTIVO'`);
  return r.recordset[0]?.idPuntoVenta ?? null;
}

// ¿Este usuario puede operar la Matriz (comprar a proveedores, ver y cobrar las
// cuentas de toda la red, configurar moneda y tasas)?
//
// Solo el SUPER_ADMIN, MÁS el ADMIN del punto de venta marcado como Matriz:
// ese es el ensanchamiento que pidió el negocio. Un ADMIN sigue scopeado a su
// tienda en todo lo demás (inventario, caja, ventas); lo único que se le abre es
// la operación de la Matriz, y solo si su tienda ES la Matriz. ADMIN_PAIS y
// ADMIN_ESTADO no la operan (decisión de negocio, 2026-10-07): solo leen las
// CXC de su región (ver alcanceCuentas).
//
// Devuelve { permitido, esRed, idPuntoVentaMatriz, motivo }.
export async function operadorMatriz(user, pool = null) {
  const p = pool || await getPool();
  const pvMatriz = await idPuntoVentaMatriz(p, user.idBranch, user.idCuenta);

  if (user?.TipoUsuario === 'SUPER_ADMIN') {
    return { permitido: true, esRed: true, idPuntoVentaMatriz: pvMatriz, motivo: null };
  }

  if (!pvMatriz) {
    return {
      permitido: false, esRed: false, idPuntoVentaMatriz: null,
      motivo: 'Todavía no hay una Matriz designada en la red',
    };
  }

  if (user.TipoUsuario === 'ADMIN' && String(user.idPuntoVenta) === String(pvMatriz)) {
    return { permitido: true, esRed: false, idPuntoVentaMatriz: pvMatriz, motivo: null };
  }

  return {
    permitido: false, esRed: esRed(user), idPuntoVentaMatriz: pvMatriz,
    motivo: 'Solo el SUPER_ADMIN y la Matriz pueden operar compras a proveedores y cuentas de la red',
  };
}

// preHandler de Fastify: exige poder operar la Matriz y deja el resultado en
// `request.matriz` para que el controller no vuelva a consultarlo.
export async function requireMatriz(request, reply) {
  const res = await operadorMatriz(request.user);
  if (!res.permitido) {
    return reply.code(403).send({ error: res.motivo, codigo: 'NO_ES_MATRIZ' });
  }
  request.matriz = res;
}

// Alcance de lectura de cuentas.
//
// El SUPER_ADMIN y el ADMIN de la Matriz ven TODAS las cuentas y las operan.
// ADMIN_PAIS / ADMIN_ESTADO ven, en solo lectura, las CXC de las tiendas de su
// región (lo que le deben a la Matriz) y ninguna CXP. Un ADMIN de sucursal
// común ve solo lo que SU tienda le debe a la Matriz: las CXC donde él es el
// deudor, y ninguna CXP (la deuda con el proveedor no es asunto suyo).
//
// Devuelve { verTodo, region, soloCxcDe } — `region` indica lectura regional
// (filtrar con filtroTiendasRed / tiendaEnAlcance); `soloCxcDe` es el
// idPuntoVenta del ADMIN de sucursal.
export async function alcanceCuentas(user, pool = null) {
  const res = await operadorMatriz(user, pool);
  if (res.permitido) return { verTodo: true, region: false, soloCxcDe: null };
  if (['ADMIN_PAIS', 'ADMIN_ESTADO'].includes(user?.TipoUsuario)) return { verTodo: false, region: true, soloCxcDe: null };
  return { verTodo: false, region: false, soloCxcDe: user.idPuntoVenta ?? null };
}

// ¿Puede este usuario ubicar una tienda en { idPais, idEstado }? Para crear o
// mover tiendas: ADMIN_ESTADO solo dentro de su estado, ADMIN_PAIS dentro de
// su país (sin país asignado: cualquiera), SUPER_ADMIN en cualquiera. Los
// roles de tienda no ubican tiendas.
export function ubicacionEnAlcance(user, { idPais, idEstado } = {}) {
  const { TipoUsuario } = user || {};
  if (TipoUsuario === 'SUPER_ADMIN') return true;
  if (TipoUsuario === 'ADMIN_ESTADO')
    return user.idEstado != null && idEstado != null && String(idEstado) === String(user.idEstado);
  if (TipoUsuario === 'ADMIN_PAIS')
    return user.idPais == null || (idPais != null && String(idPais) === String(user.idPais));
  return false;
}
