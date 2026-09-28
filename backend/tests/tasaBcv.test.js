import test from 'node:test';
import assert from 'node:assert/strict';
import { consultarTasaBcv,validarTasaBcv,fechaCaracas,URL_TASA } from '../src/services/tasaBcv.service.js';
import { prepararMoneda } from '../src/services/moneda.service.js';
const ahora=new Date('2026-09-28T16:00:00Z');
const datos={USD:857.0058,updated_at:'2026-09-25T22:36:25.268159+00:00',effective_date:'2026-09-28',date:'2026-09-28'};
test('acepta publicación viernes efectiva lunes, con fuente y timestamp',()=>{
 const r=validarTasaBcv(datos,ahora);assert.equal(r.VESporUSD,857.0058);assert.equal(r.FechaValor,'2026-09-28');assert.equal(r.Fuente,URL_TASA);assert.equal(r.PublicadaEn.toISOString(),'2026-09-25T22:36:25.268Z');
});
test('fecha de Caracas evita aplicar lunes cuando aún es domingo local',()=>{
 const domingo=new Date('2026-09-28T02:00:00Z');assert.equal(fechaCaracas(domingo),'2026-09-27');assert.throws(()=>validarTasaBcv(datos,domingo),/entra en vigor/);
});
test('no usa date como sustituto de effective_date',()=>assert.throws(()=>validarTasaBcv({...datos,effective_date:undefined},ahora)));
test('rechaza fechas imposibles, tasas inválidas y publicación futura',()=>{
 for(const USD of [0,-1,Infinity,NaN,'857',null,1e10]) assert.throws(()=>validarTasaBcv({...datos,USD},ahora));
 for(const effective_date of ['2026-02-30','2026-09-29','incorrecta']) assert.throws(()=>validarTasaBcv({...datos,effective_date},ahora));
 for(const updated_at of [null,'incorrecta','2026-09-30T00:00:00Z']) assert.throws(()=>validarTasaBcv({...datos,updated_at},ahora));
});
test('controla antigüedad por fecha efectiva, no por día de publicación',()=>{
 assert.doesNotThrow(()=>validarTasaBcv({...datos,effective_date:'2026-09-25'},ahora));
 assert.throws(()=>validarTasaBcv({...datos,effective_date:'2026-09-23'},ahora));
});
test('cliente HTTP fijo sin caché ni redirecciones',async()=>{
 let count=0;
 const fetchFn=async(url,op)=>{count++;assert.equal(url,URL_TASA);assert.equal(op.redirect,'error');assert.equal(op.cache,'no-store');assert.ok(op.signal);return {ok:true,text:async()=>JSON.stringify(datos)};};
 await consultarTasaBcv({fetchFn,ahora});await consultarTasaBcv({fetchFn,ahora});assert.equal(count,2);
});
test('fallos HTTP, JSON y timeout no devuelven tasa inventada',async()=>{
 for (const fetchFn of [async()=>({ok:false,status:503}),async()=>({ok:true,text:async()=>'<html>error</html>'}),async()=>{throw new Error('timeout');},async()=>({ok:true,text:async()=>'x'.repeat(16385)})])
  await assert.rejects(()=>consultarTasaBcv({fetchFn,ahora}),{statusCode:503});
});
const actor={idBranch:1,idCuenta:2,idUsuario:3};
test('preparación automática consulta, guarda y exige snapshot actual',async()=>{
 const pasos=[];let lecturas=0;
 const resultado=await prepararMoneda({},actor,{
  leer:async()=>{pasos.push('leer');return {FuenteTasa:'BCV_TODAY',tasa:++lecturas===1?null:{idTasa:8}};},
  consultar:async()=>{pasos.push('consultar');return datos;},
  guardar:async(p,a,t)=>{pasos.push('guardar');assert.equal(a.idCuenta,2);assert.equal(t,datos);return 8;}
 });assert.equal(resultado.tasa.idTasa,8);assert.deepEqual(pasos,['leer','consultar','guardar','leer']);
});
test('modo manual no consulta ni sobreescribe su tasa',async()=>{
 const cfg={FuenteTasa:'MANUAL',tasa:{idTasa:4}};
 assert.equal(await prepararMoneda({},actor,{leer:async()=>cfg,consultar:()=>assert.fail('No consultar en manual')}),cfg);
});
test('fallo API no reutiliza en silencio snapshot guardado',async()=>{
 await assert.rejects(()=>prepararMoneda({},actor,{leer:async()=>({FuenteTasa:'BCV_TODAY',tasa:{idTasa:4}}),consultar:async()=>{throw new Error('caída');},guardar:()=>assert.fail('No guardar errores')}),/caída/);
});
test('cambio concurrente de tasa requiere nueva confirmación',async()=>{
 await assert.rejects(()=>prepararMoneda({},actor,{leer:async()=>({FuenteTasa:'BCV_TODAY',tasa:{idTasa:9}}),consultar:async()=>datos,guardar:async()=>8}),{statusCode:409});
});
