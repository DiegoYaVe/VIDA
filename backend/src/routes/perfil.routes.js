// src/routes/perfil.routes.js
import { authenticate } from '../middlewares/auth.js';
import { getPerfil, updatePerfil, uploadFoto, cambiarPassPerfil } from '../controllers/perfil.controller.js';

export async function perfilRoutes(fastify) {
  fastify.get('/perfil',              { preHandler: [authenticate] }, getPerfil);
  fastify.put('/perfil',              { preHandler: [authenticate] }, updatePerfil);
  fastify.post('/perfil/foto',        { preHandler: [authenticate] }, uploadFoto);
  fastify.post('/perfil/cambiar-pass',{ preHandler: [authenticate] }, cambiarPassPerfil);
}