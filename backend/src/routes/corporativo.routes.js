// src/routes/corporativo.routes.js
import { authenticate, requireRole } from '../middlewares/auth.js';
import {
  tableroExpansion, listarTiendasRed, crearTiendaRed, cambiarEstadoOnboarding,
} from '../controllers/corporativo.controller.js';

// Portal Corporativo: solo roles corporativos/admin de red
const CORP = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN'];

export async function corporativoRoutes(fastify) {
  fastify.get('/corporativo/tablero',
    { preHandler: [authenticate, requireRole(...CORP)] }, tableroExpansion);

  fastify.get('/corporativo/tiendas',
    { preHandler: [authenticate, requireRole(...CORP)] }, listarTiendasRed);

  fastify.post('/corporativo/tiendas',
    { preHandler: [authenticate, requireRole(...CORP)] }, crearTiendaRed);

  fastify.patch('/corporativo/tiendas/:idPuntoVenta/onboarding',
    { preHandler: [authenticate, requireRole(...CORP)] }, cambiarEstadoOnboarding);
}
