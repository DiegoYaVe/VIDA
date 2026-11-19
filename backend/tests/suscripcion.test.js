import test from 'node:test';
import assert from 'node:assert/strict';
import {
  periodoDe, periodoSiguiente, nombrePeriodo, fechaVencimiento, origenPeriodo, periodoDeOrigen,
  diasEntre, periodosACobrar, estadoSuscripcion, mensualidadesParaMulta, nivelSugerido, ORIGEN,
} from '../src/services/suscripcion.service.js';

test('periodos en hora de Venezuela', () => {
  assert.equal(periodoDe(new Date('2026-12-01T03:00:00Z')), 202611);   // 30 nov 11 p. m. en Caracas
  assert.equal(periodoDe(new Date('2026-12-01T05:00:00Z')), 202612);
  assert.equal(periodoSiguiente(202612), 202701);
  assert.equal(nombrePeriodo(202611), 'noviembre 2026');
});

test('vencimiento: día configurado o el último del mes', () => {
  assert.equal(fechaVencimiento(202611, 5), '2026-11-05');
  assert.equal(fechaVencimiento(202702, 31), '2027-02-28');
});

test('origen único por tienda y periodo', () => {
  assert.equal(origenPeriodo(14, 202611), 14202611);
  assert.equal(periodoDeOrigen(14202611), 202611);
});

test('se cobra desde el mes siguiente a la afiliación', () => {
  assert.deepEqual(periodosACobrar('2026-11-19', new Date('2026-11-25T15:00:00Z')), []);
  assert.deepEqual(periodosACobrar('2026-11-19', new Date('2027-01-10T15:00:00Z')), [202612, 202701]);
  assert.deepEqual(periodosACobrar(null), []);
});

test('estado de la suscripción', () => {
  const hoy = '2026-12-10';
  const d = (FechaVencimiento, Saldo = 30) => [{ OrigenTipo: ORIGEN.MENSUALIDAD, FechaVencimiento, Saldo }];
  assert.equal(estadoSuscripcion({ tieneNivel: false, hoy }).estado, 'SIN_PLAN');
  assert.equal(estadoSuscripcion({ tieneNivel: true, hoy }).estado, 'AL_DIA');
  assert.equal(estadoSuscripcion({ tieneNivel: true, deudas: d('2026-12-13'), hoy }).estado, 'POR_VENCER');
  assert.equal(estadoSuscripcion({ tieneNivel: true, deudas: d('2026-12-30'), hoy }).estado, 'AL_DIA');
  const vencida = estadoSuscripcion({ tieneNivel: true, deudas: d('2026-12-08'), hoy, toleranciaDias: 5, corteActivo: true });
  assert.equal(vencida.estado, 'VENCIDA');
  assert.equal(vencida.diasParaCorte, 4);
  assert.equal(estadoSuscripcion({ tieneNivel: true, deudas: d('2026-12-01'), hoy, toleranciaDias: 5, corteActivo: true }).estado, 'SUSPENDIDA');
  // Con el corte apagado nunca suspende
  assert.equal(estadoSuscripcion({ tieneNivel: true, deudas: d('2026-11-01'), hoy, toleranciaDias: 5, corteActivo: false }).estado, 'VENCIDA');
  // Saldo pagado = al día
  assert.equal(estadoSuscripcion({ tieneNivel: true, deudas: d('2026-11-01', 0), hoy, corteActivo: true }).estado, 'AL_DIA');
  assert.equal(estadoSuscripcion({ tieneNivel: true, deudas: [...d('2026-12-01', 25), ...d('2026-11-01', 5)], hoy }).deudaUSD, 30);
});

test('multa: solo mensualidades que pasaron la tolerancia', () => {
  const deudas = [
    { OrigenTipo: ORIGEN.MENSUALIDAD, FechaVencimiento: '2026-12-01', Saldo: 30 },
    { OrigenTipo: ORIGEN.MENSUALIDAD, FechaVencimiento: '2026-12-08', Saldo: 30 },
    { OrigenTipo: ORIGEN.MULTA, FechaVencimiento: '2026-11-01', Saldo: 10 },
    { OrigenTipo: ORIGEN.MENSUALIDAD, FechaVencimiento: '2026-11-01', Saldo: 0 },
  ];
  assert.deepEqual(mensualidadesParaMulta(deudas, '2026-12-10', 5).map(d => d.FechaVencimiento), ['2026-12-01']);
  assert.equal(diasEntre('2026-12-01', '2026-12-10'), 9);
});

test('nivel sugerido por número de productos', () => {
  const niveles = [
    { idNivel: 3, MaxProductos: null, Orden: 3 },
    { idNivel: 1, MaxProductos: 100, Orden: 1 },
    { idNivel: 2, MaxProductos: 300, Orden: 2 },
  ];
  assert.equal(nivelSugerido(niveles, 40).idNivel, 1);
  assert.equal(nivelSugerido(niveles, 101).idNivel, 2);
  assert.equal(nivelSugerido(niveles, 5000).idNivel, 3);
  assert.equal(nivelSugerido([], 10), null);
});
