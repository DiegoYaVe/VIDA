export async function authenticate(request, reply) {
  try {
    const authHeader = request.headers.authorization;
    console.log('AUTH HEADER:', authHeader ? authHeader.substring(0, 50) + '...' : 'NO HEADER');
    await request.jwtVerify();
    console.log('JWT VALID - user:', request.user?.idUsuario);
  } catch (err) {
    console.log('JWT ERROR:', err.message);
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