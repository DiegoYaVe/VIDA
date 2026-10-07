import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarRIF, formatearRIF, normalizarDocumentoReceptor, formatearDocumento,
  desglosarFactura, pagoEnDivisasUSD, repartir, pedidoFacturable, validarDatosFiscales,
} from '../src/domain/fiscal.mjs';

const PCT = { GENERAL: 16, REDUCIDA: 8, EXENTO: 0 };
const suma = (f) => Math.round((f.BaseGeneralVES + f.IVAGeneralVES + f.BaseReducidaVES + f.IVAReducidaVES + f.ExentoVES) * 100) / 100;

test('RIF: valida el dígito verificador (SENIAT, Banco de Venezuela)', () => {
  assert.equal(normalizarRIF('G-20000303-0'), 'G200003030');
  assert.equal(normalizarRIF(' j-00002961-0 '), 'J000029610');
  assert.equal(normalizarRIF('J-00002961-1'), null);
  assert.equal(normalizarRIF('J-2961-0'), null);
  assert.equal(formatearRIF('J000029610'), 'J-00002961-0');
});

test('documento del cliente: RIF o cédula', () => {
  assert.equal(normalizarDocumentoReceptor('v-12.345.678'), 'V12345678');
  assert.equal(normalizarDocumentoReceptor('E 1234567'), 'E1234567');
  assert.equal(normalizarDocumentoReceptor('G-20000303-0'), 'G200003030');
  assert.equal(formatearDocumento('V12345678'), 'V-12345678');
  assert.equal(formatearDocumento('G200003030'), 'G-20000303-0');
  for (const d of ['J-00002961-1', 'X123', '', 'J12345678']) assert.throws(() => normalizarDocumentoReceptor(d));
});

test('precio con IVA: desglosa base e IVA hacia atrás', () => {
  const f = desglosarFactura({ lineas: [{ idProducto: 1, Descripcion: 'Agua', Cantidad: 2, PrecioUnitarioUSD: 5.8, Alicuota: 'GENERAL' }],
    totalUSD: 11.6, tasa: 40, porcentajes: PCT });
  assert.equal(f.TotalVES, 464);
  assert.equal(f.BaseGeneralVES, 400);
  assert.equal(f.IVAGeneralVES, 64);
  assert.equal(f.DescuentoVES, 0);
  assert.equal(f.lineas[0].PrecioUnitarioVES, 232);
  assert.equal(f.TotalPagarVES, 464);
});

test('varias alícuotas: general, reducida y exento', () => {
  const lineas = [
    { idProducto: 1, Cantidad: 1, PrecioUnitarioUSD: 11.6, Alicuota: 'GENERAL' },
    { idProducto: 2, Cantidad: 1, PrecioUnitarioUSD: 10.8, Alicuota: 'REDUCIDA' },
    { idProducto: 3, Cantidad: 1, PrecioUnitarioUSD: 5, Alicuota: 'EXENTO' },
  ];
  const f = desglosarFactura({ lineas, totalUSD: 27.4, tasa: 10, porcentajes: PCT });
  assert.deepEqual([f.BaseGeneralVES, f.IVAGeneralVES, f.BaseReducidaVES, f.IVAReducidaVES, f.ExentoVES], [100, 16, 100, 8, 50]);
  assert.equal(suma(f), f.TotalVES);
});

test('descuento (cupón / puntos) reduce la base de cada alícuota en proporción', () => {
  const lineas = [
    { idProducto: 1, Cantidad: 1, PrecioUnitarioUSD: 11.6, Alicuota: 'GENERAL' },
    { idProducto: 2, Cantidad: 1, PrecioUnitarioUSD: 10.8, Alicuota: 'REDUCIDA' },
    { idProducto: 3, Cantidad: 1, PrecioUnitarioUSD: 5, Alicuota: 'EXENTO' },
  ];
  const f = desglosarFactura({ lineas, totalUSD: 13.7, tasa: 10, porcentajes: PCT });
  assert.equal(f.SubtotalVES, 274);
  assert.equal(f.DescuentoVES, 137);
  assert.deepEqual([f.BaseGeneralVES, f.IVAGeneralVES, f.BaseReducidaVES, f.IVAReducidaVES, f.ExentoVES], [50, 8, 50, 4, 25]);
  assert.equal(suma(f), 137);
});

