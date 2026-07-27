// src/routes/promociones.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import {
  listarPromociones, crearPromocion, editarPromocion, eliminarPromocion,
} from '../controllers/promociones.controller.js';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN', 'ADMIN_ESTADO', 'SUPERVISOR'];
const ESCRITURA   = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN'];

export async function promocionesRoutes(fastify) {
  fastify.get('/promociones',
    { preHandler: [authenticate, requireRole(...ADMIN_ROLES)] },
    listarPromociones);

  fastify.post('/promociones',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] },
    crearPromocion);

  fastify.put('/promociones/:idPromocion',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] },
    editarPromocion);

  fastify.delete('/promociones/:idPromocion',
    { preHandler: [authenticate, requireRole(...ESCRITURA)] },
    eliminarPromocion);
}
