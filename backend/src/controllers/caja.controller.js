// src/controllers/caja.controller.js
import { getPool, sql } from '../db/sqlserver.js';
import { registrarAuditoria } from '../services/audit.service.js';
import {efectivoPorMoneda,calcularArqueo,efectoMovimientos} from '../services/arqueo.service.js';
import {importeCaja} from '../services/pagoPos.service.js';

// ── Helper ──────────────────────────────────────────────────────────────────
async function nextId(pool, tabla, campo, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta',  sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}),0)+1 AS next FROM ${tabla} WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
  return r.recordset[0].next;
}

// Variante transaccional: UPDLOCK+HOLDLOCK serializa la obtención del ID
async function nextIdTx(transaction, tabla, campo, idBranch, idCuenta) {
  const r = await new sql.Request(transaction)
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}),0)+1 AS next FROM ${tabla} WITH (UPDLOCK, HOLDLOCK)
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
  return r.recordset[0].next;
}

// Solo los roles de RED pueden operar/ver la caja de OTRA tienda (pasando
// idPuntoVenta). Los roles de tienda (ADMIN, SUPERVISOR, CAJERO) quedan
// forzados a su propio punto de venta.
const ROLES_RED = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO'];

function esRed(user) {
  return ROLES_RED.includes(user.TipoUsuario);
}

// ── Calcular totales del turno desde VIDA_PEDIDOS ───────────────────────────
async function calcularTotales(pool, idBranch, idCuenta, idPuntoVenta, fechaApertura, fechaCierre) {
  const fechaHasta = fechaCierre || null;

  const req = new sql.Request(pool)
    .input('idBranch',      sql.BigInt,  idBranch)
    .input('idCuenta',      sql.BigInt,  idCuenta)
    .input('idPuntoVenta',  sql.BigInt,  idPuntoVenta)
    .input('fechaApertura', sql.DateTime, new Date(fechaApertura));

  let fechaCondicion = 'AND p.FechaAlta >= @fechaApertura';
  if (fechaHasta) {
    req.input('fechaHasta', sql.DateTime, new Date(fechaHasta));
    fechaCondicion += ' AND p.FechaAlta <= @fechaHasta';
  } else {
    // UTC: las ventas POS guardan FechaAlta en UTC (el navegador manda
    // toISOString()); el servidor puede estar en otra zona (QA en UTC-7), así
    // que GETDATE() (hora local del server) dejaba fuera ventas válidas.
    fechaCondicion += ' AND p.FechaAlta <= GETUTCDATE()';
  }

  const r = await req.query(`
    SELECT
      COUNT(*)                                       AS NumTransacciones,
      ISNULL(SUM(p.TotalUSD), 0)                    AS TotalVentas,
      ISNULL(SUM(CASE WHEN p.MetodoPago IN ('EFECTIVO','MIXTO') THEN ISNULL(p.MontoEfectivo, p.TotalUSD) - ISNULL(p.MontoCambio,0) ELSE 0 END), 0) AS TotalEfectivo,
      ISNULL(SUM(CASE WHEN p.MetodoPago IN ('TARJETA','MIXTO')  THEN ISNULL(p.MontoTarjeta,  0)           ELSE 0 END), 0) AS TotalTarjeta
    FROM VIDA_PEDIDOS p
    WHERE p.idBranch      = @idBranch
      AND p.idCuenta      = @idCuenta
      AND p.idPuntoVenta  = @idPuntoVenta
      AND p.Canal         = 'POS'
      AND p.Status        = 'ENTREGADO'
      ${fechaCondicion};
    SELECT p.TotalUSD,p.MetodoPago,p.MontoEfectivo,p.MontoCambio,p.PagoMonedaJSON FROM VIDA_PEDIDOS p
      WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta AND p.idPuntoVenta=@idPuntoVenta
      AND p.Canal='POS' AND p.Status='ENTREGADO' AND p.MetodoPago IN ('EFECTIVO','MIXTO') ${fechaCondicion}
  `);

  const originales=efectivoPorMoneda(r.recordsets[1] || []);
  return {...r.recordset[0],EfectivoOriginalUSD:originales.USD,EfectivoOriginalVES:originales.VES};
}

