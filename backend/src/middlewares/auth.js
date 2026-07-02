// Rutas permitidas para un usuario con contraseña temporal (CambiarPass=1):
// solo puede cambiarla, ver su sesión o salir. Todo lo demás responde 403.
const RUTAS_PERMITIDAS_CAMBIO_PASS = [
  '/api/usuarios/cambiar-pass',
  '/api/perfil/cambiar-pass',
  '/api/auth/logout',
  '/api/auth/me',
];

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
