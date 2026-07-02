// src/routes/estados.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import { listarEstados, crearEstado, editarEstado, toggleEstado } from '../controllers/estados.controller.js';

const LECTURA   = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN', 'SUPERVISOR', 'CAJERO'];
const ESCRITURA = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO'];

export async function estadosRoutes(fastify) {
  fastify.get('/estados',
    { preHandler: [authenticate, requireRole(...LECTURA)] },
    listarEstados);

  fastify.post('/estados',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] },
    crearEstado);

  fastify.put('/estados/:idEstado',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] },
    editarEstado);

  fastify.patch('/estados/:idEstado/toggle',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] },
    toggleEstado);
}
