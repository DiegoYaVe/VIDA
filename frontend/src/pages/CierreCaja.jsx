import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wallet, Clock, DollarSign, CreditCard, ShoppingCart,
  RefreshCw, ChevronLeft, ChevronRight, Store, Eye, Receipt, Printer, X, Loader2, Search,
  Plus, Ban, ArrowDownCircle, ArrowUpCircle,
} from 'lucide-react';

// Movimientos de caja: etiqueta y si el efectivo SALE (resta) o entra (suma).
const MOV_LABEL = { EGRESO: 'Egreso', RETIRO: 'Retiro', DEVOLUCION: 'Devolución', INGRESO: 'Ingreso' };
const MOV_SALE  = { EGRESO: true, RETIRO: true, DEVOLUCION: true, INGRESO: false };

// Roles de RED (corporativo): no están atados a una tienda, así que eligen a
// cuál abrir/gestionar la caja. Los demás roles usan su propia sucursal.
const ROLES_RED = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO'];
import { useAuthStore } from '../store/authStore.js';
import api from '../services/api.js';
import ModalCierre, {ArqueoHistorial} from '../components/ArqueoCaja.jsx';
import ResumenMoneda from '../components/ResumenMoneda.jsx';
import { useToast } from '../components/Toast.jsx';

// ── Utilidades ─────────────────────────────────────────────────────────────

const fmt = (n) =>
  `$${parseFloat(n || 0).toFixed(2)}`;

