// src/components/PlanPlus.jsx
// Plan PLUS (Reportes): el empresario elige unos pocos productos —los PLUS, el
// ancla o el estrella— y el sistema le dice cuántas unidades de cada uno vender
// al mes y al día para cubrir los costos fijos de su bodega, contra lo que
// vendió en los últimos 30 días. El resto de lo que vende paga los gastos
// variables y es ganancia. Las cuentas las hace el backend (planPlus.service).
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Star, Search, Store, Save, Target, AlertTriangle, Plus, X, Scale } from 'lucide-react';
import api from '../services/api.js';
import BotonManual from './BotonManual.jsx';

const USD = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PCT = (v) => (v == null ? '—' : `${Number(v).toFixed(1)}%`);
const N = (v) => Number(v || 0).toLocaleString('es-VE');

export default function TabPlanPlus({ filtros, puedeVerRed, onIrRentabilidad }) {
  const [idPV, setIdPV] = useState('');
  const [datos, setDatos] = useState(null);
  const [sel, setSel] = useState([]);          // [{ idProducto, PesoPct }]
  const [incluirMeta, setIncluirMeta] = useState(false);
  const [q, setQ] = useState('');
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const params = useCallback((extra = {}) => ({ ...(puedeVerRed && idPV ? { idPuntoVenta: idPV } : {}), ...extra }), [puedeVerRed, idPV]);

  const cargar = useCallback(async () => {
    if (puedeVerRed && !idPV) { setDatos(null); return; }
    setCargando(true); setError('');
    try {
      const r = await api.get('/finanzas/plan-plus', { params: params() });
      setDatos(r.data); setSel(r.data.seleccion); setIncluirMeta(r.data.incluirMeta);
    } catch (e) { setError(e.response?.data?.error || 'No se pudo cargar el plan'); }
    finally { setCargando(false); }
  }, [puedeVerRed, idPV, params]);
  useEffect(() => { cargar(); }, [cargar]);

  // Mientras el empresario cambia productos o pesos, el plan se recalcula aquí
  // al instante con la misma regla que planEquilibrio (backend); al guardar y
  // recargar, manda el del servidor.
  const [plan, setPlan] = useState(null);
  useEffect(() => { setPlan(datos?.plan || null); }, [datos]);
  const recalcular = useCallback(async (nuevaSel, meta) => {
    if (!datos) return;
    const porId = new Map(datos.productos.map(p => [String(p.idProducto), p]));
    const pctVar = datos.finanzas.pctVariables;
    const cf = datos.finanzas.CostosFijosMensualUSD, mg = datos.finanzas.MetaGananciaMensualUSD;
    const objetivo = cf + (meta ? mg : 0);
    const items = nuevaSel.map(s => ({ ...porId.get(String(s.idProducto)), PesoPct: s.PesoPct })).filter(p => p.idProducto);
    const conMargen = items.filter(p => p.contribUSD > 0), sinMargen = items.filter(p => !(p.contribUSD > 0));
    const pesoTotal = conMargen.reduce((s, p) => s + Math.max(0, Number(p.PesoPct) || 0), 0);
    const lineas = conMargen.map(p => {
      const peso = pesoTotal > 0 ? Math.max(0, Number(p.PesoPct) || 0) / pesoTotal : 1 / conMargen.length;
      const unidadesMes = objetivo * peso > 0 ? Math.ceil(objetivo * peso / p.contribUSD) : 0;
      const ventasMes = unidadesMes * p.PrecioUSD;
      return {
        ...p, PesoPct: Math.round(peso * 10000) / 100, aCubrirUSD: objetivo * peso, unidadesMes,
        unidadesDia: Math.ceil(unidadesMes / 30), ventasMesUSD: ventasMes,
        netoPct: ventasMes > 0 ? (unidadesMes * p.contribUSD - cf * peso) / ventasMes * 100 : null,
        avancePct: unidadesMes > 0 ? p.Vendidas30 / unidadesMes * 100 : null,
        cubiertoUSD: p.Vendidas30 * p.contribUSD,
      };
    });
    const ventasMes = lineas.reduce((s, l) => s + l.ventasMesUSD, 0), cubierto = lineas.reduce((s, l) => s + l.cubiertoUSD, 0);
    setPlan({
      objetivoUSD: objetivo, lineas, sinMargen,
      totales: { ventasMesUSD: ventasMes, ventasDiaUSD: ventasMes / 30, cubiertoUSD: cubierto, coberturaPct: objetivo > 0 ? cubierto / objetivo * 100 : null },
    });
  }, [datos]);

  const cambiarSel = (nueva) => { setSel(nueva); recalcular(nueva, incluirMeta); setAviso(''); };
  const elegidos = new Set(sel.map(s => String(s.idProducto)));
  const disponibles = useMemo(() => (datos?.productos || [])
    .filter(p => !elegidos.has(String(p.idProducto)))
    .filter(p => !q.trim() || `${p.Nombre} ${p.SKU || ''} ${p.NombreCategoria || ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 40), [datos, sel, q]); // eslint-disable-line

  async function guardar() {
    setGuardando(true); setError(''); setAviso('');
    try {
      await api.put('/finanzas/plan-plus', { ...params(), incluirMeta, productos: sel });
      setAviso('Plan guardado. Esta es la meta del empresario.');
      await cargar();
    } catch (e) { setError(e.response?.data?.error || 'No se pudo guardar'); }
    finally { setGuardando(false); }
  }

  const fin = datos?.finanzas;
  const sinCostos = fin && !(fin.CostosFijosMensualUSD > 0);

  return (
    <div className="space-y-5 max-w-6xl">
      <BotonManual />
      {puedeVerRed && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-center gap-3">
          <Store size={16} className="text-vida-blue" />
          <select value={idPV} onChange={e => setIdPV(e.target.value)} aria-label="Tienda"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white max-w-full">
            <option value="">— Elige una tienda —</option>
            {(filtros?.sucursales || []).map(s => (
              <option key={s.idPuntoVenta} value={s.idPuntoVenta}>{s.NombrePuntoVenta || s.NomComercial}</option>
            ))}
          </select>
        </div>
      )}
      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      {aviso && <p className="text-green-700 text-sm bg-green-50 px-3 py-2 rounded-lg">{aviso}</p>}

      {puedeVerRed && !idPV ? (
        <div className="text-center py-16 text-gray-400">
          <Star size={40} className="mx-auto mb-3 opacity-30" />
          <p>Elige una tienda para armar su Plan PLUS</p>
        </div>
      ) : cargando && !datos ? (
        <p className="text-center text-gray-400 py-10 text-sm">Cargando…</p>
      ) : datos && (
        <>
          {/* La meta, en una frase */}
          <div className="rounded-2xl p-5 text-white" style={{ background: 'linear-gradient(135deg, #0A1E3F, #1d3a6b)' }}>
            <p className="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-2"><Target size={14} /> Meta del empresario</p>
            {sinCostos ? (
              <p className="mt-2 text-sm opacity-90">
                Primero carga los costos fijos de la tienda en{' '}
                <button onClick={onIrRentabilidad} className="underline font-bold">Rentabilidad</button>.
              </p>
            ) : !plan?.lineas.length ? (
              <p className="mt-2 text-sm opacity-90">Elige abajo los productos con los que la tienda va a cubrir sus costos fijos.</p>
            ) : (
              <>
                <p className="mt-1 text-sm opacity-90">
                  Para cubrir {incluirMeta ? 'los costos fijos y la ganancia deseada' : 'los costos fijos'} ({USD(plan.objetivoUSD)} al mes) hay que vender:
                </p>
                <ul className="mt-2 space-y-1">
                  {plan.lineas.map(l => (
                    <li key={l.idProducto} className="text-base sm:text-lg font-black">
                      {N(l.unidadesMes)} <span className="font-semibold opacity-90">de {l.Nombre}</span>
                      <span className="text-sm font-semibold opacity-70"> · {N(l.unidadesDia)} al día</span>
                    </li>
                  ))}
                </ul>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4 pt-3 border-t border-white/15">
                  <div><p className="text-xl font-black">{USD(plan.totales.ventasMesUSD)}</p><p className="text-xs opacity-70">en ventas al mes</p></div>
                  <div><p className="text-xl font-black">{USD(plan.totales.ventasDiaUSD)}</p><p className="text-xs opacity-70">al día</p></div>
                  <div className="col-span-2 sm:col-span-1"><p className="text-xl font-black">{PCT(plan.totales.coberturaPct)}</p><p className="text-xs opacity-70">cubierto con lo vendido en 30 días</p></div>
                </div>
                <p className="text-xs opacity-70 mt-3">Todo lo demás que venda paga los gastos variables y es ganancia.</p>
              </>
            )}
          </div>

          {/* Supuestos */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="text-gray-500">Costos fijos / mes: <b className="text-gray-800">{USD(fin.CostosFijosMensualUSD)}</b></span>
            <span className="text-gray-500">Costos variables: <b className="text-gray-800">{PCT(fin.pctVariables)}</b> de cada venta</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={incluirMeta} onChange={e => { setIncluirMeta(e.target.checked); recalcular(sel, e.target.checked); }}
                className="w-4 h-4 accent-vida-blue" />
              <span className="text-gray-700">Incluir la ganancia deseada ({USD(fin.MetaGananciaMensualUSD)})</span>
            </label>
            <button onClick={onIrRentabilidad} className="text-vida-blue font-semibold text-xs ml-auto">Cambiar costos →</button>
          </div>

          {/* Productos del plan */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-50 flex flex-wrap items-center gap-2">
              <h3 className="font-black text-gray-800 flex items-center gap-2"><Star size={16} className="text-amber-500 fill-amber-400" /> Productos del plan</h3>
              {sel.length > 1 && (
                <button onClick={() => cambiarSel(sel.map(s => ({ ...s, PesoPct: null })))}
                  className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-vida-blue border border-gray-200 rounded-lg px-2.5 py-1.5">
                  <Scale size={13} /> Repartir igual
                </button>
              )}
            </div>
            {sel.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8 px-4">Agrega productos desde la lista de abajo. Los PLUS aparecen primero.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                      {['Producto', 'Precio', 'Costo', 'Margen bruto', 'Contribución / u', 'Margen neto', 'Peso', 'Unidades / mes', 'Por día', 'Vendidas 30 d', 'Avance', ''].map((h, i) => (
                        <th key={i} className={`px-3 py-2.5 font-semibold whitespace-nowrap ${i > 0 && i < 11 ? 'text-right' : ''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sel.map(s => {
                      const p = datos.productos.find(x => String(x.idProducto) === String(s.idProducto));
                      const l = plan?.lineas.find(x => String(x.idProducto) === String(s.idProducto));
                      if (!p) return null;
                      return (
                        <tr key={s.idProducto} className={!l ? 'bg-red-50/40' : ''}>
                          <td className="px-3 py-2.5 min-w-[11rem]">
                            <p className="font-semibold text-gray-800 flex items-center gap-1.5">
                              {p.EsProductoPlus && <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-400 text-white">PLUS</span>}
                              {p.Nombre}
                            </p>
                            {p.RangoPrecio && (
                              <p className="text-[11px] text-orange-600 flex items-center gap-1"><AlertTriangle size={11} />
                                {p.RangoPrecio === 'BAJO_PISO' ? `Precio bajo el piso (${USD(p.PrecioPisoUSD)})` : `Precio sobre el techo (${USD(p.PrecioTechoUSD)})`}
                              </p>
                            )}
                            {!l && <p className="text-[11px] text-red-600">No deja margen después de costos variables: no ayuda a cubrir los fijos</p>}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{USD(p.PrecioUSD)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{USD(p.CostoUSD)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{PCT(p.brutoPct)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{USD(p.contribUSD)} <span className="text-xs text-gray-400">({PCT(p.contribPct)})</span></td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{l ? PCT(l.netoPct) : '—'}</td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="inline-flex items-center gap-1">
                              <input type="number" min="0" max="100" step="1" aria-label={`Peso de ${p.Nombre}`}
                                value={s.PesoPct ?? ''} placeholder={l ? String(Math.round(l.PesoPct)) : ''}
                                onChange={e => cambiarSel(sel.map(x => x.idProducto === s.idProducto ? { ...x, PesoPct: e.target.value === '' ? null : Number(e.target.value) } : x))}
                                className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-right text-sm" />
                              <span className="text-gray-400 text-xs">%</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-black text-vida-blue">{l ? N(l.unidadesMes) : '—'}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{l ? N(l.unidadesDia) : '—'}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{N(p.Vendidas30)}</td>
                          <td className="px-3 py-2.5 text-right min-w-[6rem]">
                            {l?.avancePct != null && (
                              <div>
                                <span className={`text-xs font-bold ${l.avancePct >= 100 ? 'text-vida-green' : 'text-gray-600'}`}>{PCT(Math.min(l.avancePct, 999))}</span>
                                <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                                  <div className="h-full bg-vida-green rounded-full" style={{ width: `${Math.min(100, l.avancePct)}%` }} />
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button onClick={() => cambiarSel(sel.filter(x => x.idProducto !== s.idProducto))} aria-label={`Quitar ${p.Nombre}`}
                              className="text-gray-300 hover:text-red-500"><X size={15} /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-gray-400 px-4 py-2 border-t border-gray-50">
              Margen bruto = precio − costo. Contribución = lo que deja cada unidad después del costo y los costos variables. Margen neto = lo que queda
              después de pagar su parte de los costos fijos al vender esas unidades. Peso = qué parte de los costos cubre cada producto (vacío: se reparte igual).
            </p>
          </div>

          {/* Agregar productos */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-black text-gray-800 text-sm">Agregar productos (PLUS, ancla o estrella)</h3>
              <div className="relative flex-1 min-w-[12rem]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto…" aria-label="Buscar producto"
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm" />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {disponibles.map(p => (
                <button key={p.idProducto} onClick={() => cambiarSel([...sel, { idProducto: p.idProducto, PesoPct: null }])}
                  className="flex items-center gap-2 text-left border border-gray-100 rounded-xl px-3 py-2 hover:border-vida-blue hover:bg-vida-blue-light transition">
                  <Plus size={14} className="text-vida-blue shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-800 truncate">
                      {p.EsProductoPlus && <Star size={11} className="inline mr-1 text-amber-500 fill-amber-400" />}{p.Nombre}
                    </span>
                    <span className="block text-[11px] text-gray-400">{USD(p.PrecioUSD)} · contribución {USD(p.contribUSD)} · vendidas 30 d: {N(p.Vendidas30)}</span>
                  </span>
                </button>
              ))}
              {disponibles.length === 0 && <p className="text-sm text-gray-400 py-3">{q ? 'Ningún producto coincide' : 'No hay más productos activos'}</p>}
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={guardar} disabled={guardando}
              className="flex items-center gap-2 bg-vida-blue text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              <Save size={15} /> {guardando ? 'Guardando…' : 'Guardar plan'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
