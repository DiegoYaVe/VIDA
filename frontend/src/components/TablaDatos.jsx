// src/components/TablaDatos.jsx
// Tabla de datos del panel: encabezado fijo al bajar, columnas ordenables,
// filas clicables y paginación con tamaño de página. Los datos llegan ya
// paginados y ordenados desde el servidor (parámetros page, limit, orden, dir):
// así ordenar afecta a TODOS los registros, no solo a los de la página visible.
import { useEffect, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react';

const ALINEAR = { left: 'text-left', right: 'text-right', center: 'text-center' };

/**
 * columnas: [{ id, titulo, ordenable?, alinear?, ancho?, render(fila) }]
 * orden:    { col, dir: 'asc'|'desc' } · onOrden(col, dir)
 * paginacion: { page, total, porPagina, onPage(p), onPorPagina(n), opciones? }
 */
export default function TablaDatos({
  columnas, filas, clave, onFila, cargando = false, vacio,
  orden, onOrden, paginacion, etiqueta,
}) {
  const alternarOrden = (col) => {
    if (!onOrden) return;
    if (orden?.col === col) onOrden(col, orden.dir === 'asc' ? 'desc' : 'asc');
    else onOrden(col, 'asc');
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Zona con scroll propio: el encabezado queda fijo al bajar y las
          columnas que no caben se desplazan hacia los lados. */}
      <div className="overflow-auto max-h-[calc(100vh-15rem)] min-h-[8rem]">
        <table className="w-full text-sm" aria-label={etiqueta} aria-busy={cargando || undefined}>
          <thead className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_#f3f4f6]">
            <tr>
              {columnas.map(c => {
                const activa = orden?.col === c.id;
                const Icono = !activa ? ChevronsUpDown : orden.dir === 'asc' ? ChevronUp : ChevronDown;
                return (
                  <th key={c.id} scope="col"
                    aria-sort={activa ? (orden.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={`px-4 py-3 text-xs font-bold text-gray-500 uppercase whitespace-nowrap ${ALINEAR[c.alinear || 'left']} ${c.ancho || ''}`}>
                    {c.ordenable && onOrden ? (
                      <button type="button" onClick={() => alternarOrden(c.id)}
                        className={`inline-flex items-center gap-1 uppercase hover:text-vida-blue transition-colors ${activa ? 'text-vida-blue' : ''}`}
                        title={`Ordenar por ${c.titulo.toLowerCase()}`}>
                        {c.titulo}
                        <Icono size={13} className={activa ? '' : 'opacity-40'} />
                      </button>
                    ) : c.titulo}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className={`divide-y divide-gray-50 transition-opacity ${cargando && filas.length ? 'opacity-50' : ''}`}>
            {filas.map(f => (
              <tr key={clave(f)}
                onClick={onFila ? () => onFila(f) : undefined}
                onKeyDown={onFila ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onFila(f); } : undefined}
                tabIndex={onFila ? 0 : undefined}
                className={`hover:bg-blue-50/40 transition-colors ${onFila ? 'cursor-pointer focus:outline-none focus:bg-blue-50/60' : ''}`}>
                {columnas.map(c => (
                  <td key={c.id} className={`px-4 py-3 align-middle ${ALINEAR[c.alinear || 'left']}`}>
                    {c.render ? c.render(f) : (f[c.id] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {cargando && !filas.length && (
          <div className="flex items-center justify-center gap-2 py-12 text-gray-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Cargando…
          </div>
        )}
        {!cargando && !filas.length && (vacio || <p className="text-center py-12 text-gray-400 text-sm">Sin resultados</p>)}
      </div>

      {paginacion && <Paginacion {...paginacion} />}
    </div>
  );
}

function Paginacion({ page, total, porPagina, onPage, onPorPagina, opciones = [15, 25, 50, 100] }) {
  const pages = Math.max(1, Math.ceil(total / porPagina));
  const desde = total === 0 ? 0 : (page - 1) * porPagina + 1;
  const hasta = Math.min(page * porPagina, total);
  const [ir, setIr] = useState(String(page));
  useEffect(() => setIr(String(page)), [page]);

  const boton = 'p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent transition';
  const irA = () => {
    const n = Math.min(pages, Math.max(1, parseInt(ir, 10) || 1));
    setIr(String(n));
    if (n !== page) onPage(n);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
      <div className="flex items-center gap-3">
        <span className="tabular-nums">Mostrando <b className="text-gray-700">{desde}–{hasta}</b> de <b className="text-gray-700">{total}</b></span>
        {onPorPagina && (
          <label className="flex items-center gap-1.5">
            Filas
            <select value={porPagina} onChange={e => onPorPagina(Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-1.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-vida-blue">
              {opciones.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" className={`${boton} hidden sm:block`} disabled={page <= 1} onClick={() => onPage(1)} title="Primera página"><ChevronsLeft size={15} /></button>
        <button type="button" className={boton} disabled={page <= 1} onClick={() => onPage(page - 1)} title="Página anterior"><ChevronLeft size={15} /></button>
        <span className="flex items-center gap-1 px-1 whitespace-nowrap">
          Página
          <input value={ir} onChange={e => setIr(e.target.value.replace(/\D/g, ''))}
            onBlur={irA} onKeyDown={e => e.key === 'Enter' && irA()}
            inputMode="numeric" aria-label="Ir a la página"
            className="w-10 text-center border border-gray-200 rounded-lg py-1 tabular-nums focus:outline-none focus:ring-2 focus:ring-vida-blue" />
          de {pages}
        </span>
        <button type="button" className={boton} disabled={page >= pages} onClick={() => onPage(page + 1)} title="Página siguiente"><ChevronRight size={15} /></button>
        <button type="button" className={`${boton} hidden sm:block`} disabled={page >= pages} onClick={() => onPage(pages)} title="Última página"><ChevronsRight size={15} /></button>
      </div>
    </div>
  );
}

// Preferencia de vista guardada en el navegador (tarjetas o tabla, filas por página).
export function usePreferencia(clave, porDefecto) {
  const [valor, setValor] = useState(() => {
    try { const v = localStorage.getItem(clave); return v === null ? porDefecto : JSON.parse(v); }
    catch { return porDefecto; }
  });
  useEffect(() => { try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento */ } }, [clave, valor]);
  return [valor, setValor];
}

// Orden local para tablas cuyos datos ya están completos en el navegador
// (por ejemplo, el stock de una tienda). Los vacíos van siempre al final.
export function ordenarLocal(filas, orden) {
  if (!orden?.col) return filas;
  const signo = orden.dir === 'desc' ? -1 : 1;
  const norm = (v) => (v == null || v === '' ? null : typeof v === 'number' ? v
    : !isNaN(Number(v)) && String(v).trim() !== '' ? Number(v) : String(v).toLocaleLowerCase('es'));
  return [...filas].sort((a, b) => {
    const x = norm(a[orden.col]), y = norm(b[orden.col]);
    if (x === null) return y === null ? 0 : 1;
    if (y === null) return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * signo;
    return String(x).localeCompare(String(y), 'es') * signo;
  });
}
