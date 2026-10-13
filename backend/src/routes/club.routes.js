// src/routes/club.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import { authenticateCliente } from '../middlewares/authDelivery.js';
import { obtenerMembresia } from '../controllers/club.controller.js';
import {
  listarEventosCliente, confirmarAsistencia, cancelarAsistencia,
  listarEventosAdmin, crearEvento, editarEvento, eliminarEvento, asistentesEvento,
} from '../controllers/clubEventos.controller.js';

// Mismo alcance que el catálogo de premios: lo administra el corporativo
const CORP = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO'];

export async function clubRoutes(fastify) {
  fastify.get('/delivery/cliente/membresia',
    { preHandler: [authenticateCliente] }, obtenerMembresia);

  // Eventos del Club (fase 2)
  fastify.get('/delivery/cliente/club/eventos',
    { preHandler: [authenticateCliente] }, listarEventosCliente);
  fastify.post('/delivery/cliente/club/eventos/:idEvento/asistencia',
    { preHandler: [authenticateCliente] }, confirmarAsistencia);
  fastify.delete('/delivery/cliente/club/eventos/:idEvento/asistencia',
    { preHandler: [authenticateCliente] }, cancelarAsistencia);

  fastify.get('/delivery/admin/club/eventos',
    { preHandler: [authenticate, requireRole(...CORP)] }, listarEventosAdmin);
  fastify.post('/delivery/admin/club/eventos',
    { preHandler: [authenticate, requireRole(...CORP)] }, crearEvento);
  fastify.put('/delivery/admin/club/eventos/:idEvento',
    { preHandler: [authenticate, requireRole(...CORP)] }, editarEvento);
  fastify.delete('/delivery/admin/club/eventos/:idEvento',
    { preHandler: [authenticate, requireRole(...CORP)] }, eliminarEvento);
  fastify.get('/delivery/admin/club/eventos/:idEvento/asistentes',
    { preHandler: [authenticate, requireRole(...CORP)] }, asistentesEvento);
}
