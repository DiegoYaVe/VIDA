// src/routes/dashboard.routes.js
import { getStats } from '../controllers/dashboard.controller.js';
import { authenticate } from '../middlewares/auth.js';

export async function dashboardRoutes(fastify) {
  fastify.get('/dashboard/stats', { preHandler: [authenticate] }, getStats);
}
