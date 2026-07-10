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
  googleOAuthPoll,
  actualizarFcmCliente,
  actualizarPerfilCliente,
  subirFotoCliente,
  cambiarPasswordCliente,
  eliminarCuentaCliente,
  listarDireccionesCliente,
  guardarDireccionCliente,
  eliminarDireccionCliente,
  datosPagoMovil,
  subirComprobanteCliente,
  listarSucursales,
  listarProductosApp,
  crearPedidoApp,
  estadoPedidoCliente,
  historialPedidosCliente,
  extenderBusquedaPedido,
  cancelarPedidoCliente,
  // Repartidor
  registrarRepartidor,
  loginRepartidor,
  toggleDisponible,
  actualizarUbicacion,
  actualizarFcmRepartidor,
  subirEvidenciaEntrega,
  subirFotoRepartidor,
  perfilRepartidorApp,
  actualizarPerfilRepartidor,
  aceptarPedido,
  actualizarStatusPedido,
  pedidosActivos,
  pedidosDisponibles,
  historialRepartidor,
  rutaRepartidor,
  resumenRepartidores,
  // Cliente extra
  calificarRepartidor,
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
  fastify.get('/delivery/pago-movil',   datosPagoMovil);

  // ── Registro / login de cliente ───────────────────────────────────────
  fastify.post('/delivery/cliente/registro',        registrarCliente);
  fastify.post('/delivery/cliente/login',           loginCliente);
  fastify.get('/delivery/cliente/confirmar-email',  confirmarEmailCliente);
  fastify.get('/delivery/cliente/google/start',          googleOAuthStart);
  fastify.get('/delivery/cliente/google/callback',       googleOAuthCallback);
  fastify.get('/delivery/cliente/google/poll/:sessionId', googleOAuthPoll);

  // ── Cliente autenticado ───────────────────────────────────────────────
  fastify.put('/delivery/cliente/fcm',
    { preHandler: [authenticateCliente] },
    actualizarFcmCliente);

  fastify.get('/delivery/cliente/direcciones',
    { preHandler: [authenticateCliente] },
    listarDireccionesCliente);

  fastify.post('/delivery/cliente/direcciones',
    { preHandler: [authenticateCliente] },
    guardarDireccionCliente);

  fastify.delete('/delivery/cliente/direcciones/:idDireccion',
    { preHandler: [authenticateCliente] },
    eliminarDireccionCliente);

  fastify.post('/delivery/pedido',
    { preHandler: [authenticateCliente] },
    crearPedidoApp);

  fastify.get('/delivery/cliente/pedidos',
    { preHandler: [authenticateCliente] },
    historialPedidosCliente);

  fastify.get('/delivery/pedido/:idPedido/estado',
    { preHandler: [authenticateCliente] },
    estadoPedidoCliente);

  fastify.post('/delivery/pedido/:idPedido/extender-busqueda',
    { preHandler: [authenticateCliente] },
    extenderBusquedaPedido);

  fastify.post('/delivery/pedido/:idPedido/cancelar',
    { preHandler: [authenticateCliente] },
    cancelarPedidoCliente);

  fastify.post('/delivery/pedido/:idPedido/comprobante',
    { preHandler: [authenticateCliente] },
    subirComprobanteCliente);

  fastify.post('/delivery/pedido/:idPedido/calificar',
    { preHandler: [authenticateCliente] },
    calificarRepartidor);

  fastify.put('/delivery/cliente/perfil',
    { preHandler: [authenticateCliente] },
    actualizarPerfilCliente);

  fastify.post('/delivery/cliente/foto',
    { preHandler: [authenticateCliente] },
    subirFotoCliente);

  fastify.put('/delivery/cliente/password',
    { preHandler: [authenticateCliente] },
    cambiarPasswordCliente);

  fastify.delete('/delivery/cliente',
    { preHandler: [authenticateCliente] },
    eliminarCuentaCliente);

  // ── Repartidor — auth ─────────────────────────────────────────────────
  fastify.post('/delivery/repartidor/registro', registrarRepartidor);
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

  fastify.post('/delivery/repartidor/pedido/:idPedido/evidencia',
    { preHandler: [authenticateRepartidor] },
    subirEvidenciaEntrega);

  fastify.get('/delivery/repartidor/pedidos-activos',
    { preHandler: [authenticateRepartidor] },
    pedidosActivos);

  fastify.get('/delivery/repartidor/pedidos-disponibles',
    { preHandler: [authenticateRepartidor] },
    pedidosDisponibles);

  fastify.get('/delivery/repartidor/historial',
    { preHandler: [authenticateRepartidor] },
    historialRepartidor);

  fastify.get('/delivery/repartidor/ruta',
    { preHandler: [authenticateRepartidor] },
    rutaRepartidor);

  fastify.get('/delivery/repartidor/perfil',
    { preHandler: [authenticateRepartidor] },
    perfilRepartidorApp);

  fastify.put('/delivery/repartidor/perfil',
    { preHandler: [authenticateRepartidor] },
    actualizarPerfilRepartidor);

  fastify.post('/delivery/repartidor/foto',
    { preHandler: [authenticateRepartidor] },
    subirFotoRepartidor);

  // ── Admin — panel web (JWT empleado + rol) ────────────────────────────
  fastify.get('/delivery/admin/repartidores',
    { preHandler: [authenticate, requireRole(...ADMIN_ROLES)] },
    listarRepartidores);

  fastify.get('/delivery/admin/repartidores/resumen',
    { preHandler: [authenticate, requireRole(...ADMIN_ROLES)] },
    resumenRepartidores);

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
