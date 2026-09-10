// src/routes/club.routes.js
import { authenticateCliente } from '../middlewares/authDelivery.js';
import { obtenerMembresia } from '../controllers/club.controller.js';

export async function clubRoutes(fastify) {
  fastify.get('/delivery/cliente/membresia',
    { preHandler: [authenticateCliente] }, obtenerMembresia);
}
