import test from 'node:test';
import assert from 'node:assert/strict';
import {construirReporteCaja} from '../src/services/reporteCaja.service.js';
import {tablasCaja} from '../../frontend/src/utils/filasCaja.mjs';

const arqueo=(usd,ves)=>JSON.stringify({Version:2,USD:usd,VES:ves});
const lado=(Apertura,VentasNetas,Movimientos,Contado)=>{
 const Esperado=Apertura+VentasNetas+Movimientos;
 return {Apertura,VentasNetas,Movimientos,Esperado,Contado,Diferencia:+(Contado-Esperado).toFixed(2)};
};
const turno=(o)=>({idTurno:1,idPuntoVenta:1,NombrePuntoVenta:'Tienda A',TotalVentas:0,NumTransacciones:0,...o});

test('suma por moneda sin convertir ni mezclar USD con VES',()=>{
 const r=construirReporteCaja([
  turno({idTurno:1,TotalVentas:30,ArqueoMonedasJSON:arqueo(lado(20,12,-5,27),lado(100,700,50,850))}),
  turno({idTurno:2,TotalVentas:10,ArqueoMonedasJSON:arqueo(lado(10,0,0,10),lado(0,400,0,400))}),
 ]);
 assert.deepEqual(r.monedas.USD,{Apertura:30,VentasNetas:12,Movimientos:-5,Esperado:37,Contado:37,Diferencia:0,Faltantes:0,Sobrantes:0});
 assert.deepEqual(r.monedas.VES,{Apertura:100,VentasNetas:1100,Movimientos:50,Esperado:1250,Contado:1250,Diferencia:0,Faltantes:0,Sobrantes:0});
 assert.equal(r.totales.TotalVentasUSD,40);assert.equal(r.totales.NumTurnos,2);
});

test('un sobrante de un turno no tapa el faltante de otro',()=>{
 const r=construirReporteCaja([
  turno({idTurno:1,ArqueoMonedasJSON:arqueo(lado(20,0,0,18),lado(0,0,0,0))}),
  turno({idTurno:2,ArqueoMonedasJSON:arqueo(lado(20,0,0,23),lado(0,0,0,0))}),
 ]);
 assert.equal(r.monedas.USD.Diferencia,1);
 assert.equal(r.monedas.USD.Faltantes,2);assert.equal(r.monedas.USD.Sobrantes,3);
 assert.equal(r.totales.TurnosConDiferencia,2);
});

test('cierre legado sin JSON queda aparte y no se reparte por moneda',()=>{
 const r=construirReporteCaja([
  turno({idTurno:1,ArqueoMonedasJSON:null,Diferencia:-4.5,TotalVentas:15}),
  turno({idTurno:2,ArqueoMonedasJSON:arqueo(lado(10,5,0,15),lado(0,0,0,0))}),
 ]);
 assert.equal(r.totales.TurnosLegado,1);assert.equal(r.totales.DiferenciaLegadoUSD,-4.5);
 assert.equal(r.monedas.USD.Apertura,10);assert.equal(r.monedas.USD.Diferencia,0);
 const legado=r.turnos.find(t=>t.idTurno===1);
 assert.equal(legado.Legado,true);assert.equal(legado.DiferenciaEquivUSD,-4.5);assert.equal(legado.USD,undefined);
 assert.equal(r.totales.TurnosConDiferencia,1);
});

test('arqueo cerrado antes de movimientos (sin campo Movimientos) cuenta 0',()=>{
 const viejo={Apertura:10,VentasNetas:5,Esperado:15,Contado:15,Diferencia:0};
 const r=construirReporteCaja([turno({ArqueoMonedasJSON:arqueo(viejo,viejo)})]);
 assert.equal(r.monedas.USD.Movimientos,0);assert.equal(r.monedas.VES.Esperado,15);
});

