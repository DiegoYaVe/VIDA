// src/components/ListaProveedor.jsx
// Proveedores → Lista de precios (tarea 26): VIDA baja el layout de Excel del
// proveedor (ya lleno con lo que tenemos de él), el proveedor lo actualiza y
// VIDA lo sube. Antes de guardar se ve qué cambia; se guarda todo o nada. Los
// productos que VIDA no tiene quedan en «Productos por aprobar».
import { useState, useEffect } from 'react';
import { X, Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, CalendarDays, TrendingUp, TrendingDown } from 'lucide-react';
import api from '../services/api.js';
import { COLUMNAS_LISTA, UNIDADES_COMPRA, MAX_FILAS_LISTA, ALERTA_CAMBIO_PCT, filasListaDesdeHoja } from '../../../backend/src/domain/listaProveedor.mjs';

const ACCION = {
  ACTUALIZAR:  { label: 'Actualiza', color: 'bg-blue-100 text-blue-700' },
  VINCULAR:    { label: 'Se liga', color: 'bg-teal-100 text-teal-700' },
  NUEVO:       { label: 'Por aprobar', color: 'bg-amber-100 text-amber-700' },
  SIN_CAMBIOS: { label: 'Sin cambios', color: 'bg-gray-100 text-gray-500' },
  ERROR:       { label: 'Error', color: 'bg-red-100 text-red-700' },
};
const IVA_TEXTO = { GENERAL: 'General', REDUCIDA: 'Reducida', EXENTO: 'Exento' };
const USD = (v) => (v == null ? '—' : `$${Number(v).toFixed(2)}`);
const fecha = (v) => (v ? new Date(v).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null);

