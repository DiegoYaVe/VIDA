// src/routes/proveedores.routes.js
// Todo el módulo es solo de VIDA (SUPER_ADMIN y la Matriz): desde la decisión
// del 28 oct 2026 la tienda no debe saber quién es el proveedor, así que ya no
// ve la lista, ni el RIF, ni los contactos (antes la veían ADMIN y SUPERVISOR).
import { authenticate } from '../middlewares/auth.js';
import { requireMatriz } from '../services/alcance.service.js';
import {
  listarProveedores, obtenerProveedor, crearProveedor, editarProveedor, toggleProveedor,
  listarProductosProveedor, agregarProductoProveedor, quitarProductoProveedor,
  listarOrdenes, obtenerOrden, siguienteFolioOrden, crearOrden, cambiarEstadoOrden,
  configurarReabastoProveedor, generarPortalProveedor, verPortalProveedor,
  listarSucursalesProveedor, crearSucursalProveedor, editarSucursalProveedor,
} from '../controllers/proveedores.controller.js';

export async function proveedoresRoutes(fastify) {
  const vida = { preHandler: [authenticate, requireMatriz] };

  // ── Proveedores ───────────────────────────────────────────────────────
  fastify.get('/proveedores', vida, listarProveedores);
  fastify.get('/proveedores/:idProveedor', vida, obtenerProveedor);
  fastify.post('/proveedores', vida, crearProveedor);
  fastify.put('/proveedores/:idProveedor', vida, editarProveedor);
  fastify.patch('/proveedores/:idProveedor/status', vida, toggleProveedor);

  // ── Productos por proveedor (PrecioCosto = precio de lista) ──────────
  fastify.get('/proveedores/:idProveedor/productos', vida, listarProductosProveedor);
  fastify.post('/proveedores/:idProveedor/productos', vida, agregarProductoProveedor);
  fastify.delete('/proveedores/:idProveedor/productos/:idProducto', vida, quitarProductoProveedor);

  // ── Reabasto con VIDA como intermediario ──────────────────────────────
  fastify.put('/proveedores/:idProveedor/reabasto', vida, configurarReabastoProveedor);
  fastify.get('/proveedores/:idProveedor/portal', vida, verPortalProveedor);
  fastify.post('/proveedores/:idProveedor/portal', vida, generarPortalProveedor);
  fastify.get('/proveedores/:idProveedor/sucursales', vida, listarSucursalesProveedor);
  fastify.post('/proveedores/:idProveedor/sucursales', vida, crearSucursalProveedor);
  fastify.put('/proveedores/:idProveedor/sucursales/:idSucursal', vida, editarSucursalProveedor);

  // ── Órdenes de compra ─────────────────────────────────────────────────
  fastify.get('/ordenes-compra', vida, listarOrdenes);
  fastify.get('/ordenes-compra/siguiente-folio', vida, siguienteFolioOrden);
  fastify.get('/ordenes-compra/:idOrden', vida, obtenerOrden);
  fastify.post('/ordenes-compra', vida, crearOrden);
  fastify.post('/ordenes-compra/:idOrden/estado', vida, cambiarEstadoOrden);
}
