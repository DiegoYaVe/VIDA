// src/routes/proveedores.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import {
  listarProveedores, obtenerProveedor, crearProveedor, editarProveedor, toggleProveedor,
  listarProductosProveedor, agregarProductoProveedor, quitarProductoProveedor,
  listarOrdenes, obtenerOrden, crearOrden, cambiarEstadoOrden,
} from '../controllers/proveedores.controller.js';

const ESCRITURA = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN'];
const LECTURA   = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN', 'SUPERVISOR'];

export async function proveedoresRoutes(fastify) {

  // ── Proveedores ───────────────────────────────────────────────────────
  fastify.get('/proveedores',
    { preHandler: [authenticate, requireRole(...LECTURA)] },
    listarProveedores);

  fastify.get('/proveedores/:idProveedor',
    { preHandler: [authenticate, requireRole(...LECTURA)] },
    obtenerProveedor);

  fastify.post('/proveedores',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] },
    crearProveedor);

  fastify.put('/proveedores/:idProveedor',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] },
    editarProveedor);

  fastify.patch('/proveedores/:idProveedor/status',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] },
    toggleProveedor);

  // ── Productos por proveedor ───────────────────────────────────────────
  fastify.get('/proveedores/:idProveedor/productos',
    { preHandler: [authenticate, requireRole(...LECTURA)] },
    listarProductosProveedor);

  fastify.post('/proveedores/:idProveedor/productos',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] },
    agregarProductoProveedor);

  fastify.delete('/proveedores/:idProveedor/productos/:idProducto',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] },
    quitarProductoProveedor);

  // ── Órdenes de compra ─────────────────────────────────────────────────
  fastify.get('/ordenes-compra',
    { preHandler: [authenticate, requireRole(...LECTURA)] },
    listarOrdenes);

  fastify.get('/ordenes-compra/:idOrden',
    { preHandler: [authenticate, requireRole(...LECTURA)] },
    obtenerOrden);

  fastify.post('/ordenes-compra',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] },
    crearOrden);

  fastify.post('/ordenes-compra/:idOrden/estado',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] },
    cambiarEstadoOrden);
}
