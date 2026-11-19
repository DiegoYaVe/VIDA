// src/routes/suscripcion.routes.js
// Afiliación con kit y mensualidad por nivel (tareas 14–16). Administrarla es
// de VIDA (SUPER_ADMIN y la Matriz); cada tienda consulta la suya.
import { authenticate } from '../middlewares/auth.js';
import { requireMatriz } from '../services/alcance.service.js';
import {
  listarNiveles, guardarNivel, obtenerConfig, guardarConfig, listarTiendasSuscripcion,
  asignarNivelTienda, generarAhora, miSuscripcion,
} from '../controllers/suscripcion.controller.js';

export async function suscripcionRoutes(fastify) {
  const vida = { preHandler: [authenticate, requireMatriz] };
  fastify.get('/suscripcion/niveles', vida, listarNiveles);
  fastify.post('/suscripcion/niveles', vida, guardarNivel);
  fastify.put('/suscripcion/niveles/:idNivel', vida, guardarNivel);
  fastify.get('/suscripcion/config', vida, obtenerConfig);
  fastify.put('/suscripcion/config', vida, guardarConfig);
  fastify.get('/suscripcion/tiendas', vida, listarTiendasSuscripcion);
  fastify.put('/suscripcion/tiendas/:idPuntoVenta', vida, asignarNivelTienda);
  fastify.post('/suscripcion/generar', vida, generarAhora);

  // La tienda (cualquier usuario de la tienda): su estado. Siempre responde,
  // aunque esté suspendida, para mostrarle por qué y cómo pagar.
  fastify.get('/suscripcion/mia', { preHandler: [authenticate] }, miSuscripcion);
}
