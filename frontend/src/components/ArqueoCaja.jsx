import {useState} from 'react';
import api from '../services/api.js';
import {useToast} from './Toast.jsx';
import {getQueue} from '../services/offlineQueue.js';
import {useAuthStore} from '../store/authStore.js';

export default function ArqueoCaja({turno,ventas,esperado:espProp,onClose,onCerrado}) {
 const toast=useToast();
 const usuario=useAuthStore(s=>s.usuario);
 const [conteo,setConteo]=useState({USD:'',VES:''});
 const [observaciones,setObservaciones]=useState('');
 const [loading,setLoading]=useState(false),[cerrado,setCerrado]=useState(null);
 async function confirmar() {
  if(['USD','VES'].some(m=>conteo[m]===''||!Number.isFinite(Number(conteo[m]))||Number(conteo[m])<0)) return toast.error('Ingresa ambos conteos; usa cero si no hay efectivo');
  setLoading(true);
  try {
   const pendientes=await getQueue();
   if(pendientes.some(v=>String(v.idPuntoVenta)===String(turno.idPuntoVenta)&&(!v.Propietario||['idBranch','idCuenta'].every(k=>String(v.Propietario[k])===String(usuario[k]))))) throw new Error('Hay ventas pendientes en este navegador para la tienda. Sincronízalas antes de cerrar.');
   const {data}=await api.post('/caja/cierre',{idTurno:turno.idTurno,MontoCierre:Number(conteo.USD),MontoCierreVES:Number(conteo.VES),Observaciones:observaciones||null});
   setCerrado(data.turno);toast.success('Caja cerrada correctamente');
  } catch(e){toast.error(e.response?.data?.error||e.message||'Error al cerrar caja');}
  finally {setLoading(false);}
 }
 let guardado=null;try {guardado=JSON.parse(cerrado?.ArqueoMonedasJSON||'null');}catch{}
 return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
  <h2 className="text-xl font-bold">{cerrado?'Turno cerrado':'Arqueo por moneda'}</h2>
  <p className="text-sm text-gray-500">Cuenta dólares y bolívares por separado. Las tarjetas no forman parte del efectivo.</p>
  {!cerrado&&<p className="text-xs text-amber-700">Antes de cerrar, sincroniza las ventas pendientes de todos los equipos de esta tienda.</p>}
  {['USD','VES'].map(m=>{
   // Esperado autoritativo del servidor (incluye movimientos de caja); si no
   // llega, se recompone con apertura + ventas en efectivo de esa moneda.
   const esperado=espProp?.[m]!=null?Number(espProp[m]):Number(m==='USD'?turno.MontoApertura:turno.MontoAperturaVES||0)+Number(ventas?.['EfectivoOriginal'+m]||0);
   const diferencia=guardado?.[m]?.Diferencia??(conteo[m]!==''?Number(conteo[m])-esperado:null);
   return <div key={m} className="bg-gray-50 rounded-xl p-4 space-y-2">
    <h3 className="font-bold">{m}</h3><p>Esperado: {Number(guardado?.[m]?.Esperado??esperado).toFixed(2)} {m}</p>
    {cerrado?<p>Contado: {Number(guardado?.[m]?.Contado).toFixed(2)} {m}</p>:<label className="block">Efectivo contado ({m})<input disabled={loading} type="number" min="0" step="0.01" className="input-field" placeholder="0.00" value={conteo[m]} onChange={e=>setConteo(v=>({...v,[m]:e.target.value}))}/></label>}
    {diferencia!==null&&<p className={diferencia<0?'text-red-600 font-semibold':'text-green-700 font-semibold'}>Diferencia: {diferencia.toFixed(2)} {m}</p>}
   </div>;
  })}
  {!cerrado&&<label className="block">Observaciones<textarea disabled={loading} className="input-field" value={observaciones} onChange={e=>setObservaciones(e.target.value)}/></label>}
  <div className="flex gap-3">{cerrado?<button className="btn-primary" onClick={onCerrado}>Listo</button>:<><button disabled={loading} onClick={onClose}>Volver</button><button className="btn-primary" disabled={loading} onClick={confirmar}>{loading?'Cerrando…':'Confirmar cierre'}</button></>}</div>
 </div></div>;
}

export function ArqueoHistorial({turno,campo}) {
 let a;try {a=JSON.parse(turno.ArqueoMonedasJSON||'null');}catch{}
 if(a) return <div>{['USD','VES'].map(m=><div key={m} className={campo==='Diferencia'&&a[m][campo]<0?'text-red-600':''}>{Number(a[m][campo]).toFixed(2)} {m}</div>)}</div>;
 const valor=turno[campo==='Contado'?'MontoCierre':'Diferencia'];
 return valor==null?'—':<span>{Number(valor).toFixed(2)} USD<small className="block text-gray-400">Equivalente · histórico</small></span>;
}
