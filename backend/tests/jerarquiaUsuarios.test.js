import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puedeGestionarRol, rolesAsignables, ubicacionEnAlcance, modulosFinales } from '../src/services/jerarquiaUsuarios.service.js';

test('jerarquía: cada rol solo gestiona rangos estrictamente inferiores', () => {
  assert.deepEqual(rolesAsignables('SUPER_ADMIN'), ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN', 'SUPERVISOR', 'CAJERO']);
  assert.deepEqual(rolesAsignables('ADMIN_PAIS'), ['ADMIN_ESTADO', 'ADMIN', 'SUPERVISOR', 'CAJERO']);
  assert.deepEqual(rolesAsignables('ADMIN_ESTADO'), ['ADMIN', 'SUPERVISOR', 'CAJERO']);
  assert.deepEqual(rolesAsignables('ADMIN'), ['SUPERVISOR', 'CAJERO']);
  assert.deepEqual(rolesAsignables('SUPERVISOR'), []);            // solo consulta
  assert.deepEqual(rolesAsignables('CAJERO'), []);
  assert.equal(puedeGestionarRol('ADMIN', 'SUPER_ADMIN'), false);
  assert.equal(puedeGestionarRol('ADMIN', 'ADMIN'), false);           // mismo rango
  assert.equal(puedeGestionarRol('SUPER_ADMIN', 'SUPER_ADMIN'), true);   // excepción del negocio
  assert.equal(puedeGestionarRol('ADMIN_PAIS', 'ADMIN_ESTADO'), true); // antes tenían el mismo nivel
  assert.equal(puedeGestionarRol('ADMIN', 'CASHIER'), true);          // alias histórico de cajero
  assert.equal(puedeGestionarRol('ADMIN', 'INVENTADO'), false);
});

test('jerarquía: solo dentro de su país, estado o tienda', () => {
  const tiendaA = { idPuntoVenta: 3, idEstado: 10, idPais: 1 };
  const tiendaB = { idPuntoVenta: 4, idEstado: 11, idPais: 1 };
  const otroPais = { idPuntoVenta: 9, idEstado: 50, idPais: 2 };
  assert.equal(ubicacionEnAlcance({ TipoUsuario: 'ADMIN', idPuntoVenta: 3 }, tiendaA), true);
  assert.equal(ubicacionEnAlcance({ TipoUsuario: 'ADMIN', idPuntoVenta: 3 }, tiendaB), false);
  assert.equal(ubicacionEnAlcance({ TipoUsuario: 'ADMIN_ESTADO', idEstado: 10 }, tiendaA), true);
  assert.equal(ubicacionEnAlcance({ TipoUsuario: 'ADMIN_ESTADO', idEstado: 10 }, tiendaB), false);
  assert.equal(ubicacionEnAlcance({ TipoUsuario: 'ADMIN_ESTADO', idEstado: null }, tiendaA), false);
  assert.equal(ubicacionEnAlcance({ TipoUsuario: 'ADMIN_PAIS', idPais: 1 }, tiendaB), true);
  assert.equal(ubicacionEnAlcance({ TipoUsuario: 'ADMIN_PAIS', idPais: 1 }, otroPais), false);
  assert.equal(ubicacionEnAlcance({ TipoUsuario: 'SUPER_ADMIN' }, otroPais), true);
  assert.equal(ubicacionEnAlcance({ TipoUsuario: 'SUPERVISOR', idPuntoVenta: 3 }, tiendaA), false);
});

test('jerarquía: solo da módulos que tiene y no borra los que no ve', () => {
  const mios = new Set(['1', '2', '3']);
  assert.deepEqual(modulosFinales([1, 2], null), { modulos: ['1', '2'] });            // SUPER_ADMIN
  assert.deepEqual(modulosFinales([1, 3], mios), { modulos: ['1', '3'] });
  assert.ok(modulosFinales([1, 9], mios).error);                                       // 9 no lo tiene
  // Edición: el 9 ya lo tenía (se lo dio alguien superior): se conserva aunque no venga
  assert.deepEqual(modulosFinales([1], mios, [1, 2, 9]).modulos.sort(), ['1', '9']);
  assert.deepEqual(modulosFinales([1, 9], mios, [9]).modulos.sort(), ['1', '9']);
});
