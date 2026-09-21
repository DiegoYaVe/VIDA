import axios from 'axios';

// URL del API: configurable por entorno (frontend/.env → VITE_API_URL).
// Sin override, en produccion se usa /api del MISMO origen que sirve el panel:
// hereda su https, no hay mixed content y no hace falta tocar nada si cambia el
// dominio. En dev el panel corre en Vite (5173) y el backend en 3001, asi que
// ahi si hace falta la URL absoluta.
export const API_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');

// Base para construir URLs de assets (fotos de perfil, imagenes de producto,
// evidencias de entrega, video/PDF de Academia). Las rutas guardadas en BD son
// relativas ("/uploads/...") y se piden A TRAVES del API, no del origen pelado:
// en produccion el backend cuelga de /api y es el unico que sirve esos archivos.
export const API_ORIGIN = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

// ── Auto-refresh del access token en 401 ────────────────────────────────────
// El access token vive 15 min; recorrer un curso largo lo vence y una acción
// (ej. enviar un quiz) respondía 401 "Token inválido o expirado" perdiendo el
// trabajo. Este interceptor, ante un 401, refresca el token con el refresh de
// localStorage (`pos_refresh`) y REINTENTA la petición original una sola vez, de
// forma transparente. Varias peticiones concurrentes comparten un solo refresh.
const AUTH_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];
const esAuthPath = (url = '') => AUTH_PATHS.some(p => url.includes(p));

let refreshPromise = null;

async function refrescarToken() {
  const stored = localStorage.getItem('pos_refresh');
  if (!stored) throw new Error('sin refresh token');
  // axios "pelado" (no `api`) para que el 401 del propio refresh no reentre aquí.
  const res = await axios.post(`${API_URL}/auth/refresh`, { refreshToken: stored });
  const accessToken = res.data?.accessToken;
  if (!accessToken) throw new Error('refresh sin token');
  api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
  // Sincroniza el store (import dinámico para no crear ciclo con authStore).
  try { const { useAuthStore } = await import('../store/authStore.js'); useAuthStore.setState({ accessToken }); } catch { /* noop */ }
  return accessToken;
}

function refrescarUnaVez() {
  if (!refreshPromise) refreshPromise = refrescarToken().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    if (response?.status === 401 && config && !config._retry && !esAuthPath(config.url || '')) {
      config._retry = true;
      try {
        const token = await refrescarUnaVez();
        config.headers = config.headers || {};
        config.headers['Authorization'] = `Bearer ${token}`;
        return api(config); // reintenta la petición original con el token nuevo
      } catch {
        // El refresh también falló (refresh token vencido/inválido): cierra sesión.
        localStorage.removeItem('pos_refresh');
        delete api.defaults.headers.common['Authorization'];
        try { const { useAuthStore } = await import('../store/authStore.js'); useAuthStore.setState({ usuario: null, accessToken: null, pantallas: [] }); } catch { /* noop */ }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
