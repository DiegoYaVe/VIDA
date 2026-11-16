// src/components/ReabastoVida.jsx
// Reabasto por proveedor con VIDA como intermediario (tarea 24): la tienda le
// pide a VIDA productos, le paga a VIDA y recibe por paquetes. Lo que ve la
// tienda nunca dice quién es el proveedor; lo que ve VIDA sí (para coordinar
// y pagarle).
import { useState, useEffect, useCallback, useMemo } from 'react';
import QRCode from 'qrcode';
import {
  ShoppingCart, Plus, Minus, Search, X, Send, Check, Truck, Trash2, Package,
  MapPin, Clock, Store, CreditCard, ShieldCheck, Ban, Star, UserPlus, UserCheck, AlertTriangle,
} from 'lucide-react';
import api from '../services/api.js';

const USD = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const FECHA = (f) => f ? new Date(f).toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

// Estados del pedido a VIDA (los de la Matriz están en Matriz.jsx)
export const STATUS_VIDA = {
  POR_PAGAR:      { label: 'Por pagar', color: 'bg-amber-100 text-amber-700' },
  PAGO_REPORTADO: { label: 'Pago en revisión', color: 'bg-blue-100 text-blue-700' },
  EN_PROCESO:     { label: 'En preparación', color: 'bg-purple-100 text-purple-700' },
  RECIBIDO:       { label: 'Recibido', color: 'bg-green-100 text-green-700' },
  CANCELADO:      { label: 'Cancelado', color: 'bg-red-100 text-red-600' },
};
// Estados de cada paquete, en palabras de la tienda
const STATUS_PAQUETE = {
  POR_PAGAR:  { label: 'Esperando tu pago', color: 'bg-gray-100 text-gray-600' },
  ENVIADO:    { label: 'Pedido', color: 'bg-blue-100 text-blue-700' },
  CONFIRMADO: { label: 'Preparando', color: 'bg-amber-100 text-amber-700' },
  LISTO:      { label: 'Listo para retirar', color: 'bg-teal-100 text-teal-700' },
  RETIRADO:   { label: 'En camino', color: 'bg-purple-100 text-purple-700' },
  RECIBIDO:   { label: 'Recibido', color: 'bg-green-100 text-green-700' },
  CANCELADO:  { label: 'Cancelado', color: 'bg-red-100 text-red-600' },
};
const MODOS = {
  ENVIO_VIDA: { label: 'Envío VIDA', desc: 'Un repartidor de VIDA te lo lleva a la tienda', icon: Truck },
  RECOJO:     { label: 'Recojo yo', desc: 'Lo recoges tú o tu repartidor en el punto de retiro', icon: MapPin },
};

