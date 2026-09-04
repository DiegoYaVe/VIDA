// src/pages/Reportes.jsx
import { useState, useEffect, useCallback } from 'react';
import {
  BarChart2, TrendingUp, Package, ArrowUpDown,
  Download, FileSpreadsheet, FileText,
  Filter, RefreshCw, AlertTriangle,
  DollarSign, ShoppingCart, CreditCard, Banknote,
  MapPin, Store, Globe, ChevronDown, Truck, Star, XCircle, Building2, Award,
  Calculator, Target, Save,
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
  exportarDeliveryExcel, exportarRedExcel,
} from '../utils/exportExcel.js';
import {
  exportarVentasPDF, exportarProductosPDF,
  exportarInventarioPDF, exportarMovimientosPDF,
  exportarDeliveryPDF, exportarRedPDF,
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

// ─── TAB: Red (ejecutivo) ─────────────────────────────────────────────────────
function TabRed({ filtros }) {
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
      const r = await api.get(`/reportes/red?${params}`);
      setDatos(r.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Error al cargar el reporte de red');
    } finally { setCarg(false); }
  }, [rango, geo]);
  useEffect(() => { cargar(); }, [cargar]);

  // Top 10 tiendas para la gráfica de ranking
  const rankData = (datos?.filas || []).slice(0, 10).map(r => ({
    name: (r.NombrePuntoVenta || '').length > 18 ? r.NombrePuntoVenta.slice(0, 18) + '…' : r.NombrePuntoVenta,
    total: Number(r.TotalUSD || 0),
  }));

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div><label className="block text-xs font-semibold text-gray-500 mb-1">Desde</label>
            <input type="date" value={rango.ini} onChange={e => setRango(r => ({ ...r, ini: e.target.value }))}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2" /></div>
          <div><label className="block text-xs font-semibold text-gray-500 mb-1">Hasta</label>
            <input type="date" value={rango.fin} onChange={e => setRango(r => ({ ...r, fin: e.target.value }))}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2" /></div>
          <FiltroGeografia usuario={usuario} filtros={filtros} geo={geo} setGeo={setGeo} />
          <button onClick={cargar} disabled={cargando}
            className="flex items-center gap-2 px-4 py-2 bg-vida-blue hover:opacity-90 text-white text-sm font-semibold rounded-xl">
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> {cargando ? 'Cargando…' : 'Actualizar'}
          </button>
          {datos && (
            <BotonesExport
              onExcel={() => exportarRedExcel({ ...datos, fechaInicio: rango.ini, fechaFin: rango.fin })}
              onPDF={()   => exportarRedPDF  ({ ...datos, fechaInicio: rango.ini, fechaFin: rango.fin })}
              cargando={cargando} />
          )}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {error}</div>}
      {cargando && <Spinner />}

      {!cargando && datos && (
        <>
          {/* KPIs de red */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <CardResumen icon={Building2}    label="Tiendas con ventas" valor={`${datos.totales.NumTiendas}/${datos.totales.TotalTiendas}`} color="blue"   />
            <CardResumen icon={DollarSign}   label="Total red"          valor={USD(datos.totales.TotalUSD)}       color="green"  />
            <CardResumen icon={Store}        label="Ventas POS"         valor={USD(datos.totales.TotalPOS)}       color="blue"   />
            <CardResumen icon={Truck}        label="Ventas Delivery"    valor={USD(datos.totales.TotalDelivery)}  color="purple" />
            <CardResumen icon={ShoppingCart} label="Ticket promedio"    valor={USD(datos.totales.TicketPromedio)} color="amber"  />
          </div>

          {/* Ranking de tiendas (gráfica) */}
          {rankData.length > 0 && (
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2"><Award size={16} className="text-vida-blue" /> Ranking de tiendas por ventas (Top 10)</h3>
              <ResponsiveContainer width="100%" height={Math.max(200, rankData.length * 32)}>
                <BarChart data={rankData} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 110 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={105} />
                  <Tooltip formatter={v => [USD(v), 'Total']} />
                  <Bar dataKey="total" fill="#0A1E3F" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabla ranking completa */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-800 flex items-center gap-2"><Building2 size={16} className="text-vida-blue" /> Ventas por tienda (POS + Delivery)</h3>
              <span className="text-xs text-gray-400">{datos.filas.length} tiendas</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    {['#','Tienda','Ciudad','Onboarding','Transacc.','POS','Delivery','Total USD','% Red'].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {datos.filas.map((r, i) => (
                    <tr key={r.idPuntoVenta} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black
                          ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-100 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-600' : 'text-gray-400'}`}>{i + 1}</span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{r.NombrePuntoVenta}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{r.Ciudad || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{r.EstadoOnboarding}</td>
                      <td className="px-4 py-3 text-center font-bold text-vida-blue">{r.NumTransacciones}</td>
                      <td className="px-4 py-3 text-right text-blue-700">{USD(r.TotalPOS)}</td>
                      <td className="px-4 py-3 text-right text-purple-700">{USD(r.TotalDelivery)}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{USD(r.TotalUSD)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{r.ParticipacionPct}%</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-900 text-white font-bold">
                    <td colSpan={4} className="px-4 py-3">TOTAL RED</td>
                    <td className="px-4 py-3 text-center">{datos.totales.NumTransacciones}</td>
                    <td className="px-4 py-3 text-right">{USD(datos.totales.TotalPOS)}</td>
                    <td className="px-4 py-3 text-right">{USD(datos.totales.TotalDelivery)}</td>
                    <td className="px-4 py-3 text-right">{USD(datos.totales.TotalUSD)}</td>
                    <td className="px-4 py-3 text-right">100%</td>
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

// ─── Página principal ─────────────────────────────────────────────────────────

const ROLES_RED = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN'];

// ─── TAB: Metas de venta ──────────────────────────────────────────────────────
function BarraMeta({ titulo, p }) {
  const pct = p?.pct ?? 0;
  const cumplida = !!p?.cumplida;
  const sinMeta = !p || !p.meta;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
          {titulo} {cumplida && <span title="Meta cumplida">🏅</span>}
        </p>
        <p className="text-sm font-black text-gray-900">
          {USD(p?.ventas)} <span className="text-gray-400 font-semibold">/ {sinMeta ? '—' : USD(p?.meta)}</span>
        </p>
      </div>
      {sinMeta ? (
        <p className="text-xs text-gray-400">Define una meta para ver tu progreso.</p>
      ) : (
        <>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: cumplida ? '#5BBE6A' : 'linear-gradient(90deg,#54C4E0,#0A1E3F)' }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className={`text-xs font-bold ${cumplida ? 'text-vida-green' : 'text-vida-blue'}`}>{pct}% de tu meta</span>
            {cumplida
              ? <span className="text-xs font-bold text-vida-green">¡Meta alcanzada! 🎉</span>
              : <span className="text-xs text-gray-400">te faltan {USD(p?.falta)}</span>}
          </div>
        </>
      )}
    </div>
  );
}

function TabMetas({ filtros, puedeVerRed }) {
  const [idPV, setIdPV] = useState('');
  const [metas, setMetas] = useState({ MetaDiariaUSD: '', MetaSemanalUSD: '', MetaMensualUSD: '' });
  const [prog, setProg] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const params = () => (puedeVerRed && idPV ? { idPuntoVenta: idPV } : {});

  const cargar = useCallback(async () => {
    if (puedeVerRed && !idPV) { setProg(null); return; }
    setError('');
    try {
      const [m, p] = await Promise.all([
        api.get('/metas', { params: params() }),
        api.get('/metas/progreso', { params: params() }),
      ]);
      setMetas({
        MetaDiariaUSD:  m.data.MetaDiariaUSD ?? '',
        MetaSemanalUSD: m.data.MetaSemanalUSD ?? '',
        MetaMensualUSD: m.data.MetaMensualUSD ?? '',
      });
      setProg(p.data.progreso);
    } catch (e) { setError(e.response?.data?.error || 'Error al cargar'); }
  }, [idPV]); // eslint-disable-line
  useEffect(() => { cargar(); }, [cargar]);

  const set = (k, v) => setMetas(p => ({ ...p, [k]: v }));

  async function guardar() {
    setGuardando(true); setError('');
    try {
      await api.put('/metas', { ...metas, ...params() });
      const p = await api.get('/metas/progreso', { params: params() });
      setProg(p.data.progreso);
    } catch (e) { setError(e.response?.data?.error || 'Error al guardar'); }
    finally { setGuardando(false); }
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {puedeVerRed && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
          <Store size={16} className="text-vida-blue" />
          <select value={idPV} onChange={e => setIdPV(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">— Elige una tienda —</option>
            {(filtros?.sucursales || []).map(s => (
              <option key={s.idPuntoVenta} value={s.idPuntoVenta}>{s.NombrePuntoVenta || s.NomComercial}</option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {puedeVerRed && !idPV ? (
        <div className="text-center py-16 text-gray-400">
          <Target size={40} className="mx-auto mb-3 opacity-30" />
          <p>Elige una tienda para ver sus metas</p>
        </div>
      ) : (
        <>
          {/* Definir metas */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-black text-gray-800 flex items-center gap-2 mb-1"><Target size={18} className="text-vida-green" /> Mis metas de venta</h3>
            <p className="text-xs text-gray-400 mb-4">Define tu objetivo de ventas (en USD). El sistema mide tu avance con las ventas entregadas.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <CampoNum label="Meta diaria" value={metas.MetaDiariaUSD} onChange={v => set('MetaDiariaUSD', v)} />
              <CampoNum label="Meta semanal" value={metas.MetaSemanalUSD} onChange={v => set('MetaSemanalUSD', v)} hint="Últimos 7 días" />
              <CampoNum label="Meta mensual" value={metas.MetaMensualUSD} onChange={v => set('MetaMensualUSD', v)} hint="Mes actual" />
            </div>
            <button onClick={guardar} disabled={guardando}
              className="mt-4 flex items-center gap-2 bg-vida-blue text-white rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              <Save size={15} /> {guardando ? 'Guardando…' : 'Guardar metas'}
            </button>
          </div>

          {/* Progreso */}
          {prog && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <BarraMeta titulo="Hoy" p={prog.dia} />
              <BarraMeta titulo="Esta semana" p={prog.semana} />
              <BarraMeta titulo="Este mes" p={prog.mes} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── TAB: Calculadora de Rentabilidad ─────────────────────────────────────────
const PCT = (v) => (v == null ? '—' : `${Number(v).toFixed(1)}%`);

function CampoNum({ label, value, onChange, sufijo = '$', hint }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{sufijo}</span>
        <input type="number" step="0.01" value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm" placeholder="0" />
      </div>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function ModoCard({ titulo, color, m }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: `${color}33`, background: `${color}0d` }}>
      <p className="text-sm font-black mb-2" style={{ color }}>{titulo}</p>
      {m.nProductos === 0 ? (
        <p className="text-xs text-gray-400">Sin productos en este grupo</p>
      ) : (
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Margen bruto</span><span className="font-bold text-gray-800">{PCT(m.margenBrutoPct)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Margen neto*</span><span className="font-bold text-gray-800">{PCT(m.margenContribPct)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Ganancia/venta</span><span className="font-bold text-gray-800">{USD(m.contribProm)}</span></div>
          <div className="flex justify-between text-xs pt-1 border-t border-gray-100 mt-1"><span className="text-gray-400">{m.nProductos} productos</span><span className="text-gray-400">precio prom. {USD(m.precioProm)}</span></div>
        </div>
      )}
    </div>
  );
}

function TabRentabilidad({ filtros, puedeVerRed }) {
  const [idPV, setIdPV] = useState('');
  const [fin, setFin] = useState({
    CostosFijosMensualUSD: '', PctComisionDelivery: '', PctImpuestos: '',
    PctPasarela: '', InversionInicialUSD: '', MetaGananciaMensualUSD: '',
  });
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // Roles de red eligen tienda; el empresario usa la suya (el backend la fuerza).
  const params = () => (puedeVerRed && idPV ? { idPuntoVenta: idPV } : {});

  const cargar = useCallback(async () => {
    if (puedeVerRed && !idPV) { setDatos(null); return; }
    setCargando(true); setError('');
    try {
      const [f, r] = await Promise.all([
        api.get('/finanzas', { params: params() }),
        api.get('/finanzas/rentabilidad', { params: params() }),
      ]);
      setFin({
        CostosFijosMensualUSD:  f.data.CostosFijosMensualUSD ?? '',
        PctComisionDelivery:    f.data.PctComisionDelivery ?? '',
        PctImpuestos:           f.data.PctImpuestos ?? '',
        PctPasarela:            f.data.PctPasarela ?? '',
        InversionInicialUSD:    f.data.InversionInicialUSD ?? '',
        MetaGananciaMensualUSD: f.data.MetaGananciaMensualUSD ?? '',
      });
      setDatos(r.data);
    } catch (e) { setError(e.response?.data?.error || 'Error al cargar'); }
    finally { setCargando(false); }
  }, [idPV]); // eslint-disable-line

  useEffect(() => { cargar(); }, [cargar]);

  const set = (k, v) => setFin(p => ({ ...p, [k]: v }));

  async function guardarYcalcular() {
    setGuardando(true); setError('');
    try {
      await api.put('/finanzas', { ...fin, ...params() });
      const r = await api.get('/finanzas/rentabilidad', { params: params() });
      setDatos(r.data);
    } catch (e) { setError(e.response?.data?.error || 'Error al guardar'); }
    finally { setGuardando(false); }
  }

  const pe = datos?.puntoEquilibrio;
  const meta = datos?.meta;
  const roi = datos?.roi;

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Selector de tienda para roles de red */}
      {puedeVerRed && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
          <Store size={16} className="text-vida-blue" />
          <select value={idPV} onChange={e => setIdPV(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">— Elige una tienda —</option>
            {(filtros?.sucursales || []).map(s => (
              <option key={s.idPuntoVenta} value={s.idPuntoVenta}>{s.NombrePuntoVenta || s.NomComercial}</option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {puedeVerRed && !idPV ? (
        <div className="text-center py-16 text-gray-400">
          <Calculator size={40} className="mx-auto mb-3 opacity-30" />
          <p>Elige una tienda para ver su rentabilidad</p>
        </div>
      ) : (
        <>
          {/* Inputs del empresario */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-black text-gray-800 flex items-center gap-2 mb-1"><DollarSign size={18} className="text-vida-green" /> Tus números</h3>
            <p className="text-xs text-gray-400 mb-4">Cárgalos una vez. El sistema calcula todo. (En USD)</p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <CampoNum label="Costos fijos / mes" value={fin.CostosFijosMensualUSD} onChange={v => set('CostosFijosMensualUSD', v)} hint="Alquiler, sueldos, servicios" />
              <CampoNum label="Inversión inicial" value={fin.InversionInicialUSD} onChange={v => set('InversionInicialUSD', v)} hint="Para calcular el ROI" />
              <CampoNum label="Meta de ganancia / mes" value={fin.MetaGananciaMensualUSD} onChange={v => set('MetaGananciaMensualUSD', v)} hint="¿Cuánto quieres ganar?" />
              <CampoNum label="% Comisión delivery" sufijo="%" value={fin.PctComisionDelivery} onChange={v => set('PctComisionDelivery', v)} />
              <CampoNum label="% Impuestos" sufijo="%" value={fin.PctImpuestos} onChange={v => set('PctImpuestos', v)} />
              <CampoNum label="% Pasarela de pago" sufijo="%" value={fin.PctPasarela} onChange={v => set('PctPasarela', v)} />
            </div>
            <button onClick={guardarYcalcular} disabled={guardando}
              className="mt-4 flex items-center gap-2 bg-vida-blue text-white rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              <Save size={15} /> {guardando ? 'Calculando…' : 'Guardar y calcular'}
            </button>
          </div>

          {cargando && !datos ? (
            <p className="text-center text-gray-400 py-8 text-sm">Cargando…</p>
          ) : datos && (
            <>
              {/* Punto de equilibrio */}
              <div className="bg-vida-blue rounded-2xl p-5 text-white">
                <p className="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-2"><Target size={14} /> Punto de equilibrio</p>
                {pe?.ventasMes == null ? (
                  <p className="mt-2 text-sm opacity-90">Carga tus costos y ten productos con precio y costo para calcularlo.</p>
                ) : (
                  <>
                    <p className="mt-1 text-sm opacity-90">Para no perder, debes vender:</p>
                    <div className="grid grid-cols-3 gap-4 mt-2">
                      <div><p className="text-2xl font-black">{USD(pe.ventasMes)}</p><p className="text-xs opacity-70">al mes</p></div>
                      <div><p className="text-2xl font-black">{USD(pe.ventasDia)}</p><p className="text-xs opacity-70">al día</p></div>
                      <div><p className="text-2xl font-black">{pe.unidadesDia != null ? Math.ceil(pe.unidadesDia) : '—'}</p><p className="text-xs opacity-70">productos/día</p></div>
                    </div>
                  </>
                )}
              </div>

              {/* 3 modos */}
              <div>
                <p className="text-sm font-black text-gray-700 mb-2">Rentabilidad en 3 modos</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <ModoCard titulo="⭐ Solo Producto PLUS" color="#E0A400" m={datos.modos.soloPlus} />
                  <ModoCard titulo="Mixto (todo)" color="#0A1E3F" m={datos.modos.mixto} />
                  <ModoCard titulo="Solo Vida normal" color="#64748B" m={datos.modos.soloNormal} />
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">*Margen neto = después de descontar {PCT(datos.pctVariablesTotal)} de costos variables (delivery + impuestos + pasarela).</p>
              </div>

              {/* Meta diaria + ROI */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2"><Target size={14} className="text-vida-green" /> Meta diaria</p>
                  {meta?.metaDiaria == null ? (
                    <p className="mt-2 text-sm text-gray-500">Define tu meta de ganancia y tus costos para calcularla.</p>
                  ) : (
                    <>
                      <p className="mt-1 text-sm text-gray-600">Para ganar <b>{USD(fin.MetaGananciaMensualUSD)}</b> al mes, tu meta diaria es:</p>
                      <p className="text-3xl font-black text-vida-green mt-1">{USD(meta.metaDiaria)}</p>
                      <p className="text-sm text-gray-500 mt-1">Hoy llevas {USD(meta.ventasHoy)} · {meta.faltaHoy > 0 ? <span className="text-orange-500 font-bold">te faltan {USD(meta.faltaHoy)}</span> : <span className="text-vida-green font-bold">¡meta alcanzada! 🎉</span>}</p>
                    </>
                  )}
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2"><TrendingUp size={14} className="text-vida-blue" /> ROI (últimos 30 días)</p>
                  <p className="text-3xl font-black text-gray-900 mt-1">{roi?.roiPct == null ? '—' : PCT(roi.roiPct)}</p>
                  <div className="text-sm text-gray-500 mt-1 space-y-0.5">
                    <div className="flex justify-between"><span>Ventas 30 días</span><span className="font-semibold text-gray-700">{USD(roi?.ventas30)}</span></div>
                    <div className="flex justify-between"><span>Ganancia neta est.</span><span className={`font-semibold ${Number(roi?.gananciaNetaMes) >= 0 ? 'text-vida-green' : 'text-red-500'}`}>{USD(roi?.gananciaNetaMes)}</span></div>
                    <div className="flex justify-between"><span>Inversión inicial</span><span className="font-semibold text-gray-700">{USD(roi?.inversionInicial)}</span></div>
                  </div>
                  {roi?.roiPct == null && <p className="text-[11px] text-gray-400 mt-1">Carga tu inversión inicial para ver el ROI.</p>}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

const TABS = [
  { id: 'ventas',       label: 'Ventas',       icon: BarChart2    },
  { id: 'red',          label: 'Red',          icon: Building2, soloRed: true },
  { id: 'delivery',     label: 'Delivery',      icon: Truck        },
  { id: 'productos',    label: 'Productos',     icon: TrendingUp   },
  { id: 'inventario',   label: 'Inventario',    icon: Package      },
  { id: 'movimientos',  label: 'Movimientos',   icon: ArrowUpDown  },
  { id: 'metas',        label: 'Metas',         icon: Target       },
  { id: 'rentabilidad', label: 'Rentabilidad',  icon: Calculator   },
];

export default function Reportes() {
  const { usuario } = useAuthStore();
  const puedeVerRed = ROLES_RED.includes(usuario?.TipoUsuario);
  const [tab, setTab]       = useState('ventas');
  const [filtros, setFiltros] = useState({ sucursales: [], paises: [], estados: [] });

  // El tab "Red" solo para roles administrativos
  const tabsVisibles = TABS.filter(t => !t.soloRed || puedeVerRed);

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
          {tabsVisibles.map(t => {
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
        {tab === 'red'         && puedeVerRed && <TabRed filtros={filtros} />}
        {tab === 'delivery'    && <TabDelivery    filtros={filtros} />}
        {tab === 'productos'   && <TabProductos   filtros={filtros} />}
        {tab === 'inventario'  && <TabInventario  filtros={filtros} />}
        {tab === 'movimientos' && <TabMovimientos filtros={filtros} />}
        {tab === 'metas' && <TabMetas filtros={filtros} puedeVerRed={puedeVerRed} />}
        {tab === 'rentabilidad' && <TabRentabilidad filtros={filtros} puedeVerRed={puedeVerRed} />}
      </div>
    </div>
  );
}
