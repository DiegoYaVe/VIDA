// src/components/ProveedorReabasto.jsx
// Datos de un proveedor para el reabasto con VIDA como intermediario (tarea
// 24): comisión de VIDA, cómo le llegan los pedidos (API o Portal), el enlace
// de su portal y sus sucursales (puntos de retiro). Solo lo ve VIDA.
import { useState, useEffect, useCallback } from 'react';
import { X, Link2, Copy, RefreshCw, MapPin, Plus, Check, Pencil, Power } from 'lucide-react';
import api from '../services/api.js';

const VACIA = { Nombre: '', Direccion: '', Horario: '', Latitud: '', Longitud: '' };

function FormSucursal({ inicial, onGuardar, onCancelar }) {
  const [f, setF] = useState(inicial || VACIA);
  const [error, setError] = useState('');
  const [proc, setProc] = useState(false);
  const campo = (k, label, props = {}) => (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-500 mb-1">{label}</span>
      <input value={f[k] ?? ''} onChange={e => setF(x => ({ ...x, [k]: e.target.value }))}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" {...props} />
    </label>
  );
  return (
    <form className="bg-gray-50 rounded-xl p-3 space-y-2" onSubmit={async e => {
      e.preventDefault(); setProc(true); setError('');
      try { await onGuardar(f); } catch (err) { setError(err.response?.data?.error || 'No se pudo guardar'); }
      finally { setProc(false); }
    }}>
      {campo('Nombre', 'Nombre de la sucursal', { required: true, maxLength: 150 })}
      {campo('Direccion', 'Dirección (la ve quien recoge)', { required: true, maxLength: 500 })}
      {campo('Horario', 'Horario de retiro', { placeholder: 'Lun a sáb, 8 a. m. a 5 p. m.', maxLength: 200 })}
      <div className="grid grid-cols-2 gap-2">
        {campo('Latitud', 'Latitud', { inputMode: 'decimal', placeholder: '10.4806' })}
        {campo('Longitud', 'Longitud', { inputMode: 'decimal', placeholder: '-66.9036' })}
      </div>
      <p className="text-[11px] text-gray-400">Con la ubicación, a cada tienda se le asigna la sucursal más cercana.</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
        <button type="submit" disabled={proc} className="flex items-center gap-1.5 bg-vida-blue text-white rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50">
          <Check size={14} /> Guardar
        </button>
      </div>
    </form>
  );
}

