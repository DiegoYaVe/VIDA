import test from 'node:test';
import assert from 'node:assert/strict';
import { filasDesdeHoja, planCarga, normalizar } from '../src/domain/layoutInventario.mjs';

const categorias = [{ idCategoria: 5, Nombre: 'Víveres' }, { idCategoria: 6, Nombre: 'Frutas y Verduras' }];
const existentes = [
  { idProducto: 10, SKU: 'CAMBUR01', CodigoBarras: '7590001', Nombre: 'Cambur', Editable: true },
  { idProducto: 11, SKU: 'AGUA5L', CodigoBarras: '7590002', Nombre: 'Agua VIDA 5L', Editable: false },
];
const base = { Nombre: 'Harina', Categoria: 'viveres', Unidad: 'pieza', PrecioUSD: '1,60' };

test('lee los encabezados del layout aunque cambien acentos, asteriscos o mayúsculas', () => {
  const f = filasDesdeHoja([
    { 'Nombre *': 'Harina', 'CATEGORÍA *': 'Víveres', 'Unidad *': 'Pieza', 'Precio venta USD *': 1.6, 'Columna rara': 'x' },
    { 'Nombre *': '', 'Categoría *': '  ' },   // fila vacía: se salta
  ]);
  assert.equal(f.length, 1);
  assert.deepEqual(f[0], { fila: 2, Nombre: 'Harina', Categoria: 'Víveres', Unidad: 'Pieza', PrecioUSD: 1.6 });
  assert.equal(normalizar(' Categoría * '), 'categoria');
});

test('producto nuevo: normaliza unidad, precio con coma, IVA y PLUS por defecto', () => {
  const r = planCarga([{ fila: 2, ...base, Existencia: 24 }], { categorias, existentes });
  const f = r.filas[0];
  assert.equal(f.accion, 'CREAR');
  assert.equal(f.datos.UnidadMedida, 'Pieza');
  assert.equal(f.datos.idCategoria, 5);
  assert.equal(f.datos.PrecioUSD, 1.6);
  assert.equal(f.datos.AlicuotaIVA, 'GENERAL');
  assert.equal(f.datos.EsProductoPlus, false);
  assert.equal(f.datos.Existencia, 24);
});

test('SKU existente y editable: actualiza; del catálogo de VIDA: solo existencia', () => {
  const r = planCarga([
    { fila: 2, ...base, SKU: 'cambur01', Nombre: 'Cambur por kilo', Categoria: 'Frutas y verduras', Unidad: 'Kg' },
    { fila: 3, ...base, SKU: 'AGUA5L', Existencia: 30 },
    { fila: 4, ...base, SKU: 'AGUA5L', Nombre: 'otra' },
  ], { categorias, existentes });
  assert.equal(r.filas[0].accion, 'ACTUALIZAR');
  assert.equal(r.filas[0].datos.idProducto, 10);
  assert.match(r.filas[0].avisos[0], /Cambia el nombre/);
  assert.equal(r.filas[1].accion, 'ERROR');    // AGUA5L repetido en el archivo
  assert.match(r.filas[1].errores[0], /repetido/);
});

test('del catálogo de VIDA sin repetir: solo existencia o sin cambios', () => {
  const a = planCarga([{ fila: 2, ...base, SKU: 'AGUA5L', Existencia: 30 }], { categorias, existentes });
  assert.equal(a.filas[0].accion, 'SOLO_EXISTENCIA');
  const b = planCarga([{ fila: 2, ...base, SKU: 'AGUA5L' }], { categorias, existentes });
  assert.equal(b.filas[0].accion, 'SIN_CAMBIOS');
});

test('sin SKU busca por código de barras', () => {
  const r = planCarga([{ fila: 2, ...base, CodigoBarras: '7590001' }], { categorias, existentes });
  assert.equal(r.filas[0].accion, 'ACTUALIZAR');
  assert.equal(r.filas[0].datos.idProducto, 10);
});

test('errores claros por fila', () => {
  const r = planCarga([
    { fila: 2, Categoria: 'Víveres', Unidad: 'Pieza', PrecioUSD: 1 },
    { fila: 3, ...base, Categoria: 'Juguetes' },
    { fila: 4, ...base, Unidad: 'Galón' },
    { fila: 5, ...base, Unidad: 'Caja' },
    { fila: 6, ...base, PrecioUSD: 'abc' },
    { fila: 7, ...base, IVA: '16%' },
    { fila: 8, ...base, Plus: 'quizás' },
    { fila: 9, ...base, Existencia: -3 },
  ], { categorias, existentes });
  const err = r.filas.map(f => f.errores.join(' | '));
  assert.match(err[0], /Falta el nombre/);
  assert.match(err[1], /Juguetes.*no existe/);
  assert.match(err[2], /Galón.*no válida/);
  assert.match(err[3], /unidades trae la caja/);
  assert.match(err[4], /Precio de venta no válido/);
  assert.match(err[5], /IVA/);
  assert.match(err[6], /PLUS/);
  assert.match(err[7], /Existencia no válido/);
  assert.equal(r.resumen.errores, 8);
});

test('VIDA puede crear categorías nuevas; la tienda no', () => {
  const r = planCarga([{ fila: 2, ...base, Categoria: 'Juguetes' }], { categorias, existentes, puedeCrearCategorias: true });
  assert.equal(r.filas[0].accion, 'CREAR');
  assert.equal(r.filas[0].datos.CategoriaNueva, 'Juguetes');
  assert.deepEqual(r.resumen.categoriasNuevas, ['Juguetes']);
});

test('caja con unidades, PLUS sí y IVA exento', () => {
  const r = planCarga([{ fila: 2, ...base, Unidad: 'Caja', UnidadesPorCaja: 6, Plus: 'Sí', IVA: 'exento' }], { categorias, existentes });
  assert.equal(r.filas[0].accion, 'CREAR');
  assert.equal(r.filas[0].datos.UnidadesPorCaja, 6);
  assert.equal(r.filas[0].datos.EsProductoPlus, true);
  assert.equal(r.filas[0].datos.AlicuotaIVA, 'EXENTO');
});
