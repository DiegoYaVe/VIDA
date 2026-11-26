// src/components/RegistrosWeb.jsx
// Portal Corporativo → Registros de la web: lo que la gente deja en el
// formulario "Regístrate" de comercializadoravida.com (sql/64). VIDA los
// contacta y marca en qué quedó cada uno.
import { useState, useEffect, useCallback } from 'react';
import { Search, Mail, MessageCircle, RefreshCw, Inbox } from 'lucide-react';
import api from '../services/api.js';

const INTERES = { tienda: 'Abrir una Tienda VIDA', proveedor: 'Ser proveedor o aliado', inversion: 'Invertir / asociarme', info: 'Información general' };
const ESTADOS = {
  NUEVO:      { label: 'Nuevo', color: 'bg-blue-100 text-blue-700' },
  CONTACTADO: { label: 'Contactado', color: 'bg-amber-100 text-amber-700' },
  CONVERTIDO: { label: 'Se afilió', color: 'bg-green-100 text-green-700' },
  DESCARTADO: { label: 'Descartado', color: 'bg-gray-100 text-gray-500' },
};
const FECHA = (f) => new Date(f).toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
// wa.me necesita solo dígitos, con código de país
const whatsapp = (tel) => { const d = String(tel || '').replace(/\D/g, ''); return d ? `https://wa.me/${d.startsWith('0') ? '58' + d.slice(1) : d}` : null; };

function Fila({ r, onCambio }) {
  const [notas, setNotas] = useState(r.Notas || '');
  const [proc, setProc] = useState(false);
  async function guardar(cambios) {
    setProc(true);
    try { await api.patch(`/prospectos/${r.idProspecto}`, cambios); onCambio(); }
    catch (e) { alert(e.response?.data?.error || 'No se pudo guardar'); }
    finally { setProc(false); }
  }
  const wa = whatsapp(r.Telefono);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="flex-1 min-w-[12rem]">
          <p className="font-bold text-gray-900">{r.Nombre}</p>
          <p className="text-xs text-gray-400">{FECHA(r.FechaAlta)} · {INTERES[r.Interes] || 'No indicó qué le interesa'}</p>
        </div>
        <select value={r.Status} disabled={proc} onChange={e => guardar({ Status: e.target.value })} aria-label={`Estado de ${r.Nombre}`}
          className={`text-xs font-semibold rounded-full px-3 py-1.5 border-0 ${ESTADOS[r.Status]?.color || ''}`}>
          {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={`mailto:${r.Email}`} className="inline-flex items-center gap-1.5 text-sm text-vida-blue border border-gray-200 rounded-xl px-3 py-1.5 hover:bg-gray-50"><Mail size={14} /> {r.Email}</a>
        {wa && <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-green-700 border border-gray-200 rounded-xl px-3 py-1.5 hover:bg-gray-50"><MessageCircle size={14} /> {r.Telefono}</a>}
      </div>
      {r.Mensaje && <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2 whitespace-pre-line">{r.Mensaje}</p>}
      <div className="flex gap-2">
        <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas: qué se habló, siguiente paso…" aria-label={`Notas de ${r.Nombre}`}
          className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-sm" maxLength={1000} />
        <button disabled={proc || notas === (r.Notas || '')} onClick={() => guardar({ Notas: notas })}
          className="text-sm font-semibold bg-vida-blue text-white rounded-xl px-4 py-2 disabled:opacity-40">Guardar</button>
      </div>
    </div>
  );
}

export default function RegistrosWeb() {
  const [datos, setDatos] = useState(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const r = await api.get('/prospectos', { params: { status, search: q.trim(), limit: 100 } });
      setDatos(r.data); setError('');
    } catch (e) { setError(e.response?.data?.error || 'No se pudieron cargar los registros'); }
  }, [status, q]);
  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t); }, [cargar]);

  return (
    <div className="space-y-4 max-w-4xl">
      <p className="text-sm text-gray-500">Lo que deja la gente en el formulario «Regístrate» de comercializadoravida.com. También llega un aviso por correo.</p>
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, correo o teléfono" aria-label="Buscar registros"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm" />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Filtrar por estado" className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={cargar} aria-label="Actualizar" className="border border-gray-200 rounded-xl px-3 py-2 text-gray-500 hover:text-vida-blue"><RefreshCw size={15} /></button>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
      {!datos ? <p className="text-sm text-gray-400">Cargando…</p> : datos.data.length === 0 ? (
        <div className="text-center py-14 text-gray-400"><Inbox size={40} className="mx-auto mb-3 opacity-40" /><p>{q || status ? 'Ningún registro coincide' : 'Todavía no hay registros desde la web'}</p></div>
      ) : (
        <>
          <p className="text-xs text-gray-400">{datos.total} registro{datos.total === 1 ? '' : 's'}{datos.nuevos ? ` · ${datos.nuevos} sin atender` : ''}</p>
          <div className="space-y-3">{datos.data.map(r => <Fila key={`${r.idProspecto}-${r.Status}-${r.Notas}`} r={r} onCambio={cargar} />)}</div>
        </>
      )}
    </div>
  );
}
