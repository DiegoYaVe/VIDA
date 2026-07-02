import axios from 'axios';

// URL del API: configurable por entorno (frontend/.env → VITE_API_URL)
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Origen del servidor (sin /api) — para construir URLs de assets como fotos de perfil
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, '');

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

export default api;
