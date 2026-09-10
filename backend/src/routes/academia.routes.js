// src/routes/academia.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import {
  listarCursos, completarCurso,
  listarCursosAdmin, crearCurso, editarCurso, eliminarCurso,
} from '../controllers/academia.controller.js';

const ROLES = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN'];
const CORP  = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO'];

export async function academiaRoutes(fastify) {
  fastify.get('/academia/cursos',
    { preHandler: [authenticate, requireRole(...ROLES)] }, listarCursos);
  fastify.post('/academia/cursos/:idCurso/completar',
    { preHandler: [authenticate, requireRole(...ROLES)] }, completarCurso);

  // CRUD de catálogo (corporativo)
  fastify.get('/academia/admin/cursos',
    { preHandler: [authenticate, requireRole(...CORP)] }, listarCursosAdmin);
  fastify.post('/academia/admin/cursos',
    { preHandler: [authenticate, requireRole(...CORP)] }, crearCurso);
  fastify.put('/academia/admin/cursos/:idCurso',
    { preHandler: [authenticate, requireRole(...CORP)] }, editarCurso);
  fastify.delete('/academia/admin/cursos/:idCurso',
    { preHandler: [authenticate, requireRole(...CORP)] }, eliminarCurso);
}
