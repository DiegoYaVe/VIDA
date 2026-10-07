import test from 'node:test';
import assert from 'node:assert/strict';
import { alcanceGeo, buildGeoFilter } from '../src/controllers/reportes.controller.js';
import { filtroTiendasRed, tiendaEnAlcance, operadorMatriz, alcanceCuentas } from '../src/services/alcance.service.js';

// Request de mssql simulado: guarda los parámetros que recibe.
const fakeReq = () => { const r = { p: {} }; r.input = (n, _t, v) => { r.p[n] = v; return r; }; return r; };

test('ADMIN_ESTADO queda limitado a las tiendas de su estado', () => {
  const r = fakeReq();
  const w = buildGeoFilter({ TipoUsuario: 'ADMIN_ESTADO', idEstado: '10', idPais: '1' }, {}, r);
  assert.match(w, /pv\.idEstado = @geoAlcance/);
  assert.equal(r.p.geoAlcance, '10');
});

test('ADMIN_ESTADO sin estado asignado no ve nada (no se abre la red)', () => {
  const r = fakeReq();
  const w = buildGeoFilter({ TipoUsuario: 'ADMIN_ESTADO', idEstado: null }, {}, r);
  assert.equal(w.trim(), 'AND 1 = 0');
});

test('ADMIN_ESTADO: el filtro de otra tienda se aplica dentro de su estado, no lo reemplaza', () => {
  const r = fakeReq();
  const w = buildGeoFilter({ TipoUsuario: 'ADMIN_ESTADO', idEstado: '10' }, { filtroIdPuntoVenta: '99' }, r);
  assert.match(w, /pv\.idEstado = @geoAlcance AND pv\.idPuntoVenta = @geoPV/);
  assert.equal(r.p.geoAlcance, '10'); assert.equal(r.p.geoPV, '99');
});

test('ADMIN_PAIS: su país si lo tiene; sin país asignado conserva toda la cuenta', () => {
  const r = fakeReq();
  assert.match(buildGeoFilter({ TipoUsuario: 'ADMIN_PAIS', idPais: '1' }, {}, r), /pv\.idPais = @geoAlcance/);
  assert.equal(r.p.geoAlcance, '1');
  assert.equal(buildGeoFilter({ TipoUsuario: 'ADMIN_PAIS', idPais: null }, {}, fakeReq()), '');
});

test('roles de tienda: siempre su tienda, ignoran los filtros del selector', () => {
  for (const TipoUsuario of ['ADMIN', 'SUPERVISOR', 'CAJERO', 'CASHIER']) {
    const r = fakeReq();
    const w = buildGeoFilter({ TipoUsuario, idPuntoVenta: '3' }, { filtroIdPuntoVenta: '99', filtroEstado: 'Zulia' }, r);
    assert.equal(w, ' AND pv.idPuntoVenta = @geoForzado');
    assert.equal(r.p.geoForzado, '3'); assert.equal(r.p.geoPV, undefined);
  }
});

test('SUPER_ADMIN: toda la cuenta, con filtros opcionales', () => {
  assert.equal(buildGeoFilter({ TipoUsuario: 'SUPER_ADMIN' }, {}, fakeReq()), '');
  assert.match(buildGeoFilter({ TipoUsuario: 'SUPER_ADMIN' }, { filtroEstado: 'Zulia' }, fakeReq()), /pv\.Estado = @geoEstado/);
});

test('alcanceGeo sin alias (selector de tiendas)', () => {
  assert.equal(alcanceGeo({ TipoUsuario: 'ADMIN_ESTADO', idEstado: '10' }, '').sql, ' AND idEstado = @geoAlcance');
});

