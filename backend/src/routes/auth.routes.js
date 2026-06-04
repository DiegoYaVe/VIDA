// src/routes/auth.routes.js
import { login, refresh, logout } from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { getPool, sql } from '../db/sqlserver.js';

export async function authRoutes(fastify) {

  fastify.post('/auth/login', { schema: {
    body: { type:'object', required:['cve','pass'],
      properties: { cve:{type:'string'}, pass:{type:'string'} } }
  }}, login);

  fastify.post('/auth/refresh', { schema: {
    body: { type:'object', required:['refreshToken'],
      properties: { refreshToken:{type:'string'} } }
  }}, refresh);

  fastify.post('/auth/logout', { preHandler: [authenticate] }, logout);

  // Nuevo endpoint — cargar usuario y pantallas con token vigente
  fastify.get('/auth/me', { preHandler: [authenticate] }, async (request, reply) => {
    const { idBranch, idCuenta, idUsuario } = request.user;
    try {
      const pool = await getPool();
      const pantallas = await pool.request()
        .input('idBranch',  sql.BigInt, idBranch)
        .input('idCuenta',  sql.BigInt, idCuenta)
        .input('idUsuario', sql.BigInt, idUsuario)
        .query(`
          SELECT p.idPantalla, p.Nombre, p.Modulo, p.Link, p.Icono, p.OrdenPantalla
          FROM VIDA_CUENTA_PANTALLAS_ACCESOS_USUARIO a
          INNER JOIN VIDA_CUENTA_PANTALLAS p
            ON p.idBranch=a.idBranch AND p.idCuenta=a.idCuenta AND p.idPantalla=a.idPantalla
          WHERE a.idBranch=@idBranch AND a.idCuenta=@idCuenta
            AND a.idUsuario=@idUsuario AND a.StatusAcceso='ACTIVO'
            AND p.Status='ACTIVO'
          ORDER BY p.OrdenPantalla
        `);

      return reply.send({
        usuario:  request.user,
        pantallas: pantallas.recordset,
      });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Error al cargar sesión' });
    }
  });
}