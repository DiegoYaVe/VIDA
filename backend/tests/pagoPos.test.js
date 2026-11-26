import test from 'node:test';
import assert from 'node:assert/strict';
import {calcularPagoPos,validarVigenciaCotizacion} from '../src/services/pagoPos.service.js';
const tasa={VESporUSD:40,idTasa:1,FechaValor:'2026-09-28',Fuente:'prueba'};
test('efectivo USD conserva original, equivalencia y cambio',()=>{
 const p=calcularPagoPos(10,{Moneda:'USD',Metodo:'EFECTIVO',Efectivo:20,Tarjeta:0},tasa,'AMBAS');
 assert.equal(p.TotalVES,400);assert.equal(p.Cambio,10);assert.equal(p.EfectivoUSD-p.CambioUSD,10);
});
test('efectivo VES conserva cantidad recibida y equivalente USD',()=>{
 const p=calcularPagoPos(10,{Moneda:'VES',Metodo:'EFECTIVO',Efectivo:500,Tarjeta:0},tasa,'VES');
 assert.equal(p.TotalOriginal,400);assert.equal(p.Cambio,100);assert.equal(p.CambioUSD,2.5);
});
test('efectivo + tarjeta en VES',()=>{
 const p=calcularPagoPos(10,{Moneda:'VES',Metodo:'MIXTO',Efectivo:200,Tarjeta:200},tasa,'AMBAS');
 assert.equal(p.TarjetaUSD,5);assert.equal(p.Cambio,0);
});
test('no permite pago insuficiente, cambio de tarjeta o moneda deshabilitada',()=>{
 for(const p of [{Moneda:'VES',Metodo:'EFECTIVO',Efectivo:399,Tarjeta:0},{Moneda:'VES',Metodo:'TARJETA',Efectivo:0,Tarjeta:401},{Moneda:'EUR',Metodo:'EFECTIVO',Efectivo:400,Tarjeta:0}]) assert.throws(()=>calcularPagoPos(10,p,tasa,'AMBAS'));
 assert.throws(()=>calcularPagoPos(10,{Moneda:'USD',Metodo:'EFECTIVO',Efectivo:10,Tarjeta:0},tasa,'VES'));
});
test('rechaza importes negativos, infinitos y más de dos decimales',()=>{
 for(const Efectivo of [-1,Infinity,NaN,10.001]) assert.throws(()=>calcularPagoPos(10,{Moneda:'USD',Metodo:'EFECTIVO',Efectivo,Tarjeta:0},tasa,'USD'));
});
const c={idBranch:1,idCuenta:2,idUsuario:3,idPuntoVenta:4,EmitidaEn:'2026-09-28T12:00:00Z',ExpiraEn:'2026-09-29T03:59:59Z'};
test('sincronizar después conserva autorización válida al vender',()=>assert.doesNotThrow(()=>validarVigenciaCotizacion(c,c,'2026-09-28T13:00:00Z',new Date('2026-09-30T12:00:00Z'))));
test('rechaza otra tienda, usuario, cuenta y fecha fuera de vigencia',()=>{
 for(const k of ['idBranch','idCuenta','idUsuario','idPuntoVenta']) assert.throws(()=>validarVigenciaCotizacion(c,{...c,[k]:99},'2026-09-28T13:00:00Z'));
 for(const fecha of ['invalid','2026-09-28T11:59:59Z','2026-09-29T04:00:00Z']) assert.throws(()=>validarVigenciaCotizacion(c,c,fecha,new Date('2026-10-01')));
});

