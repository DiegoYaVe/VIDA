import { useEffect, useState } from 'react';
import api from '../services/api.js';
export default function MonedaCuentas() {
 const [cfg,setCfg]=useState(null),[t,setT]=useState(''),[fecha,setFecha]=useState(new Date().toISOString().slice(0,10)),[fuente,setFuente]=useState(''),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
 const cargar=()=>api.get('/cuentas/config-moneda').then(r=>setCfg(r.data));
 useEffect(()=>{cargar().catch(()=>setMsg('No se pudo cargar la configuración monetaria'));},[]);
 async function guardar(path,body,method='post') {setBusy(true);setMsg('');try {await api[method](path,body);await cargar();setMsg('Guardado');}catch(e){setMsg(e.response?.data?.error||'No se pudo guardar');}finally{setBusy(false);}}
 return <details className="mb-6 rounded-xl border p-4 bg-white"><summary className="font-bold cursor-pointer">Monedas y tasa para Cuentas / POS</summary>
 <p className="text-sm text-gray-500 my-3">Aplica a Cuentas y POS. Las apps siguen en USD; cada venta POS usa una moneda, con efectivo y/o tarjeta. Tasa en bolívares por 1 USD. En automático se consulta bcv.today al abrir el cobro y al confirmarlo; es un proveedor externo, no una API operada por el BCV. El saldo de las deudas permanece en USD.</p>
 {cfg && <><label>Monedas permitidas <select disabled={busy} value={cfg.Modo} onChange={e=>guardar('/cuentas/config-moneda',{Modo:e.target.value,FuenteTasa:cfg.FuenteTasa},'put')} className="border rounded p-2 mx-2"><option>USD</option><option>VES</option><option>AMBAS</option></select></label>
 <label className="block mt-3">Fuente de la tasa <select disabled={busy} value={cfg.FuenteTasa} onChange={e=>guardar('/cuentas/config-moneda',{Modo:cfg.Modo,FuenteTasa:e.target.value},'put')} className="border rounded p-2 mx-2"><option value="BCV_TODAY">Automática: bcv.today</option><option value="MANUAL">Manual autorizada por Matriz</option></select></label>
 {cfg.FuenteTasa==='BCV_TODAY' && <button disabled={busy} onClick={()=>guardar('/cuentas/tasas/actualizar',{})} className="bg-vida-blue text-white rounded px-3 py-2 mt-3">Actualizar tasa</button>}
 {cfg.Advertencia && <p role="alert" className="text-amber-700 mt-2">{cfg.Advertencia}. La tasa guardada se muestra solo como referencia; no se cobrará automáticamente con ella.</p>}
 <p className="my-2 text-sm">Tasa: {cfg.tasa ? `${cfg.tasa.VESporUSD} · ${String(cfg.tasa.FechaValor).slice(0,10)} · ${cfg.tasa.Fuente}${cfg.tasa.Vigente?'':' (vencida)'}`:'Sin registrar; USD sin equivalencia histórica'}</p></>}
 <p className="text-xs text-gray-500 mb-2">Carga manual de respaldo (solo se utiliza al seleccionar fuente Manual). Fecha efectiva en Venezuela; máximo 4 días de antigüedad.</p>
 <div className="flex gap-2 flex-wrap"><input aria-label="Bolívares por dólar" type="number" min="0" step="0.00000001" value={t} onChange={e=>setT(e.target.value)} placeholder="VES por USD" className="border p-2 rounded"/>
 <input aria-label="Fecha valor" type="date" value={fecha} onChange={e=>setFecha(e.target.value)} className="border p-2 rounded"/>
 <input aria-label="Fuente de la tasa" value={fuente} maxLength={200} onChange={e=>setFuente(e.target.value)} placeholder="Fuente verificable de la tasa" className="border p-2 rounded"/>
 <button disabled={busy||!t||!fuente} onClick={()=>guardar('/cuentas/tasas',{VESporUSD:Number(t),FechaValor:fecha,Fuente:fuente})} className="bg-vida-blue text-white rounded px-3 py-2 disabled:opacity-50">Registrar tasa</button></div><p role="status" className="text-sm mt-2">{msg}</p></details>;
}
