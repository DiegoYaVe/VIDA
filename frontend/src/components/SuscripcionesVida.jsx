// src/components/SuscripcionesVida.jsx
// Portal Corporativo → Afiliación y mensualidades (tareas 14–16). VIDA define
// los niveles (paquetes: kit, inscripción, mensualidad, tope de productos),
// cómo se cobra (día de vencimiento, tolerancia, multa, corte) y el nivel y la
// entrega del kit de cada tienda. Los pagos se registran en Cuentas.
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Save, Plus, Layers, Settings, Store, AlertTriangle, RefreshCw, Package, ArrowRight } from 'lucide-react';
import api from '../services/api.js';

const USD = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const FECHA = (f) => f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const ESTADO_SUSC = {
  SIN_PLAN:   { label: 'Sin nivel', color: 'bg-gray-100 text-gray-500' },
  AL_DIA:     { label: 'Al día', color: 'bg-green-100 text-green-700' },
  POR_VENCER: { label: 'Por vencer', color: 'bg-amber-100 text-amber-700' },
  VENCIDA:    { label: 'Vencida', color: 'bg-orange-100 text-orange-700' },
  SUSPENDIDA: { label: 'Suspendida', color: 'bg-red-100 text-red-700' },
};
const KIT = { PENDIENTE: 'Pendiente', PARCIAL: 'Parcial', COMPLETO: 'Completo' };
const inputCls = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white';

