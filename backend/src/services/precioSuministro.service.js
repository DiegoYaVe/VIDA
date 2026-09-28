export function precioSuministro(costo, precio, margen = 0) {
  const base = Number(costo ?? 0), pct = Number(margen);
  const valor = precio == null ? base * (1 + pct / 100) : Number(precio);
  if (![base, pct, valor].every(Number.isFinite) || base < 0 || pct < 0 || valor < 0)
    throw new Error('Costo, precio o margen de suministro inválidos');
  return Math.round(valor * 10000) / 10000;
}
