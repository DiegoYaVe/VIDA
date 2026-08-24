// src/routes/ciudades.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import { listarCiudades, crearCiudad } from '../controllers/ciudades.controller.js';

const LECTURA   = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN', 'SUPERVISOR', 'CAJERO'];
const ESCRITURA = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO'];

export async function ciudadesRoutes(fastify) {
  fastify.get('/ciudades',
    { preHandler: [authenticate, requireRole(...LECTURA)] },
    listarCiudades);

  fastify.post('/ciudades',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] },
    crearCiudad);
}
