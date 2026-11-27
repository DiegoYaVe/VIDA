// Lista de precios del proveedor por layout de Excel (tarea 26).
// El proveedor llena el layout; VIDA lo sube. El panel lee el archivo y el
// backend vuelve a validar cada fila con estas reglas. Sin BD: se prueba sola.
//
// Precio de lista = lo que la tienda paga a VIDA por UNA unidad del producto
// (la misma unidad en que la tienda lo pide). VIDA le paga al proveedor ese
// precio menos su comisión (reabastoProveedor.service).
import { normalizar } from './layoutInventario.mjs';

export const COLUMNAS_LISTA = [
  { clave: 'CodigoProveedor', titulo: 'Código del proveedor *', ancho: 18, ayuda: 'Tu código del producto. Con él te hacemos las órdenes de compra.' },
  { clave: 'CodigoBarras', titulo: 'Código de barras', ancho: 18, ayuda: 'El del empaque (EAN/UPC). Con él reconocemos el producto.' },
  { clave: 'Nombre', titulo: 'Nombre del producto *', ancho: 34 },
  { clave: 'Marca', titulo: 'Marca', ancho: 16 },
  { clave: 'Categoria', titulo: 'Categoría', ancho: 18 },
  { clave: 'UnidadCompra', titulo: 'Unidad de compra *', ancho: 13, ayuda: 'Cómo lo vendes: Pieza, Caja, Bulto, Kg o Litro.' },
  { clave: 'UnidadesEmpaque', titulo: 'Piezas por caja o bulto', ancho: 13, ayuda: 'Solo si la unidad de compra es Caja o Bulto.' },
  { clave: 'PrecioLista', titulo: 'Precio por unidad USD *', ancho: 14, ayuda: 'Precio de UNA pieza (o un kg o litro), sin IVA. Si vendes por caja, divide el precio de la caja entre sus piezas.' },
  { clave: 'PrecioSugerido', titulo: 'Precio sugerido al público USD', ancho: 15 },
  { clave: 'IVA', titulo: 'IVA', ancho: 11, ayuda: 'General, Reducida o Exento. Vacío = General.' },
  { clave: 'PedidoMinimo', titulo: 'Pedido mínimo (unidades)', ancho: 13 },
  { clave: 'PesoKg', titulo: 'Peso por unidad kg', ancho: 12, ayuda: 'Para elegir el vehículo que lo lleva.' },
  { clave: 'Disponible', titulo: 'Disponible', ancho: 11, ayuda: 'Sí o No. Vacío = Sí.' },
  { clave: 'DiasEntrega', titulo: 'Días de entrega', ancho: 11 },
];
export const UNIDADES_COMPRA = ['Pieza', 'Caja', 'Bulto', 'Kg', 'Litro'];
export const MAX_FILAS_LISTA = 2000;
// Un cambio de precio mayor a esto se marca para revisarlo con el proveedor
export const ALERTA_CAMBIO_PCT = 15;

const POR_TITULO = new Map(COLUMNAS_LISTA.flatMap(c => [[normalizar(c.titulo), c.clave], [normalizar(c.clave), c.clave]]));

// Filas del Excel (objetos con los encabezados como llaves) → claves internas.
// Las filas vacías se saltan; `fila` = número de fila en el Excel.
export function filasListaDesdeHoja(objetos) {
  const out = [];
  (objetos || []).forEach((o, i) => {
    const f = { fila: i + 2 };
    let algo = false;
    for (const [k, v] of Object.entries(o || {})) {
      const clave = POR_TITULO.get(normalizar(k));
      if (!clave) continue;
      const valor = typeof v === 'string' ? v.trim() : v;
      if (valor !== '' && valor != null) { f[clave] = valor; algo = true; }
    }
    if (algo) out.push(f);
  });
  return out;
}

