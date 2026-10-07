// Integración contra SQL Server (RUN_DB_TESTS=1): factura, número de control,
// notas de crédito, devoluciones, IGTF y ventas tardías. Todo en transacciones
// revertidas con datos ficticios (ver helpers.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { DB, sql, actor, enTransaccionRevertida, cerrarPool, fixtureVenta, abrirTurno } from './helpers.js';

const F = await import('../../src/services/factura.service.js');
const D = await import('../../src/services/devolucion.service.js');
const { turnoDeLaVenta } = await import('../../src/services/turnoVenta.service.js');
const { calcularTotales } = await import('../../src/controllers/caja.controller.js');

const opts = { skip: !DB && 'requiere RUN_DB_TESTS=1' };
const receptor = { Documento: 'V-12345678', Nombre: 'Cliente de prueba' };
const codigo = async (p) => { try { await p; return 'ok'; } catch (e) { return e.statusCode ?? e.message; } };
after(cerrarPool);

test('factura: total en Bs = lo cobrado, IVA desglosado, una por pedido', opts, () => enTransaccionRevertida(async (tx) => {
  const v = await fixtureVenta(tx, { cantidad: 2, precio: 5.8, tasa: 40 });
  const r = await F.emitirFactura(tx, actor, { idPedido: v.idPedido, receptor });
  const f = await F.obtenerFactura(tx, actor, r.idFactura);
  assert.equal(f.Status, 'PENDIENTE_CONTROL');
  assert.equal(Number(f.TotalVES), 464);
  assert.equal(Number(f.BaseGeneralVES), 400);
  assert.equal(Number(f.IVAGeneralVES), 64);
  assert.equal(f.ReceptorDocumento, 'V12345678');
  assert.equal(await codigo(F.emitirFactura(tx, actor, { idPedido: v.idPedido, receptor })), 409);
}));

test('número de control: una sola vez; la NC lo exige', opts, () => enTransaccionRevertida(async (tx) => {
  const v = await fixtureVenta(tx);
  const { idFactura } = await F.emitirFactura(tx, actor, { idPedido: v.idPedido, receptor });
  assert.equal(await codigo(F.emitirNotaCredito(tx, actor, { idFactura, motivo: 'Devolución total' })), 422);
  await F.registrarControl(tx, actor, { idFactura, NumeroControl: '00-0001' });
  assert.equal(await codigo(F.registrarControl(tx, actor, { idFactura, NumeroControl: '00-0002' })), 409);
  assert.equal((await F.obtenerFactura(tx, actor, idFactura)).Status, 'EMITIDA');
}));

test('notas de crédito parciales suman exactamente la factura', opts, () => enTransaccionRevertida(async (tx) => {
  const v = await fixtureVenta(tx, { cantidad: 3, precio: 1.37, tasa: 41.1234 });
  const { idFactura } = await F.emitirFactura(tx, actor, { idPedido: v.idPedido, receptor });
  await F.registrarControl(tx, actor, { idFactura, NumeroControl: '00-0003' });
  await F.emitirNotaCredito(tx, actor, { idFactura, motivo: 'Devolución parcial', lineas: [{ Linea: 1, Cantidad: 1 }] });
  const n2 = await F.emitirNotaCredito(tx, actor, { idFactura, motivo: 'Devolución del resto' });
  assert.equal(n2.final, true);
  const f = await F.obtenerFactura(tx, actor, idFactura);
  assert.equal(f.acreditadaCompleta, true);
  const suma = f.notasCredito.reduce((s, n) => s + Number(n.TotalVES), 0);
  assert.equal(Math.round(suma * 100) / 100, Number(f.TotalVES));
  assert.equal(await codigo(F.emitirNotaCredito(tx, actor, { idFactura, motivo: 'Otra más' })), 409);
}));

test('facturas inmutables: el trigger impide cambiar montos', opts, () => enTransaccionRevertida(async (tx) => {
  const v = await fixtureVenta(tx);
  const { idFactura } = await F.emitirFactura(tx, actor, { idPedido: v.idPedido, receptor });
  await assert.rejects(new sql.Request(tx).query(`UPDATE VIDA_FACTURAS SET TotalVES = TotalVES + 1 WHERE idBranch=1 AND idCuenta=1 AND idFactura=${idFactura}`));
}));

test('IGTF en la factura solo si el POS lo cobró', opts, () => enTransaccionRevertida(async (tx) => {
  const sin = await fixtureVenta(tx, { especial: true, igtf: false });
  const a = await F.obtenerFactura(tx, actor, (await F.emitirFactura(tx, actor, { idPedido: sin.idPedido, receptor })).idFactura);
  assert.equal(Number(a.IGTFVES), 0);
  const con = await fixtureVenta(tx, { especial: true, igtf: true, tasa: 40 });
  const b = await F.obtenerFactura(tx, actor, (await F.emitirFactura(tx, actor, { idPedido: con.idPedido, receptor })).idFactura);
  assert.equal(Number(b.IGTFBaseVES), 400);
  assert.equal(Number(b.IGTFVES), 12);
}));

