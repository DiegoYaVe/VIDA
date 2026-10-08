import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { guardarPrevio, rutaPrevio, tokenValido } from '../src/services/comprobantePrevio.service.js';

test('comprobante previo: solo imágenes, ligado al cliente y con vigencia', () => {
  const cwd = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vida-comp-'));
  process.chdir(tmp);
  try {
    const cli = { idBranch: 1, idCuenta: 1, idCliente: 7 };
    assert.throws(() => guardarPrevio(cli, 'application/pdf', Buffer.from('x')), e => e.statusCode === 400);
    assert.throws(() => guardarPrevio(cli, 'image/png', Buffer.alloc(0)), e => e.statusCode === 400);
    const token = guardarPrevio(cli, 'image/png', Buffer.from('png'));
    assert.ok(tokenValido(token));
    assert.ok(rutaPrevio(cli, token));
    assert.equal(rutaPrevio({ ...cli, idCliente: 8 }, token), null);
    assert.equal(rutaPrevio(cli, token, Date.now() + 25 * 3600 * 1000), null);
    for (const malo of ['../x.png', 'abc.png', `${token}.exe`, null, 5]) assert.equal(tokenValido(malo), false);
  } finally {
    process.chdir(cwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
