// src/services/suscripcion.service.js
// Afiliación y mensualidad de las tiendas (tareas 14, 15 y 16; audios de Lila):
//   · al afiliarse, la tienda entra con un nivel (paquete) que define su kit,
//     su inscripción y su mantenimiento mensual (25, 30 o 75 según el nivel;
//     el nivel va por número de productos);
//   · cada mes nace el cargo de la mensualidad; si vence y pasa la tolerancia
//     sin pagar, la tienda queda suspendida y se le suma una multa de
//     reconexión; al registrar el pago se reactiva sola.
// Los cargos son cuentas por cobrar (VIDA_CUENTAS, CXC a la tienda): se pagan
// desde la pantalla Cuentas, igual que el reabasto.
// Reglas puras, sin BD, para poder probarlas solas.

export const ORIGEN = { INSCRIPCION: 'INSCRIPCION', MENSUALIDAD: 'MENSUALIDAD', MULTA: 'MULTA_RECONEXION' };

// Periodo AAAAMM (número) de una fecha en hora de Venezuela (UTC−4).
export function periodoDe(fecha = new Date()) {
  const d = new Date(fecha.getTime() - 4 * 3600 * 1000);
  return d.getUTCFullYear() * 100 + (d.getUTCMonth() + 1);
}
export const periodoSiguiente = (p) => (p % 100 === 12 ? (Math.floor(p / 100) + 1) * 100 + 1 : p + 1);
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombrePeriodo = (p) => `${MESES[(p % 100) - 1]} ${Math.floor(p / 100)}`;

// Fecha (AAAA-MM-DD) en que vence la mensualidad del periodo: el día
// configurado, o el último del mes si ese mes es más corto.
export function fechaVencimiento(periodo, dia) {
  const anio = Math.floor(periodo / 100), mes = periodo % 100;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const d = Math.min(Math.max(1, parseInt(dia) || 1), ultimo);
  return `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// idOrigen de cada cargo: identifica tienda y periodo para que generar dos
// veces no duplique (índice único Tipo + OrigenTipo + idOrigen en VIDA_CUENTAS).
export const origenPeriodo = (idPuntoVenta, periodo) => Number(idPuntoVenta) * 1_000_000 + periodo;
export const periodoDeOrigen = (idOrigen) => Number(idOrigen) % 1_000_000;

// Días entre dos fechas AAAA-MM-DD (b − a).
export function diasEntre(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
export const hoyVenezuela = (fecha = new Date()) => new Date(fecha.getTime() - 4 * 3600 * 1000).toISOString().slice(0, 10);

// Periodos a cobrar: desde el mes siguiente a la afiliación (la inscripción
// cubre el mes en curso) hasta el actual.
export function periodosACobrar(fechaAfiliacion, hoy = new Date()) {
  if (!fechaAfiliacion) return [];
  const desde = periodoSiguiente(periodoDe(new Date(fechaAfiliacion)));
  const hasta = periodoDe(hoy);
  const out = [];
  for (let p = desde; p <= hasta && out.length < 24; p = periodoSiguiente(p)) out.push(p);
  return out;
}

// Estado de la tienda según sus cargos de suscripción con saldo.
// deudas: [{ OrigenTipo, FechaVencimiento: 'AAAA-MM-DD', Saldo }]
//   SIN_PLAN    · no tiene nivel asignado: no se le cobra ni se le corta
//   AL_DIA      · sin saldo
//   POR_VENCER  · debe algo que vence en los próximos 5 días
//   VENCIDA     · venció, pero está dentro de la tolerancia (o el corte está apagado)
//   SUSPENDIDA  · pasó la tolerancia con el corte encendido: no puede operar
export function estadoSuscripcion({ tieneNivel, deudas = [], hoy, toleranciaDias = 5, corteActivo = false }) {
  const pendientes = deudas.filter(d => Number(d.Saldo) > 0.004);
  const deudaUSD = Math.round(pendientes.reduce((s, d) => s + Number(d.Saldo), 0) * 100) / 100;
  const fechas = pendientes.map(d => String(d.FechaVencimiento).slice(0, 10)).filter(Boolean).sort();
  const masVieja = fechas[0] || null;
  const atraso = masVieja ? diasEntre(masVieja, hoy) : null;   // > 0: vencida hace N días
  const tol = Math.max(0, parseInt(toleranciaDias) || 0);
  let estado;
  if (!tieneNivel && !pendientes.length) estado = 'SIN_PLAN';
  else if (!pendientes.length) estado = 'AL_DIA';
  else if (atraso > tol && corteActivo) estado = 'SUSPENDIDA';
  else if (atraso > 0) estado = 'VENCIDA';
  else if (atraso >= -5) estado = 'POR_VENCER';
  else estado = 'AL_DIA';
  return {
    estado, deudaUSD, vencimiento: masVieja,
    // Días que le quedan antes del corte (solo si ya venció y aún no lo cortan)
    diasParaCorte: estado === 'VENCIDA' && corteActivo ? tol - atraso + 1 : null,
  };
}

// Mensualidades que ya pasaron la tolerancia sin pagarse: cada una genera su
// multa de reconexión (una sola vez por mensualidad).
export function mensualidadesParaMulta(deudas, hoy, toleranciaDias) {
  const tol = Math.max(0, parseInt(toleranciaDias) || 0);
  return deudas.filter(d => d.OrigenTipo === ORIGEN.MENSUALIDAD && Number(d.Saldo) > 0.004
    && diasEntre(String(d.FechaVencimiento).slice(0, 10), hoy) > tol);
}

// Nivel sugerido por número de productos: el primero (de menor a mayor) cuyo
// tope alcance; sin tope = sin límite.
export function nivelSugerido(niveles, nProductos) {
  const activos = (niveles || []).filter(n => n.Status !== 'INACTIVO')
    .sort((a, b) => (a.MaxProductos ?? Infinity) - (b.MaxProductos ?? Infinity) || Number(a.Orden ?? 0) - Number(b.Orden ?? 0));
  return activos.find(n => n.MaxProductos == null || Number(nProductos) <= Number(n.MaxProductos)) || null;
}
