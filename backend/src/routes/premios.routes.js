// src/routes/premios.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import { authenticateCliente } from '../middlewares/authDelivery.js';
import {
  listarPremios, canjearPremio, misCanjes, cambiarEstadoCanje, expirarPuntosInactivos,
} from '../controllers/premios.controller.js';

const ADMIN = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN'];

export async function premiosRoutes(fastify) {
  // Cliente
  fastify.get('/delivery/cliente/premios',
    { preHandler: [authenticateCliente] }, listarPremios);
  fastify.get('/delivery/cliente/premios/canjes',
    { preHandler: [authenticateCliente] }, misCanjes);
  fastify.post('/delivery/cliente/premios/:idPremio/canjear',
    { preHandler: [authenticateCliente] }, canjearPremio);

  // Ops / admin
  fastify.patch('/delivery/admin/premios/canjes/:idCanje/estado',
    { preHandler: [authenticate, requireRole(...ADMIN)] }, cambiarEstadoCanje);
  fastify.post('/delivery/admin/puntos/expirar-inactivos',
    { preHandler: [authenticate, requireRole(...ADMIN)] }, expirarPuntosInactivos);
}
