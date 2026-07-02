// src/routes/inventario.routes.js
import { requireRole } from '../middlewares/auth.js';
import {
  listarCategorias, crearCategoria, editarCategoria, toggleCategoria,
  listarProductos, obtenerProducto, crearProducto, editarProducto, toggleProducto,
  verStock,
  registrarMovimiento, listarMovimientos,
} from '../controllers/inventario.controller.js';

// Roles que pueden escribir (alta/edición)
const ESCRITURA = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN'];

// Roles que pueden leer (consultas) — incluye cajeros porque el POS busca productos
const LECTURA   = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN', 'SUPERVISOR', 'CAJERO', 'CASHIER'];

export async function inventarioRoutes(fastify) {

  // ── CATEGORÍAS ────────────────────────────────────────────────────────
  fastify.get('/inventario/categorias',
    { preHandler: [requireRole(...LECTURA)] }, listarCategorias);

  fastify.post('/inventario/categorias',
    { preHandler: [requireRole(...ESCRITURA)] }, crearCategoria);

  fastify.put('/inventario/categorias/:idCategoria',
    { preHandler: [requireRole(...ESCRITURA)] }, editarCategoria);

  fastify.patch('/inventario/categorias/:idCategoria/status',
    { preHandler: [requireRole(...ESCRITURA)] }, toggleCategoria);

  // ── PRODUCTOS ─────────────────────────────────────────────────────────
  fastify.get('/inventario/productos',
    { preHandler: [requireRole(...LECTURA)] }, listarProductos);

  fastify.get('/inventario/productos/:idProducto',
    { preHandler: [requireRole(...LECTURA)] }, obtenerProducto);

  fastify.post('/inventario/productos',
    { preHandler: [requireRole(...ESCRITURA)] }, crearProducto);

  fastify.put('/inventario/productos/:idProducto',
    { preHandler: [requireRole(...ESCRITURA)] }, editarProducto);

  fastify.patch('/inventario/productos/:idProducto/status',
    { preHandler: [requireRole(...ESCRITURA)] }, toggleProducto);

  // ── STOCK ─────────────────────────────────────────────────────────────
  fastify.get('/inventario/stock',
    { preHandler: [requireRole(...LECTURA)] }, verStock);

  // ── MOVIMIENTOS ───────────────────────────────────────────────────────
  // SUPERVISOR incluido en escritura de movimientos pero el botón en UI
  // se ocultará hasta que sea necesario
  fastify.post('/inventario/movimientos',
    { preHandler: [requireRole(...ESCRITURA, 'SUPERVISOR')] }, registrarMovimiento);

  fastify.get('/inventario/movimientos',
    { preHandler: [requireRole(...LECTURA)] }, listarMovimientos);
}