function Badge({ estado }) {
  const c = ESTADO_SUSC[estado] || { label: estado, color: 'bg-gray-100 text-gray-500' };
  return <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${c.color}`}>{c.label}</span>;
}

function Tarjeta({ icono: Icon, titulo, sub, children, accion }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-gray-50">
        <Icon size={18} className="text-vida-blue" />
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-gray-800">{titulo}</h3>
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
        </div>
        {accion}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

// ── Configuración del cobro ──
function Configuracion({ onGuardado }) {
  const [cfg, setCfg] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [proc, setProc] = useState(false);
  useEffect(() => { api.get('/suscripcion/config').then(r => setCfg({ ...r.data, DatosPagoVida: r.data.DatosPagoVida || '' })).catch(() => setError('No se pudo cargar')); }, []);
  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }));
  async function guardar(e) {
    e.preventDefault(); setProc(true); setMsg(''); setError('');
    if (cfg.CorteActivo && !window.confirm('Con el corte encendido, las tiendas que pasen la tolerancia sin pagar no podrán usar el sistema hasta pagar. ¿Continuar?')) { setProc(false); return; }
    try { await api.put('/suscripcion/config', cfg); setMsg('Guardado'); onGuardado?.(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo guardar'); }
    finally { setProc(false); }
  }
  if (!cfg) return <p className="text-sm text-gray-400">{error || 'Cargando…'}</p>;
  return (
    <form onSubmit={guardar} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">Día en que vence la mensualidad</span>
          <input type="number" min="1" max="28" value={cfg.DiaVencimiento} onChange={e => set('DiaVencimiento', e.target.value)} className={inputCls} /></label>
        <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">Días de tolerancia antes del corte</span>
          <input type="number" min="0" max="60" value={cfg.DiasTolerancia} onChange={e => set('DiasTolerancia', e.target.value)} className={inputCls} /></label>
        <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">Multa de reconexión (USD)</span>
          <input type="number" min="0" step="0.01" value={cfg.MultaUSD} onChange={e => set('MultaUSD', e.target.value)} className={inputCls} /></label>
      </div>
      <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">Datos para pagarle a VIDA (los ve la tienda)</span>
        <textarea rows={2} value={cfg.DatosPagoVida} onChange={e => set('DatosPagoVida', e.target.value)} maxLength={500}
          placeholder="Pago Móvil: banco, teléfono y RIF · Transferencia: cuenta" className={inputCls} /></label>
      <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${cfg.CorteActivo ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
        <input type="checkbox" checked={cfg.CorteActivo} onChange={e => set('CorteActivo', e.target.checked)} className="mt-0.5 w-4 h-4 accent-red-600" />
        <span className="text-sm">
          <b className="text-gray-800">Cortar el sistema a las tiendas que no paguen</b>
          <span className="block text-xs text-gray-500">Pasada la tolerancia, la tienda no puede vender ni usar el panel (solo ve qué debe y cómo pagar) y se le suma la multa.
            Al registrar su pago en Cuentas se reactiva sola. Apagado: se cobra, pero nadie queda bloqueado.</span>
        </span>
      </label>
      <div className="flex items-center justify-end gap-3">
        {msg && <span className="text-sm text-green-700">{msg}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
        <button type="submit" disabled={proc} className="flex items-center gap-2 bg-vida-blue text-white rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"><Save size={15} /> Guardar</button>
      </div>
    </form>
  );
}

// ── Niveles ──
function Niveles({ niveles, onCambio }) {
  const [filas, setFilas] = useState([]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(null);
  useEffect(() => { setFilas(niveles.map(n => ({ ...n, MaxProductos: n.MaxProductos ?? '', KitDescripcion: n.KitDescripcion ?? '' }))); }, [niveles]);
  const set = (i, k, v) => setFilas(f => f.map((x, j) => (j === i ? { ...x, [k]: v, _cambio: true } : x)));
  async function guardar(n, i) {
    setGuardando(i); setError('');
    try {
      if (n.idNivel) await api.put(`/suscripcion/niveles/${n.idNivel}`, n); else await api.post('/suscripcion/niveles', n);
      onCambio();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo guardar el nivel'); }
    finally { setGuardando(null); }
  }
  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-500 uppercase">
            {['Nivel', 'Hasta (productos)', 'Inscripción', 'Mensualidad', 'Qué trae el kit', 'Activo', 'Tiendas', ''].map(h => <th key={h} className="px-2 py-2 font-semibold whitespace-nowrap">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {filas.map((n, i) => (
              <tr key={n.idNivel || `nuevo-${i}`} className="align-top">
                <td className="px-2 py-2 min-w-[8rem]"><input value={n.Nombre} onChange={e => set(i, 'Nombre', e.target.value)} aria-label="Nombre del nivel" className={inputCls} /></td>
                <td className="px-2 py-2 w-28"><input type="number" min="1" value={n.MaxProductos} placeholder="Sin límite" onChange={e => set(i, 'MaxProductos', e.target.value)} aria-label="Tope de productos" className={inputCls} /></td>
                <td className="px-2 py-2 w-28"><input type="number" min="0" step="0.01" value={n.InscripcionUSD} onChange={e => set(i, 'InscripcionUSD', e.target.value)} aria-label="Inscripción USD" className={inputCls} /></td>
                <td className="px-2 py-2 w-28"><input type="number" min="0" step="0.01" value={n.MensualidadUSD} onChange={e => set(i, 'MensualidadUSD', e.target.value)} aria-label="Mensualidad USD" className={inputCls} /></td>
                <td className="px-2 py-2 min-w-[14rem]"><textarea rows={1} value={n.KitDescripcion} onChange={e => set(i, 'KitDescripcion', e.target.value)} aria-label="Contenido del kit" placeholder="Ej.: exhibidor, 20 bidones, uniforme…" className={inputCls} /></td>
                <td className="px-2 py-2 text-center"><input type="checkbox" checked={n.Status !== 'INACTIVO'} onChange={e => set(i, 'Status', e.target.checked ? 'ACTIVO' : 'INACTIVO')} aria-label="Nivel activo" className="w-4 h-4 mt-2 accent-vida-blue" /></td>
                <td className="px-2 py-2 text-center text-gray-500 pt-3">{n.Tiendas ?? 0}</td>
                <td className="px-2 py-2">
                  <button onClick={() => guardar(n, i)} disabled={!n._cambio || guardando === i}
                    className="flex items-center gap-1.5 text-xs font-semibold bg-vida-blue text-white rounded-lg px-3 py-1.5 disabled:opacity-40"><Save size={13} /> Guardar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={() => setFilas(f => [...f, { Nombre: `Nivel ${f.length + 1}`, MaxProductos: '', InscripcionUSD: 0, MensualidadUSD: 0, KitDescripcion: '', Orden: f.length + 1, Status: 'ACTIVO', _cambio: true }])}
        className="flex items-center gap-1.5 text-sm font-semibold text-vida-blue"><Plus size={15} /> Agregar nivel</button>
      <p className="text-[11px] text-gray-400">Cambiar el precio de un nivel no toca las mensualidades ya emitidas: aplica desde la siguiente.</p>
    </div>
  );
}

// ── Una tienda ──
function FilaTienda({ t, niveles, onCambio }) {
  const [f, setF] = useState({ idNivel: t.idNivel ?? '', KitEntrega: t.KitEntrega ?? '', KitNotas: t.KitNotas ?? '' });
  const [proc, setProc] = useState(false);
  const [msg, setMsg] = useState('');
  const cambio = String(f.idNivel) !== String(t.idNivel ?? '') || f.KitEntrega !== (t.KitEntrega ?? '') || f.KitNotas !== (t.KitNotas ?? '');
  const nivel = niveles.find(n => String(n.idNivel) === String(f.idNivel));
  async function guardar() {
    if (!t.idNivel && f.idNivel && nivel && Number(nivel.InscripcionUSD) > 0
      && !window.confirm(`Al afiliar a ${t.NomComercial} con ${nivel.Nombre} se le cobra la inscripción de ${USD(nivel.InscripcionUSD)}. ¿Continuar?`)) return;
    setProc(true); setMsg('');
    try {
      const r = await api.put(`/suscripcion/tiendas/${t.idPuntoVenta}`, { ...f, idNivel: f.idNivel || null, KitEntrega: f.KitEntrega || null });
      setMsg(r.data.inscripcionEmitida ? 'Afiliada: se emitió la inscripción' : 'Guardado');
      onCambio();
    } catch (err) { setMsg(err.response?.data?.error || 'No se pudo guardar'); }
    finally { setProc(false); }
  }
  return (
    <tr className="align-top">
      <td className="px-2 py-2.5 min-w-[11rem]">
        <p className="font-semibold text-gray-800">{t.NomComercial}</p>
        <p className="text-xs text-gray-400">{[t.Ciudad, t.Estado].filter(Boolean).join(', ') || '—'}</p>
        {t.FechaAfiliacion && <p className="text-[11px] text-gray-400">Afiliada el {FECHA(t.FechaAfiliacion)}</p>}
      </td>
      <td className="px-2 py-2.5 text-center text-gray-600 pt-3">{t.Productos}</td>
      <td className="px-2 py-2.5 min-w-[10rem]">
        <select value={f.idNivel} onChange={e => setF(x => ({ ...x, idNivel: e.target.value }))} aria-label={`Nivel de ${t.NomComercial}`} className={inputCls}>
          <option value="">Sin nivel (no se cobra)</option>
          {niveles.filter(n => n.Status !== 'INACTIVO' || String(n.idNivel) === String(t.idNivel)).map(n => (
            <option key={n.idNivel} value={n.idNivel}>{n.Nombre} · {USD(n.MensualidadUSD)}/mes</option>
          ))}
        </select>
        {t.idNivelSugerido && String(t.idNivelSugerido) !== String(f.idNivel) && (
          <p className="text-[11px] text-amber-700 mt-1">Por sus productos le toca {t.NombreNivelSugerido}</p>
        )}
      </td>
      <td className="px-2 py-2.5 min-w-[12rem] space-y-1.5">
        <select value={f.KitEntrega} onChange={e => setF(x => ({ ...x, KitEntrega: e.target.value }))} aria-label={`Entrega del kit de ${t.NomComercial}`} className={inputCls}>
          <option value="">—</option>
          {Object.entries(KIT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input value={f.KitNotas} onChange={e => setF(x => ({ ...x, KitNotas: e.target.value }))} placeholder="Qué se entregó / qué falta" aria-label="Notas del kit" className={inputCls} />
      </td>
      <td className="px-2 py-2.5 pt-3">
        <Badge estado={t.estado} />
        {t.diasParaCorte != null && <p className="text-[11px] text-orange-700 mt-1">Corte en {t.diasParaCorte} día{t.diasParaCorte === 1 ? '' : 's'}</p>}
      </td>
      <td className="px-2 py-2.5 pt-3 text-right whitespace-nowrap">
        <p className={`font-bold ${t.deudaUSD > 0 ? 'text-gray-900' : 'text-gray-300'}`}>{USD(t.deudaUSD)}</p>
        {t.vencimiento && <p className="text-[11px] text-gray-400">vence {FECHA(t.vencimiento)}</p>}
      </td>
      <td className="px-2 py-2.5 pt-2.5">
        <button onClick={guardar} disabled={!cambio || proc}
          className="flex items-center gap-1.5 text-xs font-semibold bg-vida-blue text-white rounded-lg px-3 py-1.5 disabled:opacity-40"><Save size={13} /> Guardar</button>
        {msg && <p className="text-[11px] text-gray-500 mt-1 max-w-[9rem]">{msg}</p>}
      </td>
    </tr>
  );
}

export default function SuscripcionesVida() {
  const [niveles, setNiveles] = useState([]);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    try {
      const [n, t] = await Promise.all([api.get('/suscripcion/niveles'), api.get('/suscripcion/tiendas')]);
      setNiveles(n.data); setDatos(t.data); setError('');
    } catch (err) { setError(err.response?.data?.error || 'No se pudo cargar'); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function generar() {
    setGenerando(true); setAviso('');
    try {
      const r = await api.post('/suscripcion/generar');
      setAviso(`Listo: ${r.data.mensualidades} mensualidad(es) y ${r.data.multas} multa(s) nuevas.`);
      cargar();
    } catch (err) { setAviso(err.response?.data?.error || 'No se pudieron generar'); }
    finally { setGenerando(false); }
  }

  const resumen = (datos?.tiendas || []).reduce((m, t) => ({ ...m, [t.estado]: (m[t.estado] || 0) + 1 }), {});
  const deudaTotal = (datos?.tiendas || []).reduce((s, t) => s + t.deudaUSD, 0);

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
      {datos && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.keys(ESTADO_SUSC).map(k => (
            <div key={k} className="bg-white rounded-2xl border border-gray-100 p-3">
              <p className="text-2xl font-black text-gray-900">{resumen[k] || 0}</p>
              <Badge estado={k} />
            </div>
          ))}
          <div className="bg-white rounded-2xl border border-gray-100 p-3">
            <p className="text-2xl font-black text-gray-900">{USD(deudaTotal)}</p>
            <p className="text-xs text-gray-500 font-semibold">por cobrar</p>
          </div>
        </div>
      )}

      <Tarjeta icono={Store} titulo="Tiendas" sub="Nivel, entrega del kit y estado de pago de cada tienda"
        accion={<div className="flex flex-wrap gap-2">
          <Link to="/cuentas" className="flex items-center gap-1.5 text-sm font-semibold text-vida-blue border border-gray-200 rounded-xl px-3 py-1.5">Registrar pagos en Cuentas <ArrowRight size={14} /></Link>
          <button onClick={generar} disabled={generando} className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl px-3 py-1.5 disabled:opacity-50">
            <RefreshCw size={14} /> Generar cargos ahora</button>
        </div>}>
        {aviso && <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 mb-3">{aviso}</p>}
        {!datos ? <p className="text-sm text-gray-400">Cargando…</p> : datos.tiendas.length === 0 ? (
          <p className="text-sm text-gray-400">No hay tiendas activas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500 uppercase">
                {['Tienda', 'Productos', 'Nivel', 'Kit', 'Estado', 'Debe', ''].map(h => <th key={h} className="px-2 py-2 font-semibold whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {datos.tiendas.map(t => <FilaTienda key={`${t.idPuntoVenta}-${t.idNivel}-${t.KitEntrega}-${t.deudaUSD}`} t={t} niveles={niveles} onCambio={cargar} />)}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-3 flex gap-1.5"><Package size={13} className="shrink-0" />
          Al asignar el primer nivel la tienda queda afiliada y se le cobra la inscripción de ese nivel. La primera mensualidad es la del mes siguiente.
          «Productos» = productos con existencia en la tienda (sirve para elegir el nivel).</p>
      </Tarjeta>

      <Tarjeta icono={Layers} titulo="Niveles (paquetes de afiliación)" sub="Kit, inscripción y mantenimiento mensual según el número de productos">
        <Niveles niveles={niveles} onCambio={cargar} />
      </Tarjeta>

      <Tarjeta icono={Settings} titulo="Cómo se cobra" sub="Vencimiento, tolerancia, multa y corte">
        {datos && !datos.config.CorteActivo && (
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-4 flex gap-2"><AlertTriangle size={14} className="text-amber-500 shrink-0" />
            El corte está apagado: se emiten los cargos, pero ninguna tienda queda bloqueada.</p>
        )}
        <Configuracion onGuardado={cargar} />
      </Tarjeta>
    </div>
  );
}
