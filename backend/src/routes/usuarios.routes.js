// src/routes/usuarios.routes.js
import { authenticate } from '../middlewares/auth.js';
import { getPool, sql } from '../db/sqlserver.js';
import {
  listarUsuarios,
  crearUsuario,
  editarUsuario,
  toggleStatus,
  cambiarPassword,
  getPantallas,
} from '../controllers/usuarios.controller.js';

export async function usuariosRoutes(fastify) {

  // ── Rutas fijas primero ──────────────────────────────
  fastify.get('/usuarios',           { preHandler: [authenticate] }, listarUsuarios);
  fastify.post('/usuarios',          { preHandler: [authenticate] }, crearUsuario);
  fastify.get('/usuarios/pantallas', { preHandler: [authenticate] }, getPantallas);
  fastify.post('/usuarios/cambiar-pass', { preHandler: [authenticate] }, cambiarPassword);

  // ── Rutas dinámicas después ──────────────────────────
  fastify.put('/usuarios/:idUsuario',           { preHandler: [authenticate] }, editarUsuario);
  fastify.patch('/usuarios/:idUsuario/status',  { preHandler: [authenticate] }, toggleStatus);
  fastify.get('/usuarios/:idUsuario/accesos',   { preHandler: [authenticate] }, async (request, reply) => {
    const { idBranch, idCuenta } = request.user;
    const { idUsuario } = request.params;
    try {
      const pool = await getPool();
      const r = await pool.request()
        .input('idBranch',  sql.BigInt, idBranch)
        .input('idCuenta',  sql.BigInt, idCuenta)
        .input('idUsuario', sql.BigInt, idUsuario)
        .query(`SELECT idPantalla FROM VIDA_CUENTA_PANTALLAS_ACCESOS_USUARIO
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                  AND idUsuario=@idUsuario AND StatusAcceso='ACTIVO'`);
      return reply.send(r.recordset);
    } catch (err) {
      return reply.code(500).send({ error: 'Error al obtener accesos' });
    }
  });
}