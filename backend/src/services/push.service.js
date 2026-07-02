// Envío de push notifications vía Expo Push Service.
// Las apps (Expo) registran su token con Notifications.getExpoPushTokenAsync()
// y el backend lo guarda en la columna FcmToken. No requiere firebase-admin.
// Docs: https://docs.expo.dev/push-notifications/sending-notifications/

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100; // límite de la API de Expo por request

function esTokenExpoValido(token) {
  return typeof token === 'string' && /^(ExponentPushToken|ExpoPushToken)\[.+\]$/.test(token);
}

/**
 * Envía la misma notificación a uno o varios tokens.
 * Nunca lanza: los errores de push no deben tumbar la operación que los dispara.
 * @param {string|string[]} tokens - Token(s) Expo (columna FcmToken)
 * @param {{title: string, body: string, data?: object}} mensaje
 * @param {object} [log] - logger de fastify (opcional)
 */
export async function enviarPush(tokens, { title, body, data = {} }, log = console) {
  try {
    const lista = (Array.isArray(tokens) ? tokens : [tokens]).filter(esTokenExpoValido);
    if (lista.length === 0) return { enviados: 0 };

    let enviados = 0;
    for (let i = 0; i < lista.length; i += CHUNK_SIZE) {
      const chunk = lista.slice(i, i + CHUNK_SIZE);
      const mensajes = chunk.map(to => ({
        to,
        title,
        body,
        data,
        sound: 'default',
        priority: 'high',
        channelId: 'default',
      }));

      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mensajes),
      });

      if (!res.ok) {
        log.warn?.(`[push] Expo respondió ${res.status}: ${await res.text().catch(() => '')}`);
        continue;
      }

      const json = await res.json().catch(() => null);
      for (const ticket of json?.data || []) {
        if (ticket.status === 'ok') enviados++;
        else log.warn?.(`[push] Ticket con error: ${ticket.message || ticket.details?.error || 'desconocido'}`);
      }
    }
    return { enviados };
  } catch (err) {
    log.warn?.(`[push] Error enviando notificaciones: ${err.message}`);
    return { enviados: 0, error: err.message };
  }
}
