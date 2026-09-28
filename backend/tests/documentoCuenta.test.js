import test from 'node:test';
import assert from 'node:assert/strict';
import {prepararDocumentoCuenta} from '../../frontend/src/utils/documentoCuenta.mjs';
const data={cuenta:{idDocumento:7,Tipo:'CXC',NombreSucursal:'Tienda',TotalUSD:10,Abonado:3,Acreditado:2,Saldo:5,
 TasaEmisionJSON:JSON.stringify({TotalVES:400,TasaVESporUSD:40,FechaTasa:'2026-09-28',Fuente:'original'})},
 abonos:[{idAbono:1,MonedaOriginal:'VES',MontoOriginal:250,MontoUSD:5,MontoVES:250,TasaVESporUSD:50},
 {idAbono:2,MonedaOriginal:'USD',MontoOriginal:-2,MontoUSD:-2,MontoVES:-100,TasaVESporUSD:50,ReversoDe:1}],
 notasCredito:[{idNota:1,MontoUSD:2,Motivo:'Bonificación'}]};
test('exportación conserva emisión distinta de tasas de pago y saldo USD',()=>{
 const r=prepararDocumentoCuenta(data),c=Object.fromEntries(r.cabecera);
 assert.equal(c['Equivalente VES al emitir'],400);assert.equal(c['Saldo USD'],5);
 assert.equal(r.pagos[0][6],250);assert.equal(r.pagos[0][7],50);
 assert.equal(r.pagos[1][2],'Reverso');assert.equal(r.pagos[1][5],-2);assert.equal(r.pagos[1][12],'1');
 assert.equal(r.notas[0][2],2);
});
test('históricos sin tasa no fabrican equivalencia ni importe original',()=>{
 const r=prepararDocumentoCuenta({cuenta:{idDocumento:1,TotalUSD:10},abonos:[{idAbono:1,MontoUSD:2}]});
 assert.equal(Object.fromEntries(r.cabecera)['Equivalente VES al emitir'],null);
 assert.equal(r.pagos[0][4],null);assert.equal(r.pagos[0][6],null);
});
test('rechaza snapshot ilegible y documento ausente',()=>{
 assert.throws(()=>prepararDocumentoCuenta({cuenta:{idDocumento:1,TasaEmisionJSON:'{'}}));
 assert.throws(()=>prepararDocumentoCuenta({}));
});
test('exportación no modifica los datos recibidos',()=>{
 const copia=structuredClone(data);prepararDocumentoCuenta(data);assert.deepEqual(data,copia);
});
