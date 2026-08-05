// src/pages/Catalogos.jsx
// Catálogo central de la red (T-0047): vista maestra consolidada de todos los
// productos con categoría, costo, precio, stock total en la red, # de tiendas
// y promoción activa. Complementa a Inventario (operativo por tienda).
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Search, RefreshCw, Package, Tag, Layers, DollarSign,
  Store, TrendingUp, Boxes, ArrowRight,
} from 'lucide-react';
import api, { API_ORIGIN } from '../services/api.js';

const USD = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const NUM = (v) => Number(v || 0).toLocaleString('es-VE');
const img = (r) => !r ? null : (String(r).startsWith('http') ? r : API_ORIGIN + r);

function Spinner() {
  return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-vida-blue/30 border-t-vida-blue rounded-full animate-spin" /></div>;
}

function CardKPI({ icon: Icon, label, valor, color }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}18` }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 font-semibold uppercase truncate">{label}</p>
        <p className="text-xl font-black text-gray-900 truncate">{valor}</p>
      </div>
    </div>
  );
}

export default function Catalogos() {
  const navigate = useNavigate();
  const [data, setData]     = useState(null);
  const [cargando, setCarg] = useState(true);
  const [q, setQ]           = useState('');
  const [cat, setCat]       = useState('');

  const cargar = useCallback(async () => {
    setCarg(true);
    try {
      const params = new URLSearchParams({ ...(q.trim() && { search: q.trim() }), ...(cat && { idCategoria: cat }) });
      const r = await api.get(`/inventario/catalogo?${params}`);
      setData(r.data);
    } catch { setData({ productos: [], categorias: [], resumen: {} }); }
    finally { setCarg(false); }
  }, [q, cat]);
  useEffect(() => { const t = setTimeout(cargar, 300); return () => clearTimeout(t); }, [cargar]);

  const productos = data?.productos || [];
  const categorias = data?.categorias || [];
  const resumen = data?.resumen || {};

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2"><BookOpen size={22} className="text-vida-blue" /> Catálogo Central</h1>
          <p className="text-xs text-gray-400 mt-0.5">Vista maestra de todos los productos de la red</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={cargar} className="flex items-center gap-2 text-sm text-gray-500 hover:text-vida-blue border border-gray-200 px-3 py-2 rounded-xl"><RefreshCw size={14} /></button>
          <button onClick={() => navigate('/inventarios')}
            className="flex items-center gap-2 bg-vida-blue text-white text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-90">
            <Package size={15} /> Gestionar en Inventario <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <CardKPI icon={Package}    label="Productos"        valor={NUM(resumen.TotalProductos)} color="#0A1E3F" />
          <CardKPI icon={Layers}     label="Categorías"       valor={NUM(resumen.Categorias)}     color="#54C4E0" />
          <CardKPI icon={DollarSign} label="Valor catálogo"   valor={USD(resumen.ValorCatalogoUSD)} color="#5BBE6A" />
          <CardKPI icon={Tag}        label="Con promoción"    valor={NUM(resumen.ConPromo)}       color="#E67E22" />
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto o SKU…"
              className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl w-64" />
          </div>
          <button onClick={() => setCat('')} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${!cat ? 'bg-vida-blue text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>Todas</button>
          {categorias.map(c => (
            <button key={c.idCategoria} onClick={() => setCat(String(c.idCategoria))}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold ${String(cat) === String(c.idCategoria) ? 'bg-vida-blue text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-vida-blue'}`}>
              {c.Nombre}
            </button>
          ))}
        </div>

        {/* Grid de productos */}
        {cargando ? <Spinner /> : productos.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <BookOpen size={48} className="mx-auto mb-3 opacity-20" />
            <p className="font-medium">Sin productos en el catálogo</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {productos.map(p => (
              <div key={p.idProducto} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="relative h-32 bg-gray-50 flex items-center justify-center">
                  {img(p.ImagenProducto)
                    ? <img src={img(p.ImagenProducto)} alt={p.Nombre} className="h-full w-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                    : <Package size={40} className="text-gray-200" />}
                  {p.PromoBadge && (
                    <span className="absolute top-2 left-2 bg-vida-blue text-white text-xs font-black px-2 py-0.5 rounded-lg">{p.PromoBadge}</span>
                  )}
                </div>
                <div className="p-3">
                  <p className="font-bold text-gray-800 text-sm truncate">{p.Nombre}</p>
                  <p className="text-xs text-gray-400 mb-2">{p.NombreCategoria || 'Sin categoría'} {p.SKU ? `· ${p.SKU}` : ''}</p>
                  <div className="flex items-end justify-between">
                    <div>
                      {p.PrecioPromo != null ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-lg font-black text-vida-green">{USD(p.PrecioPromo)}</span>
                          <span className="text-xs text-gray-400 line-through">{USD(p.PrecioUSD)}</span>
                        </div>
                      ) : (
                        <span className="text-lg font-black text-gray-900">{USD(p.PrecioUSD)}</span>
                      )}
                      <p className="text-[10px] text-gray-400">costo {USD(p.CostoUSD)}{p.MargenPct != null ? ` · +${p.MargenPct}%` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-50 text-[11px] text-gray-500">
                    <span className="flex items-center gap-1"><Boxes size={11} /> {NUM(p.StockTotal)} en red</span>
                    <span className="flex items-center gap-1"><Store size={11} /> {p.TiendasConStock} tienda{p.TiendasConStock !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