test('el total en Bs es exactamente lo cobrado: el redondeo por línea se absorbe', () => {
  const lineas = [1, 2, 3].map(id => ({ idProducto: id, Cantidad: 1, PrecioUnitarioUSD: 0.3333, Alicuota: 'GENERAL' }));
  const f = desglosarFactura({ lineas, totalUSD: 0.9999, tasa: 36.5, porcentajes: PCT });
  assert.equal(f.TotalVES, 36.5);
  assert.equal(f.SubtotalVES, 36.5);
  assert.equal(f.DescuentoVES, 0);
  assert.equal(Math.round(f.lineas.reduce((s, l) => s + l.TotalVES, 0) * 100) / 100, 36.5);
  assert.equal(suma(f), 36.5);
});

test('montos de alícuota con decimales siempre cuadran al céntimo', () => {
  for (const tasa of [36.47, 41.1234, 199.99]) {
    const lineas = [
      { idProducto: 1, Cantidad: 3, PrecioUnitarioUSD: 1.37, Alicuota: 'GENERAL' },
      { idProducto: 2, Cantidad: 0.75, PrecioUnitarioUSD: 4.99, Alicuota: 'REDUCIDA' },
      { idProducto: 3, Cantidad: 2, PrecioUnitarioUSD: 0.89, Alicuota: 'EXENTO' },
    ];
    const f = desglosarFactura({ lineas, totalUSD: 9.11, tasa, porcentajes: PCT });
    assert.equal(suma(f), f.TotalVES);
    assert.equal(Math.round((f.SubtotalVES - f.DescuentoVES) * 100) / 100, f.TotalVES);
  }
});

test('IGTF 3% sobre lo pagado en divisas, solo contribuyentes especiales', () => {
  const lineas = [{ idProducto: 1, Cantidad: 2, PrecioUnitarioUSD: 5.8, Alicuota: 'GENERAL' }];
  const f = desglosarFactura({ lineas, totalUSD: 11.6, tasa: 40, porcentajes: PCT, contribuyenteEspecial: true, divisasUSD: 10 });
  assert.equal(f.IGTFBaseVES, 400);
  assert.equal(f.IGTFVES, 12);
  assert.equal(f.TotalPagarVES, 476);
  const g = desglosarFactura({ lineas, totalUSD: 11.6, tasa: 40, porcentajes: PCT, contribuyenteEspecial: false, divisasUSD: 10 });
  assert.equal(g.IGTFVES, 0);
});

test('pago en divisas: USD, VES y mixto neto del cambio', () => {
  assert.equal(pagoEnDivisasUSD({ Moneda: 'USD', TotalOriginal: 11.6 }, 11.6), 11.6);
  assert.equal(pagoEnDivisasUSD({ Moneda: 'VES', TotalOriginal: 464 }, 11.6), 0);
  assert.equal(pagoEnDivisasUSD(JSON.stringify({ Moneda: 'MIXTA', Desglose: { USD: { Efectivo: 20, Tarjeta: 0, Cambio: 5 }, VES: {} } }), 30), 15);
  assert.equal(pagoEnDivisasUSD({ Moneda: 'MIXTA', Desglose: { USD: { Efectivo: 50, Tarjeta: 0, Cambio: 0 } } }, 30), 30);
  assert.equal(pagoEnDivisasUSD(null, 10), 0);
});

test('repartir no pierde céntimos', () => {
  assert.deepEqual(repartir(0.05, [1, 1, 1]).reduce((s, v) => s + Math.round(v * 100), 0), 5);
  assert.deepEqual(repartir(10, [0, 0]), [0, 0]);
});

test('rechaza totales mayores a los productos y alícuotas desconocidas', () => {
  const l = [{ idProducto: 1, Cantidad: 1, PrecioUnitarioUSD: 5, Alicuota: 'GENERAL' }];
  assert.throws(() => desglosarFactura({ lineas: l, totalUSD: 6, tasa: 40, porcentajes: PCT }));
  assert.throws(() => desglosarFactura({ lineas: [{ ...l[0], Alicuota: 'LUJO' }], totalUSD: 5, tasa: 40, porcentajes: PCT }));
  assert.throws(() => desglosarFactura({ lineas: l, totalUSD: 5, tasa: 0, porcentajes: PCT }));
});

