// src/components/ArranqueMes.jsx
// Cuadro de arranque del mes (Reportes; tareas 6, 7, 8 y 13, audios de Lila).
// En una sola vista: cómo le fue a la tienda los últimos meses contra su meta,
// cómo va este mes y su proyección, cuántas unidades PLUS vende, cómo va con su
// producto estrella y qué es lo que más sale. VIDA define aquí los PLUS y el
// producto estrella de cada tienda. Sin tienda elegida, VIDA ve el indicador
// PLUS de toda la red.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Rocket, Store, Star, Award, TrendingUp, Search, Save, X, Pencil, Package, Table2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import api from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';
import BotonManual from './BotonManual.jsx';

const USD = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PCT = (v) => (v == null ? '—' : `${Number(v).toFixed(1)}%`);
const N = (v) => Number(v || 0).toLocaleString('es-VE');
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const nombreMes = (per, largo = false) => {
  const a = Math.floor(per / 100), m = per % 100;
  return largo ? `${MES[m - 1]} ${a}` : `${MES[m - 1]} ${String(a).slice(2)}`;
};

// Colores de la marca: navy para la venta, verde para lo PLUS; el mes en curso
// (incompleto) va en el mismo tono más claro para que no se lea como caída.
const C_VENTA = '#0A1E3F', C_VENTA_CURSO = '#8FA3C0', C_PLUS = '#46A657', C_PLUS_CURSO = '#A9DDB2', C_META = '#E8A33D';

// Solo VIDA (roles de red del backend, arranque.controller) elige tienda y ve
// el ranking de la red. El ADMIN de una tienda cuenta como "red" en otras
// pestañas de Reportes, pero aquí el backend lo limita a su tienda: ve directo
// su cuadro, sin selector.
const ROLES_VIDA = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO'];

