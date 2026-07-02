// src/pages/Pedidos.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../store/authStore.js';
import api from '../services/api.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import {
  ShoppingBag, Clock, CheckCircle, Truck, XCircle, ChevronRight,
  User, Phone, RefreshCw, Check, X, ArrowRight, Eye, AlertCircle,
  Wifi, WifiOff, AlertTriangle,
} from 'lucide-react';

const ROLES_ESCRITURA = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN'];

// ── Config de estatus ──────────────────────────────────────────────────────
const STATUS_CFG = {
  NUEVO:      { label: 'Nuevo',       color: 'bg-blue-100 text-blue-700',   icon: ShoppingBag, dot: 'bg-blue-500' },
  PREPARANDO: { label: 'Preparando',  color: 'bg-yellow-100 text-yellow-700', icon: Clock,      dot: 'bg-yellow-500' },
  LISTO:      { label: 'Listo',       color: 'bg-green-100 text-green-700', icon: CheckCircle, dot: 'bg-green-500' },
  EN_CAMINO:  { label: 'En camino',   color: 'bg-purple-100 text-purple-700', icon: Truck,     dot: 'bg-purple-500' },
  ENTREGADO:  { label: 'Entregado',   color: 'bg-gray-100 text-gray-600',   icon: Check,       dot: 'bg-gray-400' },
  CANCELADO:  { label: 'Cancelado',   color: 'bg-red-100 text-red-600',     icon: XCircle,     dot: 'bg-red-500' },
};

const TRANSICIONES = {
  NUEVO:      ['PREPARANDO', 'CANCELADO'],
  PREPARANDO: ['LISTO', 'CANCELADO'],
  LISTO:      ['EN_CAMINO', 'ENTREGADO', 'CANCELADO'],
  EN_CAMINO:  ['ENTREGADO', 'CANCELADO'],
  ENTREGADO:  [],
  CANCELADO:  [],
};

