// src/components/LibroVentas.jsx
// Libro de ventas: facturas y notas de crédito por día fiscal, con totales por
// alícuota y exportación a Excel.
import { useCallback, useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import api from '../services/api.js';
import { hoyCaracas } from '../utils/fechas.js';
import { bs, numeroDoc, formatearDocumento } from '../utils/libroVentas.mjs';
import { exportarLibroVentasExcel } from '../utils/exportExcel.js';
import { VistaFactura } from './Factura.jsx';

const campo = 'border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vida-blue bg-white';

export default function LibroVentas({ sucursales = [] }) {
  const hoy = hoyCaracas();
  const [desde, setDesde] = useState(hoy.slice(0, 8) + '01');
  const [hasta, setHasta] = useState(hoy);
  const [idPuntoVenta, setIdPuntoVenta] = useState('');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [verId, setVerId] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = { desde, hasta };
      if (idPuntoVenta) params.idPuntoVenta = idPuntoVenta;
      const r = await api.get('/facturas', { params });
      setDatos(r.data); setError(null);
    } catch (e) { setError(e.response?.data?.error || 'No se pudo cargar el libro de ventas'); }
    finally { setCargando(false); }
  }, [desde, hasta, idPuntoVenta]);
  useEffect(() => { cargar(); }, [cargar]);

  const t = datos?.totales;
  const tienda = sucursales.find(s => String(s.idPuntoVenta) === String(idPuntoVenta));
  return (
    <div>
      {verId && <VistaFactura idFactura={verId} onCerrar={() => setVerId(null)} onCambio={cargar} />}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <input type="date" value={desde} max={hasta} onChange={e => setDesde(e.target.value)} className={campo} />
        <span className="text-gray-400 text-sm">a</span>
        <input type="date" value={hasta} min={desde} onChange={e => setHasta(e.target.value)} className={campo} />
        {sucursales.length > 1 && (
          <select value={idPuntoVenta} onChange={e => setIdPuntoVenta(e.target.value)} className={campo}>
            <option value="">Todas las tiendas</option>
            {sucursales.map(s => <option key={s.idPuntoVenta} value={s.idPuntoVenta}>{s.NomComercial || s.Nombre}</option>)}
          </select>
        )}
        <button disabled={!datos?.filas.length}
          onClick={() => exportarLibroVentasExcel({ documentos: datos.filas, desde, hasta, tienda: tienda?.NomComercial || tienda?.Nombre })}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold disabled:opacity-40">
          <Download size={14} /> Excel
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {t && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            ['Documentos', t.Documentos, 'text-gray-800'],
            ['Total con IVA (Bs)', bs(t.TotalVES), 'text-vida-blue'],
            ['IVA (Bs)', bs(t.IVAGeneralVES + t.IVAReducidaVES), 'text-gray-800'],
            ['Sin n° de control', t.PendientesControl, t.PendientesControl ? 'text-amber-600' : 'text-gray-800'],
          ].map(([l, v, c]) => (
            <div key={l} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <p className="text-xs text-gray-400 font-medium">{l}</p>
              <p className={`text-xl font-black ${c}`}>{v}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        {cargando ? <p className="text-center text-gray-400 py-16 text-sm">Cargando...</p>
          : !datos?.filas.length ? (
            <div className="text-center py-16 text-gray-400">
              <FileText size={44} className="mx-auto mb-3 opacity-20" />
              <p className="font-semibold text-gray-500">Sin documentos fiscales en el período</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <tr>
                  {['Fecha', 'Tienda', 'Documento', 'N° control', 'Cliente', 'Base (Bs)', 'IVA (Bs)', 'Exento (Bs)', 'Total (Bs)'].map(h =>
                    <th key={h} className={`px-3 py-2.5 ${/Bs/.test(h) ? 'text-right' : 'text-left'} whitespace-nowrap`}>{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {datos.filas.map(f => {
                  const nc = f.TipoDocumento === 'NOTA_CREDITO';
                  const s = nc ? '-' : '';
                  return (
                    <tr key={f.idFactura} onClick={() => setVerId(f.idFactura)} className="hover:bg-gray-50/60 cursor-pointer">
                      <td className="px-3 py-2.5 whitespace-nowrap">{String(f.FechaFiscal).slice(0, 10)}</td>
                      <td className="px-3 py-2.5">{f.NombreTienda}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-semibold">
                        {nc ? 'NC' : 'FAC'} {numeroDoc(f.Numero)}
                        {nc && <span className="block text-xs font-normal text-gray-400">afecta {numeroDoc(f.NumeroAfectada)}</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {f.NumeroControl || <span className="text-xs font-bold text-amber-600">PENDIENTE</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {f.ReceptorNombre}<span className="block text-xs text-gray-400">{formatearDocumento(f.ReceptorDocumento)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{s}{bs(Number(f.BaseGeneralVES) + Number(f.BaseReducidaVES))}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{s}{bs(Number(f.IVAGeneralVES) + Number(f.IVAReducidaVES))}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{s}{bs(f.ExentoVES)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold">{s}{bs(f.TotalVES)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
