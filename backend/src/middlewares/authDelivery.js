// src/middlewares/authDelivery.js
// Autentica tokens propios de la app móvil (clientes y repartidores)

/**
 * Middleware para rutas de clientes de la app.
 * Pone request.cliente = { idBranch, idCuenta, idCliente, rol }
 */
export async function authenticateCliente(request, reply) {
  try {
    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Token requerido' });
    }
    const token = auth.slice(7);
    const payload = request.server.jwt.verify(token);
    if (payload.rol !== 'CLIENTE') {
      return reply.code(403).send({ error: 'Token no válido para cliente' });
    }
    request.cliente = payload;
  } catch (err) {
    return reply.code(401).send({ error: 'Token inválido o expirado' });
  }
}

/**
 * Middleware para rutas de repartidores de la app.
 * Pone request.repartidor = { idBranch, idCuenta, idRepartidor, rol }
 */
export async function authenticateRepartidor(request, reply) {
  try {
    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Token requerido' });
    }
    const token = auth.slice(7);
    const payload = request.server.jwt.verify(token);
    if (payload.rol !== 'REPARTIDOR') {
      return reply.code(403).send({ error: 'Token no válido para repartidor' });
    }
    request.repartidor = payload;
  } catch (err) {
    return reply.code(401).send({ error: 'Token inválido o expirado' });
  }
}
