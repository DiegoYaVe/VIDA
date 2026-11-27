import test from 'node:test';
import assert from 'node:assert/strict';
import { planLista, filasListaDesdeHoja } from '../src/domain/listaProveedor.mjs';

const fila = (o) => ({ fila: 2, UnidadCompra: 'Pieza', ...o });
const actuales = [
  { idProducto: 10, CodigoProveedor: 'CAF-250', PrecioCosto: 3.0, Disponible: true, Nombre: 'Café molido 250 g', CodigoBarras: '7591111', PrecioUSD: 3.8, UnidadCompra: 'Pieza' },
  { idProducto: 11, CodigoProveedor: 'AGU-5L', PrecioCosto: 2.0, Disponible: true, Nombre: 'Agua 5 L', CodigoBarras: null, PrecioUSD: 2.5, UnidadCompra: 'Pieza' },
];
const catalogo = [{ idProducto: 20, Nombre: 'Harina de maíz 1 kg', CodigoBarras: '7592222', PrecioUSD: 1.6 }];

test('lee los encabezados del Excel aunque cambien acentos y asteriscos', () => {
  const f = filasListaDesdeHoja([{ 'Código del proveedor *': ' X1 ', 'PRECIO POR UNIDAD USD': 2, Nada: 'x' }, { 'Nombre del producto *': '' }]);
  assert.deepEqual(f, [{ fila: 2, CodigoProveedor: 'X1', PrecioLista: 2 }]);
});

test('actualiza por código del proveedor y avisa cuánto cambia el precio', () => {
  const p = planLista([fila({ CodigoProveedor: 'caf-250', Nombre: 'Café', PrecioLista: 3.6 })], { actuales, catalogo });
  const r = p.filas[0];
  assert.equal(r.accion, 'ACTUALIZAR');
  assert.equal(r.datos.idProducto, 10);
  assert.equal(r.datos.CambioPct, 20);
  assert.match(r.avisos[0], /sube 20%/);
  assert.equal(p.resumen.cambiosFuertes, 1);
  // El agua no vino en la lista
  assert.deepEqual(p.ausentes.map(a => a.idProducto), [11]);
});

test('sin cambios cuando todo es igual', () => {
  const p = planLista([fila({ CodigoProveedor: 'AGU-5L', Nombre: 'Agua', PrecioLista: 2 })], { actuales, catalogo });
  assert.equal(p.filas[0].accion, 'SIN_CAMBIOS');
});

test('por código de barras se liga un producto que VIDA ya tiene; si no, queda por aprobar', () => {
  const p = planLista([
    fila({ fila: 2, CodigoProveedor: 'HAR1', Nombre: 'Harina', CodigoBarras: '759 2222', PrecioLista: 1.2 }),
    fila({ fila: 3, CodigoProveedor: 'NUEVO1', Nombre: 'Galletas', PrecioLista: 0.9 }),
  ], { actuales, catalogo, pendientes: ['nuevo1'] });
  assert.equal(p.filas[0].accion, 'VINCULAR');
  assert.equal(p.filas[0].datos.idProducto, 20);
  assert.equal(p.filas[0].datos.MargenTiendaPct, 25);
  assert.equal(p.filas[1].accion, 'NUEVO');
  assert.match(p.filas[1].avisos[0], /Ya esperaba aprobación/);
});

test('avisa si la tienda perdería con ese precio de lista', () => {
  const p = planLista([fila({ CodigoProveedor: 'AGU-5L', Nombre: 'Agua', PrecioLista: 2.6 })], { actuales });
  assert.ok(p.filas[0].avisos.some(a => /perdería/.test(a)));
  assert.equal(p.resumen.conPerdida, 1);
});

test('errores: obligatorios, repetidos, caja sin piezas, valores no válidos', () => {
  const p = planLista([
    fila({ fila: 2, CodigoProveedor: 'A', Nombre: 'Uno', PrecioLista: 1, UnidadCompra: 'Caja' }),
    fila({ fila: 3, CodigoProveedor: 'A', Nombre: 'Dos', PrecioLista: 'x' }),
    fila({ fila: 4, Nombre: '', PrecioLista: 0, UnidadCompra: 'Galón', IVA: 'mucho', Disponible: 'quizá', DiasEntrega: 1.5 }),
  ]);
  assert.ok(p.filas.every(f => f.accion === 'ERROR'));
  assert.ok(p.filas[0].errores.some(e => /piezas trae la caja/.test(e)));
  assert.ok(p.filas[1].errores.some(e => /repetido/.test(e)));
  assert.ok(p.filas[1].errores.some(e => /Precio por unidad no válido/.test(e)));
  const e = p.filas[2].errores.join(' | ');
  for (const t of ['Falta el código', 'Falta el nombre', 'Galón', 'IVA', 'Disponible', 'Días de entrega']) assert.match(e, new RegExp(t));
  assert.equal(p.resumen.errores, 3);
});

test('dos filas no pueden ir al mismo producto de VIDA', () => {
  const p = planLista([
    fila({ fila: 2, CodigoProveedor: 'H1', Nombre: 'Harina', CodigoBarras: '7592222', PrecioLista: 1.2 }),
    fila({ fila: 3, CodigoProveedor: 'H2', Nombre: 'Harina 2', CodigoBarras: '7592223', PrecioLista: 1.1 }),
  ], { catalogo });
  assert.deepEqual(p.filas.map(f => f.accion), ['VINCULAR', 'NUEVO']);
});

test('caja con piezas, disponible No y sugerido se leen bien', () => {
  const p = planLista([fila({ CodigoProveedor: 'B', Nombre: 'Bulto arroz', PrecioLista: '1,25', UnidadCompra: 'bultos', UnidadesEmpaque: 24, Disponible: 'No', PrecioSugerido: '$1.80', IVA: 'exento' })]);
  const d = p.filas[0].datos;
  assert.equal(p.filas[0].accion, 'NUEVO');
  assert.deepEqual([d.UnidadCompra, d.UnidadesEmpaque, d.PrecioLista, d.Disponible, d.PrecioSugerido, d.AlicuotaIVA], ['Bulto', 24, 1.25, false, 1.8, 'EXENTO']);
});