function Badge({ cfg, status }) {
  const c = cfg[status] || { label: status, color: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${c.color}`}>{c.label}</span>;
}
export const BadgeVida = ({ status }) => <Badge cfg={STATUS_VIDA} status={status} />;

function Spinner() {
  return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-vida-blue/30 border-t-vida-blue rounded-full animate-spin" /></div>;
}

// ─── TAB: Pedir a VIDA ─────────────────────────────────────────────────────────
export function TabPedirVida({ matriz, puntosVenta, operaMatriz, onPedidoCreado }) {
  const [productos, setProductos] = useState([]);
  const [cargando, setCarg] = useState(true);
  const [q, setQ] = useState('');
  const [carrito, setCarrito] = useState({});
  const [modo, setModo] = useState('ENVIO_VIDA');
  const [tienda, setTienda] = useState('');
  const [notas, setNotas] = useState('');
  const [enviando, setEnv] = useState(false);
  const [msg, setMsg] = useState('');

  const tiendas = useMemo(() => puntosVenta.filter(pv => String(pv.idPuntoVenta) !== String(matriz.idPuntoVenta)), [puntosVenta, matriz]);
  useEffect(() => { if (operaMatriz && tiendas.length && !tienda) setTienda(String(tiendas[0].idPuntoVenta)); }, [tiendas, operaMatriz, tienda]);

  const cargar = useCallback(async () => {
    setCarg(true);
    try {
      const params = new URLSearchParams(q.trim() ? { search: q.trim() } : {});
      setProductos((await api.get(`/reabasto-vida/catalogo?${params}`)).data.productos || []);
    } catch { setProductos([]); }
    finally { setCarg(false); }
  }, [q]);
  useEffect(() => { const t = setTimeout(cargar, 300); return () => clearTimeout(t); }, [cargar]);

  const cambiar = (p, n) => setCarrito(c => {
    const x = { ...c };
    if (n > 0) x[p.idProducto] = { p, cant: n }; else delete x[p.idProducto];
    return x;
  });
  // El carrito guarda el producto completo: si una búsqueda lo saca de la lista, sigue en el pedido.
  const items = Object.entries(carrito);
  const total = items.reduce((s, [, x]) => s + x.p.PrecioVidaUSD * x.cant, 0);

  async function pedir() {
    if (!items.length) { setMsg('Agrega al menos un producto'); return; }
    if (operaMatriz && !tienda) { setMsg('Elige la tienda que recibe'); return; }
    setEnv(true); setMsg('');
    try {
      const r = await api.post('/reabasto-vida/pedidos', {
        items: items.map(([idProducto, x]) => ({ idProducto: Number(idProducto), Cantidad: x.cant })),
        ModoRecepcion: modo, Notas: notas.trim() || null,
        ...(operaMatriz ? { idPuntoVentaSolicita: Number(tienda) } : {}),
      });
      setCarrito({}); setNotas('');
      onPedidoCreado?.(r.data.idPedidoMatriz);
    } catch (e) {
      setMsg(e.response?.data?.error || 'No se pudo hacer el pedido');
    } finally { setEnv(false); }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-3 min-w-0">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar en el catálogo de VIDA…"
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl" />
        </div>
        {cargando ? <Spinner /> : (
          <div className="grid sm:grid-cols-2 gap-3">
            {productos.map(p => {
              const cant = carrito[p.idProducto]?.cant || 0;
              return (
                <div key={p.idProducto} className="bg-white border border-gray-100 rounded-2xl p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm truncate flex items-center gap-1">
                      {p.EsProductoPlus ? <Star size={12} className="text-amber-500 fill-amber-400 shrink-0" /> : null}{p.Nombre}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{p.NombreCategoria || '—'}{p.SKU ? ` · ${p.SKU}` : ''}</p>
                    <p className="text-xs mt-0.5"><span className="text-gray-400">precio VIDA</span> <b className="text-vida-blue">{USD(p.PrecioVidaUSD)}</b></p>
                  </div>
                  {cant === 0 ? (
                    <button onClick={() => cambiar(p, 1)} aria-label={`Agregar ${p.Nombre}`}
                      className="w-9 h-9 rounded-full bg-vida-blue text-white flex items-center justify-center hover:opacity-90 shrink-0">
                      <Plus size={16} />
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => cambiar(p, cant - 1)} aria-label="Quitar uno" className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"><Minus size={13} /></button>
                      <input type="number" value={cant} min="0" aria-label={`Cantidad de ${p.Nombre}`}
                        onChange={e => cambiar(p, parseInt(e.target.value) || 0)}
                        className="w-12 text-center border border-gray-200 rounded-lg py-1 text-sm" />
                      <button onClick={() => cambiar(p, cant + 1)} aria-label="Agregar uno" className="w-7 h-7 rounded-full bg-vida-blue text-white flex items-center justify-center"><Plus size={13} /></button>
                    </div>
                  )}
                </div>
              );
            })}
            {productos.length === 0 && (
              <p className="sm:col-span-2 text-center text-gray-400 py-10 text-sm">
                {q ? 'Ningún producto coincide' : 'VIDA todavía no tiene productos con proveedor y precio de lista'}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-4 h-fit lg:sticky lg:top-6 space-y-3">
        <h3 className="font-bold text-gray-800 flex items-center gap-2"><ShoppingCart size={16} className="text-vida-blue" /> Tu pedido a VIDA</h3>
        {operaMatriz && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Tienda que recibe</label>
            <select value={tienda} onChange={e => setTienda(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              {tiendas.map(t => <option key={t.idPuntoVenta} value={t.idPuntoVenta}>{t.NomComercial}</option>)}
            </select>
          </div>
        )}
        <fieldset>
          <legend className="block text-xs font-semibold text-gray-500 mb-1">¿Cómo lo recibes?</legend>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(MODOS).map(([k, m]) => {
              const Icon = m.icon;
              return (
                <label key={k} className={`cursor-pointer rounded-xl border-2 p-2.5 text-left transition-colors ${modo === k ? 'border-vida-blue bg-vida-blue-light' : 'border-gray-100 hover:border-gray-200'}`}>
                  <input type="radio" name="modo-recepcion" value={k} checked={modo === k} onChange={() => setModo(k)} className="sr-only" />
                  <span className="flex items-center gap-1.5 text-sm font-bold text-gray-800"><Icon size={14} className="text-vida-blue" /> {m.label}</span>
                  <span className="block text-[11px] leading-snug text-gray-500 mt-0.5">{m.desc}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {items.length === 0 ? (
          <p className="text-center text-gray-400 py-6 text-sm">Agrega productos del catálogo</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {items.map(([id, { p, cant }]) => (
              <div key={id} className="flex items-center gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-700 truncate">{p.Nombre}</p>
                  <p className="text-xs text-gray-400">{cant} × {USD(p.PrecioVidaUSD)}</p>
                </div>
                <span className="font-semibold text-gray-800">{USD(p.PrecioVidaUSD * cant)}</span>
                <button onClick={() => cambiar(p, 0)} aria-label={`Quitar ${p.Nombre}`} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
        <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas para VIDA (opcional)" rows={2}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        <div className="flex items-center justify-between border-t border-gray-100 pt-3">
          <span className="text-sm text-gray-500">Total a pagar a VIDA</span>
          <span className="font-black text-vida-blue text-lg">{USD(total)}</span>
        </div>
        {msg && <p className="text-sm text-center font-semibold text-red-600">{msg}</p>}
        <button onClick={pedir} disabled={enviando || !items.length}
          className="w-full flex items-center justify-center gap-2 bg-vida-green text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
          <Send size={15} /> {enviando ? 'Enviando…' : 'Pedir a VIDA'}
        </button>
        <p className="text-[11px] text-gray-400 text-center">Después de pedir, paga a VIDA y reporta la referencia.</p>
      </div>
    </div>
  );
}

// ─── QR del código de retiro ───────────────────────────────────────────────────
function QrRetiro({ codigo }) {
  const [src, setSrc] = useState(null);
  useEffect(() => { QRCode.toDataURL(codigo, { margin: 1, width: 160 }).then(setSrc).catch(() => setSrc(null)); }, [codigo]);
  return (
    <div className="flex items-center gap-3">
      {src && <img src={src} alt={`QR del código ${codigo}`} className="w-24 h-24 rounded-lg border border-gray-100 bg-white" />}
      <div>
        <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Código de retiro</p>
        <p className="font-mono text-lg font-black tracking-widest text-gray-800">{codigo}</p>
        <p className="text-[11px] text-gray-400">Muéstralo al recoger</p>
      </div>
    </div>
  );
}

// ─── Asignar a mano el repartidor de un envío (solo VIDA) ───────────────────────
function AsignarRepartidor({ paq, onAsignado }) {
  const [abierto, setAbierto] = useState(false);
  const [data, setData] = useState(null);     // { PesoKg, SinPeso, repartidores }
  const [cargando, setCarg] = useState(false);
  const [asignando, setAsig] = useState(null); // idRepartidor en curso
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCarg(true); setError('');
    try { setData((await api.get(`/reabasto-vida/paquetes/${paq.idPedidoProveedor}/repartidores`)).data); }
    catch (e) { setError(e.response?.data?.error || 'No se pudieron cargar los repartidores'); }
    finally { setCarg(false); }
  }, [paq.idPedidoProveedor]);

  const abrir = () => { setAbierto(true); if (!data) cargar(); };

  async function asignar(r) {
    if (r.aguanta === false && !window.confirm(`${r.Nombre} declara ${r.CapacidadKg} kg y el pedido pesa ${data.PesoKg} kg. ¿Asignarlo igual?`)) return;
    setAsig(r.idRepartidor); setError('');
    try {
      await api.post(`/reabasto-vida/paquetes/${paq.idPedidoProveedor}/asignar`, { idRepartidor: r.idRepartidor });
      onAsignado?.();
    } catch (e) { setError(e.response?.data?.error || 'No se pudo asignar'); }
    finally { setAsig(null); }
  }

  if (!abierto) {
    return (
      <button onClick={abrir}
        className="w-full flex items-center justify-center gap-2 border border-vida-blue/40 text-vida-blue rounded-xl px-4 py-2 text-sm font-semibold hover:bg-vida-blue-light">
        <UserPlus size={15} /> Asignar repartidor a mano
      </button>
    );
  }
  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-gray-800">Asignar repartidor</p>
        {data?.SinPeso > 0
          ? <span className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle size={12} /> Falta peso de productos</span>
          : data?.PesoKg != null ? <span className="text-xs font-semibold text-gray-500">Pedido: {data.PesoKg} kg</span> : null}
      </div>
      {error && <p className="text-red-600 text-xs bg-red-50 px-2 py-1.5 rounded-lg">{error}</p>}
      {cargando ? (
        <p className="text-sm text-gray-400 py-3 text-center">Cargando…</p>
      ) : !data?.repartidores?.length ? (
        <p className="text-sm text-gray-400 py-3 text-center">No hay repartidores de proveedores aprobados.</p>
      ) : (
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {data.repartidores.map(r => (
            <div key={r.idRepartidor} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
              <Truck size={14} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{r.Nombre}</p>
                <p className="text-xs text-gray-400">
                  {r.Vehiculo || '—'}{r.CapacidadKg != null ? ` · ${r.CapacidadKg} kg` : ' · sin capacidad'}{r.Activas ? ` · ${r.Activas} activas` : ''}
                </p>
              </div>
              {r.aguanta === false && <span className="text-[11px] text-amber-700 font-semibold">No aguanta</span>}
              <button onClick={() => asignar(r)} disabled={asignando === r.idRepartidor}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 ${r.aguanta === false ? 'border border-amber-300 text-amber-700 hover:bg-amber-50' : 'bg-vida-blue text-white hover:opacity-90'}`}>
                {asignando === r.idRepartidor ? '…' : 'Asignar'}
              </button>
            </div>
          ))}
        </div>
      )}
      <button onClick={() => setAbierto(false)} className="text-xs text-gray-400 hover:text-gray-600">Cerrar</button>
    </div>
  );
}

