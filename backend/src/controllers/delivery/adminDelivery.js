// src/controllers/delivery/adminDelivery.js
// Administración del delivery: repartidores, liquidación, configuración, rutas, mapa en vivo y clientes.
// (Separado de delivery.controller.js, que reexporta todo.)
import { getPool, sql } from '../../db/sqlserver.js';
import { conIdUnico } from '../../db/idUnico.js';
import { registrarAuditoria } from '../../services/audit.service.js';
import { recalcularRuta } from '../../services/rutas.service.js';
import { fechaCaracas } from '../../services/fechas.service.js';
import bcrypt from 'bcrypt';
import { nextId, nextIdTx } from './comun.js';

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — LISTAR REPARTIDORES
// GET /delivery/admin/repartidores
// ══════════════════════════════════════════════════════════════════════════
export async function listarRepartidores(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT idRepartidor, Nombre, Telefono, Vehiculo, PlacaVehiculo,
                     ComisionPct, SaldoPendiente, SaldoPendienteVES, StatusRepartidor, Status,
                     UltimaLatitud, UltimaLongitud, UltimaUbicacion, FechaAlta
              FROM VIDA_REPARTIDORES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
              ORDER BY Nombre`);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al listar repartidores' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — CREAR REPARTIDOR
// POST /delivery/admin/repartidores
// ══════════════════════════════════════════════════════════════════════════
export async function crearRepartidor(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { Nombre, Telefono, Vehiculo, PlacaVehiculo, ComisionPct } = request.body;

  try {
    const pool = await getPool();

    // Evitar duplicar un repartidor con el mismo teléfono (causa ambigüedad al
    // iniciar sesión y al asignar pedidos).
    if (Telefono?.trim()) {
      const dup = await pool.request()
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta)
        .input('Telefono', sql.VarChar(30), Telefono.trim())
        .query(`SELECT TOP 1 idRepartidor FROM VIDA_REPARTIDORES
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Telefono=@Telefono AND Status='ACTIVO'`);
      if (dup.recordset.length)
        return reply.code(409).send({ error: 'Ya existe un repartidor activo con ese teléfono' });
    }


    // id con MAX()+1: si otra alta concurrente toma el mismo, se reintenta
    const idRepartidor = await conIdUnico(async () => {
      const idRepartidor = await nextId(pool, 'VIDA_REPARTIDORES', 'idRepartidor', idBranch, idCuenta);
      await pool.request()
        .input('idBranch',     sql.BigInt,     idBranch)
        .input('idCuenta',     sql.BigInt,     idCuenta)
        .input('idRepartidor', sql.BigInt,     idRepartidor)
        .input('Nombre',       sql.VarChar(200), Nombre)
        .input('Telefono',     sql.VarChar(30),  Telefono     || null)
        .input('Vehiculo',     sql.VarChar(100), Vehiculo     || null)
        .input('PlacaVehiculo',sql.VarChar(20),  PlacaVehiculo|| null)
        .input('ComisionPct',  sql.Decimal(5,2), ComisionPct  ?? null)
        .query(`INSERT INTO VIDA_REPARTIDORES
                  (idBranch,idCuenta,idRepartidor,Nombre,Telefono,Vehiculo,PlacaVehiculo,ComisionPct)
                VALUES
                  (@idBranch,@idCuenta,@idRepartidor,@Nombre,@Telefono,@Vehiculo,@PlacaVehiculo,@ComisionPct)`);
      return idRepartidor;
    });

    return reply.code(201).send({ idRepartidor });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al crear repartidor' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — EDITAR REPARTIDOR
// PUT /delivery/admin/repartidores/:id
// ══════════════════════════════════════════════════════════════════════════
export async function editarRepartidor(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { id } = request.params;
  const { Nombre, Telefono, Vehiculo, PlacaVehiculo, ComisionPct, Status } = request.body;

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',     sql.BigInt,      idBranch)
      .input('idCuenta',     sql.BigInt,      idCuenta)
      .input('idRepartidor', sql.BigInt,      id)
      .input('Nombre',       sql.VarChar(200), Nombre        || null)
      .input('Telefono',     sql.VarChar(30),  Telefono      || null)
      .input('Vehiculo',     sql.VarChar(100), Vehiculo      || null)
      .input('PlacaVehiculo',sql.VarChar(20),  PlacaVehiculo || null)
      .input('ComisionPct',  sql.Decimal(5,2), ComisionPct   ?? null)
      .input('Status',       sql.VarChar(20),  Status        || null)
      .query(`UPDATE VIDA_REPARTIDORES SET
                Nombre        = COALESCE(@Nombre,        Nombre),
                Telefono      = COALESCE(@Telefono,      Telefono),
                Vehiculo      = COALESCE(@Vehiculo,      Vehiculo),
                PlacaVehiculo = COALESCE(@PlacaVehiculo, PlacaVehiculo),
                ComisionPct   = COALESCE(@ComisionPct,   ComisionPct),
                Status        = COALESCE(@Status,        Status)
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);

    return reply.send({ ok: true });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al editar repartidor' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — CAMBIAR/RESETEAR CONTRASEÑA DE UN REPARTIDOR
