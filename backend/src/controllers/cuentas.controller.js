// src/controllers/cuentas.controller.js
// Pantalla de Cuentas: consulta de CXP (proveedores) y CXC (sucursales),
// abonos parciales y liquidación. El motor vive en services/cuentas.service.js;
// acá solo va la capa HTTP y el control de alcance.
import { getPool, sql } from '../db/sqlserver.js';
import { registrarAbono, emitirNotaCredito, SELECT_CUENTA, METODOS } from '../services/cuentas.service.js';
import { alcanceCuentas } from '../services/alcance.service.js';
import { registrarAuditoria } from '../services/audit.service.js';

const TIPOS_FILTRO   = ['CXP', 'CXC'];
const STATUS_FILTRO  = ['ABIERTA', 'PARCIAL', 'LIQUIDADA', 'CANCELADA'];

// GET /cuentas?tipo=CXP&status=ABIERTA&vencidas=1&idProveedor=&idPuntoVenta=
export async function listarCuentas(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { tipo, status, vencidas, idProveedor, idPuntoVenta } = request.query || {};

  try {
    const pool = await getPool();
    const alcance = await alcanceCuentas(request.user, pool);

    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta);
    let filtro = ' WHERE c.idBranch=@idBranch AND c.idCuenta=@idCuenta';

    // Un ADMIN de sucursal común solo ve lo que SU tienda le debe a la Matriz.
    // Nunca ve las CXP: la deuda con el proveedor no es asunto suyo.
    if (!alcance.verTodo) {
      req.input('pvPropio', sql.BigInt, alcance.soloCxcDe);
      filtro += ` AND c.Tipo='CXC' AND c.idPuntoVenta=@pvPropio`;
    } else if (tipo && TIPOS_FILTRO.includes(tipo)) {
      req.input('tipo', sql.VarChar(3), tipo);
      filtro += ' AND c.Tipo=@tipo';
    }

    if (status && STATUS_FILTRO.includes(status)) {
      req.input('status', sql.VarChar(20), status);
      filtro += ' AND c.Status=@status';
    }
    if (vencidas === '1' || vencidas === 'true') {
      filtro += ` AND c.Status IN ('ABIERTA','PARCIAL')
                  AND c.FechaVencimiento IS NOT NULL
                  AND c.FechaVencimiento < CAST(GETUTCDATE() AS DATE)`;
    }
    if (idProveedor) {
      req.input('idProveedor', sql.BigInt, BigInt(idProveedor));
      filtro += ' AND c.idProveedor=@idProveedor';
    }
    if (idPuntoVenta && alcance.verTodo) {
      req.input('idPv', sql.BigInt, BigInt(idPuntoVenta));
      filtro += ' AND c.idPuntoVenta=@idPv';
    }

    const r = await req.query(`
      ${SELECT_CUENTA}
      ${filtro}
      ORDER BY CASE WHEN c.Status IN ('ABIERTA','PARCIAL') THEN 0 ELSE 1 END,
               c.FechaVencimiento ASC, c.idDocumento DESC`);

    // Totales del tablero, sobre lo mismo que el usuario puede ver
    const resumen = r.recordset.reduce((acc, c) => {
      const saldo = parseFloat(c.Saldo) || 0;
      if (c.Status === 'ABIERTA' || c.Status === 'PARCIAL') {
        acc[c.Tipo].saldo += saldo;
        acc[c.Tipo].abiertas += 1;
        if (c.Vencida) { acc[c.Tipo].vencido += saldo; acc[c.Tipo].vencidas += 1; }
      }
      return acc;
    }, {
      CXP: { saldo: 0, vencido: 0, abiertas: 0, vencidas: 0 },
      CXC: { saldo: 0, vencido: 0, abiertas: 0, vencidas: 0 },
    });

    return reply.send({ cuentas: r.recordset, resumen, verTodo: alcance.verTodo });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al listar cuentas' });
  }
}