export default function ModalProveedorReabasto({ proveedor, onClose }) {
  const id = proveedor.idProveedor;
  const [cfg, setCfg] = useState(null);
  const [ruta, setRuta] = useState(null);
  const [sucursales, setSucursales] = useState([]);
  const [editando, setEditando] = useState(null);   // null | 'nueva' | idSucursal
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [proc, setProc] = useState(false);

  const cargar = useCallback(async () => {
    const [p, portal, suc] = await Promise.all([
      api.get(`/proveedores/${id}`), api.get(`/proveedores/${id}/portal`), api.get(`/proveedores/${id}/sucursales`),
    ]);
    setCfg({ ComisionVidaPct: p.data.ComisionVidaPct ?? '', CanalPedido: p.data.CanalPedido || 'PORTAL', ApiUrl: p.data.ApiUrl || '' });
    setRuta(portal.data.ruta);
    setSucursales(suc.data);
  }, [id]);
  useEffect(() => { cargar().catch(() => setError('No se pudieron cargar los datos')); }, [cargar]);

  const enlace = ruta ? `${window.location.origin}${ruta}` : null;

  async function guardarCfg(e) {
    e.preventDefault(); setProc(true); setError(''); setMsg('');
    try { await api.put(`/proveedores/${id}/reabasto`, cfg); setMsg('Guardado'); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo guardar'); }
    finally { setProc(false); }
  }
  async function nuevoEnlace() {
    if (ruta && !window.confirm('El enlace actual dejará de funcionar. ¿Generar uno nuevo?')) return;
    setProc(true); setError('');
    try { setRuta((await api.post(`/proveedores/${id}/portal`)).data.ruta); setMsg('Enlace nuevo listo: compártelo con el proveedor'); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo generar el enlace'); }
    finally { setProc(false); }
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(enlace); setMsg('Enlace copiado'); } catch { setMsg('Copia el enlace a mano'); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label={`Reabasto VIDA de ${proveedor.Nombre}`}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-800 truncate">Reabasto VIDA — {proveedor.Nombre}</h3>
            <p className="text-xs text-gray-500 mt-0.5">Las tiendas nunca ven este proveedor; solo VIDA.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        {!cfg ? <p className="text-center text-gray-400 py-16 text-sm">{error || 'Cargando…'}</p> : (
          <div className="p-5 overflow-y-auto space-y-6">
            {msg && <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{msg}</p>}
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            <form onSubmit={guardarCfg} className="space-y-3">
              <h4 className="text-xs font-semibold text-gray-500 uppercase">Comisión y pedidos</h4>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-semibold text-gray-500 mb-1">Comisión de VIDA (%)</span>
                  <input type="number" min="0" max="99.99" step="0.01" value={cfg.ComisionVidaPct} placeholder="La general"
                    onChange={e => setCfg(c => ({ ...c, ComisionVidaPct: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  <span className="block text-[11px] text-gray-400 mt-1">Ejemplo: lista $10 con 8 % → VIDA le paga $9,20.</span>
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-gray-500 mb-1">¿Cómo le llegan los pedidos?</span>
                  <select value={cfg.CanalPedido} onChange={e => setCfg(c => ({ ...c, CanalPedido: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="PORTAL">Portal de proveedores (sin API)</option>
                    <option value="API">Por su API</option>
                  </select>
                </label>
              </div>
              {cfg.CanalPedido === 'API' && (
                <label className="block">
                  <span className="block text-xs font-semibold text-gray-500 mb-1">URL de la API del proveedor</span>
                  <input type="url" value={cfg.ApiUrl} onChange={e => setCfg(c => ({ ...c, ApiUrl: e.target.value }))} placeholder="https://api.proveedor.com/pedidos"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  <span className="block text-[11px] text-gray-400 mt-1">VIDA le manda un POST con el folio, el código de retiro y los productos. Aun así, el pedido aparece en su portal.</span>
                </label>
              )}
              <div className="flex justify-end">
                <button type="submit" disabled={proc} className="bg-vida-blue text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">Guardar</button>
              </div>
            </form>

            <section className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase">Portal de proveedores</h4>
              {enlace ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input readOnly value={enlace} aria-label="Enlace del portal" onFocus={e => e.target.select()}
                    className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50" />
                  <div className="flex gap-2">
                    <button onClick={copiar} className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-2 text-sm hover:bg-gray-50"><Copy size={14} /> Copiar</button>
                    <button onClick={nuevoEnlace} disabled={proc} className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-2 text-sm hover:bg-gray-50"><RefreshCw size={14} /> Nuevo</button>
                  </div>
                </div>
              ) : (
                <button onClick={nuevoEnlace} disabled={proc} className="flex items-center gap-2 bg-vida-green text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
                  <Link2 size={15} /> Crear enlace del portal
                </button>
              )}
              <p className="text-[11px] text-gray-400">Con este enlace el proveedor ve sus pedidos de VIDA (sin datos de la tienda) y entrega contra el código del QR. No necesita usuario.</p>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-gray-500 uppercase">Sucursales (puntos de retiro)</h4>
                {editando !== 'nueva' && (
                  <button onClick={() => setEditando('nueva')} className="flex items-center gap-1 text-sm text-vida-blue font-semibold"><Plus size={14} /> Agregar</button>
                )}
              </div>
              {editando === 'nueva' && (
                <FormSucursal onCancelar={() => setEditando(null)}
                  onGuardar={async f => { await api.post(`/proveedores/${id}/sucursales`, f); setEditando(null); await cargar(); }} />
              )}
              {sucursales.length === 0 && editando !== 'nueva' && (
                <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">Sin sucursales: quien elija «Recojo yo» no sabrá dónde recoger.</p>
              )}
              {sucursales.map(s => editando === s.idSucursal ? (
                <FormSucursal key={s.idSucursal} inicial={{ ...s, Latitud: s.Latitud ?? '', Longitud: s.Longitud ?? '', Horario: s.Horario ?? '' }}
                  onCancelar={() => setEditando(null)}
                  onGuardar={async f => { await api.put(`/proveedores/${id}/sucursales/${s.idSucursal}`, { ...f, Status: s.Status }); setEditando(null); await cargar(); }} />
              ) : (
                <div key={s.idSucursal} className={`flex items-start gap-3 rounded-xl px-3 py-2.5 ${s.Status === 'ACTIVO' ? 'bg-gray-50' : 'bg-gray-50 opacity-60'}`}>
                  <MapPin size={15} className="text-vida-blue mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{s.Nombre}{s.Status !== 'ACTIVO' && <span className="ml-2 text-xs text-red-500">Inactiva</span>}</p>
                    <p className="text-xs text-gray-500">{s.Direccion}</p>
                    {s.Horario && <p className="text-xs text-gray-400">{s.Horario}</p>}
                  </div>
                  <button onClick={() => setEditando(s.idSucursal)} aria-label={`Editar ${s.Nombre}`} className="p-1.5 text-gray-400 hover:text-vida-blue"><Pencil size={14} /></button>
                  <button aria-label={s.Status === 'ACTIVO' ? `Desactivar ${s.Nombre}` : `Activar ${s.Nombre}`}
                    onClick={async () => { await api.put(`/proveedores/${id}/sucursales/${s.idSucursal}`, { ...s, Status: s.Status === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO' }); await cargar(); }}
                    className={`p-1.5 ${s.Status === 'ACTIVO' ? 'text-green-500' : 'text-gray-300'}`}><Power size={14} /></button>
                </div>
              ))}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
