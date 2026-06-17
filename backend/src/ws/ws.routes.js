// src/ws/ws.routes.js
import { registrar, eliminar, totalConectados } from './ws.manager.js';

export async function wsRoutes(fastify) {
  fastify.get('/ws', { websocket: true }, (connection, request) => {
    // @fastify/websocket v8: el primer arg es un SocketStream; el WebSocket real está en .socket
    const socket = connection.socket;
    let key = null;

    // Autenticar por token en query string: ws://host/api/ws?token=JWT
    try {
      const token = request.query?.token;
      if (!token) { socket.close(1008, 'Token requerido'); return; }

      const decoded = fastify.jwt.verify(token);
      key = `${decoded.idBranch}_${decoded.idCuenta}`;

      registrar(key, socket);
      fastify.log.info(`[WS] Cliente conectado: ${key} | Total: ${totalConectados()}`);

      // Confirmar conexión exitosa al cliente
      socket.send(JSON.stringify({ tipo: 'conectado', mensaje: 'Conexión establecida' }));

    } catch (err) {
      fastify.log.warn(`[WS] Token inválido: ${err.message}`);
      socket.close(1008, 'Token inválido');
      return;
    }

    // Responder pings para mantener la conexión viva
    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.tipo === 'ping') {
          socket.send(JSON.stringify({ tipo: 'pong' }));
        }
      } catch { /* ignorar mensajes malformados */ }
    });

    // Limpiar al desconectar
    socket.on('close', () => {
      if (key) {
        eliminar(key, socket);
        fastify.log.info(`[WS] Cliente desconectado: ${key} | Total: ${totalConectados()}`);
      }
    });

    socket.on('error', (err) => {
      fastify.log.error(`[WS] Error en socket: ${err.message}`);
      if (key) eliminar(key, socket);
    });
  });
}
