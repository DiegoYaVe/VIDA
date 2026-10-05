import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularCobroEfectivoRepartidor } from '../src/services/liquidacionRepartidor.service.js';

test('efectivo VES descuenta la comisión convertida con la tasa histórica', () => {
  const r = calcularCobroEfectivoRepartidor({
    totalUSD: 10, comisionUSD: 1.5,
    pagoMonedaJSON: { Moneda:'VES', TotalOriginal:8570.06, TasaVESporUSD:857.0058, idTasa:9, FechaTasa:'2026-09-28', Fuente:'BCV_TODAY' },
  });
  assert.equal(r.Moneda, 'VES');
  assert.equal(r.ComisionOriginal, 1285.51);
  assert.equal(r.MontoARendirOriginal, 7284.55);
  assert.equal(r.idTasa, 9);
});

test('efectivo USD legado conserva el comportamiento anterior', () => {
  const r = calcularCobroEfectivoRepartidor({ totalUSD:20, comisionUSD:3, pagoMonedaJSON:null });
  assert.equal(r.Moneda, 'USD');
  assert.equal(r.MontoARendirOriginal, 17);
  assert.equal(r.MontoARendirUSD, 17);
});

test('rechaza snapshot VES corrupto y una comisión mayor al total', () => {
  assert.throws(() => calcularCobroEfectivoRepartidor({ totalUSD:10, comisionUSD:1, pagoMonedaJSON:{Moneda:'VES'} }), /tasa histórica/);
  assert.throws(() => calcularCobroEfectivoRepartidor({ totalUSD:10, comisionUSD:11 }), /Importes inválidos/);
});


import {cobroAlCliente,cobroSeguro} from '../src/services/liquidacionRepartidor.service.js';
const snapVES=JSON.stringify({Moneda:'VES',Metodo:'EFECTIVO',TotalOriginal:2962.65,TotalUSD:3.4,TasaVESporUSD:871.3689});
test('cobro al cliente: efectivo VES se cobra en bolívares del snapshot, no en dólares',()=>{
 const c=cobroAlCliente({metodoPago:'EFECTIVO',totalUSD:3.4,pagoMonedaJSON:snapVES});
 assert.deepEqual(c,{CobrarEfectivo:true,Metodo:'EFECTIVO',Moneda:'VES',Monto:2962.65,TotalUSD:3.4,TasaVESporUSD:871.3689});
});
test('cobro al cliente: efectivo USD o legado sin snapshot se cobra en dólares',()=>{
 assert.equal(cobroAlCliente({metodoPago:'EFECTIVO',totalUSD:3.4,pagoMonedaJSON:null}).Moneda,'USD');
 assert.equal(cobroAlCliente({metodoPago:'EFECTIVO',totalUSD:3.4,pagoMonedaJSON:JSON.stringify({Moneda:'USD',TotalOriginal:3.4})}).Monto,3.4);
});
test('cobro al cliente: Pago Móvil y tarjeta no piden efectivo',()=>{
 for(const m of ['PAGO_MOVIL','TARJETA']) {
  const c=cobroAlCliente({metodoPago:m,totalUSD:3.4,pagoMonedaJSON:snapVES});
  assert.equal(c.CobrarEfectivo,false);assert.equal(c.Monto,null);assert.equal(c.Metodo,m);
 }
});
test('cobro al cliente: coincide con lo que la liquidación cuenta como efectivo cobrado',()=>{
 const liq=calcularCobroEfectivoRepartidor({totalUSD:3.4,comisionUSD:0.5,pagoMonedaJSON:snapVES});
 const c=cobroAlCliente({metodoPago:'EFECTIVO',totalUSD:3.4,pagoMonedaJSON:snapVES});
 assert.equal(c.Moneda,liq.Moneda);assert.equal(c.Monto,liq.EfectivoCobradoOriginal);
});
test('cobro seguro: snapshot dañado no tumba la lista, pide confirmar con la tienda',()=>{
 assert.throws(()=>cobroAlCliente({metodoPago:'EFECTIVO',totalUSD:3.4,pagoMonedaJSON:'{'}));
 const c=cobroSeguro({metodoPago:'EFECTIVO',totalUSD:3.4,pagoMonedaJSON:'{'});
 assert.equal(c.CobrarEfectivo,true);assert.equal(c.Monto,null);assert.ok(c.Error);
});
