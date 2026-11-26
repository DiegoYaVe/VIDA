// Cómo se muestran las monedas en pantalla. Por dentro (BD, API, cálculos) el
// bolívar es "VES", su código oficial ISO 4217; la gente en la tienda lo
// conoce como "Bs", así que es lo que se muestra.
export const simbolo = (m) => (m === 'VES' ? 'Bs' : m);

export const NOMBRE_MONEDA = {
  USD: 'Dólares',
  VES: 'Bolívares',
  MIXTA: 'Mixto',
};

// 12.5 + 'VES' → "12.50 Bs"
export const conMoneda = (valor, m) => `${Number(valor || 0).toFixed(2)} ${simbolo(m)}`;
