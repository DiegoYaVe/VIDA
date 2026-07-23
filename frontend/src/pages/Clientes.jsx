// src/pages/Clientes.jsx
// Consumidores Finales (T-0035): listado de clientes de la app + historial de pedidos.
import { useState, useEffect, useCallback } from 'react';
import {
  Users, Search, RefreshCw, X, Phone, Mail, MapPin, Package,
  ShoppingBag, DollarSign, Calendar, Star, ChevronRight, CheckCircle, XCircle,
} from 'lucide-react';
import api from '../services/api.js';

const USD = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const FECHA = (f) => f ? new Date(f).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const HORA = (f) => f ? new Date(f).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '';

const STATUS_PEDIDO = {
  ENTREGADO:            { label: 'Entregado', color: 'bg-green-100 text-green-700' },
  CANCELADO:            { label: 'Cancelado', color: 'bg-red-100 text-red-600' },
  EN_CAMINO:            { label: 'En camino', color: 'bg-orange-100 text-orange-700' },
  BUSCANDO_REPARTIDOR:  { label: 'Buscando', color: 'bg-blue-100 text-blue-700' },
  REPARTIDOR_ASIGNADO:  { label: 'Asignado', color: 'bg-purple-100 text-purple-700' },
  IR_A_SUCURSAL:        { label: 'A sucursal', color: 'bg-purple-100 text-purple-700' },
  EN_SUCURSAL:          { label: 'En sucursal', color: 'bg-purple-100 text-purple-700' },
};

