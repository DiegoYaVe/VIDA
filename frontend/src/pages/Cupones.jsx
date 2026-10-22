// src/pages/Cupones.jsx
// Cupones — códigos de descuento canjeables en checkout (sql/32 + cupones.controller).
// CRUD para el empresario/corporativo: crear, editar, activar/desactivar y ver usos.
// Pestaña "Automáticos": los cupones personales que el sistema envía a quien
// dejó de comprar (configuración en Logística → Configuración).
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Ticket, Plus, RefreshCw, Pencil, Power, X, Percent, DollarSign, Send, Settings,
} from 'lucide-react';
import api from '../services/api.js';

const TIPOS   = [{ v: 'DESCUENTO_PCT', l: '% de descuento' }, { v: 'DESCUENTO_USD', l: '$ de descuento' }];
const CANALES = [{ v: 'TODO', l: 'Todos' }, { v: 'POS', l: 'Punto de venta' }, { v: 'DELIVERY', l: 'Delivery / App' }];

const FORM0 = {
  Codigo: '', Nombre: '', Tipo: 'DESCUENTO_PCT', Valor: '',
  MinCompra: '', MaxDescuento: '', Canal: 'TODO',
  UsosMax: '', UsosPorCliente: '1', FechaInicio: '', FechaFin: '', Descripcion: '',
};

const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const fmtFecha = (d) => (d ? String(d).slice(0, 10) : '—');

const hoyCaracas = () => new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);

