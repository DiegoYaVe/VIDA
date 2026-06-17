// src/hooks/useWebSocket.js
import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/authStore.js';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/api/ws';
const PING_INTERVAL  = 25_000; // cada 25s para mantener viva la conexión
const RECONNECT_BASE = 2_000;  // backoff base: 2s
const RECONNECT_MAX  = 30_000; // máximo 30s entre reintentos

/**
 * Hook para conectarse al WebSocket del servidor y escuchar eventos.
 *
 * @param {function} onMensaje  - callback(mensaje) que se llama con cada evento recibido
 * @param {boolean}  activo     - si false, no conecta (útil para páginas que no lo necesitan)
 */
export function useWebSocket(onMensaje, activo = true) {
  const { accessToken } = useAuthStore();
  const wsRef       = useRef(null);
  const pingRef     = useRef(null);
  const retryRef    = useRef(null);
  const intentosRef = useRef(0);
  const onMsjRef    = useRef(onMensaje);

  // Mantener la referencia del callback actualizada sin reconectar
  useEffect(() => { onMsjRef.current = onMensaje; }, [onMensaje]);

  const conectar = useCallback(() => {
    if (!accessToken || !activo) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const url = `${WS_URL}?token=${accessToken}`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      intentosRef.current = 0;
      // Ping periódico
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ tipo: 'ping' }));
        }
      }, PING_INTERVAL);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.tipo === 'pong' || msg.tipo === 'conectado') return; // internos
        onMsjRef.current?.(msg);
      } catch { /* ignorar */ }
    };

    ws.onclose = (e) => {
      clearInterval(pingRef.current);
      if (!activo) return;
      // Reconexión con backoff exponencial (no reconectar si el token es inválido 1008)
      if (e.code === 1008) return;
      intentosRef.current++;
      const delay = Math.min(RECONNECT_BASE * 2 ** (intentosRef.current - 1), RECONNECT_MAX);
      retryRef.current = setTimeout(conectar, delay);
    };

    ws.onerror = () => { ws.close(); };
  }, [accessToken, activo]);

  useEffect(() => {
    conectar();
    return () => {
      activo && wsRef.current?.close();
      clearInterval(pingRef.current);
      clearTimeout(retryRef.current);
    };
  }, [conectar, activo]);
}
