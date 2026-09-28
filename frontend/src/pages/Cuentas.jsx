import ResumenMoneda from '../components/ResumenMoneda.jsx';
import MonedaCuentas from '../components/MonedaCuentas.jsx';
// src/pages/Cuentas.jsx
// Cuentas por pagar (proveedores) y por cobrar (sucursales).
//
// Las dos pestañas son la misma tabla con distinta contraparte: el backend las
// guarda en VIDA_CUENTAS con un discriminador `Tipo`, así que acá también se
// dibujan con el mismo componente.
//
// El saldo NO viene de una columna: el API lo deriva de los abonos. Por eso la
// pantalla nunca lo calcula de su lado — si lo hiciera, dos pestañas abiertas
// mostrarían números distintos.
import { useEffect, useMemo, useState } from 'react';
import {
  Wallet, TrendingDown, TrendingUp, AlertTriangle, Search,
  Plus, RotateCcw, X, Calendar, CheckCircle2, Loader2, FileMinus, Ban,
} from 'lucide-react';
import api from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';

const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const fmtFecha = (d) => d ? new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_COLOR = {
  ABIERTA:   'bg-gray-100 text-gray-700',
  PARCIAL:   'bg-amber-100 text-amber-800',
  LIQUIDADA: 'bg-green-100 text-green-700',
  CANCELADA: 'bg-gray-100 text-gray-400 line-through',
};

const METODOS = ['EFECTIVO', 'TRANSFERENCIA', 'PAGO_MOVIL', 'TARJETA', 'OTRO'];

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vida-aqua/40';

