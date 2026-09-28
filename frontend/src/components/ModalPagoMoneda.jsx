import {useState,useEffect} from 'react';
import api from '../services/api.js';
export default function ModalPagoMoneda({total,usuario,idPuntoVenta,onConfirmar,onCerrar,procesando}) {
 const [cot,setCot]=useState(null),[moneda,setMoneda]=useState('USD'),[metodo,setMetodo]=useState('EFECTIVO');
 const [ef,setEf]=useState(''),[tar,setTar]=useState(''),[error,setError]=useState(''),[cargando,setCargando]=useState(false),[offline,setOffline]=useState(false);
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
 const importe=red(total*(moneda==='VES'?tc:1));
 const efectivo=metodo==='TARJETA'?0:ef===''?(metodo==='EFECTIVO'?importe:0):Number(ef);
 const tarjeta=metodo==='TARJETA'?importe:metodo==='EFECTIVO'?0:Number(tar)||0;
 const cambio=red(efectivo+tarjeta-importe);
 const valido=cot&&cambio>=0&&tarjeta<=importe&&cambio<=efectivo&&efectivo>=0&&tarjeta>=0;
 async function confirmar(){
  setCargando(true);setError('');
  try {
   const nueva=await obtener();
   if(String(nueva.tasa.idTasa)!==String(cot.tasa.idTasa)||nueva.Modo!==cot.Modo){setCot(nueva);setMoneda(nueva.Modo==='VES'?'VES':'USD');setEf('');setTar('');throw new Error('La tasa o moneda cambió. Revisa el importe y confirma de nuevo.');}
   const fecha=new Date(Math.max(Date.now(),Date.parse(nueva.EmitidaEn))).toISOString();
   if(Date.parse(fecha)>Date.parse(nueva.ExpiraEn)) throw new Error('La cotización venció. Actualiza la tasa.');
   const div=moneda==='VES'?tc:1;const usd=v=>Math.round(v/div*10000)/10000;
   await onConfirmar({metodo,efectivo:usd(efectivo),tarjeta:usd(tarjeta),cambio:usd(cambio),FechaVenta:fecha,
    PagoMoneda:{idCotizacion:nueva.idCotizacion,Moneda:moneda,Metodo:metodo,Efectivo:efectivo,Tarjeta:tarjeta},
    resumen:{Moneda:moneda,Metodo:metodo,TotalOriginal:importe,TotalUSD:total,TotalVES:red(total*tc),Efectivo:efectivo,Tarjeta:tarjeta,Cambio:cambio,TasaVESporUSD:tc,idTasa:nueva.tasa.idTasa,FechaTasa:nueva.tasa.FechaValor,Fuente:nueva.tasa.Fuente}});
  }catch(e){setError(e.message);}finally{setCargando(false);}
 }
 return <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl p-6 max-w-lg w-full space-y-4">
 <h2 className="font-bold text-xl">Cobrar venta</h2>
 <p className="text-xs">{offline?'Sin red: tasa autorizada previamente.':'Tasa verificada con el servidor.'} Vigencia: {cot?new Date(cot.ExpiraEn).toLocaleString():'consultando…'}</p>
 {cot&&<><p>1 USD = {tc} VES · {String(cot.tasa.FechaValor).slice(0,10)}</p>
 <label className="block">Moneda <select className="border rounded p-2" value={moneda} onChange={e=>{setMoneda(e.target.value);setEf('');setTar('');}}>{(cot.Modo==='AMBAS'?['USD','VES']:[cot.Modo]).map(m=><option key={m}>{m}</option>)}</select></label>
 <p className="text-2xl font-bold">{importe.toFixed(2)} {moneda}</p><p className="text-xs">Equivalente: {total.toFixed(2)} USD · {red(total*tc).toFixed(2)} VES</p>
 <select aria-label="Método de pago" className="border rounded p-2 w-full" value={metodo} onChange={e=>{setMetodo(e.target.value);setEf('');setTar('');}}><option value="EFECTIVO">Efectivo</option><option value="TARJETA">Tarjeta</option><option value="MIXTO">Efectivo + tarjeta</option></select>
 {metodo!=='TARJETA'&&<label className="block">Efectivo recibido ({moneda})<input className="border p-2 w-full" type="number" min="0" step="0.01" value={ef} placeholder={metodo==='EFECTIVO'?importe.toFixed(2):'0.00'} onChange={e=>setEf(e.target.value)}/></label>}
 {metodo==='MIXTO'&&<label className="block">Tarjeta ({moneda})<input className="border p-2 w-full" type="number" min="0" step="0.01" value={tar} onChange={e=>setTar(e.target.value)}/></label>}
 <p>{cambio<0?'Falta':'Cambio'}: {Math.abs(cambio).toFixed(2)} {moneda}</p></>}
 {error&&<p role="alert" className="text-red-600">{error}</p>}
 <div className="flex gap-3"><button disabled={procesando||cargando} onClick={onCerrar}>Cerrar</button><button disabled={procesando||cargando} onClick={cargar}>Actualizar tasa</button><button disabled={!valido||cargando||procesando} onClick={confirmar} className="bg-vida-green text-white rounded p-3 disabled:opacity-40">{procesando||cargando?'Procesando…':'Confirmar cobro'}</button></div>
 </div></div>;
}
