// Qué debe cobrar el repartidor al entregar, a partir de pedido.Cobro (lo
// calcula el backend con el snapshot de moneda congelado al pedir). Si un
// backend anterior no lo envía, se conserva el comportamiento previo (USD).

// Montos con coma decimal, como se escriben en Venezuela: $18,40 · Bs 6.434,16
export const fmtUSD = (n) =>
  `$${Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtVES = (n) =>
  `Bs ${Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const totalUSD = (p) => Number(p?.Cobro?.TotalUSD ?? p?.TotalUSD ?? p?.total ?? p?.Total ?? 0);

const tasaTxt = (c) => (c?.TasaVESporUSD
  ? ` · tasa ${Number(c.TasaVESporUSD).toLocaleString('es-VE', { maximumFractionDigits: 2 })}`
  : '');

// { cobrar: efectivo, tarjeta: con el punto de venta, etiqueta, monto,
//   detalle, cambio: lo que debe llevar el repartidor, corto: para la oferta }
export function infoCobro(pedido) {
  const c = pedido?.Cobro;
  const metodo = String(c?.Metodo || pedido?.MetodoPago || pedido?.metodoPago || '').toUpperCase();
  const base = { cobrar: false, tarjeta: false, monto: null, detalle: null, cambio: null };

  if (metodo === 'PAGO_MOVIL') {
    return { ...base, titulo: 'Pago Móvil · ya pagado', etiqueta: 'Pago Móvil · ya pagado', detalle: 'No cobres efectivo al cliente', corto: 'Pago Móvil' };
  }
  if (metodo === 'TARJETA') {
    // Se cobra con el punto de venta; sin monto (backend anterior) se confirma con la tienda
    const monto = c?.Monto == null ? null : c.Moneda === 'USD' ? `${fmtUSD(c.Monto)} USD` : fmtVES(c.Monto);
    return { ...base, tarjeta: true, titulo: 'Tarjeta', etiqueta: 'Cobra con el punto de venta', monto,
      detalle: c?.Moneda === 'VES' && c.TotalUSD != null ? `Equivale a ${fmtUSD(c.TotalUSD)}${tasaTxt(c)}` : null, corto: 'Tarjeta' };
  }
  if (metodo !== 'EFECTIVO') {
    return { ...base, titulo: 'Pago', etiqueta: 'Pago', detalle: 'Confirma el cobro con la tienda', corto: '—' };
  }
  const ef = { ...base, cobrar: true, titulo: 'Efectivo', etiqueta: 'Cobrar en efectivo', corto: 'Efectivo' };
  if (!c) return { ...ef, monto: fmtUSD(totalUSD(pedido)) };
  if (c.Error) return { ...ef, detalle: c.Error };

  // Combinado: una parte en dólares y el resto en bolívares
  if (c.Moneda === 'MIXTA') {
    const cambio = [Number(c.CambioUSD) > 0 && fmtUSD(c.CambioUSD), Number(c.CambioVES) > 0 && fmtVES(c.CambioVES)].filter(Boolean);
    return { ...ef, titulo: 'Efectivo combinado', corto: 'Efectivo $ + Bs',
      monto: `${fmtUSD(c.MontoUSD)} + ${fmtVES(c.MontoVES)}`,
      detalle: `Pedido ${fmtUSD(c.TotalUSD)}${Number(c.IGTFUSD) > 0 ? ` + IGTF ${fmtUSD(c.IGTFUSD)}` : ''}${tasaTxt(c)}`,
      cambio: cambio.length ? cambio.join(' y ') : null };
  }
  if (c.Monto == null) return { ...ef, detalle: 'Confirma el monto con la tienda' };
  if (c.Moneda === 'VES') {
    return { ...ef, titulo: 'Efectivo en bolívares', corto: 'Efectivo Bs', monto: fmtVES(c.Monto),
      detalle: `Equivale a ${fmtUSD(c.TotalUSD)}${tasaTxt(c)}`, cambio: Number(c.Cambio) > 0 ? fmtVES(c.Cambio) : null };
  }
  // Tienda contribuyente especial: el cobro en dólares incluye el IGTF (3%)
  return { ...ef, titulo: 'Efectivo en dólares', corto: 'Efectivo $', monto: `${fmtUSD(c.Monto)} USD`,
    detalle: c.IGTFUSD > 0 ? `Pedido ${fmtUSD(c.TotalUSD)} + IGTF ${fmtUSD(c.IGTFUSD)}` : null,
    cambio: Number(c.Cambio) > 0 ? fmtUSD(c.Cambio) : null };
}

// Efectivo que el repartidor cobró en un pedido entregado (historial), en su
// moneda física. Usa la liquidación guardada al entregar; sin ella, USD.
export function efectivoCobrado(item) {
  if (String(item?.MetodoPago || '').toUpperCase() !== 'EFECTIVO') return null;
  let liq = item?.LiquidacionRepartidorJSON;
  if (typeof liq === 'string') { try { liq = JSON.parse(liq); } catch { liq = null; } }
  if (liq?.Moneda === 'MIXTA') return `${fmtUSD(liq.EfectivoCobradoUSD)} + ${fmtVES(liq.EfectivoCobradoVES)}`;
  if (liq?.Moneda === 'VES' && liq.EfectivoCobradoOriginal != null) return fmtVES(liq.EfectivoCobradoOriginal);
  return fmtUSD(liq?.EfectivoCobradoOriginal ?? item?.TotalUSD);
}