test('IGTF: pagando en dólares se suma 3% sobre la venta', () => {
  const p = calcularPagoPos(10, { Moneda: 'USD', Metodo: 'EFECTIVO', Efectivo: 20, Tarjeta: 0 }, tasa, 'AMBAS', true);
  assert.equal(p.TotalOriginal, 10.3);
  assert.equal(p.IGTFUSD, 0.3);
  assert.equal(p.IGTFBaseUSD, 10);
  assert.equal(p.Cambio, 9.7);
  assert.equal(p.TotalUSD, 10);
  assert.throws(() => calcularPagoPos(10, { Moneda: 'USD', Metodo: 'TARJETA', Efectivo: 0, Tarjeta: 10 }, tasa, 'AMBAS', true));
  assert.doesNotThrow(() => calcularPagoPos(10, { Moneda: 'USD', Metodo: 'TARJETA', Efectivo: 0, Tarjeta: 10.3 }, tasa, 'AMBAS', true));
});
test('IGTF: pagando en bolívares no se cobra', () => {
  const p = calcularPagoPos(10, { Moneda: 'VES', Metodo: 'EFECTIVO', Efectivo: 400, Tarjeta: 0 }, tasa, 'AMBAS', true);
  assert.equal(p.IGTFUSD, 0);
  assert.equal(p.TotalOriginal, 400);
});
test('IGTF en pago combinado: solo sobre la parte en dólares, neta del cambio', () => {
  // $5 + 200 Bs ($5): IGTF sobre $5 → falta 0.15; con 206 Bs alcanza
  assert.throws(() => calcularPagoPos(10, { Moneda: 'MIXTA', MonedaCambio: 'VES', Desglose: { USD: { Efectivo: 5, Tarjeta: 0 }, VES: { Efectivo: 200, Tarjeta: 0 } } }, tasa, 'AMBAS', true));
  const a = calcularPagoPos(10, { Moneda: 'MIXTA', MonedaCambio: 'VES', Desglose: { USD: { Efectivo: 5.15, Tarjeta: 0 }, VES: { Efectivo: 200, Tarjeta: 0 } } }, tasa, 'AMBAS', true);
  assert.equal(a.IGTFBaseUSD, 5);
  assert.equal(a.IGTFUSD, 0.15);
  assert.equal(a.TotalCobradoUSD, 10.15);
  // Paga $20 y 200 Bs, cambio en dólares: en divisas solo quedan $5.15 netos
  const b = calcularPagoPos(10, { Moneda: 'MIXTA', MonedaCambio: 'USD', Desglose: { USD: { Efectivo: 20, Tarjeta: 0 }, VES: { Efectivo: 200, Tarjeta: 0 } } }, tasa, 'AMBAS', true);
  assert.equal(b.IGTFBaseUSD, 5);
  assert.equal(b.Desglose.USD.Cambio, 14.85);
  // Sin IGTF, el combinado sigue igual que antes
  const c = calcularPagoPos(10, { Moneda: 'MIXTA', MonedaCambio: 'USD', Desglose: { USD: { Efectivo: 20, Tarjeta: 0 }, VES: { Efectivo: 200, Tarjeta: 0 } } }, tasa, 'AMBAS');
  assert.equal(c.Desglose.USD.Cambio, 15);
  assert.equal(c.IGTFUSD, undefined);
});

