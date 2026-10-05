// src/routes/caja.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import {
  turnoActivo,
  abrirCaja,
  resumenTurno,
  cerrarCaja,
  historialTurnos,
  registrarMovimiento,
  anularMovimiento,
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

  // Movimientos de caja (egresos/ingresos/retiros/devoluciones) por moneda
  fastify.post('/caja/movimiento',
    { preHandler: [authenticate, requireRole(...TODOS_ROLES)] },
    registrarMovimiento);

  // Anular un movimiento: solo roles de supervisión/administración
  fastify.post('/caja/movimiento/:id/anular',
    { preHandler: [authenticate, requireRole(...ADMIN_ROLES)] },
    anularMovimiento);
}
