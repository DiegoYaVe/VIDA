// src/routes/auth.routes.js
import { login, refresh, logout } from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.js';

export async function authRoutes(fastify) {
  fastify.post('/auth/login',   { schema: {
    body: { type:'object', required:['cve','pass'],
      properties: { cve:{type:'string'}, pass:{type:'string'} } }
  }}, login);

  fastify.post('/auth/refresh', { schema: {
    body: { type:'object', required:['refreshToken'],
      properties: { refreshToken:{type:'string'} } }
  }}, refresh);

  fastify.post('/auth/logout',  { preHandler: [authenticate] }, logout);
}
