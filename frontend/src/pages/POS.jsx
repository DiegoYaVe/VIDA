import ModalPagoMoneda from '../components/ModalPagoMoneda.jsx';
import ResumenMoneda from '../components/ResumenMoneda.jsx';
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
  Barcode, ChevronDown, Printer, RotateCcw, Tag, AlertTriangle,
} from 'lucide-react';
import { Link } from 'react-router-dom';

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
            {venta.revision ? 'Venta pendiente de revisión' : venta.offline ? 'Venta guardada (pendiente de sincronizar)' : '¡Venta completada!'}
          </h3>
          {venta.revision && <p role="alert" className="text-red-600 text-xs">{venta.revision}. No vuelvas a cobrar esta venta.</p>}
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

          <ResumenMoneda datos={venta.pago.resumen} />
          {venta.pago.resumen && <p className="text-xs">Desglose equivalente en USD:</p>}
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
  const [turnoAbierto, setTurnoAbierto] = useState(null); // null=cargando, true/false

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

  // Verificar si hay turno de caja abierto para la tienda seleccionada.
  // Las ventas POS quedan sueltas (fuera de un arqueo) si no hay turno; se avisa.
  useEffect(() => {
    if (!idPuntoVenta) { setTurnoAbierto(null); return; }
    let vivo = true;
    api.get('/caja/turno-activo', { params: { idPuntoVenta } })
      .then(r => { if (vivo) setTurnoAbierto(!!r.data?.turno); })
      .catch(() => { if (vivo) setTurnoAbierto(null); });
    return () => { vivo = false; };
  }, [idPuntoVenta, ticket]); // re-checa tras cada venta

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
    // No vaciamos la lista: al limpiar el buscador se mantiene visible el
    // catálogo de la tienda para poder seguir agregando productos. (Si había
    // una búsqueda escrita, al limpiarla el efecto recarga el catálogo.)
    setBusqueda('');
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

  // ── Cupón ────────────────────────────────────────────────────────────────
  const [cuponInput, setCuponInput]   = useState('');
  const [cuponCodigo, setCuponCodigo] = useState(null);
  const [descuentoCupon, setDescuentoCupon] = useState(0);
  const [cuponMsg, setCuponMsg]       = useState('');
  const [cuponOk, setCuponOk]         = useState(false);
  const [validandoCupon, setValidandoCupon] = useState(false);

  const totalFinal = +Math.max(0, total - descuentoCupon).toFixed(2);

  async function validarCupon(codigo, base) {
    const cod = String(codigo || '').trim().toUpperCase();
    if (!cod) return;
    setValidandoCupon(true);
    try {
      const r = await api.post('/cupones/validar', { codigo: cod, subtotal: base });
      if (r.data?.valido) {
        setCuponCodigo(cod); setDescuentoCupon(r.data.descuento || 0);
        setCuponOk(true); setCuponMsg(`Cupón ${cod} aplicado`);
      } else {
        setCuponCodigo(null); setDescuentoCupon(0); setCuponOk(false);
        setCuponMsg(r.data?.motivo || 'Cupón no válido');
      }
    } catch {
      setCuponCodigo(null); setDescuentoCupon(0); setCuponOk(false);
      setCuponMsg('No se pudo validar el cupón');
    } finally { setValidandoCupon(false); }
  }
  function quitarCupon() {
    setCuponCodigo(null); setDescuentoCupon(0); setCuponOk(false); setCuponMsg(''); setCuponInput('');
  }
  // Si cambia el carrito y hay cupón, se recalcula el descuento.
  useEffect(() => {
    if (cuponCodigo) validarCupon(cuponCodigo, total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  // ── Confirmar venta ──────────────────────────────────────────────────────
  // pagoInfo: { metodo, efectivo, tarjeta, cambio }
  // Patrón offline-first: la venta SIEMPRE se guarda primero en IndexedDB con
  // un UUID y se sincroniza vía /pedidos/sync (idempotente, crea y entrega en
  // una sola transacción). Con red sincroniza al instante; sin red queda en
  // cola y el motor la envía cuando vuelva la conexión.
  async function confirmarVenta(pagoInfo) {
    if (!idPuntoVenta) { setError('Selecciona una tienda'); return; }
    if (carrito.length === 0) return;
    if (turnoAbierto === false &&
        !window.confirm('No hay un turno de caja abierto para esta tienda. La venta no entrará en ningún arqueo/cierre. ¿Vender de todos modos?')) {
      return;
    }
    setProcesando(true); setError('');

    const clienteUUID = genUUID();
    const venta = {
      ClienteUUID:   clienteUUID,
      Propietario: {idBranch:usuario.idBranch,idCuenta:usuario.idCuenta,idUsuario:usuario.idUsuario},
      PagoMoneda:pagoInfo.PagoMoneda,
      idPuntoVenta:  parseInt(idPuntoVenta),
      MetodoPago:    pagoInfo.metodo,
      MontoEfectivo: pagoInfo.efectivo || null,
      MontoTarjeta:  pagoInfo.tarjeta  || null,
      MontoCambio:   pagoInfo.cambio   || null,
      FechaVenta:    pagoInfo.FechaVenta || new Date().toISOString(),
      CuponCodigo:       cuponCodigo || null,
      CuponDescuentoUSD: cuponCodigo ? descuentoCupon : null,
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

      if (rechazada) setError(`Venta guardada para revisión: ${rechazada.motivo}. No vuelvas a cobrarla.`);

      setTicket({
        revision: rechazada?.motivo || null,
        idPedido:   sincronizada?.idPedido ?? null,
        offline:    !sincronizada,
        refOffline: clienteUUID.slice(-8).toUpperCase(),
        items:      carrito,
        total:      totalFinal,
        cupon:      cuponCodigo ? { codigo: cuponCodigo, descuento: descuentoCupon } : null,
        pago:       pagoInfo,
      });
      setModalPago(false);
      setCarrito([]);
      quitarCupon();
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

        {turnoAbierto === false && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 rounded-xl text-sm flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" />
            <span className="flex-1">No hay <b>turno de caja abierto</b> para esta tienda. Las ventas quedarán fuera del arqueo hasta que abras la caja.</span>
            <Link to="/caja" className="font-semibold underline whitespace-nowrap">Abrir caja</Link>
          </div>
        )}

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
          {/* Cupón */}
          <div className="px-4 pt-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 border border-purple-200 bg-purple-50/50 rounded-xl px-3 py-2">
                <Tag size={15} className="text-purple-500 shrink-0" />
                <input
                  value={cuponInput}
                  onChange={(e) => setCuponInput(e.target.value.toUpperCase())}
                  disabled={cuponOk || carrito.length === 0}
                  placeholder="Cupón"
                  className="flex-1 bg-transparent outline-none text-sm font-bold tracking-wide text-gray-800 uppercase placeholder:font-normal placeholder:tracking-normal disabled:opacity-50"
                  onKeyDown={(e) => { if (e.key === 'Enter' && cuponInput.trim()) validarCupon(cuponInput, total); }}
                />
              </div>
              {cuponOk ? (
                <button onClick={quitarCupon} className="px-3 py-2 rounded-xl border border-purple-200 text-purple-600 text-sm font-bold hover:bg-purple-50">Quitar</button>
              ) : (
                <button
                  onClick={() => validarCupon(cuponInput, total)}
                  disabled={validandoCupon || !cuponInput.trim() || carrito.length === 0}
                  className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-bold hover:opacity-90 disabled:opacity-30">
                  {validandoCupon ? '…' : 'Aplicar'}
                </button>
              )}
            </div>
            {cuponMsg ? <p className={`text-xs font-semibold mt-1.5 ml-1 ${cuponOk ? 'text-green-600' : 'text-red-500'}`}>{cuponMsg}</p> : null}
          </div>

          {/* Desglose */}
          <div className="px-5 pt-3 pb-2 space-y-1.5">
            <div className="flex justify-between text-sm text-gray-500">
              <span>{carrito.reduce((s, i) => s + i.Cantidad, 0)} producto(s)</span>
              <span>${total.toFixed(2)}</span>
            </div>
            {descuentoCupon > 0 && (
              <div className="flex justify-between text-sm font-semibold text-purple-600">
                <span>Cupón {cuponCodigo}</span>
                <span>−${descuentoCupon.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-xl text-gray-900">
              <span>Total</span>
              <span className="text-vida-blue">${totalFinal.toFixed(2)}</span>
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
                    efectivo: m.key === 'EFECTIVO' ? totalFinal : 0,
                    tarjeta:  m.key === 'TARJETA'  ? totalFinal : 0,
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
              Cobrar ${totalFinal.toFixed(2)}
            </button>
          </div>
        </div>
      </div>

      {/* Modal de pago */}
      {modalPago && (
        <ModalPagoMoneda
          usuario={usuario} idPuntoVenta={idPuntoVenta}
          total={totalFinal}
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
