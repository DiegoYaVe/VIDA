import {useState,useEffect} from 'react';
import api from '../services/api.js';
import {calcularPagoPos} from '../../../backend/src/domain/pagoPos.mjs';
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
 const importe=red(total*(moneda==='VES'?tc:1));
 const efectivo=metodo==='TARJETA'?0:ef===''?(metodo==='EFECTIVO'?importe:0):Number(ef);
 const tarjeta=metodo==='TARJETA'?importe:metodo==='EFECTIVO'?0:Number(tar)||0;
 const cambio=red(efectivo+tarjeta-importe);
 const pago=moneda==='MIXTA'?{Moneda:'MIXTA',MonedaCambio:monedaCambio,Desglose:Object.fromEntries(['USD','VES'].map(m=>[m,{Efectivo:Number(partes[m].Efectivo||0),Tarjeta:Number(partes[m].Tarjeta||0)}]))}:{Moneda:moneda,Metodo:metodo,Efectivo:efectivo,Tarjeta:tarjeta};
 let resumen=null,validacion='';
 if(cot) {try {resumen=calcularPagoPos(total,pago,cot.tasa,cot.Modo);}catch(e){validacion=e.message;}}
 const valido=!!resumen;
 async function confirmar(){
  setCargando(true);setError('');
  try {
   const nueva=await obtener();
   if(String(nueva.tasa.idTasa)!==String(cot.tasa.idTasa)||nueva.Modo!==cot.Modo){setCot(nueva);setMoneda(nueva.Modo==='VES'?'VES':'USD');setEf('');setTar('');throw new Error('La tasa o moneda cambió. Revisa el importe y confirma de nuevo.');}
   const fecha=new Date(Math.max(Date.now(),Date.parse(nueva.EmitidaEn))).toISOString();
   if(Date.parse(fecha)>Date.parse(nueva.ExpiraEn)) throw new Error('La cotización venció. Actualiza la tasa.');
   const confirmado=calcularPagoPos(total,pago,nueva.tasa,nueva.Modo);
   await onConfirmar({metodo:confirmado.Metodo,efectivo:confirmado.EfectivoUSD,tarjeta:confirmado.TarjetaUSD,cambio:confirmado.CambioUSD,FechaVenta:fecha,
    PagoMoneda:{...pago,idCotizacion:nueva.idCotizacion},resumen:confirmado});
  }catch(e){setError(e.message);}finally{setCargando(false);}
 }
 return <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
 <h2 className="font-bold text-xl">Cobrar venta</h2>
 <p className="text-xs">{offline?'Sin red: tasa autorizada previamente.':'Tasa verificada con el servidor.'} Vigencia: {cot?new Date(cot.ExpiraEn).toLocaleString():'consultando…'}</p>
 {cot&&<><p>1 USD = {tc} VES · {String(cot.tasa.FechaValor).slice(0,10)}</p>
 <label className="block">Moneda <select disabled={cargando||procesando} className="border rounded p-2" value={moneda} onChange={e=>{setMoneda(e.target.value);setEf('');setTar('');}}>{(cot.Modo==='AMBAS'?['USD','VES','MIXTA']:[cot.Modo]).map(m=><option key={m} value={m}>{m==='MIXTA'?'USD + bolívares':m}</option>)}</select></label>
 <p className="text-2xl font-bold">{importe.toFixed(2)} {moneda==='MIXTA'?'USD':moneda}</p><p className="text-xs">Equivalente: {total.toFixed(2)} USD · {red(total*tc).toFixed(2)} VES</p>
 <fieldset disabled={cargando||procesando}>
 {moneda==='MIXTA'?<div className="space-y-3">{['USD','VES'].map(m=><div key={m} className="rounded-xl bg-gray-50 p-3"><h3 className="font-semibold">Recibido en {m}</h3><div className="grid grid-cols-2 gap-2">{['Efectivo','Tarjeta'].map(k=><label key={k} className="text-sm">{k} ({m})<input type="number" min="0" step="0.01" className="border rounded p-2 w-full" placeholder="0.00" value={partes[m][k]} onChange={e=>setPartes(prev=>({...prev,[m]:{...prev[m],[k]:e.target.value}}))}/></label>)}</div></div>)}
 <label>Devolver cambio en <select className="border p-2 rounded" value={monedaCambio} onChange={e=>setMonedaCambio(e.target.value)}><option>USD</option><option>VES</option></select></label>
 <p className="text-xs text-gray-500">El cambio no puede superar el efectivo recibido en la moneda elegida.</p>
 {resumen&&<p className="font-semibold">Cambio: {resumen.Desglose[monedaCambio].Cambio.toFixed(2)} {monedaCambio}</p>}
 </div>:<>
 <select aria-label="Método de pago" className="border rounded p-2 w-full" value={metodo} onChange={e=>{setMetodo(e.target.value);setEf('');setTar('');}}><option value="EFECTIVO">Efectivo</option><option value="TARJETA">Tarjeta</option><option value="MIXTO">Efectivo + tarjeta</option></select>
 {metodo!=='TARJETA'&&<label className="block">Efectivo recibido ({moneda})<input className="border p-2 w-full" type="number" min="0" step="0.01" value={ef} placeholder={metodo==='EFECTIVO'?importe.toFixed(2):'0.00'} onChange={e=>setEf(e.target.value)}/></label>}
 {metodo==='MIXTO'&&<label className="block">Tarjeta ({moneda})<input className="border p-2 w-full" type="number" min="0" step="0.01" value={tar} onChange={e=>setTar(e.target.value)}/></label>}
 <p>{cambio<0?'Falta':'Cambio'}: {Math.abs(cambio).toFixed(2)} {moneda}</p></>}
 </fieldset>{validacion&&<p className="text-amber-700 text-sm" role="status">{validacion}</p>}</>}
 {error&&<p role="alert" className="text-red-600">{error}</p>}
 <div className="flex gap-3"><button disabled={procesando||cargando} onClick={onCerrar}>Cerrar</button><button disabled={procesando||cargando} onClick={cargar}>Actualizar tasa</button><button disabled={!valido||cargando||procesando} onClick={confirmar} className="bg-vida-green text-white rounded p-3 disabled:opacity-40">{procesando||cargando?'Procesando…':'Confirmar cobro'}</button></div>
 </div></div>;
}
