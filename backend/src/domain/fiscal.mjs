// Reglas fiscales venezolanas (SENIAT), sin acceso a BD: RIF, desglose de IVA
// a partir de precios que YA incluyen el IVA, descuentos e IGTF.
export const centavos = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const error = mensaje => { throw Object.assign(new Error(mensaje), { statusCode: 422 }); };

export const ALICUOTAS = ['GENERAL', 'REDUCIDA', 'EXENTO'];
export const MODALIDADES = ['NINGUNA', 'MAQUINA_FISCAL', 'IMPRENTA_DIGITAL'];
export const PCT_IGTF = 3;

// ── RIF ────────────────────────────────────────────────────────────────────
// Formato: letra (V, E, J, P, G, C) + 8 dígitos + dígito verificador
// (módulo 11, pesos 4 3 2 7 6 5 4 3 2 sobre el valor de la letra y los 8 dígitos).
const VALOR_LETRA = { V: 1, E: 2, J: 3, P: 4, G: 5, C: 3 };
const PESOS = [3, 2, 7, 6, 5, 4, 3, 2];

export function digitoRIF(letra, ocho) {
  const suma = VALOR_LETRA[letra] * 4 + [...ocho].reduce((s, d, i) => s + Number(d) * PESOS[i], 0);
  const dv = 11 - (suma % 11);
  return dv >= 10 ? 0 : dv;
}

const limpiar = v => String(v ?? '').toUpperCase().replace(/[\s.\-_/]/g, '');

// 'J-00002961-0', 'j000029610' → 'J000029610'; null si no es un RIF válido.
export function normalizarRIF(valor) {
  const m = /^([VEJPGC])(\d{9})$/.exec(limpiar(valor));
  if (!m) return null;
  const ocho = m[2].slice(0, 8);
  return digitoRIF(m[1], ocho) === Number(m[2][8]) ? m[1] + m[2] : null;
}

export function formatearRIF(rif) {
  const r = String(rif ?? '');
  return /^[VEJPGC]\d{9}$/.test(r) ? `${r[0]}-${r.slice(1, 9)}-${r[9]}` : r;
}

// Documento del comprador: RIF con dígito verificador o cédula de persona
// natural (V/E + hasta 8 dígitos, sin verificador).
export function normalizarDocumentoReceptor(valor) {
  const v = limpiar(valor);
  if (/^[VEJPGC]\d{9}$/.test(v)) {
    const rif = normalizarRIF(v);
    if (!rif) error('El RIF del cliente no es válido (revisa el dígito verificador)');
    return rif;
  }
  const m = /^([VE])0*(\d{5,8})$/.exec(v);
  if (m) return m[1] + m[2];
  error('Documento del cliente inválido: usa RIF (J-12345678-9) o cédula (V-12345678)');
}

export function formatearDocumento(doc) {
  const d = String(doc ?? '');
  return d.length === 10 ? formatearRIF(d) : d.replace(/^([VE])(\d+)$/, '$1-$2');
}

// ── Datos fiscales de la tienda (emisor) ───────────────────────────────────
export function validarDatosFiscales({ RIF, RazonSocial, DomicilioFiscal, ModalidadFiscal, ContribuyenteEspecial }) {
  const modalidad = ModalidadFiscal ?? 'NINGUNA';
  if (!MODALIDADES.includes(modalidad)) error('Modalidad fiscal inválida');
  const rif = RIF ? normalizarRIF(RIF) : null;
  if (RIF && !rif) error('El RIF no es válido (formato J-12345678-9 y dígito verificador)');
  const razon = String(RazonSocial ?? '').trim().slice(0, 200) || null;
  const domicilio = String(DomicilioFiscal ?? '').trim().slice(0, 500) || null;
  if (modalidad !== 'NINGUNA' && (!rif || !razon || !domicilio))
    error('Para facturar, la tienda necesita RIF, razón social y domicilio fiscal');
  return { RIF: rif, RazonSocial: razon, DomicilioFiscal: domicilio, ModalidadFiscal: modalidad,
           ContribuyenteEspecial: !!ContribuyenteEspecial };
}

// ¿Se puede facturar este pedido? Venta cobrada o entregada, no cancelada.
export function pedidoFacturable(p) {
  if (!p) return 'Pedido no encontrado';
  if (p.Status === 'CANCELADO') return 'El pedido está cancelado';
  if (p.Status !== 'ENTREGADO' && p.StatusPago !== 'PAGADO') return 'Solo se facturan ventas cobradas o entregadas';
  return null;
}

