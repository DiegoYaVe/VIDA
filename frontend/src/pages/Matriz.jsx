// src/pages/Matriz.jsx
// Matriz y reabasto (T-0040): pedir a la Matriz (catálogo + carrito) y
// bandeja de pedidos (preparar/enviar/recibir con movimiento de stock).
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Warehouse, Store, ShoppingCart, Plus, Minus, Search, RefreshCw, X,
  Package, Send, Check, Truck, ClipboardList, ArrowRight, AlertTriangle,
  Trash2, Settings,
} from 'lucide-react';
import api from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';

const USD = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const FECHA = (f) => f ? new Date(f).toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const ROLES_ESCRITURA = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN'];

const STATUS_CFG = {
  SOLICITADO: { label: 'Solicitado', color: 'bg-blue-100 text-blue-700', icon: ClipboardList },
  PREPARANDO: { label: 'Preparando', color: 'bg-amber-100 text-amber-700', icon: Package },
  ENVIADO:    { label: 'Enviado',    color: 'bg-purple-100 text-purple-700', icon: Truck },
  RECIBIDO:   { label: 'Recibido',   color: 'bg-green-100 text-green-700', icon: Check },
  CANCELADO:  { label: 'Cancelado',  color: 'bg-red-100 text-red-600', icon: X },
};
// Próximo estado según quién actúa (matriz prepara/envía, tienda recibe)
const SIGUIENTE = { SOLICITADO: 'PREPARANDO', PREPARANDO: 'ENVIADO', ENVIADO: 'RECIBIDO' };

function Spinner() {
  return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-vida-blue/30 border-t-vida-blue rounded-full animate-spin" /></div>;
}