// ── Pagos electrónicos: Pago Móvil, transferencia, Biopago (Bs) y Zelle ($) ──
import {electronicosPorForma} from '../src/domain/pagoPos.mjs';
test('Pago Móvil en bolívares: importe exacto, sin cambio, con referencia', () => {
  const p = calcularPagoPos(10, { Moneda: 'VES', Metodo: 'PAGO_MOVIL', Efectivo: 0, Tarjeta: 0, Referencia: ' 012345 ' }, tasa, 'AMBAS');
  assert.equal(p.Metodo, 'PAGO_MOVIL');
  assert.equal(p.Electronico, 400);
  assert.equal(p.ElectronicoUSD, 10);
  assert.equal(p.Referencia, '012345');
  assert.equal(p.EfectivoUSD + p.TarjetaUSD + p.CambioUSD, 0);
});
test('Biopago y transferencia van en bolívares; Zelle en dólares', () => {
  assert.equal(calcularPagoPos(10, { Moneda: 'VES', Metodo: 'BIOPAGO', Efectivo: 0, Tarjeta: 0, Referencia: '98765' }, tasa, 'AMBAS').Forma, 'BIOPAGO');
  assert.equal(calcularPagoPos(10, { Moneda: 'USD', Metodo: 'ZELLE', Efectivo: 0, Tarjeta: 0, Referencia: 'ZL-1234' }, tasa, 'AMBAS').Electronico, 10);
  assert.throws(() => calcularPagoPos(10, { Moneda: 'USD', Metodo: 'PAGO_MOVIL', Efectivo: 0, Tarjeta: 0, Referencia: '1234' }, tasa, 'AMBAS'), /bolívares/);
  assert.throws(() => calcularPagoPos(10, { Moneda: 'VES', Metodo: 'ZELLE', Efectivo: 0, Tarjeta: 0, Referencia: '1234' }, tasa, 'AMBAS'), /dólares/);
});
test('pago electrónico sin referencia o con efectivo mezclado se rechaza', () => {
  assert.throws(() => calcularPagoPos(10, { Moneda: 'VES', Metodo: 'PAGO_MOVIL', Efectivo: 0, Tarjeta: 0 }, tasa, 'AMBAS'), /referencia/);
  assert.throws(() => calcularPagoPos(10, { Moneda: 'VES', Metodo: 'PAGO_MOVIL', Efectivo: 100, Tarjeta: 0, Referencia: '1234' }, tasa, 'AMBAS'));
});
test('Zelle paga IGTF como cualquier pago en divisas', () => {
  const p = calcularPagoPos(10, { Moneda: 'USD', Metodo: 'ZELLE', Efectivo: 0, Tarjeta: 0, Referencia: 'ZL-1234' }, tasa, 'AMBAS', true);
  assert.equal(p.Electronico, 10.3);
  assert.equal(p.IGTFUSD, 0.3);
});
test('mixto: efectivo en dólares + Pago Móvil en bolívares', () => {
  const p = calcularPagoPos(10, { Moneda: 'MIXTA', MonedaCambio: 'USD', Desglose: {
    USD: { Efectivo: 6, Tarjeta: 0 }, VES: { Efectivo: 0, Tarjeta: 0, Electronico: 200, Forma: 'PAGO_MOVIL', Referencia: '445566' } } }, tasa, 'AMBAS');
  assert.equal(p.Metodo, 'MIXTO');
  assert.equal(p.Desglose.USD.Cambio, 1);           // $6 + 200 Bs ($5) por $10 → $1 de cambio
  assert.equal(p.ElectronicoUSD, 5);
  assert.equal(p.Desglose.VES.Referencia, '445566');
});
test('mixto: lo electrónico no puede pasarse del total ni dar cambio', () => {
  assert.throws(() => calcularPagoPos(10, { Moneda: 'MIXTA', MonedaCambio: 'VES', Desglose: {
    USD: { Efectivo: 0, Tarjeta: 0 }, VES: { Efectivo: 0, Tarjeta: 0, Electronico: 500, Forma: 'PAGO_MOVIL', Referencia: '445566' } } }, tasa, 'AMBAS'), /exceden/);
  assert.throws(() => calcularPagoPos(10, { Moneda: 'MIXTA', MonedaCambio: 'USD', Desglose: {
    USD: { Efectivo: 5, Tarjeta: 0, Electronico: 5, Forma: 'PAGO_MOVIL', Referencia: '1234' }, VES: { Efectivo: 0, Tarjeta: 0 } } }, tasa, 'AMBAS'), /bolívares/);
});
test('mixto con un solo medio guarda ese método', () => {
  const p = calcularPagoPos(10, { Moneda: 'MIXTA', MonedaCambio: 'USD', Desglose: {
    USD: { Efectivo: 0, Tarjeta: 0, Electronico: 10, Forma: 'ZELLE', Referencia: 'ZL-9999' }, VES: { Efectivo: 0, Tarjeta: 0 } } }, tasa, 'AMBAS');
  assert.equal(p.Metodo, 'ZELLE');
});
test('resumen de pagos electrónicos por forma', () => {
  const ventas = [
    { PagoMonedaJSON: JSON.stringify({ Moneda: 'VES', Electronico: 400, Forma: 'PAGO_MOVIL' }) },
    { PagoMonedaJSON: { Moneda: 'MIXTA', Desglose: { USD: { Electronico: 5, Forma: 'ZELLE' }, VES: { Electronico: 100, Forma: 'PAGO_MOVIL' } } } },
    { PagoMonedaJSON: JSON.stringify({ Moneda: 'USD', Efectivo: 10 }) },
    { PagoMonedaJSON: null },
  ];
  const r = electronicosPorForma(ventas);
  assert.deepEqual(r.find(x => x.Forma === 'PAGO_MOVIL'), { Forma: 'PAGO_MOVIL', Nombre: 'Pago Móvil', Moneda: 'VES', Monto: 500, Operaciones: 2 });
  assert.equal(r.find(x => x.Forma === 'ZELLE').Monto, 5);
});
