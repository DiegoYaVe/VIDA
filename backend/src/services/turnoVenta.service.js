// src/services/turnoVenta.service.js
import { sql } from '../db/sqlserver.js';

// Turno de caja de la tienda cuya ventana cubre `fechaVenta` (null = ahora).
// Bloquea el turno: serializa con el cierre, que bloquea la misma fila. Así, o
// la venta entra antes y el cierre la cuenta, o entra después y queda como
// tardía de ese turno ya cerrado.
// Devuelve { idTurno, ventaTardia }: idTurno null si ningún turno la cubre
// (venta fuera de turno, también tardía).
export async function turnoDeLaVenta(tx, { idBranch, idCuenta }, idPuntoVenta, fechaVenta) {
  const r = await new sql.Request(tx)
    .input('idBranch',     sql.BigInt,   idBranch)
    .input('idCuenta',     sql.BigInt,   idCuenta)
    .input('idPuntoVenta', sql.BigInt,   idPuntoVenta)
    .input('FechaVenta',   sql.DateTime, fechaVenta ?? null)
    .query(`SELECT TOP 1 idTurno, Status FROM VIDA_CAJA_TURNOS WITH (UPDLOCK, HOLDLOCK)
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@idPuntoVenta
              AND FechaApertura <= ISNULL(@FechaVenta, GETUTCDATE())
              AND (FechaCierre IS NULL OR FechaCierre >= ISNULL(@FechaVenta, GETUTCDATE()))
            ORDER BY FechaApertura DESC`);
  const t = r.recordset[0];
  return { idTurno: t?.idTurno ?? null, ventaTardia: !t || t.Status !== 'ABIERTO' };
}
