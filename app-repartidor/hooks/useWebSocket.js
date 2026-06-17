import { useEffect, useRef } from 'react';
import { WS_URL } from '../constants/config';
import useAuthStore from '../store/authStore';

const BASE_DELAY = 1000;
const MAX_DELAY = 30000;

export function useWebSocket(onMessage) {
  const token = useAuthStore((s) => s.token);
  const wsRef = useRef(null);
  const timerRef = useRef(null);
  const attemptRef = useRef(0);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;

    if (!token) return;

    function connect() {
      if (unmountedRef.current) return;

      try {
        const ws = new WebSocket(`${WS_URL}?token=${token}`);
        wsRef.current = ws;

        ws.onopen = () => {
          attemptRef.current = 0;
        };

        ws.onmessage = (e) => {
          try {
            const parsed = JSON.parse(e.data);
            onMessage && onMessage(parsed);
          } catch (_) {
            // ignore malformed messages
          }
        };

        ws.onclose = () => {
          if (unmountedRef.current) return;
          scheduleReconnect();
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (e) {
        scheduleReconnect();
      }
    }

    function scheduleReconnect() {
      if (unmountedRef.current) return;
      const delay = Math.min(BASE_DELAY * Math.pow(2, attemptRef.current), MAX_DELAY);
      attemptRef.current += 1;
      timerRef.current = setTimeout(connect, delay);
    }

    connect();

    return () => {
      unmountedRef.current = true;
      clearTimeout(timerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [token]);
}
