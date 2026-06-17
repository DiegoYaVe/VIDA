// src/ws/ws.manager.js
// Gestiona todas las conexiones WebSocket activas agrupadas por idBranch+idCuenta

const clientes = new Map(); // clave: "idBranch_idCuenta" → Set<WebSocket>

/**
 * Registra una nueva conexión.
 * @param {string} key   - "idBranch_idCuenta"
 * @param {object} ws    - socket de @fastify/websocket
 */
export function registrar(key, ws) {
  if (!clientes.has(key)) clientes.set(key, new Set());
  clientes.get(key).add(ws);
}

/**
 * Elimina una conexión al cerrar.
 */
export function eliminar(key, ws) {
  const set = clientes.get(key);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) clientes.delete(key);
}

/**
 * Envía un mensaje a todos los clientes de una cuenta.
 * @param {number|string} idBranch
 * @param {number|string} idCuenta
 * @param {object} mensaje   - objeto que se serializa a JSON
 */
export function broadcast(idBranch, idCuenta, mensaje) {
  const key = `${idBranch}_${idCuenta}`;
  const set = clientes.get(key);
  if (!set || set.size === 0) return;

  const payload = JSON.stringify(mensaje);
  for (const ws of set) {
    try {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(payload);
      }
    } catch { /* ignorar sockets muertos */ }
  }
}

/** Devuelve cuántos clientes hay conectados (útil para debug). */
export function totalConectados() {
  let total = 0;
  for (const set of clientes.values()) total += set.size;
  return total;
}