const numero = (v) => {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace('$', '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
const r4 = (n) => Math.round(n * 10000) / 10000;
const texto = (v, max) => (v == null ? null : String(v).trim().slice(0, max) || null);
const UNIDAD = { pieza: 'Pieza', piezas: 'Pieza', pza: 'Pieza', unidad: 'Pieza', und: 'Pieza', caja: 'Caja', cajas: 'Caja',
  bulto: 'Bulto', bultos: 'Bulto', fardo: 'Bulto', kg: 'Kg', kilo: 'Kg', kilos: 'Kg', litro: 'Litro', litros: 'Litro', lt: 'Litro', l: 'Litro' };
const IVA = { general: 'GENERAL', reducida: 'REDUCIDA', reducido: 'REDUCIDA', exento: 'EXENTO', exenta: 'EXENTO' };
const SI = ['si', 's', 'x', '1', 'true', 'yes'];
const NO = ['no', 'n', '0', 'false'];
const barras = (v) => (v == null ? null : String(v).replace(/\s/g, '').slice(0, 100) || null);

// Revisa la lista contra lo que hay.
//   actuales: productos que hoy tiene el proveedor en VIDA
//     [{ idProducto, CodigoProveedor, PrecioCosto, Disponible, Nombre, CodigoBarras, PrecioUSD, UnidadCompra, UnidadesEmpaque,
//        PrecioSugeridoUSD, PedidoMinimo, DiasEntrega }]
//   catalogo: productos activos del catálogo de VIDA [{ idProducto, Nombre, CodigoBarras, PrecioUSD }]
//   pendientes: códigos del proveedor que ya esperan aprobación [CodigoProveedor]
// accion por fila: ACTUALIZAR | SIN_CAMBIOS | VINCULAR (ya existe en VIDA) | NUEVO (por aprobar) | ERROR
// ausentes: productos del proveedor que la lista ya no trae.
export function planLista(filas, { actuales = [], catalogo = [], pendientes = [] } = {}) {
  const porCodigo = new Map(actuales.filter(a => a.CodigoProveedor).map(a => [normalizar(a.CodigoProveedor), a]));
  const actualPorBarras = new Map(actuales.filter(a => a.CodigoBarras).map(a => [barras(a.CodigoBarras), a]));
  const catPorBarras = new Map(catalogo.filter(p => p.CodigoBarras).map(p => [barras(p.CodigoBarras), p]));
  const yaPendientes = new Set(pendientes.map(c => normalizar(c)));
  const cuenta = (lista) => lista.reduce((m, v) => (v ? m.set(v, (m.get(v) || 0) + 1) : m), new Map());
  const codigosArchivo = cuenta(filas.map(f => (f.CodigoProveedor == null ? null : normalizar(f.CodigoProveedor))));
  const barrasArchivo = cuenta(filas.map(f => barras(f.CodigoBarras)));
  const usados = new Set();   // idProducto ya tomados por una fila (dos filas no pueden ir al mismo)

  const res = filas.map((f) => {
    const errores = [], avisos = [];
    const d = {};
    d.CodigoProveedor = texto(f.CodigoProveedor, 100);
    if (!d.CodigoProveedor) errores.push('Falta el código del proveedor');
    else if (codigosArchivo.get(normalizar(d.CodigoProveedor)) > 1) errores.push(`El código ${d.CodigoProveedor} está repetido en el archivo`);
    d.CodigoBarras = barras(f.CodigoBarras);
    if (d.CodigoBarras && barrasArchivo.get(d.CodigoBarras) > 1) errores.push(`El código de barras ${d.CodigoBarras} está repetido en el archivo`);

    d.Nombre = texto(f.Nombre, 200) || '';
    if (!d.Nombre) errores.push('Falta el nombre');
    d.Marca = texto(f.Marca, 100);
    d.Categoria = texto(f.Categoria, 100);

    d.UnidadCompra = UNIDAD[normalizar(f.UnidadCompra)] || null;
    if (!f.UnidadCompra) errores.push('Falta la unidad de compra');
    else if (!d.UnidadCompra) errores.push(`Unidad «${f.UnidadCompra}» no válida: usa ${UNIDADES_COMPRA.join(', ')}`);
    const emp = numero(f.UnidadesEmpaque);
    if (d.UnidadCompra === 'Caja' || d.UnidadCompra === 'Bulto') {
      if (emp == null) errores.push(`Falta cuántas piezas trae la ${d.UnidadCompra.toLowerCase()}`);
      else if (!Number.isInteger(emp) || emp <= 0) errores.push('Piezas por caja o bulto debe ser un número entero mayor que cero');
      else d.UnidadesEmpaque = emp;
    } else d.UnidadesEmpaque = null;

    const precio = numero(f.PrecioLista);
    if (precio == null) errores.push('Falta el precio por unidad');
    else if (Number.isNaN(precio) || precio <= 0) errores.push('Precio por unidad no válido');
    else d.PrecioLista = r4(precio);

    for (const [k, nombre] of [['PrecioSugerido', 'Precio sugerido'], ['PedidoMinimo', 'Pedido mínimo'], ['PesoKg', 'Peso']]) {
      const n = numero(f[k]);
      if (n == null) { d[k] = null; continue; }
      if (Number.isNaN(n) || n < 0) errores.push(`${nombre} no válido`);
      else d[k] = r4(n);
    }
    const dias = numero(f.DiasEntrega);
    if (dias == null) d.DiasEntrega = null;
    else if (!Number.isInteger(dias) || dias < 0) errores.push('Días de entrega debe ser un número entero');
    else d.DiasEntrega = dias;

    if (f.IVA == null || f.IVA === '') d.AlicuotaIVA = 'GENERAL';
    else if (IVA[normalizar(f.IVA)]) d.AlicuotaIVA = IVA[normalizar(f.IVA)];
    else errores.push(`IVA «${f.IVA}» no válido: usa General, Reducida o Exento`);

    const disp = normalizar(f.Disponible);
    if (!disp || SI.includes(disp)) d.Disponible = true;
    else if (NO.includes(disp)) d.Disponible = false;
    else errores.push(`Disponible «${f.Disponible}» no válido: usa Sí o No`);

    // ¿Qué producto de VIDA es?
    let accion = 'ERROR', actual = null, producto = null;
    if (!errores.length) {
      actual = porCodigo.get(normalizar(d.CodigoProveedor)) || (d.CodigoBarras && actualPorBarras.get(d.CodigoBarras)) || null;
      if (actual && usados.has(String(actual.idProducto))) actual = null;
      if (actual) {
        d.idProducto = actual.idProducto;
        const antes = actual.PrecioCosto == null ? null : Number(actual.PrecioCosto);
        d.PrecioAnterior = antes;
        const cambia = antes !== d.PrecioLista || !!actual.Disponible !== d.Disponible ||
          normalizar(actual.CodigoProveedor) !== normalizar(d.CodigoProveedor) ||
          (actual.UnidadCompra ?? null) !== d.UnidadCompra || (actual.UnidadesEmpaque ?? null) !== d.UnidadesEmpaque ||
          num(actual.PrecioSugeridoUSD) !== d.PrecioSugerido || num(actual.PedidoMinimo) !== d.PedidoMinimo ||
          (actual.DiasEntrega ?? null) !== d.DiasEntrega;
        accion = cambia ? 'ACTUALIZAR' : 'SIN_CAMBIOS';
        if (antes != null && antes > 0 && antes !== d.PrecioLista) {
          const pct = Math.round((d.PrecioLista - antes) / antes * 1000) / 10;
          d.CambioPct = pct;
          avisos.push(`Precio ${pct > 0 ? 'sube' : 'baja'} ${Math.abs(pct)}% (de $${antes.toFixed(2)} a $${d.PrecioLista.toFixed(2)})`);
        }
        if (!!actual.Disponible && !d.Disponible) avisos.push('Deja de estar disponible');
        if (!actual.Disponible && d.Disponible) avisos.push('Vuelve a estar disponible');
        producto = actual;
      } else if (d.CodigoBarras && catPorBarras.get(d.CodigoBarras) && !usados.has(String(catPorBarras.get(d.CodigoBarras).idProducto))) {
        producto = catPorBarras.get(d.CodigoBarras);
        d.idProducto = producto.idProducto;
        accion = 'VINCULAR';
        avisos.push(`Es «${producto.Nombre}» del catálogo de VIDA: se liga a este proveedor`);
      } else {
        accion = 'NUEVO';
        avisos.push(yaPendientes.has(normalizar(d.CodigoProveedor))
          ? 'Ya esperaba aprobación: se actualizan sus datos'
          : 'Producto nuevo: queda por aprobar en «Productos por aprobar»');
      }
      if (d.idProducto != null) usados.add(String(d.idProducto));
      // Margen de la tienda contra el precio de venta de VIDA
      const venta = producto ? num(producto.PrecioUSD) : null;
      if (venta != null && venta > 0) {
        d.MargenTiendaPct = Math.round((venta - d.PrecioLista) / venta * 1000) / 10;
        if (d.PrecioLista >= venta) avisos.push(`La tienda perdería: el precio de lista ($${d.PrecioLista.toFixed(2)}) no es menor que el de venta ($${venta.toFixed(2)})`);
      }
    }
    return { fila: f.fila, accion, datos: d, errores, avisos };
  });

  const ligados = new Set(res.filter(r => r.datos.idProducto != null && ['ACTUALIZAR', 'SIN_CAMBIOS'].includes(r.accion)).map(r => String(r.datos.idProducto)));
  const ausentes = actuales.filter(a => !ligados.has(String(a.idProducto)))
    .map(a => ({ idProducto: a.idProducto, Nombre: a.Nombre, CodigoProveedor: a.CodigoProveedor, Disponible: !!a.Disponible }));
  const n = (a) => res.filter(r => r.accion === a).length;
  return {
    filas: res,
    ausentes,
    resumen: {
      total: res.length, actualizar: n('ACTUALIZAR'), sinCambios: n('SIN_CAMBIOS'), vincular: n('VINCULAR'), nuevos: n('NUEVO'),
      errores: n('ERROR'), ausentes: ausentes.length,
      cambiosFuertes: res.filter(r => r.datos.CambioPct != null && Math.abs(r.datos.CambioPct) > ALERTA_CAMBIO_PCT).length,
      conPerdida: res.filter(r => r.datos.MargenTiendaPct != null && r.datos.MargenTiendaPct <= 0).length,
    },
  };
}
function num(v) { return v == null || v === '' ? null : r4(Number(v)); }
