// src/components/Factura.jsx
// Factura fiscal: emitir desde una venta, ver / imprimir, registrar el número de
// control (máquina fiscal o imprenta digital) y emitir la nota de crédito.
import { useEffect, useState } from 'react';
import { FileText, Printer, X, Hash, Undo2, AlertTriangle } from 'lucide-react';
import api from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';
import { useToast } from './Toast.jsx';
import { bs, numeroDoc, formatearDocumento } from '../utils/libroVentas.mjs';

const ROLES_EMITEN = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'CAJERO', 'CASHIER'];
const ROLES_ANULAN = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'];
const errorDe = (e, def) => e.response?.data?.error || def;
const input = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vida-blue';

function Modal({ titulo, onCerrar, children, ancho = 'max-w-md' }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 print:hidden" onClick={onCerrar}>
      <div className={`bg-white rounded-2xl shadow-xl w-full ${ancho} max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-black text-gray-900">{titulo}</h2>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Emitir ──────────────────────────────────────────────────────────────────
export function ModalFacturar({ idPedido, receptorInicial = {}, onCerrar, onEmitida }) {
  const toast = useToast();
  const [r, setR] = useState({ Documento: '', Nombre: '', Domicilio: '', ...receptorInicial });
  const [enviando, setEnviando] = useState(false);

  async function emitir(e) {
    e.preventDefault();
    setEnviando(true);
    try {
      const res = await api.post('/facturas', { idPedido, Receptor: r });
      toast.success(`Factura N° ${numeroDoc(res.data.Numero)} emitida`, 'Queda pendiente del número de control');
      onEmitida(res.data.idFactura);
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.idFactura) onEmitida(err.response.data.idFactura);
      else toast.error('No se pudo facturar', errorDe(err, 'Intenta de nuevo'));
    } finally { setEnviando(false); }
  }

  return (
    <Modal titulo={`Facturar pedido #${idPedido}`} onCerrar={onCerrar}>
      <form onSubmit={emitir} className="space-y-3">
        <label className="block text-sm">
          <span className="font-semibold text-gray-700">RIF o cédula del cliente</span>
          <input className={input} value={r.Documento} onChange={e => setR({ ...r, Documento: e.target.value })}
            placeholder="J-12345678-9 o V-12345678" required autoFocus />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-gray-700">Nombre o razón social</span>
          <input className={input} value={r.Nombre} onChange={e => setR({ ...r, Nombre: e.target.value })} required maxLength={200} />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-gray-700">Domicilio fiscal <span className="font-normal text-gray-400">(opcional)</span></span>
          <input className={input} value={r.Domicilio} onChange={e => setR({ ...r, Domicilio: e.target.value })} maxLength={500} />
        </label>
        <p className="text-xs text-gray-500">
          Los montos se calculan en bolívares con la tasa de la venta; el IVA ya está incluido en los precios.
        </p>
        <button disabled={enviando} className="w-full bg-vida-blue text-white font-bold rounded-xl py-2.5 disabled:opacity-50">
          {enviando ? 'Emitiendo…' : 'Emitir factura'}
        </button>
      </form>
    </Modal>
  );
}

// ── Documento (pantalla e impresión) ────────────────────────────────────────
function Fila({ etiqueta, valor, fuerte }) {
  return (
    <div className={`flex justify-between gap-4 ${fuerte ? 'font-black text-base' : ''}`}>
      <span>{etiqueta}</span><span className="tabular-nums">{valor}</span>
    </div>
  );
}

