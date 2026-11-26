// src/components/CargaLayout.jsx
// Inventario → Carga por layout (tarea 19): bajar el layout de Excel, llenarlo
// y subirlo para dar de alta o actualizar muchos productos de una tienda a la
// vez. Antes de guardar se muestra qué hará cada fila; se guarda todo o nada.
import { useState, useEffect } from 'react';
import { X, Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Store } from 'lucide-react';
import api from '../services/api.js';
import { COLUMNAS_LAYOUT, UNIDADES, MAX_FILAS_LAYOUT, filasDesdeHoja } from '../../../backend/src/domain/layoutInventario.mjs';

const ACCION = {
  CREAR:           { label: 'Nuevo', color: 'bg-green-100 text-green-700' },
  ACTUALIZAR:      { label: 'Actualiza', color: 'bg-blue-100 text-blue-700' },
  SOLO_EXISTENCIA: { label: 'Solo existencia', color: 'bg-purple-100 text-purple-700' },
  SIN_CAMBIOS:     { label: 'Sin cambios', color: 'bg-gray-100 text-gray-500' },
  ERROR:           { label: 'Error', color: 'bg-red-100 text-red-700' },
};
const IVA_TEXTO = { GENERAL: 'General', REDUCIDA: 'Reducida', EXENTO: 'Exento' };

