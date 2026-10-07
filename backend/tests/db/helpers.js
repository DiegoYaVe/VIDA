// Utilidades de las pruebas de integración contra SQL Server.
// Se activan con RUN_DB_TESTS=1 (usan la BD de backend/.env). Cada prueba
// trabaja dentro de una transacción que SIEMPRE se revierte: no dejan datos
// (las facturas, además, son inmutables y no se podrían borrar).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

export const DB = process.env.RUN_DB_TESTS === '1';
const aqui = path.dirname(fileURLToPath(import.meta.url));
if (DB) dotenv.config({ path: path.join(aqui, '..', '..', '.env') });

const { getPool, sql } = await import('../../src/db/sqlserver.js');
export { sql };

export const actor = { idBranch: '1', idCuenta: '1', idUsuario: '1', TipoUsuario: 'SUPER_ADMIN' };

// La BD de QA a veces tarda en aceptar la primera conexión: se reintenta.
async function conectar(intentos = 4) {
  for (let i = 1; ; i++) {
    try { return await getPool(); }
    catch (err) { if (err?.name !== 'ConnectionError' || i >= intentos) throw err; }
  }
}

// Corre fn(tx) y revierte pase lo que pase. Un trigger puede haber revertido
// ya la transacción: ese rollback extra se ignora.
export async function enTransaccionRevertida(fn) {
  const pool = await conectar();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    return await fn(tx);
  } finally {
    try { await tx.rollback(); } catch { /* ya revertida */ }
  }
}

export async function cerrarPool() {
  if (!DB) return;
  try { (await getPool()).close(); } catch { /* nunca conectó */ }
}

// Tienda y venta POS ficticias dentro de la transacción: tienda con datos
// fiscales, un producto existente con stock, venta entregada pagada en USD.
export async function fixtureVenta(tx, { cantidad = 2, precio = 5, totalUSD = null, tasa = 40, modalidad = 'IMPRENTA_DIGITAL', especial = false, igtf = false } = {}) {
  const q = (s) => new sql.Request(tx).query(s);
  const pv = Number((await q(`SELECT ISNULL(MAX(idPuntoVenta),0)+1 n FROM VIDA_CUENTA_PUNTOS_VENTA WHERE idBranch=1 AND idCuenta=1`)).recordset[0].n);
  await q(`INSERT INTO VIDA_CUENTA_PUNTOS_VENTA (idBranch,idCuenta,idPuntoVenta,Nombre,NomComercial,Status,RIF,RazonSocial,DomicilioFiscal,ModalidadFiscal,ContribuyenteEspecial)
           VALUES (1,1,${pv},'Tienda de prueba','Tienda de prueba','ACTIVO','J000029610','PRUEBA C.A.','Av. de prueba','${modalidad}',${especial ? 1 : 0})`);
  const prod = (await q(`SELECT TOP 1 idProducto FROM VIDA_INVENTARIO_PRODUCTOS WHERE idBranch=1 AND idCuenta=1 ORDER BY idProducto`)).recordset[0].idProducto;
  await q(`INSERT INTO VIDA_INVENTARIO_STOCK (idBranch,idCuenta,idPuntoVenta,idProducto,Cantidad) VALUES (1,1,${pv},${prod},10)`);
  const idPedido = Number((await q(`SELECT ISNULL(MAX(idPedido),0)+1 n FROM VIDA_PEDIDOS WHERE idBranch=1 AND idCuenta=1`)).recordset[0].n);
  const total = totalUSD ?? cantidad * precio;
  const pago = { Moneda: 'USD', Metodo: 'EFECTIVO', TotalOriginal: total, TotalUSD: total, TotalVES: Math.round(total * tasa * 100) / 100,
    Efectivo: total, Tarjeta: 0, Cambio: 0, TasaVESporUSD: tasa, FechaTasa: '2026-10-07', Fuente: 'prueba',
    ...(igtf ? { IGTFUSD: Math.round(total * 3) / 100, IGTFBaseUSD: total } : {}) };
  await new sql.Request(tx).input('pago', sql.NVarChar(sql.MAX), JSON.stringify(pago))
    .query(`INSERT INTO VIDA_PEDIDOS (idBranch,idCuenta,idPedido,idPuntoVenta,Canal,Status,MetodoPago,StatusPago,TotalUSD,MontoEfectivo,MontoCambio,PagoMonedaJSON,FechaAlta)
            VALUES (1,1,${idPedido},${pv},'POS','ENTREGADO','EFECTIVO','PAGADO',${total},${total},0,@pago,GETUTCDATE())`);
  await q(`INSERT INTO VIDA_PEDIDOS_DETALLE (idBranch,idCuenta,idPedido,idDetalle,idProducto,Cantidad,PrecioUnitario)
           VALUES (1,1,${idPedido},1,${prod},${cantidad},${precio})`);
  return { pv, prod, idPedido, total, tasa };
}

export async function abrirTurno(tx, pv) {
  const id = Number((await new sql.Request(tx).query(`SELECT ISNULL(MAX(idTurno),0)+1 n FROM VIDA_CAJA_TURNOS WHERE idBranch=1 AND idCuenta=1`)).recordset[0].n);
  await new sql.Request(tx).query(`INSERT INTO VIDA_CAJA_TURNOS (idBranch,idCuenta,idTurno,idPuntoVenta,idUsuario,FechaApertura,MontoApertura,Status)
                                   VALUES (1,1,${id},${pv},1,DATEADD(HOUR,-1,GETUTCDATE()),0,'ABIERTO')`);
  return id;
}
