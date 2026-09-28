import test from 'node:test';
import assert from 'node:assert/strict';
import {calcularPagoPos} from '../src/services/pagoPos.service.js';
import {efectivoPorMoneda,calcularArqueo} from '../src/services/arqueo.service.js';
const tasa={VESporUSD:40,idTasa:1,FechaValor:'2026-09-28',Fuente:'prueba'};
const pago=(usd,ves,tarUSD=0,tarVES=0,MonedaCambio='USD')=>({Moneda:'MIXTA',MonedaCambio,Desglose:{USD:{Efectivo:usd,Tarjeta:tarUSD},VES:{Efectivo:ves,Tarjeta:tarVES}}});
const venta=p=>({MetodoPago:p.Metodo,PagoMonedaJSON:JSON.stringify(p)});
test('venta $10 pagada con $5 y Bs200 conserva dos cobros sin cambio',()=>{
 const p=calcularPagoPos(10,pago(5,200),tasa,'AMBAS');
 assert.equal(p.EfectivoUSD,10);assert.equal(p.TotalVES,400);assert.equal(p.CambioUSD,0);
 assert.deepEqual(efectivoPorMoneda([venta(p)]),{USD:5,VES:200});
});
test('cambio en VES sale únicamente del efectivo VES, tarjeta excluida del arqueo',()=>{
 const p=calcularPagoPos(10,pago(2,200,0,200,'VES'),tasa,'AMBAS');
 assert.equal(p.Metodo,'MIXTO');assert.equal(p.Desglose.VES.Cambio,80);
 assert.equal(p.TarjetaUSD,5);assert.equal(p.CambioUSD,2);
 assert.deepEqual(efectivoPorMoneda([venta(p)]),{USD:2,VES:120});
});
test('misma venta, cambio USD de $2 conserva los bolívares recibidos',()=>{
 const p=calcularPagoPos(10,pago(2,200,0,200),tasa,'AMBAS');
 assert.equal(p.Desglose.USD.Cambio,2);
 assert.deepEqual(efectivoPorMoneda([venta(p)]),{USD:0,VES:200});
});
test('rechaza insuficiencia, sobrepago tarjeta y cambio sin efectivo de esa moneda',()=>{
 for(const d of [pago(5,190),pago(0,0,11),pago(0,800)]) assert.throws(()=>calcularPagoPos(10,d,tasa,'AMBAS'));
});
test('no mezcla monedas cuando la configuración autoriza solo una',()=>{
 for(const modo of ['USD','VES']) assert.throws(()=>calcularPagoPos(10,pago(5,200),tasa,modo));
});
test('no acepta datos monetarios incompletos o importes inválidos en ninguna moneda',()=>{
 for(const n of [-1,NaN,Infinity,0.001,'5',null,undefined]) {
  for(const moneda of ['USD','VES']) for(const k of ['Efectivo','Tarjeta']) {
   const p=pago(5,200);p.Desglose[moneda][k]=n;
   assert.throws(()=>calcularPagoPos(10,p,tasa,'AMBAS'));
  }
 }
});
test('tasas fraccionarias conservan ajuste de redondeo y montos físicos',()=>{
 const p=calcularPagoPos(10,pago(5,4285.03,0,0,'VES'),{...tasa,VESporUSD:857.0058},'AMBAS');
 assert.equal(p.Desglose.VES.Cambio,0);
 assert.deepEqual(efectivoPorMoneda([venta(p)]),{USD:5,VES:4285.03});
 assert.ok(Math.abs(p.EfectivoUSD-p.CambioUSD-p.TotalUSD-p.AjusteRedondeoUSD)<0.00011);
});
test('pago exclusivamente tarjeta en dos monedas no agrega billetes',()=>{
 const p=calcularPagoPos(10,pago(0,0,5,200),tasa,'AMBAS');
 assert.equal(p.Metodo,'TARJETA');assert.deepEqual(efectivoPorMoneda([venta(p)]),{USD:0,VES:0});
});
test('caja agrega ventas antiguas, moneda única y combinadas con distintas tasas',()=>{
 const ves=calcularPagoPos(10,{Moneda:'VES',Metodo:'EFECTIVO',Efectivo:600,Tarjeta:0},{...tasa,VESporUSD:50},'VES');
 const mixto=calcularPagoPos(10,pago(5,200),tasa,'AMBAS');
 const ventas=[{MetodoPago:'EFECTIVO',TotalUSD:7,MontoEfectivo:10,MontoCambio:3},venta(ves),venta(mixto)];
 assert.deepEqual(efectivoPorMoneda(ventas),{USD:12,VES:700});
});
test('apertura y cierre físico no compensan faltante USD con sobrante VES',()=>{
 const a=calcularArqueo({MontoApertura:20,MontoAperturaVES:100},{EfectivoOriginalUSD:12,EfectivoOriginalVES:700},{USD:30,VES:900});
 assert.deepEqual(a.USD,{Apertura:20,VentasNetas:12,Esperado:32,Contado:30,Diferencia:-2});
 assert.deepEqual(a.VES,{Apertura:100,VentasNetas:700,Esperado:800,Contado:900,Diferencia:100});
});
test('cero en caja es válido; no admite negativos, ausencia ni centavos fraccionarios',()=>{
 assert.equal(calcularArqueo({MontoApertura:0},{},{USD:0,VES:0}).VES.Diferencia,0);
 for(const USD of [-1,NaN,null,undefined,1.001]) assert.throws(()=>calcularArqueo({},{},{USD,VES:0}));
});
test('desglose corrupto impide generar arqueo silenciosamente incorrecto',()=>{
 assert.throws(()=>efectivoPorMoneda([{MetodoPago:'EFECTIVO',PagoMonedaJSON:'{'}]));
 assert.throws(()=>efectivoPorMoneda([{MetodoPago:'EFECTIVO',PagoMonedaJSON:{Moneda:'EUR',Efectivo:10,Cambio:0}}]));
});
