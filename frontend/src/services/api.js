import axios from 'axios';

// URL del API: configurable por entorno (frontend/.env → VITE_API_URL).
// Sin override, en produccion se usa /api del MISMO origen que sirve el panel:
// hereda su https, no hay mixed content y no hace falta tocar nada si cambia el
// dominio. En dev el panel corre en Vite (5173) y el backend en 3001, asi que
// ahi si hace falta la URL absoluta.
export const API_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');

// Base para construir URLs de assets (fotos de perfil, imagenes de producto,
// evidencias de entrega). Las rutas guardadas en BD son relativas
// ("/uploads/...") y se piden A TRAVES del API, no del origen pelado: en
// produccion el backend cuelga de /api y es el unico que sirve esos archivos.
export const API_ORIGIN = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

export default api;
