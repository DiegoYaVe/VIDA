// src/services/factura.service.js
// Emisión de facturas y notas de crédito. Cada tienda es su propio emisor (su
// RIF, su numeración). Las funciones que escriben reciben una transacción
// abierta: el llamador confirma o revierte.
//
// El número de control lo asigna la máquina fiscal o la imprenta digital
// autorizada (Prov. SNAT/2024/000102); mientras no llegue, el documento queda
// PENDIENTE_CONTROL y no es válido como factura fiscal.
import { sql } from '../db/sqlserver.js';
import {
  desglosarFactura, normalizarDocumentoReceptor, pagoEnDivisasUSD, calcularNotaCredito,
  pedidoFacturable, validarDatosFiscales,
} from '../domain/fiscal.mjs';

const falla = (statusCode, mensaje, extra = {}) => Object.assign(new Error(mensaje), { statusCode, ...extra });
const req = (tx, { idBranch, idCuenta }) => new sql.Request(tx)
  .input('idBranch', sql.BigInt, idBranch)
  .input('idCuenta', sql.BigInt, idCuenta);

export async function porcentajesIVA(ejecutor) {
  const r = await new sql.Request(ejecutor).query('SELECT Codigo, Porcentaje FROM VIDA_FISCAL_ALICUOTAS');
  return Object.fromEntries(r.recordset.map(a => [a.Codigo, Number(a.Porcentaje)]));
}

async function siguienteNumero(tx, ids, idPuntoVenta, tipo) {
  const r = await req(tx, ids)
    .input('pv', sql.BigInt, idPuntoVenta).input('tipo', sql.VarChar(12), tipo)
    .query(`UPDATE VIDA_FACTURAS_CONSECUTIVOS WITH (UPDLOCK, HOLDLOCK) SET Ultimo = Ultimo + 1
            OUTPUT inserted.Ultimo
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@pv AND TipoDocumento=@tipo;
            IF @@ROWCOUNT = 0
              INSERT INTO VIDA_FACTURAS_CONSECUTIVOS (idBranch, idCuenta, idPuntoVenta, TipoDocumento, Ultimo)
              OUTPUT inserted.Ultimo
              VALUES (@idBranch, @idCuenta, @pv, @tipo, 1);`);
  return r.recordsets.flat()[0].Ultimo;
}

