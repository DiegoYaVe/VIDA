// Ventas offline que el servidor rechazó al sincronizar. Quedan guardadas en
// el servidor (el dinero ya se cobró) hasta que un administrador las registra
// (reintentando, p. ej. tras reactivar un producto) o las anula con motivo.
import { useState, useEffect, useCallback } from 'react';
import { AlertOctagon, X, RefreshCw, Ban } from 'lucide-react';
import api from '../services/api.js';

export const ROLES_RESUELVEN = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN'];
const fecha = (f) => (f ? new Date(f).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const usd = (n) => (n == null ? '—' : `$${Number(n).toFixed(2)}`);

// Pendientes de una tienda (o de todo el alcance), para avisos y badges
export function useVentasEnRevision(idPuntoVenta = null) {
  const [pendientes, setPendientes] = useState([]);
  const recargar = useCallback(async () => {
    try {
      const r = await api.get('/pedidos/offline-revision', { params: { status: 'PENDIENTE', idPuntoVenta: idPuntoVenta || undefined } });
      setPendientes(r.data.data || []);
    } catch { setPendientes([]); /* sin permiso o sin red: no se muestra */ }
  }, [idPuntoVenta]);
  useEffect(() => { recargar(); }, [recargar]);
  return { pendientes, recargar };
}

export function BotonVentasRevision({ usuario, onCambio }) {
  const { pendientes, recargar } = useVentasEnRevision();
  const [abierto, setAbierto] = useState(false);
  if (!pendientes.length && !abierto) return null;
  return <>
    <button onClick={() => setAbierto(true)}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border bg-red-50 border-red-200 text-red-700 hover:bg-red-100 transition-all">
      <AlertOctagon size={13} />
      Ventas offline rechazadas
      <span className="bg-red-600 text-white rounded-full px-1.5 text-[10px] font-bold">{pendientes.length}</span>
    </button>
    {abierto && <ModalVentasRevision usuario={usuario}
      onClose={() => { setAbierto(false); recargar(); }}
      onCambio={() => { recargar(); onCambio?.(); }} />}
  </>;
}

function ModalVentasRevision({ usuario, onClose, onCambio }) {
  const puedeResolver = ROLES_RESUELVEN.includes(usuario?.TipoUsuario);
  const [status, setStatus] = useState('PENDIENTE');
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(null);
  const [anulando, setAnulando] = useState(null);
  const [motivo, setMotivo] = useState('');

  const cargar = useCallback(async () => {
    setFilas(null); setError('');
    try { setFilas((await api.get('/pedidos/offline-revision', { params: { status } })).data.data || []); }
    catch (e) { setFilas([]); setError(e.response?.data?.error || 'No se pudieron cargar'); }
  }, [status]);
  useEffect(() => { cargar(); }, [cargar]);

  async function reintentar(f) {
    setOcupado(f.ClienteUUID); setError(''); setAviso('');
    try {
      const { data } = await api.post(`/pedidos/offline-revision/${encodeURIComponent(f.ClienteUUID)}/reintentar`);
      setAviso(`Venta registrada como pedido #${data.idPedido}${data.ventaTardia ? ' (venta tardía: no suma al cierre de su turno)' : ''}${data.requiereRevision ? '; quedó marcada por stock insuficiente' : ''}.`);
      await cargar(); onCambio();
    } catch (e) { setError(e.response?.data?.error || 'No se pudo reintentar'); await cargar(); }
    finally { setOcupado(null); }
  }

  async function anular(f) {
    setOcupado(f.ClienteUUID); setError(''); setAviso('');
    try {
      await api.post(`/pedidos/offline-revision/${encodeURIComponent(f.ClienteUUID)}/anular`, { Motivo: motivo.trim() });
      setAnulando(null); setMotivo(''); setAviso('Venta anulada. Queda en el historial con tu motivo.');
      await cargar(); onCambio();
    } catch (e) { setError(e.response?.data?.error || 'No se pudo anular'); }
    finally { setOcupado(null); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-vrev" className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h3 id="titulo-vrev" className="font-bold text-gray-800">Ventas offline rechazadas</h3>
            <p className="text-xs text-gray-500 mt-0.5">El POS las cobró sin conexión y el servidor no pudo registrarlas. El dinero ya se recibió: regístralas o anúlalas explicando qué pasó.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="px-5 pt-4 flex gap-1">
          {[['PENDIENTE', 'Pendientes'], ['REGISTRADA', 'Registradas'], ['ANULADA', 'Anuladas']].map(([v, l]) => (
            <button key={v} onClick={() => setStatus(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${status === v ? 'bg-vida-blue text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{l}</button>
          ))}
        </div>
        {(error || aviso) && <p role={error ? 'alert' : 'status'} className={`mx-5 mt-3 text-sm rounded-lg px-3 py-2 ${error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{error || aviso}</p>}
        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          {filas === null ? <p className="text-center text-gray-400 py-8 text-sm">Cargando…</p>
            : filas.length === 0 ? <p className="text-center text-gray-400 py-8 text-sm">No hay ventas {status === 'PENDIENTE' ? 'pendientes' : status === 'REGISTRADA' ? 'registradas' : 'anuladas'}.</p>
            : filas.map(f => (
              <div key={f.ClienteUUID} className="border border-gray-200 rounded-xl p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-800">{usd(f.TotalUSD)} · {f.NombreSucursal || `Tienda ${f.idPuntoVenta ?? '—'}`}</p>
                    <p className="text-xs text-gray-500">
                      Vendida {fecha(f.FechaVenta)} por {f.NombreCajero || `usuario ${f.idUsuario}`}
                      {f.MetodoPago ? ` · ${f.MetodoPago}${f.Moneda ? ` ${f.Moneda}` : ''}` : ''} · ref. {String(f.ClienteUUID).slice(-8).toUpperCase()}
                    </p>
                  </div>
                  {f.Status === 'PENDIENTE' && <span className="text-[11px] text-gray-500">{f.Intentos} intento{f.Intentos === 1 ? '' : 's'}</span>}
                  {f.Status === 'REGISTRADA' && <span className="text-xs font-semibold text-green-700">Pedido #{f.idPedido} · {fecha(f.FechaResuelta)}</span>}
                  {f.Status === 'ANULADA' && <span className="text-xs font-semibold text-gray-600">Anulada {fecha(f.FechaResuelta)}</span>}
                </div>
                <p className="text-sm text-red-700"><span className="font-semibold">Motivo del rechazo:</span> {f.Motivo}</p>
                {f.Resolucion && <p className="text-sm text-gray-700"><span className="font-semibold">Motivo de anulación:</span> {f.Resolucion}</p>}
                {f.Items?.length > 0 && <ul className="text-xs text-gray-600 list-disc pl-5">
                  {f.Items.map((i, k) => <li key={k}>{i.Cantidad} × {i.Nombre || `producto ${i.idProducto}`} a {usd(i.PrecioUnitario)}</li>)}
                </ul>}
                {f.Status === 'PENDIENTE' && puedeResolver && (anulando === f.ClienteUUID ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-gray-700" htmlFor={`mot-${f.ClienteUUID}`}>¿Por qué se anula y qué se hizo con el dinero?</label>
                    <textarea id={`mot-${f.ClienteUUID}`} className="input-field text-sm" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)}
                      placeholder="Ej.: venta duplicada en otro equipo, el pedido #123 ya la registró" />
                    <div className="flex gap-2">
                      <button disabled={ocupado === f.ClienteUUID || motivo.trim().length < 10} onClick={() => anular(f)}
                        className="flex items-center gap-1 bg-red-600 text-white text-xs px-3 py-2 rounded-lg disabled:opacity-50"><Ban size={12} /> Confirmar anulación</button>
                      <button onClick={() => { setAnulando(null); setMotivo(''); }} className="text-xs px-3 py-2 rounded-lg border">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button disabled={ocupado === f.ClienteUUID} onClick={() => reintentar(f)}
                      className="flex items-center gap-1 bg-vida-blue text-white text-xs px-3 py-2 rounded-lg disabled:opacity-50">
                      <RefreshCw size={12} className={ocupado === f.ClienteUUID ? 'animate-spin' : ''} /> Reintentar registro
                    </button>
                    <button disabled={ocupado === f.ClienteUUID} onClick={() => { setAnulando(f.ClienteUUID); setMotivo(''); }}
                      className="flex items-center gap-1 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg hover:bg-red-50"><Ban size={12} /> Anular</button>
                  </div>
                ))}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