test('pedido facturable: cobrado o entregado, nunca cancelado', () => {
  assert.equal(pedidoFacturable({ Status: 'ENTREGADO', StatusPago: 'PAGADO' }), null);
  assert.equal(pedidoFacturable({ Status: 'EN_CAMINO', StatusPago: 'PAGADO' }), null);
  assert.ok(pedidoFacturable({ Status: 'EN_CAMINO', StatusPago: 'PENDIENTE' }));
  assert.ok(pedidoFacturable({ Status: 'CANCELADO', StatusPago: 'PAGADO' }));
});

test('datos fiscales: para facturar exige RIF válido, razón social y domicilio', () => {
  assert.doesNotThrow(() => validarDatosFiscales({ ModalidadFiscal: 'NINGUNA' }));
  assert.throws(() => validarDatosFiscales({ ModalidadFiscal: 'IMPRENTA_DIGITAL', RIF: 'J-00002961-0', RazonSocial: 'X' }));
  assert.throws(() => validarDatosFiscales({ ModalidadFiscal: 'NINGUNA', RIF: 'J-00002961-9' }));
  assert.throws(() => validarDatosFiscales({ ModalidadFiscal: 'OTRA' }));
  const d = validarDatosFiscales({ ModalidadFiscal: 'MAQUINA_FISCAL', RIF: 'j-00002961-0', RazonSocial: ' VIDA C.A. ', DomicilioFiscal: 'Av. 1', ContribuyenteEspecial: 1 });
  assert.deepEqual(d, { RIF: 'J000029610', RazonSocial: 'VIDA C.A.', DomicilioFiscal: 'Av. 1', ModalidadFiscal: 'MAQUINA_FISCAL', ContribuyenteEspecial: true });
});

import { filasLibroVentas, formatearDocumento as docFront } from '../../frontend/src/utils/libroVentas.mjs';
test('libro de ventas: las notas de crédito restan y los totales cuadran', () => {
  const base = { FechaFiscal: '2026-10-07', idPuntoVenta: 12, NombreTienda: 'Maturín', ReceptorDocumento: 'J000029610',
    ReceptorNombre: 'Cliente', TotalVES: 116, ExentoVES: 0, BaseGeneralVES: 100, PctGeneral: 16, IVAGeneralVES: 16,
    BaseReducidaVES: 0, PctReducida: 8, IVAReducidaVES: 0, IGTFVES: 3.48, TotalUSD: 2.9 };
  const { filas, totales } = filasLibroVentas([
    { ...base, TipoDocumento: 'FACTURA', Numero: 7, NumeroControl: '00-1' },
    { ...base, TipoDocumento: 'FACTURA', Numero: 8, NumeroControl: null },
    { ...base, TipoDocumento: 'NOTA_CREDITO', Numero: 1, NumeroControl: '00-2', NumeroAfectada: 7 },
  ]);
  assert.equal(filas[0][6], '00000007');
  assert.equal(filas[1][7], 'PENDIENTE');
  assert.equal(filas[2][5], 'NC');
  assert.equal(filas[2][8], '00000007');
  assert.equal(filas[2][9], -116);
  assert.equal(totales[9], 116);
  assert.equal(totales[13], 16);
  assert.equal(totales[17], 3.48);
  assert.equal(docFront('J000029610'), 'J-00002961-0');
  assert.equal(docFront('V12345678'), 'V-12345678');
});

