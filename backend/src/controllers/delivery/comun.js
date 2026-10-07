// src/controllers/delivery/comun.js
// Utilidades compartidas del delivery: ids, configuración y URL pública.
// (Separado de delivery.controller.js, que reexporta todo.)
import { sql } from '../../db/sqlserver.js';

// URL pública del backend (API) para los links de confirmación de email.
// Se resuelve detectando el ambiente, para que en local apunte a localhost y en
// producción al dominio real sin cambiar código:
//   1) BASE_URL del .env      → si está, manda (override explícito por ambiente)
//   2) si NO es producción     → http://localhost:PORT (backend local)
//   3) en producción sin .env  → se deriva del propio request (proto + host,
//      respetando proxy/x-forwarded-*), que es el dominio por el que entró la app
export function resolverBaseUrl(request) {
  const limpiar = (u) => (u || '').trim().replace(/\/+$/, '');
  if (process.env.BASE_URL) return limpiar(process.env.BASE_URL);
  const esProd = (process.env.NODE_ENV || 'development') === 'production';
  if (!esProd) return `http://localhost:${process.env.PORT || 3001}`;
  const proto = request?.headers['x-forwarded-proto'] || request?.protocol || 'https';
  const host  = request?.headers['x-forwarded-host']  || request?.headers?.host;
  return host ? `${proto}://${host}` : '';
}

// ── Helper ─────────────────────────────────────────────────────────────────
export async function nextId(pool, tabla, campo, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}),0)+1 AS next
            FROM ${tabla}
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
  return r.recordset[0].next;
}

// Variante transaccional: UPDLOCK+HOLDLOCK serializa la obtención del ID
export async function nextIdTx(transaction, tabla, campo, idBranch, idCuenta) {
  const r = await new sql.Request(transaction)
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}),0)+1 AS next
            FROM ${tabla} WITH (UPDLOCK, HOLDLOCK)
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
  return r.recordset[0].next;
}

export async function getConfigVal(pool, idBranch, idCuenta, clave, defVal = null) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .input('clave', sql.VarChar(100), clave)
    .query(`SELECT Valor FROM VIDA_CONFIG_DELIVERY
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Clave=@clave`);
  return r.recordset.length ? r.recordset[0].Valor : defVal;
}

// Token push del cliente de un pedido (para notificarle cambios de status)
export async function tokenClientePedido(pool, idBranch, idCuenta, idCliente) {
  if (!idCliente) return null;
  const r = await pool.request()
    .input('idBranch',  sql.BigInt, idBranch)
    .input('idCuenta',  sql.BigInt, idCuenta)
    .input('idCliente', sql.BigInt, idCliente)
    .query(`SELECT FcmToken FROM VIDA_APP_CLIENTES
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
  return r.recordset[0]?.FcmToken || null;
}