function StatusPedido({ status }) {
  const c = STATUS_PEDIDO[status] || { label: status, color: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${c.color}`}>{c.label}</span>;
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-vida-blue/30 border-t-vida-blue rounded-full animate-spin" />
    </div>
  );
}

function Avatar({ nombre, apellidos, size = 40 }) {
  const ini = `${(nombre || '?')[0]}${(apellidos || '')[0] || ''}`.toUpperCase();
  return (
    <div className="rounded-full bg-gradient-to-br from-vida-blue to-vida-green flex items-center justify-center text-white font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {ini}
    </div>
  );
}

// ─── Modal detalle del consumidor ─────────────────────────────────────────────
function ModalCliente({ idCliente, onClose }) {
  const [datos, setDatos]   = useState(null);
  const [cargando, setCarg] = useState(true);

  useEffect(() => {
    setCarg(true);
    api.get(`/delivery/admin/clientes/${idCliente}`)
      .then(r => setDatos(r.data))
      .catch(() => setDatos(null))
      .finally(() => setCarg(false));
  }, [idCliente]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-bold text-gray-800">Detalle del consumidor</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {cargando ? <Spinner /> : !datos ? (
          <p className="text-center text-gray-400 py-16 text-sm">No se pudo cargar el consumidor</p>
        ) : (
          <div className="overflow-y-auto flex-1 p-5 space-y-5">
            {/* Cabecera */}
            <div className="flex items-center gap-4">
              <Avatar nombre={datos.cliente.Nombre} apellidos={datos.cliente.Apellidos} size={56} />
              <div className="flex-1 min-w-0">
                <p className="text-lg font-black text-gray-900">{datos.cliente.Nombre} {datos.cliente.Apellidos}</p>
                <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-1">
                  {datos.cliente.Telefono && <span className="flex items-center gap-1"><Phone size={11} />{datos.cliente.Telefono}</span>}
                  {datos.cliente.Email && <span className="flex items-center gap-1"><Mail size={11} />{datos.cliente.Email}</span>}
                  {datos.cliente.EsGoogle ? <span className="text-blue-500 font-semibold">Google</span> : null}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Cliente desde {FECHA(datos.cliente.FechaAlta)}</p>
              </div>
            </div>

            {/* Métricas */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-400">Pedidos</p>
                <p className="text-lg font-black text-gray-900">{datos.metricas.NumPedidos}</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-400">Entregados</p>
                <p className="text-lg font-black text-green-700">{datos.metricas.Entregados}</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-400">Gastado</p>
                <p className="text-lg font-black text-vida-blue">{USD(datos.metricas.TotalGastado)}</p>
              </div>
              <div className="bg-purple-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-400">Ticket prom.</p>
                <p className="text-lg font-black text-purple-700">{USD(datos.metricas.TicketPromedio)}</p>
              </div>
            </div>

            {/* Direcciones */}
            {datos.direcciones.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Direcciones guardadas</h4>
                <div className="space-y-1.5">
                  {datos.direcciones.map((d, i) => (
                    <div key={i} className="flex items-start gap-2 bg-gray-50 rounded-xl px-3 py-2">
                      <MapPin size={14} className="text-vida-blue mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm text-gray-700">{d.Direccion}</p>
                        {d.Alias && <span className="text-xs text-gray-400">{d.Alias}{d.EsPrincipal ? ' · principal' : ''}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Historial de pedidos */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Historial de pedidos ({datos.pedidos.length})</h4>
              {datos.pedidos.length === 0 ? (
                <p className="text-center text-gray-400 py-6 text-sm">Este consumidor aún no ha hecho pedidos</p>
              ) : (
                <div className="space-y-2">
                  {datos.pedidos.map(p => (
                    <div key={p.idPedido} className="flex items-center gap-3 border border-gray-100 rounded-xl px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-800">#{p.idPedido}</span>
                          <StatusPedido status={p.Status} />
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {FECHA(p.FechaAlta)} {HORA(p.FechaAlta)} · {p.NombreSucursal || '—'} · {p.TotalItems} art.
                          {p.NombreRepartidor ? ` · ${p.NombreRepartidor}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-gray-900">{USD(p.TotalUSD)}</p>
                        <p className="text-[10px] text-gray-400">{p.MetodoPago}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function Clientes() {
  const [data, setData]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [q, setQ]             = useState('');
  const [busca, setBusca]     = useState('');
  const [cargando, setCarg]   = useState(true);
  const [abierto, setAbierto] = useState(null);

  const cargar = useCallback(async () => {
    setCarg(true);
    try {
      const params = new URLSearchParams({ page, limit: 20, ...(busca && { q: busca }) });
      const r = await api.get(`/delivery/admin/clientes?${params}`);
      setData(r.data.data);
      setTotal(r.data.total);
    } catch { setData([]); }
    finally { setCarg(false); }
  }, [page, busca]);

  useEffect(() => { cargar(); }, [cargar]);

  // Buscar con debounce simple
  useEffect(() => {
    const t = setTimeout(() => { setBusca(q); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [q]);

  const pages = Math.ceil(total / 20);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <Users size={22} className="text-vida-blue" /> Consumidores Finales
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Clientes de la app · {total} registrados</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar nombre, teléfono o correo…"
              className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl w-64 focus:outline-none focus:ring-2 focus:ring-vida-blue/30" />
          </div>
          <button onClick={cargar} className="flex items-center gap-2 text-sm text-gray-500 hover:text-vida-blue border border-gray-200 px-3 py-2 rounded-xl">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="p-6">
        {cargando ? <Spinner /> : data.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Users size={48} className="mx-auto mb-3 opacity-20" />
            <p className="font-medium">{busca ? 'Sin resultados' : 'Aún no hay consumidores registrados'}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    {['Consumidor', 'Contacto', 'Pedidos', 'Total gastado', 'Último pedido', ''].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.map(c => (
                    <tr key={c.idCliente} onClick={() => setAbierto(c.idCliente)}
                      className="hover:bg-gray-50/50 cursor-pointer transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar nombre={c.Nombre} apellidos={c.Apellidos} size={36} />
                          <div>
                            <p className="font-semibold text-gray-800">{c.Nombre} {c.Apellidos}</p>
                            {c.EsGoogle ? <span className="text-[10px] text-blue-500 font-semibold">Google</span> : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {c.Telefono && <p className="flex items-center gap-1"><Phone size={10} />{c.Telefono}</p>}
                        {c.Email && <p className="flex items-center gap-1 truncate max-w-[180px]"><Mail size={10} />{c.Email}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-vida-blue">{c.NumPedidos}</span>
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-900">{USD(c.TotalGastado)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{c.UltimoPedido ? FECHA(c.UltimoPedido) : <span className="text-gray-300">nunca</span>}</td>
                      <td className="px-4 py-3 text-right"><ChevronRight size={16} className="text-gray-300" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between mt-6 text-sm text-gray-500">
            <span>{total} consumidor(es)</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30">← Anterior</button>
              <span className="px-3 py-1.5">{page} / {pages}</span>
              <button disabled={page === pages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30">Siguiente →</button>
            </div>
          </div>
        )}
      </div>

      {abierto && <ModalCliente idCliente={abierto} onClose={() => setAbierto(null)} />}
    </div>
  );
}
