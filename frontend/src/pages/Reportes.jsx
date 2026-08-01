// src/pages/Reportes.jsx
import { useState, useEffect, useCallback } from 'react';
import {
  BarChart2, TrendingUp, Package, ArrowUpDown,
  Download, FileSpreadsheet, FileText,
  Filter, RefreshCw, AlertTriangle,
  DollarSign, ShoppingCart, CreditCard, Banknote,
  MapPin, Store, Globe, ChevronDown, Truck, Star, XCircle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, LineChart, Line,
  PieChart, Pie, Cell,
} from 'recharts';
import api from '../services/api.js';
import {
  exportarVentasExcel, exportarProductosExcel,
  exportarInventarioExcel, exportarMovimientosExcel,
  exportarDeliveryExcel,
} from '../utils/exportExcel.js';
import {
  exportarVentasPDF, exportarProductosPDF,
  exportarInventarioPDF, exportarMovimientosPDF,
  exportarDeliveryPDF,
} from '../utils/exportPDF.js';
import { useAuthStore } from '../store/authStore.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const USD  = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const FMT  = (v) => Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const HOY  = () => new Date().toISOString().split('T')[0];
const HACE7 = () => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().split('T')[0]; };

const TIPO_BADGE = {
  ENTRADA: 'bg-green-100 text-green-700 border-green-200',
  SALIDA:  'bg-red-100 text-red-700 border-red-200',
  AJUSTE:  'bg-blue-100 text-blue-700 border-blue-200',
};
const METODO_BADGE = {
  EFECTIVO: 'bg-amber-100 text-amber-700',
  TARJETA:  'bg-blue-100 text-blue-700',
  MIXTO:    'bg-purple-100 text-purple-700',
};

// ─── Componentes pequeños ─────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-vida-blue/30 border-t-vida-blue rounded-full animate-spin" />
    </div>
  );
}

