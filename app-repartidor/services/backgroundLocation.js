// Ubicación en segundo plano: el cliente sigue viendo al repartidor moverse
// aunque bloquee el teléfono o cambie de app. En Android corre como
// foreground service con notificación persistente (requisito del sistema).
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import api from './api';

const TASK = 'vida-ubicacion-background';

// La tarea DEBE definirse a nivel de módulo (se importa desde app/_layout.jsx)
TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error || !data) return;
  const loc = data.locations?.[data.locations.length - 1];
  if (!loc) return;
  try {
    await api.post('/delivery/repartidor/ubicacion', {
      Latitud: loc.coords.latitude,
      Longitud: loc.coords.longitude,
    });
  } catch {
    // sin red: el siguiente update lo intenta de nuevo
  }
});

export async function iniciarUbicacionBackground() {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;

    // Android 10+/iOS piden "Permitir siempre" en un flujo separado
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return false;

    const yaCorriendo = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
    if (yaCorriendo) return true;

    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 15000,      // cada 15s
      distanceInterval: 50,     // o cada 50m, lo que ocurra primero
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'VIDA Repartidor en línea',
        notificationBody: 'Compartiendo tu ubicación para las entregas',
        notificationColor: '#1A6A9A',
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function detenerUbicacionBackground() {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TASK)) {
      await Location.stopLocationUpdatesAsync(TASK);
    }
  } catch {}
}
