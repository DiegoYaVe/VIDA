// src/controllers/facturas.controller.js
// Factura fiscal por tienda: datos del emisor, emisión, número de control,
// notas de crédito y libro de ventas.
import { getPool, sql } from '../db/sqlserver.js';
import { registrarAuditoria } from '../services/audit.service.js';
import { tiendaEnAlcance, filtroTiendasRed, ROLES_TIENDA } from '../services/alcance.service.js';
import {
  emitirFactura, emitirNotaCredito, registrarControl, obtenerFactura,
  porcentajesIVA, validarDatosFiscales,
} from '../services/factura.service.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Datos fiscales: solo el SUPER_ADMIN o el ADMIN de esa misma tienda.
function puedeEditarFiscal(user, idPuntoVenta) {
  return user.TipoUsuario === 'SUPER_ADMIN'
    || (user.TipoUsuario === 'ADMIN' && String(user.idPuntoVenta) === String(idPuntoVenta));
}

// Ejecuta `fn(tx)` en una transacción y traduce los errores de negocio.
export async function enTransaccion(request, reply, fn, codigoOk = 200) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const res = await fn(tx, pool);
    await tx.commit();
    return reply.code(codigoOk).send(res);
  } catch (err) {
    try { await tx.rollback(); } catch { /* el trigger ya pudo revertirla */ }
    if (err.statusCode) {
      const { statusCode, message, idFactura } = err;
      return reply.code(statusCode).send({ error: message, ...(idFactura ? { idFactura } : {}) });
    }
    if ([2601, 2627].includes(err.number))
      return reply.code(409).send({ error: 'Otro usuario emitió este documento al mismo tiempo; recarga la página' });
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al procesar el documento fiscal' });
  }
}

export const autorizador = (user, pool) => (pv) => tiendaEnAlcance(user, pv, pool);

// GET /facturas/datos-fiscales/:idPuntoVenta
export async function obtenerDatosFiscales(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idPuntoVenta } = request.params;
  try {
    const pool = await getPool();
    if (!(await tiendaEnAlcance(request.user, idPuntoVenta, pool))) return reply.code(404).send({ error: 'Tienda no encontrada' });
    const r = await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('pv', sql.BigInt, idPuntoVenta)
      .query(`SELECT pv.idPuntoVenta, pv.NomComercial, pv.RIF, pv.RazonSocial, pv.DomicilioFiscal,
                     pv.ModalidadFiscal, pv.ContribuyenteEspecial,
                     (SELECT COUNT(*) FROM VIDA_FACTURAS f WHERE f.idBranch=pv.idBranch AND f.idCuenta=pv.idCuenta
                        AND f.idPuntoVenta=pv.idPuntoVenta) AS Documentos
              FROM VIDA_CUENTA_PUNTOS_VENTA pv
              WHERE pv.idBranch=@b AND pv.idCuenta=@c AND pv.idPuntoVenta=@pv`);
    const t = r.recordset[0];
    if (!t) return reply.code(404).send({ error: 'Tienda no encontrada' });
    return reply.send({ ...t, puedeEditar: puedeEditarFiscal(request.user, idPuntoVenta), alicuotas: await porcentajesIVA(pool) });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al leer los datos fiscales' });
  }
}

