// Tests del motor de evaluación de cupones (lógica pura de dinero).
// Runner nativo de Node: `npm test` → node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluarCupon } from '../src/controllers/cupones.controller.js';

// Cupón con valores por defecto razonables; se sobreescribe lo que cada caso necesita.
const cupon = (o = {}) => ({
  Codigo: 'X', Nombre: 'X', Status: 'ACTIVO',
  Tipo: 'DESCUENTO_PCT', Valor: 10,
  Alcance: 'TODO', idProducto: null, idCategoria: null, Canal: 'TODO',
  MinCompra: null, MaxDescuento: null,
  UsosMax: null, UsosActuales: 0,
  FechaInicio: null, FechaFin: null,
  ...o,
});

test('cupón inexistente (null) → inválido', () => {
  const r = evaluarCupon(null, { subtotal: 100 });
  assert.equal(r.ok, false);
  assert.equal(r.descuento, 0);
});

test('PCT: 10% sobre 100 = 10', () => {
  const r = evaluarCupon(cupon({ Tipo: 'DESCUENTO_PCT', Valor: 10 }), { subtotal: 100 });
  assert.equal(r.ok, true);
  assert.equal(r.descuento, 10);
});

test('USD fijo: $5 sobre 20 = 5', () => {
  const r = evaluarCupon(cupon({ Tipo: 'DESCUENTO_USD', Valor: 5 }), { subtotal: 20 });
  assert.equal(r.ok, true);
  assert.equal(r.descuento, 5);
});

test('MaxDescuento topa el PCT: 50% de 100 con tope 3 = 3', () => {
  const r = evaluarCupon(cupon({ Tipo: 'DESCUENTO_PCT', Valor: 50, MaxDescuento: 3 }), { subtotal: 100 });
  assert.equal(r.ok, true);
  assert.equal(r.descuento, 3);
});

test('descuento nunca supera el subtotal: $100 fijo sobre 20 = 20', () => {
  const r = evaluarCupon(cupon({ Tipo: 'DESCUENTO_USD', Valor: 100 }), { subtotal: 20 });
  assert.equal(r.ok, true);
  assert.equal(r.descuento, 20);
});

test('MinCompra no alcanzada → inválido', () => {
  const r = evaluarCupon(cupon({ MinCompra: 50 }), { subtotal: 20 });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /mínima/i);
});

test('MinCompra justa (subtotal == MinCompra) → válido', () => {
  const r = evaluarCupon(cupon({ MinCompra: 20, Tipo: 'DESCUENTO_USD', Valor: 2 }), { subtotal: 20 });
  assert.equal(r.ok, true);
  assert.equal(r.descuento, 2);
});

test('cupón inactivo → inválido', () => {
  const r = evaluarCupon(cupon({ Status: 'INACTIVO' }), { subtotal: 100 });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /inactivo/i);
});

test('cupón vencido (FechaFin en el pasado) → inválido', () => {
  const r = evaluarCupon(cupon({ FechaFin: '2000-01-01' }), { subtotal: 100 });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /vencido/i);
});

test('cupón aún no vigente (FechaInicio futura) → inválido', () => {
  const r = evaluarCupon(cupon({ FechaInicio: '2999-12-31' }), { subtotal: 100 });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /vigente/i);
});

test('cupón vigente dentro del rango de fechas → válido', () => {
  const r = evaluarCupon(cupon({ FechaInicio: '2000-01-01', FechaFin: '2999-12-31' }), { subtotal: 100 });
  assert.equal(r.ok, true);
});

test('canal no coincide (cupón POS, compra DELIVERY) → inválido', () => {
  const r = evaluarCupon(cupon({ Canal: 'POS' }), { subtotal: 100, canal: 'DELIVERY' });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /POS/);
});

test('canal TODO aplica a cualquier canal', () => {
  const r = evaluarCupon(cupon({ Canal: 'TODO' }), { subtotal: 100, canal: 'DELIVERY' });
  assert.equal(r.ok, true);
});

test('usos globales agotados (UsosActuales >= UsosMax) → inválido', () => {
  const r = evaluarCupon(cupon({ UsosMax: 5, UsosActuales: 5 }), { subtotal: 100 });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /agot/i);
});

test('alcance PRODUCTO: solo cuenta el subtotal del producto elegible', () => {
  const c = cupon({ Tipo: 'DESCUENTO_PCT', Valor: 10, Alcance: 'PRODUCTO', idProducto: 1 });
  const items = [{ idProducto: 1, subtotal: 50 }, { idProducto: 2, subtotal: 50 }];
  const r = evaluarCupon(c, { subtotal: 100, items });
  assert.equal(r.ok, true);
  assert.equal(r.descuento, 5); // 10% de 50 (solo el producto 1)
});

test('alcance PRODUCTO sin items elegibles → inválido', () => {
  const c = cupon({ Alcance: 'PRODUCTO', idProducto: 99 });
  const items = [{ idProducto: 1, subtotal: 50 }];
  const r = evaluarCupon(c, { subtotal: 50, items });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /no aplica/i);
});

test('redondeo a 2 decimales: 33% de 10 = 3.30', () => {
  const r = evaluarCupon(cupon({ Tipo: 'DESCUENTO_PCT', Valor: 33 }), { subtotal: 10 });
  assert.equal(r.ok, true);
  assert.equal(r.descuento, 3.30);
});

test('descuento que da 0 → inválido (no genera descuento)', () => {
  const r = evaluarCupon(cupon({ Tipo: 'DESCUENTO_PCT', Valor: 0 }), { subtotal: 100 });
  assert.equal(r.ok, false);
});
