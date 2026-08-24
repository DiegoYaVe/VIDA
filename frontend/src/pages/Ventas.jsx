// src/pages/Ventas.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api.js';
import {
  Receipt, DollarSign, CreditCard, Layers, Printer,
  Search, ChevronDown, TrendingUp, X,
} from 'lucide-react';

const LABEL_METODO = {
  EFECTIVO: 'Efectivo',
  TARJETA:  'Tarjeta',
  MIXTO:    'Mixto',
};

const COLOR_METODO = {
  EFECTIVO: 'bg-green-100 text-green-700',
  TARJETA:  'bg-blue-100 text-blue-700',
  MIXTO:    'bg-purple-100 text-purple-700',
};

// ── Ticket invisible para impresión ─────────────────────────────────────────
function TicketPrint({ venta }) {
  if (!venta) return null;
  return (
    <div className="hidden print:block fixed inset-0 bg-white p-8 font-mono text-sm z-[200]">
      <p className="text-center font-bold text-xl mb-1">VenezPOS</p>
      {venta.NombreSucursal && (
        <p className="text-center text-gray-500 text-xs">{venta.NombreSucursal}</p>
      )}
      <p className="text-center text-gray-500 text-xs">Pedido #{venta.idPedido}</p>
      <p className="text-center text-gray-500 text-xs mb-4">
        {new Date(venta.FechaAlta).toLocaleString('es')}
      </p>

      <div className="border-t border-dashed border-gray-400 my-2"/>
      {venta.items.map((item, i) => (
        <div key={i} className="flex justify-between mb-1 gap-2">
          <span className="flex-1 truncate">{item.NombreProducto}</span>
          <span className="shrink-0 tabular-nums">
            {item.Cantidad}×${parseFloat(item.PrecioUnitario).toFixed(2)}
          </span>
        </div>
      ))}

      <div className="border-t border-dashed border-gray-400 my-2"/>
      <div className="flex justify-between font-bold text-base">
        <span>TOTAL</span>
        <span>${parseFloat(venta.TotalUSD).toFixed(2)}</span>
      </div>

      <div className="border-t border-dashed border-gray-400 my-2"/>
      {venta.MontoEfectivo > 0 && (
        <div className="flex justify-between text-xs">
          <span>Efectivo recibido</span>
          <span>${parseFloat(venta.MontoEfectivo).toFixed(2)}</span>
        </div>
      )}
      {venta.MontoTarjeta > 0 && (
        <div className="flex justify-between text-xs">
          <span>Tarjeta</span>
          <span>${parseFloat(venta.MontoTarjeta).toFixed(2)}</span>
        </div>
      )}
      {venta.MontoCambio > 0 && (
        <div className="flex justify-between text-xs font-bold">
          <span>Cambio devuelto</span>
          <span>${parseFloat(venta.MontoCambio).toFixed(2)}</span>
        </div>
      )}
      <p className="text-center text-gray-400 text-xs mt-6">*** COPIA ***</p>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function Ventas() {
  const hoy = new Date().toISOString().slice(0, 10);

  const [ventas,      setVentas]      = useState([]);
  const [resumen,     setResumen]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [fecha,       setFecha]       = useState(hoy);
  const [sucursales,  setSucursales]  = useState([]);
  const [idPuntoVenta,setIdPuntoVenta]= useState('');
  const [busqueda,    setBusqueda]    = useState('');
  const [ventaImpr,   setVentaImpr]   = useState(null); // para reimprimir

  // Cargar sucursales al montar
  useEffect(() => {
    api.get('/sucursales/puntos-venta').then(r => setSucursales(r.data)).catch(() => {});
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = { fecha };
      if (idPuntoVenta) params.idPuntoVenta = idPuntoVenta;
      const r = await api.get('/pedidos/pos/ventas', { params });
      setVentas(r.data.ventas);
      setResumen(r.data.resumen);
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }, [fecha, idPuntoVenta]);

  useEffect(() => { cargar(); }, [cargar]);

  function reimprimir(venta) {
    setVentaImpr(venta);
    setTimeout(() => window.print(), 200);
  }

  // Filtro de búsqueda local (por # pedido o producto)
  const ventasFiltradas = busqueda.trim()
    ? ventas.filter(v =>
        String(v.idPedido).includes(busqueda) ||
        v.items.some(i => i.NombreProducto.toLowerCase().includes(busqueda.toLowerCase()))
      )
    : ventas;

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* Ticket invisible para impresión */}
      <TicketPrint venta={ventaImpr} />

      {/* ── Encabezado ── */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-gray-900">Historial de Ventas</h1>
        <p className="text-gray-500 text-sm mt-1">Ventas en tienda · reimpresión de tickets</p>
      </div>

      {/* ── Filtros ── */}
      <div className="flex flex-wrap gap-3 mb-5">
        {/* Fecha */}
        <input
          type="date"
          value={fecha}
          onChange={e => setFecha(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vida-blue"
        />

        {/* Sucursal */}
        {sucursales.length > 1 && (
          <div className="relative">
            <select
              value={idPuntoVenta}
              onChange={e => setIdPuntoVenta(e.target.value)}
              className="appearance-none border border-gray-200 rounded-xl pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vida-blue bg-white">
              <option value="">Todas las sucursales</option>
              {sucursales.map(s => (
                <option key={s.idPuntoVenta} value={s.idPuntoVenta}>
                  {s.NomComercial || s.Nombre}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
          </div>
        )}

        {/* Buscar */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por # pedido o producto..."
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-vida-blue"
          />
          {busqueda && (
            <button onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={13}/>
            </button>
          )}
        </div>
      </div>

      {/* ── Tarjetas de resumen ── */}
      {resumen && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Ventas',    value: resumen.totalVentas,              fmt: v => v,           color: 'text-gray-800',   icon: Receipt    },
            { label: 'Total',     value: resumen.totalDia,                 fmt: v => `$${v.toFixed(2)}`, color: 'text-vida-blue',  icon: TrendingUp },
            { label: 'Efectivo',  value: resumen.totalEfectivo,            fmt: v => `$${v.toFixed(2)}`, color: 'text-green-600',  icon: DollarSign },
            { label: 'Tarjeta',   value: resumen.totalTarjeta,             fmt: v => `$${v.toFixed(2)}`, color: 'text-blue-600',   icon: CreditCard },
          ].map(({ label, value, fmt, color, icon: Icon }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                <Icon size={18} className="text-gray-400"/>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">{label}</p>
                <p className={`text-xl font-black ${color}`}>{fmt(value)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabla de ventas ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <p className="text-center text-gray-400 py-16 text-sm">Cargando...</p>
        ) : ventasFiltradas.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Receipt size={44} className="mx-auto mb-3 opacity-20"/>
            <p className="font-semibold text-gray-500">
              {ventas.length === 0 ? 'Sin ventas en esta fecha' : 'Sin resultados para la búsqueda'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {/* Cabecera */}
            <div className="hidden sm:grid grid-cols-12 px-5 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wider bg-gray-50">
              <div className="col-span-1">#</div>
              <div className="col-span-2">Hora</div>
              <div className="col-span-2">Método</div>
              <div className="col-span-4">Productos</div>
              <div className="col-span-2 text-right">Pago</div>
              <div className="col-span-1 text-right">Acción</div>
            </div>

            {ventasFiltradas.map(v => (
              <div key={v.idPedido}
                className="px-5 py-4 hover:bg-gray-50/60 transition-colors">

                {/* Layout móvil */}
                <div className="flex items-start justify-between gap-3 sm:hidden">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-gray-800">#{v.idPedido}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(v.FechaAlta).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${COLOR_METODO[v.MetodoPago] || 'bg-gray-100 text-gray-600'}`}>
                        {LABEL_METODO[v.MetodoPago] || v.MetodoPago}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {v.items.map(i => `${i.Cantidad}× ${i.NombreProducto}`).join(' · ')}
                    </p>
                    <div className="flex gap-3 mt-1 text-xs">
                      {v.MontoEfectivo > 0 && <span className="text-green-600">Ef. ${parseFloat(v.MontoEfectivo).toFixed(2)}</span>}
                      {v.MontoTarjeta  > 0 && <span className="text-blue-600">Tar. ${parseFloat(v.MontoTarjeta).toFixed(2)}</span>}
                      {v.MontoCambio   > 0 && <span className="text-gray-400">Cambio ${parseFloat(v.MontoCambio).toFixed(2)}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-black text-vida-blue">${parseFloat(v.TotalUSD).toFixed(2)}</p>
                    <button onClick={() => reimprimir(v)}
                      className="mt-1.5 flex items-center gap-1 text-xs text-gray-400 hover:text-vida-blue transition-colors ml-auto">
                      <Printer size={12}/> Reimprimir
                    </button>
                  </div>
                </div>

                {/* Layout escritorio */}
                <div className="hidden sm:grid grid-cols-12 items-center gap-2">
                  <div className="col-span-1 font-bold text-gray-800 text-sm">#{v.idPedido}</div>
                  <div className="col-span-2 text-sm text-gray-500">
                    {new Date(v.FechaAlta).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="col-span-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${COLOR_METODO[v.MetodoPago] || 'bg-gray-100 text-gray-600'}`}>
                      {LABEL_METODO[v.MetodoPago] || v.MetodoPago}
                    </span>
                  </div>
                  <div className="col-span-4 text-xs text-gray-500 truncate">
                    {v.items.map(i => `${i.Cantidad}× ${i.NombreProducto}`).join(' · ')}
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="font-black text-vida-blue text-sm">${parseFloat(v.TotalUSD).toFixed(2)}</p>
                    <div className="flex justify-end gap-2 mt-0.5 text-xs">
                      {v.MontoEfectivo > 0 && <span className="text-green-600">Ef.${parseFloat(v.MontoEfectivo).toFixed(2)}</span>}
                      {v.MontoTarjeta  > 0 && <span className="text-blue-500">Tar.${parseFloat(v.MontoTarjeta).toFixed(2)}</span>}
                      {v.MontoCambio   > 0 && <span className="text-gray-400">C.${parseFloat(v.MontoCambio).toFixed(2)}</span>}
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button onClick={() => reimprimir(v)}
                      title="Reimprimir ticket"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-vida-blue hover:bg-blue-50 transition-colors">
                      <Printer size={15}/>
                    </button>
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
