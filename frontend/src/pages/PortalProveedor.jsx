// src/pages/PortalProveedor.jsx
// Portal de proveedores (tarea 24): pantalla pública para el proveedor que no
// tiene API. Entra con el enlace secreto que VIDA le da; ve sus pedidos de VIDA
// (sin datos de la tienda), los confirma, los marca listos y entrega contra el
// código del QR.
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Package, Check, Truck, MapPin, RefreshCw, ClipboardCheck, KeyRound, FileText } from 'lucide-react';
import api from '../services/api.js';
import { descargarOrdenCompra } from '../utils/ordenCompraPDF.js';

const USD = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const FECHA = (f) => f ? new Date(f).toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const STATUS = {
  ENVIADO:    { label: 'Nuevo', color: 'bg-blue-100 text-blue-700' },
  CONFIRMADO: { label: 'Preparando', color: 'bg-amber-100 text-amber-700' },
  LISTO:      { label: 'Listo para entregar', color: 'bg-teal-100 text-teal-700' },
  RETIRADO:   { label: 'Entregado', color: 'bg-green-100 text-green-700' },
  RECIBIDO:   { label: 'Entregado', color: 'bg-green-100 text-green-700' },
};

function Pedido({ ped, token, onCambio, proveedor }) {
  const [codigo, setCodigo] = useState('');
  const [notas, setNotas] = useState('');
  const [proc, setProc] = useState(false);
  const [error, setError] = useState('');
  const c = STATUS[ped.Status] || { label: ped.Status, color: 'bg-gray-100 text-gray-600' };

  async function hacer(accion, body = {}) {
    setProc(true); setError('');
    try {
      await api.post(`/portal-proveedor/${token}/pedidos/${encodeURIComponent(ped.Folio)}/${accion}`, body);
      onCambio();
    } catch (e) { setError(e.response?.data?.error || 'No se pudo actualizar'); }
    finally { setProc(false); }
  }

  return (
    <article className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Package size={16} className="text-vida-blue" />
        <h2 className="font-black text-gray-900 font-mono">{ped.Folio}</h2>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.color}`}>{c.label}</span>
        <span className="ml-auto text-xs text-gray-400">{FECHA(ped.FechaAlta)}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
        <span className="inline-flex items-center gap-1.5"><Truck size={14} className="text-gray-400" />
          {ped.Recoge === 'CLIENTE_VIDA' ? 'Lo recoge un cliente de VIDA' : 'Lo recoge un repartidor de VIDA'}</span>
        {ped.Sucursal && <span className="inline-flex items-center gap-1.5"><MapPin size={14} className="text-gray-400" /> {ped.Sucursal}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-400 uppercase">
            <th className="py-1 pr-2 font-semibold">Producto</th><th className="py-1 pr-2 font-semibold">Tu código</th>
            <th className="py-1 pr-2 font-semibold text-right">Cant.</th><th className="py-1 font-semibold text-right">Precio lista</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {ped.productos.map((p, i) => (
              <tr key={i}>
                <td className="py-1.5 pr-2 text-gray-800">{p.Nombre}{p.SKU ? <span className="text-gray-400"> · {p.SKU}</span> : null}</td>
                <td className="py-1.5 pr-2 text-gray-500 font-mono text-xs">{p.CodigoProveedor || '—'}</td>
                <td className="py-1.5 pr-2 text-right font-bold">{Number(p.Cantidad)}</td>
                <td className="py-1.5 text-right text-gray-600">{USD(p.PrecioLista)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-sm border-t border-gray-100 pt-2">
        <span className="text-gray-500">Total lista {USD(ped.TotalListaUSD)}</span>
        <span className="text-gray-500">Comisión VIDA {Number(ped.ComisionPct)} %</span>
        <span className="font-black text-vida-blue">VIDA te paga {USD(ped.TotalPagarUSD)}</span>
      </div>
      <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-1.5">Ya está pagado a VIDA. VIDA te paga de contado al recibir la mercancía, sin días de crédito.</p>
      <button onClick={() => descargarOrdenCompra({
          Folio: ped.Folio, Fecha: ped.FechaAlta, Entrega: ped.Recoge === 'CLIENTE_VIDA' ? 'RECOGE_CLIENTE_VIDA' : 'REPARTIDOR_VIDA',
          proveedor: { Nombre: proveedor }, retiro: ped.Sucursal || ped.DireccionSucursal ? { Sucursal: ped.Sucursal, Direccion: ped.DireccionSucursal } : null,
          lineas: ped.productos, TotalListaUSD: ped.TotalListaUSD, ComisionPct: ped.ComisionPct, TotalPagarUSD: ped.TotalPagarUSD,
          portalUrl: window.location.href,
        }).catch(() => {})}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-vida-blue border border-vida-blue/30 rounded-lg px-3 py-1.5 hover:bg-vida-blue-light">
        <FileText size={13} /> Orden de compra (PDF)
      </button>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {ped.Status === 'ENVIADO' && (
        <div className="space-y-2">
          <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Nota para VIDA (opcional: algo que falte, fecha…)"
            aria-label="Nota para VIDA" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <button disabled={proc} onClick={() => hacer('confirmar', { Notas: notas.trim() || null })}
            className="w-full flex items-center justify-center gap-2 bg-vida-blue text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50">
            <ClipboardCheck size={15} /> Confirmar pedido
          </button>
        </div>
      )}
      {ped.Status === 'CONFIRMADO' && (
        <button disabled={proc} onClick={() => hacer('listo')}
          className="w-full flex items-center justify-center gap-2 bg-teal-600 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50">
          <Check size={15} /> Ya está listo para entregar
        </button>
      )}
      {['CONFIRMADO', 'LISTO'].includes(ped.Status) && (
        <form className="flex flex-col sm:flex-row gap-2" onSubmit={e => { e.preventDefault(); hacer('entregar', { codigo }); }}>
          <label className="sr-only" htmlFor={`cod-${ped.Folio}`}>Código del QR</label>
          <div className="relative flex-1">
            <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input id={`cod-${ped.Folio}`} value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} placeholder="Código del QR de quien recoge"
              autoComplete="off" className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono tracking-widest uppercase" />
          </div>
          <button type="submit" disabled={proc || codigo.trim().length < 6}
            className="flex items-center justify-center gap-2 bg-vida-green text-white rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
            <Truck size={15} /> Entregar
          </button>
        </form>
      )}
      {['RETIRADO', 'RECIBIDO'].includes(ped.Status) && ped.FechaRetiro && (
        <p className="text-xs text-gray-500">Entregado el {FECHA(ped.FechaRetiro)}.</p>
      )}
    </article>
  );
}

export default function PortalProveedor() {
  const { token } = useParams();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCarg] = useState(true);

  const cargar = useCallback(async () => {
    setCarg(true);
    try { setDatos((await api.get(`/portal-proveedor/${token}`)).data); setError(''); }
    catch (e) { setError(e.response?.data?.error || 'No se pudieron cargar tus pedidos'); }
    finally { setCarg(false); }
  }, [token]);
  useEffect(() => { cargar(); }, [cargar]);

  const pendientes = datos?.pedidos.filter(p => !['RETIRADO', 'RECIBIDO'].includes(p.Status)) || [];
  const entregados = datos?.pedidos.filter(p => ['RETIRADO', 'RECIBIDO'].includes(p.Status)) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-vida-blue text-white">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-white/70">Portal de proveedores · VIDA</p>
            <h1 className="text-xl font-black truncate">{datos?.proveedor || 'Tus pedidos de VIDA'}</h1>
          </div>
          <button onClick={cargar} aria-label="Actualizar" className="ml-auto flex items-center gap-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2">
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {error ? (
          <p className="text-center text-red-600 bg-red-50 rounded-2xl py-10 px-4">{error}</p>
        ) : cargando && !datos ? (
          <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-vida-blue/30 border-t-vida-blue rounded-full animate-spin" /></div>
        ) : (
          <>
            <h2 className="text-sm font-bold text-gray-500 uppercase">Por atender ({pendientes.length})</h2>
            {pendientes.length === 0 && <p className="text-center text-gray-400 py-8 text-sm bg-white rounded-2xl">No tienes pedidos pendientes.</p>}
            {pendientes.map(p => <Pedido key={p.Folio} ped={p} token={token} onCambio={cargar} proveedor={datos.proveedor} />)}
            {entregados.length > 0 && <>
              <h2 className="text-sm font-bold text-gray-500 uppercase pt-4">Entregados en los últimos 30 días</h2>
              {entregados.map(p => <Pedido key={p.Folio} ped={p} token={token} onCambio={cargar} proveedor={datos.proveedor} />)}
            </>}
          </>
        )}
        <p className="text-xs text-gray-400 text-center pt-6">Este enlace es personal. Si crees que alguien más lo tiene, pídele a VIDA uno nuevo.</p>
      </main>
    </div>
  );
}
