// src/routes/academia.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import { listarCursos, completarCurso } from '../controllers/academia.controller.js';

const ROLES = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN'];

export async function academiaRoutes(fastify) {
  fastify.get('/academia/cursos',
    { preHandler: [authenticate, requireRole(...ROLES)] }, listarCursos);
  fastify.post('/academia/cursos/:idCurso/completar',
    { preHandler: [authenticate, requireRole(...ROLES)] }, completarCurso);
}
