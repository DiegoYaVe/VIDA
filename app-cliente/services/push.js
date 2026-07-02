// Registro y manejo de push notifications (Expo Push Service).
// El token se guarda en VIDA_APP_CLIENTES.FcmToken vía PUT /delivery/cliente/fcm.
//
// IMPORTANTE: expo-notifications TRUENA al importarse en Expo Go (SDK 53+ quitó
// el soporte de push remotas), así que aquí se carga de forma diferida y solo
// en development/production builds. En Expo Go todo es no-op silencioso.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import api from './api';

const ES_EXPO_GO = Constants.executionEnvironment === 'storeClient';

let Notifications = null;
let handlerConfigurado = false;

async function getNotifications() {
  if (ES_EXPO_GO) return null;
  if (!Notifications) {
    Notifications = await import('expo-notifications');
    if (!handlerConfigurado) {
      handlerConfigurado = true;
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    }
  }
  return Notifications;
}

export async function registrarPushToken() {
  try {
    if (ES_EXPO_GO) {
      console.log('[push] Expo Go no soporta push remotas — se omite el registro');
      return null;
    }
    if (!Device.isDevice) return null; // emuladores sin Google Play no soportan push

    const N = await getNotifications();
    if (!N) return null;

    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('default', {
        name: 'Pedidos',
        importance: N.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
      });
    }

    const { status: actual } = await N.getPermissionsAsync();
    let status = actual;
    if (actual !== 'granted') {
      ({ status } = await N.requestPermissionsAsync());
    }
    if (status !== 'granted') return null;

    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    const tokenData = await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const token = tokenData?.data;
    if (!token) return null;

    await api.put('/delivery/cliente/fcm', { FcmToken: token });
    return token;
  } catch (e) {
    console.warn('[push] No se pudo registrar el token:', e?.message);
    return null;
  }
}

// Listener de taps en notificaciones — retorna la función de cleanup
export function escucharTapsNotificacion(onTap) {
  let sub = null;
  let activo = true;

  getNotifications().then((N) => {
    if (!N || !activo) return;
    sub = N.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data || {};
      try { onTap(data); } catch {}
    });
  }).catch(() => {});

  return () => { activo = false; try { sub?.remove(); } catch {} };
}
