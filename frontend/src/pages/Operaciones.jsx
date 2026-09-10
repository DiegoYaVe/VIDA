// src/pages/Operaciones.jsx
// Panel admin unificado (ops): completar recargas de servicios, entregar/cancelar
// canjes de premios y expirar puntos por inactividad.
import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, Phone, Gift, Star, RefreshCw, Check, X, Clock, Hourglass,
} from 'lucide-react';
import api from '../services/api.js';
import { useToast } from '../components/Toast.jsx';

const USD = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (f) => { try { return new Date(f).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

const TABS = [
  { id: 'recargas', label: 'Recargas', icon: Phone },
  { id: 'premios',  label: 'Canjes de premios', icon: Gift },
  { id: 'puntos',   label: 'Vencimiento de puntos', icon: Hourglass },
];

function TabRecargas() {
  const toast = useToast();
  const [ordenes, setOrdenes] = useState([]);
  const [cargando, setCarg] = useState(true);
  const [proc, setProc] = useState(null);

  const cargar = useCallback(async () => {
    setCarg(true);
    try { setOrdenes((await api.get('/delivery/admin/servicios', { params: { status: 'PROCESANDO' } })).data || []); }
    catch { setOrdenes([]); } finally { setCarg(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function accion(o, Status) {
    setProc(o.idOrden);
    try {
      await api.patch(`/delivery/admin/servicios/${o.idOrden}/estado`, { Status });
      toast.success(Status === 'COMPLETADO' ? 'Recarga completada' : 'Recarga rechazada', o.Referencia);
      setOrdenes(prev => prev.filter(x => x.idOrden !== o.idOrden));
    } catch (e) { toast.error('Error', e.response?.data?.error || ''); } finally { setProc(null); }
  }

  if (cargando) return <p className="text-center text-gray-400 py-10 text-sm">Cargando…</p>;
  if (!ordenes.length) return <div className="text-center text-gray-400 py-16"><Phone size={40} className="mx-auto mb-3 opacity-20" /><p>No hay recargas pendientes.</p></div>;

  return (
    <div className="space-y-2">
      {ordenes.map(o => (
        <div key={o.idOrden} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <p className="font-bold text-gray-800">{o.NombreOperadora} · {o.NumeroDestino}</p>
            <p className="text-xs text-gray-400">{o.Cliente || 'Cliente'} · {o.MetodoPago} · {o.Referencia} · {fecha(o.FechaAlta)}</p>
          </div>
          <span className="font-black text-gray-900">{USD(o.MontoUSD)}</span>
          <div className="flex gap-2">
            <button onClick={() => accion(o, 'COMPLETADO')} disabled={proc === o.idOrden}
              className="flex items-center gap-1 bg-vida-green text-white rounded-lg px-3 py-1.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"><Check size={14} /> Completar</button>
            <button onClick={() => accion(o, 'RECHAZADO')} disabled={proc === o.idOrden}
              className="flex items-center gap-1 border border-red-200 text-red-500 rounded-lg px-3 py-1.5 text-sm font-semibold hover:bg-red-50 disabled:opacity-50"><X size={14} /> Rechazar</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TabPremios() {
  const toast = useToast();
  const [canjes, setCanjes] = useState([]);
  const [cargando, setCarg] = useState(true);
  const [proc, setProc] = useState(null);

  const cargar = useCallback(async () => {
    setCarg(true);
    try { setCanjes((await api.get('/delivery/admin/premios/canjes', { params: { status: 'PENDIENTE' } })).data || []); }
    catch { setCanjes([]); } finally { setCarg(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function accion(c, Status) {
    setProc(c.idCanje);
    try {
      await api.patch(`/delivery/admin/premios/canjes/${c.idCanje}/estado`, { Status });
      toast.success(Status === 'ENTREGADO' ? 'Premio entregado' : 'Canje cancelado', c.Codigo);
      setCanjes(prev => prev.filter(x => x.idCanje !== c.idCanje));
    } catch (e) { toast.error('Error', e.response?.data?.error || ''); } finally { setProc(null); }
  }

  if (cargando) return <p className="text-center text-gray-400 py-10 text-sm">Cargando…</p>;
  if (!canjes.length) return <div className="text-center text-gray-400 py-16"><Gift size={40} className="mx-auto mb-3 opacity-20" /><p>No hay canjes pendientes.</p></div>;

  return (
    <div className="space-y-2">
      {canjes.map(c => (
        <div key={c.idCanje} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <p className="font-bold text-gray-800">{c.NombrePremio}</p>
            <p className="text-xs text-gray-400">{c.Cliente || 'Cliente'} · <span className="font-mono">{c.Codigo}</span> · {fecha(c.FechaAlta)}</p>
          </div>
          <span className="font-bold text-amber-600 flex items-center gap-1"><Star size={13} /> {c.CostoPuntos} pts</span>
          <div className="flex gap-2">
            <button onClick={() => accion(c, 'ENTREGADO')} disabled={proc === c.idCanje}
              className="flex items-center gap-1 bg-vida-green text-white rounded-lg px-3 py-1.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"><Check size={14} /> Entregar</button>
            <button onClick={() => accion(c, 'CANCELADO')} disabled={proc === c.idCanje}
              className="flex items-center gap-1 border border-red-200 text-red-500 rounded-lg px-3 py-1.5 text-sm font-semibold hover:bg-red-50 disabled:opacity-50"><X size={14} /> Cancelar</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TabPuntos() {
  const toast = useToast();
  const [proc, setProc] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function expirar() {
    if (!window.confirm('Expirar los puntos de clientes inactivos según la política configurada. ¿Continuar?')) return;
    setProc(true); setResultado(null);
    try {
      const r = await api.post('/delivery/admin/puntos/expirar-inactivos');
      setResultado(r.data);
      toast.success('Proceso ejecutado', `${r.data.expirados} cliente(s) afectados`);
    } catch (e) { toast.error('Error', e.response?.data?.error || ''); } finally { setProc(false); }
  }

  return (
    <div className="max-w-xl bg-white rounded-2xl border border-gray-100 p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-11 h-11 rounded-xl bg-vida-blue/10 flex items-center justify-center"><Clock size={20} className="text-vida-blue" /></div>
        <div>
          <h3 className="font-black text-gray-800">Vencimiento de puntos por inactividad</h3>
          <p className="text-xs text-gray-400">Expira el saldo de clientes sin movimientos según <code>MesesInactividadVence</code>.</p>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-4">Idealmente esto lo dispara un cron a diario. Aquí puedes ejecutarlo manualmente.</p>
      <button onClick={expirar} disabled={proc}
        className="flex items-center gap-2 bg-vida-blue text-white rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
        <Hourglass size={15} /> {proc ? 'Ejecutando…' : 'Expirar puntos inactivos'}
      </button>
      {resultado && (
        <div className="mt-4 text-sm bg-gray-50 rounded-xl p-3 text-gray-600">
          Política: <b>{resultado.meses}</b> meses · Clientes afectados: <b>{resultado.expirados}</b>{resultado.mensaje ? ` · ${resultado.mensaje}` : ''}
        </div>
      )}
    </div>
  );
}

export default function Operaciones() {
  const [tab, setTab] = useState('recargas');
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-black text-gray-900 flex items-center gap-2"><ClipboardList size={22} className="text-vida-blue" /> Operaciones</h1>
        <p className="text-xs text-gray-400 mt-0.5">Recargas, canjes de premios y vencimiento de puntos</p>
      </div>
      <div className="bg-white border-b border-gray-100 px-6">
        <div className="flex gap-1">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-3.5 text-sm font-semibold border-b-2 transition-all whitespace-nowrap
                  ${tab === t.id ? 'border-vida-blue text-vida-blue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="p-6">
        {tab === 'recargas' && <TabRecargas />}
        {tab === 'premios'  && <TabPremios />}
        {tab === 'puntos'   && <TabPuntos />}
      </div>
    </div>
  );
}