async function siguienteId(tx, ids) {
  const r = await req(tx, ids).query(`SELECT ISNULL(MAX(idFactura), 0) + 1 AS id FROM VIDA_FACTURAS WITH (UPDLOCK, HOLDLOCK)
                                      WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
  return r.recordset[0].id;
}

// Tasa de la operación: la que quedó fija al cobrar; si la venta es anterior a
// la multimoneda, la tasa BCV vigente el día (Caracas) de la venta.
export async function tasaDeLaVenta(tx, ids, pedido) {
  const pago = JSON.parse(pedido.PagoMonedaJSON || 'null');
  if (Number(pago?.TasaVESporUSD) > 0)
    return { tasa: Number(pago.TasaVESporUSD), fuente: pago.Fuente ?? null, fecha: pago.FechaTasa ?? null };
  const r = await req(tx, ids).input('fecha', sql.DateTime, pedido.FechaAlta)
    .query(`SELECT TOP 1 VESporUSD, Fuente, FechaValor FROM VIDA_TASAS_CAMBIO
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta
              AND FechaValor <= CAST(DATEADD(HOUR, -4, @fecha) AS DATE)
            ORDER BY FechaValor DESC, idTasa DESC`);
  const t = r.recordset[0];
  if (!t) throw falla(422, 'No hay tasa BCV registrada para la fecha de la venta');
  return { tasa: Number(t.VESporUSD), fuente: t.Fuente, fecha: t.FechaValor };
}

function validarReceptor(receptor) {
  const Documento = normalizarDocumentoReceptor(receptor?.Documento);
  const Nombre = String(receptor?.Nombre ?? '').trim().slice(0, 200);
  if (Nombre.length < 2) throw falla(422, 'Indica el nombre o razón social del cliente');
  const Domicilio = String(receptor?.Domicilio ?? '').trim().slice(0, 500) || null;
  return { Documento, Nombre, Domicilio };
}

async function insertarDocumento(tx, ids, cab, lineas) {
  const r = req(tx, ids);
  const tipos = {
    idFactura: sql.BigInt, idPuntoVenta: sql.BigInt, idPedido: sql.BigInt, TipoDocumento: sql.VarChar(12),
    Numero: sql.Int, idFacturaAfectada: sql.BigInt, Motivo: sql.VarChar(300), Modalidad: sql.VarChar(20),
    EmisorRIF: sql.VarChar(12), EmisorRazonSocial: sql.VarChar(200), EmisorDomicilio: sql.VarChar(500),
    EmisorContribuyenteEspecial: sql.Bit, ReceptorDocumento: sql.VarChar(12), ReceptorNombre: sql.VarChar(200),
    ReceptorDomicilio: sql.VarChar(500), FechaOperacion: sql.DateTime, TasaVESporUSD: sql.Decimal(18, 8),
    FuenteTasa: sql.NVarChar(200), FechaTasa: sql.Date, UsuAlta: sql.VarChar(20),
  };
  const montos = ['SubtotalVES', 'DescuentoVES', 'BaseGeneralVES', 'IVAGeneralVES', 'BaseReducidaVES', 'IVAReducidaVES',
    'ExentoVES', 'TotalVES', 'IGTFBaseVES', 'IGTFVES', 'TotalPagarVES', 'TotalUSD'];
  for (const [k, t] of Object.entries(tipos)) r.input(k, t, cab[k] ?? null);
  for (const k of montos) r.input(k, sql.Decimal(18, 2), cab[k]);
  r.input('PctGeneral', sql.Decimal(5, 2), cab.PctGeneral).input('PctReducida', sql.Decimal(5, 2), cab.PctReducida);
  const cols = [...Object.keys(tipos), ...montos, 'PctGeneral', 'PctReducida'];
  await r.query(`INSERT INTO VIDA_FACTURAS (idBranch, idCuenta, ${cols.join(', ')}, FechaFiscal)
                 VALUES (@idBranch, @idCuenta, ${cols.map(c => '@' + c).join(', ')}, CAST(DATEADD(HOUR, -4, GETUTCDATE()) AS DATE))`);
  for (const l of lineas) {
    await req(tx, ids)
      .input('idFactura', sql.BigInt, cab.idFactura).input('Linea', sql.Int, l.Linea)
      .input('idProducto', sql.BigInt, l.idProducto).input('Descripcion', sql.VarChar(200), l.Descripcion)
      .input('Cantidad', sql.Decimal(18, 4), l.Cantidad).input('PrecioUnitarioVES', sql.Decimal(18, 2), l.PrecioUnitarioVES)
      .input('Alicuota', sql.VarChar(10), l.Alicuota).input('PorcentajeIVA', sql.Decimal(5, 2), l.PorcentajeIVA)
      .input('TotalVES', sql.Decimal(18, 2), l.TotalVES).input('LineaAfectada', sql.Int, l.LineaAfectada ?? null)
      .query(`INSERT INTO VIDA_FACTURAS_DETALLE
                (idBranch, idCuenta, idFactura, Linea, idProducto, Descripcion, Cantidad, PrecioUnitarioVES, Alicuota, PorcentajeIVA, TotalVES, LineaAfectada)
              VALUES (@idBranch, @idCuenta, @idFactura, @Linea, @idProducto, @Descripcion, @Cantidad, @PrecioUnitarioVES, @Alicuota, @PorcentajeIVA, @TotalVES, @LineaAfectada)`);
  }
}

// Factura de un pedido. `autorizar(idPuntoVenta)` decide si el usuario puede
// facturar en esa tienda (alcance); se llama con el pedido ya bloqueado.
export async function emitirFactura(tx, actor, { idPedido, receptor }, autorizar = async () => true) {
  const ids = { idBranch: actor.idBranch, idCuenta: actor.idCuenta };
  const pr = await req(tx, ids).input('idPedido', sql.BigInt, idPedido)
    .query(`SELECT idPedido, idPuntoVenta, Status, StatusPago, TotalUSD, PagoMonedaJSON, FechaAlta
            FROM VIDA_PEDIDOS WITH (UPDLOCK, HOLDLOCK)
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);
  const pedido = pr.recordset[0];
  if (!pedido || !(await autorizar(pedido.idPuntoVenta))) throw falla(404, 'Pedido no encontrado');
  const motivo = pedidoFacturable(pedido);
  if (motivo) throw falla(422, motivo);

  const ya = await req(tx, ids).input('idPedido', sql.BigInt, idPedido)
    .query(`SELECT idFactura FROM VIDA_FACTURAS WHERE idBranch=@idBranch AND idCuenta=@idCuenta
            AND idPedido=@idPedido AND TipoDocumento='FACTURA'`);
  if (ya.recordset[0]) throw falla(409, 'Este pedido ya tiene factura', { idFactura: ya.recordset[0].idFactura });

  const tr = await req(tx, ids).input('pv', sql.BigInt, pedido.idPuntoVenta)
    .query(`SELECT RIF, RazonSocial, DomicilioFiscal, ModalidadFiscal, ContribuyenteEspecial
            FROM VIDA_CUENTA_PUNTOS_VENTA WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@pv`);
  const tienda = tr.recordset[0];
  if (!tienda || tienda.ModalidadFiscal === 'NINGUNA')
    throw falla(422, 'La tienda no está configurada para facturar: registra sus datos fiscales en Sucursales');
  const emisor = validarDatosFiscales(tienda);

  const dr = await req(tx, ids).input('idPedido', sql.BigInt, idPedido)
    .query(`SELECT d.idProducto, d.Cantidad, d.PrecioUnitario, pr.Nombre, pr.AlicuotaIVA
            FROM VIDA_PEDIDOS_DETALLE d
            JOIN VIDA_INVENTARIO_PRODUCTOS pr ON pr.idBranch=d.idBranch AND pr.idCuenta=d.idCuenta AND pr.idProducto=d.idProducto
            WHERE d.idBranch=@idBranch AND d.idCuenta=@idCuenta AND d.idPedido=@idPedido
            ORDER BY d.idDetalle`);
  const rec = validarReceptor(receptor);
  const { tasa, fuente, fecha } = await tasaDeLaVenta(tx, ids, pedido);
  const f = desglosarFactura({
    lineas: dr.recordset.map(d => ({ idProducto: d.idProducto, Descripcion: d.Nombre, Cantidad: Number(d.Cantidad),
      PrecioUnitarioUSD: Number(d.PrecioUnitario), Alicuota: d.AlicuotaIVA })),
    totalUSD: Number(pedido.TotalUSD), tasa, porcentajes: await porcentajesIVA(tx),
    // El IGTF va en la factura solo si se cobró (el POS lo registra en el pago)
    contribuyenteEspecial: emisor.ContribuyenteEspecial && JSON.parse(pedido.PagoMonedaJSON || 'null')?.IGTFBaseUSD != null,
    divisasUSD: pagoEnDivisasUSD(pedido.PagoMonedaJSON, Number(pedido.TotalUSD)),
  });

  const idFactura = await siguienteId(tx, ids);
  const Numero = await siguienteNumero(tx, ids, pedido.idPuntoVenta, 'FACTURA');
  await insertarDocumento(tx, ids, {
    ...f, idFactura, Numero, idPuntoVenta: pedido.idPuntoVenta, idPedido, TipoDocumento: 'FACTURA',
    Modalidad: emisor.ModalidadFiscal, EmisorRIF: emisor.RIF, EmisorRazonSocial: emisor.RazonSocial,
    EmisorDomicilio: emisor.DomicilioFiscal, EmisorContribuyenteEspecial: emisor.ContribuyenteEspecial,
    ReceptorDocumento: rec.Documento, ReceptorNombre: rec.Nombre, ReceptorDomicilio: rec.Domicilio,
    FechaOperacion: pedido.FechaAlta, FuenteTasa: fuente, FechaTasa: fecha, UsuAlta: String(actor.idUsuario),
  }, f.lineas);
  return { idFactura, Numero, idPuntoVenta: pedido.idPuntoVenta, TotalVES: f.TotalVES, Modalidad: emisor.ModalidadFiscal };
}

