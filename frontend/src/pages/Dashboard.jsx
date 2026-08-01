// src/pages/Dashboard.jsx
import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import api from '../services/api.js';
import {
  DollarSign, ShoppingCart, Store, Package,
  TrendingUp, TrendingDown, AlertTriangle,
  Clock, Banknote, CreditCard, Activity,
  RefreshCw, ArrowRight, BarChart2, Wifi, WifiOff,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const USD  = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const FMT  = (v) => Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 });
const HORA = (f) => f ? new Date(f).toLocaleTimeString('es-VE', { hour:'2-digit', minute:'2-digit' }) : '';
const DIA  = (f) => f ? new Date(f).toLocaleDateString('es-VE', { weekday:'short', day:'2-digit', month:'short' }) : '';

const METODO_COLOR = { EFECTIVO:'text-amber-600', TARJETA:'text-blue-600', MIXTO:'text-purple-600' };
const METODO_BG    = { EFECTIVO:'bg-amber-50', TARJETA:'bg-blue-50', MIXTO:'bg-purple-50' };

// ─── Componentes ─────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-vida-blue/30 border-t-vida-blue rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-400 font-semibold text-sm">Cargando dashboard…</p>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, valor, sub, variacion, color, onClick }) {
  const positivo = variacion >= 0;
  return (
    <div onClick={onClick}
      className={`bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex items-center gap-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}18` }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide truncate">{label}</p>
        <p className="text-xl font-black text-gray-900 leading-tight truncate">{valor}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
        {variacion !== undefined && (
          <div className="flex items-center gap-1 mt-0.5">
            {positivo
              ? <TrendingUp size={11} className="text-green-500" />
              : <TrendingDown size={11} className="text-red-400" />}
            <span className={`text-xs font-bold ${positivo ? 'text-green-500' : 'text-red-400'}`}>
              {positivo ? '+' : ''}{variacion}% vs ayer
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function SeccionTitulo({ icon: Icon, titulo, linkLabel, linkTo }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-black text-gray-800 text-sm flex items-center gap-2">
        <Icon size={15} className="text-vida-blue" />
        {titulo}
      </h3>
      {linkLabel && (
        <button onClick={() => navigate(linkTo)}
          className="text-xs text-vida-blue font-bold hover:underline flex items-center gap-1">
          {linkLabel} <ArrowRight size={11} />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VISTA ADMIN (SUPER_ADMIN, ADMIN_PAIS, ADMIN)
// ─────────────────────────────────────────────────────────────────────────────
function DotConexion({ online }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full
      ${online ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
      {online ? 'Online' : 'Offline'}
    </span>
  );
}

function PanelConexion({ sucursales }) {
  const online  = sucursales.filter(s => s.StatusConexion === 'ONLINE');
  const offline = sucursales.filter(s => s.StatusConexion !== 'ONLINE');

  const hace = (fecha) => {
    if (!fecha) return 'Nunca';
    const mins = Math.floor((Date.now() - new Date(fecha)) / 60000);
    if (mins < 1)  return 'Ahora mismo';
    if (mins < 60) return `Hace ${mins} min`;
    return `Hace ${Math.floor(mins/60)}h`;
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-black text-gray-800 text-sm flex items-center gap-2">
          <Wifi size={15} className="text-vida-blue" />
          Estado de conexión
        </h3>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-xs font-semibold text-green-700">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            {online.length} online
          </span>
          <span className="flex items-center gap-1 text-xs font-semibold text-gray-400">
            <span className="w-2 h-2 rounded-full bg-gray-300" />
            {offline.length} offline
          </span>
        </div>
      </div>
      <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
        {sucursales.map(s => (
          <div key={s.idPuntoVenta}
            className={`flex items-center gap-3 px-5 py-3 ${s.StatusConexion === 'ONLINE' ? '' : 'opacity-60'}`}>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0
              ${s.StatusConexion === 'ONLINE' ? 'bg-green-100' : 'bg-gray-100'}`}>
              {s.StatusConexion === 'ONLINE'
                ? <Wifi size={14} className="text-green-600" />
                : <WifiOff size={14} className="text-gray-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{s.Nombre}</p>
              <p className="text-xs text-gray-400">{s.Ciudad || s.Estado || '—'} · {hace(s.UltimoHeartbeat)}</p>
            </div>
            <DotConexion online={s.StatusConexion === 'ONLINE'} />
          </div>
        ))}
        {sucursales.length === 0 && (
          <p className="text-center text-gray-300 py-6 text-sm">Sin sucursales registradas</p>
        )}
      </div>
    </div>
  );
}

function DashboardAdmin({ stats, conexiones, setConexiones }) {
  const navigate = useNavigate();
  const { ventas, graficaDiaria, topProductos, topSucursales, stockBajo, pedidosActivos, recientes, globales } = stats;
  const sucursalesConexion = conexiones || stats.sucursalesConexion || [];

  const grafData = (graficaDiaria || []).map(r => ({
    fecha: new Date(r.Fecha).toLocaleDateString('es-VE', { weekday:'short', day:'2-digit' }),
    ventas: Number(r.TotalUSD || 0),
    num:    r.NumVentas,
  }));

  const maxSuc = topSucursales?.[0]?.TotalUSD || 1;

  return (
    <div className="space-y-5">

      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={DollarSign}   label="Ventas hoy"        valor={USD(ventas.hoy)}      variacion={ventas.variacion} color="#5BBE6A"
          sub={`${ventas.numHoy} transacciones`} onClick={() => navigate('/ventas')} />
        <KpiCard icon={Banknote}     label="Efectivo hoy"      valor={USD(ventas.efectivoHoy)} color="#F39C12"
          sub="Cobrado en efectivo" />
        <KpiCard icon={CreditCard}   label="Tarjeta hoy"       valor={USD(ventas.tarjetaHoy)}  color="#2CA6C4"
          sub="Cobrado con tarjeta" />
        <KpiCard icon={ShoppingCart} label="Pedidos activos"   valor={pedidosActivos?.Total || 0} color="#8E44AD"
          sub={`${pedidosActivos?.Nuevos || 0} nuevos · ${pedidosActivos?.EnCamino || 0} en camino`}
          onClick={() => navigate('/pedidos')} />
      </div>

      {/* KPIs secundarios */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard icon={Wifi}   label="Sucursales online"
          valor={`${globales?.SucursalesOnline || 0} / ${globales?.TotalSucursales || 0}`}
          color="#54C4E0"
          sub={globales?.SucursalesOnline === globales?.TotalSucursales ? 'Todas conectadas' : `${(globales?.TotalSucursales||0)-(globales?.SucursalesOnline||0)} sin conexión`}
          onClick={() => navigate('/sucursales')} />
        <KpiCard icon={Package} label="Productos"   valor={globales?.TotalProductos  || '—'} color="#E67E22"
          sub="En inventario" onClick={() => navigate('/inventarios')} />
        <KpiCard icon={AlertTriangle} label="Bajo stock" valor={stockBajo?.total || 0} color="#E74C3C"
          sub="Productos por reponer" onClick={() => navigate('/reportes')} />
      </div>

      {/* Gráfica + Top sucursales */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Gráfica 7 días */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <SeccionTitulo icon={TrendingUp} titulo="Ventas últimos 7 días (USD)" linkLabel="Reporte completo" linkTo="/reportes" />
          {grafData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-300 text-sm">Sin ventas en el período</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={grafData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                <Tooltip formatter={(v, n) => [n === 'ventas' ? USD(v) : v, n === 'ventas' ? 'Total USD' : 'N° ventas']} />
                <Legend formatter={v => v === 'ventas' ? 'Total USD' : 'N° ventas'} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="ventas" fill="#0A1E3F" radius={[4,4,0,0]} name="ventas" />
                <Bar dataKey="num"    fill="#5BBE6A" radius={[4,4,0,0]} name="num" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top sucursales */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <SeccionTitulo icon={Store} titulo="Top sucursales hoy" linkLabel="Ver reportes" linkTo="/reportes" />
          {topSucursales?.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-300 text-sm">Sin ventas hoy</div>
          ) : (
            <div className="space-y-3 mt-1">
              {topSucursales.map((s, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold text-gray-700 truncate max-w-[140px]">{s.Nombre}</span>
                    <span className="font-bold text-gray-900">{USD(s.TotalUSD)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${Math.max(4,(s.TotalUSD/maxSuc)*100)}%`, background:'linear-gradient(90deg,#54C4E0, #5BBE6A)' }} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{s.NumVentas} ventas · {s.Ciudad || s.Estado}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Panel de conexión de sucursales */}
      {sucursalesConexion.length > 0 && (
        <PanelConexion sucursales={sucursalesConexion} />
      )}

      {/* Top productos + Bajo stock + Actividad */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Top 5 productos hoy */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <SeccionTitulo icon={Package} titulo="Top productos hoy" linkLabel="Ver ranking" linkTo="/reportes" />
          {topProductos?.length === 0 ? (
            <p className="text-gray-300 text-sm text-center py-6">Sin ventas hoy</p>
          ) : (
            <div className="space-y-2">
              {topProductos.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0
                    ${i===0?'bg-amber-100 text-amber-700':i===1?'bg-gray-100 text-gray-500':i===2?'bg-orange-100 text-orange-600':'bg-gray-50 text-gray-400'}`}>
                    {i+1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{p.NombreProducto}</p>
                    <p className="text-[10px] text-gray-400">{FMT(p.TotalCantidad)} uds.</p>
                  </div>
                  <span className="text-xs font-bold text-gray-900 shrink-0">{USD(p.TotalUSD)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bajo stock */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <SeccionTitulo icon={AlertTriangle} titulo={`Bajo stock (${stockBajo?.total || 0})`} linkLabel="Ver inventario" linkTo="/reportes" />
          {stockBajo?.detalle?.length === 0 ? (
            <p className="text-green-600 text-sm text-center py-6 font-semibold">✓ Todo el stock está bien</p>
          ) : (
            <div className="space-y-2">
              {stockBajo.detalle.map((s, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-xl bg-red-50 border border-red-100">
                  <AlertTriangle size={13} className="text-red-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-red-800 truncate">{s.Producto}</p>
                    <p className="text-[10px] text-red-400">{s.Sucursal} · Stock: {FMT(s.Stock)} / Mín: {FMT(s.StockMinimo)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actividad reciente */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <SeccionTitulo icon={Activity} titulo="Últimas ventas" linkLabel="Ver todas" linkTo="/ventas" />
          {recientes?.length === 0 ? (
            <p className="text-gray-300 text-sm text-center py-6">Sin ventas registradas</p>
          ) : (
            <div className="space-y-2">
              {recientes.map((r, i) => (
                <div key={i} className={`flex items-center gap-2.5 p-2 rounded-xl ${METODO_BG[r.MetodoPago] || 'bg-gray-50'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900">{USD(r.TotalUSD)}</p>
                    <p className="text-[10px] text-gray-400 truncate">{r.Sucursal} · {HORA(r.FechaAlta)}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${METODO_COLOR[r.MetodoPago] || 'text-gray-500'}`}>
                    {r.MetodoPago}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VISTA CAJERO (SUPERVISOR, CAJERO, CASHIER)
// ─────────────────────────────────────────────────────────────────────────────
function DashboardCajero({ stats }) {
  const navigate = useNavigate();
  const { ventas, graficaDiaria, topProductos, stockBajo, pedidosActivos, recientes } = stats;

  const grafData = (graficaDiaria || []).map(r => ({
    fecha: new Date(r.Fecha).toLocaleDateString('es-VE', { weekday:'short', day:'2-digit' }),
    ventas: Number(r.TotalUSD || 0),
    num:    r.NumVentas,
  }));

  return (
    <div className="space-y-5">

      {/* KPIs del turno */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={DollarSign}   label="Total hoy"       valor={USD(ventas.hoy)}         variacion={ventas.variacion} color="#5BBE6A"
          sub={`${ventas.numHoy} transacciones`} />
        <KpiCard icon={Banknote}     label="Efectivo"        valor={USD(ventas.efectivoHoy)}  color="#F39C12"  sub="Cobrado en efectivo" />
        <KpiCard icon={CreditCard}   label="Tarjeta"         valor={USD(ventas.tarjetaHoy)}   color="#2CA6C4"  sub="Cobrado con tarjeta" />
        <KpiCard icon={ShoppingCart} label="Pedidos activos" valor={pedidosActivos?.Total || 0} color="#8E44AD"
          sub={`${pedidosActivos?.Nuevos || 0} nuevos`} onClick={() => navigate('/pedidos')} />
      </div>

      {/* Gráfica de la semana + Actividad */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <SeccionTitulo icon={TrendingUp} titulo="Mis ventas — últimos 7 días" />
          {grafData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-300 text-sm">Sin ventas en el período</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={grafData} margin={{ top:5, right:10, bottom:0, left:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                <XAxis dataKey="fecha" tick={{ fontSize:11 }} />
                <YAxis tick={{ fontSize:11 }} tickFormatter={v => `$${v}`} />
                <Tooltip formatter={(v,n) => [n==='ventas' ? USD(v) : v, n==='ventas' ? 'Total' : 'Ventas']} />
                <Bar dataKey="ventas" fill="#0A1E3F" radius={[4,4,0,0]} name="ventas" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Últimas ventas */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <SeccionTitulo icon={Activity} titulo="Últimas ventas" linkLabel="Ver historial" linkTo="/ventas" />
          {recientes?.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-300 text-sm">Sin ventas hoy</div>
          ) : (
            <div className="space-y-2 overflow-y-auto max-h-52">
              {recientes.map((r, i) => (
                <div key={i} className={`flex items-center gap-3 p-2.5 rounded-xl ${METODO_BG[r.MetodoPago] || 'bg-gray-50'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900">{USD(r.TotalUSD)}</p>
                    <p className="text-[10px] text-gray-400">{DIA(r.FechaAlta)} {HORA(r.FechaAlta)}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-lg shrink-0 ${METODO_COLOR[r.MetodoPago] || 'text-gray-500'}`}>
                    {r.MetodoPago}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top productos + Bajo stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <SeccionTitulo icon={Package} titulo="Productos más vendidos hoy" />
          {topProductos?.length === 0 ? (
            <p className="text-gray-300 text-sm text-center py-6">Sin ventas hoy</p>
          ) : (
            <div className="space-y-2.5">
              {topProductos.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0
                    ${i===0?'bg-amber-100 text-amber-700':i===1?'bg-gray-100 text-gray-600':'bg-gray-50 text-gray-400'}`}>
                    {i+1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{p.NombreProducto}</p>
                    <p className="text-xs text-gray-400">{FMT(p.TotalCantidad)} uds.</p>
                  </div>
                  <span className="text-sm font-bold text-gray-900">{USD(p.TotalUSD)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <SeccionTitulo icon={AlertTriangle} titulo={`Alertas de stock (${stockBajo?.total || 0})`} linkLabel="Ver inventario" linkTo="/inventarios" />
          {stockBajo?.detalle?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <Package size={20} className="text-green-600" />
              </div>
              <p className="text-green-700 font-bold text-sm">Stock en orden</p>
              <p className="text-gray-400 text-xs">Todos los productos tienen stock suficiente</p>
            </div>
          ) : (
            <div className="space-y-2">
              {stockBajo.detalle.map((s, i) => (
                <div key={i} className="p-3 rounded-xl bg-red-50 border border-red-100">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} className="text-red-500 shrink-0" />
                    <p className="text-sm font-semibold text-red-800 flex-1 truncate">{s.Producto}</p>
                    <span className="text-xs font-bold text-red-600 shrink-0">{FMT(s.Stock)} uds.</span>
                  </div>
                  <p className="text-xs text-red-400 mt-0.5 ml-5">Mínimo requerido: {FMT(s.StockMinimo)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PÁGINA PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { usuario } = useAuthStore();
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const esAdmin  = ['SUPER_ADMIN','ADMIN_PAIS','ADMIN'].includes(usuario?.TipoUsuario);

  // Estado de conexión de sucursales (actualizado en tiempo real vía WS)
  const [conexiones, setConexiones] = useState([]);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const r = await api.get('/dashboard/stats');
      setStats(r.data);
      if (r.data.sucursalesConexion) setConexiones(r.data.sucursalesConexion);
      setLastUpdate(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Actualizar dot de conexión en tiempo real sin recargar todo
  const handleWs = useCallback((msg) => {
    if (msg.tipo === 'sucursal:online' || msg.tipo === 'sucursal:offline') {
      const nuevoStatus = msg.tipo === 'sucursal:online' ? 'ONLINE' : 'OFFLINE';
      setConexiones(prev => prev.map(s =>
        s.idPuntoVenta === msg.idPuntoVenta
          ? { ...s, StatusConexion: nuevoStatus, UltimoHeartbeat: new Date().toISOString() }
          : s
      ));
    }
  }, []);

  useWebSocket(handleWs, esAdmin);

  useEffect(() => {
    cargar();
    // Auto-refresh cada 2 minutos
    const t = setInterval(() => cargar(true), 120_000);
    return () => clearInterval(t);
  }, [cargar]);

  const hoy = new Date().toLocaleDateString('es-VE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <BarChart2 size={20} className="text-vida-blue" />
            Dashboard
          </h1>
          <p className="text-xs text-gray-400 mt-0.5 capitalize">{hoy} · Bienvenido, <span className="text-vida-green font-bold">{usuario?.Nombre}</span></p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Clock size={11} />
              Actualizado {lastUpdate.toLocaleTimeString('es-VE', { hour:'2-digit', minute:'2-digit' })}
            </span>
          )}
          <button onClick={() => cargar(true)} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-vida-blue/10 hover:bg-vida-blue/20 text-vida-blue text-sm font-semibold rounded-xl transition-all">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      <div className="p-6">
        {loading
          ? <Spinner />
          : stats && (esAdmin
              ? <DashboardAdmin stats={stats} conexiones={conexiones} setConexiones={setConexiones} />
              : <DashboardCajero stats={stats} />)
        }
      </div>
    </div>
  );
}
