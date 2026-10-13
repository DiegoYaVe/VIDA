// Recuperar contraseña, cupón por inactividad y eventos del Club (migración 55)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generarCodigo, estadoCodigo, MAX_INTENTOS } from '../src/controllers/delivery/recuperacion.js';
import { enmascararCorreo, correoConfigurado } from '../src/services/correo.service.js';
import { configCuponInactivo, textoBeneficio, codigoPersonal } from '../src/services/cuponesAutomaticos.service.js';
import { evaluarCupon } from '../src/controllers/cupones.controller.js';
import { nivelPorPuntos } from '../src/controllers/club.controller.js';
import { motivoNoConfirma, caracasAUtc, utcACaracas } from '../src/controllers/clubEventos.controller.js';

test('recuperación: código de 6 dígitos y estados del código guardado', () => {
  for (let i = 0; i < 50; i++) assert.match(generarCodigo(), /^\d{6}$/);
  const ahora = new Date('2026-10-08T12:00:00Z');
  const vigente = { Usado: false, Intentos: 0, Expira: new Date('2026-10-08T12:10:00Z') };
  assert.equal(estadoCodigo(vigente, ahora), 'ok');
  assert.equal(estadoCodigo(null, ahora), 'SIN_CODIGO');
  assert.equal(estadoCodigo({ ...vigente, Usado: true }, ahora), 'SIN_CODIGO');
  assert.equal(estadoCodigo({ ...vigente, Expira: new Date('2026-10-08T11:59:59Z') }, ahora), 'VENCIDO');
  assert.equal(estadoCodigo({ ...vigente, Intentos: MAX_INTENTOS }, ahora), 'BLOQUEADO');
});

test('correo: se enmascara y se exige SMTP configurado', () => {
  assert.equal(enmascararCorreo('diego@gmail.com'), 'd***o@gmail.com');
  assert.equal(enmascararCorreo('ab@x.com'), 'a**b@x.com');
  assert.equal(enmascararCorreo('sin-arroba'), '');
  assert.equal(correoConfigurado({}), false);
  assert.equal(correoConfigurado({ EMAIL_USER: 'u', EMAIL_PASS: 'p' }), true);
});

test('cupón por inactividad: config con valores por defecto y validada', () => {
  const d = configCuponInactivo({});
  assert.deepEqual(d, { activo: false, dias: 30, pct: 10, maxUSD: 5, minCompraUSD: 0, vigenciaDias: 7, repetirDias: 60 });
  const c = configCuponInactivo({ CuponInactivoActivo: '1', CuponInactivoDias: '45', CuponInactivoPct: '150', CuponInactivoMaxUSD: 'x', CuponInactivoVigenciaDias: '0' });
  assert.equal(c.activo, true); assert.equal(c.dias, 45); assert.equal(c.pct, 100); assert.equal(c.maxUSD, 5); assert.equal(c.vigenciaDias, 7);
  assert.equal(textoBeneficio(d), '10% de descuento (hasta $5.00)');
  assert.equal(textoBeneficio({ ...d, maxUSD: 0, minCompraUSD: 8 }), '10% de descuento en compras desde $8.00');
  for (let i = 0; i < 30; i++) assert.match(codigoPersonal(), /^VUELVE-[A-HJ-NP-Z2-9]{6}$/);
});

test('cupón personal: solo vale en la cuenta a la que se emitió', () => {
  const cupon = { Status: 'ACTIVO', Tipo: 'DESCUENTO_PCT', Valor: 10, MaxDescuento: 5, Alcance: 'TODO', Canal: 'DELIVERY', UsosActuales: 0, UsosMax: 1, idClienteExclusivo: 7 };
  assert.deepEqual(evaluarCupon(cupon, { subtotal: 20, canal: 'DELIVERY', idCliente: 7 }), { ok: true, descuento: 2, motivo: 'OK' });
  assert.equal(evaluarCupon(cupon, { subtotal: 20, canal: 'DELIVERY', idCliente: 8 }).ok, false);
  assert.equal(evaluarCupon(cupon, { subtotal: 20, canal: 'DELIVERY' }).ok, false); // sin cliente (p. ej. POS)
  assert.equal(evaluarCupon({ ...cupon, idClienteExclusivo: null }, { subtotal: 20, canal: 'DELIVERY' }).ok, true);
});

