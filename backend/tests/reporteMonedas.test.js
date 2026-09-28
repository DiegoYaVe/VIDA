import test from 'node:test';
import assert from 'node:assert/strict';
import {construirReporteVentas} from '../src/services/reporteMonedas.service.js';
import {tablasMonedas} from '../../frontend/src/utils/filasMonedas.mjs';
const base={idPedido:1,idPuntoVenta:2,NombrePuntoVenta:'Tienda',FechaAlta:'2026-09-28T12:00:00Z',TotalUSD:10,MontoEfectivo:12,MontoTarjeta:0,MontoCambio:2};
test('reporte no suma las monedas ni aplica una tasa actual al histórico',()=>{
 const rows=[{...base,PagoMonedaJSON:JSON.stringify({Moneda:'MIXTA',TasaVESporUSD:40,FechaTasa:'2026-09-28',Fuente:'original',Desglose:{USD:{Efectivo:2,Tarjeta:0,Cambio:0},VES:{Efectivo:400,Tarjeta:0,Cambio:80}}})},
 {...base,idPedido:2,MontoEfectivo:10,MontoCambio:0,PagoMonedaJSON:JSON.stringify({Moneda:'VES',TasaVESporUSD:50,Efectivo:500,Tarjeta:0,Cambio:0})}];
 const r=construirReporteVentas(rows);
 assert.equal(r.totales.TotalUSD,20);assert.equal(r.monedas.USD.NetoEfectivo,2);assert.equal(r.monedas.VES.NetoEfectivo,820);
 assert.deepEqual(r.detalleMonedas.map(d=>d.Tasa),[40,40,50]);
 assert.equal(r.totales.NumVentas,2);assert.equal(r.detalleMonedas.length,3);
 assert.equal(tablasMonedas(r)[1].datos[1][8],40);
});
test('sin tasa se identifica legado USD y no se fabrica TC',()=>{
 const r=construirReporteVentas([base]);assert.equal(r.sinTasa,1);assert.equal(r.detalleMonedas[0].Tasa,null);
 assert.equal(r.monedas.USD.NetoEfectivo,10);assert.equal(r.monedas.VES.Efectivo,0);
});
test('agrupa tienda y día sin duplicar ventas mixtas',()=>{
 const r=construirReporteVentas([base,{...base,idPuntoVenta:3,FechaAlta:'2026-09-29T12:00:00Z'}]);
 assert.equal(r.filas.length,2);assert.equal(r.graficaDiaria.length,2);assert.equal(r.totales.NumVentas,2);
});
test('vacío retorna ceros y snapshot corrupto rechaza reporte',()=>{
 assert.equal(construirReporteVentas([]).totales.TotalUSD,0);
 assert.throws(()=>construirReporteVentas([{...base,PagoMonedaJSON:'{'}]));
});