// ─── Un paquete del pedido ─────────────────────────────────────────────────────
function Paquete({ paq, pedido, onRecibido, onCambiado }) {
  const [cant, setCant] = useState(() => Object.fromEntries(paq.lineas.map(l => [l.idDetalle, l.CantidadSolicitada])));
  const [proc, setProc] = useState(false);
  const [error, setError] = useState('');
  const vida = pedido.operaVida;
  const puedeRecibir = pedido.puedeRecibir && paq.Status === 'RETIRADO';
  // VIDA asigna a mano cuando el envío está listo y aún no tiene repartidor.
  const envioVida = vida && pedido.ModoRecepcion === 'ENVIO_VIDA';
  const puedeAsignar = envioVida && !paq.idRepartidor && ['CONFIRMADO', 'LISTO'].includes(paq.Status);

  async function recibir() {
    setProc(true); setError('');
    try {
      const r = await api.post(`/reabasto-vida/paquetes/${paq.idPedidoProveedor}/recibir`, {
        cantidades: Object.entries(cant).map(([idDetalle, c]) => ({ idDetalle: Number(idDetalle), CantidadRecibida: Number(c) || 0 })),
      });
      onRecibido?.(r.data);
    } catch (e) { setError(e.response?.data?.error || 'No se pudo registrar la recepción'); }
    finally { setProc(false); }
  }

  return (
    <div className="border border-gray-100 rounded-2xl p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Package size={15} className="text-vida-blue" />
        <span className="font-bold text-gray-800 text-sm">Paquete {paq.numero}</span>
        <Badge cfg={STATUS_PAQUETE} status={paq.Status} />
        <span className="ml-auto text-sm font-semibold text-gray-700">{USD(paq.TotalUSD)}</span>
      </div>
      {vida && (
        <div className="text-xs bg-purple-50 text-purple-800 rounded-xl px-3 py-2 space-y-0.5">
          <p><b>Solo VIDA:</b> {paq.NombreProveedor} · folio {paq.Folio} · por {paq.CanalEnvio === 'API' ? 'API' : 'Portal'}</p>
          <p>VIDA le paga {USD(paq.TotalPagarUSD)} (comisión {Number(paq.ComisionPct)} %)</p>
          {paq.EnvioApiResultado && <p>API: {paq.EnvioApiResultado}</p>}
          {paq.NotasProveedor && <p>Nota del proveedor: {paq.NotasProveedor}</p>}
        </div>
      )}
      {envioVida && paq.idRepartidor && (
        <p className="text-xs text-gray-600 flex items-center gap-1.5 bg-gray-50 rounded-xl px-3 py-2">
          <UserCheck size={14} className="text-vida-green shrink-0" /> Repartidor: <b className="text-gray-800">{paq.NombreRepartidor || `#${paq.idRepartidor}`}</b>
        </p>
      )}
      {puedeAsignar && <AsignarRepartidor paq={paq} onAsignado={onCambiado} />}
      {paq.retiro && paq.Status !== 'RECIBIDO' && (
        <div className="bg-gray-50 rounded-xl p-3 space-y-2">
          {pedido.ModoRecepcion === 'RECOJO' ? (
            <>
              <p className="text-xs font-semibold text-gray-500">Punto de retiro</p>
              {paq.retiro.Direccion
                ? <p className="text-sm text-gray-700 flex gap-1.5"><MapPin size={14} className="text-vida-blue shrink-0 mt-0.5" /> {paq.retiro.Direccion}</p>
                : <p className="text-sm text-amber-700">VIDA te confirmará la dirección de retiro.</p>}
              {paq.retiro.Horario && <p className="text-xs text-gray-500 flex gap-1.5"><Clock size={13} className="shrink-0" /> {paq.retiro.Horario}</p>}
            </>
          ) : (
            <p className="text-xs text-gray-500">Código para el repartidor de VIDA (lo valida el proveedor al entregarle):</p>
          )}
          <QrRetiro codigo={paq.retiro.CodigoRetiro} />
        </div>
      )}
      <div className="space-y-1.5">
        {paq.lineas.map(l => (
          <div key={l.idDetalle} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{l.NombreProducto}</p>
              <p className="text-xs text-gray-400">Pedido: {Number(l.CantidadSolicitada)} · {USD(l.PrecioTiendaUnitario)} c/u</p>
            </div>
            {puedeRecibir ? (
              <input type="number" min="0" max={l.CantidadSolicitada} value={cant[l.idDetalle] ?? ''} aria-label={`Cantidad recibida de ${l.NombreProducto}`}
                onChange={e => setCant(c => ({ ...c, [l.idDetalle]: e.target.value }))}
                className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center" />
            ) : paq.Status === 'RECIBIDO' ? (
              <span className="text-sm font-bold text-gray-700">Llegó: {Number(l.CantidadRecibida)}</span>
            ) : null}
          </div>
        ))}
      </div>
      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      {puedeRecibir && (
        <button onClick={recibir} disabled={proc}
          className="w-full flex items-center justify-center gap-2 bg-vida-blue text-white rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
          <Check size={15} /> Confirmar lo que llegó
        </button>
      )}
    </div>
  );
}