// Nota de crédito sobre una factura ya emitida (con número de control).
// `lineas`: [{ Linea, Cantidad }] de la factura; vacío = todo lo que falta por
// acreditar. Una factura admite varias notas parciales, nunca más de lo
// facturado. Devuelve también `final` (la factura quedó acreditada completa).
export async function emitirNotaCredito(tx, actor, { idFactura, motivo, lineas }, autorizar = async () => true) {
  const ids = { idBranch: actor.idBranch, idCuenta: actor.idCuenta };
  const Motivo = String(motivo ?? '').trim().slice(0, 300);
  if (Motivo.length < 5) throw falla(422, 'Indica el motivo de la nota de crédito');
  const fr = await req(tx, ids).input('id', sql.BigInt, idFactura)
    .query(`SELECT * FROM VIDA_FACTURAS WITH (UPDLOCK, HOLDLOCK)
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idFactura=@id`);
  const o = fr.recordset[0];
  if (!o || !(await autorizar(o.idPuntoVenta))) throw falla(404, 'Factura no encontrada');
  if (o.TipoDocumento !== 'FACTURA') throw falla(422, 'Solo se emite nota de crédito sobre una factura');
  if (o.Status !== 'EMITIDA') throw falla(422, 'Registra primero el número de control de la factura');

  const lr = await req(tx, ids).input('id', sql.BigInt, idFactura)
    .query(`SELECT * FROM VIDA_FACTURAS_DETALLE WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idFactura=@id ORDER BY Linea`);
  const pr = await req(tx, ids).input('id', sql.BigInt, idFactura)
    .query(`SELECT * FROM VIDA_FACTURAS WITH (UPDLOCK, HOLDLOCK)
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idFacturaAfectada=@id AND TipoDocumento='NOTA_CREDITO';
            SELECT ISNULL(d.LineaAfectada, d.Linea) AS Linea, SUM(d.Cantidad) AS Cantidad, SUM(d.TotalVES) AS TotalVES
            FROM VIDA_FACTURAS_DETALLE d
            JOIN VIDA_FACTURAS n ON n.idBranch=d.idBranch AND n.idCuenta=d.idCuenta AND n.idFactura=d.idFactura
            WHERE n.idBranch=@idBranch AND n.idCuenta=@idCuenta AND n.idFacturaAfectada=@id AND n.TipoDocumento='NOTA_CREDITO'
            GROUP BY ISNULL(d.LineaAfectada, d.Linea)`);
  const previoLineas = Object.fromEntries(pr.recordsets[1].map(p => [p.Linea, { Cantidad: Number(p.Cantidad), TotalVES: Number(p.TotalVES) }]));
  let nc;
  try {
    nc = calcularNotaCredito({ orig: o, lineas: lr.recordset, devolver: lineas, previas: pr.recordsets[0], previoLineas });
  } catch (e) {
    throw falla(/por completo/.test(e.message) ? 409 : 422, e.message);
  }

  const nuevo = await siguienteId(tx, ids);
  const Numero = await siguienteNumero(tx, ids, o.idPuntoVenta, 'NOTA_CREDITO');
  // Emisor, receptor y tasa de la factura original; montos de lo acreditado
  await insertarDocumento(tx, ids, {
    ...o, ...nc, idFactura: nuevo, Numero, TipoDocumento: 'NOTA_CREDITO', idFacturaAfectada: o.idFactura, Motivo,
    UsuAlta: String(actor.idUsuario),
  }, nc.lineas);
  return { idFactura: nuevo, Numero, idPuntoVenta: o.idPuntoVenta, idFacturaAfectada: o.idFactura, TotalVES: nc.TotalVES, final: nc.final };
}

