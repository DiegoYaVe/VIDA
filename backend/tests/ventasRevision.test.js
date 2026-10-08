import test from 'node:test';
import assert from 'node:assert/strict';
import { esRechazoPermanente } from '../src/services/ventasRevision.service.js';

test('rechazos de negocio pasan a revisión', () => {
  assert.equal(esRechazoPermanente(Object.assign(new Error('Cotización no autorizada'), { statusCode: 422 })), true);
  assert.equal(esRechazoPermanente(new Error('Actualiza el POS y consulta una tasa antes de cobrar')), true);
  // Error de SQL por datos (p. ej. FK a un producto inexistente)
  assert.equal(esRechazoPermanente(Object.assign(new Error('FK'), { code: 'EREQUEST', number: 547 })), true);
});

test('fallos de conexión o del servidor se reintentan solos', () => {
  for (const code of ['ESOCKET', 'ETIMEOUT', 'ECONNCLOSED', 'ECONNRESET'])
    assert.equal(esRechazoPermanente(Object.assign(new Error(code), { code })), false);
  assert.equal(esRechazoPermanente(Object.assign(new Error('deadlock'), { code: 'EREQUEST', number: 1205 })), false);
  assert.equal(esRechazoPermanente(Object.assign(new Error('caído'), { statusCode: 503 })), false);
  assert.equal(esRechazoPermanente(null), false);
});