function CardResumen({ icon: Icon, label, valor, sub, color = 'blue' }) {
  const colores = {
    blue:   'from-vida-blue   to-blue-500   text-white',
    green:  'from-vida-green  to-emerald-500 text-white',
    amber:  'from-amber-400   to-orange-500  text-white',
    red:    'from-red-400     to-rose-500    text-white',
    purple: 'from-purple-500  to-violet-500  text-white',
  };
  return (
    <div className={`rounded-2xl bg-gradient-to-br p-5 shadow-md flex items-center gap-4 ${colores[color]}`}>
      <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
        <Icon size={24} />
      </div>
      <div>
        <p className="text-xs font-semibold opacity-80 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-black leading-tight">{valor}</p>
        {sub && <p className="text-xs opacity-70 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function FiltroGeografia({ usuario, filtros, geo, setGeo }) {
  const esSolo = ['SUPERVISOR', 'CAJERO', 'CASHIER'].includes(usuario?.TipoUsuario);
  const puedeVerPais = ['SUPER_ADMIN', 'ADMIN_PAIS'].includes(usuario?.TipoUsuario);

  if (esSolo) return null;

  const estadosFiltrados = geo.filtroPais
    ? filtros.estados.filter(e => {
        const suc = filtros.sucursales.find(s => s.Estado === e);
        return suc && suc.Pais === geo.filtroPais;
      })
    : filtros.estados;

  const sucursalesFiltradas = filtros.sucursales.filter(s => {
    if (geo.filtroPais  && s.Pais   !== geo.filtroPais)  return false;
    if (geo.filtroEstado && s.Estado !== geo.filtroEstado) return false;
    return true;
  });

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {puedeVerPais && (
        <select
          value={geo.filtroPais || ''}
          onChange={e => setGeo({ filtroPais: e.target.value || undefined, filtroEstado: undefined, filtroIdPuntoVenta: undefined })}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-vida-blue/30"
        >
          <option value="">🌎 Todos los países</option>
          {filtros.paises.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      )}

      <select
        value={geo.filtroEstado || ''}
        onChange={e => setGeo(prev => ({ ...prev, filtroEstado: e.target.value || undefined, filtroIdPuntoVenta: undefined }))}
        className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-vida-blue/30"
      >
        <option value="">📍 Todos los estados</option>
        {estadosFiltrados.map(e => <option key={e} value={e}>{e}</option>)}
      </select>

      <select
        value={geo.filtroIdPuntoVenta || ''}
        onChange={e => setGeo(prev => ({ ...prev, filtroIdPuntoVenta: e.target.value || undefined }))}
        className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-vida-blue/30"
      >
        <option value="">🏪 Todas las sucursales</option>
        {sucursalesFiltradas.map(s => (
          <option key={s.idPuntoVenta} value={s.idPuntoVenta}>{s.NombrePuntoVenta}</option>
        ))}
      </select>
    </div>
  );
}

function BotonesExport({ onExcel, onPDF, cargando }) {
  return (
    <div className="flex gap-2">
      <button onClick={onExcel} disabled={cargando}
        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50 shadow-sm">
        <FileSpreadsheet size={15} />
        Excel
      </button>
      <button onClick={onPDF} disabled={cargando}
        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50 shadow-sm">
        <FileText size={15} />
        PDF
      </button>
    </div>
  );
}

// ─── TAB: Ventas ─────────────────────────────────────────────────────────────

function TabVentas({ filtros }) {
  const { usuario } = useAuthStore();
  const [rango, setRango]     = useState({ ini: HACE7(), fin: HOY() });
  const [geo, setGeo]         = useState({});
  const [datos, setDatos]     = useState(null);
  const [cargando, setCarg]   = useState(false);
  const [error, setError]     = useState(null);

  const cargar = useCallback(async () => {
    setCarg(true); setError(null);
    try {
      const params = new URLSearchParams({
        fechaInicio: rango.ini, fechaFin: rango.fin,
        ...(geo.filtroPais          && { filtroPais: geo.filtroPais }),
        ...(geo.filtroEstado        && { filtroEstado: geo.filtroEstado }),
        ...(geo.filtroIdPuntoVenta  && { filtroIdPuntoVenta: geo.filtroIdPuntoVenta }),
      });
      const r = await api.get(`/reportes/ventas?${params}`);
      setDatos(r.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Error al cargar reporte');
    } finally { setCarg(false); }
  }, [rango, geo]);

  useEffect(() => { cargar(); }, [cargar]);

  const grafData = (datos?.graficaDiaria || []).map(r => ({
    fecha:  new Date(r.Fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }),
    ventas: r.NumVentas,
    total:  Number(r.TotalUSD || 0),
  }));

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Desde</label>
            <input type="date" value={rango.ini}
              onChange={e => setRango(r => ({ ...r, ini: e.target.value }))}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-vida-blue/30" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Hasta</label>
            <input type="date" value={rango.fin}
              onChange={e => setRango(r => ({ ...r, fin: e.target.value }))}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-vida-blue/30" />
          </div>
          <FiltroGeografia usuario={usuario} filtros={filtros} geo={geo} setGeo={setGeo} />
          <button onClick={cargar} disabled={cargando}
            className="flex items-center gap-2 px-4 py-2 bg-vida-blue hover:bg-vida-blue/90 text-white text-sm font-semibold rounded-xl transition-all">
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
            {cargando ? 'Cargando…' : 'Actualizar'}
          </button>
          {datos && (
            <BotonesExport
              onExcel={() => exportarVentasExcel({ ...datos, fechaInicio: rango.ini, fechaFin: rango.fin })}
              onPDF={()   => exportarVentasPDF  ({ ...datos, fechaInicio: rango.ini, fechaFin: rango.fin })}
              cargando={cargando} />
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {cargando && <Spinner />}

      {!cargando && datos && (
        <>
          {/* Tarjetas */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <CardResumen icon={ShoppingCart} label="Total ventas"    valor={datos.totales.NumVentas}             color="blue"   />
            <CardResumen icon={DollarSign}   label="Total USD"       valor={USD(datos.totales.TotalUSD)}         color="green"  />
            <CardResumen icon={Banknote}     label="Efectivo"        valor={USD(datos.totales.TotalEfectivo)}    color="amber"  />
            <CardResumen icon={CreditCard}   label="Tarjeta"         valor={USD(datos.totales.TotalTarjeta)}     color="purple" />
            <CardResumen icon={DollarSign}   label="Cambio devuelto" valor={USD(datos.totales.TotalCambio)}      color="red"    />
          </div>

          {/* Gráfica */}
          {grafData.length > 0 && (
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                <TrendingUp size={16} className="text-vida-blue" />
                Ventas diarias — Total USD
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={grafData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                  <Tooltip formatter={(v, n) => [n === 'total' ? USD(v) : v, n === 'total' ? 'Total USD' : 'Ventas']} />
                  <Legend formatter={v => v === 'total' ? 'Total USD' : 'N° Ventas'} />
                  <Bar dataKey="total"  fill="#0A1E3F" radius={[4,4,0,0]} name="total" />
                  <Bar dataKey="ventas" fill="#5BBE6A" radius={[4,4,0,0]} name="ventas" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabla */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Store size={16} className="text-vida-blue" />
                Desglose por sucursal
              </h3>
              <span className="text-xs text-gray-400">{datos.filas.length} sucursales</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    {['País','Estado','Ciudad','Sucursal','Ventas','Total USD','Efectivo','Tarjeta','Cambio'].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {datos.filas.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-gray-500">{r.Pais || '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{r.Estado || '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{r.Ciudad || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{r.NombrePuntoVenta}</td>
                      <td className="px-4 py-3 text-center font-bold text-vida-blue">{r.NumVentas}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{USD(r.TotalUSD)}</td>
                      <td className="px-4 py-3 text-right text-amber-700">{USD(r.TotalEfectivo)}</td>
                      <td className="px-4 py-3 text-right text-blue-700">{USD(r.TotalTarjeta)}</td>
                      <td className="px-4 py-3 text-right text-red-600">{USD(r.TotalCambio)}</td>
                    </tr>
                  ))}
                  {/* Fila de totales */}
                  <tr className="bg-gray-900 text-white font-bold">
                    <td colSpan={4} className="px-4 py-3">TOTALES</td>
                    <td className="px-4 py-3 text-center">{datos.totales.NumVentas}</td>
                    <td className="px-4 py-3 text-right">{USD(datos.totales.TotalUSD)}</td>
                    <td className="px-4 py-3 text-right">{USD(datos.totales.TotalEfectivo)}</td>
                    <td className="px-4 py-3 text-right">{USD(datos.totales.TotalTarjeta)}</td>
                    <td className="px-4 py-3 text-right">{USD(datos.totales.TotalCambio)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── TAB: Productos ───────────────────────────────────────────────────────────

function TabProductos({ filtros }) {
  const { usuario } = useAuthStore();
  const [rango, setRango]   = useState({ ini: HACE7(), fin: HOY() });
  const [geo, setGeo]       = useState({});
  const [top, setTop]       = useState(20);
  const [datos, setDatos]   = useState(null);
  const [cargando, setCarg] = useState(false);
  const [error, setError]   = useState(null);

  const cargar = useCallback(async () => {
    setCarg(true); setError(null);
    try {
      const params = new URLSearchParams({
        fechaInicio: rango.ini, fechaFin: rango.fin, top,
        ...(geo.filtroPais         && { filtroPais: geo.filtroPais }),
        ...(geo.filtroEstado       && { filtroEstado: geo.filtroEstado }),
        ...(geo.filtroIdPuntoVenta && { filtroIdPuntoVenta: geo.filtroIdPuntoVenta }),
      });
      const r = await api.get(`/reportes/productos?${params}`);
      setDatos(r.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Error al cargar reporte');
    } finally { setCarg(false); }
  }, [rango, geo, top]);

  useEffect(() => { cargar(); }, [cargar]);

  const chartData = (datos?.filas || []).slice(0, 10).map(r => ({
    name: r.NombreProducto.length > 20 ? r.NombreProducto.slice(0, 20) + '…' : r.NombreProducto,
    ingresos: Number(r.TotalRevenue || 0),
    cantidad: Number(r.TotalCantidad || 0),
  }));

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Desde</label>
            <input type="date" value={rango.ini}
              onChange={e => setRango(r => ({ ...r, ini: e.target.value }))}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-vida-blue/30" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Hasta</label>
            <input type="date" value={rango.fin}
              onChange={e => setRango(r => ({ ...r, fin: e.target.value }))}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-vida-blue/30" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Top</label>
            <select value={top} onChange={e => setTop(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-vida-blue/30">
              {[10, 20, 50, 100].map(n => <option key={n} value={n}>Top {n}</option>)}
            </select>
          </div>
          <FiltroGeografia usuario={usuario} filtros={filtros} geo={geo} setGeo={setGeo} />
          <button onClick={cargar} disabled={cargando}
            className="flex items-center gap-2 px-4 py-2 bg-vida-blue hover:bg-vida-blue/90 text-white text-sm font-semibold rounded-xl transition-all">
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
            {cargando ? 'Cargando…' : 'Actualizar'}
          </button>
          {datos && (
            <BotonesExport
              onExcel={() => exportarProductosExcel({ ...datos, fechaInicio: rango.ini, fechaFin: rango.fin })}
              onPDF={()   => exportarProductosPDF  ({ ...datos, fechaInicio: rango.ini, fechaFin: rango.fin })}
              cargando={cargando} />
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {cargando && <Spinner />}

      {!cargando && datos && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <CardResumen icon={Package}   label="Productos distintos" valor={datos.totales.NumProductos}         color="blue"  />
            <CardResumen icon={TrendingUp} label="Total unidades"     valor={FMT(datos.totales.TotalCantidad)}   color="green" />
            <CardResumen icon={DollarSign} label="Ingresos totales"   valor={USD(datos.totales.TotalRevenue)}    color="amber" />
          </div>

          {chartData.length > 0 && (
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <h3 className="text-sm font-bold text-gray-700 mb-4">Top 10 por ingresos</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 120 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={115} />
                  <Tooltip formatter={(v) => [USD(v), 'Ingresos']} />
                  <Bar dataKey="ingresos" fill="#0A1E3F" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Package size={16} className="text-vida-blue" />
                Ranking completo
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    {['#','Producto','Categoría','Unidad','Cant. Vendida','Ingresos USD','Pedidos','Precio Actual'].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {datos.filas.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black
                          ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-100 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-600' : 'text-gray-400'}`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{r.NombreProducto}</td>
                      <td className="px-4 py-3 text-gray-500">{r.Categoria || '—'}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{r.UnidadMedida || '—'}</td>
                      <td className="px-4 py-3 text-right font-bold text-vida-blue">{FMT(r.TotalCantidad)}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{USD(r.TotalRevenue)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{r.NumPedidos}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{USD(r.PrecioActual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── TAB: Inventario ─────────────────────────────────────────────────────────

function TabInventario({ filtros }) {
  const { usuario } = useAuthStore();
  const [geo, setGeo]           = useState({});
  const [soloAlerta, setSolo]   = useState(false);
  const [datos, setDatos]       = useState(null);
  const [cargando, setCarg]     = useState(false);
  const [error, setError]       = useState(null);
  const [busqueda, setBusqueda] = useState('');

  const cargar = useCallback(async () => {
    setCarg(true); setError(null);
    try {
      const params = new URLSearchParams({
        soloStockBajo: soloAlerta ? 'true' : 'false',
        ...(geo.filtroPais         && { filtroPais: geo.filtroPais }),
        ...(geo.filtroEstado       && { filtroEstado: geo.filtroEstado }),
        ...(geo.filtroIdPuntoVenta && { filtroIdPuntoVenta: geo.filtroIdPuntoVenta }),
      });
      const r = await api.get(`/reportes/inventario?${params}`);
      setDatos(r.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Error al cargar reporte');
    } finally { setCarg(false); }
  }, [geo, soloAlerta]);

  useEffect(() => { cargar(); }, [cargar]);

  const filasFiltradas = (datos?.filas || []).filter(r =>
    !busqueda || r.Producto.toLowerCase().includes(busqueda.toLowerCase()) || (r.SKU || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <div className="flex flex-wrap gap-3 items-center">
          <FiltroGeografia usuario={usuario} filtros={filtros} geo={geo} setGeo={setGeo} />
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input type="checkbox" checked={soloAlerta} onChange={e => setSolo(e.target.checked)}
              className="rounded text-red-500" />
            Solo bajo stock
          </label>
          <input type="text" placeholder="Buscar producto o SKU…" value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 w-52 focus:outline-none focus:ring-2 focus:ring-vida-blue/30" />
          <button onClick={cargar} disabled={cargando}
            className="flex items-center gap-2 px-4 py-2 bg-vida-blue hover:bg-vida-blue/90 text-white text-sm font-semibold rounded-xl transition-all">
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
            {cargando ? 'Cargando…' : 'Actualizar'}
          </button>
          {datos && (
            <BotonesExport
              onExcel={() => exportarInventarioExcel(datos)}
              onPDF={()   => exportarInventarioPDF(datos)}
              cargando={cargando} />
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {cargando && <Spinner />}

      {!cargando && datos && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <CardResumen icon={Package}      label="Total productos"  valor={datos.resumen.TotalProductos}             color="blue"  />
            <CardResumen icon={AlertTriangle} label="Bajo stock"      valor={datos.resumen.TotalBajoStock}             color="red"   />
            <CardResumen icon={DollarSign}    label="Valor en stock"  valor={USD(datos.resumen.ValorTotalStock)}        color="green" />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Package size={16} className="text-vida-blue" />
                Stock actual
              </h3>
              <span className="text-xs text-gray-400">{filasFiltradas.length} registros</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    {['País','Estado','Sucursal','Producto','SKU','Categoría','Unidad','Stock','Mín.','Precio','Valor',''].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filasFiltradas.map((r, i) => (
                    <tr key={i} className={`hover:bg-gray-50/50 transition-colors ${r.StockBajo ? 'bg-red-50/40' : ''}`}>
                      <td className="px-4 py-3 text-gray-500 text-xs">{r.Pais || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{r.Estado || '—'}</td>
                      <td className="px-4 py-3 text-gray-700 font-medium text-xs">{r.NombrePuntoVenta}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{r.Producto}</td>
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{r.SKU || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{r.Categoria}</td>
                      <td className="px-4 py-3 text-center text-gray-500 text-xs">{r.UnidadMedida}</td>
                      <td className={`px-4 py-3 text-right font-bold text-base ${r.StockBajo ? 'text-red-600' : 'text-vida-green'}`}>
                        {FMT(r.Stock)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400 text-xs">{FMT(r.StockMinimo)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{USD(r.PrecioUSD)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{USD(r.ValorStock)}</td>
                      <td className="px-4 py-3 text-center">
                        {r.StockBajo && (
                          <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full border border-red-200">
                            <AlertTriangle size={11} /> BAJO
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filasFiltradas.length === 0 && (
                <p className="text-center text-gray-400 py-10 text-sm">Sin registros</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── TAB: Movimientos ────────────────────────────────────────────────────────

function TabMovimientos({ filtros }) {
  const { usuario } = useAuthStore();
  const [rango, setRango]   = useState({ ini: HACE7(), fin: HOY() });
  const [geo, setGeo]       = useState({});
  const [tipo, setTipo]     = useState('');
  const [datos, setDatos]   = useState(null);
  const [cargando, setCarg] = useState(false);
  const [error, setError]   = useState(null);

  const cargar = useCallback(async () => {
    setCarg(true); setError(null);
    try {
      const params = new URLSearchParams({
        fechaInicio: rango.ini, fechaFin: rango.fin,
        ...(tipo                   && { tipo }),
        ...(geo.filtroPais         && { filtroPais: geo.filtroPais }),
        ...(geo.filtroEstado       && { filtroEstado: geo.filtroEstado }),
        ...(geo.filtroIdPuntoVenta && { filtroIdPuntoVenta: geo.filtroIdPuntoVenta }),
      });
      const r = await api.get(`/reportes/movimientos?${params}`);
      setDatos(r.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Error al cargar reporte');
    } finally { setCarg(false); }
  }, [rango, geo, tipo]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Desde</label>
            <input type="date" value={rango.ini}
              onChange={e => setRango(r => ({ ...r, ini: e.target.value }))}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-vida-blue/30" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Hasta</label>
            <input type="date" value={rango.fin}
              onChange={e => setRango(r => ({ ...r, fin: e.target.value }))}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-vida-blue/30" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Tipo</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-vida-blue/30">
              <option value="">Todos</option>
              <option value="ENTRADA">Entrada</option>
              <option value="SALIDA">Salida</option>
              <option value="AJUSTE">Ajuste</option>
            </select>
          </div>
          <FiltroGeografia usuario={usuario} filtros={filtros} geo={geo} setGeo={setGeo} />
          <button onClick={cargar} disabled={cargando}
            className="flex items-center gap-2 px-4 py-2 bg-vida-blue hover:bg-vida-blue/90 text-white text-sm font-semibold rounded-xl transition-all">
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
            {cargando ? 'Cargando…' : 'Actualizar'}
          </button>
          {datos && (
            <BotonesExport
              onExcel={() => exportarMovimientosExcel({ ...datos, fechaInicio: rango.ini, fechaFin: rango.fin })}
              onPDF={()   => exportarMovimientosPDF  ({ ...datos, fechaInicio: rango.ini, fechaFin: rango.fin })}
              cargando={cargando} />
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {cargando && <Spinner />}

      {!cargando && datos && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <CardResumen icon={ArrowUpDown} label="Entradas (reg.)"   valor={datos.resumen.TotalEntradas}         color="green"  />
            <CardResumen icon={TrendingUp}  label="Cant. entradas"    valor={FMT(datos.resumen.CantEntradas)}     color="green"  />
            <CardResumen icon={ArrowUpDown} label="Salidas (reg.)"    valor={datos.resumen.TotalSalidas}          color="red"    />
            <CardResumen icon={TrendingUp}  label="Cant. salidas"     valor={FMT(datos.resumen.CantSalidas)}      color="red"    />
            <CardResumen icon={Package}     label="Ajustes"           valor={datos.resumen.TotalAjustes}          color="blue"   />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <ArrowUpDown size={16} className="text-vida-blue" />
                Historial de movimientos
              </h3>
              <span className="text-xs text-gray-400">{datos.filas.length} registros</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    {['Fecha','Estado','Sucursal','Producto','SKU','Tipo','Cantidad','Antes','Después','Motivo','Usuario'].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {datos.filas.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {new Date(r.FechaAlta).toLocaleDateString('es-VE')}
                        <br />
                        <span className="text-gray-400">{new Date(r.FechaAlta).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{r.Estado || '—'}</td>
                      <td className="px-4 py-3 text-gray-700 text-xs font-medium">{r.NombrePuntoVenta}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{r.Producto}</td>
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{r.SKU || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-bold px-2 py-1 rounded-lg border ${TIPO_BADGE[r.TipoMovimiento]}`}>
                          {r.TipoMovimiento}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{FMT(r.Cantidad)}</td>
                      <td className="px-4 py-3 text-right text-gray-400 text-xs">{FMT(r.CantidadAntes)}</td>
                      <td className="px-4 py-3 text-right text-gray-600 text-xs">{FMT(r.CantidadDespues)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-[140px] truncate">{r.Motivo || '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{r.UsuAlta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {datos.filas.length === 0 && (
                <p className="text-center text-gray-400 py-10 text-sm">Sin movimientos en el período</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── TAB: Delivery ───────────────────────────────────────────────────────────

const METODO_PIE_COLOR = {
  EFECTIVO:   '#F39C12',
  PAGO_MOVIL: '#8E44AD',
  TARJETA:    '#2CA6C4',
  USDT:       '#16A085',
  OTRO:       '#95A5A6',
};

function TabDelivery({ filtros }) {
  const { usuario } = useAuthStore();
  const [rango, setRango]   = useState({ ini: HACE7(), fin: HOY() });
  const [geo, setGeo]       = useState({});
  const [datos, setDatos]   = useState(null);
  const [cargando, setCarg] = useState(false);
  const [error, setError]   = useState(null);

  const cargar = useCallback(async () => {
    setCarg(true); setError(null);
    try {
      const params = new URLSearchParams({
        fechaInicio: rango.ini, fechaFin: rango.fin,
        ...(geo.filtroPais         && { filtroPais: geo.filtroPais }),
        ...(geo.filtroEstado       && { filtroEstado: geo.filtroEstado }),
        ...(geo.filtroIdPuntoVenta && { filtroIdPuntoVenta: geo.filtroIdPuntoVenta }),
      });
      const r = await api.get(`/reportes/delivery?${params}`);
      setDatos(r.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Error al cargar reporte');
    } finally { setCarg(false); }
  }, [rango, geo]);

  useEffect(() => { cargar(); }, [cargar]);

  const grafData = (datos?.graficaDiaria || []).map(r => ({
    fecha:  new Date(r.Fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }),
    total:  Number(r.TotalUSD || 0),
    pedidos: r.NumPedidos,
  }));

  const pieData = (datos?.porMetodo || []).map(r => ({
    name: r.MetodoPago === 'PAGO_MOVIL' ? 'Pago Móvil' : r.MetodoPago,
    metodo: r.MetodoPago,
    value: Number(r.TotalUSD || 0),
    pedidos: r.NumPedidos,
  }));

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Desde</label>
            <input type="date" value={rango.ini}
              onChange={e => setRango(r => ({ ...r, ini: e.target.value }))}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-vida-blue/30" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Hasta</label>
            <input type="date" value={rango.fin}
              onChange={e => setRango(r => ({ ...r, fin: e.target.value }))}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-vida-blue/30" />
          </div>
          <FiltroGeografia usuario={usuario} filtros={filtros} geo={geo} setGeo={setGeo} />
          <button onClick={cargar} disabled={cargando}
            className="flex items-center gap-2 px-4 py-2 bg-vida-blue hover:bg-vida-blue/90 text-white text-sm font-semibold rounded-xl transition-all">
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
            {cargando ? 'Cargando…' : 'Actualizar'}
          </button>
          {datos && (
            <BotonesExport
              onExcel={() => exportarDeliveryExcel({ ...datos, fechaInicio: rango.ini, fechaFin: rango.fin })}
              onPDF={()   => exportarDeliveryPDF  ({ ...datos, fechaInicio: rango.ini, fechaFin: rango.fin })}
              cargando={cargando} />
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {cargando && <Spinner />}

      {!cargando && datos && (
        <>
          {/* Tarjetas */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <CardResumen icon={Truck}       label="Entregas"       valor={datos.totales.NumEntregas}               color="blue"   />
            <CardResumen icon={DollarSign}  label="Monto generado" valor={USD(datos.totales.MontoGenerado)}        color="green"  />
            <CardResumen icon={Banknote}    label="Comisiones"     valor={USD(datos.totales.Comisiones)}           color="amber"  />
            <CardResumen icon={ShoppingCart} label="Ticket prom."  valor={USD(datos.totales.TicketPromedio)}       color="purple" />
            <CardResumen icon={XCircle}     label="Cancelados"     valor={datos.totales.Cancelados}                color="red"    />
          </div>

          {/* Gráfica diaria + Pie de métodos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                <TrendingUp size={16} className="text-vida-blue" />
                Ventas de delivery por día (USD)
              </h3>
              {grafData.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-gray-300 text-sm">Sin entregas en el período</div>
              ) : (
                <ResponsiveContainer width="100%" height={230}>
                  <LineChart data={grafData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                    <Tooltip formatter={(v, n) => [n === 'total' ? USD(v) : v, n === 'total' ? 'Total USD' : 'Pedidos']} />
                    <Legend formatter={v => v === 'total' ? 'Total USD' : 'N° Pedidos'} />
                    <Line type="monotone" dataKey="total" stroke="#0A1E3F" strokeWidth={2.5} dot={{ r: 3 }} name="total" />
                    <Line type="monotone" dataKey="pedidos" stroke="#5BBE6A" strokeWidth={2} dot={{ r: 2 }} name="pedidos" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                <CreditCard size={16} className="text-vida-blue" />
                Por método de pago
              </h3>
              {pieData.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-gray-300 text-sm">Sin datos</div>
              ) : (
                <ResponsiveContainer width="100%" height={230}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={78} innerRadius={40}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}
                      style={{ fontSize: 10 }}>
                      {pieData.map((e, i) => (
                        <Cell key={i} fill={METODO_PIE_COLOR[e.metodo] || '#95A5A6'} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n, p) => [`${USD(v)} · ${p.payload.pedidos} pedidos`, p.payload.name]} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Tabla por repartidor */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Truck size={16} className="text-vida-blue" />
                Desempeño por repartidor
              </h3>
              <span className="text-xs text-gray-400">{datos.porRepartidor.length} repartidores</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    {['#','Repartidor','Vehículo','Calif.','Entregas','Monto Generado','Comisión','Efectivo Recaud.'].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {datos.porRepartidor.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black
                          ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-100 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-600' : 'text-gray-400'}`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{r.Nombre}</td>
                      <td className="px-4 py-3 text-gray-500">{r.Vehiculo || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {r.Calificacion != null ? (
                          <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
                            <Star size={12} className="fill-amber-400 text-amber-400" />{Number(r.Calificacion).toFixed(1)}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-vida-blue">{r.Entregas}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{USD(r.MontoGenerado)}</td>
                      <td className="px-4 py-3 text-right text-emerald-700 font-semibold">{USD(r.Comisiones)}</td>
                      <td className="px-4 py-3 text-right text-amber-700">{USD(r.EfectivoRecaudado)}</td>
                    </tr>
                  ))}
                  {/* Totales */}
                  <tr className="bg-gray-900 text-white font-bold">
                    <td colSpan={4} className="px-4 py-3">TOTALES</td>
                    <td className="px-4 py-3 text-right">{datos.totales.NumEntregas}</td>
                    <td className="px-4 py-3 text-right">{USD(datos.totales.MontoGenerado)}</td>
                    <td className="px-4 py-3 text-right">{USD(datos.totales.Comisiones)}</td>
                    <td className="px-4 py-3 text-right">{USD(datos.totales.EfectivoRecaudado)}</td>
                  </tr>
                </tbody>
              </table>
              {datos.porRepartidor.length === 0 && (
                <p className="text-center text-gray-400 py-10 text-sm">Sin entregas en el período</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

const TABS = [
  { id: 'ventas',       label: 'Ventas',       icon: BarChart2    },
  { id: 'delivery',     label: 'Delivery',      icon: Truck        },
  { id: 'productos',    label: 'Productos',     icon: TrendingUp   },
  { id: 'inventario',   label: 'Inventario',    icon: Package      },
  { id: 'movimientos',  label: 'Movimientos',   icon: ArrowUpDown  },
];

export default function Reportes() {
  const [tab, setTab]       = useState('ventas');
  const [filtros, setFiltros] = useState({ sucursales: [], paises: [], estados: [] });

  useEffect(() => {
    api.get('/reportes/filtros')
      .then(r => setFiltros(r.data))
      .catch(() => {});
  }, []);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <BarChart2 size={22} className="text-vida-blue" />
            Reportes y Estadísticas
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Análisis de ventas, productos, inventario y movimientos</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 px-6">
        <div className="flex gap-1">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-3.5 text-sm font-semibold border-b-2 transition-all whitespace-nowrap
                  ${tab === t.id
                    ? 'border-vida-blue text-vida-blue'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Contenido */}
      <div className="p-6">
        {tab === 'ventas'      && <TabVentas      filtros={filtros} />}
        {tab === 'delivery'    && <TabDelivery    filtros={filtros} />}
        {tab === 'productos'   && <TabProductos   filtros={filtros} />}
        {tab === 'inventario'  && <TabInventario  filtros={filtros} />}
        {tab === 'movimientos' && <TabMovimientos filtros={filtros} />}
      </div>
    </div>
  );
}
