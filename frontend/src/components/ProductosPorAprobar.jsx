// src/components/ProductosPorAprobar.jsx
// Proveedores → Productos por aprobar (tarea 26): lo que un proveedor trae en
// su lista y VIDA no tiene. VIDA decide si lo crea en su catálogo (con su
// categoría y precio de venta en tiendas), si ya existe y solo se liga, o si
// lo rechaza. Hasta aprobarlo no se ofrece a las tiendas.
import { useState, useEffect, useCallback } from 'react';
import { Check, X, Search, PackagePlus, Link2, AlertTriangle, Inbox } from 'lucide-react';
import api from '../services/api.js';

const USD = (v) => (v == null ? '—' : `$${Number(v).toFixed(2)}`);
const fecha = (v) => (v ? new Date(v).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' }) : '');
const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function ModalAprobar({ nuevo, categorias, onClose, onHecho }) {
  const sugerida = categorias.find(c => sinAcentos(c.Nombre) === sinAcentos(nuevo.Categoria));
  const [modo, setModo] = useState('CREAR');
  const [nombre, setNombre] = useState(nuevo.Marca && !sinAcentos(nuevo.Nombre).includes(sinAcentos(nuevo.Marca)) ? `${nuevo.Nombre} ${nuevo.Marca}` : nuevo.Nombre);
  const [idCategoria, setIdCategoria] = useState(sugerida ? String(sugerida.idCategoria) : '');
  const [precio, setPrecio] = useState(nuevo.PrecioSugeridoUSD != null ? String(Number(nuevo.PrecioSugeridoUSD)) : '');
  const [sku, setSku] = useState('');
  const [busca, setBusca] = useState(nuevo.CodigoBarras || nuevo.Nombre.split(' ').slice(0, 2).join(' '));
  const [opciones, setOpciones] = useState([]);
  const [idProducto, setIdProducto] = useState('');
  const [proc, setProc] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (modo !== 'VINCULAR' || busca.trim().length < 2) { setOpciones([]); return; }
    const t = setTimeout(() => {
      api.get('/inventario/productos', { params: { search: busca.trim(), limit: 20, page: 1 } })
        .then(r => setOpciones((r.data.data || []).filter(p => p.idPuntoVentaDueno == null && p.Status === 'ACTIVO')))
        .catch(() => setOpciones([]));
    }, 300);
    return () => clearTimeout(t);
  }, [busca, modo]);

  const lista = Number(nuevo.PrecioListaUSD);
  const margen = Number(precio) > 0 ? Math.round((Number(precio) - lista) / Number(precio) * 1000) / 10 : null;

  async function aprobar() {
    setProc(true); setError('');
    try {
      await api.post(`/proveedores/productos-nuevos/${nuevo.idNuevo}/aprobar`, modo === 'CREAR'
        ? { modo, Nombre: nombre, idCategoria: Number(idCategoria), PrecioUSD: Number(precio), SKU: sku || undefined }
        : { modo, idProducto: Number(idProducto) });
      onHecho();
    } catch (e) {
      const d = e.response?.data;
      setError(d?.error || 'No se pudo aprobar');
      // Ya existe un producto con ese código de barras: se propone ligarlo
      if (d?.idProducto) { setModo('VINCULAR'); setBusca(nuevo.CodigoBarras || ''); setIdProducto(String(d.idProducto)); }
    } finally { setProc(false); }
  }

  const listo = modo === 'CREAR' ? nombre.trim() && idCategoria && Number(precio) > 0 : !!idProducto;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4" role="dialog" aria-modal="true" aria-label="Aprobar producto nuevo">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
          <div className="min-w-0">
            <h3 className="font-black text-gray-800">Aprobar producto nuevo</h3>
            <p className="text-xs text-gray-500">{nuevo.NombreProveedor} · código {nuevo.CodigoProveedor} · precio de lista {USD(lista)}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cómo se aprueba">
            {[['CREAR', PackagePlus, 'Crear en el catálogo', 'Es un producto que VIDA no tiene'], ['VINCULAR', Link2, 'Ya lo tenemos', 'Ligarlo a un producto del catálogo']].map(([m, Icon, t, s]) => (
              <button key={m} role="radio" aria-checked={modo === m} onClick={() => { setModo(m); setError(''); }}
                className={`text-left rounded-xl border-2 p-3 ${modo === m ? 'border-vida-blue bg-vida-blue-light' : 'border-gray-200 hover:border-gray-300'}`}>
                <p className="font-bold text-sm text-gray-800 flex items-center gap-1.5"><Icon size={15} /> {t}</p>
                <p className="text-xs text-gray-500">{s}</p>
              </button>
            ))}
          </div>

          {modo === 'CREAR' ? (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-gray-500">Nombre en el catálogo
                <input value={nombre} onChange={e => setNombre(e.target.value)} maxLength={200} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
              </label>
              <label className="block text-xs font-semibold text-gray-500">Categoría {nuevo.Categoria && <span className="font-normal text-gray-400">(el proveedor la llama «{nuevo.Categoria}»)</span>}
                <select value={idCategoria} onChange={e => setIdCategoria(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white">
                  <option value="">— Elige —</option>
                  {categorias.map(c => <option key={c.idCategoria} value={c.idCategoria}>{c.Nombre}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-gray-500">Precio de venta en tiendas USD
                  <input type="number" step="0.01" min="0" value={precio} onChange={e => setPrecio(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
                  <span className={`block text-[11px] mt-0.5 ${margen != null && margen <= 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                    {margen == null ? `Sugerido por el proveedor: ${USD(nuevo.PrecioSugeridoUSD)}` : `Margen de la tienda: ${margen}%`}
                  </span>
                </label>
                <label className="block text-xs font-semibold text-gray-500">SKU (opcional)
                  <input value={sku} onChange={e => setSku(e.target.value)} maxLength={100} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
                </label>
              </div>
              <p className="text-xs text-gray-400">Se crea en el catálogo de VIDA (lo ven todas las tiendas) con código de barras {nuevo.CodigoBarras || '—'}, IVA {String(nuevo.AlicuotaIVA || 'GENERAL').toLowerCase()} y peso {nuevo.PesoKg ?? '—'} kg, y se liga a este proveedor.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Busca por nombre, SKU o código de barras"
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm" />
              </div>
              <div className="border border-gray-100 rounded-xl max-h-56 overflow-y-auto divide-y divide-gray-50">
                {opciones.length === 0 && <p className="text-sm text-gray-400 p-3">Sin resultados en el catálogo de VIDA</p>}
                {opciones.map(p => (
                  <label key={p.idProducto} className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${String(p.idProducto) === idProducto ? 'bg-vida-blue-light' : 'hover:bg-gray-50'}`}>
                    <input type="radio" name="vida-prod" checked={String(p.idProducto) === idProducto} onChange={() => setIdProducto(String(p.idProducto))} className="accent-vida-blue" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-gray-800 truncate">{p.Nombre}</span>
                      <span className="block text-[11px] text-gray-400">{p.SKU || 'sin SKU'} · {p.CodigoBarras || 'sin código de barras'} · venta {USD(p.PrecioUSD)}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        </div>
        <div className="flex gap-2 p-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200">Cancelar</button>
          <button onClick={aprobar} disabled={!listo || proc}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white bg-vida-blue disabled:opacity-40">
            {proc ? 'Guardando…' : modo === 'CREAR' ? 'Crear y aprobar' : 'Ligar y aprobar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProductosPorAprobar({ onCambio }) {
  const [status, setStatus] = useState('PENDIENTE');
  const [datos, setDatos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aprobando, setAprobando] = useState(null);
  const [rechazando, setRechazando] = useState(null);   // { idNuevo, motivo }

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try { setDatos((await api.get('/proveedores/productos-nuevos', { params: { status } })).data); }
    catch (e) { setError(e.response?.data?.error || 'No se pudo cargar'); }
    finally { setCargando(false); }
  }, [status]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { api.get('/inventario/categorias').then(r => setCategorias(r.data || [])).catch(() => {}); }, []);

  async function rechazar() {
    try {
      await api.post(`/proveedores/productos-nuevos/${rechazando.idNuevo}/rechazar`, { Motivo: rechazando.motivo || undefined });
      setRechazando(null); cargar(); onCambio?.();
    } catch (e) { setError(e.response?.data?.error || 'No se pudo rechazar'); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500 max-w-2xl">Productos que un proveedor trae en su lista de precios y VIDA todavía no tiene. No se ofrecen a las tiendas hasta aprobarlos.</p>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {[['PENDIENTE', 'Pendientes'], ['APROBADO', 'Aprobados'], ['RECHAZADO', 'Rechazados']].map(([s, t]) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${status === s ? 'bg-white text-vida-blue shadow-sm' : 'text-gray-500'}`}>{t}</button>
          ))}
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}

      <div className="bg-white border border-gray-100 rounded-2xl overflow-x-auto">
        {cargando ? <p className="p-6 text-sm text-gray-400">Cargando…</p> : datos.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Inbox size={36} className="mx-auto mb-2 opacity-40" />
            <p>{status === 'PENDIENTE' ? 'No hay productos esperando aprobación' : 'Nada por aquí'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr className="text-left text-xs text-gray-500 uppercase">
              {['Proveedor', 'Producto', 'Precio lista', 'Sugerido', 'Compra', status === 'PENDIENTE' ? '' : 'Resultado'].map((h, i) => <th key={i} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {datos.map(n => (
                <tr key={n.idNuevo} className="align-top">
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <p className="font-semibold text-gray-700">{n.NombreProveedor}</p>
                    <p className="text-[11px] text-gray-400">desde {fecha(n.FechaAlta)}</p>
                  </td>
                  <td className="px-3 py-2.5 min-w-[14rem]">
                    <p className="text-gray-800">{n.Nombre}{n.Marca ? <span className="text-gray-400"> · {n.Marca}</span> : null}</p>
                    <p className="text-[11px] text-gray-400 font-mono">{n.CodigoProveedor} · {n.CodigoBarras || 'sin código de barras'}{n.Categoria ? ` · ${n.Categoria}` : ''}</p>
                    {!n.Disponible && <p className="text-[11px] text-amber-600 flex items-center gap-1"><AlertTriangle size={11} /> El proveedor lo marcó como no disponible</p>}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums font-semibold text-gray-800">{USD(n.PrecioListaUSD)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-600">{USD(n.PrecioSugeridoUSD)}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                    {n.UnidadCompra || 'Pieza'}{n.UnidadesEmpaque ? ` de ${n.UnidadesEmpaque}` : ''}
                    {n.PedidoMinimo ? <span className="block">mínimo {Number(n.PedidoMinimo)}</span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {status === 'PENDIENTE' ? (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setAprobando(n)} className="inline-flex items-center gap-1 bg-vida-blue text-white text-xs font-bold rounded-lg px-3 py-1.5"><Check size={13} /> Aprobar</button>
                        <button onClick={() => setRechazando({ idNuevo: n.idNuevo, motivo: '' })} className="inline-flex items-center gap-1 border border-gray-200 text-gray-600 text-xs font-bold rounded-lg px-3 py-1.5 hover:border-red-300 hover:text-red-600"><X size={13} /> Rechazar</button>
                      </div>
                    ) : status === 'APROBADO' ? (
                      <span className="text-xs text-gray-600">→ {n.NombreProductoVida || `producto ${n.idProducto}`}</span>
                    ) : <span className="text-xs text-gray-500">{n.Motivo || 'Sin motivo'}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {aprobando && (
        <ModalAprobar nuevo={aprobando} categorias={categorias} onClose={() => setAprobando(null)}
          onHecho={() => { setAprobando(null); cargar(); onCambio?.(); }} />
      )}
      {rechazando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Rechazar producto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-3">
            <h3 className="font-black text-gray-800">Rechazar producto</h3>
            <label className="block text-xs font-semibold text-gray-500">Motivo (opcional)
              <input value={rechazando.motivo} onChange={e => setRechazando(r => ({ ...r, motivo: e.target.value }))} maxLength={300}
                placeholder="Ej.: no lo vendemos en la red" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
            </label>
            <div className="flex gap-2">
              <button onClick={() => setRechazando(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200">Cancelar</button>
              <button onClick={rechazar} className="flex-1 rounded-xl py-2 text-sm font-bold text-white bg-red-500">Rechazar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
