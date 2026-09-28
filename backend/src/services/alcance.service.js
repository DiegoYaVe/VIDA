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
// cuentas de toda la red)?
//
// Son los roles de red, MÁS el ADMIN del punto de venta marcado como Matriz:
// ese es el ensanchamiento que pidió el negocio. Un ADMIN sigue scopeado a su
// tienda en todo lo demás (inventario, caja, ventas); lo único que se le abre es
// la operación de la Matriz, y solo si su tienda ES la Matriz.
//
// Devuelve { permitido, esRed, idPuntoVentaMatriz, motivo }.
export async function operadorMatriz(user, pool = null) {
  const p = pool || await getPool();
  const pvMatriz = await idPuntoVentaMatriz(p, user.idBranch, user.idCuenta);

  if (esRed(user)) {
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
    permitido: false, esRed: false, idPuntoVentaMatriz: pvMatriz,
    motivo: 'Solo la Matriz puede operar compras a proveedores y cuentas de la red',
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
// Un rol de red y el ADMIN de la Matriz ven TODAS las cuentas. Un ADMIN de
// sucursal común no opera la Matriz, pero sí tiene derecho a ver lo que SU
// tienda le debe a la Matriz: se le devuelven solo las CXC donde él es el
// deudor, y ninguna CXP (la deuda con el proveedor no es asunto suyo).
//
// Devuelve { verTodo, soloCxcDe } — `soloCxcDe` es su idPuntoVenta.
export async function alcanceCuentas(user, pool = null) {
  const res = await operadorMatriz(user, pool);
  if (res.permitido) return { verTodo: true, soloCxcDe: null };
  return { verTodo: false, soloCxcDe: user.idPuntoVenta ?? null };
}
