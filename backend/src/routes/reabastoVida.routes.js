// src/routes/reabastoVida.routes.js
// Reabasto por proveedor con VIDA como intermediario (tarea 24) y el Portal de
// proveedores, que es público: se entra con el enlace secreto de cada proveedor.
import { authenticate, requireRole } from '../middlewares/auth.js';
import {
  catalogoVida, crearPedidoVida, obtenerPedidoVida, reportarPago, validarPago,
  cancelarPedidoVida, recibirPaquete, repartidoresEnvioProveedor, asignarRepartidorEnvio, ordenCompraPaquete,
} from '../controllers/reabastoVida.controller.js';
import { verPortal, avanzarPedidoPortal, avanzarPedidoApi } from '../controllers/portalProveedor.controller.js';

// Los mismos que piden reabasto a la Matriz: tiendas y corporativo. Qué puede
// hacer cada uno (pagar, validar, recibir) lo decide el controlador.
const LECTURA = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN', 'ADMIN_ESTADO', 'SUPERVISOR'];

export async function reabastoVidaRoutes(fastify) {
  const auth = { preHandler: [authenticate, requireRole(...LECTURA)] };
  fastify.get('/reabasto-vida/catalogo', auth, catalogoVida);
  fastify.post('/reabasto-vida/pedidos', auth, crearPedidoVida);
  fastify.get('/reabasto-vida/pedidos/:idPedidoMatriz', auth, obtenerPedidoVida);
  fastify.post('/reabasto-vida/pedidos/:idPedidoMatriz/pago', auth, reportarPago);
  fastify.post('/reabasto-vida/pedidos/:idPedidoMatriz/validar-pago', auth, validarPago);
  fastify.post('/reabasto-vida/pedidos/:idPedidoMatriz/cancelar', auth, cancelarPedidoVida);
  fastify.post('/reabasto-vida/paquetes/:idPedidoProveedor/recibir', auth, recibirPaquete);
  // Asignación manual del repartidor de un envío (solo VIDA; el controlador lo valida)
  fastify.get('/reabasto-vida/paquetes/:idPedidoProveedor/repartidores', auth, repartidoresEnvioProveedor);
  fastify.post('/reabasto-vida/paquetes/:idPedidoProveedor/asignar', auth, asignarRepartidorEnvio);
  fastify.get('/reabasto-vida/paquetes/:idPedidoProveedor/orden-compra', auth, ordenCompraPaquete);

  // Público: el enlace es la credencial. Límite estricto para que no se pueda
  // adivinar un código de retiro a fuerza de intentos.
  const limite = (max) => ({ config: { rateLimit: { max, timeWindow: '1 minute' } } });
  fastify.get('/portal-proveedor/:token', limite(60), verPortal);
  fastify.post('/portal-proveedor/:token/pedidos/:folio/:accion', limite(15), avanzarPedidoPortal);

  // API entrante para proveedores con integración: mismo paso, pero con el
  // PortalToken en Authorization: Bearer. El folio lo trae el pedido que VIDA
  // le envió (ver el callback en notificarProveedoresApi).
  fastify.post('/proveedor-api/pedidos/:folio/:accion', limite(30), avanzarPedidoApi);
}
