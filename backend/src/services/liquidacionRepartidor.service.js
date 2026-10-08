const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const r4 = (n) => Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;

function leerSnapshot(valor) {
  if (!valor) return null;
  if (typeof valor === 'object') return valor;
  try { return JSON.parse(valor); } catch { throw Object.assign(new Error('El pago monetario del pedido está dañado'), { statusCode: 422 }); }
}

export function calcularCobroEfectivoRepartidor({ totalUSD, comisionUSD, pagoMonedaJSON }) {
  const total = r4(totalUSD);
  const comision = r4(comisionUSD);
  if (!Number.isFinite(total) || !Number.isFinite(comision) || total < 0 || comision < 0 || comision > total) {
    throw Object.assign(new Error('Importes inválidos para liquidar al repartidor'), { statusCode: 422 });
  }

  const pago = leerSnapshot(pagoMonedaJSON);
  const moneda = String(pago?.Moneda || 'USD').toUpperCase();
  if (moneda === 'VES') {
    const tasa = Number(pago?.TasaVESporUSD);
    const cobrado = Number(pago?.TotalOriginal ?? pago?.TotalVES);
    if (!Number.isFinite(tasa) || tasa <= 0 || !Number.isFinite(cobrado) || cobrado < 0) {
      throw Object.assign(new Error('El pedido VES no tiene una tasa histórica válida'), { statusCode: 422 });
    }
    const comisionOriginal = r2(comision * tasa);
    const rendirOriginal = r2(Math.max(0, cobrado - comisionOriginal));
    return {
      Version: 1, Moneda: 'VES', EfectivoCobradoOriginal: r2(cobrado),
      ComisionUSD: comision, ComisionOriginal: comisionOriginal,
      MontoARendirOriginal: rendirOriginal, MontoARendirUSD: r4(rendirOriginal / tasa),
      TasaVESporUSD: tasa, idTasa: pago.idTasa ?? null,
      FechaTasa: pago.FechaTasa ?? null, Fuente: pago.Fuente ?? null,
    };
  }
  if (moneda !== 'USD') throw Object.assign(new Error(`Moneda de efectivo no soportada: ${moneda}`), { statusCode: 422 });
  // Con IGTF el cliente paga venta + impuesto; el repartidor rinde ambos
  const cobrado = r2(pago?.TotalCobradoUSD ?? total);
  const rendir = r2(Math.max(0, cobrado - comision));
  return {
    Version: 1, Moneda: 'USD', EfectivoCobradoOriginal: cobrado,
    ...(pago?.IGTFUSD ? { IGTFUSD: r2(pago.IGTFUSD) } : {}),
    ComisionUSD: comision, ComisionOriginal: r2(comision),
    MontoARendirOriginal: rendir, MontoARendirUSD: rendir,
    TasaVESporUSD: pago?.TasaVESporUSD ?? null, idTasa: pago?.idTasa ?? null,
    FechaTasa: pago?.FechaTasa ?? null, Fuente: pago?.Fuente ?? null,
  };
}


// Lo que el repartidor debe cobrar en efectivo al entregar, en la moneda que
// el cliente eligió al pedir (snapshot congelado; mismas reglas que la
// liquidación de arriba). Pago Móvil y tarjeta ya están cobrados: no se pide
// efectivo. Un pedido legado sin snapshot se cobra en USD.
export function cobroAlCliente({ metodoPago, totalUSD, pagoMonedaJSON }) {
  const metodo = String(metodoPago || '').toUpperCase();
  const total = r2(totalUSD);
  if (metodo !== 'EFECTIVO') return { CobrarEfectivo: false, Metodo: metodo, Moneda: null, Monto: null, TotalUSD: total, TasaVESporUSD: null };
  const pago = leerSnapshot(pagoMonedaJSON);
  if (String(pago?.Moneda || 'USD').toUpperCase() === 'VES') {
    const monto = Number(pago?.TotalOriginal ?? pago?.TotalVES);
    const tasa = Number(pago?.TasaVESporUSD);
    if (!Number.isFinite(monto) || monto < 0) {
      throw Object.assign(new Error('El pedido VES no tiene un monto de cobro válido'), { statusCode: 422 });
    }
    return { CobrarEfectivo: true, Metodo: metodo, Moneda: 'VES', Monto: r2(monto), TotalUSD: total, TasaVESporUSD: Number.isFinite(tasa) && tasa > 0 ? tasa : null };
  }
  const igtf = r2(pago?.IGTFUSD || 0);
  return { CobrarEfectivo: true, Metodo: metodo, Moneda: 'USD', Monto: r2(total + igtf), TotalUSD: total, TasaVESporUSD: null,
    ...(igtf ? { IGTFUSD: igtf } : {}) };
}

// Versión para listas y avisos: un snapshot dañado no debe tumbar la lista
// completa; se marca para que el repartidor confirme el cobro con la tienda.
export function cobroSeguro(fila) {
  try { return cobroAlCliente(fila); }
  catch { return { CobrarEfectivo: true, Metodo: String(fila.metodoPago || '').toUpperCase(), Moneda: null, Monto: null, TotalUSD: r2(fila.totalUSD), TasaVESporUSD: null, Error: 'Confirma el monto con la tienda' }; }
}