async function descargarLayout({ categorias, productos, nombreTienda }) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Comercializadora VIDA';
  const hoja = wb.addWorksheet('Productos', { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = COLUMNAS_LAYOUT.map(c => ({ header: c.titulo, key: c.clave, width: c.ancho }));
  const enc = hoja.getRow(1);
  enc.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  enc.alignment = { vertical: 'middle', wrapText: true };
  enc.height = 30;
  enc.eachCell((celda, i) => {
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLUMNAS_LAYOUT[i - 1].titulo.endsWith('*') ? 'FF0A1E3F' : 'FF3B6E9C' } };
    if (COLUMNAS_LAYOUT[i - 1].ayuda) celda.note = COLUMNAS_LAYOUT[i - 1].ayuda;
  });
  for (const p of productos) {
    hoja.addRow({
      SKU: p.SKU || '', CodigoBarras: p.CodigoBarras || '', Nombre: p.Nombre, Categoria: p.NombreCategoria || '',
      Unidad: p.UnidadMedida, UnidadesPorCaja: p.UnidadesPorCaja ?? '', PrecioUSD: Number(p.PrecioUSD),
      CostoUSD: p.CostoUSD == null ? '' : Number(p.CostoUSD), StockMinimo: Number(p.StockMinimo || 0),
      Existencia: Number(p.StockDisponible || 0), IVA: IVA_TEXTO[p.AlicuotaIVA] || 'General',
      Plus: p.EsProductoPlus ? 'Sí' : 'No', PesoKg: p.PesoKg ?? '', Descripcion: p.Descripcion || '',
    });
  }
  // Listas desplegables en 1.000 filas
  const cats = wb.addWorksheet('Categorías');
  cats.columns = [{ header: 'Categorías disponibles', key: 'n', width: 32 }];
  cats.getRow(1).font = { bold: true };
  categorias.forEach(c => cats.addRow({ n: c.Nombre }));
  const col = (clave) => String.fromCharCode(65 + COLUMNAS_LAYOUT.findIndex(c => c.clave === clave));
  const lista = (formulae) => ({ type: 'list', allowBlank: true, formulae, showErrorMessage: true, errorTitle: 'Valor no válido', error: 'Elige un valor de la lista.' });
  for (let r = 2; r <= 1001; r++) {
    if (categorias.length) hoja.getCell(`${col('Categoria')}${r}`).dataValidation = lista([`'Categorías'!$A$2:$A$${categorias.length + 1}`]);
    hoja.getCell(`${col('Unidad')}${r}`).dataValidation = lista([`"${UNIDADES.join(',')}"`]);
    hoja.getCell(`${col('IVA')}${r}`).dataValidation = lista(['"General,Reducida,Exento"']);
    hoja.getCell(`${col('Plus')}${r}`).dataValidation = lista(['"Sí,No"']);
  }
  const ins = wb.addWorksheet('Instrucciones');
  ins.columns = [{ width: 110 }];
  [
    `Layout de productos — ${nombreTienda}`,
    '',
    '1. Llena la hoja «Productos», un producto por fila. Las columnas con * son obligatorias.',
    '2. Categoría, Unidad, IVA y Producto PLUS se eligen de la lista desplegable de cada celda.',
    '3. Si la unidad es Caja, escribe cuántas unidades trae en «Unidades por caja».',
    '4. «Existencia en tienda» es cuántos tienes HOY. Si la dejas vacía, el stock no se toca.',
    '5. Si el SKU (o, sin SKU, el código de barras) ya existe, el producto se actualiza; si no, se crea.',
    '6. Los productos del catálogo de VIDA solo cargan su existencia: su nombre y precio los define VIDA.',
    `7. Máximo ${MAX_FILAS_LAYOUT} productos por archivo. Guárdalo como .xlsx y súbelo en Inventario → Carga por layout.`,
    '',
    'Ejemplo: SKU HARINA01 · Nombre Harina de maíz 1 kg · Categoría Víveres · Unidad Pieza · Precio 1.60 · Costo 1.30 · Stock mínimo 10 · Existencia 24',
  ].forEach((t, i) => { const r = ins.addRow([t]); if (i === 0) r.font = { bold: true, size: 14 }; });

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `layout-productos-${nombreTienda.replace(/[^\w-]+/g, '_').slice(0, 40)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function CargaLayout({ esVida, idPuntoVentaUsuario, onClose, onCargado }) {
  const [tiendas, setTiendas] = useState([]);
  const [idPV, setIdPV] = useState(idPuntoVentaUsuario ? String(idPuntoVentaUsuario) : '');
  const [paraCatalogo, setParaCatalogo] = useState(false);
  const [conProductos, setConProductos] = useState(true);
  const [filas, setFilas] = useState(null);
  const [archivo, setArchivo] = useState('');
  const [plan, setPlan] = useState(null);
  const [proc, setProc] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState(null);

  useEffect(() => {
    if (!esVida) return;
    api.get('/sucursales/puntos-venta').then(r => setTiendas(Array.isArray(r.data) ? r.data : [])).catch(() => setTiendas([]));
  }, [esVida]);
  const nombreTienda = tiendas.find(t => String(t.idPuntoVenta) === idPV)?.NomComercial || 'mi tienda';

  async function bajar() {
    setProc(true); setError('');
    try {
      const [cats, prods] = await Promise.all([
        api.get('/inventario/categorias'),
        conProductos && idPV
          ? api.get('/inventario/productos', { params: { limit: 1000, page: 1, idPuntoVenta: idPV, orden: 'Nombre', dir: 'asc' } })
          : Promise.resolve({ data: { data: [] } }),
      ]);
      await descargarLayout({ categorias: cats.data, productos: prods.data.data || [], nombreTienda });
    } catch (e) { setError(e.response?.data?.error || 'No se pudo armar el layout'); }
    finally { setProc(false); }
  }

  async function revisar(lista) {
    setProc(true); setError(''); setPlan(null);
    try {
      const r = await api.post('/inventario/layout', { filas: lista, confirmar: false, idPuntoVenta: idPV ? Number(idPV) : undefined, paraCatalogo });
      setPlan(r.data);
    } catch (e) { setError(e.response?.data?.error || 'No se pudo revisar el archivo'); }
    finally { setProc(false); }
  }

  async function leerArchivo(file) {
    if (!file) return;
    setError(''); setPlan(null); setHecho(null); setArchivo(file.name);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const hoja = wb.Sheets.Productos || wb.Sheets[wb.SheetNames[0]];
      const lista = filasDesdeHoja(XLSX.utils.sheet_to_json(hoja, { defval: '', raw: true }));
      if (!lista.length) { setError('El archivo no trae productos en la hoja «Productos».'); return; }
      if (lista.length > MAX_FILAS_LAYOUT) { setError(`El archivo trae ${lista.length} productos; el máximo es ${MAX_FILAS_LAYOUT}. Divídelo en varios.`); return; }
      setFilas(lista);
      await revisar(lista);
    } catch {
      setError('No se pudo leer el archivo. Usa el layout de VIDA guardado como .xlsx.');
    }
  }

  async function cargar() {
    setProc(true); setError('');
    try {
      const r = await api.post('/inventario/layout', { filas, confirmar: true, idPuntoVenta: idPV ? Number(idPV) : undefined, paraCatalogo });
      setHecho(r.data); onCargado?.();
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo cargar');
      if (e.response?.data?.filas) setPlan(e.response.data);
    } finally { setProc(false); }
  }

  const r = plan?.resumen;
  const aGuardar = r ? r.crear + r.actualizar + r.soloExistencia : 0;
  const listo = esVida ? !!idPV : true;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4" role="dialog" aria-modal="true" aria-label="Carga por layout">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-gray-100">
          <div className="min-w-0">
            <h3 className="font-black text-gray-800 text-lg flex items-center gap-2"><FileSpreadsheet size={20} className="text-vida-green" /> Carga por layout</h3>
            <p className="text-xs text-gray-500">Da de alta o actualiza muchos productos de una tienda con un Excel.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {hecho ? (
            <div className="text-center py-6 space-y-2">
              <CheckCircle2 size={44} className="mx-auto text-vida-green" />
              <p className="font-black text-gray-800 text-lg">Inventario cargado</p>
              <p className="text-sm text-gray-600">
                {hecho.creados} producto{hecho.creados === 1 ? '' : 's'} nuevo{hecho.creados === 1 ? '' : 's'} · {hecho.actualizados} actualizado{hecho.actualizados === 1 ? '' : 's'} · {hecho.movimientos} existencia{hecho.movimientos === 1 ? '' : 's'} cargada{hecho.movimientos === 1 ? '' : 's'}
                {hecho.categoriasCreadas ? ` · ${hecho.categoriasCreadas} categoría(s) nueva(s)` : ''}
              </p>
              <button onClick={onClose} className="mt-3 bg-vida-blue text-white font-bold rounded-xl px-5 py-2.5">Listo</button>
            </div>
          ) : <>
          {esVida && (
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-gray-500">Tienda
                <div className="relative mt-1">
                  <Store size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <select value={idPV} onChange={e => { setIdPV(e.target.value); setPlan(null); setFilas(null); setArchivo(''); }}
                    className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm bg-white">
                    <option value="">— Elige la tienda —</option>
                    {tiendas.map(t => <option key={t.idPuntoVenta} value={t.idPuntoVenta}>{t.NomComercial}</option>)}
                  </select>
                </div>
              </label>
              <label className="flex items-start gap-2 text-sm text-gray-700 sm:pt-6 cursor-pointer">
                <input type="checkbox" checked={paraCatalogo} onChange={e => { setParaCatalogo(e.target.checked); setPlan(null); }} className="mt-0.5 w-4 h-4 accent-vida-blue" />
                <span>Los productos nuevos van al <b>catálogo de VIDA</b> (los ven todas las tiendas)
                  <span className="block text-xs text-gray-400">Sin marcar: quedan como productos propios de la tienda elegida.</span></span>
              </label>
            </div>
          )}

          {/* Paso 1 */}
          <section className="rounded-2xl border border-gray-100 p-4 space-y-3">
            <p className="font-bold text-gray-800">1. Baja el layout</p>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={conProductos} onChange={e => setConProductos(e.target.checked)} className="w-4 h-4 accent-vida-blue" />
              Con los productos que ya tiene la tienda (para actualizar precios o existencias)
            </label>
            <button onClick={bajar} disabled={proc || !listo}
              className="flex items-center gap-2 border-2 border-vida-blue text-vida-blue font-bold rounded-xl px-4 py-2.5 text-sm disabled:opacity-40">
              <Download size={16} /> Descargar layout (.xlsx)
            </button>
            <p className="text-xs text-gray-400">Trae listas desplegables para categoría, unidad, IVA y PLUS, y una hoja con instrucciones.</p>
          </section>

          {/* Paso 2 */}
          <section className="rounded-2xl border border-gray-100 p-4 space-y-3">
            <p className="font-bold text-gray-800">2. Súbelo ya lleno</p>
            <label className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-xl px-4 py-5 text-sm font-semibold cursor-pointer ${listo ? 'border-gray-300 text-gray-600 hover:border-vida-green hover:text-vida-green' : 'border-gray-200 text-gray-300 cursor-not-allowed'}`}>
              <Upload size={18} /> {archivo || 'Elegir el archivo .xlsx'}
              <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" disabled={!listo || proc}
                onChange={e => { leerArchivo(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </section>

          {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
          {proc && !plan && <p className="text-sm text-gray-500">Revisando…</p>}

          {/* Paso 3: revisión */}
          {plan && (
            <section className="space-y-3">
              <p className="font-bold text-gray-800">3. Revisa antes de cargar</p>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className={`px-2.5 py-1 rounded-full ${ACCION.CREAR.color}`}>{r.crear} nuevos</span>
                <span className={`px-2.5 py-1 rounded-full ${ACCION.ACTUALIZAR.color}`}>{r.actualizar} se actualizan</span>
                {r.soloExistencia > 0 && <span className={`px-2.5 py-1 rounded-full ${ACCION.SOLO_EXISTENCIA.color}`}>{r.soloExistencia} solo existencia</span>}
                {r.sinCambios > 0 && <span className={`px-2.5 py-1 rounded-full ${ACCION.SIN_CAMBIOS.color}`}>{r.sinCambios} sin cambios</span>}
                {r.errores > 0 && <span className={`px-2.5 py-1 rounded-full ${ACCION.ERROR.color}`}>{r.errores} con error</span>}
              </div>
              {r.errores > 0 && (
                <p className="text-sm text-red-700 bg-red-50 rounded-xl px-4 py-3 flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  Corrige en el Excel las filas con error y vuelve a subirlo. No se carga nada hasta que no haya errores.</p>
              )}
              <div className="overflow-x-auto border border-gray-100 rounded-xl max-h-80">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0"><tr className="text-left text-xs text-gray-500 uppercase">
                    {['Fila', 'Qué pasa', 'Producto', 'SKU', 'Existencia', 'Detalle'].map(h => <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {[...plan.filas].sort((a, b) => (a.accion === 'ERROR' ? 0 : 1) - (b.accion === 'ERROR' ? 0 : 1) || a.fila - b.fila).map(f => (
                      <tr key={f.fila} className="align-top">
                        <td className="px-3 py-2 text-gray-400 tabular-nums">{f.fila}</td>
                        <td className="px-3 py-2"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${ACCION[f.accion].color}`}>{ACCION[f.accion].label}</span></td>
                        <td className="px-3 py-2 text-gray-800 min-w-[10rem]">{f.datos.Nombre || '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-500">{f.datos.SKU || '—'}</td>
                        <td className="px-3 py-2 tabular-nums text-gray-600">{f.datos.Existencia ?? '—'}</td>
                        <td className="px-3 py-2 text-xs min-w-[14rem]">
                          {f.errores.map((e, i) => <p key={i} className="text-red-600">{e}</p>)}
                          {f.avisos.map((e, i) => <p key={i} className="text-gray-500">{e}</p>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          </>}
        </div>

        {!hecho && (
          <div className="flex gap-2 p-4 border-t border-gray-100">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200">Cancelar</button>
            <button onClick={cargar} disabled={!plan || r.errores > 0 || aGuardar === 0 || proc}
              className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #54C4E0, #5BBE6A)' }}>
              {proc && plan ? 'Cargando…' : `Cargar ${aGuardar} producto${aGuardar === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
