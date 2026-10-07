// src/routes/facturas.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import {
  obtenerDatosFiscales, guardarDatosFiscales, crearFactura, registrarNumeroControl,
  crearNotaCredito, verFactura, listarFacturas,
} from '../controllers/facturas.controller.js';

// Consultan (cada uno en su alcance): toda la red y las tiendas.
const LEEN = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN', 'SUPERVISOR', 'CAJERO', 'CASHIER'];
// Emiten y registran el número de control: quien opera la tienda. Los roles
// regionales solo consultan.
const EMITEN = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'CAJERO', 'CASHIER'];
// La nota de crédito anula fiscalmente una venta: no la emite un cajero.
const ANULAN = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'];

export async function facturasRoutes(fastify) {
  const pre = roles => ({ preHandler: [authenticate, requireRole(...roles)] });

  fastify.get('/facturas/datos-fiscales/:idPuntoVenta', pre(['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN']), obtenerDatosFiscales);
  fastify.put('/facturas/datos-fiscales/:idPuntoVenta', pre(['SUPER_ADMIN', 'ADMIN']), guardarDatosFiscales);

  fastify.get('/facturas',                       pre(LEEN),   listarFacturas);
  fastify.get('/facturas/:idFactura',            pre(LEEN),   verFactura);
  fastify.post('/facturas',                      pre(EMITEN), crearFactura);
  fastify.post('/facturas/:idFactura/control',   pre(EMITEN), registrarNumeroControl);
  fastify.post('/facturas/:idFactura/nota-credito', pre(ANULAN), crearNotaCredito);
}