export function DocumentoFactura({ f }) {
  const nc = f.TipoDocumento === 'NOTA_CREDITO';
  const fecha = new Date(f.FechaEmision).toLocaleString('es-VE', { timeZone: 'America/Caracas' });
  const marca = { EXENTO: ' (E)', REDUCIDA: ' (R)' };
  return (
    <div className="font-mono text-xs text-gray-900 space-y-3">
      {f.Status === 'PENDIENTE_CONTROL' && (
        <p className="border border-amber-400 bg-amber-50 text-amber-800 rounded-lg p-2 text-center font-bold">
          PENDIENTE DE NÚMERO DE CONTROL — NO VÁLIDA COMO DOCUMENTO FISCAL
        </p>
      )}
      <div className="text-center">
        <p className="font-black text-sm">{f.EmisorRazonSocial}</p>
        <p>RIF {formatearDocumento(f.EmisorRIF)}</p>
        <p>{f.EmisorDomicilio}</p>
        {f.EmisorContribuyenteEspecial && <p>Contribuyente especial</p>}
      </div>
      <div className="border-y border-dashed border-gray-400 py-2 space-y-0.5">
        <Fila etiqueta={nc ? 'NOTA DE CRÉDITO N°' : 'FACTURA N°'} valor={numeroDoc(f.Numero)} fuerte />
        <Fila etiqueta="N° de control" valor={f.NumeroControl || 'PENDIENTE'} />
        {f.SerialMaquina && <Fila etiqueta="Máquina fiscal" valor={f.SerialMaquina} />}
        <Fila etiqueta="Fecha y hora" valor={fecha} />
        {nc && <Fila etiqueta="Factura afectada" valor={`${numeroDoc(f.NumeroAfectada)} · control ${f.ControlAfectada || '-'}`} />}
        {nc && f.Motivo && <p>Motivo: {f.Motivo}</p>}
      </div>
      <div>
        <p>Cliente: {f.ReceptorNombre}</p>
        <p>RIF/C.I.: {formatearDocumento(f.ReceptorDocumento)}</p>
        {f.ReceptorDomicilio && <p>Domicilio: {f.ReceptorDomicilio}</p>}
      </div>
      <div className="border-t border-dashed border-gray-400 pt-2 space-y-1">
        {f.lineas.map(l => (
          <div key={l.Linea}>
            <p>{l.Descripcion}{marca[l.Alicuota] || ''}</p>
            <Fila etiqueta={`${Number(l.Cantidad)} × ${bs(l.PrecioUnitarioVES)}`} valor={bs(l.TotalVES)} />
          </div>
        ))}
      </div>
      <div className="border-t border-dashed border-gray-400 pt-2 space-y-0.5">
        <Fila etiqueta="Subtotal" valor={bs(f.SubtotalVES)} />
        {Number(f.DescuentoVES) > 0 && <Fila etiqueta="Descuento" valor={`-${bs(f.DescuentoVES)}`} />}
        {Number(f.ExentoVES) > 0 && <Fila etiqueta="Exento (E)" valor={bs(f.ExentoVES)} />}
        {Number(f.BaseGeneralVES) > 0 && <>
          <Fila etiqueta={`Base imponible G ${Number(f.PctGeneral)}%`} valor={bs(f.BaseGeneralVES)} />
          <Fila etiqueta={`IVA G ${Number(f.PctGeneral)}%`} valor={bs(f.IVAGeneralVES)} />
        </>}
        {Number(f.BaseReducidaVES) > 0 && <>
          <Fila etiqueta={`Base imponible R ${Number(f.PctReducida)}%`} valor={bs(f.BaseReducidaVES)} />
          <Fila etiqueta={`IVA R ${Number(f.PctReducida)}%`} valor={bs(f.IVAReducidaVES)} />
        </>}
        <Fila etiqueta="TOTAL Bs" valor={bs(f.TotalVES)} fuerte />
        {Number(f.IGTFVES) > 0 && <>
          <Fila etiqueta={`IGTF 3% s/ ${bs(f.IGTFBaseVES)} pagado en divisas`} valor={bs(f.IGTFVES)} />
          <Fila etiqueta="TOTAL A PAGAR Bs" valor={bs(f.TotalPagarVES)} fuerte />
        </>}
      </div>
      <p className="text-center text-gray-600">
        Equivalente: USD {Number(f.TotalUSD).toFixed(2)} · tasa {Number(f.TasaVESporUSD).toLocaleString('es-VE', { maximumFractionDigits: 4 })} Bs/USD
        {f.FechaTasa ? ` del ${String(f.FechaTasa).slice(0, 10)}` : ''}{f.FuenteTasa ? ` (${f.FuenteTasa})` : ''}
      </p>
      {f.Modalidad === 'MAQUINA_FISCAL' && (
        <p className="text-center text-gray-500">El documento fiscal es el que imprime la máquina fiscal; esta es una representación.</p>
      )}
    </div>
  );
}

