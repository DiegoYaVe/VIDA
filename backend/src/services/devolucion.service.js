// src/services/devolucion.service.js
// Devolución de una venta (total o parcial) en una sola transacción:
//  1. la mercancía vuelve al inventario de la tienda (movimiento ENTRADA);
//  2. el reembolso en EFECTIVO sale de la caja ABIERTA de la tienda, en la
//     moneda elegida (movimiento DEVOLUCION ligado, que no se anula aparte);
//     EXTERNO = se reembolsa por otro medio (tarjeta, Pago Móvil) y no toca caja;
//  3. si la venta tiene factura, se emite la nota de crédito por lo devuelto.
// No revierte puntos de fidelización ni usos de cupón.
import { sql } from '../db/sqlserver.js';
import { calcularDevolucion, centavos } from '../domain/fiscal.mjs';
import { emitirNotaCredito, tasaDeLaVenta } from './factura.service.js';

const falla = (statusCode, mensaje) => Object.assign(new Error(mensaje), { statusCode });
const req = (tx, { idBranch, idCuenta }) => new sql.Request(tx)
  .input('idBranch', sql.BigInt, idBranch)
  .input('idCuenta', sql.BigInt, idCuenta);

async function siguiente(tx, ids, tabla, campo) {
  const r = await req(tx, ids).query(`SELECT ISNULL(MAX(${campo}), 0) + 1 AS id FROM ${tabla} WITH (UPDLOCK, HOLDLOCK)
                                      WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
  return r.recordset[0].id;
}

// Lo vendido y lo ya devuelto de un pedido (para validar y para la pantalla).
export async function estadoDevoluciones(ejecutor, ids, idPedido) {
  const r = await req(ejecutor, ids).input('idPedido', sql.BigInt, idPedido)
    .query(`SELECT d.idDetalle, d.idProducto, d.Cantidad, d.PrecioUnitario, pr.Nombre AS NombreProducto,
                   ISNULL((SELECT SUM(dd.Cantidad) FROM VIDA_DEVOLUCIONES_DETALLE dd
                           JOIN VIDA_DEVOLUCIONES dv ON dv.idBranch=dd.idBranch AND dv.idCuenta=dd.idCuenta AND dv.idDevolucion=dd.idDevolucion
                           WHERE dd.idBranch=d.idBranch AND dd.idCuenta=d.idCuenta AND dv.idPedido=d.idPedido
                             AND dd.idDetalle=d.idDetalle), 0) AS CantidadDevuelta
            FROM VIDA_PEDIDOS_DETALLE d
            LEFT JOIN VIDA_INVENTARIO_PRODUCTOS pr ON pr.idBranch=d.idBranch AND pr.idCuenta=d.idCuenta AND pr.idProducto=d.idProducto
            WHERE d.idBranch=@idBranch AND d.idCuenta=@idCuenta AND d.idPedido=@idPedido
            ORDER BY d.idDetalle;
            SELECT idDevolucion, MontoUSD, MetodoReembolso, Moneda, MontoReembolso, idNotaCredito, Motivo, FechaAlta, UsuAlta
            FROM VIDA_DEVOLUCIONES WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido
            ORDER BY idDevolucion`);
  return { lineas: r.recordsets[0], devoluciones: r.recordsets[1] };
}

export async function devolverVenta(tx, actor, { idPedido, items, motivo, metodoReembolso, moneda }, autorizar = async () => true) {
  const ids = { idBranch: actor.idBranch, idCuenta: actor.idCuenta };
  const Motivo = String(motivo ?? '').trim().slice(0, 300);
  if (Motivo.length < 5) throw falla(422, 'Indica el motivo de la devolución');
  if (!['EFECTIVO', 'EXTERNO'].includes(metodoReembolso)) throw falla(422, 'Indica cómo se reembolsa: efectivo de caja u otro medio');
  if (metodoReembolso === 'EFECTIVO' && !['USD', 'VES'].includes(moneda)) throw falla(422, 'Indica la moneda del reembolso');

  const pr = await req(tx, ids).input('idPedido', sql.BigInt, idPedido)
    .query(`SELECT idPedido, idPuntoVenta, Status, TotalUSD, PagoMonedaJSON, FechaAlta
            FROM VIDA_PEDIDOS WITH (UPDLOCK, HOLDLOCK)
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);
  const pedido = pr.recordset[0];
  if (!pedido || !(await autorizar(pedido.idPuntoVenta))) throw falla(404, 'Venta no encontrada');
  if (pedido.Status !== 'ENTREGADO') throw falla(422, 'Solo se devuelven ventas entregadas');

  const { lineas, devoluciones } = await estadoDevoluciones(tx, ids, idPedido);
  let dev;
  try {
    dev = calcularDevolucion({
      lineas, totalUSD: Number(pedido.TotalUSD), devolver: items,
      previo: Object.fromEntries(lineas.map(l => [l.idDetalle, Number(l.CantidadDevuelta)])),
      montoPrevioUSD: devoluciones.reduce((s, d) => s + Number(d.MontoUSD), 0),
    });
  } catch (e) { throw falla(422, e.message); }

  // Factura: la devolución se acredita con nota de crédito; exige el número
  // de control (la NC debe citarlo).
  const fr = await req(tx, ids).input('idPedido', sql.BigInt, idPedido)
    .query(`SELECT idFactura, Status FROM VIDA_FACTURAS WHERE idBranch=@idBranch AND idCuenta=@idCuenta
            AND idPedido=@idPedido AND TipoDocumento='FACTURA'`);
  const factura = fr.recordset[0];
  if (factura?.Status === 'PENDIENTE_CONTROL')
    throw falla(422, 'La venta tiene factura sin número de control: regístralo antes de devolver');

  // Una venta con descuento total no tiene nada que reembolsar
  if (!(dev.MontoUSD > 0)) metodoReembolso = 'EXTERNO';
  const { tasa } = await tasaDeLaVenta(tx, ids, pedido);
  const idDevolucion = await siguiente(tx, ids, 'VIDA_DEVOLUCIONES', 'idDevolucion');

  // Reembolso en efectivo desde la caja abierta de la tienda
  let caja = { idTurno: null, idMovimiento: null, monto: null };
  if (metodoReembolso === 'EFECTIVO') {
    const tr = await req(tx, ids).input('pv', sql.BigInt, pedido.idPuntoVenta)
      .query(`SELECT TOP 1 idTurno FROM VIDA_CAJA_TURNOS WITH (UPDLOCK, HOLDLOCK)
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@pv AND Status='ABIERTO'
              ORDER BY FechaApertura DESC`);
    if (!tr.recordset[0]) throw falla(409, 'Abre la caja de la tienda para reembolsar en efectivo');
    const monto = moneda === 'USD' ? dev.MontoUSD : centavos(dev.MontoUSD * tasa);
    const ur = await req(tx, ids).input('u', sql.BigInt, actor.idUsuario)
      .query(`SELECT TOP 1 LTRIM(RTRIM(Nombre + ' ' + ISNULL(Apellidos,''))) AS n FROM VIDA_CUENTA_USUARIOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idUsuario=@u`);
    const idMovimiento = await siguiente(tx, ids, 'VIDA_CAJA_MOVIMIENTOS', 'idMovimiento');
    await req(tx, ids)
      .input('idMovimiento', sql.BigInt, idMovimiento).input('idTurno', sql.BigInt, tr.recordset[0].idTurno)
      .input('pv', sql.BigInt, pedido.idPuntoVenta).input('Moneda', sql.VarChar(3), moneda)
      .input('Monto', sql.Decimal(18, 2), monto)
      .input('Motivo', sql.VarChar(300), `Devolución venta #${idPedido}: ${Motivo}`.slice(0, 300))
      .input('u', sql.BigInt, actor.idUsuario).input('nombre', sql.VarChar(200), ur.recordset[0]?.n || null)
      .input('usu', sql.VarChar(10), String(actor.idUsuario).slice(0, 10)).input('dev', sql.BigInt, idDevolucion)
      .query(`INSERT INTO VIDA_CAJA_MOVIMIENTOS
                (idBranch, idCuenta, idMovimiento, idTurno, idPuntoVenta, Tipo, Moneda, Monto, Motivo,
                 idUsuario, NombreUsuario, Status, UsuAlta, FechaAlta, idDevolucion)
              VALUES (@idBranch, @idCuenta, @idMovimiento, @idTurno, @pv, 'DEVOLUCION', @Moneda, @Monto, @Motivo,
                 @u, @nombre, 'ACTIVO', @usu, GETUTCDATE(), @dev)`);
    caja = { idTurno: tr.recordset[0].idTurno, idMovimiento, monto };
  }

  // Inventario: la mercancía vuelve a la tienda
  for (const l of dev.lineas) {
    const sr = await req(tx, ids).input('pv', sql.BigInt, pedido.idPuntoVenta).input('prod', sql.BigInt, l.idProducto)
      .input('q', sql.Decimal(18, 4), l.Cantidad)
      .query(`UPDATE VIDA_INVENTARIO_STOCK WITH (UPDLOCK, HOLDLOCK) SET Cantidad = ISNULL(Cantidad, 0) + @q, FechaMod = GETUTCDATE()
              OUTPUT ISNULL(deleted.Cantidad, 0) AS Antes, inserted.Cantidad AS Despues
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@pv AND idProducto=@prod;
              IF @@ROWCOUNT = 0
                INSERT INTO VIDA_INVENTARIO_STOCK (idBranch, idCuenta, idPuntoVenta, idProducto, Cantidad, FechaAlta)
                OUTPUT CAST(0 AS DECIMAL(18,4)) AS Antes, inserted.Cantidad AS Despues
                VALUES (@idBranch, @idCuenta, @pv, @prod, @q, GETUTCDATE());`);
    const s = sr.recordsets.flat()[0];
    const idMov = await siguiente(tx, ids, 'VIDA_INVENTARIO_MOVIMIENTOS', 'idMovimiento');
    await req(tx, ids)
      .input('idMovimiento', sql.BigInt, idMov).input('pv', sql.BigInt, pedido.idPuntoVenta)
      .input('prod', sql.BigInt, l.idProducto).input('q', sql.Decimal(18, 4), l.Cantidad)
      .input('antes', sql.Decimal(18, 4), Number(s.Antes)).input('despues', sql.Decimal(18, 4), Number(s.Despues))
      .input('Motivo', sql.VarChar(300), `Devolución de venta #${idPedido}`)
      .input('Ref', sql.VarChar(100), `DEV-${idDevolucion}`).input('usu', sql.VarChar(20), String(actor.idUsuario))
      .query(`INSERT INTO VIDA_INVENTARIO_MOVIMIENTOS
                (idBranch, idCuenta, idMovimiento, idPuntoVenta, idProducto, TipoMovimiento, Cantidad,
                 CantidadAntes, CantidadDespues, Motivo, Referencia, UsuAlta)
              VALUES (@idBranch, @idCuenta, @idMovimiento, @pv, @prod, 'ENTRADA', @q, @antes, @despues, @Motivo, @Ref, @usu)`);
  }

  // Nota de crédito por lo devuelto (las líneas de la factura siguen el orden
  // del detalle del pedido)
  let nc = null;
  if (factura) {
    const linea = new Map(lineas.map((l, i) => [String(l.idDetalle), i + 1]));
    nc = await emitirNotaCredito(tx, actor, {
      idFactura: factura.idFactura, motivo: `Devolución: ${Motivo}`,
      lineas: dev.lineas.map(l => ({ Linea: linea.get(String(l.idDetalle)), Cantidad: l.Cantidad })),
    });
  }

  await req(tx, ids)
    .input('id', sql.BigInt, idDevolucion).input('idPedido', sql.BigInt, idPedido)
    .input('pv', sql.BigInt, pedido.idPuntoVenta).input('MontoUSD', sql.Decimal(18, 2), dev.MontoUSD)
    .input('Metodo', sql.VarChar(10), metodoReembolso)
    .input('Moneda', sql.VarChar(3), caja.monto != null ? moneda : null)
    .input('MontoReembolso', sql.Decimal(18, 2), caja.monto).input('Tasa', sql.Decimal(18, 8), tasa)
    .input('idTurno', sql.BigInt, caja.idTurno).input('idMov', sql.BigInt, caja.idMovimiento)
    .input('idNC', sql.BigInt, nc?.idFactura ?? null).input('Motivo', sql.VarChar(300), Motivo)
    .input('usu', sql.VarChar(20), String(actor.idUsuario))
    .query(`INSERT INTO VIDA_DEVOLUCIONES
              (idBranch, idCuenta, idDevolucion, idPedido, idPuntoVenta, MontoUSD, MetodoReembolso, Moneda, MontoReembolso,
               TasaVESporUSD, idTurno, idMovimientoCaja, idNotaCredito, Motivo, UsuAlta)
            VALUES (@idBranch, @idCuenta, @id, @idPedido, @pv, @MontoUSD, @Metodo, @Moneda, @MontoReembolso,
               @Tasa, @idTurno, @idMov, @idNC, @Motivo, @usu)`);
  for (const l of dev.lineas) {
    await req(tx, ids)
      .input('id', sql.BigInt, idDevolucion).input('det', sql.BigInt, l.idDetalle).input('prod', sql.BigInt, l.idProducto)
      .input('q', sql.Decimal(18, 4), l.Cantidad).input('p', sql.Decimal(18, 4), l.PrecioUnitarioUSD)
      .input('m', sql.Decimal(18, 2), l.MontoUSD)
      .query(`INSERT INTO VIDA_DEVOLUCIONES_DETALLE (idBranch, idCuenta, idDevolucion, idDetalle, idProducto, Cantidad, PrecioUnitarioUSD, MontoUSD)
              VALUES (@idBranch, @idCuenta, @id, @det, @prod, @q, @p, @m)`);
  }

  return {
    idDevolucion, idPedido: Number(idPedido), idPuntoVenta: pedido.idPuntoVenta, MontoUSD: dev.MontoUSD, final: dev.final,
    MetodoReembolso: metodoReembolso, Moneda: caja.monto != null ? moneda : null, MontoReembolso: caja.monto,
    idTurno: caja.idTurno, idMovimientoCaja: caja.idMovimiento,
    idNotaCredito: nc?.idFactura ?? null, NumeroNotaCredito: nc?.Numero ?? null,
  };
}