// GET /cuentas/:idDocumento — documento + abonos + de dónde salió
export async function detalleCuenta(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idDocumento } = request.params;

  try {
    const pool = await getPool();
    const alcance = await alcanceCuentas(request.user, pool);

    const r = await pool.request()
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('idDocumento', sql.BigInt, BigInt(idDocumento))
      .query(`${SELECT_CUENTA}
              WHERE c.idBranch=@idBranch AND c.idCuenta=@idCuenta AND c.idDocumento=@idDocumento`);

    const doc = r.recordset[0];
    if (!doc) return reply.code(404).send({ error: 'Cuenta no encontrada' });

    // Mismo alcance que el listado: sin esto, un ADMIN de sucursal podría leer
    // por id una CXP o la CXC de otra tienda
    if (!alcance.verTodo &&
        (doc.Tipo !== 'CXC' || String(doc.idPuntoVenta) !== String(alcance.soloCxcDe))) {
      return reply.code(403).send({ error: 'No tienes acceso a esta cuenta' });
    }

    const abonosR = await pool.request()
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('idDocumento', sql.BigInt, BigInt(idDocumento))
      .query(`SELECT idAbono, MontoUSD, FechaAbono, MetodoPago, Referencia, Notas, UsuAlta, FechaAlta
              FROM VIDA_CUENTAS_ABONOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idDocumento=@idDocumento
              ORDER BY FechaAlta ASC, idAbono ASC`);

    const notasR = await pool.request()
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('idDocumento', sql.BigInt, BigInt(idDocumento))
      .query(`SELECT idNota, MontoUSD, Motivo, CancelaCuenta, FechaNota, UsuAlta, FechaAlta
              FROM VIDA_CUENTAS_NOTAS_CREDITO
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idDocumento=@idDocumento
              ORDER BY FechaAlta ASC, idNota ASC`);

    return reply.send({ cuenta: doc, abonos: abonosR.recordset, notasCredito: notasR.recordset });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener la cuenta' });
  }
}

// POST /cuentas/:idDocumento/abonos  { MontoUSD | liquidar, MetodoPago, Referencia, Notas }
export async function abonarCuenta(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idDocumento } = request.params;
  const b = request.body || {};

  try {
    const pool = await getPool();

    // Cobrar y pagar es operación de la Matriz: el ADMIN de una sucursal puede
    // VER lo que debe, pero no registrar su propio pago.
    const alcance = await alcanceCuentas(request.user, pool);
    if (!alcance.verTodo) {
      return reply.code(403).send({ error: 'Solo la Matriz registra abonos', codigo: 'NO_ES_MATRIZ' });
    }

    const res = await registrarAbono(pool, {
      idBranch, idCuenta,
      idDocumento: BigInt(idDocumento),
      MontoUSD:    b.MontoUSD,
      liquidar:    b.liquidar === true || b.liquidar === 'true',
      MetodoPago:  b.MetodoPago || null,
      Referencia:  b.Referencia || null,
      Notas:       b.Notas || null,
      UsuAlta:     idUsuario,
    });

    if (!res.ok) return reply.code(res.code).send({ error: res.error, saldo: res.saldo });

    registrarAuditoria(pool, {
      idBranch, idCuenta,
      entityType: 'CUENTA', entityId: idDocumento,
      accion: res.Status === 'LIQUIDADA' ? 'LIQUIDADA' : 'ABONO',
      actor: `USR:${idUsuario}`,
      data: { monto: res.monto, saldo: res.saldo, metodo: b.MetodoPago || null, referencia: b.Referencia || null },
    }, request.log).catch(() => { /* la auditoría no bloquea el abono */ });

    return reply.code(201).send(res);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al registrar el abono' });
  }
}

