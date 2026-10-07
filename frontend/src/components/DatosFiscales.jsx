// src/components/DatosFiscales.jsx
// Datos fiscales de una tienda: es el emisor de sus facturas (su RIF, su
// razón social, su domicilio fiscal y su modalidad de facturación).
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import api from '../services/api.js';
import { useToast } from './Toast.jsx';
import { formatearDocumento } from '../utils/libroVentas.mjs';

const MODALIDADES = [
  ['NINGUNA', 'No factura (solo tickets de venta)'],
  ['MAQUINA_FISCAL', 'Máquina fiscal (ventas en tienda)'],
  ['IMPRENTA_DIGITAL', 'Imprenta digital autorizada (factura digital)'],
];
const input = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vida-blue disabled:bg-gray-50 disabled:text-gray-500';

export default function ModalDatosFiscales({ idPuntoVenta, onCerrar }) {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api.get(`/facturas/datos-fiscales/${idPuntoVenta}`)
      .then(r => setD({ ...r.data, RIF: r.data.RIF ? formatearDocumento(r.data.RIF) : '' }))
      .catch(e => setError(e.response?.data?.error || 'No se pudieron cargar los datos fiscales'));
  }, [idPuntoVenta]);

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      await api.put(`/facturas/datos-fiscales/${idPuntoVenta}`, {
        RIF: d.RIF || null, RazonSocial: d.RazonSocial, DomicilioFiscal: d.DomicilioFiscal,
        ModalidadFiscal: d.ModalidadFiscal, ContribuyenteEspecial: d.ContribuyenteEspecial,
      });
      toast.success('Datos fiscales guardados');
      onCerrar();
    } catch (err) {
      toast.error('No se guardó', err.response?.data?.error || 'Intenta de nuevo');
    } finally { setGuardando(false); }
  }

  const soloLectura = d && !d.puedeEditar;
  const set = (k) => (e) => setD({ ...d, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-black text-gray-900">Datos fiscales{d ? ` · ${d.NomComercial}` : ''}</h2>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!d && !error && <p className="text-sm text-gray-400">Cargando…</p>}
          {d && (
            <form onSubmit={guardar} className="space-y-3">
              <fieldset disabled={soloLectura} className="space-y-3">
                <label className="block text-sm">
                  <span className="font-semibold text-gray-700">Modalidad de facturación</span>
                  <select className={input} value={d.ModalidadFiscal} onChange={set('ModalidadFiscal')}>
                    {MODALIDADES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-semibold text-gray-700">RIF</span>
                  <input className={input} value={d.RIF} onChange={set('RIF')} placeholder="J-12345678-9"
                    disabled={soloLectura || (d.Documentos > 0 && !!d.RIF)} />
                  {d.Documentos > 0 && <span className="text-xs text-gray-400">Ya emitió {d.Documentos} documento(s): el RIF no se puede cambiar.</span>}
                </label>
                <label className="block text-sm">
                  <span className="font-semibold text-gray-700">Razón social</span>
                  <input className={input} value={d.RazonSocial || ''} onChange={set('RazonSocial')} maxLength={200} />
                </label>
                <label className="block text-sm">
                  <span className="font-semibold text-gray-700">Domicilio fiscal</span>
                  <textarea className={input} rows={2} value={d.DomicilioFiscal || ''} onChange={set('DomicilioFiscal')} maxLength={500} />
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={!!d.ContribuyenteEspecial} onChange={set('ContribuyenteEspecial')} />
                  <span>
                    <span className="font-semibold text-gray-700">Contribuyente especial</span>
                    <span className="block text-xs text-gray-500">La factura agrega el IGTF (3%) sobre lo pagado en divisas.</span>
                  </span>
                </label>
              </fieldset>
              <p className="text-xs text-gray-500">
                IVA vigente: general {d.alicuotas?.GENERAL}% · reducida {d.alicuotas?.REDUCIDA}% · exento. La alícuota de cada producto se fija en Inventario.
              </p>
              {soloLectura
                ? <p className="text-xs text-gray-500">Solo el SUPER_ADMIN o el administrador de la tienda editan estos datos.</p>
                : <button disabled={guardando} className="w-full bg-vida-blue text-white font-bold rounded-xl py-2.5 disabled:opacity-50">
                    {guardando ? 'Guardando…' : 'Guardar'}
                  </button>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