test('movimientos por tipo y moneda: solo activos y de turnos incluidos',()=>{
 const r=construirReporteCaja([turno({idTurno:7,ArqueoMonedasJSON:arqueo(lado(0,0,0,0),lado(0,0,0,0))})],[
  {idTurno:7,Tipo:'EGRESO',Moneda:'USD',Monto:5,Status:'ACTIVO'},
  {idTurno:7,Tipo:'EGRESO',Moneda:'VES',Monto:120,Status:'ACTIVO'},
  {idTurno:7,Tipo:'DEVOLUCION',Moneda:'VES',Monto:50,Status:'ANULADO'},
  {idTurno:99,Tipo:'RETIRO',Moneda:'USD',Monto:500,Status:'ACTIVO'},
 ]);
 assert.deepEqual(r.movimientosPorTipo.EGRESO,{USD:5,VES:120,Cantidad:2});
 assert.deepEqual(r.movimientosPorTipo.DEVOLUCION,{USD:0,VES:0,Cantidad:0});
 assert.deepEqual(r.movimientosPorTipo.RETIRO,{USD:0,VES:0,Cantidad:0});
});

test('agrupa por tienda con sus propias diferencias',()=>{
 const r=construirReporteCaja([
  turno({idTurno:1,idPuntoVenta:2,NombrePuntoVenta:'Beta',ArqueoMonedasJSON:arqueo(lado(10,0,0,8),lado(0,0,0,0))}),
  turno({idTurno:2,idPuntoVenta:1,NombrePuntoVenta:'Alfa',ArqueoMonedasJSON:arqueo(lado(10,0,0,10),lado(0,0,0,0))}),
 ]);
 assert.deepEqual(r.filas.map(f=>f.NombrePuntoVenta),['Alfa','Beta']);
 assert.equal(r.filas[1].USD.Faltantes,2);assert.equal(r.filas[1].TurnosConDiferencia,1);
 assert.equal(r.filas[0].TurnosConDiferencia,0);
});

test('tablas de exportación: USD y VES en columnas separadas, legado aparte',()=>{
 const r=construirReporteCaja([
  turno({idTurno:1,ArqueoMonedasJSON:arqueo(lado(20,0,-5,15),lado(100,0,0,90))}),
  turno({idTurno:2,ArqueoMonedasJSON:null,Diferencia:-3}),
 ],[{idTurno:1,Tipo:'EGRESO',Moneda:'USD',Monto:5,Status:'ACTIVO'}]);
 const t=tablasCaja({...r,turnosAbiertos:1});
 assert.deepEqual(t.map(x=>x.nombre),['Por moneda','Movimientos por tipo','Por sucursal','Por turno']);
 assert.deepEqual(t[0].filas[1],['VES',100,0,0,100,90,-10,10,0]);
 assert.ok(t[0].nota.includes('abiertos sin cerrar: 1'));
 assert.deepEqual(t[1].filas.find(f=>f[0]==='Egreso'),['Egreso',1,5,0]);
 const legado=t[3].filas.find(f=>f[0]==='2');
 assert.equal(legado[10],-3);assert.equal(legado[4],null);
 assert.equal(tablasCaja({}).length,0);
});

test('vacío retorna ceros; arqueo corrupto o incompleto rechaza el reporte',()=>{
 const r=construirReporteCaja([]);
 assert.equal(r.totales.NumTurnos,0);assert.equal(r.monedas.VES.Diferencia,0);
 assert.throws(()=>construirReporteCaja([turno({ArqueoMonedasJSON:'{'})]),/ilegible/);
 assert.throws(()=>construirReporteCaja([turno({ArqueoMonedasJSON:JSON.stringify({USD:{}})})]),/incompleto/);
 assert.throws(()=>construirReporteCaja([turno({idTurno:3,ArqueoMonedasJSON:arqueo(lado(0,0,0,0),lado(0,0,0,0))})],[{idTurno:3,Tipo:'DEPOSITO',Moneda:'USD',Monto:1}]));
});