// ── Movimientos de caja del turno (egresos/ingresos/retiros/devoluciones) ───
// `ejecutor` puede ser un pool o una transacción. Trae todos (ACTIVO+ANULADO)
// para listarlos; el cálculo de arqueo ignora los ANULADOS por sí mismo.
async function obtenerMovimientos(ejecutor, idBranch, idCuenta, idTurno) {
  const r = await new sql.Request(ejecutor)
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .input('idTurno',  sql.BigInt, idTurno)
    .query(`
      SELECT idMovimiento, idTurno, idPuntoVenta, Tipo, Moneda, Monto, Motivo,
             idUsuario, NombreUsuario, Status, FechaAlta, FechaAnula
      FROM VIDA_CAJA_MOVIMIENTOS
      WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idTurno=@idTurno
      ORDER BY FechaAlta DESC, idMovimiento DESC
    `);
  return r.recordset;
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /caja/turno-activo
// ══════════════════════════════════════════════════════════════════════════════
export async function turnoActivo(request, reply) {
  const { idBranch, idCuenta, idPuntoVenta: pvJwt, TipoUsuario } = request.user;
  const pvQuery = request.query.idPuntoVenta;

  // Admin puede consultar cualquier PV; cajero usa el suyo del JWT
  const pvId = esRed({ TipoUsuario }) && pvQuery ? BigInt(pvQuery) : (pvJwt ? BigInt(pvJwt) : null);

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
  const { MontoApertura = 0, MontoAperturaVES = 0, Observaciones = null, idPuntoVenta: pvBody } = request.body || {};

  const pvId = esRed({ TipoUsuario }) && pvBody ? BigInt(pvBody) : (pvJwt ? BigInt(pvJwt) : null);

  if (!pvId) {
    return reply.code(400).send({ error: 'Se requiere idPuntoVenta para abrir caja' });
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  let enTransaccion = false;

  try {
    importeCaja(MontoApertura);
    importeCaja(MontoAperturaVES);
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

    await transaction.begin();
    enTransaccion = true;

    // Verificar turno abierto CON lock de rango: HOLDLOCK retiene el lock hasta
    // el commit, así dos aperturas simultáneas del mismo PV se serializan y la
    // segunda ve el turno que insertó la primera
    const existe = await new sql.Request(transaction)
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idPuntoVenta', sql.BigInt, pvId)
      .query(`
        SELECT TOP 1 idTurno FROM VIDA_CAJA_TURNOS WITH (UPDLOCK, HOLDLOCK)
        WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@idPuntoVenta AND Status='ABIERTO'
      `);

    if (existe.recordset.length > 0) {
      await transaction.rollback();
      enTransaccion = false;
      return reply.code(409).send({ error: 'Ya existe un turno abierto para este punto de venta' });
    }

    const idTurno = await nextIdTx(transaction, 'VIDA_CAJA_TURNOS', 'idTurno', idBranch, idCuenta);

    await new sql.Request(transaction)
      .input('idBranch',      sql.BigInt,       idBranch)
      .input('idCuenta',      sql.BigInt,       idCuenta)
      .input('idTurno',       sql.BigInt,       idTurno)
      .input('idPuntoVenta',  sql.BigInt,       pvId)
      .input('idUsuario',     sql.BigInt,       idUsuario)
      .input('NombreUsuario', sql.VarChar(200), NombreUsuario)
      .input('NombreSucursal',sql.VarChar(200), NombreSucursal)
      .input('MontoApertura', sql.Decimal(18,4),MontoApertura)
      .input('MontoAperturaVES', sql.Decimal(18,2),MontoAperturaVES)
      .input('Observaciones', sql.VarChar(500), Observaciones)
      .input('UsuAlta',       sql.VarChar(10),  String(idUsuario).slice(0,10))
      .query(`
        INSERT INTO VIDA_CAJA_TURNOS
          (idBranch, idCuenta, idTurno, idPuntoVenta, idUsuario,
           NombreUsuario, NombreSucursal, MontoApertura, MontoAperturaVES,
           Observaciones, Status, UsuAlta, FechaAlta, FechaApertura)
        VALUES
          (@idBranch, @idCuenta, @idTurno, @idPuntoVenta, @idUsuario,
           @NombreUsuario, @NombreSucursal, @MontoApertura, @MontoAperturaVES,
           @Observaciones, 'ABIERTO', @UsuAlta, GETUTCDATE(), GETUTCDATE())
      `);

    await registrarAuditoria(transaction, {
      idBranch, idCuenta,
      entityType: 'CAJA_TURNO', entityId: idTurno,
      accion: 'CAJA_APERTURA', actor: idUsuario,
      data: { idPuntoVenta: Number(pvId), MontoApertura, MontoAperturaVES },
    }, request.log);

    await transaction.commit();
    enTransaccion = false;

    return reply.code(201).send({ idTurno, mensaje: 'Caja abierta correctamente' });
  } catch (err) {
    if (enTransaccion) {
      try { await transaction.rollback(); } catch (rbErr) { request.log.error('Rollback falló: ' + rbErr.message); }
    }
    request.log.error(err);
    return reply.code(err.statusCode || 500).send({ error: err.statusCode ? err.message : 'Error al abrir caja' });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /caja/resumen
// ══════════════════════════════════════════════════════════════════════════════
export async function resumenTurno(request, reply) {
  const { idBranch, idCuenta, idPuntoVenta: pvJwt, TipoUsuario } = request.user;
  const { idTurno: idTurnoQ, idPuntoVenta: pvQuery } = request.query;

  const pvId = esRed({ TipoUsuario }) && pvQuery ? BigInt(pvQuery) : (pvJwt ? BigInt(pvJwt) : null);

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

    if (!esRed({TipoUsuario}) && (!pvJwt || String(turno.idPuntoVenta)!==String(pvJwt))) return reply.code(403).send({error: 'No tienes permiso para consultar este turno'});

    // Calcular totales
    // Un cierre confirmado conserva sus cifras aunque lleguen ventas offline después.
    const arqueoGuardado=turno.ArqueoMonedasJSON?JSON.parse(turno.ArqueoMonedasJSON):null;
    const totales = turno.Status==='CERRADO' ? {
      TotalVentas:turno.TotalVentas,TotalEfectivo:turno.TotalVentasEfectivo,
      TotalTarjeta:turno.TotalVentasTarjeta,NumTransacciones:turno.NumTransacciones,
      EfectivoOriginalUSD:arqueoGuardado?.USD.VentasNetas??null,
      EfectivoOriginalVES:arqueoGuardado?.VES.VentasNetas??null,
    } : await calcularTotales(pool,idBranch,idCuenta,turno.idPuntoVenta,turno.FechaApertura,null);

    // Pedidos del turno. La vista del turno actual muestra solo los 10 más
    // recientes; el historial utiliza la colección completa para auditarlo.
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
      fechaCond += ' AND p.FechaAlta <= GETUTCDATE()';
    }

    const pedidosR = await req2.query(`
      SELECT
        p.idPedido, p.FechaAlta, p.TotalUSD, p.MetodoPago,
        COALESCE(
          NULLIF(LTRIM(RTRIM(CONCAT(u.Nombre, ' ', u.Apellidos))), ''),
          NULLIF(u.Cve, ''),
          CONCAT('Usuario #', p.UsuAlta)
        ) AS RealizadaPor,
        u.Cve AS UsuarioCve
      FROM VIDA_PEDIDOS p
      LEFT JOIN VIDA_CUENTA_USUARIOS u
        ON u.idBranch=p.idBranch AND u.idCuenta=p.idCuenta
       AND u.idUsuario=TRY_CONVERT(BIGINT, p.UsuAlta)
      WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
        AND p.idPuntoVenta=@idPuntoVenta
        AND p.Canal='POS' AND p.Status='ENTREGADO'
        ${fechaCond}
      ORDER BY p.FechaAlta DESC
    `);

    const efectivoEsperado = parseFloat(turno.MontoApertura) + parseFloat(totales.TotalEfectivo);

    // Movimientos de caja del turno (egresos/ingresos/retiros/devoluciones).
    const movimientos = await obtenerMovimientos(pool, idBranch, idCuenta, turno.idTurno);
    const efectoMov = efectoMovimientos(movimientos);

    return reply.send({
      turno: {
        idTurno:       turno.idTurno,
        idPuntoVenta:  turno.idPuntoVenta,
        FechaApertura: turno.FechaApertura,
        FechaCierre:   turno.FechaCierre,
        MontoApertura: turno.MontoApertura,
        MontoAperturaVES: turno.MontoAperturaVES,
        ArqueoMonedasJSON: turno.ArqueoMonedasJSON,
        NombreUsuario: turno.NombreUsuario,
        NombreSucursal:turno.NombreSucursal,
        Status:        turno.Status,
      },
      ventas: {
        TotalVentas:      totales.TotalVentas,
        TotalEfectivo:    totales.TotalEfectivo,
        EfectivoOriginalUSD:totales.EfectivoOriginalUSD,EfectivoOriginalVES:totales.EfectivoOriginalVES,
        TotalTarjeta:     totales.TotalTarjeta,
        NumTransacciones: totales.NumTransacciones,
      },
      efectivoEsperado,
      efectivoEsperadoUSD:arqueoGuardado?.USD.Esperado??(turno.Status==='ABIERTO'?Number(turno.MontoApertura)+totales.EfectivoOriginalUSD+efectoMov.USD:null),
      efectivoEsperadoVES:arqueoGuardado?.VES.Esperado??(turno.Status==='ABIERTO'?Number(turno.MontoAperturaVES||0)+totales.EfectivoOriginalVES+efectoMov.VES:null),
      movimientos,
      movimientosPorMoneda: efectoMov,
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
  const { idTurno, MontoCierre, MontoCierreVES, Observaciones = null } = request.body || {};

  if (!idTurno || MontoCierre == null || MontoCierreVES == null) {
    return reply.code(400).send({ error: 'idTurno, conteo USD y conteo VES son requeridos. Actualiza el panel si no aparecen ambos.' });
  }

  let transaction;
  let activa=false;
  try {
    importeCaja(MontoCierre);importeCaja(MontoCierreVES);
    const pool = await getPool();
    transaction=new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    activa=true;

    // Obtener turno
    const turnoR = await new sql.Request(transaction)
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idTurno',  sql.BigInt, BigInt(idTurno))
      .query(`
        SELECT TOP 1 * FROM VIDA_CAJA_TURNOS WITH (UPDLOCK,HOLDLOCK)
        WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idTurno=@idTurno
      `);

    const turno = turnoR.recordset[0];
    if (!turno) {
      throw Object.assign(new Error('Turno no encontrado'),{statusCode:404});
    }
    if (turno.Status !== 'ABIERTO') {
      throw Object.assign(new Error('El turno ya está cerrado'),{statusCode:409});
    }

    // Cajero solo puede cerrar su propio PV
    if (!esRed({ TipoUsuario }) && (!pvJwt || String(turno.idPuntoVenta) !== String(pvJwt))) {
      throw Object.assign(new Error('No tienes permiso para cerrar este turno'),{statusCode:403});
    }

    const reloj=await new sql.Request(transaction).query('SELECT GETUTCDATE() AS FechaCierre');
    const fechaCierre=reloj.recordset[0].FechaCierre;
    // Recalcular totales
    const totales = await calcularTotales(
      transaction, idBranch, idCuenta,
      turno.idPuntoVenta, turno.FechaApertura, fechaCierre
    );

    const montoAp  = parseFloat(turno.MontoApertura);
    const totalEf  = parseFloat(totales.TotalEfectivo);
    const montoCi  = parseFloat(MontoCierre);
    // Movimientos de caja del turno (dentro de la misma transacción, con el
    // turno ya bloqueado) para que el esperado por moneda los contemple.
    const movimientos = await obtenerMovimientos(transaction, idBranch, idCuenta, BigInt(idTurno));
    const arqueo=calcularArqueo(turno,totales,{USD:MontoCierre,VES:MontoCierreVES},movimientos);
    const diferencia = arqueo.USD.Diferencia;

    // La condición Status='ABIERTO' evita doble cierre concurrente: solo la
    // primera petición cierra; la segunda no afecta filas y recibe 409
    const cierreR = await new sql.Request(transaction)
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
      .input('FechaCierre', sql.DateTime, fechaCierre)
      .input('ArqueoMonedasJSON', sql.NVarChar(sql.MAX), JSON.stringify(arqueo))
      .query(`
        UPDATE VIDA_CAJA_TURNOS SET
          Status               = 'CERRADO',
          FechaCierre          = @FechaCierre,
          ArqueoMonedasJSON     = @ArqueoMonedasJSON,
          TotalVentasEfectivo  = @TotalVentasEfectivo,
          TotalVentasTarjeta   = @TotalVentasTarjeta,
          TotalVentas          = @TotalVentas,
          NumTransacciones     = @NumTransacciones,
          MontoCierre          = @MontoCierre,
          Diferencia           = @Diferencia,
          Observaciones        = @Observaciones
        WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idTurno=@idTurno
          AND Status='ABIERTO'
      `);

    if (cierreR.rowsAffected[0] === 0) {
      throw Object.assign(new Error('El turno ya fue cerrado por otra operación'),{statusCode:409});
    }

    await registrarAuditoria(transaction, {
      idBranch, idCuenta,
      entityType: 'CAJA_TURNO', entityId: idTurno,
      accion: 'CAJA_CIERRE', actor: request.user.idUsuario,
      data: {
        idPuntoVenta: Number(turno.idPuntoVenta),
        MontoApertura: montoAp, MontoCierre: montoCi,
        TotalVentas: parseFloat(totales.TotalVentas),
        TotalEfectivo: totalEf, TotalTarjeta: parseFloat(totales.TotalTarjeta),
        NumTransacciones: parseInt(totales.NumTransacciones),
        Diferencia: diferencia, ArqueoMonedas: arqueo,
      },
    }, request.log);

    // Retornar el turno cerrado
    const cerradoR = await new sql.Request(transaction)
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idTurno',  sql.BigInt, BigInt(idTurno))
      .query(`SELECT TOP 1 * FROM VIDA_CAJA_TURNOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idTurno=@idTurno`);

    await transaction.commit();activa=false;
    return reply.send({ turno: cerradoR.recordset[0] });
  } catch (err) {
    if(activa) {try {await transaction.rollback();} catch {}}
    request.log.error(err);
    return reply.code(err.statusCode || 500).send({ error: err.statusCode ? err.message : 'Error al cerrar caja' });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /caja/historial
// ══════════════════════════════════════════════════════════════════════════════
export async function historialTurnos(request, reply) {
  const { idBranch, idCuenta, idPuntoVenta: pvJwt, TipoUsuario } = request.user;
  const { page = 1, limit = 20, idPuntoVenta: pvQuery, status = '' } = request.query;
  if(!esRed({TipoUsuario}) && !pvJwt) return reply.code(403).send({error:'Usuario sin tienda asignada'});
  const offset = (parseInt(page) - 1) * parseInt(limit);

  // Cajero siempre ve solo su PV
  const pvFiltro = esRed({ TipoUsuario }) ? (pvQuery ? BigInt(pvQuery) : null) : (pvJwt ? BigInt(pvJwt) : null);

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
        t.MontoApertura, t.MontoAperturaVES, t.ArqueoMonedasJSON, t.MontoCierre,
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

// ══════════════════════════════════════════════════════════════════════════════
// POST /caja/movimiento  — registra un movimiento de caja (egreso/ingreso/
// retiro/devolución) por moneda sobre un turno ABIERTO.
// ══════════════════════════════════════════════════════════════════════════════
const TIPOS_MOVIMIENTO = ['INGRESO', 'EGRESO', 'RETIRO', 'DEVOLUCION'];

export async function registrarMovimiento(request, reply) {
  const { idBranch, idCuenta, idUsuario, TipoUsuario, idPuntoVenta: pvJwt } = request.user;
  const { idTurno, Tipo, Moneda, Monto, Motivo = null } = request.body || {};

  if (!idTurno || !Tipo || !Moneda || Monto == null) {
    return reply.code(400).send({ error: 'idTurno, Tipo, Moneda y Monto son requeridos' });
  }
  if (!TIPOS_MOVIMIENTO.includes(Tipo)) {
    return reply.code(400).send({ error: 'Tipo de movimiento inválido' });
  }
  if (!['USD', 'VES'].includes(Moneda)) {
    return reply.code(400).send({ error: 'Moneda inválida' });
  }

  let transaction, activa = false;
  try {
    importeCaja(Monto);                                   // ≤2 decimales, no negativo
    if (Number(Monto) <= 0) return reply.code(400).send({ error: 'El monto debe ser mayor a cero' });

    const pool = await getPool();

    // Nombre del usuario que registra (para mostrar en la lista)
    const usrR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idUsuario', sql.BigInt, idUsuario)
      .query(`SELECT TOP 1 LTRIM(RTRIM(Nombre + ' ' + ISNULL(Apellidos,''))) AS NombreUsuario
              FROM VIDA_CUENTA_USUARIOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idUsuario=@idUsuario`);
    const NombreUsuario = usrR.recordset[0]?.NombreUsuario || null;

    transaction = new sql.Transaction(pool);
    await transaction.begin();
    activa = true;

    // Turno con lock: debe existir y estar ABIERTO
    const turnoR = await new sql.Request(transaction)
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idTurno',  sql.BigInt, BigInt(idTurno))
      .query(`SELECT TOP 1 idTurno, idPuntoVenta, Status FROM VIDA_CAJA_TURNOS WITH (UPDLOCK, HOLDLOCK)
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idTurno=@idTurno`);
    const turno = turnoR.recordset[0];
    if (!turno) throw Object.assign(new Error('Turno no encontrado'), { statusCode: 404 });
    if (turno.Status !== 'ABIERTO') throw Object.assign(new Error('La caja está cerrada; no admite movimientos'), { statusCode: 409 });

    // Alcance: un rol de tienda solo opera su propio PV
    if (!esRed({ TipoUsuario }) && (!pvJwt || String(turno.idPuntoVenta) !== String(pvJwt))) {
      throw Object.assign(new Error('No tienes permiso para operar la caja de este turno'), { statusCode: 403 });
    }

    const idMovimiento = await nextIdTx(transaction, 'VIDA_CAJA_MOVIMIENTOS', 'idMovimiento', idBranch, idCuenta);

    await new sql.Request(transaction)
      .input('idBranch',      sql.BigInt,        idBranch)
      .input('idCuenta',      sql.BigInt,        idCuenta)
      .input('idMovimiento',  sql.BigInt,        idMovimiento)
      .input('idTurno',       sql.BigInt,        BigInt(idTurno))
      .input('idPuntoVenta',  sql.BigInt,        turno.idPuntoVenta)
      .input('Tipo',          sql.VarChar(20),   Tipo)
      .input('Moneda',        sql.VarChar(3),    Moneda)
      .input('Monto',         sql.Decimal(18,2), Number(Monto))
      .input('Motivo',        sql.VarChar(300),  Motivo ? String(Motivo).slice(0, 300) : null)
      .input('idUsuario',     sql.BigInt,        idUsuario)
      .input('NombreUsuario', sql.VarChar(200),  NombreUsuario)
      .input('UsuAlta',       sql.VarChar(10),   String(idUsuario).slice(0, 10))
      .query(`
        INSERT INTO VIDA_CAJA_MOVIMIENTOS
          (idBranch, idCuenta, idMovimiento, idTurno, idPuntoVenta,
           Tipo, Moneda, Monto, Motivo, idUsuario, NombreUsuario,
           Status, UsuAlta, FechaAlta)
        VALUES
          (@idBranch, @idCuenta, @idMovimiento, @idTurno, @idPuntoVenta,
           @Tipo, @Moneda, @Monto, @Motivo, @idUsuario, @NombreUsuario,
           'ACTIVO', @UsuAlta, GETUTCDATE())
      `);

    await registrarAuditoria(transaction, {
      idBranch, idCuenta,
      entityType: 'CAJA_MOVIMIENTO', entityId: idMovimiento,
      accion: 'CAJA_MOVIMIENTO_ALTA', actor: idUsuario,
      data: { idTurno: Number(idTurno), idPuntoVenta: Number(turno.idPuntoVenta), Tipo, Moneda, Monto: Number(Monto), Motivo },
    }, request.log);

    await transaction.commit();
    activa = false;
    return reply.code(201).send({ idMovimiento, mensaje: 'Movimiento registrado' });
  } catch (err) {
    if (activa) { try { await transaction.rollback(); } catch {} }
    request.log.error(err);
    return reply.code(err.statusCode || 500).send({ error: err.statusCode ? err.message : 'Error al registrar movimiento' });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /caja/movimiento/:id/anular  — anula (soft) un movimiento mientras el
// turno sigue ABIERTO. Una vez cerrado el turno, el arqueo queda congelado.
// ══════════════════════════════════════════════════════════════════════════════
export async function anularMovimiento(request, reply) {
  const { idBranch, idCuenta, idUsuario, TipoUsuario, idPuntoVenta: pvJwt } = request.user;
  const idMovimiento = request.params.id;

  if (!idMovimiento) return reply.code(400).send({ error: 'idMovimiento requerido' });

  let transaction, activa = false;
  try {
    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    activa = true;

    const movR = await new sql.Request(transaction)
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idMovimiento', sql.BigInt, BigInt(idMovimiento))
      .query(`SELECT TOP 1 m.idMovimiento, m.idTurno, m.idPuntoVenta, m.Status, t.Status AS TurnoStatus
              FROM VIDA_CAJA_MOVIMIENTOS m WITH (UPDLOCK, HOLDLOCK)
              JOIN VIDA_CAJA_TURNOS t
                ON t.idBranch=m.idBranch AND t.idCuenta=m.idCuenta AND t.idTurno=m.idTurno
              WHERE m.idBranch=@idBranch AND m.idCuenta=@idCuenta AND m.idMovimiento=@idMovimiento`);
    const mov = movR.recordset[0];
    if (!mov) throw Object.assign(new Error('Movimiento no encontrado'), { statusCode: 404 });
    if (mov.Status !== 'ACTIVO') throw Object.assign(new Error('El movimiento ya está anulado'), { statusCode: 409 });
    if (mov.TurnoStatus !== 'ABIERTO') throw Object.assign(new Error('La caja ya está cerrada; no se puede anular'), { statusCode: 409 });
    if (!esRed({ TipoUsuario }) && (!pvJwt || String(mov.idPuntoVenta) !== String(pvJwt))) {
      throw Object.assign(new Error('No tienes permiso para operar la caja de este turno'), { statusCode: 403 });
    }

    const upd = await new sql.Request(transaction)
      .input('idBranch',     sql.BigInt,      idBranch)
      .input('idCuenta',     sql.BigInt,      idCuenta)
      .input('idMovimiento', sql.BigInt,      BigInt(idMovimiento))
      .input('UsuAnula',     sql.VarChar(10), String(idUsuario).slice(0, 10))
      .query(`UPDATE VIDA_CAJA_MOVIMIENTOS SET Status='ANULADO', UsuAnula=@UsuAnula, FechaAnula=GETUTCDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idMovimiento=@idMovimiento AND Status='ACTIVO'`);
    if (upd.rowsAffected[0] === 0) throw Object.assign(new Error('El movimiento ya fue anulado'), { statusCode: 409 });

    await registrarAuditoria(transaction, {
      idBranch, idCuenta,
      entityType: 'CAJA_MOVIMIENTO', entityId: idMovimiento,
      accion: 'CAJA_MOVIMIENTO_ANULA', actor: idUsuario,
      data: { idTurno: Number(mov.idTurno), idPuntoVenta: Number(mov.idPuntoVenta) },
    }, request.log);

    await transaction.commit();
    activa = false;
    return reply.send({ idMovimiento: Number(idMovimiento), mensaje: 'Movimiento anulado' });
  } catch (err) {
    if (activa) { try { await transaction.rollback(); } catch {} }
    request.log.error(err);
    return reply.code(err.statusCode || 500).send({ error: err.statusCode ? err.message : 'Error al anular movimiento' });
  }
}
