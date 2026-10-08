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
  // Combinado: rinde cada moneda aparte; la comisión sale primero de los
  // dólares y lo que falte, de los bolívares a la tasa del pedido
  if (moneda === 'MIXTA') {
    const tasa = Number(pago?.TasaVESporUSD);
    const usd = r2(pago?.Desglose?.USD?.Monto ?? 0), ves = r2(pago?.Desglose?.VES?.Monto ?? 0);
    if (!Number.isFinite(tasa) || tasa <= 0) throw Object.assign(new Error('El pedido combinado no tiene una tasa válida'), { statusCode: 422 });
    const rendirUSD = r2(Math.max(0, usd - comision));
    const restoUSD = Math.max(0, comision - usd);
    const rendirVES = r2(Math.max(0, ves - restoUSD * tasa));
    return {
      Version: 1, Moneda: 'MIXTA', EfectivoCobradoUSD: usd, EfectivoCobradoVES: ves,
      ...(pago?.IGTFUSD ? { IGTFUSD: r2(pago.IGTFUSD) } : {}),
      ComisionUSD: comision, MontoARendirUSDOriginal: rendirUSD, MontoARendirVESOriginal: rendirVES,
      MontoARendirUSD: r4(rendirUSD + rendirVES / tasa),
      TasaVESporUSD: tasa, idTasa: pago.idTasa ?? null, FechaTasa: pago.FechaTasa ?? null, Fuente: pago.Fuente ?? null,
    };
  }
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
  // Tarjeta: se cobra con el punto de venta al entregar (en bolívares)
  if (metodo === 'TARJETA') {
    let pago = null; try { pago = leerSnapshot(pagoMonedaJSON); } catch { pago = null; }
    const monto = Number(pago?.TotalOriginal ?? pago?.TotalVES);
    return { CobrarEfectivo: false, CobrarTarjeta: true, Metodo: metodo, Moneda: pago?.Moneda || null,
      Monto: Number.isFinite(monto) ? r2(monto) : null, TotalUSD: total, TasaVESporUSD: Number(pago?.TasaVESporUSD) || null };
  }
  if (metodo !== 'EFECTIVO') return { CobrarEfectivo: false, Metodo: metodo, Moneda: null, Monto: null, TotalUSD: total, TasaVESporUSD: null };
  const pago = leerSnapshot(pagoMonedaJSON);
  if (String(pago?.Moneda || '').toUpperCase() === 'MIXTA') {
    const d = pago.Desglose || {};
    const igtf = r2(pago?.IGTFUSD || 0);
    return { CobrarEfectivo: true, Metodo: metodo, Moneda: 'MIXTA', Monto: null, TotalUSD: total, TasaVESporUSD: Number(pago.TasaVESporUSD) || null,
      MontoUSD: r2(d.USD?.Monto ?? 0), MontoVES: r2(d.VES?.Monto ?? 0),
      CambioUSD: r2(d.USD?.Cambio ?? 0), CambioVES: r2(d.VES?.Cambio ?? 0),
      ...(igtf ? { IGTFUSD: igtf } : {}) };
  }
  // Cambio que debe llevar el repartidor (si el cliente avisó con qué paga)
  const cambio = Number(pago?.Cambio) > 0 ? { Cambio: r2(pago.Cambio), PagaCon: r2(pago.PagaCon) } : {};
  if (String(pago?.Moneda || 'USD').toUpperCase() === 'VES') {
    const monto = Number(pago?.TotalOriginal ?? pago?.TotalVES);
    const tasa = Number(pago?.TasaVESporUSD);
    if (!Number.isFinite(monto) || monto < 0) {
      throw Object.assign(new Error('El pedido VES no tiene un monto de cobro válido'), { statusCode: 422 });
    }
    return { CobrarEfectivo: true, Metodo: metodo, Moneda: 'VES', Monto: r2(monto), TotalUSD: total, TasaVESporUSD: Number.isFinite(tasa) && tasa > 0 ? tasa : null, ...cambio };
  }
  const igtf = r2(pago?.IGTFUSD || 0);
  return { CobrarEfectivo: true, Metodo: metodo, Moneda: 'USD', Monto: r2(total + igtf), TotalUSD: total, TasaVESporUSD: null,
    ...(igtf ? { IGTFUSD: igtf } : {}), ...cambio };
}

// Versión para listas y avisos: un snapshot dañado no debe tumbar la lista
// completa; se marca para que el repartidor confirme el cobro con la tienda.
export function cobroSeguro(fila) {
  try { return cobroAlCliente(fila); }
  catch { return { CobrarEfectivo: true, Metodo: String(fila.metodoPago || '').toUpperCase(), Moneda: null, Monto: null, TotalUSD: r2(fila.totalUSD), TasaVESporUSD: null, Error: 'Confirma el monto con la tienda' }; }
}
