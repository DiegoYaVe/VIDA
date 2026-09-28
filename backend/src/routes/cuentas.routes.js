// src/routes/cuentas.routes.js
import { authenticate } from '../middlewares/auth.js';
import {
  listarCuentas, detalleCuenta, abonarCuenta, reversarAbono, notaCreditoCuenta, metodosPago,
} from '../controllers/cuentas.controller.js';

// No se usa requireRole acá: el alcance de cuentas no se decide por rol sino por
// si el usuario opera la Matriz (roles de red, o el ADMIN del punto de venta
// marcado como Matriz). Eso lo resuelve alcanceCuentas() dentro del controller,
// que además deja que un ADMIN de sucursal vea SOLO lo que su tienda debe.
export async function cuentasRoutes(fastify) {
  fastify.get('/cuentas',
    { preHandler: [authenticate] }, listarCuentas);

  fastify.get('/cuentas/metodos-pago',
    { preHandler: [authenticate] }, metodosPago);

  fastify.get('/cuentas/:idDocumento',
    { preHandler: [authenticate] }, detalleCuenta);

  fastify.post('/cuentas/:idDocumento/abonos',
    { preHandler: [authenticate] }, abonarCuenta);

  fastify.post('/cuentas/:idDocumento/abonos/:idAbono/reversar',
    { preHandler: [authenticate] }, reversarAbono);

  fastify.post('/cuentas/:idDocumento/nota-credito',
    { preHandler: [authenticate] }, notaCreditoCuenta);
}
