// src/routes/pedidos.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import {
  listarPedidos, obtenerPedido, crearPedido, cambiarStatusPedido,
  asignarRepartidor, subirComprobante, revisarComprobante,
  listarRepartidores, aprobarRepartidor, listarVentasPOS,
} from '../controllers/pedidos.controller.js';

const ESCRITURA = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN'];
const LECTURA   = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN', 'SUPERVISOR'];
const CAJA      = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN', 'SUPERVISOR', 'CAJERO', 'CASHIER'];

export async function pedidosRoutes(fastify) {

  // ── Pedidos ───────────────────────────────────────────────────────────
  fastify.get('/pedidos',
    { preHandler: [authenticate, requireRole(...LECTURA)] },
    listarPedidos);

  fastify.get('/pedidos/:idPedido',
    { preHandler: [authenticate, requireRole(...CAJA)] },
    obtenerPedido);

  fastify.post('/pedidos',
    { preHandler: [authenticate, requireRole(...CAJA)] },
    crearPedido);

  fastify.patch('/pedidos/:idPedido/status',
    { preHandler: [authenticate, requireRole(...CAJA)] },
    cambiarStatusPedido);

  fastify.patch('/pedidos/:idPedido/repartidor',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] },
    asignarRepartidor);

  // ── Comprobantes de pago manual ───────────────────────────────────────
  fastify.post('/pedidos/:idPedido/comprobante',
    { preHandler: [authenticate, requireRole(...CAJA)] },
    subirComprobante);

  fastify.patch('/pedidos/:idPedido/comprobante/:idComprobante/revision',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] },
    revisarComprobante);

  // ── Repartidores ──────────────────────────────────────────────────────
  // ── Ventas POS (historial + reimpresión) ─────────────────────────────────
  fastify.get('/pedidos/pos/ventas',
    { preHandler: [authenticate, requireRole(...CAJA)] },
    listarVentasPOS);

  fastify.get('/repartidores',
    { preHandler: [authenticate, requireRole(...LECTURA)] },
    listarRepartidores);

  fastify.patch('/repartidores/:idRepartidor/aprobacion',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] },
    aprobarRepartidor);
}