// Número de control asignado por la máquina fiscal (con su serial) o por la
// imprenta digital. Se registra una sola vez.
export async function registrarControl(tx, actor, { idFactura, NumeroControl, SerialMaquina }, autorizar = async () => true) {
  const ids = { idBranch: actor.idBranch, idCuenta: actor.idCuenta };
  const control = String(NumeroControl ?? '').trim().toUpperCase();
  const serial = String(SerialMaquina ?? '').trim().toUpperCase() || null;
  if (!/^[A-Z0-9][A-Z0-9-]{0,39}$/.test(control)) throw falla(422, 'Número de control inválido');
  if (serial && !/^[A-Z0-9][A-Z0-9-]{0,39}$/.test(serial)) throw falla(422, 'Serial de máquina fiscal inválido');
  const fr = await req(tx, ids).input('id', sql.BigInt, idFactura)
    .query(`SELECT idPuntoVenta, Modalidad, Status, TipoDocumento FROM VIDA_FACTURAS WITH (UPDLOCK, HOLDLOCK)
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idFactura=@id`);
  const f = fr.recordset[0];
  if (!f || !(await autorizar(f.idPuntoVenta))) throw falla(404, 'Factura no encontrada');
  if (f.Status !== 'PENDIENTE_CONTROL') throw falla(409, 'El documento ya tiene número de control');
  if (f.Modalidad === 'MAQUINA_FISCAL' && !serial) throw falla(422, 'Indica el serial de la máquina fiscal');
  const dup = await req(tx, ids).input('pv', sql.BigInt, f.idPuntoVenta).input('tipo', sql.VarChar(12), f.TipoDocumento)
    .input('control', sql.VarChar(40), control).input('serial', sql.VarChar(40), serial)
    .query(`SELECT 1 FROM VIDA_FACTURAS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@pv
            AND TipoDocumento=@tipo AND NumeroControl=@control AND ISNULL(SerialMaquina,'')=ISNULL(@serial,'')`);
  if (dup.recordset[0]) throw falla(409, 'Ese número de control ya está usado en otro documento de la tienda');
  await req(tx, ids).input('id', sql.BigInt, idFactura)
    .input('control', sql.VarChar(40), control).input('serial', sql.VarChar(40), serial)
    .input('usu', sql.VarChar(20), String(actor.idUsuario))
    .query(`UPDATE VIDA_FACTURAS SET Status='EMITIDA', NumeroControl=@control, SerialMaquina=@serial,
              FechaControl=GETUTCDATE(), UsuControl=@usu
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idFactura=@id AND Status='PENDIENTE_CONTROL'`);
  return { idFactura: Number(idFactura), idPuntoVenta: f.idPuntoVenta, NumeroControl: control, SerialMaquina: serial };
}