test('devolución: stock, reembolso en caja por moneda y nota de crédito', opts, () => enTransaccionRevertida(async (tx) => {
  const v = await fixtureVenta(tx, { cantidad: 2, precio: 5, tasa: 40 });
  const items = [{ idDetalle: 1, Cantidad: 1 }];
  assert.equal(await codigo(D.devolverVenta(tx, actor, { idPedido: v.idPedido, items, motivo: 'Producto dañado', metodoReembolso: 'EFECTIVO', moneda: 'VES' })), 409);
  const turno = await abrirTurno(tx, v.pv);
  const { idFactura } = await F.emitirFactura(tx, actor, { idPedido: v.idPedido, receptor });
  assert.equal(await codigo(D.devolverVenta(tx, actor, { idPedido: v.idPedido, items, motivo: 'Producto dañado', metodoReembolso: 'EXTERNO' })), 422);
  await F.registrarControl(tx, actor, { idFactura, NumeroControl: '00-0004' });
  const d = await D.devolverVenta(tx, actor, { idPedido: v.idPedido, items, motivo: 'Producto dañado', metodoReembolso: 'EFECTIVO', moneda: 'VES' });
  assert.equal(d.MontoUSD, 5);
  assert.equal(d.MontoReembolso, 200);
  assert.equal(String(d.idTurno), String(turno));
  const stock = (await new sql.Request(tx).query(`SELECT Cantidad FROM VIDA_INVENTARIO_STOCK WHERE idBranch=1 AND idCuenta=1 AND idPuntoVenta=${v.pv} AND idProducto=${v.prod}`)).recordset[0].Cantidad;
  assert.equal(Number(stock), 11);
  const nc = await F.obtenerFactura(tx, actor, d.idNotaCredito);
  assert.equal(Number(nc.TotalVES), 200);
  assert.equal(await codigo(D.devolverVenta(tx, actor, { idPedido: v.idPedido, items: [{ idDetalle: 1, Cantidad: 2 }], motivo: 'Otra devolución', metodoReembolso: 'EXTERNO' })), 422);
}));

test('ventas offline tardías: van a su turno y no suman al cierre', opts, () => enTransaccionRevertida(async (tx) => {
  const v = await fixtureVenta(tx);
  const q = (s) => new sql.Request(tx).query(s);
  const id = Number((await q(`SELECT ISNULL(MAX(idTurno),0)+1 n FROM VIDA_CAJA_TURNOS WHERE idBranch=1 AND idCuenta=1`)).recordset[0].n);
  await q(`INSERT INTO VIDA_CAJA_TURNOS (idBranch,idCuenta,idTurno,idPuntoVenta,idUsuario,FechaApertura,FechaCierre,MontoApertura,Status)
           VALUES (1,1,${id},${v.pv},1,DATEADD(HOUR,-5,GETUTCDATE()),DATEADD(HOUR,-3,GETUTCDATE()),0,'CERRADO')`);
  const abierto = await abrirTurno(tx, v.pv);
  const ahora = (await q('SELECT GETUTCDATE() t')).recordset[0].t;
  const h = (n) => new Date(ahora.getTime() + n * 3600e3);
  assert.deepEqual(await turnoDeLaVenta(tx, actor, v.pv, h(-4)), { idTurno: String(id), ventaTardia: true });
  assert.deepEqual(await turnoDeLaVenta(tx, actor, v.pv, h(-2)), { idTurno: null, ventaTardia: true });
  const t = await turnoDeLaVenta(tx, actor, v.pv, h(-0.5));
  assert.equal(String(t.idTurno), String(abierto));
  assert.equal(t.ventaTardia, false);
  // La venta del fixture (sin turno, dentro de la ventana) cuenta; una tardía del turno abierto no
  await q(`UPDATE VIDA_PEDIDOS SET idTurno=NULL, VentaTardia=0 WHERE idBranch=1 AND idCuenta=1 AND idPedido=${v.idPedido}`);
  const tot = await calcularTotales(tx, 1, 1, v.pv, h(-1), null, abierto);
  assert.equal(Number(tot.NumTransacciones), 1);
  await q(`UPDATE VIDA_PEDIDOS SET idTurno=${abierto}, VentaTardia=1 WHERE idBranch=1 AND idCuenta=1 AND idPedido=${v.idPedido}`);
  assert.equal(Number((await calcularTotales(tx, 1, 1, v.pv, h(-1), null, abierto)).NumTransacciones), 0);
}));
