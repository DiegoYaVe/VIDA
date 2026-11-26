// src/routes/prospectos.routes.js
// Registros del formulario de la página web. Enviar es público (con límite por
// IP); verlos y atenderlos es de VIDA (SUPER_ADMIN y la Matriz).
import { authenticate } from '../middlewares/auth.js';
import { requireMatriz } from '../services/alcance.service.js';
import { registrarProspecto, listarProspectos, actualizarProspecto } from '../controllers/prospectos.controller.js';

export async function prospectosRoutes(fastify) {
  fastify.post('/prospectos', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, registrarProspecto);
  fastify.get('/prospectos', { preHandler: [authenticate, requireMatriz] }, listarProspectos);
  fastify.patch('/prospectos/:idProspecto', { preHandler: [authenticate, requireMatriz] }, actualizarProspecto);
}
