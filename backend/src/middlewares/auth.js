import { getPool } from '../db/sqlserver.js';
import { estadoDeTienda } from '../services/suscripcionDatos.service.js';
import { portalDeRol } from '../config/portales.js';

// Rutas permitidas para un usuario con contraseña temporal (CambiarPass=1):
// solo puede cambiarla, pedir que se la reenvíen, ver su sesión o salir.
// Todo lo demás responde 403.
const RUTAS_PERMITIDAS_CAMBIO_PASS = [
  '/api/usuarios/cambiar-pass',
  '/api/usuarios/reenviar-temporal',
  '/api/perfil/cambiar-pass',
  '/api/auth/logout',
  '/api/auth/me',
];

// Tienda suspendida por falta de pago (sql/63): solo puede entrar, ver qué
// debe y cómo pagar. El corte solo actúa si VIDA lo encendió
// (SuscripcionCorteActivo) y la tienda tiene nivel asignado.
const ROLES_TIENDA = ['ADMIN', 'SUPERVISOR', 'CAJERO', 'CASHIER'];
const PERMITIDAS_SUSPENDIDA = [/^\/api\/auth\//, /^\/api\/suscripcion\/mia$/, /^\/api\/heartbeat\//,
  /^\/api\/perfil/, /^\/api\/usuarios\/cambiar-pass$/];

async function revisarSuspension(request, reply) {
  const u = request.user;
  if (!ROLES_TIENDA.includes(u?.TipoUsuario) || !u.idPuntoVenta) return;
  const ruta = request.url.split('?')[0];
  if (PERMITIDAS_SUSPENDIDA.some(re => re.test(ruta))) return;
  // Ver sus cuentas (lo que debe) sí puede; los pagos los registra VIDA
  if (request.method === 'GET' && ruta.startsWith('/api/cuentas')) return;
  let est;
  try {
    est = await estadoDeTienda(await getPool(), u.idBranch, u.idCuenta, u.idPuntoVenta);
  } catch (err) {
    request.log.warn('No se pudo revisar la suscripción: ' + err.message);
    return;   // si falla la consulta, no se bloquea a nadie
  }
  if (est.estado === 'SUSPENDIDA') {
    return reply.code(423).send({
      error: `Tu tienda está suspendida por falta de pago (debe $${est.deudaUSD.toFixed(2)}). Paga a VIDA para reactivarla.`,
      codigo: 'TIENDA_SUSPENDIDA', deudaUSD: est.deudaUSD,
    });
  }
}

export async function authenticate(request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    request.log.warn('JWT inválido: ' + err.message);
    return reply.code(401).send({ error: 'Token inválido o expirado' });
  }

  // Enforcement en servidor del cambio de contraseña obligatorio — el frontend
  // también lo fuerza, pero sin esto era saltable llamando al API directamente
  if (request.user?.CambiarPass) {
    const ruta = request.routeOptions?.url || request.url.split('?')[0];
    if (!RUTAS_PERMITIDAS_CAMBIO_PASS.includes(ruta)) {
      return reply.code(403).send({
        error: 'Debes cambiar tu contraseña temporal antes de continuar',
        codigo: 'CAMBIAR_PASS_REQUERIDO',
      });
    }
  }

  return revisarSuspension(request, reply);
}

export function requireRole(...roles) {
  return async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    if (!roles.includes(request.user?.TipoUsuario)) {
      reply.code(403).send({ error: 'No tienes permiso para esta acción' });
    }
  };
}

// Guard por portal: el usuario debe pertenecer a alguno de los portales dados
// (CORPORATIVO / EMPRESARIO / REPARTIDOR / CLIENTE). Se deriva de su TipoUsuario.
export function requirePortal(...portales) {
  return async (request, reply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    const portal = portalDeRol(request.user?.TipoUsuario);
    if (!portal || !portales.includes(portal)) {
      reply.code(403).send({
        error: 'Tu portal no tiene acceso a este recurso',
        codigo: 'PORTAL_NO_AUTORIZADO',
      });
    }
  };
}