// PUT /facturas/datos-fiscales/:idPuntoVenta
export async function guardarDatosFiscales(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idPuntoVenta } = request.params;
  if (!puedeEditarFiscal(request.user, idPuntoVenta))
    return reply.code(403).send({ error: 'Solo el SUPER_ADMIN o el administrador de la tienda editan sus datos fiscales' });
  let d;
  try { d = validarDatosFiscales(request.body || {}); }
  catch (err) { return reply.code(422).send({ error: err.message }); }

  return enTransaccion(request, reply, async (tx) => {
    const r = await new sql.Request(tx)
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('pv', sql.BigInt, idPuntoVenta)
      .query(`SELECT pv.RIF, (SELECT COUNT(*) FROM VIDA_FACTURAS f WHERE f.idBranch=pv.idBranch AND f.idCuenta=pv.idCuenta
                                AND f.idPuntoVenta=pv.idPuntoVenta) AS Documentos
              FROM VIDA_CUENTA_PUNTOS_VENTA pv WITH (UPDLOCK)
              WHERE pv.idBranch=@b AND pv.idCuenta=@c AND pv.idPuntoVenta=@pv`);
    const actual = r.recordset[0];
    if (!actual) throw Object.assign(new Error('Tienda no encontrada'), { statusCode: 404 });
    // La numeración pertenece al RIF: con documentos emitidos, el RIF no cambia
    // (una tienda con otro RIF es otro contribuyente: se da de alta aparte).
    if (actual.Documentos > 0 && actual.RIF && actual.RIF !== d.RIF)
      throw Object.assign(new Error('La tienda ya emitió documentos fiscales con este RIF; no se puede cambiar'), { statusCode: 409 });
    await new sql.Request(tx)
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('pv', sql.BigInt, idPuntoVenta)
      .input('RIF', sql.VarChar(12), d.RIF).input('RazonSocial', sql.VarChar(200), d.RazonSocial)
      .input('Domicilio', sql.VarChar(500), d.DomicilioFiscal).input('Modalidad', sql.VarChar(20), d.ModalidadFiscal)
      .input('Especial', sql.Bit, d.ContribuyenteEspecial ? 1 : 0).input('usu', sql.VarChar(20), String(idUsuario))
      .query(`UPDATE VIDA_CUENTA_PUNTOS_VENTA SET RIF=@RIF, RazonSocial=@RazonSocial, DomicilioFiscal=@Domicilio,
                ModalidadFiscal=@Modalidad, ContribuyenteEspecial=@Especial, FechaMod=GETUTCDATE(), UsuMod=@usu
              WHERE idBranch=@b AND idCuenta=@c AND idPuntoVenta=@pv`);
    await registrarAuditoria(tx, { idBranch, idCuenta, entityType: 'PUNTO_VENTA', entityId: idPuntoVenta,
      accion: 'DATOS_FISCALES', actor: idUsuario, data: d }, request.log);
    return { message: 'Datos fiscales guardados', ...d };
  });
}

// POST /facturas  { idPedido, Receptor: { Documento, Nombre, Domicilio } }
export async function crearFactura(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idPedido, Receptor } = request.body || {};
  if (!idPedido) return reply.code(400).send({ error: 'idPedido es requerido' });
  return enTransaccion(request, reply, async (tx, pool) => {
    const res = await emitirFactura(tx, request.user, { idPedido, receptor: Receptor }, autorizador(request.user, pool));
    await registrarAuditoria(tx, { idBranch, idCuenta, entityType: 'FACTURA', entityId: res.idFactura,
      accion: 'FACTURA_EMITIDA', actor: idUsuario, data: { idPedido: Number(idPedido), ...res } }, request.log);
    return res;
  }, 201);
}

// POST /facturas/:idFactura/control  { NumeroControl, SerialMaquina }
export async function registrarNumeroControl(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  return enTransaccion(request, reply, async (tx, pool) => {
    const res = await registrarControl(tx, request.user, { idFactura: request.params.idFactura, ...(request.body || {}) },
      autorizador(request.user, pool));
    await registrarAuditoria(tx, { idBranch, idCuenta, entityType: 'FACTURA', entityId: res.idFactura,
      accion: 'FACTURA_CONTROL', actor: idUsuario, data: res }, request.log);
    return res;
  });
}

// POST /facturas/:idFactura/nota-credito  { Motivo }
export async function crearNotaCredito(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  return enTransaccion(request, reply, async (tx, pool) => {
    const res = await emitirNotaCredito(tx, request.user, { idFactura: request.params.idFactura, motivo: request.body?.Motivo, lineas: request.body?.Lineas },
      autorizador(request.user, pool));
    await registrarAuditoria(tx, { idBranch, idCuenta, entityType: 'FACTURA', entityId: res.idFactura,
      accion: 'NOTA_CREDITO_EMITIDA', actor: idUsuario, data: { ...res, Motivo: request.body?.Motivo } }, request.log);
    return res;
  }, 201);
}

