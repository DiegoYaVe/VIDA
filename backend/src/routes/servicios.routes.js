// src/routes/servicios.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import { authenticateCliente } from '../middlewares/authDelivery.js';
import {
  listarOperadoras, crearOrdenServicio, misServicios, cambiarEstadoServicio, listarOrdenesAdmin,
} from '../controllers/servicios.controller.js';

const ADMIN = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN'];

export async function serviciosRoutes(fastify) {
  // Cliente
  fastify.get('/delivery/cliente/servicios/operadoras',
    { preHandler: [authenticateCliente] }, listarOperadoras);
  fastify.get('/delivery/cliente/servicios',
    { preHandler: [authenticateCliente] }, misServicios);
  fastify.post('/delivery/cliente/servicios',
    { preHandler: [authenticateCliente] }, crearOrdenServicio);

  // Ops / admin
  fastify.get('/delivery/admin/servicios',
    { preHandler: [authenticate, requireRole(...ADMIN)] }, listarOrdenesAdmin);
  fastify.patch('/delivery/admin/servicios/:idOrden/estado',
    { preHandler: [authenticate, requireRole(...ADMIN)] }, cambiarEstadoServicio);
}
