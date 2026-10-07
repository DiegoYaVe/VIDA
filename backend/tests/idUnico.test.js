import test from 'node:test';
import assert from 'node:assert/strict';
import { conIdUnico } from '../src/db/idUnico.js';

test('conIdUnico reintenta solo ante PK duplicada', async () => {
  let n = 0;
  const id = await conIdUnico(async () => { n++; if (n < 3) throw Object.assign(new Error('dup'), { number: 2627 }); return 42; });
  assert.equal(id, 42);
  assert.equal(n, 3);
  let m = 0;
  await assert.rejects(conIdUnico(async () => { m++; throw Object.assign(new Error('otro'), { number: 547 }); }));
  assert.equal(m, 1);
  let k = 0;
  await assert.rejects(conIdUnico(async () => { k++; throw Object.assign(new Error('dup'), { number: 2627 }); }, 4));
  assert.equal(k, 4);
});
