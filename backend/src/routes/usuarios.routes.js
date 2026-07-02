// src/routes/usuarios.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import { getPool, sql } from '../db/sqlserver.js';
import {
  listarUsuarios,
  crearUsuario,
  editarUsuario,
  toggleStatus,
  cambiarPassword,
  getPantallas,
} from '../controllers/usuarios.controller.js';

// Solo administradores pueden gestionar usuarios
const ADMIN = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN'];

// SUPERVISOR puede consultar el listado de su ámbito, sin escritura
const LECTURA = [...ADMIN, 'SUPERVISOR'];

export async function usuariosRoutes(fastify) {

  // ── Rutas fijas primero ──────────────────────────────
  fastify.get('/usuarios',           { preHandler: [requireRole(...LECTURA)] }, listarUsuarios);
  fastify.post('/usuarios',          { preHandler: [requireRole(...ADMIN)] }, crearUsuario);
  fastify.get('/usuarios/pantallas', { preHandler: [requireRole(...LECTURA)] }, getPantallas);
  // Cambio de contraseña propia: disponible para cualquier usuario autenticado
  fastify.post('/usuarios/cambiar-pass', { preHandler: [authenticate] }, cambiarPassword);

  // ── Rutas dinámicas después ──────────────────────────
  fastify.put('/usuarios/:idUsuario',           { preHandler: [requireRole(...ADMIN)] }, editarUsuario);
  fastify.patch('/usuarios/:idUsuario/status',  { preHandler: [requireRole(...ADMIN)] }, toggleStatus);
  fastify.get('/usuarios/:idUsuario/accesos',   { preHandler: [requireRole(...LECTURA)] }, async (request, reply) => {
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