// ── IGTF ───────────────────────────────────────────────────────────────────
// Parte del pago hecha en divisas (USD), neta del cambio devuelto en USD.
// Solo la cobran los contribuyentes especiales (3%).
export function pagoEnDivisasUSD(pagoMoneda, totalUSD) {
  const p = typeof pagoMoneda === 'string' ? JSON.parse(pagoMoneda || 'null') : pagoMoneda;
  if (!p) return 0;
  // Venta cobrada con IGTF: el POS ya calculó la base (venta pagada en divisas)
  if (p.IGTFBaseUSD != null) return centavos(Math.min(Number(p.IGTFBaseUSD), Number(totalUSD)));
  let usd = 0;
  if (p.Moneda === 'USD') usd = Number(p.TotalOriginal ?? p.TotalUSD ?? totalUSD);
  else if (p.Moneda === 'MIXTA') {
    const d = p.Desglose?.USD || {};
    usd = Number(d.Efectivo || 0) + Number(d.Tarjeta || 0) - Number(d.Cambio || 0);
  }
  return centavos(Math.min(Math.max(0, usd), Number(totalUSD)));
}

// Reparte `monto` entre `pesos` en centavos, sin perder ni sobrar un céntimo
// (método del mayor residuo).
export function repartir(monto, pesos) {
  const totalCent = Math.round(monto * 100);
  const suma = pesos.reduce((s, p) => s + p, 0);
  if (!suma || !totalCent) return pesos.map(() => 0);
  const crudos = pesos.map(p => (totalCent * p) / suma);
  const base = crudos.map(Math.floor);
  let resto = totalCent - base.reduce((s, b) => s + b, 0);
  const orden = crudos.map((c, i) => [c - base[i], i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; resto > 0; k = (k + 1) % orden.length, resto--) base[orden[k][1]]++;
  return base.map(c => c / 100);
}

// ── Desglose de la factura ─────────────────────────────────────────────────
// lineas: [{ idProducto, Descripcion, Cantidad, PrecioUnitarioUSD, Alicuota }]
// totalUSD: lo cobrado (ya con descuentos de cupón / puntos aplicados).
// porcentajes: { GENERAL: 16, REDUCIDA: 8, EXENTO: 0 }
// El total en Bs es exactamente round(totalUSD × tasa), igual que lo cobrado.
export function desglosarFactura({ lineas, totalUSD, tasa, porcentajes, contribuyenteEspecial = false, divisasUSD = 0 }) {
  const tc = Number(tasa);
  if (!(tc > 0)) error('No hay tasa de cambio para la fecha de la venta');
  if (!lineas?.length) error('La venta no tiene productos');
  const pct = a => {
    const v = Number(porcentajes?.[a]);
    if (!ALICUOTAS.includes(a) || !Number.isFinite(v)) error(`Alícuota de IVA desconocida: ${a}`);
    return v;
  };

  const det = lineas.map((l, i) => {
    const cant = Number(l.Cantidad), precio = Number(l.PrecioUnitarioUSD);
    const alicuota = l.Alicuota || 'GENERAL';
    return {
      Linea: i + 1, idProducto: l.idProducto ?? null,
      Descripcion: String(l.Descripcion || `Producto #${l.idProducto}`).slice(0, 200),
      Cantidad: cant, PrecioUnitarioVES: centavos(precio * tc),
      Alicuota: alicuota, PorcentajeIVA: pct(alicuota),
      TotalVES: centavos(cant * precio * tc), _usd: cant * precio,
    };
  });

  const subtotalUSD = det.reduce((s, l) => s + l._usd, 0);
  const totalVES = centavos(Number(totalUSD) * tc);
  if (Number(totalUSD) < 0 || Number(totalUSD) > subtotalUSD + 0.01) error('El total no cuadra con los productos');
  let descuentoVES = 0;
  // Menos de medio centavo de diferencia es redondeo del total, no descuento
  if (subtotalUSD - Number(totalUSD) >= 0.005) {
    descuentoVES = centavos(det.reduce((s, l) => s + l.TotalVES, 0) - totalVES);
  } else {
    // Sin descuento: el redondeo por línea se absorbe en la línea mayor para que
    // la suma de líneas sea exactamente el total cobrado.
    const dif = centavos(totalVES - det.reduce((s, l) => s + l.TotalVES, 0));
    if (dif) {
      const mayor = det.reduce((m, l) => (l.TotalVES > m.TotalVES ? l : m), det[0]);
      mayor.TotalVES = centavos(mayor.TotalVES + dif);
    }
  }
  const subtotalVES = centavos(det.reduce((s, l) => s + l.TotalVES, 0));

  // Por alícuota: total con IVA, menos su parte proporcional del descuento
  const grupos = ALICUOTAS.map(a => ({ a, total: centavos(det.filter(l => l.Alicuota === a).reduce((s, l) => s + l.TotalVES, 0)) }));
  const descuentos = repartir(descuentoVES, grupos.map(g => g.total));
  const neto = Object.fromEntries(grupos.map((g, i) => [g.a, centavos(g.total - descuentos[i])]));
  const base = a => centavos(neto[a] / (1 + pct(a) / 100));

  const BaseGeneralVES = base('GENERAL'), BaseReducidaVES = base('REDUCIDA');
  const IGTFBaseVES = contribuyenteEspecial ? Math.min(totalVES, centavos(Number(divisasUSD) * tc)) : 0;
  const IGTFVES = centavos(IGTFBaseVES * PCT_IGTF / 100);

  return {
    lineas: det.map(({ _usd, ...l }) => l),
    SubtotalVES: subtotalVES, DescuentoVES: descuentoVES,
    PctGeneral: pct('GENERAL'), BaseGeneralVES, IVAGeneralVES: centavos(neto.GENERAL - BaseGeneralVES),
    PctReducida: pct('REDUCIDA'), BaseReducidaVES, IVAReducidaVES: centavos(neto.REDUCIDA - BaseReducidaVES),
    ExentoVES: neto.EXENTO,
    TotalVES: totalVES, IGTFBaseVES, IGTFVES, TotalPagarVES: centavos(totalVES + IGTFVES),
    TotalUSD: centavos(totalUSD), TasaVESporUSD: tc,
  };
}

// ── Devoluciones y notas de crédito parciales ──────────────────────────────
const EPS = 1e-9;

// Monto a devolver de una venta. lineas: detalle del pedido [{ idDetalle,
// idProducto, Cantidad, PrecioUnitario }]; devolver: [{ idDetalle, Cantidad }];
// previo: { [idDetalle]: cantidad ya devuelta }; montoPrevioUSD: ya reembolsado.
// El descuento del pedido (cupón / puntos) se aplica en proporción. La última
// devolución (todo lo que quedaba) cierra exactamente al total cobrado.
export function calcularDevolucion({ lineas, totalUSD, devolver, previo = {}, montoPrevioUSD = 0 }) {
  if (!devolver?.length) error('Indica qué productos se devuelven');
  const subtotal = lineas.reduce((s, l) => s + Number(l.Cantidad) * Number(l.PrecioUnitario), 0);
  const factor = subtotal > 0 ? Number(totalUSD) / subtotal : 0;
  const vistos = new Set();
  const det = devolver.map(d => {
    const l = lineas.find(x => String(x.idDetalle) === String(d.idDetalle));
    if (!l) error('Producto que no está en la venta');
    if (vistos.has(String(l.idDetalle))) error('Producto repetido en la devolución');
    vistos.add(String(l.idDetalle));
    const q = Number(d.Cantidad);
    const resta = Number(l.Cantidad) - Number(previo[l.idDetalle] || 0);
    if (!(q > 0) || q > resta + EPS) error(`Cantidad a devolver inválida (quedan ${resta} del producto #${l.idProducto})`);
    return { idDetalle: l.idDetalle, idProducto: l.idProducto, Cantidad: q, PrecioUnitarioUSD: Number(l.PrecioUnitario),
             MontoUSD: centavos(q * Number(l.PrecioUnitario) * factor) };
  });
  const final = lineas.every(l => {
    const q = det.find(d => String(d.idDetalle) === String(l.idDetalle))?.Cantidad || 0;
    return Number(l.Cantidad) - Number(previo[l.idDetalle] || 0) - q <= EPS;
  });
  let monto = centavos(det.reduce((s, d) => s + d.MontoUSD, 0));
  if (final) monto = centavos(Number(totalUSD) - Number(montoPrevioUSD));
  return { lineas: det, MontoUSD: Math.max(0, monto), final };
}

const CAMPOS_NC = ['SubtotalVES', 'DescuentoVES', 'BaseGeneralVES', 'IVAGeneralVES', 'BaseReducidaVES', 'IVAReducidaVES',
  'ExentoVES', 'TotalVES', 'IGTFBaseVES', 'IGTFVES', 'TotalPagarVES', 'TotalUSD'];

// Nota de crédito (total o parcial) sobre una factura.
// orig: cabecera; lineas: sus líneas; devolver: [{ Linea, Cantidad }] (vacío =
// todo lo que queda); previas: cabeceras de NC anteriores; previoLineas:
// { [Linea]: { Cantidad, TotalVES } } ya acreditado. La NC que acredita todo
// lo restante usa "original menos lo ya acreditado" para no perder céntimos.
export function calcularNotaCredito({ orig, lineas, devolver, previas = [], previoLineas = {} }) {
  const resta = l => Number(l.Cantidad) - Number(previoLineas[l.Linea]?.Cantidad || 0);
  const pedidas = devolver?.length ? devolver
    : lineas.filter(l => resta(l) > EPS).map(l => ({ Linea: l.Linea, Cantidad: resta(l) }));
  if (!pedidas.length) error('La factura ya fue acreditada por completo');
  const vistos = new Set();
  const det = pedidas.map(d => {
    const l = lineas.find(x => Number(x.Linea) === Number(d.Linea));
    if (!l) error('Línea que no está en la factura');
    if (vistos.has(Number(l.Linea))) error('Línea repetida en la nota de crédito');
    vistos.add(Number(l.Linea));
    const q = Number(d.Cantidad);
    if (!(q > 0) || q > resta(l) + EPS) error(`Cantidad inválida para "${l.Descripcion}" (quedan ${resta(l)})`);
    const ultima = resta(l) - q <= EPS;
    const total = ultima ? centavos(Number(l.TotalVES) - Number(previoLineas[l.Linea]?.TotalVES || 0))
                         : centavos(Number(l.TotalVES) * q / Number(l.Cantidad));
    return { ...l, Cantidad: q, TotalVES: total, LineaAfectada: Number(l.Linea) };
  });
  const final = lineas.every(l => resta(l) - (det.find(d => d.LineaAfectada === Number(l.Linea))?.Cantidad || 0) <= EPS);
  const lineasNC = det.map((l, i) => ({ ...l, Linea: i + 1 }));

  if (final) {
    const r = {};
    for (const c of CAMPOS_NC) r[c] = centavos(Number(orig[c]) - previas.reduce((s, p) => s + Number(p[c]), 0));
    return { ...r, PctGeneral: Number(orig.PctGeneral), PctReducida: Number(orig.PctReducida), lineas: lineasNC, final };
  }
  const SubtotalVES = centavos(det.reduce((s, l) => s + l.TotalVES, 0));
  const DescuentoVES = Number(orig.SubtotalVES) > 0 ? centavos(Number(orig.DescuentoVES) * SubtotalVES / Number(orig.SubtotalVES)) : 0;
  const TotalVES = centavos(SubtotalVES - DescuentoVES);
  const pct = { GENERAL: Number(orig.PctGeneral), REDUCIDA: Number(orig.PctReducida), EXENTO: 0 };
  const grupos = ALICUOTAS.map(a => centavos(det.filter(l => l.Alicuota === a).reduce((s, l) => s + l.TotalVES, 0)));
  const desc = repartir(DescuentoVES, grupos);
  const neto = Object.fromEntries(ALICUOTAS.map((a, i) => [a, centavos(grupos[i] - desc[i])]));
  const base = a => centavos(neto[a] / (1 + pct[a] / 100));
  const prop = c => (Number(orig.TotalVES) > 0 ? centavos(Number(orig[c]) * TotalVES / Number(orig.TotalVES)) : 0);
  const IGTFVES = prop('IGTFVES');
  return {
    SubtotalVES, DescuentoVES, TotalVES,
    PctGeneral: pct.GENERAL, BaseGeneralVES: base('GENERAL'), IVAGeneralVES: centavos(neto.GENERAL - base('GENERAL')),
    PctReducida: pct.REDUCIDA, BaseReducidaVES: base('REDUCIDA'), IVAReducidaVES: centavos(neto.REDUCIDA - base('REDUCIDA')),
    ExentoVES: neto.EXENTO, IGTFBaseVES: prop('IGTFBaseVES'), IGTFVES, TotalPagarVES: centavos(TotalVES + IGTFVES),
    TotalUSD: prop('TotalUSD'), lineas: lineasNC, final,
  };
}
