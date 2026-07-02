// src/routes/sucursales.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import {
  listarPuntosVenta, crearPuntoVenta, editarPuntoVenta, togglePuntoVenta,
} from '../controllers/sucursales.controller.js';

const TODOS = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN', 'SUPERVISOR', 'CAJERO', 'CASHIER'];
const ADMIN = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN'];

export async function sucursalesRoutes(fastify) {

  fastify.get('/sucursales/puntos-venta',
    { preHandler: [authenticate, requireRole(...TODOS)] },
    listarPuntosVenta);

  fastify.post('/sucursales/puntos-venta',
    { preHandler: [authenticate, requireRole(...ADMIN)] },
    crearPuntoVenta);

  fastify.put('/sucursales/puntos-venta/:idPuntoVenta',
    { preHandler: [authenticate, requireRole(...ADMIN)] },
    editarPuntoVenta);

  fastify.patch('/sucursales/puntos-venta/:idPuntoVenta/toggle',
    { preHandler: [authenticate, requireRole(...ADMIN)] },
    togglePuntoVenta);
}
