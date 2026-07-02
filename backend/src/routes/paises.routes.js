// src/routes/paises.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import { listarPaises, crearPais, editarPais, togglePais } from '../controllers/paises.controller.js';

const LECTURA   = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN', 'SUPERVISOR', 'CAJERO'];
const ESCRITURA = ['SUPER_ADMIN', 'ADMIN_PAIS'];

export async function paisesRoutes(fastify) {
  fastify.get('/paises',
    { preHandler: [authenticate, requireRole(...LECTURA)] },
    listarPaises);

  fastify.post('/paises',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] },
    crearPais);

  fastify.put('/paises/:idPais',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] },
    editarPais);

  fastify.patch('/paises/:idPais/toggle',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] },
    togglePais);
}