async function descargarLista({ proveedor, productos }) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Comercializadora VIDA';
  const hoja = wb.addWorksheet('Lista de precios', { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = COLUMNAS_LISTA.map(c => ({ header: c.titulo, key: c.clave, width: c.ancho }));
  const enc = hoja.getRow(1);
  enc.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  enc.alignment = { vertical: 'middle', wrapText: true };
  enc.height = 34;
  enc.eachCell((celda, i) => {
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLUMNAS_LISTA[i - 1].titulo.endsWith('*') ? 'FF0A1E3F' : 'FF3B6E9C' } };
    if (COLUMNAS_LISTA[i - 1].ayuda) celda.note = COLUMNAS_LISTA[i - 1].ayuda;
  });
  for (const p of productos) {
    hoja.addRow({
      CodigoProveedor: p.CodigoProveedor || '', CodigoBarras: p.CodigoBarras || '', Nombre: p.Nombre, Marca: '',
      Categoria: p.NombreCategoria || '', UnidadCompra: p.UnidadCompra || 'Pieza', UnidadesEmpaque: p.UnidadesEmpaque ?? '',
      PrecioLista: p.PrecioCosto == null ? '' : Number(p.PrecioCosto),
      PrecioSugerido: p.PrecioSugeridoUSD == null ? '' : Number(p.PrecioSugeridoUSD),
      IVA: IVA_TEXTO[p.AlicuotaIVA] || 'General', PedidoMinimo: p.PedidoMinimo == null ? '' : Number(p.PedidoMinimo),
      PesoKg: p.PesoKg == null ? '' : Number(p.PesoKg), Disponible: p.Disponible === false ? 'No' : 'Sí', DiasEntrega: p.DiasEntrega ?? '',
    });
  }
  const col = (clave) => String.fromCharCode(65 + COLUMNAS_LISTA.findIndex(c => c.clave === clave));
  const lista = (formulae) => ({ type: 'list', allowBlank: true, formulae, showErrorMessage: true, errorTitle: 'Valor no válido', error: 'Elige un valor de la lista.' });
  for (let r = 2; r <= MAX_FILAS_LISTA + 1; r++) {
    hoja.getCell(`${col('UnidadCompra')}${r}`).dataValidation = lista([`"${UNIDADES_COMPRA.join(',')}"`]);
    hoja.getCell(`${col('IVA')}${r}`).dataValidation = lista(['"General,Reducida,Exento"']);
    hoja.getCell(`${col('Disponible')}${r}`).dataValidation = lista(['"Sí,No"']);
    for (const k of ['PrecioLista', 'PrecioSugerido']) hoja.getCell(`${col(k)}${r}`).numFmt = '0.00';
  }
  const ins = wb.addWorksheet('Instrucciones');
  ins.columns = [{ width: 115 }];
  [
    `Lista de precios — ${proveedor.Nombre} para Comercializadora VIDA`,
    '',
    '1. Llena la hoja «Lista de precios», un producto por fila. Las columnas con * son obligatorias.',
    '2. «Código del proveedor» es TU código del producto: con él te mandamos las órdenes de compra. No lo cambies de un mes a otro.',
    '3. «Precio por unidad USD» es el precio de UNA pieza (o un kg o un litro), sin IVA.',
    '   Si vendes por caja o bulto, escribe la unidad de compra (Caja o Bulto), cuántas piezas trae, y el precio de UNA pieza.',
    '4. Escribe el código de barras del empaque siempre que lo tengas: así reconocemos el producto.',
    '5. Si hoy no tienes un producto, pon «No» en Disponible en lugar de borrarlo.',
    '6. Puedes agregar productos nuevos al final; VIDA los revisa antes de ofrecerlos a las tiendas.',
    `7. Máximo ${MAX_FILAS_LISTA} productos por archivo. Guárdalo como .xlsx y devuélvelo a VIDA.`,
    '',
    'Ejemplo: Código CAF-250 · Código de barras 7591234567890 · Café molido 250 g · Marca Fama · Unidad de compra Caja · Piezas 12 · Precio por unidad 3.10 · Sugerido 3.80 · IVA General · Pedido mínimo 12 · Peso 0.25 · Disponible Sí · Días de entrega 2',
  ].forEach((t, i) => { const r = ins.addRow([t]); if (i === 0) r.font = { bold: true, size: 14 }; });

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `lista-precios-${proveedor.Nombre.replace(/[^\w-]+/g, '_').slice(0, 40)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function ListaProveedor({ proveedor, onClose, onCargado, onIrAprobar }) {
  const [info, setInfo] = useState(null);
  const [vigencia, setVigencia] = useState('');
  const [filas, setFilas] = useState(null);
  const [archivo, setArchivo] = useState('');
  const [plan, setPlan] = useState(null);
  const [marcarAusentes, setMarcarAusentes] = useState(true);
  const [proc, setProc] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState(null);

  useEffect(() => {
    api.get(`/proveedores/${proveedor.idProveedor}/lista`)
      .then(r => { setInfo(r.data); if (r.data.proveedor?.ListaVigenteHasta) setVigencia(String(r.data.proveedor.ListaVigenteHasta).slice(0, 10)); })
      .catch(e => setError(e.response?.data?.error || 'No se pudo leer la lista del proveedor'));
  }, [proveedor.idProveedor]);

  async function bajar() {
    setProc(true); setError('');
    try { await descargarLista({ proveedor, productos: info?.productos || [] }); }
    catch { setError('No se pudo armar el layout'); }
    finally { setProc(false); }
  }

  async function revisar(lista) {
    setProc(true); setError(''); setPlan(null);
    try { setPlan((await api.post(`/proveedores/${proveedor.idProveedor}/lista`, { filas: lista, confirmar: false })).data); }
    catch (e) { setError(e.response?.data?.error || 'No se pudo revisar el archivo'); }
    finally { setProc(false); }
  }

  async function leerArchivo(file) {
    if (!file) return;
    setError(''); setPlan(null); setHecho(null); setArchivo(file.name);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const hoja = wb.Sheets['Lista de precios'] || wb.Sheets[wb.SheetNames[0]];
      const lista = filasListaDesdeHoja(XLSX.utils.sheet_to_json(hoja, { defval: '', raw: true }));
      if (!lista.length) { setError('El archivo no trae productos en la hoja «Lista de precios».'); return; }
      if (lista.length > MAX_FILAS_LISTA) { setError(`El archivo trae ${lista.length} productos; el máximo es ${MAX_FILAS_LISTA}. Divídelo en varios.`); return; }
      setFilas(lista);
      await revisar(lista);
    } catch {
      setError('No se pudo leer el archivo. Usa el layout de VIDA guardado como .xlsx.');
    }
  }

  async function cargar() {
    setProc(true); setError('');
    try {
      const r = await api.post(`/proveedores/${proveedor.idProveedor}/lista`, { filas, confirmar: true, vigenteHasta: vigencia || null, marcarAusentes });
      setHecho(r.data); onCargado?.();
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo cargar la lista');
      if (e.response?.data?.filas) setPlan(e.response.data);
    } finally { setProc(false); }
  }

  const r = plan?.resumen;
  const ausentesDisp = plan ? plan.ausentes.filter(a => a.Disponible).length : 0;
  const aGuardar = r ? r.actualizar + r.vincular + r.nuevos + (marcarAusentes ? ausentesDisp : 0) : 0;
  const prov = info?.proveedor;
  const orden = { ERROR: 0, NUEVO: 1, VINCULAR: 2, ACTUALIZAR: 3, SIN_CAMBIOS: 4 };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4" role="dialog" aria-modal="true" aria-label="Lista de precios del proveedor">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-gray-100">
          <div className="min-w-0">
            <h3 className="font-black text-gray-800 text-lg flex items-center gap-2"><FileSpreadsheet size={20} className="text-vida-green" /> Lista de precios · {proveedor.Nombre}</h3>
            <p className="text-xs text-gray-500">
              {prov?.ListaFechaCarga ? `Última carga: ${fecha(prov.ListaFechaCarga)}` : 'Todavía no se ha cargado una lista por Excel'}
              {prov?.ListaVigenteHasta ? ` · vigente hasta ${fecha(prov.ListaVigenteHasta)}` : ''}
              {info ? ` · ${info.productos.length} producto${info.productos.length === 1 ? '' : 's'} hoy` : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {hecho ? (
            <div className="text-center py-6 space-y-2">
              <CheckCircle2 size={44} className="mx-auto text-vida-green" />
              <p className="font-black text-gray-800 text-lg">Lista cargada</p>
              <p className="text-sm text-gray-600">
                {hecho.actualizados} actualizado{hecho.actualizados === 1 ? '' : 's'} · {hecho.ligados} ligado{hecho.ligados === 1 ? '' : 's'} al catálogo
                · {hecho.preciosCambiados} precio{hecho.preciosCambiados === 1 ? '' : 's'} cambiado{hecho.preciosCambiados === 1 ? '' : 's'}
                {hecho.noDisponibles ? ` · ${hecho.noDisponibles} ya no disponible${hecho.noDisponibles === 1 ? '' : 's'}` : ''}
              </p>
              {hecho.porAprobar > 0 && (
                <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-4 py-3 inline-block">
                  {hecho.porAprobar} producto{hecho.porAprobar === 1 ? ' nuevo espera' : 's nuevos esperan'} tu aprobación.
                  {onIrAprobar && <button onClick={onIrAprobar} className="ml-2 font-bold underline">Revisarlos ahora</button>}
                </p>
              )}
              <div><button onClick={onClose} className="mt-3 bg-vida-blue text-white font-bold rounded-xl px-5 py-2.5">Listo</button></div>
            </div>
          ) : <>
          <section className="rounded-2xl border border-gray-100 p-4 space-y-3">
            <p className="font-bold text-gray-800">1. Baja el layout y mándaselo al proveedor</p>
            <button onClick={bajar} disabled={proc || !info}
              className="flex items-center gap-2 border-2 border-vida-blue text-vida-blue font-bold rounded-xl px-4 py-2.5 text-sm disabled:opacity-40">
              <Download size={16} /> Descargar layout (.xlsx)
            </button>
            <p className="text-xs text-gray-400">Ya trae los productos que tenemos de este proveedor, listas desplegables y una hoja de instrucciones para él.</p>
          </section>

          <section className="rounded-2xl border border-gray-100 p-4 space-y-3">
            <p className="font-bold text-gray-800">2. Sube la lista que te devolvió</p>
            <label className="block text-xs font-semibold text-gray-500 max-w-xs">Lista vigente hasta (opcional)
              <div className="relative mt-1">
                <CalendarDays size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="date" value={vigencia} onChange={e => setVigencia(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm" />
              </div>
            </label>
            <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-xl px-4 py-5 text-sm font-semibold cursor-pointer border-gray-300 text-gray-600 hover:border-vida-green hover:text-vida-green">
              <Upload size={18} /> {archivo || 'Elegir el archivo .xlsx'}
              <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" disabled={proc}
                onChange={e => { leerArchivo(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </section>

          {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
          {proc && !plan && <p className="text-sm text-gray-500">Revisando…</p>}

          {plan && (
            <section className="space-y-3">
              <p className="font-bold text-gray-800">3. Revisa antes de cargar</p>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className={`px-2.5 py-1 rounded-full ${ACCION.ACTUALIZAR.color}`}>{r.actualizar} se actualizan</span>
                {r.vincular > 0 && <span className={`px-2.5 py-1 rounded-full ${ACCION.VINCULAR.color}`}>{r.vincular} se ligan al catálogo</span>}
                {r.nuevos > 0 && <span className={`px-2.5 py-1 rounded-full ${ACCION.NUEVO.color}`}>{r.nuevos} nuevos por aprobar</span>}
                {r.sinCambios > 0 && <span className={`px-2.5 py-1 rounded-full ${ACCION.SIN_CAMBIOS.color}`}>{r.sinCambios} sin cambios</span>}
                {r.errores > 0 && <span className={`px-2.5 py-1 rounded-full ${ACCION.ERROR.color}`}>{r.errores} con error</span>}
                {r.cambiosFuertes > 0 && <span className="px-2.5 py-1 rounded-full bg-orange-100 text-orange-700">{r.cambiosFuertes} cambian más de {ALERTA_CAMBIO_PCT}%</span>}
                {r.conPerdida > 0 && <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700">{r.conPerdida} dejarían a la tienda sin ganancia</span>}
              </div>
              {r.errores > 0 && (
                <p className="text-sm text-red-700 bg-red-50 rounded-xl px-4 py-3 flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  Corrige en el Excel las filas con error y vuelve a subirlo. No se carga nada hasta que no haya errores.</p>
              )}
              <div className="overflow-x-auto border border-gray-100 rounded-xl max-h-80">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0"><tr className="text-left text-xs text-gray-500 uppercase">
                    {['Fila', 'Qué pasa', 'Producto', 'Código', 'Precio por unidad', 'Margen tienda', 'Detalle'].map(h => <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {[...plan.filas].sort((a, b) => orden[a.accion] - orden[b.accion] || a.fila - b.fila).map(f => {
                      const d = f.datos, fuerte = d.CambioPct != null && Math.abs(d.CambioPct) > ALERTA_CAMBIO_PCT;
                      return (
                        <tr key={f.fila} className="align-top">
                          <td className="px-3 py-2 text-gray-400 tabular-nums">{f.fila}</td>
                          <td className="px-3 py-2"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${ACCION[f.accion].color}`}>{ACCION[f.accion].label}</span></td>
                          <td className="px-3 py-2 text-gray-800 min-w-[10rem]">{d.Nombre || '—'}{d.Disponible === false && <span className="ml-1 text-xs text-gray-400">(no disponible)</span>}</td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-500">{d.CodigoProveedor || '—'}</td>
                          <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                            {d.PrecioAnterior != null && d.PrecioAnterior !== d.PrecioLista && <span className="text-gray-400 line-through mr-1">{USD(d.PrecioAnterior)}</span>}
                            <span className="font-semibold text-gray-800">{USD(d.PrecioLista)}</span>
                            {d.CambioPct != null && (
                              <span className={`ml-1 text-xs font-bold inline-flex items-center gap-0.5 ${fuerte ? 'text-orange-600' : 'text-gray-500'}`}>
                                {d.CambioPct > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{Math.abs(d.CambioPct)}%
                              </span>
                            )}
                          </td>
                          <td className={`px-3 py-2 tabular-nums ${d.MargenTiendaPct != null && d.MargenTiendaPct <= 0 ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                            {d.MargenTiendaPct == null ? '—' : `${d.MargenTiendaPct}%`}
                          </td>
                          <td className="px-3 py-2 text-xs min-w-[14rem]">
                            {f.errores.map((e, i) => <p key={i} className="text-red-600">{e}</p>)}
                            {f.avisos.map((e, i) => <p key={i} className="text-gray-500">{e}</p>)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {ausentesDisp > 0 && (
                <label className="flex items-start gap-2 text-sm text-gray-700 bg-gray-50 rounded-xl px-4 py-3 cursor-pointer">
                  <input type="checkbox" checked={marcarAusentes} onChange={e => setMarcarAusentes(e.target.checked)} className="mt-0.5 w-4 h-4 accent-vida-blue" />
                  <span>Marcar como <b>no disponible{ausentesDisp === 1 ? '' : 's'}</b> {ausentesDisp === 1 ? 'el producto' : `los ${ausentesDisp} productos`} que la lista ya no trae
                    <span className="block text-xs text-gray-400">{plan.ausentes.filter(a => a.Disponible).slice(0, 6).map(a => a.Nombre).join(', ')}{ausentesDisp > 6 ? '…' : ''}. No se borran: dejan de ofrecerse a las tiendas.</span></span>
                </label>
              )}
              <p className="text-xs text-gray-400">«Margen tienda» = lo que gana la tienda entre el precio de lista y su precio de venta del catálogo VIDA.</p>
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
              {proc && plan ? 'Cargando…' : `Cargar lista (${aGuardar} cambio${aGuardar === 1 ? '' : 's'})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