function CuponesAutomaticos() {
  const [lista, setLista] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setLista((await api.get('/cupones', { params: { origen: 'INACTIVIDAD' } })).data || []); } catch { setLista([]); }
    try {
      const c = {};
      ((await api.get('/delivery/admin/config')).data || []).forEach(x => { c[x.Clave] = x.Valor; });
      setCfg(c);
    } catch { setCfg(null); }
    setCargando(false);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function enviarAhora() {
    setEnviando(true); setMsg('');
    try {
      const r = await api.post('/cupones/automaticos/emitir');
      setMsg(r.data.emitidos ? `Se enviaron ${r.data.emitidos} cupón(es).` : 'No hay clientes que cumplan las condiciones hoy.');
      cargar();
    } catch (e) { setMsg(e.response?.data?.error || 'No se pudo enviar'); }
    finally { setEnviando(false); }
  }

  const activo = cfg && String(cfg.CuponInactivoActivo).trim() === '1';
  const hoy = hoyCaracas();
  const estado = (k) => k.UsosActuales > 0 ? ['Usado', 'bg-green-100 text-green-700']
    : k.FechaFin && String(k.FechaFin).slice(0, 10) < hoy ? ['Vencido', 'bg-gray-100 text-gray-500'] : ['Vigente', 'bg-blue-50 text-vida-blue'];
  const usados = lista.filter(k => k.UsosActuales > 0).length;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-wrap items-center gap-4 justify-between">
        <div className="text-sm text-gray-600 max-w-2xl">
          {cfg ? (activo ? (
            <p>Activo: a quien lleva <b>{cfg.CuponInactivoDias} días</b> sin recibir un pedido se le envía un cupón de <b>{cfg.CuponInactivoPct}%</b>
              {Number(cfg.CuponInactivoMaxUSD) > 0 ? <> (hasta <b>${Number(cfg.CuponInactivoMaxUSD).toFixed(2)}</b>)</> : null}, válido <b>{cfg.CuponInactivoVigenciaDias} días</b>,
              por push y correo. Se repite como máximo cada {cfg.CuponInactivoRepetirDias} días. Corre solo una vez al día.</p>
          ) : <p><b>Apagado.</b> Actívalo y ajusta los días, el descuento y la vigencia en la configuración del delivery.</p>)
            : <p>No se pudo leer la configuración.</p>}
          <p className="text-xs text-gray-400 mt-1">Enviados: {lista.length} · usados: {usados}{lista.length ? ` (${Math.round(usados * 100 / lista.length)}%)` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/logistica?tab=config" className="flex items-center gap-2 text-sm text-gray-600 border border-gray-200 px-3 py-2 rounded-xl hover:text-vida-blue">
            <Settings size={14} /> Configurar
          </Link>
          <button onClick={enviarAhora} disabled={enviando || !activo}
            className="flex items-center gap-2 text-sm font-semibold bg-vida-blue text-white px-4 py-2 rounded-xl hover:opacity-90 disabled:opacity-40">
            <Send size={14} /> {enviando ? 'Enviando…' : 'Enviar ahora'}
          </button>
        </div>
        {msg && <p className="w-full text-sm font-semibold text-vida-blue">{msg}</p>}
      </div>

      {cargando ? <p className="text-center text-gray-400 py-10 text-sm">Cargando…</p> : lista.length === 0 ? (
        <p className="text-center text-gray-400 py-12 text-sm">Todavía no se ha enviado ningún cupón automático.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 text-xs border-b border-gray-100">
                <th className="px-4 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 font-semibold">Código</th>
                <th className="px-4 py-3 font-semibold">Descuento</th>
                <th className="px-4 py-3 font-semibold">Enviado</th>
                <th className="px-4 py-3 font-semibold">Vence</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lista.map(k => {
                const [txt, cls] = estado(k);
                return (
                  <tr key={k.idCupon}>
                    <td className="px-4 py-3"><p className="font-semibold text-gray-800">{k.Cliente || `Cliente #${k.idClienteExclusivo}`}</p>
                      {k.Telefono && <p className="text-xs text-gray-400">{k.Telefono}</p>}</td>
                    <td className="px-4 py-3 font-mono font-bold text-gray-700">{k.Codigo}</td>
                    <td className="px-4 py-3">{Number(k.Valor)}%{k.MaxDescuento ? ` · tope ${money(k.MaxDescuento)}` : ''}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtFecha(k.FechaAlta)}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtFecha(k.FechaFin)}</td>
                    <td className="px-4 py-3"><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>{txt}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Cupones() {
  const [vista, setVista] = useState('manuales');
  const [cupones, setCupones]   = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal]       = useState(false);
  const [form, setForm]         = useState(FORM0);
  const [editId, setEditId]     = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]       = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await api.get('/cupones');
      setCupones(Array.isArray(r.data) ? r.data : []);
    } catch { setCupones([]); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  function abrirNuevo() { setForm(FORM0); setEditId(null); setError(''); setModal(true); }
  function abrirEditar(c) {
    setForm({
      Codigo: c.Codigo, Nombre: c.Nombre, Tipo: c.Tipo, Valor: c.Valor ?? '',
      MinCompra: c.MinCompra ?? '', MaxDescuento: c.MaxDescuento ?? '', Canal: c.Canal || 'TODO',
      UsosMax: c.UsosMax ?? '', UsosPorCliente: c.UsosPorCliente ?? '',
      FechaInicio: fmtFecha(c.FechaInicio) === '—' ? '' : fmtFecha(c.FechaInicio),
      FechaFin: fmtFecha(c.FechaFin) === '—' ? '' : fmtFecha(c.FechaFin),
      Descripcion: c.Descripcion ?? '',
    });
    setEditId(c.idCupon); setError(''); setModal(true);
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function guardar() {
    setError('');
    if (!form.Codigo.trim()) return setError('El código es obligatorio');
    if (!form.Nombre.trim()) return setError('El nombre es obligatorio');
    if (!(parseFloat(form.Valor) > 0)) return setError('El valor debe ser mayor a 0');
    if (form.Tipo === 'DESCUENTO_PCT' && parseFloat(form.Valor) > 100) return setError('El porcentaje no puede superar 100');

    const payload = {
      ...form,
      Valor: parseFloat(form.Valor),
      MinCompra: form.MinCompra === '' ? null : parseFloat(form.MinCompra),
      MaxDescuento: form.MaxDescuento === '' ? null : parseFloat(form.MaxDescuento),
      UsosMax: form.UsosMax === '' ? null : parseInt(form.UsosMax),
      UsosPorCliente: form.UsosPorCliente === '' ? null : parseInt(form.UsosPorCliente),
      FechaInicio: form.FechaInicio || null,
      FechaFin: form.FechaFin || null,
    };
    setGuardando(true);
    try {
      if (editId) {
        // El código no se edita (es la llave del cupón); se manda el resto.
        const { Codigo, ...resto } = payload;
        await api.put(`/cupones/${editId}`, resto);
      } else {
        await api.post('/cupones', payload);
      }
      setModal(false);
      await cargar();
    } catch (e) {
      setError(e?.response?.data?.error || 'No se pudo guardar el cupón');
    } finally { setGuardando(false); }
  }

  async function toggle(c) {
    try {
      if (c.Status === 'ACTIVO') await api.delete(`/cupones/${c.idCupon}`);
      else await api.put(`/cupones/${c.idCupon}`, { Status: 'ACTIVO' });
      await cargar();
    } catch {}
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <Ticket size={22} className="text-vida-blue" /> Cupones
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Códigos de descuento para tus clientes (POS y app)</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={cargar} className="flex items-center gap-2 text-sm text-gray-500 hover:text-vida-blue border border-gray-200 px-3 py-2 rounded-xl">
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
          </button>
          <button onClick={abrirNuevo} className="flex items-center gap-2 text-sm font-semibold bg-vida-blue text-white px-4 py-2 rounded-xl hover:opacity-90">
            <Plus size={16} /> Nuevo cupón
          </button>
        </div>
      </div>

      <div className="bg-white border-b border-gray-100 px-6 flex gap-1">
        {[['manuales', 'Cupones'], ['automaticos', 'Automáticos (te extrañamos)']].map(([k, l]) => (
          <button key={k} onClick={() => setVista(k)}
            className={`px-4 py-3 text-sm font-semibold border-b-2 ${vista === k ? 'border-vida-blue text-vida-blue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{l}</button>
        ))}
      </div>

      <div className="p-6">
        {vista === 'automaticos' ? <CuponesAutomaticos /> : cargando ? (
          <p className="text-center text-gray-400 py-10 text-sm">Cargando cupones…</p>
        ) : cupones.length === 0 ? (
          <div className="text-center text-gray-400 py-16">
            <Ticket size={44} className="mx-auto mb-3 opacity-20" />
            <p>Aún no has creado cupones.</p>
            <button onClick={abrirNuevo} className="mt-4 text-sm font-semibold text-vida-blue">+ Crear el primero</button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs border-b border-gray-100">
                  <th className="px-4 py-3 font-semibold">Código</th>
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Descuento</th>
                  <th className="px-4 py-3 font-semibold">Canal</th>
                  <th className="px-4 py-3 font-semibold">Vigencia</th>
                  <th className="px-4 py-3 font-semibold">Usos</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cupones.map((c) => (
                  <tr key={c.idCupon} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-vida-blue bg-vida-blue/5 px-2 py-1 rounded-lg">{c.Codigo}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{c.Nombre}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      {c.Tipo === 'DESCUENTO_PCT' ? `${Number(c.Valor)}%` : money(c.Valor)}
                      {c.MaxDescuento != null ? <span className="text-gray-400 font-normal"> (máx {money(c.MaxDescuento)})</span> : null}
                      {c.MinCompra != null ? <div className="text-[11px] text-gray-400 font-normal">mín. compra {money(c.MinCompra)}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{(CANALES.find(x => x.v === c.Canal) || {}).l || c.Canal}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtFecha(c.FechaInicio)} → {fmtFecha(c.FechaFin)}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {c.UsosActuales}{c.UsosMax != null ? ` / ${c.UsosMax}` : ''}
                      {c.UsosPorCliente != null ? <div className="text-[11px] text-gray-400">{c.UsosPorCliente}/cliente</div> : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${c.Status === 'ACTIVO' ? 'bg-vida-green/15 text-vida-green' : 'bg-gray-100 text-gray-400'}`}>
                        {c.Status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => abrirEditar(c)} title="Editar" className="p-1.5 rounded-lg text-gray-400 hover:text-vida-blue hover:bg-vida-blue/5"><Pencil size={15} /></button>
                        <button onClick={() => toggle(c)} title={c.Status === 'ACTIVO' ? 'Desactivar' : 'Activar'} className={`p-1.5 rounded-lg hover:bg-gray-100 ${c.Status === 'ACTIVO' ? 'text-gray-400 hover:text-red-500' : 'text-gray-400 hover:text-vida-green'}`}><Power size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal alta/edición */}
      {modal ? (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="font-black text-gray-900">{editId ? 'Editar cupón' : 'Nuevo cupón'}</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {error ? <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p> : null}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Código *">
                  <input value={form.Codigo} onChange={set('Codigo')} disabled={!!editId}
                    placeholder="BIENVENIDO10"
                    className="input font-mono uppercase disabled:bg-gray-100 disabled:text-gray-400" />
                </Field>
                <Field label="Nombre *">
                  <input value={form.Nombre} onChange={set('Nombre')} placeholder="10% de bienvenida" className="input" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tipo">
                  <select value={form.Tipo} onChange={set('Tipo')} className="input">
                    {TIPOS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                  </select>
                </Field>
                <Field label={form.Tipo === 'DESCUENTO_PCT' ? 'Porcentaje *' : 'Monto USD *'}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {form.Tipo === 'DESCUENTO_PCT' ? <Percent size={14} /> : <DollarSign size={14} />}
                    </span>
                    <input type="number" step="0.01" value={form.Valor} onChange={set('Valor')} className="input pl-8" />
                  </div>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Compra mínima (opcional)">
                  <input type="number" step="0.01" value={form.MinCompra} onChange={set('MinCompra')} placeholder="Sin mínimo" className="input" />
                </Field>
                <Field label="Descuento máximo (opcional)">
                  <input type="number" step="0.01" value={form.MaxDescuento} onChange={set('MaxDescuento')} placeholder="Sin tope" className="input" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Canal">
                  <select value={form.Canal} onChange={set('Canal')} className="input">
                    {CANALES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
                  </select>
                </Field>
                <Field label="Usos por cliente (vacío = ilimitado)">
                  <input type="number" value={form.UsosPorCliente} onChange={set('UsosPorCliente')} placeholder="Ilimitado" className="input" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Usos totales (vacío = ilimitado)">
                  <input type="number" value={form.UsosMax} onChange={set('UsosMax')} placeholder="Ilimitado" className="input" />
                </Field>
                <div />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Vigente desde (opcional)">
                  <input type="date" value={form.FechaInicio} onChange={set('FechaInicio')} className="input" />
                </Field>
                <Field label="Vigente hasta (opcional)">
                  <input type="date" value={form.FechaFin} onChange={set('FechaFin')} className="input" />
                </Field>
              </div>
              <Field label="Descripción (opcional)">
                <textarea value={form.Descripcion} onChange={set('Descripcion')} rows={2} className="input resize-none" />
              </Field>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700">Cancelar</button>
              <button onClick={guardar} disabled={guardando} className="px-5 py-2 text-sm font-semibold bg-vida-blue text-white rounded-xl hover:opacity-90 disabled:opacity-60">
                {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear cupón'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style>{`.input{width:100%;border:1px solid #e5e7eb;border-radius:0.75rem;padding:0.5rem 0.75rem;font-size:0.875rem;outline:none}.input:focus{border-color:#0A1E3F}`}</style>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