function StatusBadge({ status }) {
  const c = STATUS_CFG[status] || { label: status, color: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${c.color}`}>{c.label}</span>;
}

// ─── Aviso: no hay Matriz designada ───────────────────────────────────────────
function SinMatriz({ puntosVenta, puedeEscribir, onDesignada }) {
  const [sel, setSel] = useState('');
  const [guardando, setG] = useState(false);
  return (
    <div className="max-w-lg mx-auto text-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-vida-blue-light flex items-center justify-center mx-auto mb-4">
        <Warehouse size={30} className="text-vida-blue" />
      </div>
      <h2 className="text-lg font-black text-gray-800">Aún no has designado tu Matriz</h2>
      <p className="text-sm text-gray-500 mt-2 mb-6">
        La Matriz es tu almacén central: desde ahí surtes de mercancía a las tiendas. Elige qué tienda será la Matriz.
      </p>
      {puedeEscribir ? (
        <div className="flex gap-2 justify-center">
          <select value={sel} onChange={e => setSel(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
            <option value="">— Selecciona la tienda —</option>
            {puntosVenta.map(pv => <option key={pv.idPuntoVenta} value={pv.idPuntoVenta}>{pv.NomComercial}</option>)}
          </select>
          <button disabled={!sel || guardando}
            onClick={async () => { setG(true); try { await api.post('/matriz/designar', { idPuntoVenta: Number(sel) }); onDesignada(); } finally { setG(false); } }}
            className="bg-vida-blue text-white rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
            Designar Matriz
          </button>
        </div>
      ) : <p className="text-xs text-gray-400">Pídele a un administrador que designe la Matriz.</p>}
    </div>
  );
}

// ─── TAB: Pedir a la Matriz (catálogo + carrito) ──────────────────────────────
function TabPedir({ matriz, puntosVenta, onPedidoCreado }) {
  const { usuario } = useAuthStore();
  const [productos, setProductos] = useState([]);
  const [cargando, setCarg] = useState(true);
  const [q, setQ] = useState('');
  const [carrito, setCarrito] = useState({}); // idProducto -> cantidad
  const [tienda, setTienda] = useState('');
  const [notas, setNotas] = useState('');
  const [enviando, setEnv] = useState(false);
  const [msg, setMsg] = useState('');

  // Tiendas destino = puntos de venta que NO son la matriz
  const tiendas = useMemo(() => puntosVenta.filter(pv => String(pv.idPuntoVenta) !== String(matriz.idPuntoVenta)), [puntosVenta, matriz]);

  useEffect(() => { if (tiendas.length && !tienda) setTienda(String(tiendas[0].idPuntoVenta)); }, [tiendas]);

  const cargar = useCallback(async () => {
    setCarg(true);
    try {
      const params = new URLSearchParams(q.trim() ? { search: q.trim() } : {});
      const r = await api.get(`/matriz/catalogo?${params}`);
      setProductos(r.data.productos || []);
    } catch { setProductos([]); }
    finally { setCarg(false); }
  }, [q]);
  useEffect(() => { const t = setTimeout(cargar, 300); return () => clearTimeout(t); }, [cargar]);

  const setCant = (id, cant) => setCarrito(c => { const n = { ...c }; if (cant <= 0) delete n[id]; else n[id] = cant; return n; });
  const items = Object.entries(carrito);
  const totalCosto = items.reduce((s, [id, cant]) => {
    const p = productos.find(x => String(x.idProducto) === id);
    return s + (p ? p.CostoUSD * cant : 0);
  }, 0);

  async function enviarPedido() {
    if (!tienda) { setMsg('Selecciona la tienda que recibe'); return; }
    if (!items.length) { setMsg('Agrega al menos un producto'); return; }
    setEnv(true); setMsg('');
    try {
      await api.post('/matriz/pedidos', {
        idPuntoVentaSolicita: Number(tienda),
        items: items.map(([idProducto, Cantidad]) => ({ idProducto: Number(idProducto), Cantidad })),
        Notas: notas.trim() || null,
      });
      setCarrito({}); setNotas('');
      setMsg('Pedido enviado a la Matriz ✓');
      onPedidoCreado?.();
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setMsg(e.response?.data?.error || 'Error al enviar el pedido');
    } finally { setEnv(false); }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Catálogo */}
      <div className="lg:col-span-2 space-y-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar en el catálogo central…"
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl" />
        </div>
        {cargando ? <Spinner /> : (
          <div className="grid sm:grid-cols-2 gap-3">
            {productos.map(p => {
              const cant = carrito[p.idProducto] || 0;
              return (
                <div key={p.idProducto} className="bg-white border border-gray-100 rounded-2xl p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm truncate">{p.Nombre}</p>
                    <p className="text-xs text-gray-400">{p.NombreCategoria || '—'} · stock matriz: <b className={p.StockMatriz > 0 ? 'text-gray-600' : 'text-red-500'}>{p.StockMatriz}</b></p>
                    <p className="text-xs mt-0.5"><span className="text-gray-400">costo</span> <b className="text-vida-blue">{USD(p.CostoUSD)}</b></p>
                  </div>
                  {cant === 0 ? (
                    <button onClick={() => setCant(p.idProducto, 1)}
                      className="w-9 h-9 rounded-full bg-vida-blue text-white flex items-center justify-center hover:opacity-90">
                      <Plus size={16} />
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setCant(p.idProducto, cant - 1)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"><Minus size={13} /></button>
                      <input type="number" value={cant} onChange={e => setCant(p.idProducto, parseInt(e.target.value) || 0)}
                        className="w-12 text-center border border-gray-200 rounded-lg py-1 text-sm" />
                      <button onClick={() => setCant(p.idProducto, cant + 1)} className="w-7 h-7 rounded-full bg-vida-blue text-white flex items-center justify-center"><Plus size={13} /></button>
                    </div>
                  )}
                </div>
              );
            })}
            {productos.length === 0 && <p className="col-span-2 text-center text-gray-400 py-10 text-sm">Sin productos en el catálogo</p>}
          </div>
        )}
      </div>

      {/* Carrito de reabasto */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 h-fit lg:sticky lg:top-6">
        <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-3"><ShoppingCart size={16} className="text-vida-blue" /> Carrito de reabasto</h3>
        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-500 mb-1">Tienda que recibe</label>
          <select value={tienda} onChange={e => setTienda(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            {tiendas.map(t => <option key={t.idPuntoVenta} value={t.idPuntoVenta}>{t.NomComercial}</option>)}
          </select>
        </div>

        {items.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">Agrega productos del catálogo</p>
        ) : (
          <div className="space-y-2 mb-3 max-h-64 overflow-y-auto">
            {items.map(([id, cant]) => {
              const p = productos.find(x => String(x.idProducto) === id);
              if (!p) return null;
              return (
                <div key={id} className="flex items-center gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-700 truncate">{p.Nombre}</p>
                    <p className="text-xs text-gray-400">{cant} × {USD(p.CostoUSD)}</p>
                  </div>
                  <span className="font-semibold text-gray-800">{USD(p.CostoUSD * cant)}</span>
                  <button onClick={() => setCant(id, 0)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                </div>
              );
            })}
          </div>
        )}

        <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas (opcional)"
          rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3" />

        <div className="flex items-center justify-between border-t border-gray-100 pt-3 mb-3">
          <span className="text-sm text-gray-500">Total al costo</span>
          <span className="font-black text-vida-blue text-lg">{USD(totalCosto)}</span>
        </div>
        {msg && <p className={`text-sm text-center mb-2 font-semibold ${msg.includes('✓') ? 'text-green-600' : 'text-red-600'}`}>{msg}</p>}
        <button onClick={enviarPedido} disabled={enviando || !items.length}
          className="w-full flex items-center justify-center gap-2 bg-vida-green text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
          <Send size={15} /> {enviando ? 'Enviando…' : 'Pedir a la Matriz'}
        </button>
      </div>
    </div>
  );
}

// ─── Modal recepción / avance de un pedido ────────────────────────────────────
function ModalPedido({ idPedidoMatriz, puedeEscribir, onClose, onCambiado }) {
  const [ped, setPed] = useState(null);
  const [cargando, setCarg] = useState(true);
  const [recibidas, setRecibidas] = useState({});
  const [proc, setProc] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCarg(true);
    try {
      const r = await api.get(`/matriz/pedidos/${idPedidoMatriz}`);
      setPed(r.data);
      // por defecto, recibir todo lo solicitado
      const init = {};
      (r.data.detalle || []).forEach(d => { init[d.idDetalle] = d.CantidadSolicitada; });
      setRecibidas(init);
    } catch { setPed(null); }
    finally { setCarg(false); }
  }, [idPedidoMatriz]);
  useEffect(() => { cargar(); }, [cargar]);

  async function avanzar(nuevo) {
    setProc(true); setError('');
    try {
      const body = { StatusNuevo: nuevo };
      if (nuevo === 'RECIBIDO') {
        body.cantidadesRecibidas = Object.entries(recibidas)
          .map(([idDetalle, CantidadRecibida]) => ({ idDetalle: Number(idDetalle), CantidadRecibida: Number(CantidadRecibida) }))
          .filter(x => x.CantidadRecibida > 0);
      }
      await api.patch(`/matriz/pedidos/${idPedidoMatriz}/status`, body);
      onCambiado?.();
      cargar();
    } catch (e) {
      setError(e.response?.data?.error || 'Error al actualizar');
    } finally { setProc(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-800">Pedido a Matriz #{idPedidoMatriz}</h3>
            {ped && <StatusBadge status={ped.Status} />}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {cargando ? <Spinner /> : !ped ? (
          <p className="text-center text-gray-400 py-16 text-sm">No se pudo cargar</p>
        ) : (
          <>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div className="flex items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1 text-gray-500"><Warehouse size={13} /> {ped.NombreMatriz}</span>
                <ArrowRight size={13} className="text-gray-300" />
                <span className="inline-flex items-center gap-1 font-semibold text-gray-700"><Store size={13} /> {ped.NombreTienda}</span>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Productos</h4>
                <div className="space-y-1.5">
                  {ped.detalle.map(d => (
                    <div key={d.idDetalle} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{d.NombreProducto}</p>
                        <p className="text-xs text-gray-400">Solicitado: {d.CantidadSolicitada} · costo {USD(d.CostoUnitario)}</p>
                      </div>
                      {/* Al recibir, la tienda ajusta cantidades */}
                      {ped.Status === 'ENVIADO' && puedeEscribir ? (
                        <input type="number" value={recibidas[d.idDetalle] ?? ''} min="0" max={d.CantidadSolicitada}
                          onChange={e => setRecibidas(r => ({ ...r, [d.idDetalle]: e.target.value }))}
                          className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center" />
                      ) : (
                        <span className="text-sm font-bold text-gray-700">
                          {ped.Status === 'RECIBIDO' ? `Recibido: ${d.CantidadRecibida}` : d.CantidadSolicitada}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="text-right text-sm font-bold text-gray-700 mt-2">Total al costo: <span className="text-vida-blue">{USD(ped.TotalCostoUSD)}</span></div>
              </div>

              {ped.historial?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Seguimiento</h4>
                  <div className="space-y-1">
                    {ped.historial.map((h, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                        <StatusBadge status={h.StatusNuevo} />
                        {h.Notas && <span className="text-gray-400">— {h.Notas}</span>}
                        <span className="text-gray-300 ml-auto">{FECHA(h.FechaAlta)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Acciones según estado */}
            {puedeEscribir && SIGUIENTE[ped.Status] && (
              <div className="p-5 border-t flex gap-2 justify-end">
                {ped.Status !== 'ENVIADO' && (
                  <button onClick={() => avanzar('CANCELADO')} disabled={proc}
                    className="border border-red-200 text-red-600 rounded-xl px-4 py-2 text-sm hover:bg-red-50">Cancelar pedido</button>
                )}
                <button onClick={() => avanzar(SIGUIENTE[ped.Status])} disabled={proc}
                  className="flex items-center gap-2 bg-vida-blue text-white rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                  {ped.Status === 'SOLICITADO' && <><Package size={15} /> Marcar preparando</>}
                  {ped.Status === 'PREPARANDO' && <><Truck size={15} /> Marcar enviado</>}
                  {ped.Status === 'ENVIADO' && <><Check size={15} /> Confirmar recepción</>}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── TAB: Pedidos (bandeja) ───────────────────────────────────────────────────
function TabPedidos({ puedeEscribir, refresh }) {
  const [pedidos, setPedidos] = useState(null);
  const [cargando, setCarg] = useState(true);
  const [abierto, setAbierto] = useState(null);

  const cargar = useCallback(async () => {
    setCarg(true);
    try { setPedidos((await api.get('/matriz/pedidos')).data); }
    catch { setPedidos([]); }
    finally { setCarg(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar, refresh]);

  if (cargando) return <Spinner />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={cargar} className="flex items-center gap-2 text-sm text-gray-500 hover:text-vida-blue border border-gray-200 px-3 py-2 rounded-xl">
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>
      {pedidos.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ClipboardList size={48} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Aún no hay pedidos a la Matriz</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  {['#', 'Tienda', 'Items', 'Total costo', 'Estado', 'Fecha', ''].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pedidos.map(p => (
                  <tr key={p.idPedidoMatriz} onClick={() => setAbierto(p.idPedidoMatriz)}
                    className="hover:bg-gray-50/50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-bold text-gray-700">#{p.idPedidoMatriz}</td>
                    <td className="px-4 py-3 text-gray-700"><span className="inline-flex items-center gap-1.5"><Store size={13} className="text-gray-400" />{p.NombreTienda}</span></td>
                    <td className="px-4 py-3 text-gray-500">{p.TotalItems}</td>
                    <td className="px-4 py-3 font-bold text-gray-900">{USD(p.TotalCostoUSD)}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.Status} /></td>
                    <td className="px-4 py-3 text-xs text-gray-400">{FECHA(p.FechaAlta)}</td>
                    <td className="px-4 py-3 text-right"><ArrowRight size={15} className="text-gray-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {abierto && <ModalPedido idPedidoMatriz={abierto} puedeEscribir={puedeEscribir} onClose={() => setAbierto(null)} onCambiado={cargar} />}
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function Matriz() {
  const { usuario } = useAuthStore();
  const puedeEscribir = ROLES_ESCRITURA.includes(usuario?.TipoUsuario);
  const [tab, setTab] = useState('pedir');
  const [estado, setEstado] = useState(null);
  const [cargando, setCarg] = useState(true);
  const [refresh, setRefresh] = useState(0);

  const cargar = useCallback(async () => {
    setCarg(true);
    try { setEstado((await api.get('/matriz')).data); }
    catch { setEstado({ matriz: null, puntosVenta: [] }); }
    finally { setCarg(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const TABS = [
    { id: 'pedir', label: 'Pedir a la Matriz', icon: ShoppingCart },
    { id: 'pedidos', label: 'Pedidos', icon: ClipboardList },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
          <Warehouse size={22} className="text-vida-blue" /> Matriz y Reabasto
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Surte a tus tiendas desde el almacén central
          {estado?.matriz ? <> · Matriz: <b className="text-gray-600">{estado.matriz.NomComercial}</b></> : null}
        </p>
      </div>

      {cargando ? <Spinner /> : !estado?.matriz ? (
        <div className="p-6"><SinMatriz puntosVenta={estado?.puntosVenta || []} puedeEscribir={puedeEscribir} onDesignada={cargar} /></div>
      ) : (
        <>
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
            {tab === 'pedir'   && <TabPedir matriz={estado.matriz} puntosVenta={estado.puntosVenta} onPedidoCreado={() => setRefresh(x => x + 1)} />}
            {tab === 'pedidos' && <TabPedidos puedeEscribir={puedeEscribir} refresh={refresh} />}
          </div>
        </>
      )}
    </div>
  );
}