test('Club: nivel por puntos ganados', () => {
  const niveles = [{ Nivel: 1, MinPuntos: 0 }, { Nivel: 2, MinPuntos: 500 }, { Nivel: 3, MinPuntos: 2000 }];
  assert.equal(nivelPorPuntos(niveles, 0).Nivel, 1);
  assert.equal(nivelPorPuntos(niveles, 500).Nivel, 2);
  assert.equal(nivelPorPuntos(niveles, 1999).Nivel, 2);
  assert.equal(nivelPorPuntos([], 9999).Nivel, 1);
});

test('Club: reglas para confirmar asistencia a un evento', () => {
  const ahora = new Date('2026-10-08T12:00:00Z');
  const ev = { Status: 'ACTIVO', FechaInicio: new Date('2026-10-20T22:00:00Z'), Cupo: 10, NivelMinimo: 2 };
  assert.equal(motivoNoConfirma({ evento: ev, nivel: 2, inscritos: 9, ahora }), null);
  assert.match(motivoNoConfirma({ evento: ev, nivel: 2, inscritos: 10, ahora }), /cupos/);
  assert.match(motivoNoConfirma({ evento: ev, nivel: 1, inscritos: 0, ahora }), /nivel/);
  assert.match(motivoNoConfirma({ evento: { ...ev, FechaInicio: new Date('2026-10-08T11:00:00Z') }, nivel: 3, inscritos: 0, ahora }), /comenzó/);
  assert.match(motivoNoConfirma({ evento: { ...ev, Status: 'INACTIVO' }, nivel: 3, inscritos: 0, ahora }), /disponible/);
  assert.equal(motivoNoConfirma({ evento: { ...ev, Cupo: null }, nivel: 2, inscritos: 500, ahora }), null);
});

test('Club: la hora del panel es la de Caracas y se guarda en UTC', () => {
  assert.equal(caracasAUtc('2026-10-20T18:00').toISOString(), '2026-10-20T22:00:00.000Z');
  assert.equal(caracasAUtc('2026-10-20T22:30').toISOString(), '2026-10-21T02:30:00.000Z');
  assert.equal(caracasAUtc('mañana'), null);
  assert.equal(utcACaracas(new Date('2026-10-21T02:30:00Z')), '2026-10-20T22:30');
});

import { tokenVigente, instanteCorte } from '../src/services/sesiones.service.js';
test('sesiones: el cambio de contraseña invalida los tokens anteriores', () => {
  const desde = new Date('2026-10-08T15:00:00Z');
  const iat = (d) => Math.floor(new Date(d).getTime() / 1000);
  assert.equal(tokenVigente({ Status: 'ACTIVO', SesionesDesde: null }, iat('2026-01-01T00:00:00Z')), true);
  assert.equal(tokenVigente({ Status: 'ACTIVO', SesionesDesde: desde }, iat('2026-10-08T14:59:59Z')), false);
  assert.equal(tokenVigente({ Status: 'ACTIVO', SesionesDesde: desde }, iat('2026-10-08T15:00:00Z')), true); // el token nuevo
  assert.equal(tokenVigente({ Status: 'ELIMINADO', SesionesDesde: null }, iat('2026-10-08T16:00:00Z')), false);
  assert.equal(tokenVigente(null, iat('2026-10-08T16:00:00Z')), false);
  // El corte se trunca al segundo: un token firmado justo después sigue valiendo
  const corte = instanteCorte();
  assert.equal(corte.getMilliseconds(), 0);
  assert.equal(tokenVigente({ Status: 'ACTIVO', SesionesDesde: corte }, Math.floor(Date.now() / 1000)), true);
});