const STATUS_PAGO_CFG = {
  PENDIENTE: { label: 'Pendiente', color: 'text-yellow-600' },
  PAGADO:    { label: 'Pagado',    color: 'text-green-600' },
  RECHAZADO: { label: 'Rechazado', color: 'text-red-600' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || { label: status, color: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>
      {cfg.label}
    </span>
  );
}

// ── Tiempo restante de expiración ──────────────────────────────────────────
function Countdown({ fechaExpiracion }) {
  const [seg, setSeg] = useState(0);

  useEffect(() => {
    const calcular = () => {
      const resto = Math.max(0, Math.floor((new Date(fechaExpiracion) - Date.now()) / 1000));
      setSeg(resto);
    };
    calcular();
    const t = setInterval(calcular, 1000);
    return () => clearInterval(t);
  }, [fechaExpiracion]);

  if (seg <= 0) return <span className="text-xs text-red-500 font-semibold">Expirado</span>;
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return (
    <span className={`text-xs font-semibold ${seg < 120 ? 'text-red-500' : 'text-gray-400'}`}>
      {m}:{String(s).padStart(2, '0')}
    </span>
  );
}

// ── Modal detalle del pedido ───────────────────────────────────────────────
function ModalPedido({ idPedido, idBranch, idCuenta, puedeEscribir, repartidores, onClose, onActualizado }) {
  const [pedido, setPedido] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cambiando, setCambiando] = useState(false);
  const [notas, setNotas] = useState('');
  const [idRepAsignar, setIdRepAsignar] = useState('');
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const r = await api.get(`/pedidos/${idPedido}`);
      setPedido(r.data);
      if (r.data.idRepartidor) setIdRepAsignar(String(r.data.idRepartidor));
    } finally {
      setLoading(false);
    }
  }, [idPedido]);

  useEffect(() => { cargar(); }, [cargar]);

  async function cambiarStatus(nuevoStatus) {
    setCambiando(true); setError('');
    try {
      await api.patch(`/pedidos/${idPedido}/status`, {
        StatusNuevo:  nuevoStatus,
        Notas:        notas || null,
        idRepartidor: idRepAsignar ? parseInt(idRepAsignar) : undefined,
      });
      setNotas('');
      await cargar();
      onActualizado();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cambiar estado');
    } finally {
      setCambiando(false);
    }
  }

  async function aprobarComprobante(idComprobante, aprobado) {
    try {
      await api.patch(`/pedidos/${idPedido}/comprobante/${idComprobante}/revision`, {
        StatusRevision: aprobado ? 'APROBADO' : 'RECHAZADO',
      });
      cargar();
      onActualizado();
    } catch (err) {
      setError(err.response?.data?.error || 'Error');
    }
  }

  async function resolverRevision() {
    setCambiando(true); setError('');
    try {
      await api.patch(`/pedidos/${idPedido}/revision-stock`, { Notas: notas || null });
      setNotas('');
      await cargar();
      onActualizado();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al resolver revisión');
    } finally {
      setCambiando(false);
    }
  }

  if (loading) return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8"><p className="text-gray-400 text-sm">Cargando...</p></div>
    </div>
  );

  if (!pedido) return null;

  const siguientes = TRANSICIONES[pedido.Status] || [];
  const repActivos = repartidores.filter(r => r.StatusAprobacion === 'APROBADO');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-gray-800">Pedido #{pedido.idPedido}</h3>
              <StatusBadge status={pedido.Status}/>
              <span className={`text-xs font-semibold ${STATUS_PAGO_CFG[pedido.StatusPago]?.color}`}>
                · {STATUS_PAGO_CFG[pedido.StatusPago]?.label}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {pedido.Canal === 'APP' ? '📱 App' : '🖥️ POS'}
              {pedido.EsOffline ? ' · sincronizada offline' : ''} · {new Date(pedido.FechaAlta).toLocaleString()}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          {/* Venta offline con stock insuficiente — requiere revisión */}
          {!!pedido.RequiereRevision && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5"/>
                <div>
                  <p className="text-sm font-bold text-amber-800">Venta offline con stock insuficiente</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Esta venta se cobró sin conexión y al sincronizarla el inventario registrado era menor
                    a lo vendido. Verifica el conteo físico del producto en la sucursal y ajusta el stock
                    en Inventario si es necesario.
                  </p>
                </div>
              </div>
              {puedeEscribir && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={notas}
                    onChange={e => setNotas(e.target.value)}
                    placeholder="Nota de resolución (opcional)"
                    className="flex-1 border border-amber-200 rounded-lg px-3 py-1.5 text-sm bg-white"
                  />
                  <button
                    onClick={resolverRevision}
                    disabled={cambiando}
                    className="flex items-center gap-1 bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50">
                    <Check size={12}/> Marcar como revisada
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Cliente y repartidor */}
          <div className="grid grid-cols-2 gap-3">
            {pedido.NombreCliente && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">Cliente</p>
                <p className="text-sm font-semibold text-gray-800">{pedido.NombreCliente}</p>
                {pedido.TelefonoCliente && <p className="text-xs text-gray-500">{pedido.TelefonoCliente}</p>}
                {pedido.DireccionCliente && <p className="text-xs text-gray-500 mt-0.5">{pedido.DireccionCliente}</p>}
              </div>
            )}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">Repartidor</p>
              {pedido.NombreRepartidor ? (
                <>
                  <p className="text-sm font-semibold text-gray-800">{pedido.NombreRepartidor}</p>
                  {pedido.TelefonoRepartidor && <p className="text-xs text-gray-500">{pedido.TelefonoRepartidor}</p>}
                </>
              ) : (
                puedeEscribir && repActivos.length > 0 ? (
                  <select value={idRepAsignar} onChange={e => setIdRepAsignar(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm mt-1">
                    <option value="">Sin asignar</option>
                    {repActivos.map(r => <option key={r.idRepartidor} value={r.idRepartidor}>{r.Nombre}</option>)}
                  </select>
                ) : <p className="text-xs text-gray-400">Sin asignar</p>
              )}
            </div>
          </div>

          {/* Productos */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Productos</h4>
            <div className="space-y-1.5">
              {pedido.detalle.map(d => (
                <div key={d.idDetalle} className="flex justify-between items-center bg-gray-50 rounded-xl px-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{d.NombreProducto}</p>
                    <p className="text-xs text-gray-400">SKU: {d.SKU} · {d.UnidadMedida}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{d.Cantidad} × ${d.PrecioUnitario}</p>
                    <p className="text-xs text-gray-400">${(d.Cantidad * d.PrecioUnitario).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-right mt-2 text-sm font-bold text-gray-700">
              Total: <span className="text-vida-blue">${Number(pedido.TotalUSD).toFixed(2)}</span>
            </div>
          </div>

          {/* Comprobantes de pago */}
          {pedido.comprobantes?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Comprobantes de pago</h4>
              {pedido.comprobantes.map(c => (
                <div key={c.idComprobante} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                  <div>
                    {c.Referencia && <p className="text-sm font-medium">Ref: {c.Referencia}</p>}
                    <p className="text-xs text-gray-400">{new Date(c.FechaAlta).toLocaleString()}</p>
                    <a href={c.ImagenURL} target="_blank" rel="noreferrer"
                      className="text-xs text-vida-blue underline">Ver comprobante</a>
                  </div>
                  {c.StatusRevision === 'PENDIENTE' && puedeEscribir ? (
                    <div className="flex gap-2">
                      <button onClick={() => aprobarComprobante(c.idComprobante, true)}
                        className="flex items-center gap-1 bg-green-500 text-white text-xs px-3 py-1.5 rounded-lg hover:opacity-90">
                        <Check size={12}/> Aprobar
                      </button>
                      <button onClick={() => aprobarComprobante(c.idComprobante, false)}
                        className="flex items-center gap-1 bg-red-500 text-white text-xs px-3 py-1.5 rounded-lg hover:opacity-90">
                        <X size={12}/> Rechazar
                      </button>
                    </div>
                  ) : (
                    <span className={`text-xs font-semibold ${
                      c.StatusRevision === 'APROBADO' ? 'text-green-600' : 'text-red-600'
                    }`}>{c.StatusRevision}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Historial */}
          {pedido.historial?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Historial</h4>
              <div className="space-y-1.5">
                {pedido.historial.map(h => (
                  <div key={h.idHistorial} className="flex items-center gap-2 text-xs text-gray-500">
                    {h.StatusAnterior && <><StatusBadge status={h.StatusAnterior}/><ArrowRight size={10}/></>}
                    <StatusBadge status={h.StatusNuevo}/>
                    {h.Notas && <span className="text-gray-400">— {h.Notas}</span>}
                    <span className="text-gray-300 ml-auto">{new Date(h.FechaAlta).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notas para el cambio */}
          {siguientes.length > 0 && puedeEscribir && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nota para el cambio (opcional)</label>
              <input value={notas} onChange={e => setNotas(e.target.value)}
                placeholder="Ej: Cliente confirmó pago en efectivo..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"/>
            </div>
          )}
        </div>

        {/* Acciones de estado */}
        {siguientes.length > 0 && puedeEscribir && (
          <div className="p-5 border-t">
            <p className="text-xs text-gray-400 mb-2">Cambiar estado:</p>
            <div className="flex gap-2 flex-wrap">
              <button onClick={onClose}
                className="border border-gray-200 text-gray-600 rounded-xl px-4 py-2 text-sm hover:bg-gray-50">
                Cerrar
              </button>
              {siguientes.map(s => (
                <button key={s} disabled={cambiando} onClick={() => cambiarStatus(s)}
                  className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                    s === 'CANCELADO'
                      ? 'bg-red-500 text-white hover:opacity-90'
                      : 'bg-vida-blue text-white hover:opacity-90'
                  }`}>
                  {STATUS_CFG[s]?.label || s}
                </button>
              ))}
            </div>
          </div>
        )}
        {siguientes.length === 0 && (
          <div className="p-5 border-t">
            <button onClick={onClose}
              className="w-full border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm hover:bg-gray-50">
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════
export default function Pedidos() {
  const { usuario } = useAuthStore();
  const puedeEscribir = ROLES_ESCRITURA.includes(usuario?.TipoUsuario);

  const [pedidos, setPedidos]         = useState([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [filtStatus, setFiltStatus]   = useState('');
  const [filtCanal, setFiltCanal]     = useState('');
  const [filtRevision, setFiltRevision] = useState(false);
  const [revisionCount, setRevisionCount] = useState(0);
  const [loading, setLoading]         = useState(true);
  const [repartidores, setRepartidores] = useState([]);
  const [pedidoAbierto, setPedidoAbierto] = useState(null);
  const [wsVivo,        setWsVivo]        = useState(false);
  const intervalRef = useRef(null);
  const cargarRef   = useRef(null); // referencia estable para usar dentro del WS callback

  const cargar = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const r = await api.get('/pedidos', {
        params: {
          page: p, limit: 20, status: filtStatus, canal: filtCanal,
          requiereRevision: filtRevision ? 1 : '',
        },
      });
      setPedidos(r.data.data);
      setTotal(r.data.total);
    } finally {
      setLoading(false);
    }
  }, [page, filtStatus, filtCanal, filtRevision]);

  // Contador de ventas por revisar (para el badge del filtro)
  const cargarRevisionCount = useCallback(async () => {
    try {
      const r = await api.get('/pedidos', { params: { page: 1, limit: 1, requiereRevision: 1 } });
      setRevisionCount(r.data.total || 0);
    } catch { /* sin permiso o sin red — el badge simplemente no se muestra */ }
  }, []);

  useEffect(() => { cargar(1); setPage(1); }, [filtStatus, filtCanal, filtRevision]);
  useEffect(() => { cargar(page); }, [page]);
  useEffect(() => { cargarRevisionCount(); }, [cargarRevisionCount]);

  // Mantener referencia estable de cargar para el callback WS
  useEffect(() => { cargarRef.current = cargar; }, [cargar]);

  // ── WebSocket: actualizaciones en tiempo real ───────────────────────────
  const handleWsMensaje = useCallback((msg) => {
    if (msg.tipo === 'conectado') { setWsVivo(true); return; }
    if (msg.tipo === 'pedido:nuevo') {
      // Nuevo pedido llegó → recargar desde la página 1 con los filtros actuales
      cargarRef.current?.(1);
      setPage(1);
      // Las ventas offline sincronizadas pueden traer revisión pendiente
      if (msg.esOffline) cargarRevisionCount();
    } else if (msg.tipo === 'pedido:actualizado') {
      // Actualizar el status del pedido en la lista sin recargar todo
      setPedidos(prev => prev.map(p =>
        p.idPedido === msg.idPedido ? { ...p, Status: msg.StatusNuevo } : p
      ));
    }
  }, [cargarRevisionCount]);

  useWebSocket(handleWsMensaje, true);

  // Fallback: auto-refresh cada 60s por si acaso el WS cae
  useEffect(() => {
    intervalRef.current = setInterval(() => cargarRef.current?.(page), 60_000);
    return () => clearInterval(intervalRef.current);
  }, [page]);

  // Cargar repartidores aprobados
  useEffect(() => {
    api.get('/repartidores', { params: { statusAprobacion: 'APROBADO' } })
      .then(r => setRepartidores(r.data))
      .catch(() => {});
  }, []);

  const pages = Math.ceil(total / 20);
  const activos = pedidos.filter(p => !['ENTREGADO','CANCELADO'].includes(p.Status));
  const terminados = pedidos.filter(p => ['ENTREGADO','CANCELADO'].includes(p.Status));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Panel de Pedidos</h1>
          <p className="text-gray-500 text-sm mt-1">Monitorea y gestiona los pedidos en tiempo real</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Indicador WebSocket */}
          <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full border ${
            wsVivo
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-gray-50 border-gray-200 text-gray-400'
          }`}>
            {wsVivo
              ? <><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"/> En vivo</>
              : <><WifiOff size={12}/> Reconectando...</>
            }
          </div>
          <button onClick={() => cargar(page)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-vida-blue border border-gray-200 px-3 py-2 rounded-xl">
            <RefreshCw size={14}/> Actualizar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap mb-6">
        {/* Por status */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {[
            { v: '',           label: 'Todos' },
            { v: 'NUEVO',      label: 'Nuevos' },
            { v: 'PREPARANDO', label: 'Preparando' },
            { v: 'LISTO',      label: 'Listos' },
            { v: 'EN_CAMINO',  label: 'En camino' },
            { v: 'ENTREGADO',  label: 'Entregados' },
            { v: 'CANCELADO',  label: 'Cancelados' },
          ].map(f => (
            <button key={f.v} onClick={() => setFiltStatus(f.v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filtStatus === f.v ? 'bg-white text-vida-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Por canal */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {[{ v: '', label: 'App + POS' }, { v: 'APP', label: '📱 App' }, { v: 'POS', label: '🖥️ POS' }].map(f => (
            <button key={f.v} onClick={() => setFiltCanal(f.v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filtCanal === f.v ? 'bg-white text-vida-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Ventas offline con stock insuficiente pendientes de revisión */}
        {(revisionCount > 0 || filtRevision) && (
          <button onClick={() => setFiltRevision(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              filtRevision
                ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
            }`}>
            <AlertTriangle size={13}/>
            Por revisar
            {revisionCount > 0 && (
              <span className={`rounded-full px-1.5 text-[10px] font-bold ${
                filtRevision ? 'bg-white text-amber-600' : 'bg-amber-500 text-white'
              }`}>{revisionCount}</span>
            )}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-12">Cargando pedidos...</p>
      ) : pedidos.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ShoppingBag size={48} className="mx-auto mb-3 opacity-20"/>
          <p className="font-medium">No hay pedidos</p>
          <p className="text-sm mt-1">Los pedidos nuevos aparecerán aquí automáticamente</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pedidos activos */}
          {activos.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-gray-500 uppercase mb-3">
                Activos ({activos.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {activos.map(p => {
                  const cfg = STATUS_CFG[p.Status] || {};
                  const Icon = cfg.icon || ShoppingBag;
                  return (
                    <div key={p.idPedido}
                      onClick={() => setPedidoAbierto(p.idPedido)}
                      className="bg-white border-2 border-gray-100 rounded-2xl p-4 cursor-pointer hover:border-vida-blue hover:shadow-md transition-all">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-bold text-gray-800 flex items-center gap-1.5">
                            #{p.idPedido}
                            {!!p.RequiereRevision && <AlertTriangle size={14} className="text-amber-500" title="Requiere revisión de stock"/>}
                          </p>
                          <p className="text-xs text-gray-400">{p.Canal === 'APP' ? '📱 App' : '🖥️ POS'}</p>
                        </div>
                        <StatusBadge status={p.Status}/>
                      </div>

                      {p.NombreCliente && (
                        <div className="flex items-center gap-1.5 mb-2">
                          <User size={12} className="text-gray-400"/>
                          <p className="text-sm text-gray-600 truncate">{p.NombreCliente}</p>
                        </div>
                      )}
                      {p.NombreRepartidor && (
                        <div className="flex items-center gap-1.5 mb-2">
                          <Truck size={12} className="text-gray-400"/>
                          <p className="text-sm text-gray-600 truncate">{p.NombreRepartidor}</p>
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                        <span className="font-bold text-vida-blue">${Number(p.TotalUSD).toFixed(2)}</span>
                        <div className="flex items-center gap-2">
                          {p.FechaExpiracion && p.Status === 'NUEVO' && (
                            <Countdown fechaExpiracion={p.FechaExpiracion}/>
                          )}
                          <ChevronRight size={16} className="text-gray-300"/>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pedidos terminados */}
          {terminados.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-gray-500 uppercase mb-3">
                Finalizados ({terminados.length})
              </h2>
              <div className="space-y-2">
                {terminados.map(p => (
                  <div key={p.idPedido}
                    onClick={() => setPedidoAbierto(p.idPedido)}
                    className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 cursor-pointer hover:shadow-sm transition-shadow">
                    <div className="flex items-center gap-3">
                      <StatusBadge status={p.Status}/>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-gray-700">#{p.idPedido}</span>
                        {!!p.RequiereRevision && <AlertTriangle size={13} className="text-amber-500" title="Requiere revisión de stock"/>}
                        {p.NombreCliente && <span className="text-xs text-gray-400 ml-1">{p.NombreCliente}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <span className="text-sm font-bold text-gray-600">${Number(p.TotalUSD).toFixed(2)}</span>
                      <span className="text-xs text-gray-400">{new Date(p.FechaAlta).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Paginación */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-6 text-sm text-gray-500">
          <span>{total} pedido(s)</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30">
              ← Anterior
            </button>
            <span className="px-3 py-1.5">{page} / {pages}</span>
            <button disabled={page === pages} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30">
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {/* Modal detalle */}
      {pedidoAbierto && (
        <ModalPedido
          idPedido={pedidoAbierto}
          puedeEscribir={puedeEscribir}
          repartidores={repartidores}
          onClose={() => setPedidoAbierto(null)}
          onActualizado={() => { cargar(page); cargarRevisionCount(); }}
        />
      )}
    </div>
  );
}