// ─── Detalle de un pedido a VIDA ──────────────────────────────────────────────
export function ModalPedidoVida({ idPedidoMatriz, onClose, onCambiado, recargarSenal }) {
  const [ped, setPed] = useState(null);
  const [cargando, setCarg] = useState(true);
  const [proc, setProc] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [metodo, setMetodo] = useState('PAGO_MOVIL');
  const [ref, setRef] = useState('');
  const [motivo, setMotivo] = useState('');

  const cargar = useCallback(async () => {
    setCarg(true);
    try { setPed((await api.get(`/reabasto-vida/pedidos/${idPedidoMatriz}`)).data); }
    catch { setPed(null); }
    finally { setCarg(false); }
  }, [idPedidoMatriz]);
  useEffect(() => { cargar(); }, [cargar]);
  // Recarga en vivo cuando llega un evento del despacho (envío recogido/entregado).
  useEffect(() => { if (recargarSenal) cargar(); }, [recargarSenal, cargar]);

  async function accion(ruta, body, okMsg) {
    setProc(true); setError(''); setAviso('');
    try {
      const r = await api.post(`/reabasto-vida/pedidos/${idPedidoMatriz}/${ruta}`, body);
      if (okMsg) setAviso(typeof okMsg === 'function' ? okMsg(r.data) : okMsg);
      onCambiado?.(); await cargar();
    } catch (e) { setError(e.response?.data?.error || 'No se pudo completar'); }
    finally { setProc(false); }
  }

  const esTienda = ped && ped.puedeRecibir && !ped.operaVida;
  const puedeCancelar = ped && (ped.operaVida
    ? ['POR_PAGAR', 'PAGO_REPORTADO', 'EN_PROCESO'].includes(ped.Status)
    : ['POR_PAGAR', 'PAGO_REPORTADO'].includes(ped.Status));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label={`Pedido a VIDA ${idPedidoMatriz}`}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b gap-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h3 className="font-bold text-gray-800">Pedido a VIDA #{idPedidoMatriz}</h3>
            {ped && <BadgeVida status={ped.Status} />}
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        {cargando && !ped ? <Spinner /> : !ped ? (
          <p className="text-center text-gray-400 py-16 text-sm">No se pudo cargar</p>
        ) : (
          <div className="overflow-y-auto flex-1 p-5 space-y-4">
            {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            {aviso && <p className="text-green-700 text-sm bg-green-50 px-3 py-2 rounded-lg">{aviso}</p>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
              <span className="inline-flex items-center gap-1"><Store size={14} className="text-gray-400" /> {ped.NombreTienda}</span>
              <span className="inline-flex items-center gap-1">{ped.ModoRecepcion === 'RECOJO' ? <MapPin size={14} className="text-gray-400" /> : <Truck size={14} className="text-gray-400" />} {MODOS[ped.ModoRecepcion]?.label}</span>
              <span className="ml-auto font-black text-vida-blue">{USD(ped.TotalUSD)}</span>
            </div>

            {/* Pago a VIDA */}
            {ped.Status === 'POR_PAGAR' && ped.puedeRecibir && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                <p className="font-bold text-amber-900 flex items-center gap-2"><CreditCard size={16} /> Paga {USD(ped.TotalUSD)} a VIDA</p>
                {ped.datosPago
                  ? <p className="text-sm text-amber-900 whitespace-pre-line bg-white/70 rounded-xl px-3 py-2">{ped.datosPago}</p>
                  : <p className="text-sm text-amber-800">Pídele a VIDA sus datos de Pago Móvil o transferencia.</p>}
                <div className="grid sm:grid-cols-[auto,1fr] gap-2">
                  <select value={metodo} onChange={e => setMetodo(e.target.value)} aria-label="Forma de pago" className="border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="PAGO_MOVIL">Pago Móvil</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                  </select>
                  <input value={ref} onChange={e => setRef(e.target.value)} placeholder="Número de referencia" aria-label="Número de referencia"
                    className="border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white" />
                </div>
                <button disabled={proc || ref.trim().length < 4} onClick={() => accion('pago', { Metodo: metodo, Referencia: ref.trim() }, 'Listo: VIDA revisará tu pago.')}
                  className="w-full bg-vida-blue text-white rounded-xl py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">Reportar pago</button>
              </div>
            )}
            {ped.Status === 'PAGO_REPORTADO' && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                <p className="text-sm text-blue-900">
                  Pago reportado: <b>{ped.PagoMetodo === 'TRANSFERENCIA' ? 'Transferencia' : 'Pago Móvil'}</b> · ref. <b className="font-mono">{ped.PagoReferencia}</b> · {FECHA(ped.PagoFecha)}
                </p>
                {ped.operaVida ? (
                  <>
                    <p className="text-xs text-blue-800">Revisa que llegó {USD(ped.TotalUSD)} a la cuenta de VIDA. Al aprobar, el pedido se manda a los proveedores.</p>
                    <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo si lo rechazas" aria-label="Motivo del rechazo"
                      className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white" />
                    <div className="flex flex-wrap gap-2 justify-end">
                      <button disabled={proc || !motivo.trim()} onClick={() => accion('validar-pago', { aprobar: false, Notas: motivo.trim() }, 'Pago rechazado; la tienda debe reportarlo de nuevo.')}
                        className="border border-red-200 text-red-600 rounded-xl px-4 py-2 text-sm hover:bg-red-50 disabled:opacity-50">Rechazar</button>
                      <button disabled={proc} onClick={() => accion('validar-pago', { aprobar: true }, 'Pago aprobado: el pedido ya está con los proveedores.')}
                        className="flex items-center gap-2 bg-vida-green text-white rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                        <ShieldCheck size={15} /> Aprobar pago
                      </button>
                    </div>
                  </>
                ) : <p className="text-xs text-blue-800">VIDA está revisando tu pago. Te avisamos aquí cuando lo apruebe.</p>}
              </div>
            )}

            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-gray-500 uppercase">Paquetes</h4>
              {esTienda && ped.paquetes.length > 1 && ped.Status === 'EN_PROCESO' && (
                <p className="text-xs text-gray-500">Tu pedido llega en {ped.paquetes.length} paquetes; recibe cada uno cuando llegue.</p>
              )}
              {ped.paquetes.map(p => (
                <Paquete key={p.idPedidoProveedor} paq={p} pedido={ped}
                  onCambiado={() => { onCambiado?.(); cargar(); }}
                  onRecibido={(r) => { setAviso(r.faltanteUSD > 0 ? `Recibido. Faltó mercancía por ${USD(r.faltanteUSD)}: VIDA te debe ese saldo.` : 'Recibido: ya está en tu inventario.'); onCambiado?.(); cargar(); }} />
              ))}
            </div>

            {ped.historial?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Seguimiento</h4>
                <div className="space-y-1">
                  {ped.historial.map((h, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <BadgeVida status={h.StatusNuevo} />
                      {h.Notas && <span className="text-gray-400">— {h.Notas}</span>}
                      <span className="text-gray-300 ml-auto">{FECHA(h.FechaAlta)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {puedeCancelar && (
              <div className="flex justify-end pt-1">
                <button disabled={proc} onClick={() => { if (window.confirm('¿Cancelar este pedido a VIDA?')) accion('cancelar', {}, (r) => r.reembolsoPendiente ? 'Cancelado. Ya estaba pagado: VIDA debe devolver el dinero.' : 'Pedido cancelado.'); }}
                  className="flex items-center gap-1.5 border border-red-200 text-red-600 rounded-xl px-4 py-2 text-sm hover:bg-red-50 disabled:opacity-50">
                  <Ban size={14} /> Cancelar pedido
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
