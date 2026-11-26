import test from 'node:test';
import assert from 'node:assert/strict';
import { validarRegistro } from '../src/services/prospectos.service.js';

const ok = { nombre: '  María  Pérez ', email: 'Maria@Correo.com', telefono: '+58 414 000 0000', interes: 'tienda', mensaje: 'Tengo una bodega\nen Maturín' };

test('limpia y acepta un registro válido', () => {
  const r = validarRegistro(ok);
  assert.deepEqual(r.datos, { Nombre: 'María Pérez', Email: 'maria@correo.com', Telefono: '+58 414 000 0000', Interes: 'tienda', Mensaje: 'Tengo una bodega\nen Maturín' });
});

test('teléfono, interés y mensaje son opcionales', () => {
  const r = validarRegistro({ nombre: 'Ana', email: 'ana@x.co' });
  assert.equal(r.datos.Telefono, null);
  assert.equal(r.datos.Interes, null);
  assert.equal(r.datos.Mensaje, null);
});

test('rechaza datos inválidos', () => {
  assert.match(validarRegistro({ ...ok, nombre: 'A' }).error, /nombre/);
  assert.match(validarRegistro({ ...ok, email: 'no-es-correo' }).error, /correo/);
  assert.match(validarRegistro({ ...ok, telefono: 'abc' }).error, /teléfono/);
  assert.match(validarRegistro({ ...ok, interes: 'hackear' }).error, /interesa/);
});

test('el campo oculto lleno delata a un robot', () => {
  assert.deepEqual(validarRegistro({ ...ok, sitio_web: 'http://spam' }), { robot: true });
});

test('recorta textos largos', () => {
  const r = validarRegistro({ ...ok, mensaje: 'x'.repeat(5000) });
  assert.equal(r.datos.Mensaje.length, 1000);
});
