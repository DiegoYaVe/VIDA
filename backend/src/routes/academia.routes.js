// src/routes/academia.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import {
  listarCursos, detalleCurso, iniciarLeccion, completarLeccion, responderQuiz, completarCurso,
  listarComentarios, crearComentario, eliminarComentario,
  misDiplomas, verConstancia,
} from '../controllers/academia.controller.js';
import {
  listarCursosAdmin, detalleCursoAdmin, crearCurso, editarCurso, eliminarCurso,
  guardarVisibilidad, usuariosAsignables,
  crearModulo, editarModulo, eliminarModulo,
  crearLeccion, editarLeccion, eliminarLeccion, subirArchivoLeccion,
  guardarQuiz, analitica, analiticaCurso,
} from '../controllers/academia.admin.controller.js';

// Alumnos: todos los roles con acceso a la pantalla /academia
const ROLES = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN', 'SUPERVISOR', 'CAJERO'];
// Autoría/analítica: roles de red
const CORP  = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO'];

export async function academiaRoutes(fastify) {
  // ── LEARNER ────────────────────────────────────────────────────────────────
  fastify.get('/academia/cursos',
    { preHandler: [authenticate, requireRole(...ROLES)] }, listarCursos);
  fastify.get('/academia/cursos/:idCurso',
    { preHandler: [authenticate, requireRole(...ROLES)] }, detalleCurso);
  fastify.post('/academia/cursos/:idCurso/completar',
    { preHandler: [authenticate, requireRole(...ROLES)] }, completarCurso);
  fastify.post('/academia/lecciones/:idLeccion/iniciar',
    { preHandler: [authenticate, requireRole(...ROLES)] }, iniciarLeccion);
  fastify.post('/academia/lecciones/:idLeccion/completar',
    { preHandler: [authenticate, requireRole(...ROLES)] }, completarLeccion);
  fastify.post('/academia/lecciones/:idLeccion/quiz/responder',
    { preHandler: [authenticate, requireRole(...ROLES)] }, responderQuiz);

  // Comentarios
  fastify.get('/academia/cursos/:idCurso/comentarios',
    { preHandler: [authenticate, requireRole(...ROLES)] }, listarComentarios);
  fastify.post('/academia/cursos/:idCurso/comentarios',
    { preHandler: [authenticate, requireRole(...ROLES)] }, crearComentario);
  fastify.delete('/academia/comentarios/:idComentario',
    { preHandler: [authenticate, requireRole(...ROLES)] }, eliminarComentario);

  // Diplomas / constancias
  fastify.get('/academia/diplomas',
    { preHandler: [authenticate, requireRole(...ROLES)] }, misDiplomas);
  fastify.get('/academia/constancia/:folio',
    { preHandler: [authenticate, requireRole(...ROLES)] }, verConstancia);

  // ── AUTORÍA (corporativo) ────────────────────────────────────────────────
  fastify.get('/academia/admin/cursos',
    { preHandler: [authenticate, requireRole(...CORP)] }, listarCursosAdmin);
  fastify.get('/academia/admin/cursos/:idCurso',
    { preHandler: [authenticate, requireRole(...CORP)] }, detalleCursoAdmin);
  fastify.post('/academia/admin/cursos',
    { preHandler: [authenticate, requireRole(...CORP)] }, crearCurso);
  fastify.put('/academia/admin/cursos/:idCurso',
    { preHandler: [authenticate, requireRole(...CORP)] }, editarCurso);
  fastify.delete('/academia/admin/cursos/:idCurso',
    { preHandler: [authenticate, requireRole(...CORP)] }, eliminarCurso);

  fastify.put('/academia/admin/cursos/:idCurso/visibilidad',
    { preHandler: [authenticate, requireRole(...CORP)] }, guardarVisibilidad);
  fastify.get('/academia/admin/usuarios',
    { preHandler: [authenticate, requireRole(...CORP)] }, usuariosAsignables);

  // Módulos
  fastify.post('/academia/admin/cursos/:idCurso/modulos',
    { preHandler: [authenticate, requireRole(...CORP)] }, crearModulo);
  fastify.put('/academia/admin/modulos/:idModulo',
    { preHandler: [authenticate, requireRole(...CORP)] }, editarModulo);
  fastify.delete('/academia/admin/modulos/:idModulo',
    { preHandler: [authenticate, requireRole(...CORP)] }, eliminarModulo);

  // Lecciones
  fastify.post('/academia/admin/modulos/:idModulo/lecciones',
    { preHandler: [authenticate, requireRole(...CORP)] }, crearLeccion);
  fastify.put('/academia/admin/lecciones/:idLeccion',
    { preHandler: [authenticate, requireRole(...CORP)] }, editarLeccion);
  fastify.delete('/academia/admin/lecciones/:idLeccion',
    { preHandler: [authenticate, requireRole(...CORP)] }, eliminarLeccion);
  fastify.post('/academia/admin/lecciones/:idLeccion/video',
    { preHandler: [authenticate, requireRole(...CORP)] }, subirArchivoLeccion);
  fastify.put('/academia/admin/lecciones/:idLeccion/quiz',
    { preHandler: [authenticate, requireRole(...CORP)] }, guardarQuiz);

  // Analítica
  fastify.get('/academia/admin/analitica',
    { preHandler: [authenticate, requireRole(...CORP)] }, analitica);
  fastify.get('/academia/admin/analitica/curso/:idCurso',
    { preHandler: [authenticate, requireRole(...CORP)] }, analiticaCurso);
}
