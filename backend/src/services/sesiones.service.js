// Sesiones de las apps (JWT de 180 días): se invalidan al cambiar o recuperar
// la contraseña (columna SesionesDesde, migración 56) y cuando la cuenta deja
// de estar ACTIVA. El middleware consulta la cuenta una vez por minuto como
// mucho (caché en memoria) y, si la BD no responde, deja pasar: un corte de BD
// no debe cerrar la sesión de todos.
import { getPool, sql } from '../db/sqlserver.js';

const TABLAS = {
  CLIENTE: { tabla: 'VIDA_APP_CLIENTES', id: 'idCliente' },
  REPARTIDOR: { tabla: 'VIDA_REPARTIDORES', id: 'idRepartidor' },
};
const TTL_MS = 60 * 1000;
const cache = new Map(); // clave → { t, fila }

const clave = (rol, p) => `${rol}:${p.idBranch}:${p.idCuenta}:${p[TABLAS[rol].id]}`;

// ¿El token (iat en segundos) sigue valiendo para esta cuenta?
export function tokenVigente(fila, iat) {
  if (!fila || (fila.Status || 'ACTIVO') !== 'ACTIVO') return false;
  if (!fila.SesionesDesde) return true;
  return Number(iat) >= Math.floor(new Date(fila.SesionesDesde).getTime() / 1000);
}

export async function sesionVigente(rol, payload, log) {
  const t = TABLAS[rol];
  if (!t || payload?.[t.id] == null) return false;
  const k = clave(rol, payload);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.t < TTL_MS) return tokenVigente(hit.fila, payload.iat);
  try {
    const r = await (await getPool()).request()
      .input('b', sql.BigInt, payload.idBranch).input('c', sql.BigInt, payload.idCuenta).input('id', sql.BigInt, payload[t.id])
      .query(`SELECT ISNULL(Status,'ACTIVO') AS Status, SesionesDesde FROM ${t.tabla} WHERE idBranch=@b AND idCuenta=@c AND ${t.id}=@id`);
    const fila = r.recordset[0] || null;
    cache.set(k, { t: Date.now(), fila });
    if (cache.size > 20000) cache.delete(cache.keys().next().value);
    return tokenVigente(fila, payload.iat);
  } catch (e) {
    log?.warn?.({ err: e.message }, 'no se pudo validar la sesión; se deja pasar');
    return true;
  }
}

// Instante de corte con el reloj de este servidor (el mismo que firma los
// tokens), truncado al segundo: el token nuevo que se emite después vale.
export const instanteCorte = () => new Date(Math.floor(Date.now() / 1000) * 1000);

export function olvidarSesion(rol, ids) { cache.delete(clave(rol, ids)); }
