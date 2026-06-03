// src/app.js
import 'dotenv/config';
import Fastify from 'fastify';
import fjwt from '@fastify/jwt';
import cors from '@fastify/cors';
import { getPool } from './db/sqlserver.js';
import { authRoutes } from './routes/auth.routes.js';
import { dashboardRoutes } from './routes/dashboard.routes.js';

const fastify = Fastify({ logger: true });

// CORS — permite llamadas desde el frontend React
await fastify.register(cors, {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
});

// JWT
await fastify.register(fjwt, {
  secret: process.env.JWT_SECRET || 'pos_venezuela_dev_secret_12345678',
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
