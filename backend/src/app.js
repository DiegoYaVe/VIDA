// src/app.js
import 'dotenv/config';
import Fastify from 'fastify';
import fjwt from '@fastify/jwt';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
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
import { promocionesRoutes } from './routes/promociones.routes.js';
import { matrizRoutes }      from './routes/matriz.routes.js';
import { corporativoRoutes } from './routes/corporativo.routes.js';
import { paisesRoutes }     from './routes/paises.routes.js';
import { estadosRoutes }    from './routes/estados.routes.js';
import { ciudadesRoutes }   from './routes/ciudades.routes.js';
import { auditRoutes }      from './routes/audit.routes.js';
import { marcarInactivos }  from './controllers/heartbeat.controller.js';
import { expirarPedidosVencidos } from './controllers/pedidos.controller.js';
import { procesarBusquedas } from './services/dispatch.service.js';
import { wsRoutes } from './ws/ws.routes.js';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const ES_PRODUCCION = process.env.NODE_ENV === 'production';
const SECRET_DEV = 'pos_venezuela_dev_secret_12345678';

// ── Hardening: en producción el JWT_SECRET es obligatorio y no puede ser el
// valor de desarrollo (si no, cualquiera podría forjar tokens con el secreto
// conocido del repo).
const JWT_SECRET = process.env.JWT_SECRET;
if (ES_PRODUCCION && (!JWT_SECRET || JWT_SECRET.length < 32 || JWT_SECRET === SECRET_DEV)) {
  console.error('FATAL: en producción JWT_SECRET debe estar definido, tener 32+ caracteres y NO ser el valor de desarrollo.');
  process.exit(1);
}

const fastify = Fastify({
  // En producción se sube el nivel de log y se redactan cabeceras sensibles
  logger: ES_PRODUCCION
    ? { level: 'warn', redact: ['req.headers.authorization', 'req.headers.cookie'] }
    : true,
  trustProxy: true, // detrás de IIS/reverse proxy: usa el IP real del cliente
});
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

// Cabeceras de seguridad (CSP, X-Frame-Options, HSTS, etc.). Se desactiva la
// CSP por defecto para no bloquear los recursos servidos desde /uploads.
await fastify.register(helmet, { contentSecurityPolicy: false });

// Rate limiting global — frena abuso/fuerza bruta. El login tiene un límite
// más estricto configurado en su propia ruta.
await fastify.register(rateLimit, {
  global: true,
  max: 300,               // 300 req/min por IP en general
  timeWindow: '1 minute',
  allowList: [],
});

// WebSocket
await fastify.register(fws);

// JWT (el secreto ya fue validado arriba en producción)
await fastify.register(fjwt, {
  secret: JWT_SECRET || SECRET_DEV,
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
fastify.register(promocionesRoutes, { prefix: '/api' });
fastify.register(matrizRoutes,      { prefix: '/api' });
fastify.register(corporativoRoutes, { prefix: '/api' });
fastify.register(paisesRoutes,     { prefix: '/api' });
fastify.register(estadosRoutes,    { prefix: '/api' });
fastify.register(ciudadesRoutes,   { prefix: '/api' });
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

// Job: búsqueda de repartidor — escalar radio, avisar al cliente sin
// repartidor y cancelar pedidos cuya búsqueda venció (cada 60 segundos)
setInterval(async () => {
  try {
    await procesarBusquedas(fastify.log);
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
