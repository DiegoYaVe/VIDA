// src/routes/reportes.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import {
  obtenerFiltros,
  reporteVentas,
  reporteCaja,
  reportePagoMovil,
  reporteProductos,
  reporteInventario,
  reporteMovimientos,
  reporteDelivery,
  reporteRed,
} from '../controllers/reportes.controller.js';

// Roles con acceso a reportes; cada uno ve solo su alcance (ver alcanceGeo en
// reportes.controller.js): tienda, estado, país o toda la cuenta.
const REPORTES = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN', 'SUPERVISOR', 'CAJERO', 'CASHIER'];

export async function reportesRoutes(fastify) {
  const pre = { preHandler: [authenticate, requireRole(...REPORTES)] };

  fastify.get('/reportes/filtros',      pre, obtenerFiltros);
  fastify.get('/reportes/ventas',       pre, reporteVentas);
  fastify.get('/reportes/caja',         pre, reporteCaja);
  fastify.get('/reportes/pago-movil',   pre, reportePagoMovil);
  fastify.get('/reportes/productos',    pre, reporteProductos);
  fastify.get('/reportes/inventario',   pre, reporteInventario);
  fastify.get('/reportes/movimientos',  pre, reporteMovimientos);
  fastify.get('/reportes/delivery',     pre, reporteDelivery);

  // Reporte ejecutivo de red: visión corporativa, solo roles administrativos
  const preRed = { preHandler: [authenticate, requireRole('SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO')] };
  fastify.get('/reportes/red',          preRed, reporteRed);
}
