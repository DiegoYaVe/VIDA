// src/app.js
import 'dotenv/config';
import Fastify from 'fastify';
import fjwt from '@fastify/jwt';
import cors from '@fastify/cors';
import { getPool } from './db/sqlserver.js';
import { authRoutes } from './routes/auth.routes.js';
import { dashboardRoutes } from './routes/dashboard.routes.js';
import { usuariosRoutes } from './routes/usuarios.routes.js';
import { perfilRoutes } from './routes/perfil.routes.js';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const fastify = Fastify({ logger: true });
const __dirname = dirname(fileURLToPath(import.meta.url));

// CORS — permite llamadas desde el frontend React
await fastify.register(cors, {
  origin: [
    'http://localhost:5173',
    'http://israceballos-001-site17.mtempurl.com',
  ],
  credentials: true,
});

// JWT
await fastify.register(fjwt, {
  secret: process.env.JWT_SECRET || 'pos_venezuela_dev_secret_12345678',
});

await fastify.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB máximo

await fastify.register(staticFiles, {
  root: path.join(__dirname, '..', 'uploads'),
  prefix: '/uploads/',
});

// Health check
fastify.get('/health', async () => {
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1');
    return { status: 'ok', db: 'ok', timestamp: new Date().toISOString() };
  } catch {
    return { status: 'ok', db: 'error' };
  }
});

// Rutas bajo /api
fastify.register(authRoutes,      { prefix: '/api' });
fastify.register(dashboardRoutes, { prefix: '/api' });
fastify.register(usuariosRoutes, { prefix: '/api' });

fastify.register(perfilRoutes, { prefix: '/api' });

// Arrancar
const PORT = process.env.PORT || 3001;
try {
  await getPool(); // Verificar conexión BD al arrancar
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🚀 POS Venezuela Backend corriendo en http://localhost:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
