import test from 'node:test';
import assert from 'node:assert/strict';
import { alcanceGeo, buildGeoFilter } from '../src/controllers/reportes.controller.js';

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
