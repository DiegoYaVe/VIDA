import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alcanceProductos, filtroProductosVisibles, productoVisible, puedeEditarProducto, duenoAlCrear,
} from '../src/services/productosTienda.service.js';

const tienda = { TipoUsuario: 'ADMIN', idPuntoVenta: 7 };
const cajero = { TipoUsuario: 'CAJERO', idPuntoVenta: 7 };
const red = { TipoUsuario: 'SUPER_ADMIN', idPuntoVenta: null };
const tipos = { BigInt: 'bigint' };
const reqFalso = () => { const inputs = {}; return { inputs, input(k, _t, v) { inputs[k] = v; return this; } }; };

test('la tienda ve el catálogo y lo suyo, aunque pida otra tienda', () => {
  assert.deepEqual(alcanceProductos(tienda, 9), { pv: '7' });
  assert.deepEqual(alcanceProductos(cajero), { pv: '7' });
  assert.deepEqual(alcanceProductos({ TipoUsuario: 'ADMIN', idPuntoVenta: null }), { pv: null });
});

test('la red ve todo, o el catálogo más lo de la tienda que consulta', () => {
  assert.deepEqual(alcanceProductos(red), { todos: true });
  assert.deepEqual(alcanceProductos(red, 3), { pv: '3' });
});

test('filtro SQL según el alcance', () => {
  assert.equal(filtroProductosVisibles({ todos: true }, 'p', reqFalso(), tipos), '');
  assert.equal(filtroProductosVisibles({ pv: null }, 'p', reqFalso(), tipos), ' AND p.idPuntoVentaDueno IS NULL');
  const r = reqFalso();
  assert.equal(filtroProductosVisibles({ pv: '7' }, 'p', r, tipos),
    ' AND (p.idPuntoVentaDueno IS NULL OR p.idPuntoVentaDueno = @pvDueno)');
  assert.equal(r.inputs.pvDueno, '7');
});

test('visibilidad de un producto', () => {
  assert.equal(productoVisible({ pv: '7' }, null), true);
  assert.equal(productoVisible({ pv: '7' }, 7), true);
  assert.equal(productoVisible({ pv: '7' }, 8), false);
  assert.equal(productoVisible({ pv: null }, 8), false);
  assert.equal(productoVisible({ todos: true }, 8), true);
});

test('la tienda solo cambia sus productos; VIDA y la red, todos', () => {
  assert.equal(puedeEditarProducto(tienda, false, 7), true);
  assert.equal(puedeEditarProducto(tienda, false, 8), false);
  assert.equal(puedeEditarProducto(tienda, false, null), false);
  assert.equal(puedeEditarProducto(tienda, true, null), true);   // ADMIN de la Matriz
  assert.equal(puedeEditarProducto(red, false, 8), true);
});

test('dueño al crear', () => {
  assert.equal(duenoAlCrear(tienda, false), 7);
  assert.equal(duenoAlCrear(tienda, true), null);
  assert.equal(duenoAlCrear(red, false), null);
});
