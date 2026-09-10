// src/routes/premios.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import { authenticateCliente } from '../middlewares/authDelivery.js';
import {
  listarPremios, canjearPremio, misCanjes, cambiarEstadoCanje, expirarPuntosInactivos, listarCanjesAdmin,
  listarPremiosCatalogo, crearPremio, editarPremio, eliminarPremio,
} from '../controllers/premios.controller.js';

const ADMIN = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN'];
const CORP  = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO'];

export async function premiosRoutes(fastify) {
  // Cliente
  fastify.get('/delivery/cliente/premios',
    { preHandler: [authenticateCliente] }, listarPremios);
  fastify.get('/delivery/cliente/premios/canjes',
    { preHandler: [authenticateCliente] }, misCanjes);
  fastify.post('/delivery/cliente/premios/:idPremio/canjear',
    { preHandler: [authenticateCliente] }, canjearPremio);

  // Ops / admin — canjes + vencimiento
  fastify.get('/delivery/admin/premios/canjes',
    { preHandler: [authenticate, requireRole(...ADMIN)] }, listarCanjesAdmin);
  fastify.patch('/delivery/admin/premios/canjes/:idCanje/estado',
    { preHandler: [authenticate, requireRole(...ADMIN)] }, cambiarEstadoCanje);
  fastify.post('/delivery/admin/puntos/expirar-inactivos',
    { preHandler: [authenticate, requireRole(...ADMIN)] }, expirarPuntosInactivos);

  // Corporativo — CRUD del catálogo de premios
  fastify.get('/delivery/admin/premios',
    { preHandler: [authenticate, requireRole(...CORP)] }, listarPremiosCatalogo);
  fastify.post('/delivery/admin/premios',
    { preHandler: [authenticate, requireRole(...CORP)] }, crearPremio);
  fastify.put('/delivery/admin/premios/:idPremio',
    { preHandler: [authenticate, requireRole(...CORP)] }, editarPremio);
  fastify.delete('/delivery/admin/premios/:idPremio',
    { preHandler: [authenticate, requireRole(...CORP)] }, eliminarPremio);
}
