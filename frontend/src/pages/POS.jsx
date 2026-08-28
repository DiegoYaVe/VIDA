// src/pages/POS.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { useHeartbeat } from '../hooks/useHeartbeat.js';
import api from '../services/api.js';
import { addToQueue, buscarEnCatalogo, genUUID } from '../services/offlineQueue.js';
import { startSyncEngine, syncNow } from '../services/syncEngine.js';
import SyncStatusBar from '../components/SyncStatusBar.jsx';
import {
  Search, Plus, Minus, Trash2, ShoppingCart, CreditCard,
  DollarSign, Layers, Check, X,
  Barcode, ChevronDown, Printer, RotateCcw,
} from 'lucide-react';

// ── Métodos de pago (solo USD) ───────────────────────────────────────────────
const METODOS_PAGO = [
  { key: 'EFECTIVO',  label: 'Efectivo',      icon: DollarSign, color: 'bg-green-500'  },
  { key: 'TARJETA',   label: 'Tarjeta',        icon: CreditCard, color: 'bg-blue-600'   },
  { key: 'MIXTO',     label: 'Efectivo+Tarjeta', icon: Layers,   color: 'bg-purple-500' },
];

// ── Ticket de venta ─────────────────────────────────────────────────────────
function Ticket({ venta, onCerrar }) {
  const handlePrint = () => window.print();
  const { pago } = venta; // { metodo, efectivo, tarjeta, cambio }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="p-6 text-center border-b">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Check size={24} className="text-green-600"/>
          </div>
          <h3 className="font-bold text-gray-800 text-lg">
            {venta.offline ? 'Venta guardada (sin conexión)' : '¡Venta completada!'}
          </h3>
          <p className="text-gray-400 text-sm mt-1">
            {venta.offline
              ? `Ref. ${venta.refOffline} — se sincronizará al volver la conexión`
              : `Pedido #${venta.idPedido}`}
          </p>
        </div>

        {/* Ticket imprimible */}
        <div id="ticket-imprimible" className="p-6 font-mono text-sm">
          <p className="text-center font-bold text-lg mb-1">VenezPOS</p>
          <p className="text-center text-gray-400 text-xs mb-4">{new Date().toLocaleString()}</p>
          <div className="border-t border-dashed border-gray-300 my-2"/>

          {venta.items.map((item, i) => (
            <div key={i} className="flex justify-between mb-1 gap-2">
              <span className="flex-1 truncate">{item.NombreProducto}</span>
              <span className="shrink-0">{item.Cantidad}×${item.PrecioUnitario.toFixed(2)}</span>
            </div>
          ))}

          <div className="border-t border-dashed border-gray-300 my-2"/>
          <div className="flex justify-between font-bold text-base mb-2">
            <span>TOTAL</span>
            <span>${venta.total.toFixed(2)}</span>
          </div>

          {/* Desglose de pago */}
          <div className="border-t border-dashed border-gray-300 my-2"/>
          {pago.metodo === 'EFECTIVO' && (
            <>
              <div className="flex justify-between text-xs">
                <span>Efectivo recibido</span>
                <span>${pago.efectivo.toFixed(2)}</span>
              </div>
              {pago.cambio > 0 && (
                <div className="flex justify-between text-xs font-bold text-green-600">
                  <span>Cambio</span>
                  <span>${pago.cambio.toFixed(2)}</span>
                </div>
              )}
            </>
          )}
          {pago.metodo === 'TARJETA' && (
            <div className="flex justify-between text-xs">
              <span>Tarjeta</span>
              <span>${venta.total.toFixed(2)}</span>
            </div>
          )}
          {pago.metodo === 'MIXTO' && (
            <>
              <div className="flex justify-between text-xs">
                <span>Efectivo</span>
                <span>${pago.efectivo.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Tarjeta</span>
                <span>${pago.tarjeta.toFixed(2)}</span>
              </div>
              {pago.cambio > 0 && (
                <div className="flex justify-between text-xs font-bold text-green-600">
                  <span>Cambio</span>
                  <span>${pago.cambio.toFixed(2)}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t">
          <button onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm hover:bg-gray-50">
            <Printer size={16}/> Imprimir
          </button>
          <button onClick={onCerrar}
            className="flex-1 bg-vida-blue text-white rounded-xl py-2.5 text-sm font-bold hover:opacity-90">
            Nueva venta
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal de pago ───────────────────────────────────────────────────────────
function ModalPago({ total, onConfirmar, onCerrar, procesando }) {
  const [metodo,   setMetodo]   = useState('EFECTIVO');
  const [efectivo, setEfectivo] = useState('');  // monto en cash que entrega el cliente
  const [tarjeta,  setTarjeta]  = useState('');  // monto en tarjeta (MIXTO)
  const [error,    setError]    = useState('');

  const efectivoNum = parseFloat(efectivo) || 0;
  const tarjetaNum  = parseFloat(tarjeta)  || 0;

  // ── Cálculos según método ──────────────────────────────────────────────
  // EFECTIVO: el cliente entrega X, nosotros devolvemos X - total
  const cambioEfectivo = metodo === 'EFECTIVO' && efectivoNum > 0
    ? efectivoNum - total
    : null;

  // MIXTO: el cajero ingresa cuánto paga en tarjeta,
  // el resto se asume efectivo; o viceversa.
  // Usamos el campo "efectivo" para ingresar el monto en cash,
  // y "tarjeta" para el monto en tarjeta. Los dos se calculan mutuamente.
  const tarjetaAutoMixto  = metodo === 'MIXTO' && efectivoNum > 0
    ? Math.max(0, total - efectivoNum)
    : null;
  const efectivoAutoMixto = metodo === 'MIXTO' && tarjetaNum > 0 && !efectivoNum
    ? Math.max(0, total - tarjetaNum)
    : null;

  const efectivoFinalMixto = efectivoNum || efectivoAutoMixto || 0;
  const tarjetaFinalMixto  = tarjetaNum  || tarjetaAutoMixto  || 0;
  const totalCubierto      = metodo === 'MIXTO' ? efectivoFinalMixto + tarjetaFinalMixto : 0;
  const cambioMixto        = metodo === 'MIXTO' && totalCubierto > total
    ? totalCubierto - total
    : null;
  const faltaMixto         = metodo === 'MIXTO' && totalCubierto < total && totalCubierto > 0
    ? total - totalCubierto
    : null;

  function cambiarMetodo(m) {
    setMetodo(m); setEfectivo(''); setTarjeta(''); setError('');
  }

  function handleConfirmar() {
    if (metodo === 'EFECTIVO') {
      if (efectivoNum > 0 && efectivoNum < total) {
        setError('El efectivo recibido es menor al total'); return;
      }
      onConfirmar({
        metodo,
        efectivo: efectivoNum > 0 ? efectivoNum : total,
        tarjeta:  0,
        cambio:   efectivoNum > 0 ? Math.max(0, efectivoNum - total) : 0,
      });
    } else if (metodo === 'TARJETA') {
      onConfirmar({ metodo, efectivo: 0, tarjeta: total, cambio: 0 });
    } else {
      // MIXTO
      if (totalCubierto < total) {
        setError(`Falta $${(total - totalCubierto).toFixed(2)} por cubrir`); return;
      }
      onConfirmar({
        metodo,
        efectivo: efectivoFinalMixto,
        tarjeta:  tarjetaFinalMixto,
        cambio:   Math.max(0, totalCubierto - total),
      });
    }
  }

  // Atajos de monto exacto / billetes comunes
  const billetesUSD = [1, 5, 10, 20, 50, 100].filter(b => b >= total);
  const atajosEfectivo = billetesUSD.slice(0, 4);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-bold text-gray-800 text-lg">Cobrar venta</h3>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </div>

        <div className="p-5 space-y-4">

          {/* Total destacado */}
          <div className="rounded-2xl p-4 text-center" style={{ background: 'linear-gradient(135deg, #0A1E3F15, #5BBE6A15)' }}>
            <p className="text-xs text-gray-500 mb-1 font-medium">Total a cobrar</p>
            <p className="text-5xl font-black text-vida-blue">${total.toFixed(2)}</p>
            <p className="text-xs text-gray-400 mt-1">USD</p>
          </div>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 px-3 py-2 rounded-xl">
              {error}
            </p>
          )}

          {/* Selector de método */}
          <div>
            <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Método de pago</p>
            <div className="grid grid-cols-3 gap-2">
              {METODOS_PAGO.map(m => {
                const Icon = m.icon;
                const activo = metodo === m.key;
                return (
                  <button key={m.key} onClick={() => cambiarMetodo(m.key)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-bold transition-all ${
                      activo
                        ? 'border-vida-blue bg-blue-50 text-vida-blue'
                        : 'border-gray-100 text-gray-500 hover:border-gray-200 hover:bg-gray-50'
                    }`}>
                    <Icon size={20}/>
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── EFECTIVO ─────────────────────────────────────────── */}
          {metodo === 'EFECTIVO' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">
                  Efectivo recibido <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={efectivo}
                    onChange={e => { setEfectivo(e.target.value); setError(''); }}
                    placeholder={total.toFixed(2)}
                    className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-vida-blue text-right font-mono text-lg"
                    autoFocus
                  />
                </div>
                {/* Atajos de billetes */}
                {atajosEfectivo.length > 0 && (
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    <button onClick={() => setEfectivo(total.toFixed(2))}
                      className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold text-gray-600 transition">
                      Exacto
                    </button>
                    {atajosEfectivo.map(b => (
                      <button key={b} onClick={() => setEfectivo(String(b))}
                        className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold text-gray-600 transition">
                        ${b}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Cambio */}
              {cambioEfectivo !== null && (
                <div className={`rounded-xl p-3 flex items-center justify-between ${
                  cambioEfectivo >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                }`}>
                  <span className={`text-sm font-bold ${cambioEfectivo >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {cambioEfectivo >= 0 ? 'Cambio a devolver' : 'Monto insuficiente'}
                  </span>
                  <span className={`text-2xl font-black ${cambioEfectivo >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    ${Math.abs(cambioEfectivo).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── TARJETA ──────────────────────────────────────────── */}
          {metodo === 'TARJETA' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
              <CreditCard size={28} className="text-blue-500 mx-auto mb-2"/>
              <p className="text-sm font-bold text-blue-700">Cobrar ${total.toFixed(2)} en tarjeta</p>
              <p className="text-xs text-blue-400 mt-1">Procesa el pago en el terminal y luego confirma</p>
            </div>
          )}

          {/* ── MIXTO ────────────────────────────────────────────── */}
          {metodo === 'MIXTO' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 flex items-center gap-1">
                    <DollarSign size={12}/> Efectivo
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">$</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={efectivo}
                      onChange={e => { setEfectivo(e.target.value); setTarjeta(''); setError(''); }}
                      placeholder="0.00"
                      className="w-full pl-6 pr-2 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400 text-right font-mono"
                      autoFocus
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1 flex items-center gap-1">
                    <CreditCard size={12}/> Tarjeta
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">$</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={tarjeta}
                      onChange={e => { setTarjeta(e.target.value); setEfectivo(''); setError(''); }}
                      placeholder="0.00"
                      className="w-full pl-6 pr-2 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-right font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Resumen mixto */}
              {(efectivoFinalMixto > 0 || tarjetaFinalMixto > 0) && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Efectivo</span>
                    <span className="font-mono">${efectivoFinalMixto.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Tarjeta</span>
                    <span className="font-mono">${tarjetaFinalMixto.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-gray-200 pt-1.5 flex justify-between font-bold">
                    <span>Total cubierto</span>
                    <span className={`font-mono ${totalCubierto >= total ? 'text-green-600' : 'text-red-500'}`}>
                      ${totalCubierto.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Cambio / falta */}
              {cambioMixto !== null && cambioMixto > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-green-700">Cambio a devolver</span>
                  <span className="text-2xl font-black text-green-600">${cambioMixto.toFixed(2)}</span>
                </div>
              )}
              {faltaMixto !== null && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-yellow-700">Aún falta</span>
                  <span className="text-xl font-black text-yellow-600">${faltaMixto.toFixed(2)}</span>
                </div>
              )}
              <p className="text-xs text-gray-400 text-center">
                Ingresa el monto en efectivo y la tarjeta se calcula sola, o viceversa
              </p>
            </div>
          )}

        </div>

        {/* Botones */}
        <div className="flex gap-2 p-5 border-t">
          <button onClick={onCerrar}
            className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-semibold hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={handleConfirmar} disabled={procesando}
            className="flex-[2] text-white rounded-xl px-6 py-3 text-sm font-black hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #54C4E0, #5BBE6A)' }}>
            <Check size={18}/>
            {procesando ? 'Procesando...' : 'Confirmar cobro'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PANTALLA POS PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════
export default function POS() {
  const { usuario } = useAuthStore();

  // Heartbeat: notifica al servidor que esta sucursal está online
  useHeartbeat(true);

  // Motor de sincronización offline: recupera ventas pendientes de sesiones
  // anteriores y refresca el catálogo local para búsqueda sin red
  useEffect(() => { startSyncEngine(); }, []);

  // Búsqueda y catálogo
  const [busqueda, setBusqueda]         = useState('');
  const [productos, setProductos]       = useState([]);
  const [buscando, setBuscando]         = useState(false);
  const [puntos, setPuntos]             = useState([]);
  const [idPuntoVenta, setIdPuntoVenta] = useState(usuario?.idPuntoVenta || '');

  // Carrito
  const [carrito, setCarrito] = useState([]);

  // Modales
  const [modalPago,  setModalPago]  = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [ticket,       setTicket]       = useState(null);
  const [error,        setError]        = useState('');

  const searchRef    = useRef(null);
  const busquedaTimer = useRef(null);

  // Cargar puntos de venta
  useEffect(() => {
    api.get('/sucursales/puntos-venta').then(r => {
      setPuntos(r.data);
      if (!idPuntoVenta && r.data.length > 0) setIdPuntoVenta(r.data[0].idPuntoVenta);
    }).catch(() => {});
  }, []);

  // Carga de productos con debounce. Con el buscador vacío muestra el catálogo
  // de la tienda por defecto (para poder ver los productos sin escribir); al
  // escribir, filtra. Sin red usa el catálogo cacheado en IndexedDB.
  useEffect(() => {
    clearTimeout(busquedaTimer.current);
    const q = busqueda.trim();
    busquedaTimer.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await api.get('/inventario/productos', {
          params: { search: q, limit: 50, page: 1 },
        });
        setProductos(r.data.data || []);
      } catch {
        const locales = await buscarEnCatalogo(q, 50);
        setProductos(locales);
      } finally {
        setBuscando(false);
      }
    }, q ? 300 : 0);
    return () => clearTimeout(busquedaTimer.current);
  }, [busqueda]);

  // ── Carrito ──────────────────────────────────────────────────────────────
  function agregarAlCarrito(producto) {
    setCarrito(prev => {
      const existe = prev.find(i => i.idProducto === producto.idProducto);
      if (existe) {
        return prev.map(i => i.idProducto === producto.idProducto
          ? { ...i, Cantidad: i.Cantidad + 1 }
          : i
        );
      }
      return [...prev, {
        idProducto:    producto.idProducto,
        NombreProducto: producto.Nombre,
        SKU:           producto.SKU,
        PrecioUnitario: parseFloat(producto.PrecioUSD) || 0,
        Cantidad:      1,
      }];
    });
    setBusqueda('');
    setProductos([]);
    searchRef.current?.focus();
  }

  function cambiarCantidad(idProducto, delta) {
    setCarrito(prev => prev
      .map(i => i.idProducto === idProducto ? { ...i, Cantidad: Math.max(0, i.Cantidad + delta) } : i)
      .filter(i => i.Cantidad > 0)
    );
  }

  function editarPrecio(idProducto, nuevoPrecio) {
    setCarrito(prev => prev.map(i =>
      i.idProducto === idProducto ? { ...i, PrecioUnitario: parseFloat(nuevoPrecio) || 0 } : i
    ));
  }

  function quitarDelCarrito(idProducto) {
    setCarrito(prev => prev.filter(i => i.idProducto !== idProducto));
  }

  function limpiarCarrito() {
    if (carrito.length === 0) return;
    if (!confirm('¿Limpiar el carrito?')) return;
    setCarrito([]);
  }

  const total = carrito.reduce((s, i) => s + i.Cantidad * i.PrecioUnitario, 0);

  // ── Confirmar venta ──────────────────────────────────────────────────────
  // pagoInfo: { metodo, efectivo, tarjeta, cambio }
  // Patrón offline-first: la venta SIEMPRE se guarda primero en IndexedDB con
  // un UUID y se sincroniza vía /pedidos/sync (idempotente, crea y entrega en
  // una sola transacción). Con red sincroniza al instante; sin red queda en
  // cola y el motor la envía cuando vuelva la conexión.
  async function confirmarVenta(pagoInfo) {
    if (!idPuntoVenta) { setError('Selecciona una tienda'); return; }
    if (carrito.length === 0) return;
    setProcesando(true); setError('');

    const clienteUUID = genUUID();
    const venta = {
      ClienteUUID:   clienteUUID,
      idPuntoVenta:  parseInt(idPuntoVenta),
      MetodoPago:    pagoInfo.metodo,
      MontoEfectivo: pagoInfo.efectivo || null,
      MontoTarjeta:  pagoInfo.tarjeta  || null,
      MontoCambio:   pagoInfo.cambio   || null,
      FechaVenta:    new Date().toISOString(),
      items: carrito.map(i => ({
        idProducto:     i.idProducto,
        Cantidad:       i.Cantidad,
        PrecioUnitario: i.PrecioUnitario,
      })),
    };

    try {
      await addToQueue(venta);
      const resultado = await syncNow();

      const sincronizada = resultado?.synced?.find(s => s.ClienteUUID === clienteUUID);
      const rechazada    = resultado?.failed?.find(f => f.ClienteUUID === clienteUUID);

      if (rechazada) {
        // El servidor la rechazó por datos inválidos — no es un problema de red
        setError(rechazada.motivo || 'Error al procesar la venta');
        setModalPago(false);
        return;
      }

      setTicket({
        idPedido:   sincronizada?.idPedido ?? null,
        offline:    !sincronizada,
        refOffline: clienteUUID.slice(-8).toUpperCase(),
        items:      carrito,
        total,
        pago:       pagoInfo,
      });
      setModalPago(false);
      setCarrito([]);
    } catch (err) {
      setError('Error al guardar la venta: ' + (err.message || 'desconocido'));
      setModalPago(false);
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-vida-gray">

      {/* ── Panel izquierdo: búsqueda y catálogo ── */}
      <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">

        {/* Barra superior */}
        <div className="flex gap-2 items-center">
          {/* Estado de conexión y sincronización */}
          <SyncStatusBar />

          {/* Punto de venta */}
          {puntos.length > 1 && (
            <div className="relative">
              <select value={idPuntoVenta} onChange={e => setIdPuntoVenta(e.target.value)}
                className="appearance-none bg-white border border-gray-200 rounded-xl pl-3 pr-8 py-2.5 text-sm font-semibold text-gray-700">
                {puntos.map(p => (
                  <option key={p.idPuntoVenta} value={p.idPuntoVenta}>
                    {p.NomComercial || p.Nombre}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
            </div>
          )}

          {/* Búsqueda */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"/>
            <Barcode size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-300"/>
            <input
              ref={searchRef}
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, SKU o código de barras..."
              className="w-full pl-10 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-vida-blue"
              autoFocus
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 px-4 py-2.5 rounded-xl text-sm flex items-center gap-2">
            <X size={14}/> {error}
          </div>
        )}

        {/* Catálogo de la tienda / resultados de búsqueda */}
        {buscando && productos.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-400 text-sm">Cargando productos…</p>
          </div>
        ) : productos.length > 0 ? (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden flex-1">
            <div className="overflow-y-auto h-full divide-y divide-gray-50">
              {productos.map(p => {
                const stock = p.StockDisponible ?? p.StockTotal;
                return (
                  <button key={p.idProducto} onClick={() => agregarAlCarrito(p)}
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-vida-blue-light transition-colors text-left">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 truncate">{p.Nombre}</p>
                      <p className="text-xs text-gray-400 mt-0.5">SKU: {p.SKU} · {p.UnidadMedida}</p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="font-bold text-vida-blue text-lg">${parseFloat(p.PrecioUSD).toFixed(2)}</p>
                      <p className={`text-xs ${Number(stock) > 0 ? 'text-gray-400' : 'text-red-400'}`}>Stock: {stock ?? '–'}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Sin productos */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-300">
              <Search size={56} className="mx-auto mb-4 opacity-30"/>
              <p className="text-gray-400 font-medium">
                {busqueda.trim() ? `Sin resultados para "${busqueda}"` : 'No hay productos en esta tienda'}
              </p>
              <p className="text-gray-300 text-sm mt-1">Busca por nombre, SKU o código de barras</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Panel derecho: carrito y cobro ── */}
      <div className="w-96 bg-white flex flex-col shadow-xl">

        {/* Header carrito */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <ShoppingCart size={20} className="text-vida-blue"/>
            <span className="font-bold text-gray-800">Carrito</span>
            {carrito.length > 0 && (
              <span className="bg-vida-blue text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {carrito.length}
              </span>
            )}
          </div>
          {carrito.length > 0 && (
            <button onClick={limpiarCarrito}
              className="text-gray-300 hover:text-red-400 transition-colors">
              <RotateCcw size={16}/>
            </button>
          )}
        </div>

        {/* Items del carrito */}
        <div className="flex-1 overflow-y-auto">
          {carrito.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-300">
                <ShoppingCart size={40} className="mx-auto mb-2 opacity-30"/>
                <p className="text-sm">El carrito está vacío</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {carrito.map(item => (
                <div key={item.idProducto} className="px-5 py-3.5">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="font-semibold text-gray-800 text-sm leading-tight truncate">
                        {item.NombreProducto}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.SKU}</p>
                    </div>
                    <button onClick={() => quitarDelCarrito(item.idProducto)}
                      className="text-gray-200 hover:text-red-400 shrink-0 mt-0.5">
                      <Trash2 size={14}/>
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    {/* Cantidad */}
                    <div className="flex items-center gap-2">
                      <button onClick={() => cambiarCantidad(item.idProducto, -1)}
                        className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
                        <Minus size={12}/>
                      </button>
                      <span className="w-8 text-center font-bold text-gray-800 text-sm">{item.Cantidad}</span>
                      <button onClick={() => cambiarCantidad(item.idProducto, 1)}
                        className="w-7 h-7 rounded-lg bg-vida-blue-light hover:bg-vida-blue text-vida-blue hover:text-white flex items-center justify-center transition-colors">
                        <Plus size={12}/>
                      </button>
                    </div>

                    {/* Precio editable */}
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 text-sm">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.PrecioUnitario}
                        onChange={e => editarPrecio(item.idProducto, e.target.value)}
                        className="w-20 text-right font-bold text-vida-blue text-sm border-b border-transparent hover:border-gray-200 focus:border-vida-blue focus:outline-none py-0.5"
                      />
                    </div>
                  </div>

                  {/* Subtotal */}
                  <div className="text-right mt-1">
                    <span className="text-xs text-gray-400">
                      Subtotal: ${(item.Cantidad * item.PrecioUnitario).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer: total y cobrar */}
        <div className="border-t bg-white">
          {/* Desglose */}
          <div className="px-5 pt-4 pb-2 space-y-1.5">
            <div className="flex justify-between text-sm text-gray-500">
              <span>{carrito.reduce((s, i) => s + i.Cantidad, 0)} producto(s)</span>
              <span>${total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-black text-xl text-gray-900">
              <span>Total</span>
              <span className="text-vida-blue">${total.toFixed(2)}</span>
            </div>
          </div>

          {/* Botones método rápido (solo Efectivo y Tarjeta — sin modal) */}
          <div className="px-4 pb-2 grid grid-cols-2 gap-1.5">
            {METODOS_PAGO.filter(m => m.key !== 'MIXTO').map(m => {
              const Icon = m.icon;
              return (
                <button key={m.key}
                  disabled={carrito.length === 0 || procesando}
                  onClick={() => confirmarVenta({
                    metodo:   m.key,
                    efectivo: m.key === 'EFECTIVO' ? total : 0,
                    tarjeta:  m.key === 'TARJETA'  ? total : 0,
                    cambio:   0,
                  })}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-30 hover:opacity-90 transition-opacity ${m.color}`}>
                  <Icon size={14}/>
                  {m.label} (exacto)
                </button>
              );
            })}
          </div>

          {/* Botón principal cobrar */}
          <div className="px-4 pb-4">
            <button
              disabled={carrito.length === 0 || procesando}
              onClick={() => { setError(''); setModalPago(true); }}
              className="w-full bg-vida-green text-white rounded-2xl py-4 font-black text-lg hover:opacity-90 disabled:opacity-30 transition-opacity flex items-center justify-center gap-2">
              <CreditCard size={22}/>
              Cobrar ${total.toFixed(2)}
            </button>
          </div>
        </div>
      </div>

      {/* Modal de pago */}
      {modalPago && (
        <ModalPago
          total={total}
          procesando={procesando}
          onConfirmar={confirmarVenta}
          onCerrar={() => setModalPago(false)}
        />
      )}

      {/* Ticket post-venta */}
      {ticket && (
        <Ticket
          venta={ticket}
          onCerrar={() => { setTicket(null); searchRef.current?.focus(); }}
        />
      )}

    </div>
  );
}