export async function obtenerFactura(ejecutor, ids, idFactura) {
  const fr = await req(ejecutor, ids).input('id', sql.BigInt, idFactura)
    .query(`SELECT f.*, a.Numero AS NumeroAfectada, a.NumeroControl AS ControlAfectada, a.FechaEmision AS FechaAfectada,
                   pv.NomComercial AS NombreTienda
            FROM VIDA_FACTURAS f
            LEFT JOIN VIDA_FACTURAS a ON a.idBranch=f.idBranch AND a.idCuenta=f.idCuenta AND a.idFactura=f.idFacturaAfectada
            LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv ON pv.idBranch=f.idBranch AND pv.idCuenta=f.idCuenta AND pv.idPuntoVenta=f.idPuntoVenta
            WHERE f.idBranch=@idBranch AND f.idCuenta=@idCuenta AND f.idFactura=@id`);
  const f = fr.recordset[0];
  if (!f) return null;
  const lr = await req(ejecutor, ids).input('id', sql.BigInt, idFactura)
    .query(`SELECT Linea, idProducto, Descripcion, Cantidad, PrecioUnitarioVES, Alicuota, PorcentajeIVA, TotalVES, LineaAfectada
            FROM VIDA_FACTURAS_DETALLE WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idFactura=@id ORDER BY Linea;
            SELECT n.idFactura, n.Numero, n.Status, n.NumeroControl, n.TotalVES, n.FechaEmision, n.Motivo
            FROM VIDA_FACTURAS n WHERE n.idBranch=@idBranch AND n.idCuenta=@idCuenta
              AND n.idFacturaAfectada=@id AND n.TipoDocumento='NOTA_CREDITO' ORDER BY n.Numero;
            SELECT ISNULL(d.LineaAfectada, d.Linea) AS Linea, SUM(d.Cantidad) AS Cantidad
            FROM VIDA_FACTURAS_DETALLE d
            JOIN VIDA_FACTURAS n ON n.idBranch=d.idBranch AND n.idCuenta=d.idCuenta AND n.idFactura=d.idFactura
            WHERE n.idBranch=@idBranch AND n.idCuenta=@idCuenta AND n.idFacturaAfectada=@id AND n.TipoDocumento='NOTA_CREDITO'
            GROUP BY ISNULL(d.LineaAfectada, d.Linea)`);
  const acreditado = Object.fromEntries(lr.recordsets[2].map(a => [a.Linea, Number(a.Cantidad)]));
  const lineas = lr.recordsets[0].map(l => ({ ...l, CantidadAcreditada: acreditado[l.Linea] || 0 }));
  const notasCredito = lr.recordsets[1];
  const acreditadaCompleta = f.TipoDocumento === 'FACTURA' && notasCredito.length > 0
    && lineas.every(l => Number(l.Cantidad) - l.CantidadAcreditada <= 1e-9);
  return { ...f, lineas, notasCredito, acreditadaCompleta };
}

export { validarDatosFiscales };
