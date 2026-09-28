import test from 'node:test';
import assert from 'node:assert/strict';
import { validarRecepcion } from '../src/services/recepcionOrden.service.js';
const linea = (recibida = 10) => [{ idDetalle: 1, idProducto: 7, CantidadOrdenada: 30, CantidadRecibida: recibida, PrecioUnitario: 1.2 }];
const item = cantidad => ({ idDetalle: 1, CantidadRecibida: cantidad });
test('10 anteriores + 20 nuevos completan 30 y valorizan solo 20', () => {
 const [r] = validarRecepcion(linea(), [item(20)], 'RECIBIDA_COMPLETA');
 assert.equal(r.cantidad, 20); assert.equal(r.cantidad * r.precio, 24);
});
test('rechaza recibir 30 adicionales cuando faltan 20', () => assert.throws(() => validarRecepcion(linea(), [item(30)], 'RECIBIDA_COMPLETA')));
test('permite varias parciales', () => assert.equal(validarRecepcion(linea(), [item(5)], 'RECIBIDA_PARCIAL')[0].cantidad, 5));
test('no completa si faltan unidades u otro renglón', () => {
 assert.throws(() => validarRecepcion(linea(), [item(5)], 'RECIBIDA_COMPLETA'));
 assert.throws(() => validarRecepcion([...linea(), {...linea(0)[0], idDetalle: 2}], [item(20)], 'RECIBIDA_COMPLETA'));
});
test('rechaza renglones repetidos y ajenos', () => {
 assert.throws(() => validarRecepcion(linea(), [item(15), item(15)], 'RECIBIDA_PARCIAL'));
 assert.throws(() => validarRecepcion(linea(), [{idDetalle: 99, CantidadRecibida: 1}], 'RECIBIDA_PARCIAL'));
});
test('rechaza cantidades inválidas', () => {
 for (const n of [-1, NaN, Infinity, '2abc', '', null, 0.00001]) assert.throws(() => validarRecepcion(linea(), [item(n)], 'RECIBIDA_PARCIAL'));
});
test('no registra entrega vacía ni reenvío sobre orden ya recibida', () => {
 assert.throws(() => validarRecepcion(linea(), [item(0)], 'RECIBIDA_PARCIAL'));
 assert.throws(() => validarRecepcion(linea(30), [item(20)], 'RECIBIDA_COMPLETA'));
});
