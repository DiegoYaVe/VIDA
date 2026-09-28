import test from 'node:test';
import assert from 'node:assert/strict';
import { precioSuministro } from '../src/services/precioSuministro.service.js';
test('costo proveedor 1.20 y precio tienda 1.50 independientes', () => assert.equal(precioSuministro(1.2, 1.5, 90), 1.5));
test('sin precio explícito usa margen al ordenar', () => assert.equal(precioSuministro(1.2, null, 25), 1.5));
test('precio pactado permanece aunque cambie el margen', () => {
 const pactado = precioSuministro(1.2, null, 25);
 assert.equal(precioSuministro(1.2, pactado, 80), 1.5);
});
test('admite suministro sin margen y precio cero explícito', () => {
 assert.equal(precioSuministro(1.2, null), 1.2);
 assert.equal(precioSuministro(1.2, 0), 0);
});
test('rechaza valores negativos/no finitos', () => {
 for (const p of [-1, Infinity, NaN]) assert.throws(() => precioSuministro(1.2, p));
});
