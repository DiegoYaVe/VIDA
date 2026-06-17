import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import api from '../services/api';

const MIN_DISTANCE_METERS = 50;
const SEND_INTERVAL_MS = 10000;

function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useLocation(activo) {
  const [ubicacion, setUbicacion] = useState(null);
  const [error, setError] = useState(null);
  const watchRef = useRef(null);
  const lastSentRef = useRef(null);
  const lastSentTimeRef = useRef(0);

  useEffect(() => {
    if (!activo) {
      if (watchRef.current) {
        watchRef.current.remove();
        watchRef.current = null;
      }
      return;
    }

    let cancelled = false;

    async function startWatch() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setError('Permiso de ubicación denegado');
          return;
        }

        watchRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000,
            distanceInterval: 10,
          },
          async (loc) => {
            if (cancelled) return;
            const { latitude, longitude } = loc.coords;
            setUbicacion({ Latitud: latitude, Longitud: longitude });

            const now = Date.now();
            const last = lastSentRef.current;
            const timeSinceLast = now - lastSentTimeRef.current;

            const shouldSend =
              timeSinceLast >= SEND_INTERVAL_MS &&
              (!last ||
                calcDistance(last.Latitud, last.Longitud, latitude, longitude) >= MIN_DISTANCE_METERS);

            if (shouldSend) {
              lastSentRef.current = { Latitud: latitude, Longitud: longitude };
              lastSentTimeRef.current = now;
              try {
                await api.post('/delivery/repartidor/ubicacion', {
                  Latitud: latitude,
                  Longitud: longitude,
                });
              } catch (_) {
                // non-blocking
              }
            }
          }
        );
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }

    startWatch();

    return () => {
      cancelled = true;
      if (watchRef.current) {
        watchRef.current.remove();
        watchRef.current = null;
      }
    };
  }, [activo]);

  return { ubicacion, error };
}
