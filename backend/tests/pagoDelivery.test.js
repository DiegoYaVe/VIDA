import test from 'node:test';
import assert from 'node:assert/strict';
import {calcularPagoDelivery} from '../src/services/pagoDelivery.service.js';
const tasa={idTasa:3,VESporUSD:857.0058,FechaValor:'2026-09-28',Fuente:'bcv.today'};
test('Pago Móvil conserva VES, USD, tasa, fecha y fuente',()=>{
 const p=calcularPagoDelivery(10,{Moneda:'VES',MontoOriginal:8570.06,Metodo:'PAGO_MOVIL'},tasa,'AMBAS');
 assert.equal(p.TotalUSD,10);assert.equal(p.TotalVES,8570.06);assert.equal(p.TotalOriginal,8570.06);
 assert.equal(p.idTasa,3);assert.equal(p.Status,'PENDIENTE_REVISION');
});
test('USD conserva también equivalente VES histórico',()=>{
 const p=calcularPagoDelivery(10,{Moneda:'USD',MontoOriginal:10,Metodo:'TARJETA'},tasa,'USD');
 assert.equal(p.TotalOriginal,10);assert.equal(p.TotalVES,8570.06);
});
test('rechaza total alterado, moneda deshabilitada e importes inválidos',()=>{
 assert.throws(()=>calcularPagoDelivery(10,{Moneda:'VES',MontoOriginal:8570,Metodo:'PAGO_MOVIL'},tasa,'AMBAS'));
 assert.throws(()=>calcularPagoDelivery(10,{Moneda:'VES',MontoOriginal:8570.06},tasa,'USD'));
 for(const MontoOriginal of [-1,NaN,Infinity,10.001]) assert.throws(()=>calcularPagoDelivery(10,{Moneda:'USD',MontoOriginal},tasa,'USD'));
});
test('cambiar la tasa no altera un snapshot ya calculado',()=>{
 const viejo=calcularPagoDelivery(10,{Moneda:'VES',MontoOriginal:400,Metodo:'PAGO_MOVIL'},{...tasa,VESporUSD:40},'VES');
 calcularPagoDelivery(10,{Moneda:'VES',MontoOriginal:500,Metodo:'PAGO_MOVIL'},{...tasa,VESporUSD:50},'VES');
 assert.equal(viejo.TotalVES,400);assert.equal(viejo.TasaVESporUSD,40);
});
test('IGTF: efectivo en dólares en tienda contribuyente especial suma 3%',()=>{
 const p=calcularPagoDelivery(10,{Moneda:'USD',MontoOriginal:10.3,Metodo:'EFECTIVO'},tasa,'AMBAS',true);
 assert.equal(p.TotalUSD,10);assert.equal(p.TotalOriginal,10.3);
 assert.equal(p.IGTFUSD,0.3);assert.equal(p.IGTFBaseUSD,10);assert.equal(p.TotalCobradoUSD,10.3);
 // Sin el impuesto el monto no cuadra: la app debe actualizar el pago
 assert.throws(()=>calcularPagoDelivery(10,{Moneda:'USD',MontoOriginal:10,Metodo:'EFECTIVO'},tasa,'AMBAS',true),e=>e.statusCode===409);
});
test('IGTF: en bolívares no aplica y sin contribuyente especial no se agrega',()=>{
 const ves=calcularPagoDelivery(10,{Moneda:'VES',MontoOriginal:8570.06,Metodo:'EFECTIVO'},tasa,'AMBAS',true);
 assert.equal(ves.IGTFUSD,0);assert.equal(ves.IGTFBaseUSD,0);assert.equal(ves.TotalOriginal,8570.06);
 const normal=calcularPagoDelivery(10,{Moneda:'USD',MontoOriginal:10,Metodo:'EFECTIVO'},tasa,'AMBAS');
 assert.equal(normal.IGTFUSD,undefined);assert.equal(normal.IGTFBaseUSD,undefined);
 assert.throws(()=>calcularPagoDelivery(10,{Moneda:'USD',MontoOriginal:10.3,Metodo:'EFECTIVO'},tasa,'AMBAS'));
});
test('IGTF redondea a centavos',()=>{
 const p=calcularPagoDelivery(7.35,{Moneda:'USD',MontoOriginal:7.57,Metodo:'EFECTIVO'},tasa,'USD',true);
 assert.equal(p.IGTFUSD,0.22);assert.equal(p.TotalCobradoUSD,7.57);
});
