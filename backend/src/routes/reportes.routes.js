// src/routes/reportes.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import {
  obtenerFiltros,
  reporteVentas,
  reporteProductos,
  reporteInventario,
  reporteMovimientos,
  reporteDelivery,
} from '../controllers/reportes.controller.js';

// Roles con acceso a reportes (todos excepto CASHIER/CAJERO básico que solo ven su sucursal)
const REPORTES = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN', 'SUPERVISOR', 'CAJERO', 'CASHIER'];

export async function reportesRoutes(fastify) {
  const pre = { preHandler: [authenticate, requireRole(...REPORTES)] };

  fastify.get('/reportes/filtros',      pre, obtenerFiltros);
  fastify.get('/reportes/ventas',       pre, reporteVentas);
  fastify.get('/reportes/productos',    pre, reporteProductos);
  fastify.get('/reportes/inventario',   pre, reporteInventario);
  fastify.get('/reportes/movimientos',  pre, reporteMovimientos);
  fastify.get('/reportes/delivery',     pre, reporteDelivery);
}
