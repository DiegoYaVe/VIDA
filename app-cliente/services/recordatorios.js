// Recordatorio de hidratación: notificaciones locales cada 2 horas dentro de
// un horario (8:00–20:00 por defecto). Se programan para los próximos 7 días
// y se reprograman al abrir la app, al registrar un vaso o al cambiar la
// meta: si ya cumpliste la meta de hoy, no suenan más hoy. No necesitan
// internet ni el backend. En Expo Go no hay notificaciones (ver push.js).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getNotifications } from './push';

const CLAVE = 'vida_recordatorio_agua';
const PREFIJO = 'agua-';
const CANAL = 'hidratacion';
const DIAS = 7; // 7 × 7 avisos = 49, debajo del límite de 64 de iOS
export const DEFECTO = { activo: false, desde: 8, hasta: 20, cada: 2 };

const MENSAJES = [
  'Hora de un vaso de agua 💧',
  'Tu cuerpo te lo agradece: toma agua 💧',
  'Un vaso ahora y vas más cerca de tu meta',
  '¿Ya tomaste agua? Regístralo y sigue tu racha',
];

export async function leerPreferencia() {
  try { return { ...DEFECTO, ...JSON.parse((await AsyncStorage.getItem(CLAVE)) || '{}') }; } catch { return { ...DEFECTO }; }
}

// Fechas de los avisos (pura): cada `cada` horas entre `desde` y `hasta`, en
// los próximos `dias` días, solo futuras; hoy se omite si ya cumplió la meta.
export function planificar({ desde = 8, hasta = 20, cada = 2, ahora = new Date(), metaCumplidaHoy = false, dias = DIAS }) {
  const r = [];
  for (let d = 0; d < dias; d++) {
    if (d === 0 && metaCumplidaHoy) continue;
    for (let h = desde; h <= hasta; h += cada) {
      const f = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + d, h, 0, 0, 0);
      if (f > ahora) r.push(f);
    }
  }
  return r;
}

async function cancelarPropias(N) {
  const todas = await N.getAllScheduledNotificationsAsync();
  await Promise.all(todas.filter((n) => String(n.identifier).startsWith(PREFIJO))
    .map((n) => N.cancelScheduledNotificationAsync(n.identifier)));
}

// Reprograma según la preferencia y el programa de hidratación del backend
// (`activa` = programa activo). Nunca lanza.
export async function reprogramarRecordatorios({ activa = true, metaCumplidaHoy = false } = {}) {
  try {
    const N = await getNotifications();
    if (!N) return;
    const pref = await leerPreferencia();
    await cancelarPropias(N);
    if (!pref.activo || !activa) return;
    const { status } = await N.getPermissionsAsync();
    if (status !== 'granted') return;
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync(CANAL, { name: 'Recordatorio de agua', importance: N.AndroidImportance.DEFAULT });
    }
    const fechas = planificar({ ...pref, metaCumplidaHoy });
    await Promise.all(fechas.map((date, i) => N.scheduleNotificationAsync({
      identifier: `${PREFIJO}${date.getTime()}`,
      content: { title: 'Mi hidratación', body: MENSAJES[i % MENSAJES.length], data: { url: '/mi-consumo' } },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date, ...(Platform.OS === 'android' ? { channelId: CANAL } : {}) },
    })));
  } catch { /* un recordatorio no debe romper la app */ }
}

// Encender/apagar desde la app. Devuelve { ok, motivo }.
export async function activarRecordatorios(activo, estado) {
  const N = await getNotifications();
  if (!N) return { ok: false, motivo: 'Los recordatorios funcionan en la app instalada (no en Expo Go).' };
  if (activo) {
    let { status } = await N.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await N.requestPermissionsAsync());
    if (status !== 'granted') return { ok: false, motivo: 'Activa las notificaciones de VIDA en los ajustes de tu teléfono.' };
  }
  const pref = { ...(await leerPreferencia()), activo };
  try { await AsyncStorage.setItem(CLAVE, JSON.stringify(pref)); } catch { }
  await reprogramarRecordatorios(estado);
  return { ok: true };
}
