// src/pages/Dashboard.jsx
import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore.js';
import api from '../services/api.js';
import {
  DollarSign, ShoppingCart, Store, Package, Truck,
  TrendingUp, TrendingDown, Bell, Download, AlertTriangle,
  Clock, MapPin, Users, Activity
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

// Datos demo para gráficas (se reemplazarán con datos reales al agregar módulo de ventas)
const ventasDiarias = [
  { dia:'01 May', ventas:12400, pedidos:42 },
  { dia:'05 May', ventas:15800, pedidos:61 },
  { dia:'10 May', ventas:11200, pedidos:38 },
  { dia:'15 May', ventas:18600, pedidos:72 },
  { dia:'20 May', ventas:16900, pedidos:65 },
  { dia:'23 May', ventas:20100, pedidos:89 },
];

const ventasCat = [
  { name:'Alimentos', value:45, color:'#27AE60', monto:'$39,445.44' },
  { name:'Bebidas',   value:25, color:'#2980B9', monto:'$21,913.58' },
  { name:'Lácteos',   value:15, color:'#8E44AD', monto:'$13,148.15' },
  { name:'Limpieza',  value:10, color:'#E67E22', monto:'$8,587.15'  },
  { name:'Otros',     value:5,  color:'#95A5A6', monto:'$4,560.00'  },
];

const estadoPedidos = [
  { name:'Entregados', value:932,  pct:'74.7%', color:'#27AE60' },
  { name:'En camino',  value:184,  pct:'14.7%', color:'#2980B9' },
  { name:'Pendientes', value:82,   pct:'6.6%',  color:'#F39C12' },
  { name:'Cancelados', value:50,   pct:'4.0%',  color:'#E74C3C' },
];

const accesosRapidos = [
  { icon: Package,      label: 'Nuevo Producto',  color: '#8E44AD' },
  { icon: ShoppingCart, label: 'Nuevo Pedido',     color: '#2980B9' },
  { icon: Store,        label: 'Nueva Sucursal',   color: '#27AE60' },
  { icon: TrendingUp,   label: 'Solicitar Stock',  color: '#E67E22' },
  { icon: Users,        label: 'Registrar Prov.',  color: '#1ABC9C' },
  { icon: Activity,     label: 'Reporte Ventas',   color: '#E74C3C' },
  { icon: Users,        label: 'Usuarios',         color: '#34495E' },
];

function KpiCard({ icon: Icon, title, valor, variacion, positivo, color, sub }) {
  return (
    <div className="kpi-card">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}15` }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 font-semibold truncate">{title}</p>
        <p className="text-xl font-black text-gray-800 leading-tight">{valor}</p>
        <div className="flex items-center gap-1 mt-0.5">
          {positivo
            ? <TrendingUp size={12} className="text-green-500" />
            : <TrendingDown size={12} className="text-red-400" />}
          <span className={`text-xs font-bold ${positivo ? 'text-green-500' : 'text-red-400'}`}>
            {variacion}
          </span>
          {sub && <span className="text-xs text-gray-400 truncate">{sub}</span>}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { usuario } = useAuthStore();
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const hoy = new Date().toLocaleDateString('es-VE', { day:'2-digit', month:'short', year:'numeric' });

  useEffect(() => {
    api.get('/dashboard/stats')
      .then(r => setStats(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <svg className="animate-spin h-10 w-10 text-vida-green mx-auto mb-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <p className="text-gray-400 font-semibold">Cargando dashboard...</p>
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="p-6 max-w-[1400px]">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-gray-800">Dashboard — MATRIZ</h1>
            <p className="text-gray-400 text-sm font-semibold">Bienvenido, <span className="text-vida-green">{usuario?.Nombre}</span></p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-2 flex items-center gap-2 text-sm text-gray-500 font-semibold">
              <Clock size={15} />
              01 May 2026 – {hoy}
            </div>
            <button className="relative bg-white border border-gray-200 rounded-xl p-2.5 hover:bg-gray-50">
              <Bell size={18} className="text-gray-500" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center">8</span>
            </button>
            <button className="btn-primary text-sm py-2">
              <Download size={15} />
              Exportar
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <KpiCard icon={DollarSign}  title="Ventas Totales"     valor="$87,654.32" variacion="18.6%" positivo sub="período anterior" color="#27AE60" />
          <KpiCard icon={ShoppingCart}title="Pedidos Totales"    valor="1,248"      variacion="24.3%" positivo sub="período anterior" color="#2980B9" />
          <KpiCard icon={Store}       title="Puntos de Venta"    valor={`${stats?.kpis?.puntosDeVenta?.activos ?? 0}`}   variacion="" positivo={true} sub={`Activos de ${stats?.kpis?.puntosDeVenta?.total ?? 0} registrados`} color="#8E44AD" />
          <KpiCard icon={Package}     title="Productos"          valor={`${stats?.kpis?.usuarios?.total ?? 0}`}  variacion="" positivo={true} sub="Activos en inventario" color="#E67E22" />
          <KpiCard icon={Truck}       title="Entregas Realizadas" valor="932"       variacion="21.4%" positivo sub="vs período anterior" color="#1ABC9C" />
        </div>

        {/* Fila principal de gráficas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

          {/* Ventas por día */}
          <div className="lg:col-span-2 card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-gray-700">Ventas y Pedidos por día</h3>
              <select className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-500 font-semibold">
                <option>Últimos 23 días</option>
                <option>Últimos 7 días</option>
                <option>Este mes</option>
              </select>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={ventasDiarias}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="dia" tick={{ fontSize:11, fill:'#9CA3AF' }} />
                <YAxis yAxisId="ventas" tick={{ fontSize:11, fill:'#9CA3AF' }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <YAxis yAxisId="pedidos" orientation="right" tick={{ fontSize:11, fill:'#9CA3AF' }} />
                <Tooltip formatter={(v,n) => n==='ventas' ? [`$${v.toLocaleString()}`,n] : [v,n]} />
                <Legend wrapperStyle={{ fontSize:12 }} />
                <Line yAxisId="ventas"  type="monotone" dataKey="ventas"  stroke="#27AE60" strokeWidth={2.5} dot={{ r:4 }} name="Ventas ($)" />
                <Line yAxisId="pedidos" type="monotone" dataKey="pedidos" stroke="#2980B9" strokeWidth={2}   dot={{ r:3 }} name="Pedidos (#)" strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Ventas por categoría */}
          <div className="card">
            <h3 className="font-black text-gray-700 mb-4">Ventas por Categoría</h3>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={ventasCat} cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                  dataKey="value" paddingAngle={3}>
                  {ventasCat.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={v => `${v}%`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">
              {ventasCat.map(c => (
                <div key={c.name} className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                  <span className="flex-1 text-gray-600 font-semibold">{c.name}</span>
                  <span className="text-gray-400">{c.value}%</span>
                  <span className="text-gray-700 font-bold">{c.monto}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Fila secundaria */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

          {/* Ventas por Punto de Venta */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-gray-700 text-sm">Ventas por Punto de Venta</h3>
              <a href="#" className="text-xs text-vida-green font-bold hover:underline">Ver reporte</a>
            </div>
            {(stats?.sucursales || []).length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Sin datos de sucursales</p>
            ) : (
              <div className="space-y-3">
                {(stats?.sucursales || []).slice(0,5).map((s, i) => {
                  const montos = [18564, 14235, 12856, 10235, 8125];
                  const m = montos[i] || 5000;
                  const max = 20000;
                  return (
                    <div key={s.idPuntoVenta}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 font-semibold truncate max-w-[160px]">{s.NomComercial || s.Nombre}</span>
                        <span className="font-bold text-gray-800">${m.toLocaleString()}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{
                          width: `${(m/max)*100}%`,
                          background: 'linear-gradient(90deg, #27AE60, #1ABC9C)'
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Estado de Pedidos */}
          <div className="card">
            <h3 className="font-black text-gray-700 text-sm mb-4">Estado de Pedidos</h3>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={estadoPedidos} cx="50%" cy="50%" innerRadius={50} outerRadius={70}
                  dataKey="value" paddingAngle={3}>
                  {estadoPedidos.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              {estadoPedidos.map(e => (
                <div key={e.name} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: e.color }} />
                  <span className="text-gray-500">{e.name}</span>
                  <span className="font-bold ml-auto">{e.pct}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Alertas */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-gray-700 text-sm">Alertas y Notificaciones</h3>
              <a href="#" className="text-xs text-vida-green font-bold hover:underline">Ver todas</a>
            </div>
            <div className="space-y-3">
              {[
                { icon: AlertTriangle, color:'#F39C12', bg:'#FEF9E7', title:'Stock bajo', desc:`${stats?.sucursales?.length || 0} sucursales con productos bajos`, time:'Hace 10 min' },
                { icon: ShoppingCart,  color:'#2980B9', bg:'#EBF5FB', title:'Pedido pendiente', desc:'23 pedidos en espera de aprobación', time:'Hace 25 min' },
                { icon: Truck,         color:'#E74C3C', bg:'#FDEDEC', title:'Entregas retrasadas', desc:'5 entregas con retraso', time:'Hace 1 hora' },
                { icon: Store,         color:'#8E44AD', bg:'#F4ECF7', title:'Punto de venta inactivo', desc:'1 sucursal sin conexión', time:'Hace 2 horas' },
              ].map(a => (
                <div key={a.title} className="flex gap-3 items-start">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: a.bg }}>
                    <a.icon size={15} style={{ color: a.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-700">{a.title}</p>
                    <p className="text-xs text-gray-400 truncate">{a.desc}</p>
                  </div>
                  <span className="text-[10px] text-gray-300 shrink-0 whitespace-nowrap">{a.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Fila inferior */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

          {/* Accesos rápidos */}
          <div className="card">
            <h3 className="font-black text-gray-700 text-sm mb-4">Accesos Rápidos</h3>
            <div className="grid grid-cols-4 gap-3">
              {accesosRapidos.map(({ icon: Icon, label, color }) => (
                <button key={label}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-50 transition-all group">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"
                    style={{ background: `${color}20` }}>
                    <Icon size={20} style={{ color }} />
                  </div>
                  <span className="text-[11px] text-gray-500 font-semibold text-center leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Actividad reciente */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-gray-700 text-sm">Actividad Reciente</h3>
              <a href="#" className="text-xs text-vida-green font-bold hover:underline">Ver todas</a>
            </div>
            <div className="space-y-3">
              {[
                { color:'#27AE60', text:'Administrador aprobó el pedido #PED-000123',        time:'Hace 5 min'   },
                { color:'#2980B9', text:'Punto de Venta 2 actualizó inventario de 15 productos', time:'Hace 15 min' },
                { color:'#8E44AD', text:'Nuevo usuario registrado: maria.gomez@vida.com',     time:'Hace 30 min'  },
                { color:'#27AE60', text:'Se generó reporte de ventas del 23/05/2026',         time:'Hace 1 hora'  },
                { color:'#F39C12', text:'Stock bajo detectado en 15 productos',                time:'Hace 2 horas' },
              ].map((a, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: a.color }} />
                  <p className="text-xs text-gray-600 flex-1 font-semibold">{a.text}</p>
                  <span className="text-[10px] text-gray-300 shrink-0 whitespace-nowrap">{a.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabla sucursales */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-gray-700 text-sm flex items-center gap-2">
              <MapPin size={16} className="text-vida-green" />
              Puntos de Venta Registrados
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  {['#','Nombre','Ciudad','Estado','Encargado','Tipo','Status'].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-gray-400 font-bold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(stats?.sucursales || []).map(s => (
                  <tr key={s.idPuntoVenta} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-3 text-gray-400 font-semibold">{s.idPuntoVenta}</td>
                    <td className="py-3 px-3 font-bold text-gray-700">{s.NomComercial || s.Nombre}</td>
                    <td className="py-3 px-3 text-gray-500">{s.Ciudad || '—'}</td>
                    <td className="py-3 px-3 text-gray-500">{s.Estado || '—'}</td>
                    <td className="py-3 px-3 text-gray-500">{s.Encargado || '—'}</td>
                    <td className="py-3 px-3 text-gray-500">{s.TipoPuntoVenta || '—'}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                        s.StatusPuntoVenta === 'ACTIVO'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-600'
                      }`}>
                        {s.StatusPuntoVenta}
                      </span>
                    </td>
                  </tr>
                ))}
                {(!stats?.sucursales || stats.sucursales.length === 0) && (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-300 font-semibold">Sin sucursales registradas</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
