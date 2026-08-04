// src/routes/matriz.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import {
  estadoMatriz, designarMatriz, catalogoMatriz,
  crearPedidoMatriz, listarPedidosMatriz, obtenerPedidoMatriz,
  cambiarEstadoPedidoMatriz,
} from '../controllers/matriz.controller.js';

// Ver/pedir a la matriz: dueños/gerentes de tienda + corporativo
const LECTURA  = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN', 'ADMIN_ESTADO', 'SUPERVISOR'];
// Designar la matriz: solo corporativo/admin
const ADMIN    = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN'];

export async function matrizRoutes(fastify) {
  fastify.get('/matriz',
    { preHandler: [authenticate, requireRole(...LECTURA)] }, estadoMatriz);

  fastify.post('/matriz/designar',
    { preHandler: [authenticate, requireRole(...ADMIN)] }, designarMatriz);

  fastify.get('/matriz/catalogo',
    { preHandler: [authenticate, requireRole(...LECTURA)] }, catalogoMatriz);

  fastify.post('/matriz/pedidos',
    { preHandler: [authenticate, requireRole(...LECTURA)] }, crearPedidoMatriz);

  fastify.get('/matriz/pedidos',
    { preHandler: [authenticate, requireRole(...LECTURA)] }, listarPedidosMatriz);

  fastify.get('/matriz/pedidos/:idPedidoMatriz',
    { preHandler: [authenticate, requireRole(...LECTURA)] }, obtenerPedidoMatriz);

  fastify.patch('/matriz/pedidos/:idPedidoMatriz/status',
    { preHandler: [authenticate, requireRole(...LECTURA)] }, cambiarEstadoPedidoMatriz);
}
