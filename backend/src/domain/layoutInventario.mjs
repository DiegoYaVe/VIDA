// Carga de productos por layout (Excel) a una tienda (tarea 19).
// El panel arma el layout y lee el archivo; el backend vuelve a validar cada
// fila con estas mismas reglas antes de guardar. Sin BD: se prueba sola.

// Columnas del layout, en orden. `clave` = campo interno; `titulo` = encabezado
// que ve la persona (el * marca las obligatorias).
export const COLUMNAS_LAYOUT = [
  { clave: 'SKU', titulo: 'SKU', ancho: 16, ayuda: 'Tu código interno. Si ya existe, el producto se actualiza.' },
  { clave: 'CodigoBarras', titulo: 'Código de barras', ancho: 18, ayuda: 'Se usa para buscar el producto si no tiene SKU.' },
  { clave: 'Nombre', titulo: 'Nombre *', ancho: 32 },
  { clave: 'Categoria', titulo: 'Categoría *', ancho: 20, ayuda: 'Elige una de la lista.' },
  { clave: 'Unidad', titulo: 'Unidad *', ancho: 11, ayuda: 'Pieza, Kg, Litro o Caja.' },
  { clave: 'UnidadesPorCaja', titulo: 'Unidades por caja', ancho: 12, ayuda: 'Solo si la unidad es Caja.' },
  { clave: 'PrecioUSD', titulo: 'Precio venta USD *', ancho: 14 },
  { clave: 'CostoUSD', titulo: 'Costo USD', ancho: 12 },
  { clave: 'StockMinimo', titulo: 'Stock mínimo', ancho: 12 },
  { clave: 'Existencia', titulo: 'Existencia en tienda', ancho: 14, ayuda: 'Cuántos hay hoy. Vacío = no se toca el stock.' },
  { clave: 'IVA', titulo: 'IVA', ancho: 11, ayuda: 'General, Reducida o Exento. Vacío = General.' },
  { clave: 'Plus', titulo: 'Producto PLUS', ancho: 10, ayuda: 'Sí o No.' },
  { clave: 'PesoKg', titulo: 'Peso kg', ancho: 10 },
  { clave: 'Descripcion', titulo: 'Descripción', ancho: 30 },
];
export const UNIDADES = ['Pieza', 'Kg', 'Litro', 'Caja'];
export const MAX_FILAS_LAYOUT = 500;

// "Categoría *" → "categoria": sin acentos, asteriscos, espacios ni mayúsculas
export const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[*]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

const POR_TITULO = new Map(COLUMNAS_LAYOUT.flatMap(c => [[normalizar(c.titulo), c.clave], [normalizar(c.clave), c.clave]]));

