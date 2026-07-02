// Registro y manejo de push notifications (Expo Push Service).
// El token se guarda en VIDA_REPARTIDORES.FcmToken vía PUT /delivery/repartidor/fcm.
// NOTA: las push remotas NO funcionan en Expo Go (SDK 53+) — se necesita un
// development build o build de producción (eas build).
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import api from './api';

// Cómo mostrar notificaciones cuando la app está en primer plano
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registrarPushToken() {
  try {
    if (!Device.isDevice) return null; // emuladores sin Google Play no soportan push

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Pedidos',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
      });
    }

    const { status: actual } = await Notifications.getPermissionsAsync();
    let status = actual;
    if (actual !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return null;

    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const token = tokenData?.data;
    if (!token) return null;

    await api.put('/delivery/repartidor/fcm', { FcmToken: token });
    return token;
  } catch (e) {
    console.warn('[push] No se pudo registrar el token:', e?.message);
    return null;
  }
}

// Listener de taps en notificaciones — retorna la función de cleanup
export function escucharTapsNotificacion(onTap) {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response?.notification?.request?.content?.data || {};
    try { onTap(data); } catch {}
  });
  return () => sub.remove();
}