// POST /cuentas/:idDocumento/abonos/:idAbono/reversar
// Un abono no se borra: se compensa con otro en negativo (nota de crédito).
export async function reversarAbono(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idDocumento, idAbono } = request.params;
  const motivo = String(request.body?.motivo || '').trim().slice(0, 300);

  if (motivo.length < 3) return reply.code(400).send({ error: 'Indicá el motivo del reverso' });

  try {
    const pool = await getPool();
    const alcance = await alcanceCuentas(request.user, pool);
    if (!alcance.verTodo) {
      return reply.code(403).send({ error: 'Solo la Matriz reversa abonos', codigo: 'NO_ES_MATRIZ' });
    }

    const origR = await pool.request()
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('idDocumento', sql.BigInt, BigInt(idDocumento))
      .input('idAbono',     sql.BigInt, BigInt(idAbono))
      .query(`SELECT MontoUSD FROM VIDA_CUENTAS_ABONOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND idDocumento=@idDocumento AND idAbono=@idAbono`);
    const orig = origR.recordset[0];
    if (!orig) return reply.code(404).send({ error: 'Abono no encontrado' });
    if (parseFloat(orig.MontoUSD) <= 0)
      return reply.code(409).send({ error: 'Ese movimiento ya es un reverso' });

    const res = await registrarAbono(pool, {
      idBranch, idCuenta,
      idDocumento: BigInt(idDocumento),
      MontoUSD: -parseFloat(orig.MontoUSD),
      permitirNegativo: true,
      Notas: `Reverso del abono #${idAbono}: ${motivo}`,
      UsuAlta: idUsuario,
    });

    if (!res.ok) return reply.code(res.code).send({ error: res.error });

    registrarAuditoria(pool, {
      idBranch, idCuenta,
      entityType: 'CUENTA', entityId: idDocumento,
      accion: 'REVERSO_ABONO', actor: `USR:${idUsuario}`,
      data: { idAbonoOriginal: idAbono, monto: res.monto, motivo },
    }, request.log).catch(() => {});

    return reply.code(201).send(res);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al reversar el abono' });
  }
}

// POST /cuentas/:idDocumento/nota-credito
//   { cancelarTotal, MontoUSD, motivo, reintegrar }
//
// Cancela una cuenta que ya tenía abonos, o le rebaja una parte. Es la salida
// para el traspaso que se revierte después de que la sucursal pagó: la deuda
// pendiente se perdona y, si `reintegrar`, lo ya cobrado se devuelve.
export async function notaCreditoCuenta(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idDocumento } = request.params;
  const b = request.body || {};

  try {
    const pool = await getPool();

    const alcance = await alcanceCuentas(request.user, pool);
    if (!alcance.verTodo) {
      return reply.code(403).send({ error: 'Solo la Matriz emite notas de crédito', codigo: 'NO_ES_MATRIZ' });
    }

    const res = await emitirNotaCredito(pool, {
      idBranch, idCuenta,
      idDocumento:   BigInt(idDocumento),
      MontoUSD:      b.MontoUSD,
      cancelarTotal: b.cancelarTotal === true || b.cancelarTotal === 'true',
      Motivo:        b.motivo,
      reintegrar:    b.reintegrar === true || b.reintegrar === 'true',
      UsuAlta:       idUsuario,
    });

    if (!res.ok) return reply.code(res.code).send({ error: res.error, saldo: res.saldo });

    registrarAuditoria(pool, {
      idBranch, idCuenta,
      entityType: 'CUENTA', entityId: idDocumento,
      accion: res.Status === 'CANCELADA' ? 'CANCELADA_NC' : 'NOTA_CREDITO',
      actor: `USR:${idUsuario}`,
      data: {
        idNota: res.idNota, monto: res.monto, reintegrado: res.reintegrado,
        motivo: String(b.motivo || '').trim().slice(0, 300), saldo: res.saldo,
      },
    }, request.log).catch(() => { /* la auditoría no bloquea la nota */ });

    return reply.code(201).send(res);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al emitir la nota de crédito' });
  }
}

// GET /cuentas/metodos-pago — para el selector del panel
export async function metodosPago(_request, reply) {
  return reply.send(METODOS);
}
