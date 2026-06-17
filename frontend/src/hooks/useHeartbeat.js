// src/hooks/useHeartbeat.js
// Envía un ping al servidor cada 60s mientras el POS está activo
// Solo lo usan los usuarios asignados a un punto de venta (CAJERO, SUPERVISOR, CASHIER)
import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore.js';
import api from '../services/api.js';

const INTERVALO = 60_000; // 60 segundos

export function useHeartbeat(activo = true) {
  const { usuario, accessToken } = useAuthStore();

  useEffect(() => {
    // Solo enviar si el usuario tiene un punto de venta asignado
    if (!activo || !accessToken || !usuario?.idPuntoVenta) return;

    const ping = () => {
      api.post('/heartbeat/ping').catch(() => {/* silencioso */});
    };

    // Ping inmediato al montar
    ping();

    // Ping periódico
    const t = setInterval(ping, INTERVALO);

    // Al desmontar (cerrar pestaña / navegar fuera del POS)
    return () => clearInterval(t);
  }, [activo, accessToken, usuario?.idPuntoVenta]);
}
