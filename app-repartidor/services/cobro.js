// Qué debe cobrar el repartidor al entregar, a partir de pedido.Cobro (lo
// calcula el backend con el snapshot de moneda congelado al pedir). Si un
// backend anterior no lo envía, se conserva el comportamiento previo (USD).

export const fmtUSD = (n) => `$${Number(n || 0).toFixed(2)}`;
export const fmtVES = (n) =>
  `Bs ${Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const totalUSD = (p) => Number(p?.Cobro?.TotalUSD ?? p?.TotalUSD ?? p?.total ?? p?.Total ?? 0);

export function infoCobro(pedido) {
  const c = pedido?.Cobro;
  const metodo = String(c?.Metodo || pedido?.MetodoPago || pedido?.metodoPago || '').toUpperCase();

  if (metodo === 'PAGO_MOVIL') {
    return { cobrar: false, titulo: 'Pago Móvil · ya pagado', monto: null, detalle: 'No cobres efectivo al cliente' };
  }
  if (metodo !== 'EFECTIVO') {
    return { cobrar: false, titulo: 'Tarjeta', monto: null, detalle: 'No cobres efectivo al cliente' };
  }
  if (!c) return { cobrar: true, titulo: 'Efectivo', monto: fmtUSD(totalUSD(pedido)), detalle: null };
  if (c.Error || c.Monto == null) {
    return { cobrar: true, titulo: 'Efectivo', monto: null, detalle: c.Error || 'Confirma el monto con la tienda' };
  }
  if (c.Moneda === 'VES') {
    const tasa = c.TasaVESporUSD
      ? ` · tasa ${Number(c.TasaVESporUSD).toLocaleString('es-VE', { maximumFractionDigits: 2 })}`
      : '';
    return { cobrar: true, titulo: 'Efectivo en bolívares', monto: fmtVES(c.Monto), detalle: `Equivale a ${fmtUSD(c.TotalUSD)}${tasa}` };
  }
  // Tienda contribuyente especial: el cobro en dólares incluye el IGTF (3%)
  const detalle = c.IGTFUSD > 0 ? `Pedido ${fmtUSD(c.TotalUSD)} + IGTF ${fmtUSD(c.IGTFUSD)}` : null;
  return { cobrar: true, titulo: 'Efectivo en dólares', monto: fmtUSD(c.Monto), detalle };
}

// Efectivo que el repartidor cobró en un pedido entregado (historial), en su
// moneda física. Usa la liquidación guardada al entregar; sin ella, USD.
export function efectivoCobrado(item) {
  if (String(item?.MetodoPago || '').toUpperCase() !== 'EFECTIVO') return null;
  let liq = item?.LiquidacionRepartidorJSON;
  if (typeof liq === 'string') { try { liq = JSON.parse(liq); } catch { liq = null; } }
  if (liq?.Moneda === 'VES' && liq.EfectivoCobradoOriginal != null) return fmtVES(liq.EfectivoCobradoOriginal);
  return fmtUSD(liq?.EfectivoCobradoOriginal ?? item?.TotalUSD);
}
