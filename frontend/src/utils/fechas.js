// Día de negocio de Caracas (UTC−4 fijo, sin horario de verano), igual que el
// backend (services/fechas.service.js). No depende de la zona del navegador.
const OFFSET_CARACAS_MS = 4 * 60 * 60 * 1000;

// 'YYYY-MM-DD' de hoy en Caracas, o de hace/dentro de `dias` días.
export function hoyCaracas(dias = 0) {
  return new Date(Date.now() - OFFSET_CARACAS_MS + dias * 86400000).toISOString().slice(0, 10);
}
