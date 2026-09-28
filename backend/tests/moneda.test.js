import test from 'node:test';
import assert from 'node:assert/strict';
import { convertirImporte,leerMoneda } from '../src/services/moneda.service.js';
test('abono VES mantiene original y calcula USD',()=>assert.deepEqual(convertirImporte(4000,'VES',40),{MonedaOriginal:'VES',MontoOriginal:4000,MontoUSD:100,MontoVES:4000,TasaVESporUSD:40}));
test('abono USD conserva equivalente VES',()=>assert.equal(convertirImporte(100,'USD',40).MontoVES,4000));
test('USD legado no inventa TC',()=>assert.equal(convertirImporte(10,'USD',null).MontoVES,null));
test('rechaza VES sin tasa, negativos, precisión excesiva y moneda desconocida',()=>{
 for(const args of [[10,'VES',null],[-1,'USD',40],[1.00001,'USD',40],[1,'EUR',40],[1,'USD',0],[Infinity,'USD',40],[true,'USD',40]]) assert.throws(()=>convertirImporte(...args));
});
test('redondea USD a cuatro decimales',()=>assert.equal(convertirImporte(1,'VES',3).MontoUSD,.3333));
test('tasa posterior no altera snapshot anterior',()=>{
 const antes=convertirImporte(4000,'VES',40); const despues=convertirImporte(4000,'VES',50);
 assert.equal(antes.MontoUSD,100);assert.equal(despues.MontoUSD,80);
});
test('configuración de cuenta ausente conserva USD y ninguna tasa',async()=>{
 const req={input(){return this;},async query(){return {recordsets:[[],[]]};}};
 assert.deepEqual(await leerMoneda({request:()=>req},1,1),{Modo:'USD',FuenteTasa:'BCV_TODAY',tasa:null});
});
