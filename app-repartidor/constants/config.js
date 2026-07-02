// Configuración por entorno: definir EXPO_PUBLIC_API_URL y EXPO_PUBLIC_WS_URL
// en app-repartidor/.env (ver .env.example). Expo las inyecta automáticamente.
// El fallback apunta al backend local para desarrollo — NO sirve en un
// dispositivo físico: ahí usa la IP de tu máquina o un túnel en el .env.
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';
export const WS_URL  = process.env.EXPO_PUBLIC_WS_URL  || 'ws://localhost:3001/api/ws';

export const ID_BRANCH = parseInt(process.env.EXPO_PUBLIC_ID_BRANCH || '1', 10);
export const ID_CUENTA = parseInt(process.env.EXPO_PUBLIC_ID_CUENTA || '1', 10);