test('filtroTiendasRed: ADMIN_ESTADO limita la columna de tienda a su estado', () => {
  const r = fakeReq();
  const w = filtroTiendasRed({ TipoUsuario: 'ADMIN_ESTADO', idEstado: '10' }, 'p.idPuntoVenta', r);
  assert.match(w, /p\.idPuntoVenta IN \(SELECT alc\.idPuntoVenta FROM VIDA_CUENTA_PUNTOS_VENTA alc/);
  assert.match(w, /alc\.idEstado=@alcRed/);
  assert.equal(r.p.alcRed, '10');
});

test('filtroTiendasRed: sin estado nada; ADMIN_PAIS por país; SUPER_ADMIN y ADMIN_PAIS sin país sin filtro', () => {
  assert.equal(filtroTiendasRed({ TipoUsuario: 'ADMIN_ESTADO', idEstado: null }, 'x', fakeReq()), ' AND 1 = 0');
  assert.match(filtroTiendasRed({ TipoUsuario: 'ADMIN_PAIS', idPais: '1' }, 'x', fakeReq()), /alc\.idPais=@alcRed/);
  assert.equal(filtroTiendasRed({ TipoUsuario: 'ADMIN_PAIS', idPais: null }, 'x', fakeReq()), '');
  assert.equal(filtroTiendasRed({ TipoUsuario: 'SUPER_ADMIN' }, 'x', fakeReq()), '');
});

test('tiendaEnAlcance sin consultar la BD: tienda propia, super admin, estado sin asignar', async () => {
  assert.equal(await tiendaEnAlcance({ TipoUsuario: 'CAJERO', idPuntoVenta: '3' }, '3'), true);
  assert.equal(await tiendaEnAlcance({ TipoUsuario: 'CAJERO', idPuntoVenta: '3' }, '4'), false);
  assert.equal(await tiendaEnAlcance({ TipoUsuario: 'ADMIN', idPuntoVenta: null }, '3'), false);
  assert.equal(await tiendaEnAlcance({ TipoUsuario: 'SUPER_ADMIN' }, '99'), true);
  assert.equal(await tiendaEnAlcance({ TipoUsuario: 'ADMIN_PAIS', idPais: null }, '99'), true);
  assert.equal(await tiendaEnAlcance({ TipoUsuario: 'ADMIN_ESTADO', idEstado: null }, '99'), false);
  assert.equal(await tiendaEnAlcance({ TipoUsuario: 'SUPER_ADMIN' }, null), false);
  assert.equal(await tiendaEnAlcance({ TipoUsuario: 'CLIENTE' }, '3'), false);
});
// Pool simulado: la Matriz de la cuenta es la tienda 5.
const poolMatriz = { request() { const r = { input: () => r, query: async () => ({ recordset: [{ idPuntoVenta: '5' }] }) }; return r; } };
const u = (TipoUsuario, extra = {}) => ({ idBranch: '1', idCuenta: '1', TipoUsuario, ...extra });

test('operar la Matriz: solo SUPER_ADMIN y el ADMIN de la tienda Matriz', async () => {
  assert.equal((await operadorMatriz(u('SUPER_ADMIN'), poolMatriz)).permitido, true);
  assert.equal((await operadorMatriz(u('ADMIN', { idPuntoVenta: '5' }), poolMatriz)).permitido, true);
  for (const t of ['ADMIN_PAIS', 'ADMIN_ESTADO']) {
    const r = await operadorMatriz(u(t, { idEstado: '10', idPais: '1' }), poolMatriz);
    assert.equal(r.permitido, false); assert.match(r.motivo, /SUPER_ADMIN/);
  }
  assert.equal((await operadorMatriz(u('ADMIN', { idPuntoVenta: '3' }), poolMatriz)).permitido, false);
});

test('cuentas: región en solo lectura para ADMIN_PAIS/ADMIN_ESTADO; ADMIN de sucursal solo lo suyo', async () => {
  assert.deepEqual(await alcanceCuentas(u('SUPER_ADMIN'), poolMatriz), { verTodo: true, region: false, soloCxcDe: null });
  assert.deepEqual(await alcanceCuentas(u('ADMIN_ESTADO', { idEstado: '10' }), poolMatriz), { verTodo: false, region: true, soloCxcDe: null });
  assert.deepEqual(await alcanceCuentas(u('ADMIN_PAIS', { idPais: '1' }), poolMatriz), { verTodo: false, region: true, soloCxcDe: null });
  assert.deepEqual(await alcanceCuentas(u('ADMIN', { idPuntoVenta: '3' }), poolMatriz), { verTodo: false, region: false, soloCxcDe: '3' });
});

import { ubicacionEnAlcance } from '../src/services/alcance.service.js';
test('ubicar tiendas: cada rol solo dentro de su región', () => {
  assert.equal(ubicacionEnAlcance({ TipoUsuario: 'SUPER_ADMIN' }, { idPais: 9, idEstado: 9 }), true);
  assert.equal(ubicacionEnAlcance({ TipoUsuario: 'ADMIN_ESTADO', idEstado: 5 }, { idPais: 1, idEstado: 5 }), true);
  assert.equal(ubicacionEnAlcance({ TipoUsuario: 'ADMIN_ESTADO', idEstado: 5 }, { idPais: 1, idEstado: 6 }), false);
  assert.equal(ubicacionEnAlcance({ TipoUsuario: 'ADMIN_ESTADO', idEstado: null }, { idEstado: 5 }), false);
  assert.equal(ubicacionEnAlcance({ TipoUsuario: 'ADMIN_PAIS', idPais: 1 }, { idPais: 1, idEstado: 7 }), true);
  assert.equal(ubicacionEnAlcance({ TipoUsuario: 'ADMIN_PAIS', idPais: 1 }, { idPais: 2 }), false);
  assert.equal(ubicacionEnAlcance({ TipoUsuario: 'ADMIN_PAIS', idPais: null }, { idPais: 2 }), true);
  assert.equal(ubicacionEnAlcance({ TipoUsuario: 'ADMIN', idPuntoVenta: 3 }, { idPais: 1, idEstado: 5 }), false);
});
