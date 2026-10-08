// Configuración por entorno: definir EXPO_PUBLIC_API_URL y EXPO_PUBLIC_WS_URL
// en app-cliente/.env (ver .env.example). Expo las inyecta automáticamente.
// El fallback apunta al backend local para desarrollo — NO sirve en un
// dispositivo físico: ahí usa la IP de tu máquina o un túnel en el .env.
import Constants from 'expo-constants';

// En desarrollo, si la URL apunta a una IP local (o localhost), se usa la IP
// con la que Metro sirve la app: el teléfono ya llega a esa máquina, y así no
// hay que editar el .env cada vez que el router le cambia la IP a la PC.
// Túneles (ngrok) y dominios de producción se respetan tal cual.
const IP_LOCAL = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;
function conHostDeMetro(url) {
  if (!__DEV__ || !url) return url;
  const hostMetro = (Constants.expoConfig?.hostUri || '').split(':')[0];
  if (!IP_LOCAL.test(hostMetro)) return url;
  return url.replace(/^(\w+:\/\/)([^/:]+)/, (todo, proto, host) => (IP_LOCAL.test(host) ? proto + hostMetro : todo));
}

export const API_URL = conHostDeMetro(process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api');
export const WS_URL  = conHostDeMetro(process.env.EXPO_PUBLIC_WS_URL  || 'ws://localhost:3001/api/ws');

export const ID_BRANCH = parseInt(process.env.EXPO_PUBLIC_ID_BRANCH || '1', 10);
export const ID_CUENTA = parseInt(process.env.EXPO_PUBLIC_ID_CUENTA || '1', 10);

// Base para construir URLs de imágenes subidas. Las rutas guardadas en BD son
// relativas ("/uploads/...") y se piden a través del API, no del origen pelado:
// en producción el backend cuelga de /api y es el único que sirve los archivos.
export const API_ORIGIN = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;

// Convierte rutas relativas del backend (/uploads/...) en URL absoluta
export const absImg = (ruta) =>
  !ruta ? null : (String(ruta).startsWith('http') ? ruta : API_ORIGIN + ruta);

// Google OAuth — crea un Web Client ID en console.cloud.google.com
// OAuth 2.0 > Web > Authorized redirect URIs: https://auth.expo.io/@<tu-usuario>/vida-cliente
// (Client ID es un identificador público, no un secreto)
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  || '519799220858-b6343va28ho5bhuqonhtevein9d3hamc.apps.googleusercontent.com';
