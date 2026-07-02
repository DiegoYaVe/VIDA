// src/app.js
import 'dotenv/config';
import Fastify from 'fastify';
import fjwt from '@fastify/jwt';
import cors from '@fastify/cors';
import fws from '@fastify/websocket';
import { getPool } from './db/sqlserver.js';
import { authRoutes } from './routes/auth.routes.js';
import { dashboardRoutes } from './routes/dashboard.routes.js';
import { usuariosRoutes } from './routes/usuarios.routes.js';
import { perfilRoutes } from './routes/perfil.routes.js';
import { inventarioRoutes } from './routes/inventario.routes.js';
import { sucursalesRoutes } from './routes/sucursales.routes.js';
import { proveedoresRoutes } from './routes/proveedores.routes.js';
import { pedidosRoutes } from './routes/pedidos.routes.js';
import { reportesRoutes }   from './routes/reportes.routes.js';
import { heartbeatRoutes }  from './routes/heartbeat.routes.js';
import { cajaRoutes }       from './routes/caja.routes.js';
import { deliveryRoutes }   from './routes/delivery.routes.js';
import { paisesRoutes }     from './routes/paises.routes.js';
import { estadosRoutes }    from './routes/estados.routes.js';
import { auditRoutes }      from './routes/audit.routes.js';
import { marcarInactivos }  from './controllers/heartbeat.controller.js';
import { expirarPedidosVencidos } from './controllers/pedidos.controller.js';
import { wsRoutes } from './ws/ws.routes.js';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const fastify = Fastify({ logger: true });
const __dirname = dirname(fileURLToPath(import.meta.url));

// CORS — permite llamadas desde el frontend React
const origensPermitidos = [
  'http://localhost:5173',
  'http://localhost:5174',
  process.env.FRONTEND_URL,
].filter(Boolean);

await fastify.register(cors, {
  origin: origensPermitidos,
  credentials: true,
});

// WebSocket
await fastify.register(fws);

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

fastify.register(perfilRoutes,    { prefix: '/api' });
fastify.register(inventarioRoutes,  { prefix: '/api' });
fastify.register(sucursalesRoutes,  { prefix: '/api' });
fastify.register(proveedoresRoutes, { prefix: '/api' });
fastify.register(pedidosRoutes,    { prefix: '/api' });
fastify.register(reportesRoutes,   { prefix: '/api' });
fastify.register(heartbeatRoutes,  { prefix: '/api' });
fastify.register(cajaRoutes,       { prefix: '/api' });
fastify.register(deliveryRoutes,   { prefix: '/api' });
fastify.register(paisesRoutes,     { prefix: '/api' });
fastify.register(estadosRoutes,    { prefix: '/api' });
fastify.register(auditRoutes,      { prefix: '/api' });
fastify.register(wsRoutes,         { prefix: '/api' });

// Job: expirar pedidos vencidos cada 60 segundos
setInterval(async () => {
  try {
    const pool = await getPool();
    await expirarPedidosVencidos(pool, fastify.log);
  } catch {}
}, 60_000);

// Job: detectar sucursales sin heartbeat cada 60 segundos
setInterval(async () => {
  try {
    const pool = await getPool();
    await marcarInactivos(pool, fastify.log);
  } catch {}
}, 60_000);

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
