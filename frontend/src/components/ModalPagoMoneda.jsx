import {useState,useEffect} from 'react';
import api from '../services/api.js';
import {calcularPagoPos,PCT_IGTF} from '../../../backend/src/domain/pagoPos.mjs';
import {simbolo,conMoneda,NOMBRE_MONEDA} from '../utils/monedas.js';

// Cobro en el punto de venta: dólares, bolívares o mixto (según el modo de
// moneda de la cuenta, Cuentas → Moneda). Por dentro el bolívar es "VES"; en
// pantalla se muestra "Bs".
export default function ModalPagoMoneda({total,usuario,idPuntoVenta,onConfirmar,onCerrar,procesando}) {
 const [cot,setCot]=useState(null),[moneda,setMoneda]=useState('USD'),[metodo,setMetodo]=useState('EFECTIVO');
 const [ef,setEf]=useState(''),[tar,setTar]=useState(''),[error,setError]=useState(''),[cargando,setCargando]=useState(false),[offline,setOffline]=useState(false);
 const [partes,setPartes]=useState({USD:{Efectivo:'',Tarjeta:''},VES:{Efectivo:'',Tarjeta:''}});
 const [monedaCambio,setMonedaCambio]=useState('USD');
 const clave=`vida.tc.pos.${usuario.idBranch}.${usuario.idCuenta}.${usuario.idUsuario}.${idPuntoVenta}`;
 const red=v=>Math.round((v+Number.EPSILON)*100)/100;
 async function obtener() {
  try {
   const {data}=await api.post('/pedidos/pos/cotizacion-moneda',{idPuntoVenta:Number(idPuntoVenta)});
   try {localStorage.setItem(clave,JSON.stringify(data));} catch {}
   setOffline(false);return data;
  } catch(e) {
   if(e.response) throw new Error(e.response.data?.error||'No se pudo verificar la tasa');
   let guardada;try {guardada=JSON.parse(localStorage.getItem(clave));} catch {}
   if(!guardada||Date.parse(guardada.ExpiraEn)<Date.now()) throw new Error('Sin conexión y sin tasa autorizada vigente. Conéctate antes de cobrar.');
   setOffline(true);return guardada;
  }
 }
 async function cargar(){setCargando(true);setError('');try {const c=await obtener();setCot(c);setMoneda(c.Modo==='VES'?'VES':'USD');}catch(e){setError(e.message);setCot(null);}finally{setCargando(false);}}
 useEffect(()=>{cargar();},[clave]);
 const tc=Number(cot?.tasa?.VESporUSD)||0;
 // Contribuyente especial: IGTF (3%) sobre lo pagado en divisas
 const igtf=!!cot?.AplicaIGTF;
 const importe=red((total+(igtf&&moneda==='USD'?red(total*PCT_IGTF/100):0))*(moneda==='VES'?tc:1));
 const efectivo=metodo==='TARJETA'?0:ef===''?(metodo==='EFECTIVO'?importe:0):Number(ef);
 const tarjeta=metodo==='TARJETA'?importe:metodo==='EFECTIVO'?0:Number(tar)||0;
 const cambio=red(efectivo+tarjeta-importe);
 const pago=moneda==='MIXTA'?{Moneda:'MIXTA',MonedaCambio:monedaCambio,Desglose:Object.fromEntries(['USD','VES'].map(m=>[m,{Efectivo:Number(partes[m].Efectivo||0),Tarjeta:Number(partes[m].Tarjeta||0)}]))}:{Moneda:moneda,Metodo:metodo,Efectivo:efectivo,Tarjeta:tarjeta};
 let resumen=null,validacion='';
 if(cot) {try {resumen=calcularPagoPos(total,pago,cot.tasa,cot.Modo,igtf);}catch(e){validacion=e.message;}}
 const valido=!!resumen;
 async function confirmar(){
  setCargando(true);setError('');
  try {
   const nueva=await obtener();
   if(String(nueva.tasa.idTasa)!==String(cot.tasa.idTasa)||nueva.Modo!==cot.Modo){setCot(nueva);setMoneda(nueva.Modo==='VES'?'VES':'USD');setEf('');setTar('');throw new Error('La tasa o moneda cambió. Revisa el importe y confirma de nuevo.');}
   const fecha=new Date(Math.max(Date.now(),Date.parse(nueva.EmitidaEn))).toISOString();
   if(Date.parse(fecha)>Date.parse(nueva.ExpiraEn)) throw new Error('La cotización venció. Actualiza la tasa.');
   const confirmado=calcularPagoPos(total,pago,nueva.tasa,nueva.Modo,!!nueva.AplicaIGTF);
   await onConfirmar({metodo:confirmado.Metodo,efectivo:confirmado.EfectivoUSD,tarjeta:confirmado.TarjetaUSD,cambio:confirmado.CambioUSD,FechaVenta:fecha,
    PagoMoneda:{...pago,idCotizacion:nueva.idCotizacion},resumen:confirmado});
  }catch(e){setError(e.message);}finally{setCargando(false);}
 }

 const monedas=cot?(cot.Modo==='AMBAS'?['USD','VES','MIXTA']:[cot.Modo]):[];
 const elegirMoneda=m=>{setMoneda(m);setEf('');setTar('');};
 const boton=(activo)=>`flex-1 min-w-0 rounded-xl px-3 py-2.5 text-sm font-bold border-2 transition ${activo?'border-vida-blue bg-vida-blue text-white':'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`;
 const campo='w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base bg-white';

 return <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4" role="dialog" aria-modal="true" aria-label="Cobrar venta">
 <div className="bg-white rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 max-w-lg w-full space-y-4 max-h-[92vh] overflow-y-auto">
 <div className="flex items-start justify-between gap-3">
  <h2 className="font-black text-xl text-gray-900">Cobrar venta</h2>
  {cot&&<p className="text-xs text-gray-500 text-right">1 USD = {tc.toLocaleString('es-VE',{maximumFractionDigits:4})} Bs<br/>{offline?'Sin red: tasa autorizada':'Tasa BCV'} · {String(cot.tasa.FechaValor).slice(0,10)}</p>}
 </div>
 {!cot&&cargando&&<p className="text-sm text-gray-500">Consultando la tasa…</p>}
 {cot&&<>
 {/* Moneda */}
 <div>
  <p className="text-xs font-semibold text-gray-500 mb-1.5">¿En qué moneda paga?</p>
  <div className="flex gap-2" role="radiogroup" aria-label="Moneda">
   {monedas.map(m=><button key={m} type="button" role="radio" aria-checked={moneda===m} disabled={cargando||procesando} onClick={()=>elegirMoneda(m)} className={boton(moneda===m)}>
    {NOMBRE_MONEDA[m]}{m!=='MIXTA'&&<span className="block text-[11px] font-semibold opacity-80">{simbolo(m)}</span>}{m==='MIXTA'&&<span className="block text-[11px] font-semibold opacity-80">$ y Bs</span>}
   </button>)}
  </div>
  {cot.Modo!=='AMBAS'&&<p className="text-[11px] text-gray-400 mt-1.5">Esta cuenta solo cobra en {cot.Modo==='VES'?'bolívares':'dólares'}. Para cobrar en las dos monedas, VIDA lo activa en Cuentas → Moneda.</p>}
 </div>

 {/* Total */}
 <div className="rounded-2xl bg-gray-50 px-4 py-3">
  <p className="text-xs text-gray-500">Total a cobrar</p>
  {moneda==='MIXTA'
   ?<p className="text-2xl font-black text-gray-900">{conMoneda(total,'USD')} <span className="text-base font-semibold text-gray-500">· {conMoneda(red(total*tc),'VES')}</span></p>
   :<p className="text-3xl font-black text-gray-900">{conMoneda(importe,moneda)}</p>}
  {moneda!=='MIXTA'&&<p className="text-xs text-gray-500 mt-0.5">Equivale a {moneda==='VES'?conMoneda(total,'USD'):conMoneda(red(total*tc),'VES')}</p>}
 </div>
 {igtf&&<p className="text-xs rounded-lg bg-amber-50 p-2 text-amber-800">Tienda contribuyente especial: se cobra IGTF {PCT_IGTF}% sobre lo pagado en divisas{resumen?.IGTFUSD?` (${resumen.IGTFUSD.toFixed(2)} USD; total a cobrar ${resumen.TotalCobradoUSD.toFixed(2)} USD)`:''}. En bolívares no aplica.</p>}

 <fieldset disabled={cargando||procesando} className="space-y-3">
 {moneda==='MIXTA'?<>
  {['USD','VES'].map(m=><div key={m} className="rounded-xl border border-gray-100 p-3">
   <h3 className="font-bold text-sm text-gray-800 mb-2">Recibido en {NOMBRE_MONEDA[m].toLowerCase()} ({simbolo(m)})</h3>
   <div className="grid grid-cols-2 gap-2">{['Efectivo','Tarjeta'].map(k=><label key={k} className="text-xs font-semibold text-gray-500">{k}
    <input type="number" inputMode="decimal" min="0" step="0.01" className={`${campo} mt-1`} placeholder="0.00" value={partes[m][k]} onChange={e=>setPartes(prev=>({...prev,[m]:{...prev[m],[k]:e.target.value}}))}/></label>)}</div>
  </div>)}
  <label className="block text-xs font-semibold text-gray-500">Devolver el cambio en
   <select className={`${campo} mt-1`} value={monedaCambio} onChange={e=>setMonedaCambio(e.target.value)}><option value="USD">Dólares (USD)</option><option value="VES">Bolívares (Bs)</option></select></label>
  <p className="text-[11px] text-gray-400">El cambio no puede superar el efectivo recibido en esa moneda.</p>
  {resumen&&<p className="font-bold text-gray-800">Cambio: {conMoneda(resumen.Desglose[monedaCambio].Cambio,monedaCambio)}</p>}
 </>:<>
  <div className="flex gap-2" role="radiogroup" aria-label="Forma de pago">
   {[['EFECTIVO','Efectivo'],['TARJETA','Tarjeta'],['MIXTO','Efectivo + tarjeta']].map(([v,l])=><button key={v} type="button" role="radio" aria-checked={metodo===v} onClick={()=>{setMetodo(v);setEf('');setTar('');}} className={boton(metodo===v)}>{l}</button>)}
  </div>
  {metodo!=='TARJETA'&&<label className="block text-xs font-semibold text-gray-500">Efectivo recibido ({simbolo(moneda)})
   <input className={`${campo} mt-1`} type="number" inputMode="decimal" min="0" step="0.01" value={ef} placeholder={metodo==='EFECTIVO'?importe.toFixed(2):'0.00'} onChange={e=>setEf(e.target.value)}/></label>}
  {metodo==='MIXTO'&&<label className="block text-xs font-semibold text-gray-500">Con tarjeta ({simbolo(moneda)})
   <input className={`${campo} mt-1`} type="number" inputMode="decimal" min="0" step="0.01" value={tar} onChange={e=>setTar(e.target.value)}/></label>}
  <p className={`font-bold ${cambio<0?'text-red-600':'text-gray-800'}`}>{cambio<0?'Falta':'Cambio'}: {conMoneda(Math.abs(cambio),moneda)}</p>
 </>}
 </fieldset>
 {validacion&&<p className="text-amber-700 text-sm" role="status">{validacion}</p>}
 </>}
 {error&&<p role="alert" className="text-red-600 text-sm">{error}</p>}
 <div className="flex flex-wrap gap-2 pt-1">
  <button disabled={procesando||cargando} onClick={onCerrar} className="px-4 py-3 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200">Cerrar</button>
  <button disabled={procesando||cargando} onClick={cargar} className="px-4 py-3 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200">Actualizar tasa</button>
  <button disabled={!valido||cargando||procesando} onClick={confirmar} className="flex-1 min-w-[10rem] bg-vida-green text-white font-bold rounded-xl px-4 py-3 disabled:opacity-40">{procesando||cargando?'Procesando…':'Confirmar cobro'}</button>
 </div>
 </div></div>;
}
