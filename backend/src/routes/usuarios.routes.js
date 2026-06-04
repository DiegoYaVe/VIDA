// src/routes/usuarios.routes.js
import { authenticate } from '../middlewares/auth.js';
import { getPool, sql } from '../db/sqlserver.js';
import {
  listarUsuarios,
  crearUsuario,
  editarUsuario,
  toggleStatus,
  activarCuenta,
  getPantallas,
} from '../controllers/usuarios.controller.js';

export async function usuariosRoutes(fastify) {

  // ── Públicos (sin auth) ──────────────────────────────
  fastify.post('/usuarios/activar', activarCuenta);

  // ── Rutas fijas primero (antes que las dinámicas) ────
  fastify.get('/usuarios',           { preHandler: [authenticate] }, listarUsuarios);
  fastify.post('/usuarios',          { preHandler: [authenticate] }, crearUsuario);
  fastify.get('/usuarios/pantallas', { preHandler: [authenticate] }, getPantallas);

  // ── Rutas dinámicas (:idUsuario) después ─────────────
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