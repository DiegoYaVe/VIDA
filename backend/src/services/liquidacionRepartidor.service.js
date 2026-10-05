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
  const rendir = r2(Math.max(0, total - comision));
  return {
    Version: 1, Moneda: 'USD', EfectivoCobradoOriginal: r2(total),
    ComisionUSD: comision, ComisionOriginal: r2(comision),
    MontoARendirOriginal: rendir, MontoARendirUSD: rendir,
    TasaVESporUSD: pago?.TasaVESporUSD ?? null, idTasa: pago?.idTasa ?? null,
    FechaTasa: pago?.FechaTasa ?? null, Fuente: pago?.Fuente ?? null,
  };
}