export default function ArranqueMes({ filtros }) {
  const { usuario } = useAuthStore();
  const puedeVerRed = ROLES_VIDA.includes(usuario?.TipoUsuario);
  const [idPV, setIdPV] = useState('');
  const [datos, setDatos] = useState(null);
  const [red, setRed] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [editando, setEditando] = useState(false);
  const [verTabla, setVerTabla] = useState(false);

  const cargar = useCallback(async () => {
    setError('');
    if (puedeVerRed && !idPV) {
      setDatos(null); setCargando(true);
      try { setRed((await api.get('/arranque/red')).data); }
      catch (e) { setError(e.response?.data?.error || 'No se pudo cargar el indicador de la red'); }
      finally { setCargando(false); }
      return;
    }
    setCargando(true);
    try { setDatos((await api.get('/arranque', { params: puedeVerRed ? { idPuntoVenta: idPV } : {} })).data); }
    catch (e) { setError(e.response?.data?.error || 'No se pudo cargar el arranque del mes'); setDatos(null); }
    finally { setCargando(false); }
  }, [puedeVerRed, idPV]);
  useEffect(() => { cargar(); }, [cargar]);

  const nombreTienda = (id) => {
    const s = (filtros?.sucursales || []).find(x => String(x.idPuntoVenta) === String(id));
    return s ? (s.NombrePuntoVenta || s.NomComercial) : '';
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <BotonManual />
      {puedeVerRed && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-center gap-3">
          <Store size={16} className="text-vida-blue" />
          <select value={idPV} onChange={e => { setIdPV(e.target.value); setEditando(false); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white max-w-full">
            <option value="">— Toda la red (indicador PLUS) —</option>
            {(filtros?.sucursales || []).map(s => (
              <option key={s.idPuntoVenta} value={s.idPuntoVenta}>{s.NombrePuntoVenta || s.NomComercial}</option>
            ))}
          </select>
          {datos?.puedeEditar && !editando && (
            <button onClick={() => setEditando(true)}
              className="sm:ml-auto flex items-center gap-2 border border-vida-blue text-vida-blue rounded-xl px-3 py-2 text-sm font-semibold hover:bg-vida-blue-light">
              <Pencil size={14} /> Definir PLUS y estrella
            </button>
          )}
        </div>
      )}

      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      {cargando && <p className="text-sm text-gray-400">Cargando…</p>}

      {puedeVerRed && !idPV && red && !cargando && <RankingRed red={red} onElegir={id => setIdPV(String(id))} />}

      {datos && !cargando && (
        <>
          {editando && (
            <EditorDestacados idPuntoVenta={datos.idPuntoVenta} nombreTienda={nombreTienda(datos.idPuntoVenta)}
              onCerrar={() => setEditando(false)} onGuardado={() => { setEditando(false); cargar(); }} />
          )}
          <Resumen d={datos} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GraficaMeses titulo="Ventas por mes (USD)" sub={datos.MetaMensualUSD > 0 ? `La línea es la meta mensual: ${USD(datos.MetaMensualUSD)}` : 'Esta tienda no tiene meta mensual (se define en Metas)'}
              meses={datos.meses} campo="VentasUSD" fmt={USD} color={C_VENTA} colorCurso={C_VENTA_CURSO}
              meta={datos.MetaMensualUSD > 0 ? datos.MetaMensualUSD : null} />
            <GraficaMeses titulo="Unidades PLUS vendidas por mes" sub={datos.plusPropios ? 'PLUS propios de esta tienda' : 'PLUS generales del catálogo'}
              meses={datos.meses} campo="UnidadesPlus" fmt={N} color={C_PLUS} colorCurso={C_PLUS_CURSO} />
          </div>
          <div className="flex justify-end -mt-2">
            <button onClick={() => setVerTabla(v => !v)} className="text-xs text-gray-500 hover:text-vida-blue flex items-center gap-1">
              <Table2 size={13} /> {verTabla ? 'Ocultar tabla' : 'Ver como tabla'}
            </button>
          </div>
          {verTabla && <TablaMeses meses={datos.meses} />}

          <Estrellas estrellas={datos.estrellas} puedeEditar={datos.puedeEditar} onEditar={() => setEditando(true)} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ListaPlus plus={datos.plus} propios={datos.plusPropios} />
            <MasVendidos actual={datos.masVendidosMes} anterior={datos.masVendidosMesAnterior} periodo={datos.mesActual.Periodo} />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Mes en curso: avance contra meta, proyección y PLUS ──────────────────────
function Resumen({ d }) {
  const m = d.mesActual;
  const ant = d.meses[d.meses.length - 2] || {};
  const avance = Math.min(100, m.AvancePct || 0);
  const ritmoPct = m.DiasMes ? Math.round(m.Dia / m.DiasMes * 100) : 0;
  const proyVsMeta = d.MetaMensualUSD > 0 ? m.ProyeccionUSD / d.MetaMensualUSD * 100 : null;
  const difPlus = m.UnidadesPlus - (ant.UnidadesPlus || 0);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h3 className="font-black text-gray-800 flex items-center gap-2"><Rocket size={18} className="text-vida-green" /> Arranque de {nombreMes(m.Periodo, true)}</h3>
        <span className="text-xs text-gray-400">Día {m.Dia} de {m.DiasMes}</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Dato titulo="Vendido este mes" valor={USD(m.VentasUSD)} nota={`${N(m.Ventas)} ventas · mes pasado ${USD(ant.VentasUSD)}`} />
        <Dato titulo="Proyección al cierre" valor={USD(m.ProyeccionUSD)}
          nota={proyVsMeta == null ? 'Al ritmo diario de lo que va' : `${proyVsMeta >= 100 ? '✓ Llega' : '✗ No llega'} a la meta (${PCT(proyVsMeta)})`} />
        <Dato titulo="Unidades PLUS" valor={N(m.UnidadesPlus)}
          nota={`${difPlus >= 0 ? '▲' : '▼'} ${N(Math.abs(difPlus))} vs mes pasado (${N(ant.UnidadesPlus)})`} />
        <Dato titulo="Venta en PLUS" valor={PCT(m.PctVentasPlus)} nota={`${USD(m.VentasPlusUSD)} de lo vendido`} />
      </div>
      {d.MetaMensualUSD > 0 && (
        <div className="mt-5">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Avance contra la meta de {USD(d.MetaMensualUSD)}</span>
            <span className="font-bold text-gray-800">{PCT(m.AvancePct)}</span>
          </div>
          <div className="relative h-3 rounded-full bg-gray-100 overflow-hidden" role="img" aria-label={`Avance ${PCT(m.AvancePct)}; van ${ritmoPct}% de los días del mes`}>
            <div className="h-full rounded-full" style={{ width: `${avance}%`, background: avance >= ritmoPct ? C_PLUS : C_META }} />
            <div className="absolute top-0 bottom-0 w-0.5 bg-gray-500" style={{ left: `${ritmoPct}%` }} title={`Día ${m.Dia}: ${ritmoPct}% del mes`} />
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            La marca gris es el día del mes ({ritmoPct}%). {avance >= ritmoPct ? 'Vas al ritmo o adelantado.' : 'Vas atrasado: hay que empujar el producto estrella y los PLUS.'}
          </p>
        </div>
      )}
    </div>
  );
}

function Dato({ titulo, valor, nota }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500">{titulo}</p>
      <p className="text-2xl font-black text-gray-800 leading-tight">{valor}</p>
      {nota && <p className="text-[11px] text-gray-400 mt-0.5">{nota}</p>}
    </div>
  );
}

// ─── Gráfica de 6 meses (una sola serie; el mes en curso más claro) ───────────
function GraficaMeses({ titulo, sub, meses, campo, fmt, color, colorCurso, meta }) {
  const filas = meses.map((m, i) => ({ ...m, mes: nombreMes(m.Periodo), enCurso: i === meses.length - 1 }));
  const max = Math.max(meta || 0, ...filas.map(f => f[campo]));
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <h4 className="font-black text-gray-800 text-sm">{titulo}</h4>
      <p className="text-[11px] text-gray-400 mb-3">{sub} · el último mes va en curso</p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filas} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="#EEF1F4" />
            <XAxis dataKey="mes" tickLine={false} axisLine={{ stroke: '#D9DEE4' }} tick={{ fontSize: 11, fill: '#6B7280' }} />
            <YAxis tickLine={false} axisLine={false} width={campo === 'VentasUSD' ? 56 : 36} tick={{ fontSize: 11, fill: '#6B7280' }}
              domain={[0, max > 0 ? 'auto' : 1]} allowDecimals={campo === 'VentasUSD'}
              tickFormatter={v => (campo === 'VentasUSD' ? `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : v)} />
            <Tooltip cursor={{ fill: 'rgba(10,30,63,0.05)' }} content={<TipMes campo={campo} fmt={fmt} meta={meta} />} />
            {meta && <ReferenceLine y={meta} stroke={C_META} strokeWidth={2} strokeDasharray="5 4"
              label={{ value: 'Meta', position: 'insideTopRight', fontSize: 11, fill: '#6B7280' }} />}
            <Bar dataKey={campo} radius={[4, 4, 0, 0]} maxBarSize={40}>
              {filas.map(f => <Cell key={f.Periodo} fill={f.enCurso ? colorCurso : color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TipMes({ active, payload, campo, fmt, meta }) {
  if (!active || !payload?.length) return null;
  const f = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-2 text-xs">
      <p className="font-bold text-gray-800 mb-1">{nombreMes(f.Periodo, true)}{f.enCurso ? ' (en curso)' : ''}</p>
      <p className="text-gray-600">{campo === 'VentasUSD' ? 'Vendido' : 'Unidades PLUS'}: <b className="text-gray-800">{fmt(f[campo])}</b></p>
      {campo === 'VentasUSD' && <p className="text-gray-500">{N(f.Ventas)} ventas{meta ? ` · ${PCT(f.VentasUSD / meta * 100)} de la meta` : ''}</p>}
      {campo === 'UnidadesPlus' && <p className="text-gray-500">{USD(f.VentasPlusUSD)} en PLUS</p>}
    </div>
  );
}

function TablaMeses({ meses }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr>{['Mes', 'Ventas', 'Vendido', 'Meta', '% de meta', 'Unidades PLUS', 'Venta PLUS'].map(h => <th key={h} className="text-left font-semibold px-3 py-2 whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody>
          {meses.map(m => (
            <tr key={m.Periodo} className="border-t border-gray-100">
              <td className="px-3 py-2 font-semibold text-gray-700">{nombreMes(m.Periodo, true)}</td>
              <td className="px-3 py-2">{N(m.Ventas)}</td>
              <td className="px-3 py-2">{USD(m.VentasUSD)}</td>
              <td className="px-3 py-2">{m.MetaUSD > 0 ? USD(m.MetaUSD) : '—'}</td>
              <td className="px-3 py-2">{m.MetaUSD > 0 ? PCT(m.VentasUSD / m.MetaUSD * 100) : '—'}</td>
              <td className="px-3 py-2">{N(m.UnidadesPlus)}</td>
              <td className="px-3 py-2">{USD(m.VentasPlusUSD)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Producto estrella ────────────────────────────────────────────────────────
function Estrellas({ estrellas, puedeEditar, onEditar }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <h4 className="font-black text-gray-800 text-sm flex items-center gap-2 mb-3"><Award size={17} className="text-vida-blue" /> Producto estrella</h4>
      {estrellas.length === 0 ? (
        <p className="text-sm text-gray-400">
          VIDA aún no le asigna producto estrella a esta tienda.
          {puedeEditar && <button onClick={onEditar} className="ml-1 text-vida-blue font-semibold hover:underline">Asignarlo</button>}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {estrellas.map(e => {
            const dif = e.UnidadesMes - e.UnidadesMesAnterior;
            return (
              <div key={e.idProducto} className="rounded-xl border border-vida-blue/15 bg-vida-blue-light p-4">
                <p className="font-bold text-gray-800 text-sm truncate" title={e.Nombre}>★ {e.Nombre}</p>
                <p className="text-2xl font-black text-gray-800 mt-1">{N(e.UnidadesMes)} <span className="text-xs font-semibold text-gray-500">unidades este mes</span></p>
                <p className="text-[11px] text-gray-500">{dif >= 0 ? '▲' : '▼'} {N(Math.abs(dif))} vs mes pasado ({N(e.UnidadesMesAnterior)})</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── PLUS de la tienda ────────────────────────────────────────────────────────
function ListaPlus({ plus, propios }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <h4 className="font-black text-gray-800 text-sm flex items-center gap-2"><Star size={16} className="text-amber-400" /> Productos PLUS</h4>
      <p className="text-[11px] text-gray-400 mb-3">{propios ? 'Los PLUS que VIDA le asignó a esta tienda' : 'Usa los PLUS generales del catálogo (los que vendió en estos meses)'}</p>
      {plus.length === 0 ? <p className="text-sm text-gray-400">Sin productos PLUS vendidos todavía.</p> : (
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500"><tr><th className="text-left font-semibold pb-1">Producto</th><th className="text-right font-semibold pb-1">Este mes</th><th className="text-right font-semibold pb-1">Mes pasado</th></tr></thead>
          <tbody>
            {plus.map(p => (
              <tr key={p.idProducto} className="border-t border-gray-100">
                <td className="py-1.5 pr-2 text-gray-700">{p.Nombre}</td>
                <td className="py-1.5 text-right font-bold text-gray-800">{N(p.UnidadesMes)}</td>
                <td className="py-1.5 text-right text-gray-500">{N(p.UnidadesMesAnterior)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Lo que más se vende ──────────────────────────────────────────────────────
function MasVendidos({ actual, anterior, periodo }) {
  const ant = periodo % 100 === 1 ? periodo - 89 : periodo - 1; // 202601 → 202512
  const Lista = ({ filas, titulo }) => (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-1">{titulo}</p>
      {filas.length === 0 ? <p className="text-xs text-gray-400">Sin ventas</p> : (
        <ol className="space-y-1">
          {filas.map((f, i) => (
            <li key={f.idProducto} className="flex items-center gap-2 text-sm">
              <span className="text-xs text-gray-400 w-4">{i + 1}.</span>
              <span className="flex-1 truncate text-gray-700" title={f.Nombre}>{f.Nombre}{f.EsPlus && <span className="ml-1 text-[10px] font-black text-white bg-amber-400 px-1.5 rounded">PLUS</span>}</span>
              <span className="font-bold text-gray-800">{N(f.Unidades)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <h4 className="font-black text-gray-800 text-sm flex items-center gap-2 mb-3"><TrendingUp size={16} className="text-vida-blue" /> Lo que más se vende (unidades)</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Lista filas={actual} titulo={`Este mes (${nombreMes(periodo, true)})`} />
        <Lista filas={anterior} titulo={`Mes pasado (${nombreMes(ant, true)})`} />
      </div>
    </div>
  );
}

// ─── Indicador PLUS de la red (sin tienda elegida) ────────────────────────────
function RankingRed({ red, onElegir }) {
  const tiendas = red.tiendas || [];
  const tot = tiendas.reduce((s, t) => ({ u: s.u + t.UnidadesPlus, v: s.v + t.VentasUSD, vp: s.vp + t.VentasPlusUSD }), { u: 0, v: 0, vp: 0 });
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h3 className="font-black text-gray-800 flex items-center gap-2"><Star size={18} className="text-vida-green" /> Unidades PLUS por tienda · {nombreMes(red.Periodo, true)}</h3>
        <span className="text-xs text-gray-500">Red: <b className="text-gray-800">{N(tot.u)}</b> unidades PLUS · {tot.v > 0 ? PCT(tot.vp / tot.v * 100) : '—'} de la venta</span>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">Toca una tienda para ver su arranque del mes y definir sus PLUS y su producto estrella.</p>
      {tiendas.length === 0 ? <p className="text-sm text-gray-400">No hay tiendas activas.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 bg-gray-50">
              <tr>{['#', 'Tienda', 'Unidades PLUS', 'Venta PLUS', '% en PLUS', 'Ventas', 'Vendido'].map(h => <th key={h} className="text-left font-semibold px-3 py-2 whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody>
              {tiendas.map((t, i) => (
                <tr key={t.idPuntoVenta} onClick={() => onElegir(t.idPuntoVenta)} className="border-t border-gray-100 cursor-pointer hover:bg-vida-blue-light/50">
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 font-semibold text-gray-700 whitespace-nowrap">{t.NomComercial}</td>
                  <td className="px-3 py-2 font-bold text-gray-800">{N(t.UnidadesPlus)}</td>
                  <td className="px-3 py-2">{USD(t.VentasPlusUSD)}</td>
                  <td className="px-3 py-2">{PCT(t.PctPlus)}</td>
                  <td className="px-3 py-2">{N(t.Ventas)}</td>
                  <td className="px-3 py-2">{USD(t.VentasUSD)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Editor de VIDA: PLUS y estrella de la tienda ─────────────────────────────
function EditorDestacados({ idPuntoVenta, nombreTienda, onCerrar, onGuardado }) {
  const [productos, setProductos] = useState([]);
  const [plus, setPlus] = useState(new Set());
  const [estrella, setEstrella] = useState(new Set());
  const [q, setQ] = useState('');
  const [soloElegidos, setSoloElegidos] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true); setError('');
      try {
        const [p, d] = await Promise.all([
          api.get('/inventario/productos', { params: { limit: 1000, page: 1, idPuntoVenta, orden: 'Nombre', dir: 'asc', status: 'ACTIVO' } }),
          api.get('/arranque/destacados', { params: { idPuntoVenta } }),
        ]);
        if (!vivo) return;
        setProductos((p.data.data || []).filter(x => x.Status === 'ACTIVO'));
        setPlus(new Set(d.data.plus.map(String)));
        setEstrella(new Set(d.data.estrella.map(String)));
      } catch (e) { if (vivo) setError(e.response?.data?.error || 'No se pudieron cargar los productos'); }
      finally { if (vivo) setCargando(false); }
    })();
    return () => { vivo = false; };
  }, [idPuntoVenta]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return productos.filter(p => {
      const id = String(p.idProducto);
      if (soloElegidos && !plus.has(id) && !estrella.has(id)) return false;
      return !t || `${p.Nombre} ${p.CodigoBarras || ''} ${p.SKU || ''}`.toLowerCase().includes(t);
    });
  }, [productos, q, soloElegidos, plus, estrella]);

  const alternar = (conjunto, setConjunto, id, max) => {
    const s = new Set(conjunto);
    if (s.has(id)) s.delete(id);
    else { if (s.size >= max) { setError(`Máximo ${max}`); return; } s.add(id); }
    setError(''); setConjunto(s);
  };

  async function guardar() {
    setGuardando(true); setError('');
    try {
      await api.put('/arranque/destacados', { idPuntoVenta, plus: [...plus].map(Number), estrella: [...estrella].map(Number) });
      onGuardado();
    } catch (e) { setError(e.response?.data?.error || 'No se pudo guardar'); }
    finally { setGuardando(false); }
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-vida-blue/20 p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="font-black text-gray-800 flex items-center gap-2"><Pencil size={16} className="text-vida-blue" /> PLUS y estrella de {nombreTienda || 'la tienda'}</h3>
        <button onClick={onCerrar} className="text-gray-400 hover:text-gray-700" aria-label="Cerrar"><X size={18} /></button>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Si eliges PLUS aquí, esos serán los PLUS de esta tienda (en la app, la caja, Rentabilidad y el Plan PLUS). Sin ninguno, usa los PLUS generales del catálogo.
        El producto estrella (hasta 3) es en el que se enfoca la tienda.
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto…"
            className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm" />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={soloElegidos} onChange={e => setSoloElegidos(e.target.checked)} /> Solo elegidos
        </label>
        <span className="text-xs text-gray-500"><b>{plus.size}</b>/30 PLUS · <b>{estrella.size}</b>/3 estrella</span>
      </div>
      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg mb-2">{error}</p>}
      {cargando ? <p className="text-sm text-gray-400">Cargando productos…</p> : (
        <div className="max-h-80 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-100">
          {visibles.length === 0 && <p className="text-sm text-gray-400 p-4 flex items-center gap-2"><Package size={15} /> Sin productos</p>}
          {visibles.map(p => {
            const id = String(p.idProducto);
            const esP = plus.has(id), esE = estrella.has(id);
            return (
              <div key={id} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{p.Nombre}</p>
                  <p className="text-[11px] text-gray-400">{USD(p.PrecioUSD)}{p.idPuntoVentaDueno ? ' · producto de la tienda' : ''}</p>
                </div>
                <button onClick={() => alternar(plus, setPlus, id, 30)} aria-pressed={esP}
                  className={`text-xs font-bold rounded-lg px-2.5 py-1.5 border ${esP ? 'bg-amber-400 text-white border-amber-400' : 'border-gray-200 text-gray-500 hover:border-amber-400'}`}>
                  {esP ? '✓ PLUS' : 'PLUS'}
                </button>
                <button onClick={() => alternar(estrella, setEstrella, id, 3)} aria-pressed={esE}
                  className={`text-xs font-bold rounded-lg px-2.5 py-1.5 border ${esE ? 'bg-vida-blue text-white border-vida-blue' : 'border-gray-200 text-gray-500 hover:border-vida-blue'}`}>
                  {esE ? '★ Estrella' : '☆ Estrella'}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-2 mt-4">
        <button onClick={guardar} disabled={guardando || cargando}
          className="flex items-center gap-2 bg-vida-blue text-white rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
          <Save size={15} /> {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button onClick={onCerrar} className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancelar</button>
      </div>
    </div>
  );
}