// PATCH /delivery/admin/repartidores/:id/contrasena  { Contrasena }
// ══════════════════════════════════════════════════════════════════════════
export async function resetContrasenaRepartidor(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { id } = request.params;
  const { Contrasena } = request.body || {};

  if (!Contrasena || Contrasena.length < 6)
    return reply.code(400).send({ error: 'La contraseña debe tener mínimo 6 caracteres' });

  try {
    const pool = await getPool();
    const hash = await bcrypt.hash(Contrasena, 10);
    const r = await pool.request()
      .input('idBranch',     sql.BigInt,        idBranch)
      .input('idCuenta',     sql.BigInt,        idCuenta)
      .input('idRepartidor', sql.BigInt,        id)
      .input('Contrasena',   sql.NVarChar(200), hash)
      .query(`UPDATE VIDA_REPARTIDORES SET Contrasena=@Contrasena
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);

    if (r.rowsAffected[0] === 0)
      return reply.code(404).send({ error: 'Repartidor no encontrado' });

    return reply.send({ message: 'Contraseña actualizada' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al cambiar la contraseña' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — LIQUIDAR REPARTIDOR
// POST /delivery/admin/liquidar/:idRepartidor
// ══════════════════════════════════════════════════════════════════════════
export async function liquidarRepartidor(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idRepartidor } = request.params;
  const { Observaciones } = request.body ?? {};
  let transaction;
  try {
    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const repR = await new sql.Request(transaction)
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`SELECT SaldoPendiente, SaldoPendienteVES FROM VIDA_REPARTIDORES WITH (UPDLOCK,HOLDLOCK)
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);

    if (!repR.recordset.length) {
      await transaction.rollback(); transaction = null;
      return reply.code(404).send({ error: 'Repartidor no encontrado' });
    }
    const saldoUSD = Number(repR.recordset[0].SaldoPendiente || 0);
    const saldoVES = Number(repR.recordset[0].SaldoPendienteVES || 0);
    if (saldoUSD <= 0 && saldoVES <= 0) {
      await transaction.rollback(); transaction = null;
      return reply.code(409).send({ error: 'El repartidor no tiene efectivo pendiente por liquidar' });
    }

    const pedR = await new sql.Request(transaction)
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`SELECT idPedido, MontoEfectivoRepartidor, ComisionRepartidor, LiquidacionRepartidorJSON
              FROM VIDA_PEDIDOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND idRepartidor=@idRepartidor
                AND Status='ENTREGADO'
                AND MetodoPago='EFECTIVO'
                AND MontoEfectivoRepartidor IS NOT NULL
                AND idLiquidacionRepartidor IS NULL`);
    const pedidos = pedR.recordset;
    const comision = pedidos.reduce((s,p)=>s+Number(p.ComisionRepartidor||0),0);
    const montoEfectivoUSD = pedidos.reduce((s,p)=>s+Number(p.MontoEfectivoRepartidor||0),0);
    const desglose = {
      Version:1,
      USD:{MontoALiquidar:Math.round(saldoUSD*100)/100},
      VES:{MontoALiquidar:Math.round(saldoVES*100)/100},
      Pedidos:pedidos.map(p=>p.idPedido),
    };
    const idLiquidacion = await nextIdTx(transaction, 'VIDA_REPARTIDOR_LIQUIDACIONES', 'idLiquidacion', idBranch, idCuenta);
    await new sql.Request(transaction)
      .input('idBranch',        sql.BigInt,      idBranch)
      .input('idCuenta',        sql.BigInt,      idCuenta)
      .input('idLiquidacion',   sql.BigInt,      idLiquidacion)
      .input('idRepartidor',    sql.BigInt,      idRepartidor)
      .input('MontoEfectivo',   sql.Decimal(18,4), montoEfectivoUSD)
      .input('Comision',        sql.Decimal(18,4), comision)
      .input('MontoALiquidar',  sql.Decimal(18,4), saldoUSD)
      .input('NumPedidos',      sql.Int,           pedidos.length)
      .input('Desglose',        sql.NVarChar(sql.MAX), JSON.stringify(desglose))
      .input('Observaciones',   sql.VarChar(500),  Observaciones || null)
      .input('idUsuarioLiquida',sql.BigInt,        idUsuario)
      .input('Status',          sql.VarChar(20),   'LIQUIDADO')
      .query(`INSERT INTO VIDA_REPARTIDOR_LIQUIDACIONES
                (idBranch,idCuenta,idLiquidacion,idRepartidor,
                 MontoEfectivo,Comision,MontoALiquidar,NumPedidos,DesgloseMonedasJSON,
                 Observaciones,idUsuarioLiquida,Status)
              VALUES
                (@idBranch,@idCuenta,@idLiquidacion,@idRepartidor,
                 @MontoEfectivo,@Comision,@MontoALiquidar,@NumPedidos,@Desglose,
                 @Observaciones,@idUsuarioLiquida,@Status)`);
    await new sql.Request(transaction)
      .input('idBranch',sql.BigInt,idBranch).input('idCuenta',sql.BigInt,idCuenta)
      .input('idRepartidor',sql.BigInt,idRepartidor).input('idLiquidacion',sql.BigInt,idLiquidacion)
      .query(`UPDATE VIDA_PEDIDOS SET idLiquidacionRepartidor=@idLiquidacion
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor
                AND Status='ENTREGADO' AND MetodoPago='EFECTIVO'
                AND MontoEfectivoRepartidor IS NOT NULL AND idLiquidacionRepartidor IS NULL`);
    await new sql.Request(transaction)
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`UPDATE VIDA_REPARTIDORES SET SaldoPendiente=0, SaldoPendienteVES=0
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);
    await transaction.commit(); transaction = null;

    await registrarAuditoria(pool, {
      idBranch, idCuenta,
      entityType: 'LIQUIDACION', entityId: idLiquidacion,
      accion: 'LIQUIDACION_REPARTIDOR', actor: idUsuario,
      data: {
        idRepartidor: parseInt(idRepartidor), MontoLiquidadoUSD: saldoUSD, MontoLiquidadoVES: saldoVES,
        MontoEfectivoUSD: montoEfectivoUSD, ComisionUSD: comision,
        NumPedidos: pedidos.length, Observaciones: Observaciones || null,
      },
    }, request.log);

    return reply.send({
      ok:             true,
      idLiquidacion,
      MontoLiquidadoUSD: saldoUSD,
      MontoLiquidadoVES: saldoVES,
      NumPedidos: pedidos.length,
    });
  } catch (err) {
    if (transaction) try { await transaction.rollback(); } catch {}
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al liquidar repartidor' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — GET CONFIG DELIVERY
// GET /delivery/admin/config
// ══════════════════════════════════════════════════════════════════════════
export async function getConfigDelivery(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT Clave, Valor, Descripcion FROM VIDA_CONFIG_DELIVERY
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
              ORDER BY Clave`);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener configuración' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — SET CONFIG DELIVERY