// Filas leídas del Excel (objetos con los encabezados como llaves) → filas con
// claves internas. Las filas sin nada escrito se saltan; `fila` = número de la
// fila en el Excel (la 1 es el encabezado).
export function filasDesdeHoja(objetos) {
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
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
const UNIDAD = { pieza: 'Pieza', pza: 'Pieza', unidad: 'Pieza', und: 'Pieza', kg: 'Kg', kilo: 'Kg', kilos: 'Kg', kilogramo: 'Kg', 'kilogramo (kg)': 'Kg',
  litro: 'Litro', litros: 'Litro', lt: 'Litro', l: 'Litro', caja: 'Caja', cajas: 'Caja' };
const IVA = { general: 'GENERAL', reducida: 'REDUCIDA', reducido: 'REDUCIDA', exento: 'EXENTO', exenta: 'EXENTO' };
const SI = ['si', 's', 'x', '1', 'true', 'yes'];
const NO = ['no', 'n', '0', 'false'];

// Valida y decide qué hacer con cada fila.
//   categorias: [{ idCategoria, Nombre }]
//   existentes: productos que ve esta tienda (catálogo de VIDA + los suyos):
//               [{ idProducto, SKU, CodigoBarras, Nombre, Editable }]
//   puedeCrearCategorias: VIDA puede crear categorías nuevas; una tienda no
// Devuelve { filas:[{ fila, accion, datos, errores[], avisos[] }], resumen }.
// accion: CREAR | ACTUALIZAR | SOLO_EXISTENCIA | SIN_CAMBIOS | ERROR
export function planCarga(filas, { categorias = [], existentes = [], puedeCrearCategorias = false } = {}) {
  const cat = new Map(categorias.map(c => [normalizar(c.Nombre), c]));
  const porSku = new Map(existentes.filter(p => p.SKU).map(p => [normalizar(p.SKU), p]));
  const porBarras = new Map(existentes.filter(p => p.CodigoBarras).map(p => [String(p.CodigoBarras).trim(), p]));
  const skusArchivo = new Map(), barrasArchivo = new Map();
  for (const f of filas) {
    if (f.SKU) skusArchivo.set(normalizar(f.SKU), (skusArchivo.get(normalizar(f.SKU)) || 0) + 1);
    if (f.CodigoBarras) barrasArchivo.set(String(f.CodigoBarras).trim(), (barrasArchivo.get(String(f.CodigoBarras).trim()) || 0) + 1);
  }
  const categoriasNuevas = new Set();

  const res = filas.map((f) => {
    const errores = [], avisos = [];
    const d = {};
    d.SKU = f.SKU == null ? null : String(f.SKU).trim().slice(0, 100) || null;
    d.CodigoBarras = f.CodigoBarras == null ? null : String(f.CodigoBarras).trim().slice(0, 100) || null;
    if (d.SKU && skusArchivo.get(normalizar(d.SKU)) > 1) errores.push(`El SKU ${d.SKU} está repetido en el archivo`);
    if (d.CodigoBarras && barrasArchivo.get(d.CodigoBarras) > 1) errores.push(`El código de barras ${d.CodigoBarras} está repetido en el archivo`);

    const existente = (d.SKU && porSku.get(normalizar(d.SKU))) || (!d.SKU && d.CodigoBarras && porBarras.get(d.CodigoBarras)) || null;

    d.Nombre = f.Nombre == null ? '' : String(f.Nombre).trim().slice(0, 200);
    if (!d.Nombre) errores.push('Falta el nombre');

    const nomCat = f.Categoria == null ? '' : String(f.Categoria).trim();
    if (!nomCat) errores.push('Falta la categoría');
    else if (cat.has(normalizar(nomCat))) d.idCategoria = cat.get(normalizar(nomCat)).idCategoria;
    else if (puedeCrearCategorias) { d.CategoriaNueva = nomCat.slice(0, 100); categoriasNuevas.add(d.CategoriaNueva); avisos.push(`Se crea la categoría «${d.CategoriaNueva}»`); }
    else errores.push(`La categoría «${nomCat}» no existe: elige una de la hoja Categorías`);

    d.UnidadMedida = UNIDAD[normalizar(f.Unidad)] || null;
    if (!f.Unidad) errores.push('Falta la unidad');
    else if (!d.UnidadMedida) errores.push(`Unidad «${f.Unidad}» no válida: usa Pieza, Kg, Litro o Caja`);
    const upc = numero(f.UnidadesPorCaja);
    if (d.UnidadMedida === 'Caja') {
      if (upc == null) errores.push('Falta cuántas unidades trae la caja');
      else if (!Number.isInteger(upc) || upc <= 0) errores.push('Unidades por caja debe ser un número entero mayor que cero');
      else d.UnidadesPorCaja = upc;
    }

    const precio = numero(f.PrecioUSD);
    if (precio == null) errores.push('Falta el precio de venta');
    else if (Number.isNaN(precio) || precio < 0) errores.push('Precio de venta no válido');
    else d.PrecioUSD = Math.round(precio * 10000) / 10000;

    for (const [k, nombre] of [['CostoUSD', 'Costo'], ['StockMinimo', 'Stock mínimo'], ['Existencia', 'Existencia'], ['PesoKg', 'Peso']]) {
      const n = numero(f[k]);
      if (n == null) { d[k] = null; continue; }
      if (Number.isNaN(n) || n < 0) errores.push(`${nombre} no válido`);
      else d[k] = Math.round(n * 10000) / 10000;
    }

    if (f.IVA == null || f.IVA === '') d.AlicuotaIVA = 'GENERAL';
    else if (IVA[normalizar(f.IVA)]) d.AlicuotaIVA = IVA[normalizar(f.IVA)];
    else errores.push(`IVA «${f.IVA}» no válido: usa General, Reducida o Exento`);

    const plus = normalizar(f.Plus);
    if (!plus) d.EsProductoPlus = false;
    else if (SI.includes(plus)) d.EsProductoPlus = true;
    else if (NO.includes(plus)) d.EsProductoPlus = false;
    else errores.push(`Producto PLUS «${f.Plus}» no válido: usa Sí o No`);

    d.Descripcion = f.Descripcion == null ? null : String(f.Descripcion).trim().slice(0, 500) || null;

    let accion;
    if (errores.length) accion = 'ERROR';
    else if (!existente) accion = 'CREAR';
    else if (existente.Editable) { accion = 'ACTUALIZAR'; d.idProducto = existente.idProducto; }
    else {
      // Producto del catálogo de VIDA: la tienda solo carga su existencia
      d.idProducto = existente.idProducto;
      if (d.Existencia != null) { accion = 'SOLO_EXISTENCIA'; avisos.push('Es del catálogo de VIDA: solo se carga la existencia, los demás datos no cambian'); }
      else { accion = 'SIN_CAMBIOS'; avisos.push('Es del catálogo de VIDA y no trae existencia: no cambia nada'); }
    }
    if (existente && !errores.length && normalizar(existente.Nombre) !== normalizar(d.Nombre) && accion === 'ACTUALIZAR')
      avisos.push(`Cambia el nombre «${existente.Nombre}» → «${d.Nombre}»`);
    return { fila: f.fila, accion, datos: d, errores, avisos };
  });

  const cuenta = (a) => res.filter(r => r.accion === a).length;
  return {
    filas: res,
    resumen: {
      total: res.length, crear: cuenta('CREAR'), actualizar: cuenta('ACTUALIZAR'),
      soloExistencia: cuenta('SOLO_EXISTENCIA'), sinCambios: cuenta('SIN_CAMBIOS'), errores: cuenta('ERROR'),
      categoriasNuevas: [...categoriasNuevas],
    },
  };
}
