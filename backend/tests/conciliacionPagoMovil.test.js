import test from 'node:test';
import assert from 'node:assert/strict';
import {construirConciliacionPagoMovil,estadoConciliacion} from '../src/services/conciliacionPagoMovil.service.js';

const snap=(ves,tc=870)=>JSON.stringify({Moneda:'VES',TotalOriginal:ves,TasaVESporUSD:tc,FechaTasa:'2026-10-04'});
const ped=o=>({idPedido:1,FechaAlta:'2026-10-05T12:00:00Z',NombrePuntoVenta:'Sucursal 1',idPuntoVenta:3,TotalUSD:3.4,
 Status:'ESPERANDO_PAGO',StatusPago:'PENDIENTE',PagoMonedaJSON:snap(2958),...o});
const comp=o=>({idComprobante:1,idPedido:1,Referencia:'000123',ImagenURL:'/uploads/c.png',StatusRevision:'PENDIENTE',...o});

test('clasifica cada pedido según su pago',()=>{
 assert.equal(estadoConciliacion({Status:'ESPERANDO_PAGO',StatusPago:'PENDIENTE'},1),'POR_REVISAR');
 assert.equal(estadoConciliacion({Status:'ESPERANDO_PAGO',StatusPago:'RECHAZADO'},0),'SIN_COMPROBANTE');
 assert.equal(estadoConciliacion({Status:'ENTREGADO',StatusPago:'PAGADO'},0),'APROBADO');
 assert.equal(estadoConciliacion({Status:'BUSCANDO_REPARTIDOR',StatusPago:'PAGADO'},0),'APROBADO');
 assert.equal(estadoConciliacion({Status:'CANCELADO',StatusPago:'PAGADO'},0),'DEVOLUCION');
 assert.equal(estadoConciliacion({Status:'CANCELADO',StatusPago:'PENDIENTE'},0),'CANCELADO');
 assert.equal(estadoConciliacion({Status:'ENTREGADO',StatusPago:'PENDIENTE'},0),'ENTREGADO_SIN_PAGO');
});

test('totales en VES desde el snapshot congelado y USD aparte',()=>{
 const r=construirConciliacionPagoMovil([
  ped({idPedido:1,Status:'ENTREGADO',StatusPago:'PAGADO',PagoMonedaJSON:snap(2958.1)}),
  ped({idPedido:2,Status:'ENTREGADO',StatusPago:'PAGADO',PagoMonedaJSON:snap(1000.25),TotalUSD:1.15}),
 ]);
 assert.deepEqual(r.totales.APROBADO,{Pedidos:2,VES:3958.35,USD:4.55});
 assert.equal(r.filas[0].Tasa,870);assert.equal(r.atencion,0);
});

test('pagado y cancelado exige devolución; entregado sin pago se señala',()=>{
 const r=construirConciliacionPagoMovil([
  ped({idPedido:1,Status:'CANCELADO',StatusPago:'PAGADO'}),
  ped({idPedido:2,Status:'ENTREGADO',StatusPago:'PENDIENTE',PagoMonedaJSON:null}),
 ]);
 assert.equal(r.totales.DEVOLUCION.Pedidos,1);assert.equal(r.totales.ENTREGADO_SIN_PAGO.Pedidos,1);
 assert.equal(r.sinTasa,1);assert.equal(r.filas.find(f=>f.idPedido===2).MontoVES,null);
 assert.equal(r.atencion,2);
});

test('comprobante pendiente queda en la cola de revisión con su referencia',()=>{
 const r=construirConciliacionPagoMovil([ped({})],[comp({idComprobante:1,StatusRevision:'RECHAZADO',Referencia:'111'}),comp({idComprobante:2,Referencia:'222'})]);
 const f=r.filas[0];
 assert.equal(f.Estado,'POR_REVISAR');assert.equal(f.Comprobantes,2);assert.equal(f.ComprobantesPendientes,1);
 assert.equal(f.ComprobantePendiente.idComprobante,2);assert.equal(f.Referencia,'222');
});

test('referencia repetida en pedidos distintos se detecta (ignora rechazadas)',()=>{
 const r=construirConciliacionPagoMovil([ped({idPedido:1}),ped({idPedido:2}),ped({idPedido:3})],[
  comp({idComprobante:1,idPedido:1,Referencia:'0412-55 123'}),
  comp({idComprobante:2,idPedido:2,Referencia:'041255123',StatusRevision:'APROBADO'}),
  comp({idComprobante:3,idPedido:3,Referencia:'041255123',StatusRevision:'RECHAZADO'}),
 ]);
 assert.deepEqual(r.referenciasRepetidas,[{Referencia:'0412-55 123',Pedidos:[1,2]}]);
});

test('el mismo pedido reenviando su referencia no es repetición; vacío retorna ceros; snapshot corrupto falla',()=>{
 const r=construirConciliacionPagoMovil([ped({})],[comp({idComprobante:1}),comp({idComprobante:2})]);
 assert.equal(r.referenciasRepetidas.length,0);
 const v=construirConciliacionPagoMovil([]);assert.equal(v.filas.length,0);assert.equal(v.totales.APROBADO.VES,0);
 assert.throws(()=>construirConciliacionPagoMovil([ped({PagoMonedaJSON:'{'})]),/ilegible/);
});
