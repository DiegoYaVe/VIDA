// src/routes/cupones.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import { authenticateCliente } from '../middlewares/authDelivery.js';
import {
  listarCupones, crearCupon, editarCupon, eliminarCupon, usosCupon,
  validarCuponPOS, validarCuponCliente, aplicarCuponPedido,
} from '../controllers/cupones.controller.js';

const LECTURA   = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN', 'SUPERVISOR'];
const ESCRITURA = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN'];
const POS_ROLES = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN', 'SUPERVISOR', 'CAJERO', 'CASHIER'];

export async function cuponesRoutes(fastify) {
  // ── Panel (CRUD) ──
  fastify.get('/cupones',
    { preHandler: [authenticate, requireRole(...LECTURA)] }, listarCupones);
  fastify.post('/cupones',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] }, crearCupon);
  fastify.put('/cupones/:idCupon',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] }, editarCupon);
  fastify.delete('/cupones/:idCupon',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] }, eliminarCupon);
  fastify.get('/cupones/:idCupon/usos',
    { preHandler: [authenticate, requireRole(...LECTURA)] }, usosCupon);

  // ── POS (preview de descuento) ──
  fastify.post('/cupones/validar',
    { preHandler: [authenticate, requireRole(...POS_ROLES)] }, validarCuponPOS);

  // ── App del cliente ──
  fastify.post('/delivery/cliente/cupones/validar',
    { preHandler: [authenticateCliente] }, validarCuponCliente);
  fastify.post('/delivery/cliente/cupones/aplicar',
    { preHandler: [authenticateCliente] }, aplicarCuponPedido);
}
