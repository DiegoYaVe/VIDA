// src/routes/delivery.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import { authenticateCliente, authenticateRepartidor } from '../middlewares/authDelivery.js';
import {
  // Cliente
  registrarCliente,
  loginCliente,
  confirmarEmailCliente,
  googleOAuthStart,
  googleOAuthCallback,
  actualizarFcmCliente,
  listarSucursales,
  listarProductosApp,
  crearPedidoApp,
  estadoPedidoCliente,
  // Repartidor
  loginRepartidor,
  toggleDisponible,
  actualizarUbicacion,
  actualizarFcmRepartidor,
  aceptarPedido,
  actualizarStatusPedido,
  pedidosActivos,
  historialRepartidor,
  // Admin
  listarRepartidores,
  crearRepartidor,
  editarRepartidor,
  liquidarRepartidor,
  getConfigDelivery,
  setConfigDelivery,
} from '../controllers/delivery.controller.js';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN', 'SUPERVISOR'];

export async function deliveryRoutes(fastify) {

  // ── Sin auth (app pública) ────────────────────────────────────────────
  fastify.get('/delivery/sucursales',   listarSucursales);
  fastify.get('/delivery/productos',    listarProductosApp);

  // ── Registro / login de cliente ───────────────────────────────────────
  fastify.post('/delivery/cliente/registro',        registrarCliente);
  fastify.post('/delivery/cliente/login',           loginCliente);
  fastify.get('/delivery/cliente/confirmar-email',  confirmarEmailCliente);
  fastify.get('/delivery/cliente/google/start',     googleOAuthStart);
  fastify.get('/delivery/cliente/google/callback',  googleOAuthCallback);

  // ── Cliente autenticado ───────────────────────────────────────────────
  fastify.put('/delivery/cliente/fcm',
    { preHandler: [authenticateCliente] },
    actualizarFcmCliente);

  fastify.post('/delivery/pedido',
    { preHandler: [authenticateCliente] },
    crearPedidoApp);

  fastify.get('/delivery/pedido/:idPedido/estado',
    { preHandler: [authenticateCliente] },
    estadoPedidoCliente);

  // ── Repartidor — auth ─────────────────────────────────────────────────
  fastify.post('/delivery/repartidor/login', loginRepartidor);

  fastify.post('/delivery/repartidor/disponible',
    { preHandler: [authenticateRepartidor] },
    toggleDisponible);

  fastify.post('/delivery/repartidor/ubicacion',
    { preHandler: [authenticateRepartidor] },
    actualizarUbicacion);

  fastify.put('/delivery/repartidor/fcm',
    { preHandler: [authenticateRepartidor] },
    actualizarFcmRepartidor);

  fastify.post('/delivery/repartidor/aceptar',
    { preHandler: [authenticateRepartidor] },
    aceptarPedido);

  fastify.post('/delivery/repartidor/status-pedido',
    { preHandler: [authenticateRepartidor] },
    actualizarStatusPedido);

  fastify.get('/delivery/repartidor/pedidos-activos',
    { preHandler: [authenticateRepartidor] },
    pedidosActivos);

  fastify.get('/delivery/repartidor/historial',
    { preHandler: [authenticateRepartidor] },
    historialRepartidor);

  // ── Admin — panel web (JWT empleado + rol) ────────────────────────────
  fastify.get('/delivery/admin/repartidores',
    { preHandler: [authenticate, requireRole(...ADMIN_ROLES)] },
    listarRepartidores);

  fastify.post('/delivery/admin/repartidores',
    { preHandler: [authenticate, requireRole(...ADMIN_ROLES)] },
    crearRepartidor);

  fastify.put('/delivery/admin/repartidores/:id',
    { preHandler: [authenticate, requireRole(...ADMIN_ROLES)] },
    editarRepartidor);

  fastify.post('/delivery/admin/liquidar/:idRepartidor',
    { preHandler: [authenticate, requireRole(...ADMIN_ROLES)] },
    liquidarRepartidor);

  fastify.get('/delivery/admin/config',
    { preHandler: [authenticate, requireRole(...ADMIN_ROLES)] },
    getConfigDelivery);

  fastify.post('/delivery/admin/config',
    { preHandler: [authenticate, requireRole(...ADMIN_ROLES)] },
    setConfigDelivery);
}