// ── Ver, imprimir, número de control y nota de crédito ─────────────────────
export function VistaFactura({ idFactura, onCerrar, onCambio }) {
  const toast = useToast();
  const { usuario } = useAuthStore();
  const [f, setF] = useState(null);
  const [error, setError] = useState(null);
  const [accion, setAccion] = useState(null); // 'control' | 'nc'
  const [form, setForm] = useState({ NumeroControl: '', SerialMaquina: '', Motivo: '' });
  const [enviando, setEnviando] = useState(false);

  const cargar = (id) => api.get(`/facturas/${id}`).then(r => { setF(r.data); setError(null); })
    .catch(e => setError(errorDe(e, 'No se pudo cargar la factura')));
  useEffect(() => { cargar(idFactura); }, [idFactura]);

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    try {
      if (accion === 'control') {
        await api.post(`/facturas/${f.idFactura}/control`, { NumeroControl: form.NumeroControl, SerialMaquina: form.SerialMaquina || undefined });
        toast.success('Número de control registrado');
        await cargar(f.idFactura);
      } else {
        const r = await api.post(`/facturas/${f.idFactura}/nota-credito`, { Motivo: form.Motivo });
        toast.success(`Nota de crédito N° ${numeroDoc(r.data.Numero)} emitida`, 'Queda pendiente del número de control');
        await cargar(r.data.idFactura);
      }
      setAccion(null);
      onCambio?.();
    } catch (err) {
      toast.error('No se pudo completar', errorDe(err, 'Intenta de nuevo'));
    } finally { setEnviando(false); }
  }

  const rol = usuario?.TipoUsuario;
  const titulo = f ? `${f.TipoDocumento === 'NOTA_CREDITO' ? 'Nota de crédito' : 'Factura'} N° ${numeroDoc(f.Numero)}` : 'Factura';
  return (
    <>
      {f && <div className="hidden print:block fixed inset-0 bg-white p-6 z-[200]"><DocumentoFactura f={f} /></div>}
      <Modal titulo={titulo} onCerrar={onCerrar} ancho="max-w-lg">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!f && !error && <p className="text-sm text-gray-400">Cargando…</p>}
        {f && <>
          <DocumentoFactura f={f} />
          <div className="flex flex-wrap gap-2 mt-5">
            <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold">
              <Printer size={14} /> Imprimir
            </button>
            {f.Status === 'PENDIENTE_CONTROL' && ROLES_EMITEN.includes(rol) && (
              <button onClick={() => setAccion('control')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold">
                <Hash size={14} /> Registrar n° de control
              </button>
            )}
            {f.TipoDocumento === 'FACTURA' && f.Status === 'EMITIDA' && !f.idNotaCredito && ROLES_ANULAN.includes(rol) && (
              <button onClick={() => setAccion('nc')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-semibold">
                <Undo2 size={14} /> Nota de crédito
              </button>
            )}
            {f.idNotaCredito && (
              <button onClick={() => cargar(f.idNotaCredito)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold">
                <FileText size={14} /> Ver nota de crédito N° {numeroDoc(f.NumeroNotaCredito)}
              </button>
            )}
          </div>
          {accion && (
            <form onSubmit={enviar} className="mt-4 p-4 rounded-xl bg-gray-50 space-y-3">
              {accion === 'control' ? <>
                <input className={input} placeholder="Número de control (ej. 00-00012345)" value={form.NumeroControl}
                  onChange={e => setForm({ ...form, NumeroControl: e.target.value })} required maxLength={40} />
                {f.Modalidad === 'MAQUINA_FISCAL' && (
                  <input className={input} placeholder="Serial de la máquina fiscal" value={form.SerialMaquina}
                    onChange={e => setForm({ ...form, SerialMaquina: e.target.value })} required maxLength={40} />
                )}
                <p className="text-xs text-gray-500">Se registra una sola vez y no se puede corregir.</p>
              </> : <>
                <p className="flex gap-2 text-xs text-red-700"><AlertTriangle size={14} className="shrink-0" />
                  Anula fiscalmente la factura completa. No devuelve inventario ni dinero: eso se hace aparte.</p>
                <input className={input} placeholder="Motivo (ej. devolución del cliente)" value={form.Motivo}
                  onChange={e => setForm({ ...form, Motivo: e.target.value })} required minLength={5} maxLength={300} />
              </>}
              <div className="flex gap-2">
                <button disabled={enviando} className="flex-1 bg-vida-blue text-white font-bold rounded-xl py-2 disabled:opacity-50">
                  {enviando ? 'Guardando…' : accion === 'control' ? 'Registrar' : 'Emitir nota de crédito'}
                </button>
                <button type="button" onClick={() => setAccion(null)} className="px-4 rounded-xl border border-gray-200 text-sm">Cancelar</button>
              </div>
            </form>
          )}
        </>}
      </Modal>
    </>
  );
}

export const puedeFacturar = (usuario) => ROLES_EMITEN.includes(usuario?.TipoUsuario);
