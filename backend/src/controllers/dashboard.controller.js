// src/controllers/dashboard.controller.js
import { getPool, sql } from '../db/sqlserver.js';

export async function getStats(request, reply) {
  const { idBranch, idCuenta, TipoUsuario, idPuntoVenta } = request.user;

  try {
    const pool = await getPool();

    // Puntos de venta activos
    const pvResult = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN StatusPuntoVenta = 'ACTIVO' THEN 1 ELSE 0 END) AS activos
        FROM VIDA_CUENTA_PUNTOS_VENTA
        WHERE idBranch = @idBranch AND idCuenta = @idCuenta
          AND Status = 'ACTIVO'
      `);

    // Usuarios activos
    const usrResult = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`
        SELECT COUNT(*) AS total
        FROM VIDA_CUENTA_USUARIOS
        WHERE idBranch = @idBranch AND idCuenta = @idCuenta
          AND Status = 'ACTIVO'
      `);

    // Lista de sucursales para tabla
    const sucursalesResult = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`
        SELECT
          idPuntoVenta, Nombre, NomComercial,
          Ciudad, Estado, Encargado,
          StatusPuntoVenta, TipoPuntoVenta
        FROM VIDA_CUENTA_PUNTOS_VENTA
        WHERE idBranch = @idBranch AND idCuenta = @idCuenta
          AND Status = 'ACTIVO'
        ORDER BY idPuntoVenta
      `);

    return reply.send({
      kpis: {
        puntosDeVenta: {
          total:   pvResult.recordset[0].total,
          activos: pvResult.recordset[0].activos,
        },
        usuarios: {
          total: usrResult.recordset[0].total,
        },
        // Estos se conectarán cuando existan las tablas de ventas
        ventasTotales:  { valor: 0,  variacion: 0 },
        pedidosTotales: { valor: 0,  variacion: 0 },
        entregas:       { valor: 0,  variacion: 0 },
        productos:      { valor: 0,  variacion: 0 },
      },
      sucursales: sucursalesResult.recordset,
    });

  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener estadísticas' });
  }
}