// GET /facturas/:idFactura
export async function verFactura(request, reply) {
  try {
    const pool = await getPool();
    const f = await obtenerFactura(pool, request.user, request.params.idFactura);
    if (!f || !(await tiendaEnAlcance(request.user, f.idPuntoVenta, pool))) return reply.code(404).send({ error: 'Factura no encontrada' });
    return reply.send(f);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al leer la factura' });
  }
}

// GET /facturas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&idPuntoVenta=
// Libro de ventas: facturas y notas de crédito por día fiscal (Caracas).
export async function listarFacturas(request, reply) {
  const { idBranch, idCuenta, TipoUsuario, idPuntoVenta: pvUsuario } = request.user;
  const { desde, hasta } = request.query;
  if (!FECHA.test(desde || '') || !FECHA.test(hasta || '') || desde > hasta)
    return reply.code(400).send({ error: 'Indica un rango de fechas válido (desde / hasta)' });
  if ((new Date(hasta) - new Date(desde)) / 86400000 > 366)
    return reply.code(400).send({ error: 'El rango máximo es de un año' });
  const esTienda = ROLES_TIENDA.includes(TipoUsuario);
  const idPuntoVenta = esTienda ? pvUsuario : request.query.idPuntoVenta;
  try {
    const pool = await getPool();
    const r = pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('desde', sql.Date, desde).input('hasta', sql.Date, hasta);
    let filtro = '';
    if (idPuntoVenta) { r.input('pv', sql.BigInt, idPuntoVenta); filtro += ' AND f.idPuntoVenta=@pv'; }
    if (!esTienda) filtro += filtroTiendasRed(request.user, 'f.idPuntoVenta', r);
    const q = await r.query(`
      SELECT TOP (20001) f.idFactura, f.idPuntoVenta, pv.NomComercial AS NombreTienda, f.idPedido, f.TipoDocumento,
             f.Numero, f.NumeroControl, f.SerialMaquina, f.Status, f.Modalidad, f.FechaEmision, f.FechaFiscal,
             f.EmisorRIF, f.ReceptorDocumento, f.ReceptorNombre, f.TasaVESporUSD,
             f.BaseGeneralVES, f.IVAGeneralVES, f.PctGeneral, f.BaseReducidaVES, f.IVAReducidaVES, f.PctReducida,
             f.ExentoVES, f.TotalVES, f.IGTFBaseVES, f.IGTFVES, f.TotalPagarVES, f.TotalUSD,
             a.Numero AS NumeroAfectada, a.NumeroControl AS ControlAfectada
      FROM VIDA_FACTURAS f
      LEFT JOIN VIDA_FACTURAS a ON a.idBranch=f.idBranch AND a.idCuenta=f.idCuenta AND a.idFactura=f.idFacturaAfectada
      LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv ON pv.idBranch=f.idBranch AND pv.idCuenta=f.idCuenta AND pv.idPuntoVenta=f.idPuntoVenta
      WHERE f.idBranch=@idBranch AND f.idCuenta=@idCuenta AND f.FechaFiscal BETWEEN @desde AND @hasta ${filtro}
      ORDER BY f.idPuntoVenta, f.FechaFiscal, f.TipoDocumento, f.Numero`);
    const filas = q.recordset;
    if (filas.length > 20000) return reply.code(422).send({ error: 'Demasiados documentos: acota el rango o la tienda' });
    // En el libro las notas de crédito restan
    const signo = f => (f.TipoDocumento === 'NOTA_CREDITO' ? -1 : 1);
    const campos = ['BaseGeneralVES', 'IVAGeneralVES', 'BaseReducidaVES', 'IVAReducidaVES', 'ExentoVES', 'TotalVES', 'IGTFVES', 'TotalPagarVES', 'TotalUSD'];
    const totales = Object.fromEntries(campos.map(c => [c, Math.round(filas.reduce((s, f) => s + signo(f) * Number(f[c]), 0) * 100) / 100]));
    totales.Documentos = filas.length;
    totales.PendientesControl = filas.filter(f => f.Status === 'PENDIENTE_CONTROL').length;
    return reply.send({ filas, totales });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al listar las facturas' });
  }
}