import { calcularDevolucion, calcularNotaCredito } from '../src/domain/fiscal.mjs';
const lineasPed = [
  { idDetalle: 1, idProducto: 10, Cantidad: 2, PrecioUnitario: 5 },
  { idDetalle: 2, idProducto: 20, Cantidad: 1, PrecioUnitario: 10 },
];
test('devolución: aplica el descuento en proporción y la última cierra al total', () => {
  const a = calcularDevolucion({ lineas: lineasPed, totalUSD: 15, devolver: [{ idDetalle: 1, Cantidad: 1 }] });
  assert.equal(a.MontoUSD, 3.75); // 5 × 15/20
  assert.equal(a.final, false);
  const b = calcularDevolucion({ lineas: lineasPed, totalUSD: 15, devolver: [{ idDetalle: 1, Cantidad: 1 }, { idDetalle: 2, Cantidad: 1 }],
    previo: { 1: 1 }, montoPrevioUSD: 3.75 });
  assert.equal(b.final, true);
  assert.equal(b.MontoUSD, 11.25);
  assert.throws(() => calcularDevolucion({ lineas: lineasPed, totalUSD: 15, devolver: [{ idDetalle: 1, Cantidad: 2 }], previo: { 1: 1 } }));
  assert.throws(() => calcularDevolucion({ lineas: lineasPed, totalUSD: 15, devolver: [{ idDetalle: 9, Cantidad: 1 }] }));
  assert.throws(() => calcularDevolucion({ lineas: lineasPed, totalUSD: 15, devolver: [] }));
});

test('nota de crédito parcial y luego la restante: suman exactamente la factura', () => {
  const lineas = [
    { idProducto: 1, Cantidad: 3, PrecioUnitarioUSD: 1.37, Alicuota: 'GENERAL' },
    { idProducto: 2, Cantidad: 2, PrecioUnitarioUSD: 4.99, Alicuota: 'REDUCIDA' },
    { idProducto: 3, Cantidad: 1, PrecioUnitarioUSD: 0.89, Alicuota: 'EXENTO' },
  ];
  const f = desglosarFactura({ lineas, totalUSD: 13.5, tasa: 41.1234, porcentajes: PCT, contribuyenteEspecial: true, divisasUSD: 5 });
  const fl = f.lineas;
  const nc1 = calcularNotaCredito({ orig: f, lineas: fl, devolver: [{ Linea: 1, Cantidad: 1 }, { Linea: 2, Cantidad: 2 }] });
  assert.equal(nc1.final, false);
  assert.equal(nc1.lineas.length, 2);
  assert.equal(nc1.lineas[0].LineaAfectada, 1);
  assert.equal(suma(nc1), nc1.TotalVES);
  const previoLineas = Object.fromEntries(nc1.lineas.map(l => [l.LineaAfectada, { Cantidad: l.Cantidad, TotalVES: l.TotalVES }]));
  const nc2 = calcularNotaCredito({ orig: f, lineas: fl, devolver: [], previas: [nc1], previoLineas });
  assert.equal(nc2.final, true);
  for (const c of ['TotalVES', 'BaseGeneralVES', 'IVAGeneralVES', 'BaseReducidaVES', 'IVAReducidaVES', 'ExentoVES', 'IGTFVES', 'TotalUSD'])
    assert.equal(Math.round((nc1[c] + nc2[c]) * 100) / 100, f[c], c);
  assert.deepEqual(nc2.lineas.map(l => [l.LineaAfectada, l.Cantidad]), [[1, 2], [3, 1]]);
  const todo = Object.fromEntries(fl.map(l => [l.Linea, { Cantidad: l.Cantidad, TotalVES: l.TotalVES }]));
  assert.throws(() => calcularNotaCredito({ orig: f, lineas: fl, devolver: [], previas: [f], previoLineas: todo }));
  assert.throws(() => calcularNotaCredito({ orig: f, lineas: fl, devolver: [{ Linea: 1, Cantidad: 4 }] }));
});

test('nota de crédito total de una sola vez = la factura', () => {
  const f = desglosarFactura({ lineas: [{ idProducto: 1, Cantidad: 2, PrecioUnitarioUSD: 5.8, Alicuota: 'GENERAL' }], totalUSD: 11.6, tasa: 40, porcentajes: PCT });
  const nc = calcularNotaCredito({ orig: f, lineas: f.lineas, devolver: [] });
  assert.equal(nc.TotalVES, 464);
  assert.equal(nc.IVAGeneralVES, 64);
  assert.equal(nc.final, true);
});
