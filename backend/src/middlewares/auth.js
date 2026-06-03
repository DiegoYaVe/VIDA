// src/middlewares/auth.js
export async function authenticate(request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: 'Token inválido o expirado' });
  }
}

export function requireRole(...roles) {
  return async (request, reply) => {
    await authenticate(request, reply);
    if (!roles.includes(request.user.TipoUsuario)) {
      reply.code(403).send({ error: 'No tienes permiso para esta acción' });
    }
  };
}
