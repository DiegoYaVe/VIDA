import test from 'node:test';
import assert from 'node:assert/strict';
import { esPlusEnTienda, validarDestacados, sqlEsPlus } from '../src/services/destacadosTienda.service.js';

test('con lista propia, solo esos son PLUS en la tienda', () => {
  const lista = new Set(['7']);
  assert.equal(esPlusEnTienda({ idProducto: 7, EsProductoPlus: false }, lista), true);
  assert.equal(esPlusEnTienda({ idProducto: 8, EsProductoPlus: true }, lista), false);
});

test('sin lista propia vale la marca PLUS del producto', () => {
  assert.equal(esPlusEnTienda({ idProducto: 8, EsProductoPlus: true }, new Set()), true);
  assert.equal(esPlusEnTienda({ idProducto: 8, EsProductoPlus: false }, null), false);
});

test('validación de lo que guarda VIDA', () => {
  assert.deepEqual(validarDestacados({ plus: ['3', 4], estrella: [9] }), { plus: [3, 4], estrella: [9] });
  assert.deepEqual(validarDestacados({}), { plus: [], estrella: [] });
  assert.throws(() => validarDestacados({ plus: [1, 1] }), /repetidos/);
  assert.throws(() => validarDestacados({ estrella: [1, 2, 3, 4] }), /máximo 3/);
  assert.throws(() => validarDestacados({ plus: [0] }), /inválido/);
});

test('la expresión SQL conserva el nombre de columna y usa la tienda indicada', () => {
  const s = sqlEsPlus('p', 'inv.idPuntoVenta');
  assert.match(s, /d\.idPuntoVenta=inv\.idPuntoVenta/);
  assert.match(s, /ISNULL\(p\.EsProductoPlus, 0\)/);
});
