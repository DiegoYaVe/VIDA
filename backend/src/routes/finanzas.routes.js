// src/routes/finanzas.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import {
  obtenerFinanzas, guardarFinanzas, calcularRentabilidad,
  obtenerMetas, guardarMetas, progresoMetas, obtenerPlanPlus, guardarPlanPlus,
} from '../controllers/finanzas.controller.js';

// La calculadora es para el empresario (ADMIN) y hacia arriba.
const ROLES = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN'];

export async function finanzasRoutes(fastify) {
  fastify.get('/finanzas',
    { preHandler: [authenticate, requireRole(...ROLES)] }, obtenerFinanzas);

  fastify.put('/finanzas',
    { preHandler: [authenticate, requireRole(...ROLES)] }, guardarFinanzas);

  fastify.get('/finanzas/rentabilidad',
    { preHandler: [authenticate, requireRole(...ROLES)] }, calcularRentabilidad);

  // Plan PLUS: cuántas unidades de los productos elegidos cubren los costos fijos
  fastify.get('/finanzas/plan-plus',
    { preHandler: [authenticate, requireRole(...ROLES)] }, obtenerPlanPlus);
  fastify.put('/finanzas/plan-plus',
    { preHandler: [authenticate, requireRole(...ROLES)] }, guardarPlanPlus);

  fastify.get('/metas',
    { preHandler: [authenticate, requireRole(...ROLES)] }, obtenerMetas);
  fastify.put('/metas',
    { preHandler: [authenticate, requireRole(...ROLES)] }, guardarMetas);
  fastify.get('/metas/progreso',
    { preHandler: [authenticate, requireRole(...ROLES)] }, progresoMetas);
}
