// src/pages/Precios.jsx
// Precios y Promociones (T-0048 + T-0049).
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Tag, Percent, DollarSign, Layers, RefreshCw, Plus, Pencil, Trash2,
  X, Save, Search, AlertTriangle, CheckCircle, Circle, Package,
  Image as ImageIcon, Download, Share2,
} from 'lucide-react';
import QRCode from 'qrcode';
import api, { API_ORIGIN } from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';

const USD = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ROLES_ESCRITURA = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN'];

const TIPO_LABEL = {
  DESCUENTO_PCT:   '% de descuento',
  DESCUENTO_USD:   '$ de descuento',
  PRECIO_ESPECIAL: 'Precio especial',
  NXM:             'Combo (lleva N paga M)',
};
const ALCANCE_LABEL = { TODO: 'Todos los productos', CATEGORIA: 'Una categoría', PRODUCTO: 'Un producto' };

function Spinner() {
  return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-vida-blue/30 border-t-vida-blue rounded-full animate-spin" /></div>;
}

function badgePromo(p) {
  if (p.Tipo === 'NXM') return `${parseInt(p.Valor)}x${parseInt(p.Valor2)}`;
  if (p.Tipo === 'DESCUENTO_PCT') return `-${parseInt(p.Valor)}%`;
  if (p.Tipo === 'DESCUENTO_USD') return `-${USD(p.Valor)}`;
  if (p.Tipo === 'PRECIO_ESPECIAL') return USD(p.Valor);
  return '';
}