// ── Tarjetas de resumen ─────────────────────────────────────────────────────
function Tarjeta({ icon: Icon, titulo, monto, sub, tono }) {
  const tonos = {
    rojo:  'text-red-600 bg-red-50',
    verde: 'text-green-600 bg-green-50',
    ambar: 'text-amber-600 bg-amber-50',
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-none ${tonos[tono]}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-black text-gray-400 uppercase tracking-wider">{titulo}</p>
        <p className="text-2xl font-black text-gray-900 mt-1 tabular-nums">{fmt(monto)}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Modal de abono ──────────────────────────────────────────────────────────
function ModalAbono({ cuenta, onCerrar, onHecho }) {
  const [monto, setMonto]   = useState('');
  const [metodo, setMetodo] = useState('TRANSFERENCIA');
  const [ref, setRef]       = useState('');
  const [notas, setNotas]   = useState('');
  const [liquidar, setLiquidar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]   = useState('');

  const [cfg,setCfg]=useState(null);
  const [moneda,setMoneda]=useState('USD');
  async function cargarTasa() {
    setCfg(null);
    try {const r=await api.get('/cuentas/config-moneda');setCfg(r.data);setMoneda(r.data.Modo==='VES'?'VES':'USD');if(r.data.Advertencia) setError(r.data.Advertencia);}
    catch {setError('No se pudo cargar la tasa. Reintenta.');}
  }
  useEffect(()=>{cargarTasa();},[]);
  const tc=cfg?.tasa?.Vigente ? Number(cfg.tasa.VESporUSD) : null;
  const saldo = Number(cuenta.Saldo) || 0;
  const montoNum = liquidar ? saldo : (parseFloat(monto) || 0) / (moneda === 'VES' ? (tc || Infinity) : 1);
  const excede = !liquidar && montoNum > saldo + 1e-6;
  const valido = cfg?.ConsultaCorrecta && tc && montoNum > 0 && !excede;

  async function guardar() {
    setGuardando(true); setError('');
    try {
      await api.post(`/cuentas/${cuenta.idDocumento}/abonos`, {
        Moneda:moneda, MontoOriginal:liquidar?undefined:Number(monto), idTasa:cfg?.tasa?.Vigente?cfg.tasa.idTasa:undefined,
        liquidar,
        MetodoPago: metodo,
        Referencia: ref.trim() || null,
        Notas: notas.trim() || null,
      });
      onHecho();
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo registrar el abono');
      if ([409,503].includes(e.response?.status)) setCfg(null);
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-xl font-black text-gray-900">
            {cuenta.Tipo === 'CXP' ? 'Pagar' : 'Cobrar'}
          </h2>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          {cuenta.Tipo === 'CXP' ? cuenta.NombreProveedor : cuenta.NombreSucursal}
          {' · '}saldo <b className="text-gray-800 tabular-nums">{fmt(saldo)}</b> de {fmt(cuenta.TotalUSD)}
        </p>

        <button type="button" disabled={guardando} onClick={()=>{setError('');cargarTasa();}} className="text-vida-blue underline mb-3">Consultar / actualizar tasa</button>
        <label className="block mb-3">Moneda del abono
          <select value={moneda} onChange={e=>{setMoneda(e.target.value);setMonto('');}} className={inputCls}>
            {(cfg?.Modo==='AMBAS'?['USD','VES']:[cfg?.Modo||'USD']).map(m=><option key={m}>{m}</option>)}
          </select>
        </label>
        <p className="text-xs mb-3">{tc ? `1 USD = ${tc} VES. Fecha: ${String(cfg.tasa.FechaValor).slice(0,10)}. Fuente: ${cfg.tasa.Fuente}` : 'Sin tasa verificada: actualiza antes de cobrar.'} Equivalente del abono: {fmt(montoNum)} USD.</p>
        <label className="flex items-center gap-2.5 mb-4 cursor-pointer">
          <input type="checkbox" checked={liquidar} onChange={(e) => setLiquidar(e.target.checked)}
                 className="w-4 h-4 accent-vida-green"/>
          <span className="text-sm font-semibold text-gray-700">
            Liquidar todo el saldo <span className="text-gray-400 font-normal tabular-nums">({fmt(saldo)})</span>
          </span>
        </label>

        {!liquidar && (
          <div className="mb-4">
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Monto a abonar</p>
            <input type="number" step="0.01" min="0" max={moneda==='VES'?saldo*(tc||0):saldo} value={monto} autoFocus
                   onChange={(e) => setMonto(e.target.value)} className={inputCls} placeholder="0.00"/>
            {excede && (
              <p className="text-xs text-red-600 mt-1.5">
                Supera el saldo pendiente de {fmt(saldo)}.
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Método</p>
            <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className={inputCls}>
              {METODOS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Referencia</p>
            <input value={ref} onChange={(e) => setRef(e.target.value)} className={inputCls} placeholder="Nº de operación"/>
          </div>
        </div>

        <div className="mb-5">
          <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Notas</p>
          <input value={notas} onChange={(e) => setNotas(e.target.value)} className={inputCls} placeholder="Opcional"/>
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl mb-4">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onCerrar} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm">
            Cancelar
          </button>
          <button onClick={guardar} disabled={!valido || guardando}
                  className="flex-[1.4] py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #54C4E0, #5BBE6A)' }}>
            {guardando ? <><Loader2 size={16} className="animate-spin"/> Guardando…</>
                       : `Registrar ${fmt(montoNum)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal de nota de crédito ────────────────────────────────────────────────
// Para cancelar una cuenta que ya tiene abonos: perdona lo pendiente y, si se
// pide, devuelve lo ya cobrado. Nada se borra.
function ModalNotaCredito({ cuenta, onCerrar, onHecho }) {
  const [cancelarTotal, setCancelarTotal] = useState(true);
  const [monto, setMonto]   = useState('');
  const [motivo, setMotivo] = useState('');
  const reintegrar = false;
  const [guardando, setGuardando]   = useState(false);
  const [error, setError]   = useState('');

  const saldo   = Number(cuenta.Saldo) || 0;
  const abonado = Number(cuenta.Abonado) || 0;
  const montoNum = cancelarTotal ? saldo : (parseFloat(monto) || 0);
  const excede = !cancelarTotal && montoNum > saldo + 1e-6;
  const valido = montoNum > 0 && !excede && motivo.trim().length >= 3;

  async function guardar() {
    setGuardando(true); setError('');
    try {
      await api.post(`/cuentas/${cuenta.idDocumento}/nota-credito`, {
        cancelarTotal,
        MontoUSD: cancelarTotal ? undefined : montoNum,
        motivo: motivo.trim(),
        reintegrar: reintegrar && abonado > 0,
      });
      onHecho();
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo emitir la nota de crédito');
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-xl font-black text-gray-900">Nota de crédito</h2>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          Cancela lo que queda por {cuenta.Tipo === 'CXP' ? 'pagar' : 'cobrar'} sin borrar nada.
          Saldo pendiente <b className="text-gray-800 tabular-nums">{fmt(saldo)}</b>.
        </p>

        <div className="space-y-2 mb-4">
          <label className="flex items-start gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition"
                 style={{ borderColor: cancelarTotal ? '#54C4E0' : '#E5E7EB' }}>
            <input type="radio" checked={cancelarTotal} onChange={() => setCancelarTotal(true)}
                   className="mt-0.5 accent-vida-aqua"/>
            <span>
              <span className="text-sm font-bold text-gray-800 block">Cancelar la cuenta completa</span>
              <span className="text-xs text-gray-400">Acredita los {fmt(saldo)} pendientes</span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition"
                 style={{ borderColor: !cancelarTotal ? '#54C4E0' : '#E5E7EB' }}>
            <input type="radio" checked={!cancelarTotal} onChange={() => setCancelarTotal(false)}
                   className="mt-0.5 accent-vida-aqua"/>
            <span className="flex-1">
              <span className="text-sm font-bold text-gray-800 block">Rebajar una parte</span>
              {!cancelarTotal && (
                <input type="number" step="0.01" min="0" max={saldo} value={monto} autoFocus
                       onChange={(e) => setMonto(e.target.value)}
                       className={`${inputCls} mt-2`} placeholder="0.00"/>
              )}
            </span>
          </label>
        </div>

        {excede && <p className="text-xs text-red-600 mb-3">Supera el saldo pendiente de {fmt(saldo)}.</p>}

        {abonado > 0 && (
          <p className="text-sm text-amber-700 mb-4">Para devolver pagos, reversa primero cada abono desde su historial y después emite la nota de crédito. Así se conserva la moneda y la tasa original de cada pago.</p>
        )}

        <div className="mb-5">
          <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Motivo *</p>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls}
                 placeholder="Traspaso revertido, mercancía devuelta…"/>
          <p className="text-xs text-gray-400 mt-1.5">Queda en el historial y en la auditoría.</p>
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl mb-4">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onCerrar} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm">
            Cancelar
          </button>
          <button onClick={guardar} disabled={!valido || guardando}
                  className="flex-[1.4] py-3 rounded-xl bg-red-600 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            {guardando ? <><Loader2 size={16} className="animate-spin"/> Emitiendo…</>
                       : `Acreditar ${fmt(montoNum + (reintegrar && abonado > 0 ? abonado : 0))}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detalle de una cuenta ───────────────────────────────────────────────────
function PanelDetalle({ idDocumento, puedeAbonar, onCerrar, onCambio }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [abonando, setAbonando] = useState(false);
  const [acreditando, setAcreditando] = useState(false);
  const [exportando,setExportando]=useState(false);
  const [errorExportacion,setErrorExportacion]=useState('');

  async function descargar(formato) {
    setExportando(true);setErrorExportacion('');
    try {
      const actual=(await api.get(`/cuentas/${idDocumento}`)).data;
      const {exportarCuenta}=await import('../utils/exportCuenta.js');
      exportarCuenta(actual,formato);setData(actual);
    } catch(e) {setErrorExportacion(e.response?.data?.error||e.message||'No se pudo exportar');}
    finally {setExportando(false);}
  }

  async function cargar() {
    try { setData((await api.get(`/cuentas/${idDocumento}`)).data); }
    catch (e) { setError(e.response?.data?.error || 'No se pudo cargar'); }
  }
  useEffect(() => { cargar(); }, [idDocumento]);

  async function reversar(idAbono) {
    const motivo = window.prompt('¿Por qué se reversa este abono?');
    if (!motivo || motivo.trim().length < 3) return;
    try {
      await api.post(`/cuentas/${idDocumento}/abonos/${idAbono}/reversar`, { motivo });
      cargar(); onCambio();
    } catch (e) { setError(e.response?.data?.error || 'No se pudo reversar'); }
  }

  if (error) return <div className="p-6 text-red-600 text-sm">{error}</div>;
  if (!data) return <div className="p-6 text-gray-400 text-sm">Cargando…</div>;

  const c = data.cuenta;
  const saldo = Number(c.Saldo) || 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4" onClick={onCerrar}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[86vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-100 flex items-start justify-between">
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider">
              {c.Tipo === 'CXP' ? 'Cuenta por pagar' : 'Cuenta por cobrar'} · #{c.idDocumento}
            </p>
            <h2 className="text-xl font-black text-gray-900 mt-1">
              {c.Tipo === 'CXP' ? c.NombreProveedor : c.NombreSucursal}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              {c.OrigenTipo === 'RECEPCION_OC' ? `Recepción #${c.idOrigen}` : `Traspaso #${c.idOrigen}`}
              {c.Folio ? ` · folio ${c.Folio}` : ''}
            </p>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </div>

        <div className="px-6 pt-4 space-y-2">
          <div className="flex gap-4 text-sm font-bold text-vida-blue">
            <button disabled={exportando} onClick={()=>descargar('pdf')}>{exportando?'Generando…':'Descargar PDF'}</button>
            <button disabled={exportando} onClick={()=>descargar('excel')}>Descargar Excel</button>
          </div>
          <p className="text-xs text-gray-500">Estado de cuenta con tasas históricas. No sustituye factura fiscal.</p>
          {errorExportacion&&<p role="alert" className="text-sm text-red-600">{errorExportacion}</p>}
        </div>
        <div className="p-6 grid grid-cols-3 gap-4 border-b border-gray-100">
          <ResumenMoneda datos={c.TasaEmisionJSON} />
          <div><p className="text-xs text-gray-400 font-bold uppercase">Total</p><p className="text-lg font-black tabular-nums">{fmt(c.TotalUSD)}</p></div>
          <div><p className="text-xs text-gray-400 font-bold uppercase">Abonado</p><p className="text-lg font-black tabular-nums text-green-600">{fmt(c.Abonado)}</p></div>
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase">Saldo</p>
            <p className="text-lg font-black tabular-nums">{fmt(saldo)}</p>
            {Number(c.Acreditado) > 0 && (
              <p className="text-xs text-red-500 mt-0.5">{fmt(c.Acreditado)} acreditados</p>
            )}
          </div>
          <div className="col-span-3 flex items-center gap-2 text-sm text-gray-500">
            <Calendar size={15}/>
            Emitida {fmtFecha(c.FechaEmision)} · vence {fmtFecha(c.FechaVencimiento)}
            {c.Vencida
              ? <span className="text-red-600 font-bold">· vencida hace {Math.abs(c.DiasParaVencer)} días</span>
              : (c.Status !== 'LIQUIDADA' && c.DiasParaVencer != null
                  ? <span className="text-gray-400">· faltan {c.DiasParaVencer} días</span> : null)}
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Movimientos</p>
            {puedeAbonar && c.Status !== 'LIQUIDADA' && c.Status !== 'CANCELADA' && (
              <div className="flex items-center gap-4">
                <button onClick={() => setAbonando(true)}
                        className="flex items-center gap-1.5 text-sm font-bold text-vida-blue hover:underline">
                  <Plus size={15}/> {c.Tipo === 'CXP' ? 'Registrar pago' : 'Registrar cobro'}
                </button>
                <button onClick={() => setAcreditando(true)}
                        className="flex items-center gap-1.5 text-sm font-bold text-red-500 hover:underline">
                  <FileMinus size={15}/> Nota de crédito
                </button>
              </div>
            )}
          </div>

          {(data.notasCredito || []).length > 0 && (
            <div className="space-y-2 mb-3">
              {data.notasCredito.map(n => (
                <div key={`nc${n.idNota}`} className="flex items-start gap-3 p-3 rounded-xl bg-red-50 border border-red-100">
                  <Ban size={16} className="text-red-500 mt-0.5 flex-none"/>
                  <div className="min-w-0">
                    <p className="font-bold text-red-700 tabular-nums">
                      −{fmt(n.MontoUSD)}
                      <span className="font-normal text-red-400 text-xs ml-2">
                        nota de crédito{n.CancelaCuenta ? ' · canceló la cuenta' : ''}
                      </span>
                    </p>
                    <p className="text-xs text-red-500/80">{fmtFecha(n.FechaNota)} · {n.Motivo}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.abonos.length === 0 ? (
            (data.notasCredito || []).length === 0 &&
              <p className="text-sm text-gray-400 py-6 text-center">Todavía no hay movimientos.</p>
          ) : (
            <div className="space-y-2">
              {data.abonos.map(a => {
                const neg = Number(a.MontoUSD) < 0;
                return (
                  <div key={a.idAbono} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold tabular-nums ${neg ? 'text-red-600' : 'text-gray-800'}`}>
                        {neg ? '−' : '+'}{fmt(Math.abs(a.MontoUSD))}
                        <span className="block text-xs text-gray-500">{a.MonedaOriginal ? `${a.MontoOriginal} ${a.MonedaOriginal} · ${a.MontoVES ?? 'sin equivalente'} VES · TC ${a.TasaVESporUSD ?? 'no registrada'} · ${a.FechaTasa ? String(a.FechaTasa).slice(0,10) : ''} · ${a.FuenteTasa || ''}` : 'Histórico USD sin tasa registrada'}</span>
                        <span className="font-normal text-gray-400 text-xs ml-2">
                          {a.MetodoPago ? a.MetodoPago.replace('_', ' ') : ''}{a.Referencia ? ` · ${a.Referencia}` : ''}
                        </span>
                      </p>
                      <p className="text-xs text-gray-400">{fmtFecha(a.FechaAbono)}{a.Notas ? ` · ${a.Notas}` : ''}</p>
                    </div>
                    {puedeAbonar && !neg && (
                      <button onClick={() => reversar(a.idAbono)} title="Reversar"
                              className="text-gray-300 hover:text-red-500 flex-none"><RotateCcw size={15}/></button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {abonando && (
          <ModalAbono cuenta={c} onCerrar={() => setAbonando(false)}
                      onHecho={() => { setAbonando(false); cargar(); onCambio(); }}/>
        )}

        {acreditando && (
          <ModalNotaCredito cuenta={c} onCerrar={() => setAcreditando(false)}
                            onHecho={() => { setAcreditando(false); cargar(); onCambio(); }}/>
        )}
      </div>
    </div>
  );
}

// ── Pantalla ────────────────────────────────────────────────────────────────
export default function Cuentas() {
  const usuario = useAuthStore((s) => s.usuario);
  const [tab, setTab]         = useState('CXP');
  const [cuentas, setCuentas] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [verTodo, setVerTodo] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [soloVencidas, setSoloVencidas] = useState(false);
  const [ocultarLiquidadas, setOcultarLiquidadas] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [abierta, setAbierta] = useState(null);

  async function cargar() {
    setLoading(true); setError('');
    try {
      const params = {};
      if (verTodo) params.tipo = tab;
      if (soloVencidas) params.vencidas = '1';
      const r = await api.get('/cuentas', { params });
      setCuentas(r.data.cuentas || []);
      setResumen(r.data.resumen || null);
      setVerTodo(r.data.verTodo !== false);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudieron cargar las cuentas');
    } finally { setLoading(false); }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [tab, soloVencidas]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return cuentas.filter(c => {
      if (ocultarLiquidadas && (c.Status === 'LIQUIDADA' || c.Status === 'CANCELADA')) return false;
      if (!q) return true;
      const nombre = (c.Tipo === 'CXP' ? c.NombreProveedor : c.NombreSucursal) || '';
      return nombre.toLowerCase().includes(q) || String(c.idDocumento).includes(q) || (c.Folio || '').toLowerCase().includes(q);
    });
  }, [cuentas, busqueda, ocultarLiquidadas]);

  const r = resumen?.[tab] || { saldo: 0, vencido: 0, abiertas: 0, vencidas: 0 };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-gray-900">Cuentas</h1>
        <p className="text-gray-500 text-sm mt-1">
          {verTodo
            ? 'Lo que la Matriz le debe a los proveedores y lo que las sucursales le deben a la Matriz'
            : 'Lo que tu tienda le debe a la Matriz'}
        </p>
      </div>

      {verTodo && <MonedaCuentas />}
      {verTodo && (
        <div className="flex gap-1 border-b border-gray-100 mb-6">
          {[['CXP', 'Por pagar', 'proveedores'], ['CXC', 'Por cobrar', 'sucursales']].map(([id, label, sub]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition
                ${tab === id ? 'border-vida-blue text-vida-blue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {label} <span className="font-normal text-gray-400">· {sub}</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Tarjeta icon={tab === 'CXP' ? TrendingDown : TrendingUp}
                 titulo={tab === 'CXP' ? 'Por pagar' : 'Por cobrar'}
                 monto={r.saldo} sub={`${r.abiertas} cuenta${r.abiertas === 1 ? '' : 's'} abierta${r.abiertas === 1 ? '' : 's'}`}
                 tono={tab === 'CXP' ? 'rojo' : 'verde'}/>
        <Tarjeta icon={AlertTriangle} titulo="Vencido" monto={r.vencido}
                 sub={`${r.vencidas} cuenta${r.vencidas === 1 ? '' : 's'} pasada${r.vencidas === 1 ? '' : 's'} de fecha`} tono="ambar"/>
        <Tarjeta icon={Wallet} titulo="Al corriente" monto={Math.max(0, r.saldo - r.vencido)}
                 sub="todavía dentro del plazo" tono="verde"/>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                 placeholder="Buscar por nombre, folio o número" className={`${inputCls} pl-9`}/>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={soloVencidas} onChange={(e) => setSoloVencidas(e.target.checked)}
                 className="w-4 h-4 accent-amber-500"/> Solo vencidas
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={ocultarLiquidadas} onChange={(e) => setOcultarLiquidadas(e.target.checked)}
                 className="w-4 h-4 accent-gray-400"/> Ocultar liquidadas
        </label>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl mb-4">{error}</p>}

      {loading ? (
        <p className="text-center text-gray-400 py-16">Cargando…</p>
      ) : visibles.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CheckCircle2 size={52} className="mx-auto mb-3 opacity-20"/>
          <p className="font-bold text-gray-500">
            {soloVencidas ? 'No hay cuentas vencidas' : 'No hay cuentas pendientes'}
          </p>
          <p className="text-sm mt-1">
            {tab === 'CXP'
              ? 'Las cuentas por pagar nacen al recibir mercancía de una orden de compra.'
              : 'Las cuentas por cobrar nacen cuando una sucursal recibe un traspaso de la Matriz.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-xs font-black text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  <th className="px-5 py-3">{tab === 'CXP' ? 'Proveedor' : 'Sucursal'}</th>
                  <th className="px-5 py-3">Origen</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3 text-right">Saldo</th>
                  <th className="px-5 py-3">Vence</th>
                  <th className="px-5 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(c => (
                  <tr key={c.idDocumento} onClick={() => setAbierta(c.idDocumento)}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                    <td className="px-5 py-3">
                      <p className="font-bold text-gray-800">
                        {(c.Tipo === 'CXP' ? c.NombreProveedor : c.NombreSucursal) || '—'}
                      </p>
                      <p className="text-xs text-gray-400">#{c.idDocumento}{c.Folio ? ` · ${c.Folio}` : ''}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">
                      {c.OrigenTipo === 'RECEPCION_OC' ? `Recepción #${c.idOrigen}` : `Traspaso #${c.idOrigen}`}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-600">{fmt(c.TotalUSD)}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-bold text-gray-900">{fmt(c.Saldo)}</td>
                    <td className="px-5 py-3">
                      <span className={c.Vencida ? 'text-red-600 font-bold' : 'text-gray-500'}>
                        {fmtFecha(c.FechaVencimiento)}
                      </span>
                      {c.Vencida && <span className="block text-xs text-red-500">hace {Math.abs(c.DiasParaVencer)} días</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_COLOR[c.Status]}`}>
                        {c.Status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {abierta && (
        <PanelDetalle idDocumento={abierta} puedeAbonar={verTodo}
                      onCerrar={() => setAbierta(null)} onCambio={cargar}/>
      )}
    </div>
  );
}