// POST /delivery/admin/config — Body: [{ Clave, Valor }]
// ══════════════════════════════════════════════════════════════════════════
export async function setConfigDelivery(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const items = request.body; // array de { Clave, Valor }

  try {
    const pool = await getPool();
    for (const item of items) {
      await pool.request()
        .input('idBranch', sql.BigInt,    idBranch)
        .input('idCuenta', sql.BigInt,    idCuenta)
        .input('Clave',    sql.VarChar(100), item.Clave)
        .input('Valor',    sql.VarChar(500), item.Valor)
        .query(`MERGE VIDA_CONFIG_DELIVERY AS target
                USING (SELECT @idBranch AS idBranch, @idCuenta AS idCuenta,
                              @Clave AS Clave, @Valor AS Valor) AS src
                  ON target.idBranch=src.idBranch AND target.idCuenta=src.idCuenta
                     AND target.Clave=src.Clave
                WHEN MATCHED THEN
                  UPDATE SET Valor=src.Valor
                WHEN NOT MATCHED THEN
                  INSERT (idBranch,idCuenta,Clave,Valor)
                  VALUES (src.idBranch,src.idCuenta,src.Clave,src.Valor);`);
    }
    return reply.send({ ok: true, updated: items.length });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al guardar configuración' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — RUTA ACTUAL (paradas ordenadas + ETAs)
// GET /delivery/repartidor/ruta
// ══════════════════════════════════════════════════════════════════════════
export async function rutaRepartidor(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  try {
    const ruta = await recalcularRuta(idBranch, idCuenta, idRepartidor, request.log);
    return reply.send(ruta);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al calcular la ruta' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — RESUMEN DE REPARTIDORES (pedidos activos, comisiones, generado)
// GET /delivery/admin/repartidores/resumen?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// ══════════════════════════════════════════════════════════════════════════
export async function resumenRepartidores(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { desde, hasta } = request.query;

  // Rango por defecto: el día de hoy
  const fDesde = desde || fechaCaracas();
  const fHasta = hasta || fDesde;

  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('desde', sql.VarChar(10), fDesde)
      .input('hasta', sql.VarChar(10), fHasta)
      .query(`
        SELECT r.idRepartidor, r.Nombre, r.Telefono, r.Vehiculo, r.FotoURL,
               r.StatusRepartidor, r.SaldoPendiente, r.Calificacion,
               r.UltimaLatitud, r.UltimaLongitud, r.UltimaUbicacion,

               -- Pedidos activos en este momento (los que lleva encima)
               (SELECT COUNT(*) FROM VIDA_PEDIDOS p
                WHERE p.idBranch=r.idBranch AND p.idCuenta=r.idCuenta
                  AND p.idRepartidor=r.idRepartidor
                  AND p.Status IN ('REPARTIDOR_ASIGNADO','IR_A_SUCURSAL','EN_SUCURSAL','EN_CAMINO')
               ) AS PedidosActivos,

               -- Próxima entrega (menor ETA de sus pedidos activos)
               (SELECT MIN(p.ETAEntrega) FROM VIDA_PEDIDOS p
                WHERE p.idBranch=r.idBranch AND p.idCuenta=r.idCuenta
                  AND p.idRepartidor=r.idRepartidor
                  AND p.Status IN ('REPARTIDOR_ASIGNADO','IR_A_SUCURSAL','EN_SUCURSAL','EN_CAMINO')
               ) AS ProximaEntrega,

               -- Desempeño en el rango de fechas
               ISNULL(ent.Entregados, 0)      AS Entregados,
               ISNULL(ent.MontoGenerado, 0)   AS MontoGenerado,
               ISNULL(ent.Comisiones, 0)      AS Comisiones,
               ISNULL(ent.EfectivoRendido, 0) AS EfectivoRecaudado
        FROM VIDA_REPARTIDORES r
        OUTER APPLY (
          SELECT COUNT(*)                            AS Entregados,
                 SUM(p.TotalUSD)                     AS MontoGenerado,
                 SUM(ISNULL(p.ComisionRepartidor,0)) AS Comisiones,
                 SUM(ISNULL(p.MontoEfectivoRepartidor,0)) AS EfectivoRendido
          FROM VIDA_PEDIDOS p
          WHERE p.idBranch=r.idBranch AND p.idCuenta=r.idCuenta
            AND p.idRepartidor=r.idRepartidor AND p.Status='ENTREGADO'
            AND CONVERT(DATE, p.FechaMod) BETWEEN @desde AND @hasta
        ) ent
        WHERE r.idBranch=@idBranch AND r.idCuenta=@idCuenta
          AND r.Status='ACTIVO'
          AND ISNULL(r.StatusAprobacion,'APROBADO') NOT IN ('PENDIENTE','RECHAZADO')
        ORDER BY PedidosActivos DESC, r.Nombre
      `);

    return reply.send({ desde: fDesde, hasta: fHasta, repartidores: r.recordset });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener resumen de repartidores' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — MAPA EN VIVO (posiciones de repartidores + pedidos en curso)
// GET /delivery/admin/mapa-vivo
// Alimenta el mapa de logística del panel web; las actualizaciones en tiempo
// real llegan por WebSocket (repartidor_ubicacion / pedido_status).
// ══════════════════════════════════════════════════════════════════════════
export async function mapaVivoDelivery(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();

    // Repartidores con ubicación conocida y su carga actual
    const repR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`
        SELECT r.idRepartidor, r.Nombre, r.Telefono, r.Vehiculo,
               r.StatusRepartidor, r.UltimaLatitud, r.UltimaLongitud, r.UltimaUbicacion,
               (SELECT COUNT(*) FROM VIDA_PEDIDOS p
                WHERE p.idBranch=r.idBranch AND p.idCuenta=r.idCuenta
                  AND p.idRepartidor=r.idRepartidor
                  AND p.Status IN ('REPARTIDOR_ASIGNADO','IR_A_SUCURSAL','EN_SUCURSAL','EN_CAMINO')
               ) AS PedidosActivos
        FROM VIDA_REPARTIDORES r
        WHERE r.idBranch=@idBranch AND r.idCuenta=@idCuenta
          AND r.Status='ACTIVO'
          AND ISNULL(r.StatusAprobacion,'APROBADO') NOT IN ('PENDIENTE','RECHAZADO')
          AND r.StatusRepartidor IN ('DISPONIBLE','OCUPADO')
      `);

    // Pedidos en curso (con posición de sucursal y de entrega)
    const pedR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`
        SELECT p.idPedido, p.Status, p.idRepartidor, p.TotalUSD,
               p.OrdenRuta, p.ETAEntrega,
               DATEDIFF(MINUTE, GETUTCDATE(), p.ETAEntrega) AS MinutosRestantes,
               p.UbicacionEntregaLat AS EntregaLat, p.UbicacionEntregaLon AS EntregaLon,
               p.DireccionEntrega,
               c.Nombre AS NombreCliente,
               rep.Nombre AS NombreRepartidor,
               pv.NomComercial AS NombreSucursal,
               pv.Latitud  AS SucursalLat, pv.Longitud AS SucursalLon
        FROM VIDA_PEDIDOS p
        LEFT JOIN VIDA_APP_CLIENTES c
          ON c.idBranch=p.idBranch AND c.idCuenta=p.idCuenta AND c.idCliente=p.idCliente
        LEFT JOIN VIDA_REPARTIDORES rep
          ON rep.idBranch=p.idBranch AND rep.idCuenta=p.idCuenta AND rep.idRepartidor=p.idRepartidor
        LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv
          ON pv.idBranch=p.idBranch AND pv.idCuenta=p.idCuenta AND pv.idPuntoVenta=p.idPuntoVenta
        WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
          AND p.Status IN ('BUSCANDO_REPARTIDOR','REPARTIDOR_ASIGNADO','IR_A_SUCURSAL','EN_SUCURSAL','EN_CAMINO')
        ORDER BY p.FechaAlta DESC
      `);

    return reply.send({
      repartidores: repR.recordset,
      pedidos:      pedR.recordset,
      timestamp:    new Date().toISOString(),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener el mapa en vivo' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — LISTAR CONSUMIDORES FINALES (clientes de la app) con métricas
// GET /delivery/admin/clientes?q=&page=1&limit=20
// ══════════════════════════════════════════════════════════════════════════
export async function listarClientesAdmin(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { q = '', page = 1, limit = 20 } = request.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const pool = await getPool();
    const busca = `%${String(q).trim()}%`;

    const filas = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('q',        sql.VarChar(200), busca)
      .input('offset',   sql.Int, offset)
      .input('limit',    sql.Int, parseInt(limit))
      .query(`
        SELECT c.idCliente, c.Nombre, c.Apellidos, c.Telefono, c.Email,
               c.FechaAlta, c.Status,
               CASE WHEN c.GoogleId IS NOT NULL THEN 1 ELSE 0 END AS EsGoogle,
               ISNULL(ped.NumPedidos, 0)   AS NumPedidos,
               ISNULL(ped.TotalGastado, 0) AS TotalGastado,
               ped.UltimoPedido
        FROM VIDA_APP_CLIENTES c
        OUTER APPLY (
          SELECT COUNT(*) AS NumPedidos,
                 SUM(CASE WHEN p.Status='ENTREGADO' THEN p.TotalUSD ELSE 0 END) AS TotalGastado,
                 MAX(p.FechaAlta) AS UltimoPedido
          FROM VIDA_PEDIDOS p
          WHERE p.idBranch=c.idBranch AND p.idCuenta=c.idCuenta AND p.idCliente=c.idCliente
        ) ped
        WHERE c.idBranch=@idBranch AND c.idCuenta=@idCuenta
          AND (c.Nombre LIKE @q OR c.Apellidos LIKE @q OR c.Telefono LIKE @q OR c.Email LIKE @q)
        ORDER BY ped.UltimoPedido DESC, c.FechaAlta DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    const totalR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('q',        sql.VarChar(200), busca)
      .query(`SELECT COUNT(*) AS total FROM VIDA_APP_CLIENTES c
              WHERE c.idBranch=@idBranch AND c.idCuenta=@idCuenta
                AND (c.Nombre LIKE @q OR c.Apellidos LIKE @q OR c.Telefono LIKE @q OR c.Email LIKE @q)`);

    return reply.send({
      data:  filas.recordset,
      total: totalR.recordset[0].total,
      page:  parseInt(page),
      pages: Math.ceil(totalR.recordset[0].total / parseInt(limit)),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al listar consumidores' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — DETALLE DE UN CONSUMIDOR + su historial de pedidos
// GET /delivery/admin/clientes/:idCliente
// ══════════════════════════════════════════════════════════════════════════
export async function detalleClienteAdmin(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idCliente } = request.params;

  try {
    const pool = await getPool();

    const cliR = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT c.idCliente, c.Nombre, c.Apellidos, c.Telefono, c.Email,
                     c.FechaAlta, c.Status, c.EmailConfirmado,
                     CASE WHEN c.GoogleId IS NOT NULL THEN 1 ELSE 0 END AS EsGoogle
              FROM VIDA_APP_CLIENTES c
              WHERE c.idBranch=@idBranch AND c.idCuenta=@idCuenta AND c.idCliente=@idCliente`);

    if (!cliR.recordset.length) {
      return reply.code(404).send({ error: 'Consumidor no encontrado' });
    }

    // Direcciones guardadas
    const dirR = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT Alias, Direccion, EsPrincipal FROM VIDA_APP_CLIENTES_DIRECCIONES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente
                AND Status='ACTIVO' ORDER BY EsPrincipal DESC`);

    // Historial de pedidos
    const pedR = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT TOP 100
                p.idPedido, p.Status, p.MetodoPago, p.TotalUSD, p.FechaAlta,
                p.DireccionEntrega,
                pv.NomComercial AS NombreSucursal,
                rep.Nombre      AS NombreRepartidor,
                (SELECT COUNT(*) FROM VIDA_PEDIDOS_DETALLE d
                 WHERE d.idBranch=p.idBranch AND d.idCuenta=p.idCuenta AND d.idPedido=p.idPedido) AS TotalItems
              FROM VIDA_PEDIDOS p
              LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv
                ON pv.idBranch=p.idBranch AND pv.idCuenta=p.idCuenta AND pv.idPuntoVenta=p.idPuntoVenta
              LEFT JOIN VIDA_REPARTIDORES rep
                ON rep.idBranch=p.idBranch AND rep.idCuenta=p.idCuenta AND rep.idRepartidor=p.idRepartidor
              WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta AND p.idCliente=@idCliente
              ORDER BY p.FechaAlta DESC`);

    const pedidos = pedR.recordset;
    const metricas = {
      NumPedidos:   pedidos.length,
      Entregados:   pedidos.filter(p => p.Status === 'ENTREGADO').length,
      Cancelados:   pedidos.filter(p => p.Status === 'CANCELADO').length,
      TotalGastado: pedidos.filter(p => p.Status === 'ENTREGADO').reduce((s, p) => s + (p.TotalUSD || 0), 0),
    };
    metricas.TicketPromedio = metricas.Entregados ? metricas.TotalGastado / metricas.Entregados : 0;

    return reply.send({
      cliente:     cliR.recordset[0],
      direcciones: dirR.recordset,
      pedidos,
      metricas,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener el consumidor' });
  }
}
