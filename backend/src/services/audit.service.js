// Auditoría inmutable de operaciones financieras.
// Cada entrada se firma con HMAC-SHA256 usando un secreto del servidor
// (AUDIT_SECRET): alguien con acceso solo a la BD no puede alterar una fila
// y recalcular una firma válida. La tabla además rechaza UPDATE/DELETE por
// trigger (sql/07_audit_log.sql).
import crypto from 'crypto';
import { sql } from '../db/sqlserver.js';

const SECRET = process.env.AUDIT_SECRET || process.env.JWT_SECRET || 'audit_dev_secret';

function firmar(campos) {
  return crypto.createHmac('sha256', SECRET)
    .update(campos.map(String).join('|'))
    .digest('hex');
}

/**
 * Registra una entrada de auditoría. Acepta un pool o una transacción activa
 * (dentro de transacción, la entrada se confirma junto con la operación).
 * Nunca lanza: un fallo de auditoría no debe tumbar la operación de negocio.
 */
export async function registrarAuditoria(ejecutor, { idBranch, idCuenta, entityType, entityId, accion, actor, data = {} }, log = console) {
  try {
    const dataJSON = JSON.stringify({ ...data, _ts: new Date().toISOString() });
    const hash = firmar([idBranch, idCuenta, entityType, entityId, accion, actor, dataJSON]);

    await new sql.Request(ejecutor)
      .input('idBranch',   sql.BigInt,        idBranch)
      .input('idCuenta',   sql.BigInt,        idCuenta)
      .input('EntityType', sql.VarChar(50),   entityType)
      .input('EntityId',   sql.VarChar(50),   String(entityId))
      .input('Accion',     sql.VarChar(50),   accion)
      .input('Actor',      sql.VarChar(50),   String(actor))
      .input('DataJSON',   sql.NVarChar(sql.MAX), dataJSON)
      .input('Hash',       sql.VarChar(64),   hash)
      .query(`INSERT INTO VIDA_AUDIT_LOG
                (idBranch, idCuenta, EntityType, EntityId, Accion, Actor, DataJSON, Hash)
              VALUES (@idBranch, @idCuenta, @EntityType, @EntityId, @Accion, @Actor, @DataJSON, @Hash)`);
  } catch (err) {
    log.warn?.('[audit] No se pudo registrar auditoría: ' + err.message);
  }
}

// Recalcula la firma de una fila leída de la BD y la compara con la guardada
export function verificarFila(fila) {
  const esperado = firmar([fila.idBranch, fila.idCuenta, fila.EntityType, fila.EntityId, fila.Accion, fila.Actor, fila.DataJSON]);
  return esperado === fila.Hash;
}
