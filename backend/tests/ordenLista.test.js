// Tests del orden de los listados paginados: la columna del cliente nunca llega
// al SQL si no está en la lista permitida.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordenSql, limiteSeguro } from '../src/services/ordenLista.js';

const COLS = { Nombre: 'p.Nombre', Precio: 'p.PrecioUSD' };

test('columna permitida con su dirección y desempate', () => {
  assert.equal(ordenSql({ orden: 'Precio', dir: 'asc' }, COLS, 'p.Nombre', 'p.id'), 'p.PrecioUSD ASC, p.id');
  assert.equal(ordenSql({ orden: 'Nombre', dir: 'DESC' }, COLS, 'p.Nombre'), 'p.Nombre DESC');
});

test('ordenar por la columna del desempate no la repite', () => {
  assert.equal(ordenSql({ orden: 'Id', dir: 'asc' }, { Id: 'p.id' }, 'p.Nombre', 'p.id DESC'), 'p.id ASC');
});

test('dirección desconocida se trata como descendente', () => {
  assert.equal(ordenSql({ orden: 'Nombre', dir: 'x; DROP TABLE' }, COLS, 'p.Nombre'), 'p.Nombre DESC');
});

test('columna fuera de la lista usa el orden por defecto (sin inyección)', () => {
  assert.equal(ordenSql({ orden: 'p.Nombre; DROP TABLE x--' }, COLS, 'p.Nombre', 'p.id'), 'p.Nombre');
  assert.equal(ordenSql({ orden: 'constructor' }, COLS, 'p.Nombre'), 'p.Nombre');
  assert.equal(ordenSql({ orden: '__proto__' }, COLS, 'p.Nombre'), 'p.Nombre');
  assert.equal(ordenSql({}, COLS, 'p.FechaAlta DESC'), 'p.FechaAlta DESC');
  assert.equal(ordenSql(undefined, COLS, 'p.Nombre'), 'p.Nombre');
});

test('límite de página acotado', () => {
  assert.equal(limiteSeguro('25'), 25);
  assert.equal(limiteSeguro(undefined, 15), 15);
  assert.equal(limiteSeguro('abc', 15), 15);
  assert.equal(limiteSeguro('0', 15), 15);
  assert.equal(limiteSeguro('-5', 15), 15);
  assert.equal(limiteSeguro('999999'), 1000);
});
