// src/controllers/caja.controller.js
import { getPool, sql } from '../db/sqlserver.js';

// ── Helper ──────────────────────────────────────────────────────────────────
async function nextId(pool, tabla, campo, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta',  sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}),0)+1 AS next FROM ${tabla} WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
  return r.recordset[0].next;
}

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN', 'SUPERVISOR'];

function isAdmin(user) {
  return ADMIN_ROLES.includes(user.TipoUsuario);
}

// ── Calcular totales del turno desde VIDA_PEDIDOS ───────────────────────────
async function calcularTotales(pool, idBranch, idCuenta, idPuntoVenta, fechaApertura, fechaCierre) {
  const fechaHasta = fechaCierre || null;

  const req = pool.request()
    .input('idBranch',      sql.BigInt,  idBranch)
    .input('idCuenta',      sql.BigInt,  idCuenta)
    .input('idPuntoVenta',  sql.BigInt,  idPuntoVenta)
    .input('fechaApertura', sql.DateTime, new Date(fechaApertura));

  let fechaCondicion = 'AND p.FechaAlta >= @fechaApertura';
  if (fechaHasta) {
    req.input('fechaHasta', sql.DateTime, new Date(fechaHasta));
    fechaCondicion += ' AND p.FechaAlta <= @fechaHasta';
  } else {
    fechaCondicion += ' AND p.FechaAlta <= GETDATE()';
  }

  const r = await req.query(`
    SELECT
      COUNT(*)                                       AS NumTransacciones,
      ISNULL(SUM(p.TotalUSD), 0)                    AS TotalVentas,
      ISNULL(SUM(CASE WHEN p.MetodoPago IN ('EFECTIVO','MIXTO') THEN ISNULL(p.MontoEfectivo, p.TotalUSD) ELSE 0 END), 0) AS TotalEfectivo,
      ISNULL(SUM(CASE WHEN p.MetodoPago IN ('TARJETA','MIXTO')  THEN ISNULL(p.MontoTarjeta,  0)           ELSE 0 END), 0) AS TotalTarjeta
    FROM VIDA_PEDIDOS p
    WHERE p.idBranch      = @idBranch
      AND p.idCuenta      = @idCuenta
      AND p.idPuntoVenta  = @idPuntoVenta
      AND p.Canal         = 'POS'
      AND p.Status        = 'ENTREGADO'
      ${fechaCondicion}
  `);

  return r.recordset[0];
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /caja/turno-activo
// ══════════════════════════════════════════════════════════════════════════════
export async function turnoActivo(request, reply) {
  const { idBranch, idCuenta, idPuntoVenta: pvJwt, TipoUsuario } = request.user;
  const pvQuery = request.query.idPuntoVenta;

  // Admin puede consultar cualquier PV; cajero usa el suyo del JWT
  const pvId = isAdmin({ TipoUsuario }) && pvQuery ? BigInt(pvQuery) : (pvJwt ? BigInt(pvJwt) : null);

  if (!pvId) {
    return reply.code(400).send({ error: 'Se requiere idPuntoVenta' });
  }

  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch',     sql.BigInt,     idBranch)
      .input('idCuenta',     sql.BigInt,     idCuenta)
      .input('idPuntoVenta', sql.BigInt,     pvId)
      .query(`
        SELECT TOP 1 *
        FROM VIDA_CAJA_TURNOS
        WHERE idBranch     = @idBranch
          AND idCuenta     = @idCuenta
          AND idPuntoVenta = @idPuntoVenta
          AND Status       = 'ABIERTO'
        ORDER BY FechaApertura DESC
      `);

    return reply.send({ turno: r.recordset[0] || null });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al consultar turno activo' });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /caja/apertura
// ══════════════════════════════════════════════════════════════════════════════
export async function abrirCaja(request, reply) {
  const { idBranch, idCuenta, idUsuario, TipoUsuario, idPuntoVenta: pvJwt } = request.user;
  const { MontoApertura = 0, Observaciones = null, idPuntoVenta: pvBody } = request.body || {};

  const pvId = isAdmin({ TipoUsuario }) && pvBody ? BigInt(pvBody) : (pvJwt ? BigInt(pvJwt) : null);

  if (!pvId) {
    return reply.code(400).send({ error: 'Se requiere idPuntoVenta para abrir caja' });
  }

  try {
    const pool = await getPool();

    // Verificar que no haya turno abierto para este PV
    const existe = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idPuntoVenta', sql.BigInt, pvId)
      .query(`
        SELECT TOP 1 idTurno FROM VIDA_CAJA_TURNOS
        WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@idPuntoVenta AND Status='ABIERTO'
      `);

    if (existe.recordset.length > 0) {
      return reply.code(409).send({ error: 'Ya existe un turno abierto para este punto de venta' });
    }

    // Obtener nombre del cajero
    const cajeroR = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idUsuario', sql.BigInt, idUsuario)
      .query(`
        SELECT TOP 1 LTRIM(RTRIM(Nombre + ' ' + ISNULL(Apellidos,''))) AS NombreUsuario
        FROM VIDA_CUENTA_USUARIOS
        WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idUsuario=@idUsuario
      `);

    const NombreUsuario = cajeroR.recordset[0]?.NombreUsuario || null;

    // Obtener nombre de la sucursal/punto de venta
    const pvR = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idPuntoVenta', sql.BigInt, pvId)
      .query(`
        SELECT TOP 1 NomComercial AS NombreSucursal
        FROM VIDA_CUENTA_PUNTOS_VENTA
        WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@idPuntoVenta
      `);

    const NombreSucursal = pvR.recordset[0]?.NombreSucursal || null;

    // Generar ID
    const idTurno = await nextId(pool, 'VIDA_CAJA_TURNOS', 'idTurno', idBranch, idCuenta);

    await pool.request()
      .input('idBranch',      sql.BigInt,       idBranch)
      .input('idCuenta',      sql.BigInt,       idCuenta)
      .input('idTurno',       sql.BigInt,       idTurno)
      .input('idPuntoVenta',  sql.BigInt,       pvId)
      .input('idUsuario',     sql.BigInt,       idUsuario)
      .input('NombreUsuario', sql.VarChar(200), NombreUsuario)
      .input('NombreSucursal',sql.VarChar(200), NombreSucursal)
      .input('MontoApertura', sql.Decimal(18,4),parseFloat(MontoApertura))
      .input('Observaciones', sql.VarChar(500), Observaciones)
      .input('UsuAlta',       sql.VarChar(10),  String(idUsuario).slice(0,10))
      .query(`
        INSERT INTO VIDA_CAJA_TURNOS
          (idBranch, idCuenta, idTurno, idPuntoVenta, idUsuario,
           NombreUsuario, NombreSucursal, MontoApertura,
           Observaciones, Status, UsuAlta, FechaAlta, FechaApertura)
        VALUES
          (@idBranch, @idCuenta, @idTurno, @idPuntoVenta, @idUsuario,
           @NombreUsuario, @NombreSucursal, @MontoApertura,
           @Observaciones, 'ABIERTO', @UsuAlta, GETDATE(), GETDATE())
      `);

    return reply.code(201).send({ idTurno, mensaje: 'Caja abierta correctamente' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al abrir caja' });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /caja/resumen
// ══════════════════════════════════════════════════════════════════════════════
export async function resumenTurno(request, reply) {
  const { idBranch, idCuenta, idPuntoVenta: pvJwt, TipoUsuario } = request.user;
  const { idTurno: idTurnoQ, idPuntoVenta: pvQuery } = request.query;

  const pvId = isAdmin({ TipoUsuario }) && pvQuery ? BigInt(pvQuery) : (pvJwt ? BigInt(pvJwt) : null);

  try {
    const pool = await getPool();

    let turno;

    if (idTurnoQ) {
      const r = await pool.request()
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta)
        .input('idTurno',  sql.BigInt, BigInt(idTurnoQ))
        .query(`
          SELECT TOP 1 * FROM VIDA_CAJA_TURNOS
          WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idTurno=@idTurno
        `);
      turno = r.recordset[0];
    } else if (pvId) {
      const r = await pool.request()
        .input('idBranch',     sql.BigInt, idBranch)
        .input('idCuenta',     sql.BigInt, idCuenta)
        .input('idPuntoVenta', sql.BigInt, pvId)
        .query(`
          SELECT TOP 1 * FROM VIDA_CAJA_TURNOS
          WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@idPuntoVenta AND Status='ABIERTO'
          ORDER BY FechaApertura DESC
        `);
      turno = r.recordset[0];
    }

    if (!turno) {
      return reply.send({ turno: null, ventas: null, pedidos: [] });
    }

    // Calcular totales
    const totales = await calcularTotales(
      pool, idBranch, idCuenta,
      turno.idPuntoVenta, turno.FechaApertura, turno.FechaCierre
    );

    // Últimos 50 pedidos del turno
    const req2 = pool.request()
      .input('idBranch',      sql.BigInt,  idBranch)
      .input('idCuenta',      sql.BigInt,  idCuenta)
      .input('idPuntoVenta',  sql.BigInt,  turno.idPuntoVenta)
      .input('fechaApertura', sql.DateTime, new Date(turno.FechaApertura));

    let fechaCond = 'AND p.FechaAlta >= @fechaApertura';
    if (turno.FechaCierre) {
      req2.input('fechaHasta', sql.DateTime, new Date(turno.FechaCierre));
      fechaCond += ' AND p.FechaAlta <= @fechaHasta';
    } else {
      fechaCond += ' AND p.FechaAlta <= GETDATE()';
    }

    const pedidosR = await req2.query(`
      SELECT TOP 50
        p.idPedido, p.FechaAlta, p.TotalUSD, p.MetodoPago
      FROM VIDA_PEDIDOS p
      WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
        AND p.idPuntoVenta=@idPuntoVenta
        AND p.Canal='POS' AND p.Status='ENTREGADO'
        ${fechaCond}
      ORDER BY p.FechaAlta DESC
    `);

    const efectivoEsperado = parseFloat(turno.MontoApertura) + parseFloat(totales.TotalEfectivo);

    return reply.send({
      turno: {
        idTurno:       turno.idTurno,
        idPuntoVenta:  turno.idPuntoVenta,
        FechaApertura: turno.FechaApertura,
        FechaCierre:   turno.FechaCierre,
        MontoApertura: turno.MontoApertura,
        NombreUsuario: turno.NombreUsuario,
        NombreSucursal:turno.NombreSucursal,
        Status:        turno.Status,
      },
      ventas: {
        TotalVentas:      totales.TotalVentas,
        TotalEfectivo:    totales.TotalEfectivo,
        TotalTarjeta:     totales.TotalTarjeta,
        NumTransacciones: totales.NumTransacciones,
      },
      efectivoEsperado,
      pedidos: pedidosR.recordset,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener resumen del turno' });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /caja/cierre
// ══════════════════════════════════════════════════════════════════════════════
export async function cerrarCaja(request, reply) {
  const { idBranch, idCuenta, idPuntoVenta: pvJwt, TipoUsuario } = request.user;
  const { idTurno, MontoCierre, Observaciones = null } = request.body || {};

  if (!idTurno || MontoCierre === undefined || MontoCierre === null) {
    return reply.code(400).send({ error: 'idTurno y MontoCierre son requeridos' });
  }

  try {
    const pool = await getPool();

    // Obtener turno
    const turnoR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idTurno',  sql.BigInt, BigInt(idTurno))
      .query(`
        SELECT TOP 1 * FROM VIDA_CAJA_TURNOS
        WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idTurno=@idTurno
      `);

    const turno = turnoR.recordset[0];
    if (!turno) {
      return reply.code(404).send({ error: 'Turno no encontrado' });
    }
    if (turno.Status !== 'ABIERTO') {
      return reply.code(409).send({ error: 'El turno ya está cerrado' });
    }

    // Cajero solo puede cerrar su propio PV
    if (!isAdmin({ TipoUsuario }) && pvJwt && BigInt(turno.idPuntoVenta) !== BigInt(pvJwt)) {
      return reply.code(403).send({ error: 'No tienes permiso para cerrar este turno' });
    }

    // Recalcular totales
    const totales = await calcularTotales(
      pool, idBranch, idCuenta,
      turno.idPuntoVenta, turno.FechaApertura, null
    );

    const montoAp  = parseFloat(turno.MontoApertura);
    const totalEf  = parseFloat(totales.TotalEfectivo);
    const montoCi  = parseFloat(MontoCierre);
    const diferencia = montoCi - (montoAp + totalEf);

    await pool.request()
      .input('idBranch',             sql.BigInt,       idBranch)
      .input('idCuenta',             sql.BigInt,       idCuenta)
      .input('idTurno',              sql.BigInt,       BigInt(idTurno))
      .input('TotalVentasEfectivo',  sql.Decimal(18,4),totalEf)
      .input('TotalVentasTarjeta',   sql.Decimal(18,4),parseFloat(totales.TotalTarjeta))
      .input('TotalVentas',          sql.Decimal(18,4),parseFloat(totales.TotalVentas))
      .input('NumTransacciones',     sql.Int,          parseInt(totales.NumTransacciones))
      .input('MontoCierre',          sql.Decimal(18,4),montoCi)
      .input('Diferencia',           sql.Decimal(18,4),diferencia)
      .input('Observaciones',        sql.VarChar(500), Observaciones)
      .query(`
        UPDATE VIDA_CAJA_TURNOS SET
          Status               = 'CERRADO',
          FechaCierre          = GETDATE(),
          TotalVentasEfectivo  = @TotalVentasEfectivo,
          TotalVentasTarjeta   = @TotalVentasTarjeta,
          TotalVentas          = @TotalVentas,
          NumTransacciones     = @NumTransacciones,
          MontoCierre          = @MontoCierre,
          Diferencia           = @Diferencia,
          Observaciones        = @Observaciones
        WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idTurno=@idTurno
      `);

    // Retornar el turno cerrado
    const cerradoR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idTurno',  sql.BigInt, BigInt(idTurno))
      .query(`SELECT TOP 1 * FROM VIDA_CAJA_TURNOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idTurno=@idTurno`);

    return reply.send({ turno: cerradoR.recordset[0] });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al cerrar caja' });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /caja/historial
// ══════════════════════════════════════════════════════════════════════════════
export async function historialTurnos(request, reply) {
  const { idBranch, idCuenta, idPuntoVenta: pvJwt, TipoUsuario } = request.user;
  const { page = 1, limit = 20, idPuntoVenta: pvQuery, status = '' } = request.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  // Cajero siempre ve solo su PV
  const pvFiltro = isAdmin({ TipoUsuario }) ? (pvQuery ? BigInt(pvQuery) : null) : (pvJwt ? BigInt(pvJwt) : null);

  try {
    const pool = await getPool();

    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('offset',   sql.Int,    offset)
      .input('limit',    sql.Int,    parseInt(limit));

    let whereExtra = '';
    if (pvFiltro) {
      req.input('idPuntoVenta', sql.BigInt, pvFiltro);
      whereExtra += ' AND t.idPuntoVenta=@idPuntoVenta';
    }
    if (status) {
      req.input('status', sql.VarChar(20), status);
      whereExtra += ' AND t.Status=@status';
    }

    const r = await req.query(`
      SELECT
        t.idTurno, t.idPuntoVenta, t.idUsuario,
        t.NombreUsuario, t.NombreSucursal,
        t.FechaApertura, t.FechaCierre,
        t.MontoApertura, t.MontoCierre,
        t.TotalVentas, t.TotalVentasEfectivo, t.TotalVentasTarjeta,
        t.NumTransacciones, t.Diferencia,
        t.Observaciones, t.Status
      FROM VIDA_CAJA_TURNOS t
      WHERE t.idBranch=@idBranch AND t.idCuenta=@idCuenta
        ${whereExtra}
      ORDER BY t.FechaApertura DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    // Contar total
    const countReq = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta);
    if (pvFiltro) countReq.input('idPuntoVenta', sql.BigInt, pvFiltro);
    if (status)   countReq.input('status', sql.VarChar(20), status);

    const countR = await countReq.query(`
      SELECT COUNT(*) AS total FROM VIDA_CAJA_TURNOS t
      WHERE t.idBranch=@idBranch AND t.idCuenta=@idCuenta
        ${whereExtra}
    `);

    return reply.send({
      data:  r.recordset,
      total: countR.recordset[0].total,
      page:  parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener historial de turnos' });
  }
}
