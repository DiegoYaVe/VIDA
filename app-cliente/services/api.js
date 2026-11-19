import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../constants/config';
import useAuthStore from '../store/authStore';

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem('vida_cliente_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (e) {
      // ignore
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Errores: el mensaje del servidor queda en error.message y la respuesta
// original en error.response (las pantallas leen error.response.data.error).
// Si el servidor dice que la sesión se cerró (contraseña cambiada en otro
// teléfono o cuenta inactiva), se cierra la sesión local.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const data = error?.response?.data;
    if (error?.response?.status === 401 && data?.sesionCerrada && error?.config?.headers?.Authorization) {
      AsyncStorage.removeItem('vida_cliente_token').catch(() => {});
      useAuthStore.getState().logout();
    }
    // Sin respuesta del servidor axios solo dice "Network Error" o "timeout of
    // 15000ms exceeded": se cambia por un mensaje que la persona entienda.
    const sinRespuesta = !error?.response;
    const msg = sinRespuesta
      ? (error?.code === 'ECONNABORTED'
          ? 'El servidor tardó demasiado en responder. Intenta de nuevo en un momento.'
          : 'No pudimos conectar con VIDA. Revisa tu conexión a internet e intenta de nuevo.')
      : (data?.message || data?.error || (error?.response?.status >= 500
          ? 'Tuvimos un problema en el servidor. Intenta de nuevo en un momento.'
          : error?.message) || 'Algo salió mal. Intenta de nuevo.');
    const err = new Error(msg);
    err.response = error?.response;
    err.config = error?.config;
    return Promise.reject(err);
  }
);

export default api;
