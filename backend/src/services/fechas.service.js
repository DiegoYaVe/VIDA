// src/services/fechas.service.js
// Convención de fechas del sistema:
//  - Todo INSTANTE se guarda en UTC: GETUTCDATE() en SQL, Date de JS en los
//    parámetros (el driver los envía en UTC). Nunca GETDATE(): es la hora
//    local del servidor de BD, que cambia según el hosting.
//  - El "día de negocio" (hoy, ventas del día, vigencias, vencimientos) es el
//    de Caracas: UTC−4 fijo, Venezuela no usa horario de verano.
import { fechaCaracas } from './tasaBcv.service.js';

export { fechaCaracas };

// Hoy en Caracas, como DATE de SQL.
export const SQL_HOY_CARACAS = 'CAST(DATEADD(HOUR,-4,GETUTCDATE()) AS DATE)';

// Día de Caracas de una columna de instante (UTC), para agrupar o filtrar por día.
export const sqlDiaCaracas = (col) => `CAST(DATEADD(HOUR,-4,${col}) AS DATE)`;

// 'YYYY-MM-DD' de una columna DATE (mssql la entrega a medianoche UTC) o de
// un texto que ya empieza con la fecha. null si no se puede leer.
export function fechaISO(v) {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

// Suma días a una fecha 'YYYY-MM-DD' (sin zonas horarias de por medio).
export function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Días entre dos fechas 'YYYY-MM-DD' (b − a).
export function diasEntre(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}
