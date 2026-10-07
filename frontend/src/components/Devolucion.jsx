// src/components/Devolucion.jsx
// Devolver una venta (total o parcial): la mercancía vuelve al inventario, el
// reembolso sale de la caja abierta (o por otro medio) y, si hay factura, se
// emite la nota de crédito por lo devuelto.
import { useEffect, useState } from 'react';
import { X, Undo2 } from 'lucide-react';
import api from '../services/api.js';
import { useToast } from './Toast.jsx';
import { numeroDoc } from '../utils/libroVentas.mjs';

export const ROLES_DEVUELVEN = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'];
const campo = 'border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vida-blue bg-white';

export function ModalDevolucion({ idPedido, onCerrar, onHecha }) {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [cant, setCant] = useState({});
  const [motivo, setMotivo] = useState('');
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [moneda, setMoneda] = useState('USD');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get(`/pedidos/${idPedido}/devoluciones`).then(r => {
      setD(r.data);
      setMoneda(r.data.pedido.MonedaPago === 'VES' ? 'VES' : 'USD');
      if (['TARJETA'].includes(r.data.pedido.MetodoPago)) setMetodo('EXTERNO');
    }).catch(e => setError(e.response?.data?.error || 'No se pudo cargar la venta'));
  }, [idPedido]);

  const resta = l => Number(l.Cantidad) - Number(l.CantidadDevuelta);
  const items = d ? d.lineas.filter(l => Number(cant[l.idDetalle]) > 0).map(l => ({ idDetalle: l.idDetalle, Cantidad: Number(cant[l.idDetalle]) })) : [];
  // Estimado: el servidor aplica el descuento de la venta en proporción
  const subtotal = d ? d.lineas.reduce((s, l) => s + Number(l.Cantidad) * Number(l.PrecioUnitario), 0) : 0;
  const factor = subtotal > 0 ? Number(d.pedido.TotalUSD) / subtotal : 0;
  const estimadoUSD = d ? items.reduce((s, i) => s + i.Cantidad * Number(d.lineas.find(l => l.idDetalle === i.idDetalle).PrecioUnitario) * factor, 0) : 0;
  const sinControl = d?.pedido.idFactura && d.pedido.StatusFactura === 'PENDIENTE_CONTROL';

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = await api.post(`/pedidos/${idPedido}/devolucion`, {
        Items: items, Motivo: motivo, MetodoReembolso: metodo, Moneda: metodo === 'EFECTIVO' ? moneda : undefined,
      });
      const x = r.data;
      toast.success(`Devolución de $${Number(x.MontoUSD).toFixed(2)} registrada`,
        [x.MontoReembolso != null && `Entrega ${Number(x.MontoReembolso).toFixed(2)} ${x.Moneda} de la caja`,
         x.NumeroNotaCredito && `Nota de crédito N° ${numeroDoc(x.NumeroNotaCredito)}`].filter(Boolean).join(' · '));
      onHecha?.(x);
    } catch (err) {
      toast.error('No se registró la devolución', err.response?.data?.error || 'Intenta de nuevo');
    } finally { setEnviando(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-black text-gray-900">Devolución · venta #{idPedido}</h2>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!d && !error && <p className="text-sm text-gray-400">Cargando…</p>}
          {d && (
            <form onSubmit={enviar} className="space-y-4">
              {sinControl && <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">La factura de esta venta no tiene número de control: regístralo antes de devolver.</p>}
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
                {d.lineas.map(l => (
                  <div key={l.idDetalle} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{l.NombreProducto || `Producto #${l.idProducto}`}</p>
                      <p className="text-xs text-gray-400">Vendido {Number(l.Cantidad)} × ${Number(l.PrecioUnitario).toFixed(2)}
                        {Number(l.CantidadDevuelta) > 0 && ` · ya devuelto ${Number(l.CantidadDevuelta)}`}</p>
                    </div>
                    <input type="number" min="0" max={resta(l)} step="any" disabled={resta(l) <= 0}
                      value={cant[l.idDetalle] ?? ''} placeholder="0"
                      onChange={e => setCant({ ...cant, [l.idDetalle]: e.target.value })}
                      className={`${campo} w-20 text-right`} />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                {[['EFECTIVO', 'Efectivo de la caja'], ['EXTERNO', 'Otro medio (tarjeta, Pago Móvil)']].map(([v, t]) => (
                  <label key={v} className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer ${metodo === v ? 'border-vida-blue bg-blue-50' : 'border-gray-200'}`}>
                    <input type="radio" checked={metodo === v} onChange={() => setMetodo(v)} /> {t}
                  </label>
                ))}
                {metodo === 'EFECTIVO' && (
                  <select value={moneda} onChange={e => setMoneda(e.target.value)} className={campo}>
                    <option value="USD">en USD</option>
                    <option value="VES" disabled={!d.tasa}>en VES</option>
                  </select>
                )}
              </div>
              <input className={`${campo} w-full`} placeholder="Motivo (ej. producto dañado)" value={motivo}
                onChange={e => setMotivo(e.target.value)} required minLength={5} maxLength={300} />
              <div className="text-sm bg-gray-50 rounded-xl p-3">
                <p>A reembolsar (estimado): <b>${estimadoUSD.toFixed(2)}</b>
                  {metodo === 'EFECTIVO' && moneda === 'VES' && d.tasa && <> · <b>{(estimadoUSD * d.tasa).toFixed(2)} VES</b> a la tasa de la venta</>}</p>
                <p className="text-xs text-gray-500 mt-1">La mercancía vuelve al inventario.{d.pedido.idFactura ? ' Se emite la nota de crédito por lo devuelto.' : ''}
                  {' '}No revierte puntos ni cupones.</p>
              </div>
              <button disabled={enviando || !items.length || sinControl}
                className="w-full flex items-center justify-center gap-2 bg-red-600 text-white font-bold rounded-xl py-2.5 disabled:opacity-40">
                <Undo2 size={16} /> {enviando ? 'Registrando…' : 'Registrar devolución'}
              </button>
              {d.devoluciones.length > 0 && (
                <div className="text-xs text-gray-500">
                  <p className="font-semibold mb-1">Devoluciones anteriores</p>
                  {d.devoluciones.map(v => (
                    <p key={v.idDevolucion}>{new Date(v.FechaAlta).toLocaleString('es-VE', { timeZone: 'America/Caracas' })} · ${Number(v.MontoUSD).toFixed(2)}
                      {v.MontoReembolso != null ? ` (${Number(v.MontoReembolso).toFixed(2)} ${v.Moneda} de caja)` : ' (otro medio)'} · {v.Motivo}</p>
                  ))}
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
