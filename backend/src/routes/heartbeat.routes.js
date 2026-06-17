// src/routes/heartbeat.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import { ping } from '../controllers/heartbeat.controller.js';

const TODOS = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN', 'SUPERVISOR', 'CAJERO', 'CASHIER'];

export async function heartbeatRoutes(fastify) {
  fastify.post('/heartbeat/ping',
    { preHandler: [authenticate, requireRole(...TODOS)] },
    ping);
}
