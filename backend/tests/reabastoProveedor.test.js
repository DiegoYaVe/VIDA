import test from 'node:test';
import assert from 'node:assert/strict';
import {
  elegirProveedores, repartoComision, sucursalMasCercana, codigoRetiro, normalizarCodigo,
  folioReabasto, estadoTrasPaquetes,
  pesoPaqueteKg, repartidorAguanta, candidatosPorCapacidad,
} from '../src/services/reabastoProveedor.service.js';

test('elige el proveedor más barato y desempata por id', () => {
  const m = elegirProveedores([
    { idProducto: 1, idProveedor: 5, PrecioLista: 10 },
    { idProducto: 1, idProveedor: 3, PrecioLista: 9.5 },
    { idProducto: 2, idProveedor: 7, PrecioLista: 4 },
    { idProducto: 2, idProveedor: 2, PrecioLista: 4 },
  ]);
  assert.equal(m.get('1').idProveedor, 3);
  assert.equal(m.get('2').idProveedor, 2);
});

test('ignora ofertas sin precio de lista', () => {
  const m = elegirProveedores([
    { idProducto: 1, idProveedor: 1, PrecioLista: null },
    { idProducto: 1, idProveedor: 2, PrecioLista: 0 },
  ]);
  assert.equal(m.has('1'), false);
});

test('reparto de la comisión: ejemplo de la decisión ($10, 8 %)', () => {
  assert.deepEqual(repartoComision(10, 8), { totalLista: 10, pagarProveedor: 9.2, comisionVida: 0.8 });
  assert.deepEqual(repartoComision(10, 0), { totalLista: 10, pagarProveedor: 10, comisionVida: 0 });
  assert.throws(() => repartoComision(10, 100));
  assert.throws(() => repartoComision(10, -1));
});

test('sucursal más cercana, o la primera si no hay coordenadas', () => {
  const s = [
    { idSucursal: 2, Latitud: 10.5, Longitud: -66.9, Status: 'ACTIVO' },
    { idSucursal: 1, Latitud: 8.6, Longitud: -71.1, Status: 'ACTIVO' },
    { idSucursal: 3, Latitud: 10.49, Longitud: -66.88, Status: 'INACTIVO' },
  ];
  assert.equal(sucursalMasCercana(s, 10.48, -66.87).idSucursal, 2);
  assert.equal(sucursalMasCercana(s, null, null).idSucursal, 1);
  assert.equal(sucursalMasCercana([], 1, 1), null);
});

test('código de retiro legible y normalización al validarlo', () => {
  const c = codigoRetiro();
  assert.match(c, /^[A-HJKMNP-Z2-9]{8}$/);
  assert.equal(normalizarCodigo(' ab-cd 23 '), 'ABCD23');
});

test('folio sin datos de la tienda', () => {
  assert.equal(folioReabasto(42, new Date(Date.UTC(2026, 9, 28))), 'VR-2026-000042');
});

test('estado del pedido según sus paquetes', () => {
  assert.equal(estadoTrasPaquetes(['RECIBIDO', 'CANCELADO']), 'RECIBIDO');
  assert.equal(estadoTrasPaquetes(['RECIBIDO', 'LISTO']), 'EN_PROCESO');
  assert.equal(estadoTrasPaquetes(['CANCELADO']), 'CANCELADO');
});

test('peso del paquete: suma cantidad × peso, marca si falta algún peso', () => {
  assert.deepEqual(pesoPaqueteKg([{ Cantidad: 3, PesoKg: 1.5 }, { Cantidad: 2, PesoKg: 0.25 }]),
    { kg: 5, completo: true });
  assert.deepEqual(pesoPaqueteKg([{ Cantidad: 3, PesoKg: 1 }, { Cantidad: 2, PesoKg: null }]),
    { kg: 3, completo: false });
  assert.deepEqual(pesoPaqueteKg([]), { kg: 0, completo: true });
});

test('capacidad: el vehículo aguanta el peso', () => {
  assert.equal(repartidorAguanta(300, 250), true);
  assert.equal(repartidorAguanta(300, 300), true);
  assert.equal(repartidorAguanta(200, 250), false);
  assert.equal(repartidorAguanta(null, 10), false);   // sin capacidad declarada
  assert.equal(repartidorAguanta(0, 10), false);
  assert.equal(repartidorAguanta(300, 0), true);       // peso desconocido: pasa a cualquiera con capacidad
});

test('candidatos por capacidad: filtra y ordena del más justo al más grande', () => {
  const reps = [
    { idRepartidor: 1, CapacidadKg: 1000 },
    { idRepartidor: 2, CapacidadKg: 150 },
    { idRepartidor: 3, CapacidadKg: 300 },
    { idRepartidor: 4, CapacidadKg: null },
  ];
  assert.deepEqual(candidatosPorCapacidad(reps, 250).map(r => r.idRepartidor), [3, 1]);
  assert.deepEqual(candidatosPorCapacidad(reps, 2000).map(r => r.idRepartidor), []);
});
