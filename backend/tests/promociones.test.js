// Tests de la lógica pura de promociones: mejor precio por unidad y combos NxM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mejorPromoUnitaria, calcularLinea } from '../src/controllers/promociones.controller.js';

const prod  = (o = {}) => ({ idProducto: 1, idCategoria: 1, PrecioUSD: 10, ...o });
const promo = (o = {}) => ({ Tipo: 'DESCUENTO_PCT', Valor: 10, Alcance: 'TODO', idProducto: null, idCategoria: null, Valor2: null, ...o });

// ── mejorPromoUnitaria ──────────────────────────────────────────────────────
test('sin promociones → null', () => {
  assert.equal(mejorPromoUnitaria([], prod()), null);
});

test('PCT 20% sobre 10 → precio unitario 8', () => {
  const r = mejorPromoUnitaria([promo({ Tipo: 'DESCUENTO_PCT', Valor: 20 })], prod({ PrecioUSD: 10 }));
  assert.equal(r.precioUnitario, 8);
});

test('elige la promo que deja el precio más bajo', () => {
  const promos = [promo({ Tipo: 'DESCUENTO_PCT', Valor: 10 }), promo({ Tipo: 'DESCUENTO_USD', Valor: 3 })];
  const r = mejorPromoUnitaria(promos, prod({ PrecioUSD: 10 })); // 9 vs 7
  assert.equal(r.precioUnitario, 7);
  assert.equal(r.promo.Tipo, 'DESCUENTO_USD');
});

test('PRECIO_ESPECIAL fija el precio', () => {
  const r = mejorPromoUnitaria([promo({ Tipo: 'PRECIO_ESPECIAL', Valor: 5 })], prod({ PrecioUSD: 10 }));
  assert.equal(r.precioUnitario, 5);
});

test('nunca baja de 0 (descuento mayor que el precio)', () => {
  const r = mejorPromoUnitaria([promo({ Tipo: 'DESCUENTO_USD', Valor: 15 })], prod({ PrecioUSD: 10 }));
  assert.equal(r.precioUnitario, 0);
});

test('promo de otro producto (alcance PRODUCTO) no aplica → null', () => {
  const p = promo({ Alcance: 'PRODUCTO', idProducto: 99, Tipo: 'DESCUENTO_PCT', Valor: 50 });
  assert.equal(mejorPromoUnitaria([p], prod({ idProducto: 1 })), null);
});

test('promo por categoría aplica al producto de esa categoría', () => {
  const p = promo({ Alcance: 'CATEGORIA', idCategoria: 7, Tipo: 'DESCUENTO_PCT', Valor: 50 });
  const r = mejorPromoUnitaria([p], prod({ idCategoria: 7, PrecioUSD: 10 }));
  assert.equal(r.precioUnitario, 5);
});

test('promo que no mejora el precio (0%) → null', () => {
  assert.equal(mejorPromoUnitaria([promo({ Tipo: 'DESCUENTO_PCT', Valor: 0 })], prod()), null);
});

test('NXM es ignorado por mejorPromoUnitaria', () => {
  assert.equal(mejorPromoUnitaria([promo({ Tipo: 'NXM', Valor: 3, Valor2: 2 })], prod()), null);
});

// ── calcularLinea (combos NxM vs por unidad) ────────────────────────────────
test('sin promos: subtotal = precio × cantidad', () => {
  const r = calcularLinea([], prod({ PrecioUSD: 10 }), 3);
  assert.equal(r.subtotal, 30);
  assert.equal(r.promoAplicada, null);
});

test('descuento por unidad se aplica a toda la cantidad', () => {
  const r = calcularLinea([promo({ Tipo: 'DESCUENTO_PCT', Valor: 10 })], prod({ PrecioUSD: 10 }), 3);
  assert.equal(r.subtotal, 27); // 9 × 3
});

test('NXM 3x2 (lleva 3 paga 2) con cantidad 3 → paga 2 = 20', () => {
  const r = calcularLinea([promo({ Tipo: 'NXM', Valor: 3, Valor2: 2 })], prod({ PrecioUSD: 10 }), 3);
  assert.equal(r.subtotal, 20);
  assert.equal(r.promoAplicada?.Tipo, 'NXM');
});

test('NXM 3x2 con cantidad 5 → 1 grupo (paga 2) + resto 2 = 4×10 = 40', () => {
  const r = calcularLinea([promo({ Tipo: 'NXM', Valor: 3, Valor2: 2 })], prod({ PrecioUSD: 10 }), 5);
  assert.equal(r.subtotal, 40);
});

test('elige el más barato entre combo y por-unidad', () => {
  // NXM 2x1 (cant 2 → paga 1 = 10) vs PCT 10% (9×2 = 18) → gana el combo
  const promos = [promo({ Tipo: 'NXM', Valor: 2, Valor2: 1 }), promo({ Tipo: 'DESCUENTO_PCT', Valor: 10 })];
  const r = calcularLinea(promos, prod({ PrecioUSD: 10 }), 2);
  assert.equal(r.subtotal, 10);
  assert.equal(r.promoAplicada?.Tipo, 'NXM');
});

test('combo inválido (M >= N) se ignora, gana por-unidad', () => {
  const promos = [promo({ Tipo: 'NXM', Valor: 2, Valor2: 3 }), promo({ Tipo: 'DESCUENTO_PCT', Valor: 10 })];
  const r = calcularLinea(promos, prod({ PrecioUSD: 10 }), 2);
  assert.equal(r.subtotal, 18); // 9 × 2, el combo inválido no cuenta
});
