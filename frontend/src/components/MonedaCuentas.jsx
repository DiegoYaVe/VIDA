import { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldCheck, TriangleAlert, WalletCards } from 'lucide-react';
import api from '../services/api.js';
import { useToast } from './Toast.jsx';
import { hoyCaracas } from '../utils/fechas.js';

export default function MonedaCuentas() {
  const toast = useToast();
  const [cfg,setCfg]=useState(null);
  const [t,setT]=useState('');
  const [fecha,setFecha]=useState(hoyCaracas());
  const [fuente,setFuente]=useState('');
  const [aviso,setAviso]=useState(null);
  const [busy,setBusy]=useState(false);
  const cargar=()=>api.get('/cuentas/config-moneda').then(r=>setCfg(r.data));

  useEffect(()=>{cargar().catch(()=>setAviso({tipo:'error',texto:'No se pudo cargar la configuración monetaria'}));},[]);

  async function guardar(path,body,method='post',exito='Configuración guardada correctamente') {
    setBusy(true); setAviso(null);
    try {
      await api[method](path,body); await cargar();
      setAviso({tipo:'ok',texto:exito}); toast.success(exito);
    } catch(e) {
      const texto=e.response?.data?.error||'No se pudo guardar';
      setAviso({tipo:'error',texto}); toast.error(texto);
    } finally { setBusy(false); }
  }

  if (!cfg) return <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500">Cargando configuración monetaria…</div>;
  const automatica=cfg.FuenteTasa==='BCV_TODAY';

  return <details open className="mb-6 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
    <summary className="font-bold cursor-pointer px-5 py-4 flex items-center gap-2 bg-slate-50/70"><WalletCards size={18} className="text-vida-blue"/> Monedas y tasa para Cuentas / POS / App</summary>
    <div className="p-5 space-y-5">
      <p className="text-sm text-gray-500">Configura qué monedas acepta VIDA. El saldo contable permanece en USD y cada operación conserva la tasa e importes históricos en ambas monedas.</p>

      {aviso && <div role="status" className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${aviso.tipo==='ok'?'border-emerald-200 bg-emerald-50 text-emerald-800':'border-red-200 bg-red-50 text-red-700'}`}>
        {aviso.tipo==='ok'?<CheckCircle2 size={20}/>:<TriangleAlert size={20}/>}<div><p className="font-semibold">{aviso.tipo==='ok'?'Cambios guardados':'No se pudo guardar'}</p><p className="text-sm">{aviso.texto}</p></div>
      </div>}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">1. Monedas permitidas</p>
          <select disabled={busy} value={cfg.Modo} onChange={e=>guardar('/cuentas/config-moneda',{Modo:e.target.value,FuenteTasa:cfg.FuenteTasa},'put',`Modo ${e.target.value} guardado`)} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 bg-white font-semibold">
            <option value="USD">Solo dólares (USD)</option><option value="VES">Solo bolívares (VES)</option><option value="AMBAS">Dólares y bolívares (AMBAS)</option>
          </select><p className="text-xs text-gray-500 mt-2">Actual: <b>{cfg.Modo}</b></p>
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">2. Fuente de la tasa</p>
          <select disabled={busy} value={cfg.FuenteTasa} onChange={e=>guardar('/cuentas/config-moneda',{Modo:cfg.Modo,FuenteTasa:e.target.value},'put',e.target.value==='BCV_TODAY'?'Consulta automática activada':'Captura manual activada')} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 bg-white font-semibold">
            <option value="BCV_TODAY">Automática · bcv.today</option><option value="MANUAL">Manual · autorizada por Matriz</option>
          </select><p className="text-xs text-gray-500 mt-2">{automatica?'VIDA consultará y validará la tasa al cobrar.':'La Matriz deberá registrar cada tasa manualmente.'}</p>
        </div>
      </section>

      {automatica ? <section className="rounded-xl border border-sky-200 bg-sky-50/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div>
          <p className="flex items-center gap-2 font-bold text-slate-800"><ShieldCheck size={18} className="text-sky-700"/> Tasa automática vigente</p>
          {cfg.tasa ? <><p className="text-2xl font-black text-vida-blue mt-1">1 USD = {Number(cfg.tasa.VESporUSD).toLocaleString('es-VE',{maximumFractionDigits:8})} VES</p><p className="text-xs text-gray-500 mt-1">Fecha efectiva: {String(cfg.tasa.FechaValor).slice(0,10)} · Fuente: {cfg.tasa.Fuente}{cfg.tasa.Vigente?'':' · VENCIDA'}</p></> : <p className="text-sm text-amber-700 mt-1">Todavía no hay una tasa registrada.</p>}
        </div><button disabled={busy} onClick={()=>guardar('/cuentas/tasas/actualizar',{},'post','Tasa actualizada y guardada correctamente')} className="inline-flex items-center gap-2 bg-vida-blue text-white rounded-xl px-4 py-2.5 font-semibold disabled:opacity-50"><RefreshCw size={16} className={busy?'animate-spin':''}/> {busy?'Actualizando…':'Actualizar tasa'}</button></div>
        {cfg.Advertencia && <p role="alert" className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-800">{cfg.Advertencia}. La tasa guardada se muestra como referencia y no se utilizará silenciosamente.</p>}
      </section> : <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
        <p className="font-bold text-slate-800">Registrar tasa manual</p><p className="text-xs text-gray-500 mt-1 mb-3">Solo se utiliza porque seleccionaste fuente Manual. Fecha efectiva de Venezuela; máximo 4 días de antigüedad.</p>
        <div className="grid gap-2 md:grid-cols-[1fr_170px_1.4fr_auto]">
          <input aria-label="Bolívares por dólar" type="number" min="0" step="0.00000001" value={t} onChange={e=>setT(e.target.value)} placeholder="VES por USD" className="border border-gray-300 p-2.5 rounded-xl bg-white"/>
          <input aria-label="Fecha valor" type="date" value={fecha} onChange={e=>setFecha(e.target.value)} className="border border-gray-300 p-2.5 rounded-xl bg-white"/>
          <input aria-label="Fuente de la tasa" value={fuente} maxLength={200} onChange={e=>setFuente(e.target.value)} placeholder="Fuente verificable" className="border border-gray-300 p-2.5 rounded-xl bg-white"/>
          <button disabled={busy||!t||!fuente} onClick={()=>guardar('/cuentas/tasas',{VESporUSD:Number(t),FechaValor:fecha,Fuente:fuente},'post','Tasa manual registrada correctamente')} className="bg-vida-blue text-white rounded-xl px-4 py-2.5 font-semibold disabled:opacity-50">Registrar</button>
        </div>
      </section>}
    </div>
  </details>;
}
