// Ventas offline que el servidor rechazó al sincronizar (migración 54). El
// dinero ya se cobró: en vez de reintentar para siempre en el navegador del
// cajero, la venta queda guardada aquí y un administrador la resuelve
// (reintentar el registro o anularla con motivo).
import { sql } from '../db/sqlserver.js';

// Errores de conexión o del servidor: la venta sigue en la cola del navegador
// y se reintenta sola. El resto (validaciones, cotización, alcance...) no se
// arregla reintentando y pasa a revisión.
const CODIGOS_TRANSITORIOS = new Set(['ESOCKET', 'ETIMEOUT', 'ECONNCLOSED', 'ENOTOPEN', 'ECONNRESET',
  'ETIMEDOUT', 'ECONNREFUSED', 'EINSTLOOKUP', 'ELOGIN', 'ENOCONN', 'EABORT', 'ECANCEL']);
// 1205: elegido como víctima de un interbloqueo; -2: timeout de consulta
const NUMEROS_TRANSITORIOS = new Set([1205, -2]);

export function esRechazoPermanente(err) {
  if (!err) return false;
  if (CODIGOS_TRANSITORIOS.has(err.code) || NUMEROS_TRANSITORIOS.has(err.number)) return false;
  if (err.statusCode != null) return err.statusCode >= 400 && err.statusCode < 500;
  return true;
}

const total2 = (v) => {
  const items = Array.isArray(v?.items) ? v.items : [];
  const suma = items.reduce((s, i) => s + (Number(i.Cantidad) * Number(i.PrecioUnitario) || 0), 0);
  const t = Math.max(0, suma - (Number(v?.CuponDescuentoUSD) || 0));
  return Number.isFinite(t) && t < 1e12 ? Math.round(t * 100) / 100 : null;
};
const fecha = (s) => { const f = new Date(s); return s && !isNaN(f.getTime()) ? f : null; };
const pvDe = (v) => { const n = Number(v?.idPuntoVenta); return Number.isSafeInteger(n) && n > 0 ? n : null; };

// Guarda (o actualiza) la venta rechazada. Si ya estaba resuelta no la toca.
// Devuelve el Status con que queda.
export async function guardarEnRevision(db, { idBranch, idCuenta, idUsuario }, venta, motivo) {
  const r = await new sql.Request(db)
    .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
    .input('uuid', sql.VarChar(40), venta.ClienteUUID)
    .input('pv', sql.BigInt, pvDe(venta))
    .input('u', sql.BigInt, idUsuario)
    .input('json', sql.NVarChar(sql.MAX), JSON.stringify(venta))
    .input('total', sql.Decimal(18, 2), total2(venta))
    .input('fecha', sql.DateTime2, fecha(venta.FechaVenta))
    .input('motivo', sql.NVarChar(500), String(motivo || 'Rechazada por el servidor').slice(0, 500))
    .query(`MERGE VIDA_POS_VENTAS_REVISION WITH (HOLDLOCK) AS t
            USING (SELECT @b idBranch, @c idCuenta, @uuid ClienteUUID) s
              ON t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.ClienteUUID=s.ClienteUUID
            WHEN MATCHED AND t.Status='PENDIENTE' THEN
              UPDATE SET Motivo=@motivo, Intentos=t.Intentos+1, FechaMod=GETUTCDATE()
            WHEN NOT MATCHED THEN
              INSERT (idBranch,idCuenta,ClienteUUID,idPuntoVenta,idUsuario,VentaJSON,TotalUSD,FechaVenta,Motivo)
              VALUES (@b,@c,@uuid,@pv,@u,@json,@total,@fecha,@motivo);
            SELECT Status FROM VIDA_POS_VENTAS_REVISION WHERE idBranch=@b AND idCuenta=@c AND ClienteUUID=@uuid;`);
  return r.recordset[0]?.Status ?? 'PENDIENTE';
}

export async function obtenerEnRevision(db, { idBranch, idCuenta }, uuid, bloquear = false) {
  const r = await new sql.Request(db)
    .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('uuid', sql.VarChar(40), uuid)
    .query(`SELECT * FROM VIDA_POS_VENTAS_REVISION ${bloquear ? 'WITH (UPDLOCK, ROWLOCK)' : ''}
            WHERE idBranch=@b AND idCuenta=@c AND ClienteUUID=@uuid`);
  return r.recordset[0] || null;
}

export async function marcarRegistrada(db, { idBranch, idCuenta, idUsuario }, uuid, idPedido) {
  const r = await new sql.Request(db)
    .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('uuid', sql.VarChar(40), uuid)
    .input('p', sql.BigInt, idPedido).input('u', sql.BigInt, idUsuario)
    .query(`UPDATE VIDA_POS_VENTAS_REVISION
            SET Status='REGISTRADA', idPedido=@p, idUsuarioResuelve=@u, FechaResuelta=GETUTCDATE(), FechaMod=GETUTCDATE()
            WHERE idBranch=@b AND idCuenta=@c AND ClienteUUID=@uuid AND Status='PENDIENTE'`);
  return r.rowsAffected[0] === 1;
}

export async function marcarAnulada(db, { idBranch, idCuenta, idUsuario }, uuid, motivo) {
  const r = await new sql.Request(db)
    .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('uuid', sql.VarChar(40), uuid)
    .input('m', sql.NVarChar(500), motivo).input('u', sql.BigInt, idUsuario)
    .query(`UPDATE VIDA_POS_VENTAS_REVISION
            SET Status='ANULADA', Resolucion=@m, idUsuarioResuelve=@u, FechaResuelta=GETUTCDATE(), FechaMod=GETUTCDATE()
            WHERE idBranch=@b AND idCuenta=@c AND ClienteUUID=@uuid AND Status='PENDIENTE'`);
  return r.rowsAffected[0] === 1;
}

export async function anotarFallo(db, { idBranch, idCuenta }, uuid, motivo) {
  await new sql.Request(db)
    .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('uuid', sql.VarChar(40), uuid)
    .input('m', sql.NVarChar(500), String(motivo).slice(0, 500))
    .query(`UPDATE VIDA_POS_VENTAS_REVISION SET Motivo=@m, Intentos=Intentos+1, FechaMod=GETUTCDATE()
            WHERE idBranch=@b AND idCuenta=@c AND ClienteUUID=@uuid AND Status='PENDIENTE'`);
}