function tiempoTranscurrido(fechaStr) {
  const diff = Math.floor((Date.now() - new Date(fechaStr).getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (h > 0) return `hace ${h}h ${m}min`;
  if (m > 0) return `hace ${m}min`;
  return 'recién abierto';
}

function formatHora(fechaStr) {
  if (!fechaStr) return '—';
  return new Date(fechaStr).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
}

function formatFecha(fechaStr) {
  if (!fechaStr) return '—';
  return new Date(fechaStr).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Badges ─────────────────────────────────────────────────────────────────

const METODO_CFG = {
  EFECTIVO: { label: 'Efectivo', cls: 'bg-green-100 text-green-700' },
  TARJETA:  { label: 'Tarjeta',  cls: 'bg-blue-100 text-blue-700' },
  MIXTO:    { label: 'Mixto',    cls: 'bg-purple-100 text-purple-700' },
};

function MetodoBadge({ metodo }) {
  const cfg = METODO_CFG[metodo] || { label: metodo || '—', cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const cfg = status === 'ABIERTO'
    ? 'bg-green-100 text-green-700'
    : 'bg-gray-100 text-gray-500';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${cfg}`}>
      {status}
    </span>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, color = 'text-[#0A1E3F]', sub }) {
  return (
    <div className="card p-5 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-gray-500 text-sm font-medium">
        <Icon size={16} />
        {label}
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function TicketHistorico({ venta, onClose }) {
  if (!venta) return null;
  const items = venta.detalle || [];
  return (
    <div id="ticket-historico-print" className="fixed inset-0 z-[70] bg-black/55 flex items-center justify-center p-4 print:bg-white print:p-0">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto print:shadow-none print:rounded-none print:max-w-none print:max-h-none">
        <div className="flex items-center justify-between px-5 py-4 border-b no-print">
          <div><p className="text-xs font-bold text-gray-400 uppercase">Copia de ticket</p><h3 className="font-bold text-gray-800">Pedido #{venta.idPedido}</h3></div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700"><X size={19}/></button>
        </div>
        <div className="p-6 font-mono text-sm">
          <p className="text-center font-bold text-xl">VenezPOS</p>
          <p className="text-center text-gray-500 text-xs">{venta.NombreSucursal}</p>
          <p className="text-center text-gray-500 text-xs">Pedido #{venta.idPedido}</p>
          <p className="text-center text-gray-500 text-xs mb-4">{new Date(venta.FechaAlta).toLocaleString('es-VE')}</p>
          <p className="text-xs mb-3">Atendió: <b>{venta.RealizadaPor || 'Usuario no disponible'}</b>{venta.UsuarioCve ? ` (@${venta.UsuarioCve})` : ''}</p>
          <div className="border-t border-dashed border-gray-300 my-2"/>
          {items.map(item => <div key={item.idDetalle} className="flex justify-between gap-3 py-1"><span>{item.Cantidad}× {item.NombreProducto}</span><span>${(Number(item.Cantidad)*Number(item.PrecioUnitario)).toFixed(2)}</span></div>)}
          <div className="border-t border-dashed border-gray-300 my-2"/>
          <div className="flex justify-between text-base font-bold"><span>TOTAL</span><span>${Number(venta.TotalUSD).toFixed(2)}</span></div>
          <ResumenMoneda datos={venta.PagoMonedaJSON}/>
          {!venta.PagoMonedaJSON && <div className="text-xs space-y-1 border-t border-dashed pt-2 mt-2">
            {Number(venta.MontoEfectivo)>0&&<p>Efectivo: ${Number(venta.MontoEfectivo).toFixed(2)}</p>}
            {Number(venta.MontoTarjeta)>0&&<p>Tarjeta: ${Number(venta.MontoTarjeta).toFixed(2)}</p>}
            {Number(venta.MontoCambio)>0&&<p>Cambio: ${Number(venta.MontoCambio).toFixed(2)}</p>}
          </div>}
          <p className="text-center text-gray-400 text-xs mt-6">*** COPIA ***</p>
        </div>
        <div className="flex gap-3 px-5 py-4 border-t no-print">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-semibold">Cerrar</button>
          <button onClick={()=>window.print()} className="flex-1 py-2.5 rounded-xl bg-vida-blue text-white font-semibold flex items-center justify-center gap-2"><Printer size={16}/> Imprimir</button>
        </div>
      </div>
      <style>{`@media print { body * { visibility: hidden !important; } #ticket-historico-print, #ticket-historico-print * { visibility: visible !important; } #ticket-historico-print { position: absolute !important; inset: 0 !important; } .no-print { display: none !important; } }`}</style>
    </div>
  );
}

function ModalVentasTurno({ turno, onClose }) {
  const [data,setData]=useState(null);
  const [error,setError]=useState('');
  const [busqueda,setBusqueda]=useState('');
  const [cargandoTicket,setCargandoTicket]=useState(null);
  const [ticket,setTicket]=useState(null);
  useEffect(()=>{
    let vivo=true;
    api.get('/caja/resumen',{params:{idTurno:turno.idTurno}})
      .then(r=>{if(vivo)setData(r.data);})
      .catch(e=>{if(vivo)setError(e.response?.data?.error||'No se pudieron cargar las ventas del turno');});
    return()=>{vivo=false;};
  },[turno.idTurno]);
  async function verTicket(p) {
    setCargandoTicket(p.idPedido);setError('');
    try {
      const {data:detalle}=await api.get(`/pedidos/${p.idPedido}`);
      setTicket({...detalle,RealizadaPor:p.RealizadaPor,UsuarioCve:p.UsuarioCve});
    } catch(e) {setError(e.response?.data?.error||'No se pudo cargar el ticket');}
    finally {setCargandoTicket(null);}
  }
  const lista=data?.pedidos||[];
  const termino=busqueda.trim().toLocaleLowerCase('es');
  const visibles=termino ? lista.filter(p=>[
    p.idPedido,p.RealizadaPor,p.UsuarioCve,p.MetodoPago,Number(p.TotalUSD).toFixed(2),p.TotalUSD,
  ].some(v=>String(v??'').toLocaleLowerCase('es').includes(termino))) : lista;
  return <>
    <div className="fixed inset-0 z-[60] bg-black/45 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[min(88vh,760px)] min-h-0 overflow-hidden flex flex-col" onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-5 border-b flex justify-between gap-4">
          <div><p className="text-xs font-bold text-gray-400 uppercase">Turno #{turno.idTurno}</p><h2 className="text-xl font-bold text-gray-900">Ventas del turno</h2><p className="text-sm text-gray-500">{turno.NombreSucursal} · {formatFecha(turno.FechaApertura)} {formatHora(turno.FechaApertura)}–{formatHora(turno.FechaCierre)}</p></div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700"><X size={20}/></button>
        </div>
        <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 border-b">
          <div><p className="text-xs text-gray-400">Cajero de apertura</p><p className="font-semibold">{turno.NombreUsuario}</p></div>
          <div><p className="text-xs text-gray-400">Transacciones</p><p className="font-bold">{data?.ventas?.NumTransacciones??turno.NumTransacciones??'—'}</p></div>
          <div><p className="text-xs text-gray-400">Total vendido</p><p className="font-bold text-vida-blue">{fmt(data?.ventas?.TotalVentas??turno.TotalVentas)}</p></div>
          <div><p className="text-xs text-gray-400">Estado</p><StatusBadge status={turno.Status}/></div>
        </div>
        {data?.tardias?.NumTransacciones>0&&<div className="px-6 py-3 border-b bg-amber-50 text-sm text-amber-800">
          <p className="font-semibold">{data.tardias.NumTransacciones} venta(s) sincronizada(s) después del cierre · {fmt(data.tardias.TotalUSD)}</p>
          <p className="text-xs">No están en las cifras guardadas del turno. Su efectivo ya estaba en la caja al contarla: {Number(data.tardias.EfectivoUSD).toFixed(2)} USD y {Number(data.tardias.EfectivoVES).toFixed(2)} VES.
            {data.tardias.DiferenciaConciliadaUSD!=null&&<> Diferencia conciliada: <b>{Number(data.tardias.DiferenciaConciliadaUSD).toFixed(2)} USD</b> · <b>{Number(data.tardias.DiferenciaConciliadaVES).toFixed(2)} VES</b>.</>}</p>
        </div>}
        <div className="px-6 py-3 border-b bg-white flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar por pedido, usuario, método o monto…" className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-9 text-sm outline-none focus:border-vida-blue focus:ring-2 focus:ring-blue-100"/>
            {busqueda&&<button onClick={()=>setBusqueda('')} title="Limpiar búsqueda" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"><X size={15}/></button>}
          </div>
          <span className="whitespace-nowrap text-xs text-gray-400">{visibles.length} de {lista.length}</span>
        </div>
        <div className="min-h-0 overflow-y-auto overflow-x-auto overscroll-contain flex-1">
          {error&&<p className="m-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
          {!data&&!error?<div className="py-16 flex justify-center text-gray-400"><Loader2 className="animate-spin"/></div>:lista.length===0?<div className="py-16 text-center text-gray-400"><Receipt size={40} className="mx-auto mb-2 opacity-30"/>Este turno no tiene ventas</div>:visibles.length===0?<div className="py-16 text-center text-gray-400"><Search size={40} className="mx-auto mb-2 opacity-30"/><p className="font-medium text-gray-500">No hay ventas que coincidan</p><button onClick={()=>setBusqueda('')} className="mt-2 text-sm font-semibold text-vida-blue hover:underline">Limpiar búsqueda</button></div>:
          <table className="w-full text-sm min-w-[780px]"><thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="p-3 text-left">Pedido</th><th className="p-3 text-left">Hora</th><th className="p-3 text-left">Realizada por</th><th className="p-3 text-left">Método</th><th className="p-3 text-right">Monto</th><th className="p-3 text-right">Ticket</th></tr></thead><tbody className="divide-y">{visibles.map(p=><tr key={p.idPedido} className="hover:bg-gray-50"><td className="p-3 font-semibold">#{p.idPedido}{p.VentaTardia&&<span title="Sincronizada después del cierre: no está en las cifras guardadas del turno" className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">TARDÍA</span>}</td><td className="p-3 text-gray-500">{formatHora(p.FechaAlta)}</td><td className="p-3"><span className="font-medium">{p.RealizadaPor}</span>{p.UsuarioCve&&<span className="block text-xs text-gray-400">@{p.UsuarioCve}</span>}</td><td className="p-3"><MetodoBadge metodo={p.MetodoPago}/></td><td className="p-3 text-right font-bold">{fmt(p.TotalUSD)}</td><td className="p-3 text-right"><button disabled={cargandoTicket===p.idPedido} onClick={()=>verTicket(p)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold text-vida-blue hover:bg-blue-50 disabled:opacity-50">{cargandoTicket===p.idPedido?<Loader2 size={14} className="animate-spin"/>:<Receipt size={14}/>} Ver ticket</button></td></tr>)}</tbody></table>}
        </div>
      </div>
    </div>
    {ticket&&<TicketHistorico venta={ticket} onClose={()=>setTicket(null)}/>}
  </>;
}

// ══════════════════════════════════════════════════════════════════════════════
// Modal de Cierre
// ══════════════════════════════════════════════════════════════════════════════


function Row({ label, value, bold = false, valueColor = 'text-gray-800' }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`${bold ? 'font-bold' : ''} ${valueColor}`}>{value}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Modal: registrar movimiento de caja (egreso/ingreso/retiro/devolución)
// ══════════════════════════════════════════════════════════════════════════════

function ModalMovimiento({ turno, onClose, onSaved }) {
  const toast = useToast();
  const [tipo, setTipo]       = useState('EGRESO');
  const [moneda, setMoneda]   = useState('USD');
  const [monto, setMonto]     = useState('');
  const [motivo, setMotivo]   = useState('');
  const [loading, setLoading] = useState(false);

  async function guardar() {
    const n = Number(monto);
    if (monto === '' || !Number.isFinite(n) || n <= 0) return toast.error('Ingresa un monto mayor a cero');
    setLoading(true);
    try {
      await api.post('/caja/movimiento', { idTurno: turno.idTurno, Tipo: tipo, Moneda: moneda, Monto: n, Motivo: motivo || null });
      toast.success('Movimiento registrado');
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al registrar movimiento');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold">Registrar movimiento</h2>
        <p className="text-sm text-gray-500">Egresos, ingresos, retiros o devoluciones de efectivo. Ajustan el efectivo esperado de su moneda en el arqueo, sin mezclar USD con VES.</p>
        <label className="block text-sm font-medium">Tipo
          <select className="input-field" value={tipo} onChange={e => setTipo(e.target.value)} disabled={loading}>
            <option value="EGRESO">Egreso (gasto pagado de caja)</option>
            <option value="RETIRO">Retiro / sangría</option>
            <option value="DEVOLUCION">Devolución a cliente</option>
            <option value="INGRESO">Ingreso (aporte de efectivo)</option>
          </select>
        </label>
        <label className="block text-sm font-medium">Moneda
          <select className="input-field" value={moneda} onChange={e => setMoneda(e.target.value)} disabled={loading}>
            <option value="USD">USD</option>
            <option value="VES">VES</option>
          </select>
        </label>
        <label className="block text-sm font-medium">Monto ({moneda})
          <input type="number" min="0" step="0.01" className="input-field" value={monto} onChange={e => setMonto(e.target.value)} disabled={loading} placeholder="0.00" />
        </label>
        <label className="block text-sm font-medium">Motivo (opcional)
          <input type="text" maxLength={300} className="input-field" value={motivo} onChange={e => setMotivo(e.target.value)} disabled={loading} placeholder="Ej. compra de hielo, vuelto a proveedor…" />
        </label>
        <div className="flex gap-3 justify-end">
          <button disabled={loading} onClick={onClose} className="px-4 py-2 rounded-xl text-gray-600 font-semibold">Cancelar</button>
          <button className="btn-primary" disabled={loading} onClick={guardar}>{loading ? 'Guardando…' : 'Registrar'}</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Página principal: CierreCaja
// ══════════════════════════════════════════════════════════════════════════════

export default function CierreCaja() {
  const { usuario } = useAuthStore();
  const toast = useToast();

  const esRed = ROLES_RED.includes(usuario?.TipoUsuario);
  // Anular movimientos: solo supervisión/administración (no el cajero).
  const puedeAnular = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN', 'SUPERVISOR'].includes(usuario?.TipoUsuario);
  // Corporativo: selector de tienda. Los demás usan su idPuntoVenta del token.
  const [tiendas, setTiendas] = useState([]);
  const [pvSel, setPvSel]     = useState(usuario?.idPuntoVenta ? String(usuario.idPuntoVenta) : '');

  // Estado de turno
  const [turno, setTurno]               = useState(null);
  const [ventas, setVentas]             = useState(null);
  const [pedidos, setPedidos]           = useState([]);
  const [movimientos, setMovimientos]   = useState([]);
  const [movPorMoneda, setMovPorMoneda] = useState({ USD: 0, VES: 0 });
  const [espMoneda, setEspMoneda]       = useState({ USD: null, VES: null });
  const [modalMov, setModalMov]         = useState(false);

  // Estado apertura
  const [montoApertura, setMontoApertura]       = useState('');
  const [aperturaVES,setAperturaVES]=useState('0');
  const [obsApertura, setObsApertura]           = useState('');
  const [loadingApertura, setLoadingApertura]   = useState(false);

  // Historial
  const [historial, setHistorial]   = useState([]);
  const [histTotal, setHistTotal]   = useState(0);
  const [histPage, setHistPage]     = useState(1);
  const [sinTurno, setSinTurno]     = useState(null);
  const HIST_LIMIT = 10;

  // UI
  const [tab, setTab]               = useState('turno'); // 'turno' | 'historial'
  const [loadingResumen, setLoadingResumen] = useState(false);
  const [modalCierre, setModalCierre]       = useState(false);
  const [turnoDetalle, setTurnoDetalle]     = useState(null);
  const [tiempo, setTiempo]         = useState('');

  const refreshRef = useRef(null);

  // ── Cargar turno activo ──────────────────────────────────────────────────

  const cargarTurnoActivo = useCallback(async () => {
    // Corporativo sin tienda elegida: no consulta hasta que elija una.
    if (esRed && !pvSel) { setTurno(null); setVentas(null); setPedidos([]); return; }
    try {
      const params = esRed && pvSel ? { idPuntoVenta: pvSel } : {};
      const res = await api.get('/caja/turno-activo', { params });
      setTurno(res.data.turno);
      if (res.data.turno) cargarResumen(res.data.turno.idTurno);
      else { setVentas(null); setPedidos([]); }
    } catch (err) {
      // sin turno activo es válido
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esRed, pvSel]);

  // ── Cargar resumen ───────────────────────────────────────────────────────

  const cargarResumen = useCallback(async (idTurnoParam) => {
    setLoadingResumen(true);
    try {
      const params = {
        ...(idTurnoParam ? { idTurno: idTurnoParam } : {}),
        ...(esRed && pvSel ? { idPuntoVenta: pvSel } : {}),
      };
      const res = await api.get('/caja/resumen', { params });
      if (res.data.turno) {
        setTurno(res.data.turno);
        setVentas(res.data.ventas);
        setPedidos(res.data.pedidos || []);
        setMovimientos(res.data.movimientos || []);
        setMovPorMoneda(res.data.movimientosPorMoneda || { USD: 0, VES: 0 });
        setEspMoneda({ USD: res.data.efectivoEsperadoUSD, VES: res.data.efectivoEsperadoVES });
      }
    } catch (err) {
      toast.error('Error al cargar resumen');
    } finally {
      setLoadingResumen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esRed, pvSel]);

  // ── Cargar historial ─────────────────────────────────────────────────────

  const cargarHistorial = useCallback(async (page = 1) => {
    try {
      const res = await api.get('/caja/historial', {
        params: { page, limit: HIST_LIMIT, ...(esRed&&pvSel?{idPuntoVenta:pvSel}:{}) },
      });
      setHistorial(res.data.data || []);
      setHistTotal(res.data.total || 0);
      setSinTurno(res.data.ventasSinTurno || null);
      setHistPage(page);
    } catch (err) {
      toast.error('Error al cargar historial');
    }
  }, [esRed,pvSel]);

  // ── Efectos ──────────────────────────────────────────────────────────────

  useEffect(() => {
    cargarTurnoActivo();
    cargarHistorial(1);
  }, [cargarTurnoActivo, cargarHistorial]);

  // Corporativo: cargar la lista de tiendas para el selector (una vez).
  useEffect(() => {
    if (!esRed) return;
    api.get('/sucursales/puntos-venta')
      .then(r => {
        const list = r.data || [];
        setTiendas(list);
        setPvSel(prev => prev || (list[0] ? String(list[0].idPuntoVenta) : ''));
      })
      .catch(() => {});
  }, [esRed]);

  // Actualizar tiempo transcurrido cada minuto
  useEffect(() => {
    if (!turno?.FechaApertura) return;
    setTiempo(tiempoTranscurrido(turno.FechaApertura));
    const id = setInterval(() => setTiempo(tiempoTranscurrido(turno.FechaApertura)), 60000);
    return () => clearInterval(id);
  }, [turno?.FechaApertura]);

  // Auto-refresh del resumen cada 30 segundos si hay turno abierto
  useEffect(() => {
    if (!turno || turno.Status !== 'ABIERTO') {
      if (refreshRef.current) clearInterval(refreshRef.current);
      return;
    }
    refreshRef.current = setInterval(() => cargarResumen(turno.idTurno), 30000);
    return () => clearInterval(refreshRef.current);
  }, [turno, cargarResumen]);

  // ── Abrir caja ───────────────────────────────────────────────────────────

  async function handleAbrirCaja(e) {
    e.preventDefault();
    if (montoApertura === '' || isNaN(parseFloat(montoApertura))) {
      toast.error('Ingresa el monto inicial en caja');
      return;
    }
    if (esRed && !pvSel) {
      toast.error('Selecciona una tienda para abrir su caja');
      return;
    }
    setLoadingApertura(true);
    try {
      await api.post('/caja/apertura', {
        MontoApertura: Number(montoApertura),
        MontoAperturaVES: Number(aperturaVES),
        Observaciones: obsApertura || null,
        ...(esRed && pvSel ? { idPuntoVenta: parseInt(pvSel) } : {}),
      });
      toast.success('Caja abierta correctamente');
      setMontoApertura('');setAperturaVES('0');
      setObsApertura('');
      cargarTurnoActivo();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al abrir caja');
    } finally {
      setLoadingApertura(false);
    }
  }

  function handleCajaCerrada() {
    setModalCierre(false);
    setTurno(null);
    setVentas(null);
    setPedidos([]);
    setMovimientos([]);
    setMovPorMoneda({ USD: 0, VES: 0 });
    cargarHistorial(1);
  }

  async function anularMovimiento(id) {
    if (!window.confirm('¿Anular este movimiento? El efectivo esperado se recalculará.')) return;
    try {
      await api.post(`/caja/movimiento/${id}/anular`);
      toast.success('Movimiento anulado');
      if (turno) cargarResumen(turno.idTurno);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al anular movimiento');
    }
  }

  function handleMovimientoGuardado() {
    setModalMov(false);
    if (turno) cargarResumen(turno.idTurno);
  }

  const histPages = Math.ceil(histTotal / HIST_LIMIT);

  // ══════════════════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0A1E3F] to-[#5BBE6A] px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-bold">Cierre de Caja</h1>
            <p className="text-white/70 text-sm mt-0.5">Control de turnos y arqueo</p>
          </div>
          {turno?.Status === 'ABIERTO' && (
            <div className="flex items-center gap-2 bg-white/20 text-white px-4 py-2 rounded-full text-sm font-semibold">
              <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
              TURNO ABIERTO — {tiempo}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl shadow-sm p-1 w-fit">
          {[
            { id: 'turno',    label: 'Turno Actual' },
            { id: 'historial', label: 'Historial' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); if (t.id === 'historial') cargarHistorial(1); }}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition ${
                tab === t.id
                  ? 'bg-[#0A1E3F] text-white shadow'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Selector de tienda para roles de red (corporativo) */}
        {esRed && (
          <div className="card p-4 flex items-center gap-3 flex-wrap">
            <Store size={18} className="text-gray-400" />
            <label className="text-sm font-medium text-gray-700">Tienda</label>
            <select
              value={pvSel}
              onChange={(e) => setPvSel(e.target.value)}
              className="input-field w-full max-w-xs"
            >
              <option value="">— Selecciona una tienda —</option>
              {tiendas.map((t) => (
                <option key={t.idPuntoVenta} value={t.idPuntoVenta}>
                  {t.NomComercial || t.Nombre}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-400">Como corporativo, eliges de qué tienda gestionar la caja.</span>
          </div>
        )}

        {/* ── Tab: Turno Actual ── */}
        {tab === 'turno' && (
          <>
            {!turno || turno.Status !== 'ABIERTO' ? (
              /* Estado 1: Sin turno abierto */
              <div className="space-y-6">
                <div className="card p-8 max-w-md mx-auto text-center space-y-5">
                  <div className="flex justify-center">
                    <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                      <Wallet size={32} className="text-[#0A1E3F]" />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">
                      {esRed && !pvSel ? 'Selecciona una tienda' : 'No hay turno abierto'}
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">
                      {esRed && !pvSel
                        ? 'Elige una tienda arriba para abrir o gestionar su caja.'
                        : 'Abre la caja para comenzar a registrar ventas POS'}
                    </p>
                  </div>

                  {!(esRed && !pvSel) && (
                  <form onSubmit={handleAbrirCaja} className="text-left space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Monto inicial en caja (USD efectivo) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input-field"
                        placeholder="0.00"
                        value={montoApertura}
                        onChange={(e) => setMontoApertura(e.target.value)}
                      />
                    </div>
                    <label className="block text-sm font-medium">Monto inicial en caja (VES efectivo)
                      <input type="number" min="0" step="0.01" className="input-field" value={aperturaVES} onChange={e=>setAperturaVES(e.target.value)}/>
                    </label>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Observaciones (opcional)
                      </label>
                      <textarea
                        className="input-field resize-none"
                        rows={2}
                        placeholder="Notas de apertura..."
                        value={obsApertura}
                        onChange={(e) => setObsApertura(e.target.value)}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loadingApertura}
                      className="btn-primary w-full"
                    >
                      {loadingApertura ? 'Abriendo...' : 'Abrir Caja'}
                    </button>
                  </form>
                  )}
                </div>

                {/* Mini historial debajo */}
                {historial.length > 0 && (
                  <div className="card overflow-hidden">
                    <div className="px-5 py-4 border-b">
                      <h3 className="font-semibold text-gray-700">Últimos turnos</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                          <tr>
                            <th className="px-4 py-3 text-left">Fecha</th>
                            <th className="px-4 py-3 text-left">Cajero</th>
                            <th className="px-4 py-3 text-right">Ventas</th>
                            <th className="px-4 py-3 text-right">Diferencia</th>
                            <th className="px-4 py-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {historial.slice(0, 5).map((t) => (
                            <tr key={t.idTurno} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-gray-600">{formatFecha(t.FechaApertura)}</td>
                              <td className="px-4 py-3 text-gray-800">{t.NombreUsuario || '—'}</td>
                              <td className="px-4 py-3 text-right font-medium">{fmt(t.TotalVentas)}</td>
                              <td className={`px-4 py-3 text-right font-medium ${parseFloat(t.Diferencia) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                <ArqueoHistorial turno={t} campo="Diferencia"/>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <StatusBadge status={t.Status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Estado 2: Turno abierto — pantalla principal */
              <div className="space-y-5">
                {/* Info del turno */}
                <div className="card p-5 flex flex-wrap gap-4 items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-gray-500 text-sm">Cajero</p>
                    <p className="font-semibold text-gray-800">{turno.NombreUsuario || '—'}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-gray-500 text-sm">Sucursal</p>
                    <p className="font-semibold text-gray-800">{turno.NombreSucursal || '—'}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-gray-500 text-sm">Apertura</p>
                    <p className="font-semibold text-gray-800">{formatHora(turno.FechaApertura)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => cargarResumen(turno.idTurno)}
                      className="p-2 border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 transition"
                      title="Actualizar"
                    >
                      <RefreshCw size={16} className={loadingResumen ? 'animate-spin' : ''} />
                    </button>
                    <button
                      onClick={() => setModalCierre(true)}
                      className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 font-medium text-sm transition"
                    >
                      Cerrar Caja
                    </button>
                  </div>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <KpiCard
                    icon={DollarSign}
                    label="Ventas del turno"
                    value={fmt(ventas?.TotalVentas)}
                    color="text-[#0A1E3F]"
                  />
                  <KpiCard
                    icon={Wallet}
                    label="Efectivo neto (equiv. USD)"
                    value={fmt(ventas?.TotalEfectivo)}
                    color="text-[#5BBE6A]"
                  />
                  <KpiCard
                    icon={CreditCard}
                    label="Tarjeta (equiv. USD)"
                    value={fmt(ventas?.TotalTarjeta)}
                    color="text-purple-600"
                  />
                  <KpiCard
                    icon={ShoppingCart}
                    label="Transacciones"
                    value={ventas?.NumTransacciones ?? 0}
                    color="text-orange-500"
                  />
                </div>

                {/* Resumen de caja */}
                <div className="card p-5 space-y-3">
                  <h3 className="font-semibold text-gray-700 mb-1">Resumen de Caja</h3>
                  {['USD','VES'].map(m=>{
                    const ap  = Number(m==='USD'?turno.MontoApertura:turno.MontoAperturaVES||0);
                    const ven = Number(ventas?.['EfectivoOriginal'+m]||0);
                    const mov = Number(movPorMoneda[m]||0);
                    const esp = espMoneda[m]!=null ? Number(espMoneda[m]) : ap+ven+mov;
                    return <div key={m} className="text-sm space-y-1 border-t pt-2">
                      <Row label={'Apertura '+m} value={ap.toFixed(2)+' '+m}/>
                      <Row label={'Ventas efectivo neto '+m} value={ven.toFixed(2)+' '+m}/>
                      {mov!==0 && <Row label={'Movimientos '+m} value={(mov>0?'+':'')+mov.toFixed(2)+' '+m} valueColor={mov<0?'text-red-600':'text-green-700'}/>}
                      <Row bold label={'Esperado '+m} value={esp.toFixed(2)+' '+m}/>
                    </div>;
                  })}
                </div>

                {/* Movimientos de caja */}
                <div className="card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-700">Movimientos de caja</h3>
                    <button
                      onClick={() => setModalMov(true)}
                      className="px-3 py-1.5 rounded-xl bg-vida-blue text-white text-sm font-semibold flex items-center gap-1.5 hover:opacity-90"
                    >
                      <Plus size={15}/> Registrar
                    </button>
                  </div>
                  {movimientos.length === 0 ? (
                    <p className="text-sm text-gray-400">Sin movimientos en este turno. Registra egresos (gastos), retiros, devoluciones o ingresos de efectivo; ajustan el efectivo esperado por moneda.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-xs uppercase text-gray-500">
                          <tr>
                            <th className="py-1 text-left">Hora</th>
                            <th className="py-1 text-left">Tipo</th>
                            <th className="py-1 text-left">Motivo</th>
                            <th className="py-1 text-right">Monto</th>
                            {puedeAnular && <th className="py-1"></th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {movimientos.map(mv => {
                            const sale = MOV_SALE[mv.Tipo];
                            const anulado = mv.Status === 'ANULADO';
                            return (
                              <tr key={mv.idMovimiento} className={anulado ? 'opacity-40' : ''}>
                                <td className="py-1.5 text-gray-500 whitespace-nowrap">{formatHora(mv.FechaAlta)}</td>
                                <td className="py-1.5">
                                  <span className={`inline-flex items-center gap-1 font-medium ${anulado ? 'line-through' : ''}`}>
                                    {sale ? <ArrowUpCircle size={14} className="text-red-500"/> : <ArrowDownCircle size={14} className="text-green-600"/>}
                                    {MOV_LABEL[mv.Tipo] || mv.Tipo}
                                  </span>
                                  {mv.NombreUsuario && <span className="block text-xs text-gray-400">{mv.NombreUsuario}</span>}
                                </td>
                                <td className="py-1.5 text-gray-600">{mv.Motivo || '—'}</td>
                                <td className={`py-1.5 text-right font-semibold whitespace-nowrap ${anulado ? 'line-through text-gray-400' : sale ? 'text-red-600' : 'text-green-700'}`}>
                                  {(sale ? '-' : '+')}{Number(mv.Monto).toFixed(2)} {mv.Moneda}
                                </td>
                                {puedeAnular && (
                                  <td className="py-1.5 text-right">
                                    {!anulado && (
                                      <button onClick={() => anularMovimiento(mv.idMovimiento)} title="Anular movimiento" className="p-1 text-gray-400 hover:text-red-600">
                                        <Ban size={15}/>
                                      </button>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Tabla de transacciones */}
                <div className="card overflow-hidden">
                  <div className="px-5 py-4 border-b flex items-center gap-2">
                    <Clock size={16} className="text-gray-400" />
                    <h3 className="font-semibold text-gray-700">Últimas transacciones del turno</h3>
                  </div>
                  <div className="overflow-y-auto max-h-72">
                    {pedidos.length === 0 ? (
                      <p className="text-center text-gray-400 py-8 text-sm">Sin transacciones aún</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 uppercase text-xs sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left">#Pedido</th>
                            <th className="px-4 py-3 text-left">Hora</th>
                            <th className="px-4 py-3 text-left">Realizada por</th>
                            <th className="px-4 py-3 text-left">Método</th>
                            <th className="px-4 py-3 text-right">Monto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {pedidos.slice(0, 10).map((p) => (
                            <tr key={p.idPedido} className="hover:bg-gray-50">
                              <td className="px-4 py-2.5 text-gray-600">#{p.idPedido}</td>
                              <td className="px-4 py-2.5 text-gray-500">{formatHora(p.FechaAlta)}</td>
                              <td className="px-4 py-2.5 text-gray-700">
                                <span className="font-medium">{p.RealizadaPor || 'Usuario no disponible'}</span>
                                {p.UsuarioCve && <span className="block text-xs text-gray-400">@{p.UsuarioCve}</span>}
                              </td>
                              <td className="px-4 py-2.5"><MetodoBadge metodo={p.MetodoPago} /></td>
                              <td className="px-4 py-2.5 text-right font-medium text-gray-800">{fmt(p.TotalUSD)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Tab: Historial ── */}
        {tab === 'historial' && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h3 className="font-semibold text-gray-700">Historial de Turnos</h3>
            </div>
            {sinTurno?.NumTransacciones>0&&(
              <p className="mx-5 mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                <b>{sinTurno.NumTransacciones} venta(s) fuera de turno</b> ({fmt(sinTurno.TotalUSD)}, la última el {formatFecha(sinTurno.Ultima)}): se cobraron sin caja abierta y no están en ningún arqueo. Revísalas en Ventas.
              </p>
            )}
            <div className="overflow-x-auto">
              {historial.length === 0 ? (
                <p className="text-center text-gray-400 py-12 text-sm">Sin historial disponible</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                    <tr>
                      <th className="px-4 py-3 text-left">Fecha</th>
                      <th className="px-4 py-3 text-left">Cajero</th>
                      <th className="px-4 py-3 text-left">Sucursal</th>
                      <th className="px-4 py-3 text-right">Apertura</th>
                      <th className="px-4 py-3 text-right">Ventas</th>
                      <th className="px-4 py-3 text-right">Contado</th>
                      <th className="px-4 py-3 text-right">Diferencia</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-center">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {historial.map((t) => (
                      <tr key={t.idTurno} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {formatFecha(t.FechaApertura)}
                          <span className="block text-xs text-gray-400">{formatHora(t.FechaApertura)}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-800">{t.NombreUsuario || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{t.NombreSucursal || '—'}</td>
                        <td className="px-4 py-3 text-right">{fmt(t.MontoApertura)} USD<br/>{Number(t.MontoAperturaVES||0).toFixed(2)} VES</td>
                        <td className="px-4 py-3 text-right font-medium">{fmt(t.TotalVentas)}</td>
                        <td className="px-4 py-3 text-right"><ArqueoHistorial turno={t} campo="Contado"/></td>
                        <td className={`px-4 py-3 text-right font-medium ${
                          t.Diferencia === null ? 'text-gray-400'
                          : parseFloat(t.Diferencia) < 0 ? 'text-red-600'
                          : 'text-green-600'
                        }`}>
                          <ArqueoHistorial turno={t} campo="Diferencia"/>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={t.Status} />
                          {t.VentasTardias>0&&<span className="mt-1 block text-[10px] font-bold text-amber-700">+{t.VentasTardias} tardía(s)</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={()=>setTurnoDetalle(t)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-vida-blue hover:bg-blue-50">
                            <Eye size={14}/> Ver ventas
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Paginación */}
            {histPages > 1 && (
              <div className="px-5 py-4 border-t flex items-center justify-between text-sm text-gray-500">
                <span>Página {histPage} de {histPages} — {histTotal} turnos</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => cargarHistorial(histPage - 1)}
                    disabled={histPage <= 1}
                    className="p-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => cargarHistorial(histPage + 1)}
                    disabled={histPage >= histPages}
                    className="p-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de Cierre */}
      {modalCierre && turno && (
        <ModalCierre
          turno={turno}
          ventas={ventas}
          esperado={espMoneda}
          onClose={() => setModalCierre(false)}
          onCerrado={handleCajaCerrada}
        />
      )}
      {modalMov && turno && (
        <ModalMovimiento
          turno={turno}
          onClose={() => setModalMov(false)}
          onSaved={handleMovimientoGuardado}
        />
      )}
      {turnoDetalle && <ModalVentasTurno turno={turnoDetalle} onClose={()=>setTurnoDetalle(null)}/>}
    </div>
  );
}
