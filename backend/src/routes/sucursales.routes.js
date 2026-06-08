// src/routes/sucursales.routes.js
import { requireRole } from '../middlewares/auth.js';
import { getPool, sql } from '../db/sqlserver.js';

const TODOS_LOS_ROLES = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN', 'SUPERVISOR', 'CAJERO', 'CASHIER'];
const ROLES_ADMIN     = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN'];

export async function sucursalesRoutes(fastify) {

  // GET /api/sucursales/puntos-venta
  // Admins ven todos los puntos de venta activos.
  // Supervisor y Cajero solo ven el suyo.
  fastify.get('/sucursales/puntos-venta', {
    preHandler: [requireRole(...TODOS_LOS_ROLES)],
  }, async (request, reply) => {
    const { idBranch, idCuenta, TipoUsuario, idPuntoVenta } = request.user;

    try {
      const pool = await getPool();
      const esAdmin = ROLES_ADMIN.includes(TipoUsuario);

      const req = pool.request()
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta);

      let whereExtra = '';
      if (!esAdmin) {
        req.input('idPuntoVenta', sql.BigInt, idPuntoVenta);
        whereExtra = 'AND idPuntoVenta = @idPuntoVenta';
      }

      const r = await req.query(`
        SELECT idPuntoVenta, Nombre, NomComercial, Ciudad, Estado,
               Encargado, StatusPuntoVenta, TipoPuntoVenta
        FROM VIDA_CUENTA_PUNTOS_VENTA
        WHERE idBranch = @idBranch AND idCuenta = @idCuenta
          AND Status = 'ACTIVO'
          ${whereExtra}
        ORDER BY NomComercial
      `);

      return reply.send(r.recordset);
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Error al obtener puntos de venta' });
    }
  });
}
