// src/routes/caja.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import {
  turnoActivo,
  abrirCaja,
  resumenTurno,
  cerrarCaja,
  historialTurnos,
} from '../controllers/caja.controller.js';

const TODOS_ROLES  = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN', 'SUPERVISOR', 'CAJERO', 'CASHIER'];
const ADMIN_ROLES  = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN', 'SUPERVISOR'];

export async function cajaRoutes(fastify) {
  fastify.get('/caja/turno-activo',
    { preHandler: [authenticate, requireRole(...TODOS_ROLES)] },
    turnoActivo);

  fastify.post('/caja/apertura',
    { preHandler: [authenticate, requireRole(...TODOS_ROLES)] },
    abrirCaja);

  fastify.get('/caja/resumen',
    { preHandler: [authenticate, requireRole(...TODOS_ROLES)] },
    resumenTurno);

  fastify.post('/caja/cierre',
    { preHandler: [authenticate, requireRole(...TODOS_ROLES)] },
    cerrarCaja);

  fastify.get('/caja/historial',
    { preHandler: [authenticate, requireRole(...TODOS_ROLES)] },
    historialTurnos);
}
