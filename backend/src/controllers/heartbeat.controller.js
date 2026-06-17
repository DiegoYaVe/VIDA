// src/controllers/heartbeat.controller.js
import { getPool, sql } from '../db/sqlserver.js';
import { broadcast } from '../ws/ws.manager.js';

// POST /api/heartbeat/ping
// Llamado por el frontend del POS cada 60s
export async function ping(request, reply) {
  const { idBranch, idCuenta, idPuntoVenta } = request.user;

  // Solo usuarios asignados a un punto de venta envían heartbeat
  if (!idPuntoVenta) return reply.send({ ok: true });

  try {
    const pool = await getPool();

    // Estado anterior (para detectar transición OFFLINE → ONLINE)
    const prev = await pool.request()
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('idPuntoVenta',sql.BigInt, idPuntoVenta)
      .query(`SELECT StatusConexion, NomComercial
              FROM VIDA_CUENTA_PUNTOS_VENTA
              WHERE idBranch = @idBranch AND idCuenta = @idCuenta
                AND idPuntoVenta = @idPuntoVenta`);

    const anterior = prev.recordset[0];
    const estabaOffline = !anterior || anterior.StatusConexion === 'OFFLINE';

    // Actualizar heartbeat
    await pool.request()
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('idPuntoVenta',sql.BigInt, idPuntoVenta)
      .query(`UPDATE VIDA_CUENTA_PUNTOS_VENTA
              SET StatusConexion  = 'ONLINE',
                  UltimoHeartbeat = GETDATE()
              WHERE idBranch = @idBranch AND idCuenta = @idCuenta
                AND idPuntoVenta = @idPuntoVenta`);

    // Broadcast si acaba de conectarse
    if (estabaOffline) {
      broadcast(idBranch, idCuenta, {
        tipo:         'sucursal:online',
        idPuntoVenta: parseInt(idPuntoVenta),
        nombre:       anterior?.NomComercial || `Sucursal ${idPuntoVenta}`,
      });
    }

    return reply.send({ ok: true, status: 'ONLINE' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error en heartbeat' });
  }
}

// Llamado por el job periódico en app.js cada 60s
// Marca como OFFLINE las sucursales sin heartbeat en los últimos 2 minutos
export async function marcarInactivos(pool, log) {
  try {
    // Buscar las que van a pasar a OFFLINE antes de actualizarlas
    const r = await pool.request().query(`
      SELECT idBranch, idCuenta, idPuntoVenta, NomComercial
      FROM VIDA_CUENTA_PUNTOS_VENTA
      WHERE StatusConexion = 'ONLINE'
        AND (UltimoHeartbeat IS NULL OR UltimoHeartbeat < DATEADD(MINUTE, -2, GETDATE()))
    `);

    if (r.recordset.length === 0) return;

    // Marcar OFFLINE
    await pool.request().query(`
      UPDATE VIDA_CUENTA_PUNTOS_VENTA
      SET StatusConexion = 'OFFLINE'
      WHERE StatusConexion = 'ONLINE'
        AND (UltimoHeartbeat IS NULL OR UltimoHeartbeat < DATEADD(MINUTE, -2, GETDATE()))
    `);

    // Broadcast por cada sucursal que acaba de desconectarse
    for (const s of r.recordset) {
      broadcast(s.idBranch, s.idCuenta, {
        tipo:         'sucursal:offline',
        idPuntoVenta: s.idPuntoVenta,
        nombre:       s.NomComercial,
      });
      log?.info(`[Heartbeat] ${s.NomComercial} (PV ${s.idPuntoVenta}) → OFFLINE`);
    }
  } catch (err) {
    log?.error('[Heartbeat] Error en marcarInactivos: ' + err.message);
  }
}
