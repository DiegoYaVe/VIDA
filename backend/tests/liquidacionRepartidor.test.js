import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularCobroEfectivoRepartidor } from '../src/services/liquidacionRepartidor.service.js';

test('efectivo VES descuenta la comisión convertida con la tasa histórica', () => {
  const r = calcularCobroEfectivoRepartidor({
    totalUSD: 10, comisionUSD: 1.5,
    pagoMonedaJSON: { Moneda:'VES', TotalOriginal:8570.06, TasaVESporUSD:857.0058, idTasa:9, FechaTasa:'2026-09-28', Fuente:'BCV_TODAY' },
  });
  assert.equal(r.Moneda, 'VES');
  assert.equal(r.ComisionOriginal, 1285.51);
  assert.equal(r.MontoARendirOriginal, 7284.55);
  assert.equal(r.idTasa, 9);
});

test('efectivo USD legado conserva el comportamiento anterior', () => {
  const r = calcularCobroEfectivoRepartidor({ totalUSD:20, comisionUSD:3, pagoMonedaJSON:null });
  assert.equal(r.Moneda, 'USD');
  assert.equal(r.MontoARendirOriginal, 17);
  assert.equal(r.MontoARendirUSD, 17);
});

test('rechaza snapshot VES corrupto y una comisión mayor al total', () => {
  assert.throws(() => calcularCobroEfectivoRepartidor({ totalUSD:10, comisionUSD:1, pagoMonedaJSON:{Moneda:'VES'} }), /tasa histórica/);
  assert.throws(() => calcularCobroEfectivoRepartidor({ totalUSD:10, comisionUSD:11 }), /Importes inválidos/);
});