// ─── Modal alta/edición de promoción ──────────────────────────────────────────
function ModalPromo({ promo, categorias, productos, onClose, onGuardado }) {
  const esEdicion = !!promo;
  const [f, setF] = useState({
    Nombre:      promo?.Nombre      || '',
    Tipo:        promo?.Tipo        || 'DESCUENTO_PCT',
    Valor:       promo?.Valor       ?? '',
    Valor2:      promo?.Valor2      ?? '',
    Alcance:     promo?.Alcance     || 'TODO',
    idCategoria: promo?.idCategoria || '',
    idProducto:  promo?.idProducto  || '',
    FechaInicio: promo?.FechaInicio ? String(promo.FechaInicio).slice(0, 10) : '',
    FechaFin:    promo?.FechaFin    ? String(promo.FechaFin).slice(0, 10) : '',
    Descripcion: promo?.Descripcion || '',
    Status:      promo?.Status      || 'ACTIVO',
  });
  const [guardando, setG] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  async function guardar() {
    if (!f.Nombre.trim()) { setError('El nombre es obligatorio'); return; }
    if (f.Valor === '' || isNaN(Number(f.Valor))) { setError('El valor es obligatorio'); return; }
    if (f.Tipo === 'NXM' && (f.Valor2 === '' || Number(f.Valor2) >= Number(f.Valor))) {
      setError('En el combo, "paga" debe ser menor que "lleva"'); return;
    }
    if (f.Alcance === 'CATEGORIA' && !f.idCategoria) { setError('Selecciona una categoría'); return; }
    if (f.Alcance === 'PRODUCTO'  && !f.idProducto)  { setError('Selecciona un producto'); return; }
    setG(true); setError('');
    try {
      const payload = {
        Nombre: f.Nombre.trim(), Tipo: f.Tipo, Valor: Number(f.Valor),
        Valor2: f.Tipo === 'NXM' ? Number(f.Valor2) : null,
        Alcance: f.Alcance,
        idCategoria: f.Alcance === 'CATEGORIA' ? Number(f.idCategoria) : null,
        idProducto:  f.Alcance === 'PRODUCTO'  ? Number(f.idProducto)  : null,
        FechaInicio: f.FechaInicio || null, FechaFin: f.FechaFin || null,
        Descripcion: f.Descripcion.trim() || null,
      };
      if (esEdicion) await api.put(`/promociones/${promo.idPromocion}`, { ...payload, Status: f.Status });
      else await api.post('/promociones', payload);
      onGuardado();
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar');
    } finally { setG(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-bold text-gray-800">{esEdicion ? 'Editar promoción' : 'Nueva promoción'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Nombre *</label>
            <input value={f.Nombre} onChange={e => set('Nombre', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Ej. Fin de semana -20%" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Tipo</label>
            <select value={f.Tipo} onChange={e => set('Tipo', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          {f.Tipo === 'NXM' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Lleva (N)</label>
                <input type="number" value={f.Valor} onChange={e => set('Valor', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="3" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Paga (M)</label>
                <input type="number" value={f.Valor2} onChange={e => set('Valor2', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="2" />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                {f.Tipo === 'DESCUENTO_PCT' ? '% de descuento' : f.Tipo === 'DESCUENTO_USD' ? '$ de descuento' : 'Precio especial ($)'}
              </label>
              <input type="number" step="0.01" value={f.Valor} onChange={e => set('Valor', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder={f.Tipo === 'DESCUENTO_PCT' ? '20' : '1.50'} />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Aplica a</label>
            <select value={f.Alcance} onChange={e => set('Alcance', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              {Object.entries(ALCANCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          {f.Alcance === 'CATEGORIA' && (
            <select value={f.idCategoria} onChange={e => set('idCategoria', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">— Selecciona categoría —</option>
              {categorias.map(c => <option key={c.idCategoria} value={c.idCategoria}>{c.Nombre}</option>)}
            </select>
          )}
          {f.Alcance === 'PRODUCTO' && (
            <select value={f.idProducto} onChange={e => set('idProducto', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">— Selecciona producto —</option>
              {productos.map(p => <option key={p.idProducto} value={p.idProducto}>{p.Nombre}</option>)}
            </select>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Desde (opcional)</label>
              <input type="date" value={f.FechaInicio} onChange={e => set('FechaInicio', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Hasta (opcional)</label>
              <input type="date" value={f.FechaFin} onChange={e => set('FechaFin', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          {esEdicion && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Estado</label>
              <select value={f.Status} onChange={e => set('Status', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="ACTIVO">Activa</option>
                <option value="INACTIVO">Inactiva</option>
              </select>
            </div>
          )}
        </div>
        <div className="p-5 border-t flex gap-2 justify-end">
          <button onClick={onClose} className="border border-gray-200 text-gray-600 rounded-xl px-4 py-2 text-sm hover:bg-gray-50">Cancelar</button>
          <button onClick={guardar} disabled={guardando}
            className="flex items-center gap-2 bg-vida-blue text-white rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
            <Save size={15} /> {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TAB: Promociones ─────────────────────────────────────────────────────────
function TabPromociones({ puedeEscribir, categorias, productos }) {
  const [promos, setPromos] = useState(null);
  const [cargando, setCarg] = useState(true);
  const [modal, setModal]   = useState(null);

  const cargar = useCallback(async () => {
    setCarg(true);
    try { setPromos((await api.get('/promociones')).data); }
    catch { setPromos([]); }
    finally { setCarg(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function eliminar(p) {
    if (!window.confirm(`¿Desactivar la promoción "${p.Nombre}"?`)) return;
    try { await api.delete(`/promociones/${p.idPromocion}`); cargar(); }
    catch { alert('Error al eliminar'); }
  }

  if (cargando) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{promos.length} promociones</p>
        {puedeEscribir && (
          <button onClick={() => setModal({})}
            className="flex items-center gap-2 bg-vida-blue text-white text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-90">
            <Plus size={15} /> Nueva promoción
          </button>
        )}
      </div>

      {promos.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Tag size={48} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Aún no hay promociones</p>
          <p className="text-sm mt-1">Crea descuentos o combos que verán tus clientes en la app</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {promos.map(p => (
            <div key={p.idPromocion}
              className={`bg-white border-2 rounded-2xl p-4 ${p.Vigente ? 'border-vida-green/40' : 'border-gray-100'} ${p.Status !== 'ACTIVO' ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between mb-2">
                <span className="inline-flex items-center gap-1.5 bg-vida-blue text-white text-sm font-black px-2.5 py-1 rounded-lg">
                  {badgePromo(p)}
                </span>
                <div className="flex items-center gap-1">
                  {p.Vigente
                    ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-600"><CheckCircle size={11} /> Vigente</span>
                    : <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-400"><Circle size={11} /> {p.Status === 'ACTIVO' ? 'Fuera de fecha' : 'Inactiva'}</span>}
                </div>
              </div>
              <p className="font-bold text-gray-800 text-sm">{p.Nombre}</p>
              <p className="text-xs text-gray-500 mt-1">{TIPO_LABEL[p.Tipo]}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {p.Alcance === 'TODO' ? 'Todos los productos'
                  : p.Alcance === 'CATEGORIA' ? `Categoría: ${p.NombreCategoria || '—'}`
                  : `Producto: ${p.NombreProducto || '—'}`}
              </p>
              {(p.FechaInicio || p.FechaFin) && (
                <p className="text-[10px] text-gray-400 mt-1">
                  {p.FechaInicio ? String(p.FechaInicio).slice(0, 10) : '…'} → {p.FechaFin ? String(p.FechaFin).slice(0, 10) : '…'}
                </p>
              )}
              {puedeEscribir && (
                <div className="flex gap-1 mt-3 pt-3 border-t border-gray-50">
                  <button onClick={() => setModal(p)} className="flex-1 flex items-center justify-center gap-1 text-xs text-gray-600 hover:text-vida-blue py-1.5 rounded-lg hover:bg-gray-50">
                    <Pencil size={12} /> Editar
                  </button>
                  <button onClick={() => eliminar(p)} className="flex-1 flex items-center justify-center gap-1 text-xs text-gray-600 hover:text-red-500 py-1.5 rounded-lg hover:bg-red-50">
                    <Trash2 size={12} /> Quitar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <ModalPromo
          promo={modal.idPromocion ? modal : null}
          categorias={categorias} productos={productos}
          onClose={() => setModal(null)}
          onGuardado={() => { setModal(null); cargar(); }}
        />
      )}
    </div>
  );
}

// ─── TAB: Precios ─────────────────────────────────────────────────────────────
function TabPrecios({ puedeEscribir }) {
  const [prods, setProds]   = useState(null);
  const [cargando, setCarg] = useState(true);
  const [edit, setEdit]     = useState({}); // idProducto -> nuevo precio
  const [guardando, setG]   = useState(false);
  const [msg, setMsg]       = useState('');
  const [q, setQ]           = useState('');

  const cargar = useCallback(async () => {
    setCarg(true);
    try { setProds((await api.get('/inventario/productos')).data); }
    catch { setProds([]); }
    finally { setCarg(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = useMemo(() => {
    const lista = Array.isArray(prods) ? prods : (prods?.data || []);
    if (!q.trim()) return lista;
    const s = q.toLowerCase();
    return lista.filter(p => (p.Nombre || '').toLowerCase().includes(s) || (p.SKU || '').toLowerCase().includes(s));
  }, [prods, q]);

  const cambios = Object.keys(edit).length;

  async function guardar() {
    setG(true); setMsg('');
    try {
      const items = Object.entries(edit).map(([idProducto, PrecioUSD]) => ({ idProducto: Number(idProducto), PrecioUSD: Number(PrecioUSD) }));
      const r = await api.put('/inventario/productos/precios', items);
      setMsg(`${r.data.actualizados} precio(s) actualizado(s) ✓`);
      setEdit({});
      cargar();
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setMsg(e.response?.data?.error || 'Error al guardar');
    } finally { setG(false); }
  }

  if (cargando) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto o SKU…"
            className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl w-64" />
        </div>
        {puedeEscribir && cambios > 0 && (
          <div className="flex items-center gap-3">
            {msg && <span className={`text-sm font-semibold ${msg.includes('✓') ? 'text-green-600' : 'text-red-600'}`}>{msg}</span>}
            <button onClick={guardar} disabled={guardando}
              className="flex items-center gap-2 bg-vida-green text-white rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              <Save size={15} /> Guardar {cambios} cambio(s)
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                {['Producto', 'SKU', 'Categoría', 'Costo', 'Precio USD'].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtrados.map(p => {
                const val = edit[p.idProducto] ?? p.PrecioUSD;
                const cambiado = edit[p.idProducto] !== undefined;
                return (
                  <tr key={p.idProducto} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 font-semibold text-gray-800">{p.Nombre}</td>
                    <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{p.SKU || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{p.NombreCategoria || p.Categoria || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{p.CostoUSD != null ? USD(p.CostoUSD) : '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-xs">$</span>
                        <input
                          type="number" step="0.01" value={val}
                          disabled={!puedeEscribir}
                          onChange={e => setEdit(ed => ({ ...ed, [p.idProducto]: e.target.value }))}
                          className={`w-24 border rounded-lg px-2 py-1 text-sm ${cambiado ? 'border-vida-green bg-green-50 font-bold' : 'border-gray-200'} disabled:bg-gray-50`} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtrados.length === 0 && <p className="text-center text-gray-400 py-10 text-sm">Sin productos</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
// ─── TAB: Flyer / Marketing ───────────────────────────────────────────────────
const STORE_BASE = 'https://app.comercializadoravida.com';

// Carga una imagen (con CORS para poder exportarla en el canvas)
function cargarImagen(src, crossOrigin = true) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new window.Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function TabFlyer({ productos }) {
  const { usuario } = useAuthStore();
  const canvasRef = useRef(null);
  const [tiendas, setTiendas] = useState([]);
  const [idPV, setIdPV] = useState(usuario?.idPuntoVenta ? String(usuario.idPuntoVenta) : '');
  const [idProducto, setIdProducto] = useState('');
  const [precioPromo, setPrecioPromo] = useState('');
  const [mensaje, setMensaje] = useState('¡Aprovecha esta oferta!');
  const [dibujando, setDibujando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/sucursales/puntos-venta').then(r => {
      setTiendas(r.data || []);
      if (!idPV && r.data?.length) setIdPV(String(r.data[0].idPuntoVenta));
    }).catch(() => {});
  }, []); // eslint-disable-line

  const producto = productos.find(p => String(p.idProducto) === String(idProducto));
  const tienda   = tiendas.find(t => String(t.idPuntoVenta) === String(idPV));

  const dibujar = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !producto) return;
    setDibujando(true); setError('');
    const W = 1080, H = 1350;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Fondo
    ctx.fillStyle = '#F7FAFC'; ctx.fillRect(0, 0, W, H);

    // Header (degradado VIDA)
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#54C4E0'); grad.addColorStop(1, '#0A1E3F');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, 190);
    ctx.fillStyle = '#fff';
    ctx.font = '900 64px Arial'; ctx.textBaseline = 'middle';
    ctx.fillText('VIDA', 60, 80);
    ctx.font = '600 30px Arial';
    ctx.fillText((tienda?.NomComercial || tienda?.Nombre || 'Comercializadora VIDA').toUpperCase(), 60, 140);

    // Tarjeta blanca del producto
    ctx.fillStyle = '#fff';
    ctx.fillRect(60, 240, W - 120, 720);

    // Imagen del producto (contain)
    let taint = false;
    const imgSrc = producto.ImagenProducto
      ? (String(producto.ImagenProducto).startsWith('http') ? producto.ImagenProducto : API_ORIGIN + producto.ImagenProducto)
      : null;
    const img = await cargarImagen(imgSrc);
    const boxX = 60, boxY = 260, boxW = W - 120, boxH = 540;
    if (img) {
      const r = Math.min(boxW / img.width, boxH / img.height);
      const iw = img.width * r, ih = img.height * r;
      try { ctx.drawImage(img, boxX + (boxW - iw) / 2, boxY + (boxH - ih) / 2, iw, ih); }
      catch { taint = true; }
    } else {
      ctx.fillStyle = '#EDF2F7'; ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.fillStyle = '#A0AEC0'; ctx.font = '40px Arial'; ctx.textAlign = 'center';
      ctx.fillText('Sin imagen', W / 2, boxY + boxH / 2); ctx.textAlign = 'left';
    }

    // Badge PLUS
    if (producto.EsProductoPlus) {
      ctx.fillStyle = '#F59E0B'; ctx.fillRect(W - 220, 270, 140, 54);
      ctx.fillStyle = '#fff'; ctx.font = '900 34px Arial'; ctx.textAlign = 'center';
      ctx.fillText('PLUS', W - 150, 298); ctx.textAlign = 'left';
    }

    // Nombre del producto (envuelto)
    ctx.fillStyle = '#0A1E3F'; ctx.font = '900 52px Arial';
    const nombre = String(producto.Nombre || '');
    const palabras = nombre.split(' '); let linea = '', y = 850;
    for (const w of palabras) {
      const test = linea ? linea + ' ' + w : w;
      if (ctx.measureText(test).width > W - 160 && linea) { ctx.fillText(linea, 60, y); y += 60; linea = w; }
      else linea = test;
    }
    ctx.fillText(linea, 60, y); y += 70;

    // Precio
    const precio = Number(producto.PrecioUSD || 0);
    const promo = precioPromo !== '' ? Number(precioPromo) : null;
    if (promo != null && promo > 0 && promo < precio) {
      ctx.fillStyle = '#A0AEC0'; ctx.font = '600 40px Arial';
      const orig = `$${precio.toFixed(2)}`;
      ctx.fillText(orig, 60, y);
      const ow = ctx.measureText(orig).width;
      ctx.strokeStyle = '#A0AEC0'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(60 + ow, y); ctx.stroke();
      ctx.fillStyle = '#5BBE6A'; ctx.font = '900 84px Arial';
      ctx.fillText(`$${promo.toFixed(2)}`, 60, y + 60);
    } else {
      ctx.fillStyle = '#5BBE6A'; ctx.font = '900 84px Arial';
      ctx.fillText(`$${precio.toFixed(2)}`, 60, y + 30);
    }

    // Mensaje
    if (mensaje.trim()) {
      ctx.fillStyle = '#4A5568'; ctx.font = '600 36px Arial';
      ctx.fillText(mensaje.trim().slice(0, 60), 60, 1090);
    }

    // QR (abajo derecha) — apunta a la tienda
    const qrData = `${STORE_BASE}/t/${idPV || ''}`;
    try {
      const qrUrl = await QRCode.toDataURL(qrData, { margin: 1, width: 240 });
      const qrImg = await cargarImagen(qrUrl, false);
      if (qrImg) ctx.drawImage(qrImg, W - 280, H - 300, 220, 220);
      ctx.fillStyle = '#0A1E3F'; ctx.font = '700 26px Arial'; ctx.textAlign = 'right';
      ctx.fillText('Escanea y compra', W - 60, H - 70);
      ctx.font = '400 22px Arial'; ctx.fillStyle = '#718096';
      ctx.fillText(STORE_BASE.replace('https://', ''), W - 60, H - 40);
      ctx.textAlign = 'left';
    } catch { /* qr opcional */ }

    setDibujando(false);
    if (taint) setError('La imagen del producto no permitió exportar. Intenta de nuevo o usa un producto sin foto.');
  }, [producto, tienda, precioPromo, mensaje, idPV]);

  useEffect(() => { dibujar(); }, [dibujar]);

  function descargar() {
    try {
      const url = canvasRef.current.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url; a.download = `flyer-${(producto?.Nombre || 'vida').replace(/\s+/g, '-')}.png`;
      a.click();
    } catch {
      setError('No se pudo exportar (permiso de la imagen). La foto del producto puede estar bloqueando el canvas.');
    }
  }

  function compartirWhatsApp() {
    const p = precioPromo !== '' ? Number(precioPromo) : Number(producto?.PrecioUSD || 0);
    const txt = `${mensaje.trim()}\n${producto?.Nombre} — $${p.toFixed(2)}\n${STORE_BASE}/t/${idPV || ''}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank');
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
      {/* Controles */}
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h3 className="font-black text-gray-800 flex items-center gap-2"><ImageIcon size={18} className="text-vida-blue" /> Crear promo hoy</h3>
          <p className="text-xs text-gray-400 -mt-1">Elige un producto y genera un flyer con QR para compartir.</p>

          {tiendas.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Tienda</label>
              <select value={idPV} onChange={e => setIdPV(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                {tiendas.map(t => <option key={t.idPuntoVenta} value={t.idPuntoVenta}>{t.NomComercial || t.Nombre}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Producto *</label>
            <select value={idProducto} onChange={e => { setIdProducto(e.target.value); setPrecioPromo(''); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">— Elige un producto —</option>
              {productos.map(p => <option key={p.idProducto} value={p.idProducto}>{p.Nombre} — ${Number(p.PrecioUSD || 0).toFixed(2)}</option>)}
            </select>
          </div>

          {producto && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Precio de promoción (opcional)</label>
                <input type="number" step="0.01" value={precioPromo} onChange={e => setPrecioPromo(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder={`Precio normal: $${Number(producto.PrecioUSD || 0).toFixed(2)}`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Mensaje</label>
                <input value={mensaje} onChange={e => setMensaje(e.target.value)} maxLength={60}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="¡Aprovecha esta oferta!" />
              </div>
              {error && <p className="text-amber-600 text-xs bg-amber-50 px-3 py-2 rounded-lg">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={descargar} disabled={dibujando}
                  className="flex items-center gap-2 bg-vida-blue text-white rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                  <Download size={15} /> Descargar PNG
                </button>
                <button onClick={compartirWhatsApp}
                  className="flex items-center gap-2 bg-vida-green text-white rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90">
                  <Share2 size={15} /> WhatsApp
                </button>
              </div>
              <p className="text-[11px] text-gray-400">El QR abre la tienda: <code>{STORE_BASE}/t/{idPV || '—'}</code></p>
            </>
          )}
        </div>
      </div>

      {/* Vista previa */}
      <div className="flex items-start justify-center">
        {producto ? (
          <canvas ref={canvasRef} className="w-full max-w-sm rounded-2xl shadow-lg border border-gray-100" />
        ) : (
          <div className="text-center text-gray-300 py-16">
            <ImageIcon size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-gray-400">Elige un producto para ver el flyer</p>
          </div>
        )}
      </div>
    </div>
  );
}

const TABS = [
  { id: 'promos',  label: 'Promociones', icon: Tag },
  { id: 'precios', label: 'Precios',     icon: DollarSign },
  { id: 'flyer',   label: 'Flyer',       icon: ImageIcon },
];

export default function Precios() {
  const { usuario } = useAuthStore();
  const puedeEscribir = ROLES_ESCRITURA.includes(usuario?.TipoUsuario);
  const [tab, setTab] = useState('promos');
  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos]   = useState([]);

  useEffect(() => {
    api.get('/inventario/categorias').then(r => setCategorias(r.data)).catch(() => {});
    api.get('/inventario/productos').then(r => setProductos(Array.isArray(r.data) ? r.data : (r.data?.data || []))).catch(() => {});
  }, []);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
          <Tag size={22} className="text-vida-blue" /> Precios y Promociones
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">Gestiona descuentos, combos y los precios de tus productos</p>
      </div>

      <div className="bg-white border-b border-gray-100 px-6">
        <div className="flex gap-1">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-3.5 text-sm font-semibold border-b-2 transition-all
                  ${tab === t.id ? 'border-vida-blue text-vida-blue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-6">
        {tab === 'promos'  && <TabPromociones puedeEscribir={puedeEscribir} categorias={categorias} productos={productos} />}
        {tab === 'precios' && <TabPrecios puedeEscribir={puedeEscribir} />}
        {tab === 'flyer'   && <TabFlyer productos={productos} />}
      </div>
    </div>
  );
}
