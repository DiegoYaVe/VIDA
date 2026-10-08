// src/controllers/delivery/repartidorApp.js
// App del repartidor: registro, login, disponibilidad, ubicación, aceptar/actualizar/liberar pedidos, evidencia, historial y perfil.
// (Separado de delivery.controller.js, que reexporta todo.)
import { getPool, sql } from '../../db/sqlserver.js';
import { conIdUnico } from '../../db/idUnico.js';
import { broadcast } from '../../ws/ws.manager.js';
import { enviarPush } from '../../services/push.service.js';
import { registrarAuditoria } from '../../services/audit.service.js';
import { olvidarPedido } from '../../services/dispatchMemoria.js';
import { recalcularRuta, recalcularRutaThrottled, STATUS_ACTIVOS_REPARTIDOR } from '../../services/rutas.service.js';
import { calcularCobroEfectivoRepartidor, cobroSeguro } from '../../services/liquidacionRepartidor.service.js';
import bcrypt from 'bcrypt';
import path from 'path';
import fs from 'fs';
import { getConfigVal, nextId, nextIdTx, tokenClientePedido } from './comun.js';
import { reembolsarPuntosPedido } from './puntos.js';

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — REGISTRO DESDE LA APP (queda pendiente de aprobación)
// POST /delivery/repartidor/registro
// ══════════════════════════════════════════════════════════════════════════
export async function registrarRepartidor(request, reply) {
  const { idBranch, idCuenta, Nombre, Telefono, Email, Vehiculo, PlacaVehiculo, Contrasena } = request.body || {};

  if (!Nombre?.trim() || !Telefono?.trim()) {
    return reply.code(400).send({ error: 'Nombre y teléfono son obligatorios' });
  }
  if (!Contrasena || Contrasena.length < 6) {
    return reply.code(400).send({ error: 'La contraseña es obligatoria (mínimo 6 caracteres)' });
  }

  try {
    const pool = await getPool();

    const dup = await pool.request()
      .input('idBranch', sql.BigInt,      idBranch)
      .input('idCuenta', sql.BigInt,      idCuenta)
      .input('Telefono', sql.VarChar(30), Telefono.trim())
      .query(`SELECT idRepartidor, StatusAprobacion FROM VIDA_REPARTIDORES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Telefono=@Telefono`);
    if (dup.recordset.length) {
      const status = dup.recordset[0].StatusAprobacion;
      return reply.code(409).send({
        error: status === 'PENDIENTE'
          ? 'Ya tienes una solicitud en revisión. Te avisaremos cuando sea aprobada.'
          : 'Este teléfono ya está registrado. Intenta iniciar sesión.',
      });
    }

    const contrasenaHash = await bcrypt.hash(Contrasena, 10);
    // id con MAX()+1: si otra alta concurrente toma el mismo, se reintenta
    const idRepartidor = await conIdUnico(async () => {
      const idRepartidor = await nextId(pool, 'VIDA_REPARTIDORES', 'idRepartidor', idBranch, idCuenta);
      await pool.request()
        .input('idBranch',     sql.BigInt,       idBranch)
        .input('idCuenta',     sql.BigInt,       idCuenta)
        .input('idRepartidor', sql.BigInt,       idRepartidor)
        .input('Nombre',       sql.VarChar(200), Nombre.trim())
        .input('Telefono',     sql.VarChar(30),  Telefono.trim())
        .input('Email',        sql.VarChar(100), Email?.trim() || null)
        .input('Vehiculo',     sql.VarChar(100), Vehiculo?.trim() || null)
        .input('PlacaVehiculo',sql.VarChar(20),  PlacaVehiculo?.trim() || null)
        .input('Contrasena',   sql.NVarChar(200), contrasenaHash)
        .query(`INSERT INTO VIDA_REPARTIDORES
                  (idBranch, idCuenta, idRepartidor, Nombre, Telefono, Email, Vehiculo, PlacaVehiculo, Contrasena, StatusAprobacion)
                VALUES
                  (@idBranch, @idCuenta, @idRepartidor, @Nombre, @Telefono, @Email, @Vehiculo, @PlacaVehiculo, @Contrasena, 'PENDIENTE')`);
      return idRepartidor;
    });

    return reply.code(201).send({
      idRepartidor,
      mensaje: 'Solicitud enviada. Te avisaremos cuando el administrador apruebe tu cuenta.',
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al registrar repartidor' });
  }
}

export async function loginRepartidor(request, reply) {
  const { idBranch, idCuenta, Telefono, Contrasena } = request.body;

  if (!Contrasena) {
    return reply.code(400).send({ error: 'Ingresa tu contraseña' });
  }

  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt,    idBranch)
      .input('idCuenta', sql.BigInt,    idCuenta)
      .input('Telefono', sql.VarChar(30), Telefono)
      .query(`SELECT TOP 1 idRepartidor, Nombre, StatusRepartidor, StatusAprobacion, Contrasena
              FROM VIDA_REPARTIDORES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND Telefono=@Telefono AND Status='ACTIVO'
              ORDER BY CASE WHEN Contrasena IS NOT NULL THEN 0 ELSE 1 END, idRepartidor`);

    if (!r.recordset.length) {
      return reply.code(404).send({ error: 'Repartidor no encontrado. ¿Ya te registraste?' });
    }

    const rep = r.recordset[0];

    if (rep.StatusAprobacion === 'PENDIENTE') {
      return reply.code(403).send({
        error: 'Tu solicitud está en revisión. Te avisaremos cuando sea aprobada.',
        codigo: 'PENDIENTE_APROBACION',
      });
    }
    if (rep.StatusAprobacion === 'RECHAZADO') {
      return reply.code(403).send({
        error: 'Tu solicitud fue rechazada. Contacta al administrador.',
        codigo: 'RECHAZADO',
      });
    }

    if (rep.Contrasena) {
      const ok = await bcrypt.compare(Contrasena, rep.Contrasena);
      if (!ok) {
        return reply.code(401).send({ error: 'Contraseña incorrecta' });
      }
    } else {
      // Cuenta creada antes de la migración 12: el primer login define la contraseña
      if (Contrasena.length < 6) {
        return reply.code(400).send({ error: 'La contraseña debe tener mínimo 6 caracteres' });
      }
      const hash = await bcrypt.hash(Contrasena, 10);
      await pool.request()
        .input('idBranch',     sql.BigInt,        idBranch)
        .input('idCuenta',     sql.BigInt,        idCuenta)
        .input('idRepartidor', sql.BigInt,        rep.idRepartidor)
        .input('Contrasena',   sql.NVarChar(200), hash)
        .query(`UPDATE VIDA_REPARTIDORES SET Contrasena=@Contrasena
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                  AND idRepartidor=@idRepartidor AND Contrasena IS NULL`);
    }

    const token = request.server.jwt.sign(
      { idBranch, idCuenta, idRepartidor: rep.idRepartidor, rol: 'REPARTIDOR' },
      { expiresIn: '180d' }
    );

    return reply.send({ idRepartidor: rep.idRepartidor, Nombre: rep.Nombre, token });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error en login de repartidor' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — TOGGLE DISPONIBLE
// POST /delivery/repartidor/disponible
// ══════════════════════════════════════════════════════════════════════════
export async function toggleDisponible(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  const { disponible, Latitud, Longitud } = request.body;

  const nuevoStatus = disponible ? 'DISPONIBLE' : 'INACTIVO';

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',      sql.BigInt,      idBranch)
      .input('idCuenta',      sql.BigInt,      idCuenta)
      .input('idRepartidor',  sql.BigInt,      idRepartidor)
      .input('status',        sql.VarChar(20), nuevoStatus)
      .input('lat',           sql.Decimal(10,7), Latitud  ?? null)
      .input('lon',           sql.Decimal(10,7), Longitud ?? null)
      .query(`UPDATE VIDA_REPARTIDORES
              SET StatusRepartidor=@status,
                  UltimaLatitud = COALESCE(@lat, UltimaLatitud),
                  UltimaLongitud = COALESCE(@lon, UltimaLongitud),
                  UltimaUbicacion = CASE WHEN @lat IS NOT NULL THEN GETUTCDATE() ELSE UltimaUbicacion END
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);

    broadcast(idBranch, idCuenta, {
      tipo: 'repartidor_status',
      idRepartidor,
      status: nuevoStatus,
    });

    return reply.send({ ok: true, status: nuevoStatus });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al actualizar disponibilidad' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — ACTUALIZAR UBICACIÓN
// POST /delivery/repartidor/ubicacion
// ══════════════════════════════════════════════════════════════════════════
export async function actualizarUbicacion(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  const { Latitud, Longitud } = request.body;

  try {
    const pool = await getPool();

    await pool.request()
      .input('idBranch',     sql.BigInt,      idBranch)
      .input('idCuenta',     sql.BigInt,      idCuenta)
      .input('idRepartidor', sql.BigInt,      idRepartidor)
      .input('lat',          sql.Decimal(10,7), Latitud)
      .input('lon',          sql.Decimal(10,7), Longitud)
      .query(`UPDATE VIDA_REPARTIDORES
              SET UltimaLatitud=@lat, UltimaLongitud=@lon, UltimaUbicacion=GETUTCDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);

    broadcast(idBranch, idCuenta, {
      tipo: 'repartidor_ubicacion',
      idRepartidor,
      Latitud,
      Longitud,
    });

    // Notificar a TODOS los clientes con pedido activo de este repartidor
    const pedidoR = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`SELECT idPedido, idCliente
              FROM VIDA_PEDIDOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND idRepartidor=@idRepartidor
                AND Status IN ('REPARTIDOR_ASIGNADO','IR_A_SUCURSAL','EN_SUCURSAL','EN_CAMINO')`);

    for (const { idPedido, idCliente } of pedidoR.recordset) {
      broadcast(idBranch, idCuenta, {
        tipo: 'ubicacion_repartidor',
        idPedido,
        idCliente,
        Latitud,
        Longitud,
      });
    }

    // Con el repartidor en movimiento los ETAs cambian — recalcular con throttle
    if (pedidoR.recordset.length) {
      recalcularRutaThrottled(idBranch, idCuenta, idRepartidor, request.log);
    }

    return reply.send({ ok: true });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al actualizar ubicación' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — ACEPTAR PEDIDO
// POST /delivery/repartidor/aceptar
// ══════════════════════════════════════════════════════════════════════════
export async function aceptarPedido(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  const { idPedido } = request.body;

  try {
    const pool = await getPool();

    // Verificar que el pedido esté en BUSCANDO_REPARTIDOR
    const pedR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idPedido', sql.BigInt, idPedido)
      .query(`SELECT idPedido, Status, idPuntoVenta, idCliente,
                     DireccionEntrega, UbicacionEntregaLat, UbicacionEntregaLon,
                     TotalUSD, MetodoPago
              FROM VIDA_PEDIDOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);

    if (!pedR.recordset.length) {
      return reply.code(404).send({ error: 'Pedido no encontrado' });
    }

    const pedido = pedR.recordset[0];
    if (pedido.Status !== 'BUSCANDO_REPARTIDOR') {
      return reply.code(409).send({ error: `Pedido ya no está disponible (status: ${pedido.Status})` });
    }

    // Ya lo soltó antes: no puede volver a tomarlo (el filtro de
    // pedidos-disponibles ya lo esconde, esto cierra la puerta del endpoint)
    const libR = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idPedido',     sql.BigInt, idPedido)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`SELECT TOP 1 1 AS libero FROM VIDA_PEDIDOS_LIBERADOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND idPedido=@idPedido AND idRepartidor=@idRepartidor`);
    if (libR.recordset.length) {
      return reply.code(409).send({ error: 'Ya liberaste este pedido: lo tomará otro repartidor' });
    }

    // Límite de pedidos simultáneos por repartidor (config MaxPedidosPorRepartidor)
    const maxPedidos = parseInt(await getConfigVal(pool, idBranch, idCuenta, 'MaxPedidosPorRepartidor', '3')) || 3;
    const activosR = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`SELECT COUNT(*) AS activos FROM VIDA_PEDIDOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor
                AND Status IN ('${STATUS_ACTIVOS_REPARTIDOR.join("','")}')`);
    const activos = activosR.recordset[0].activos;
    if (activos >= maxPedidos) {
      return reply.code(409).send({
        error: `Ya llevas ${activos} pedidos activos (máximo ${maxPedidos}). Entrega alguno antes de aceptar otro.`,
        maxPedidos,
        activos,
      });
    }

    // Asignar repartidor de forma atómica: la condición Status='BUSCANDO_REPARTIDOR'
    // en el UPDATE garantiza que solo el primero de dos repartidores simultáneos gana
    const asignaR = await pool.request()
      .input('idBranch',     sql.BigInt,      idBranch)
      .input('idCuenta',     sql.BigInt,      idCuenta)
      .input('idPedido',     sql.BigInt,      idPedido)
      .input('idRepartidor', sql.BigInt,      idRepartidor)
      .query(`UPDATE VIDA_PEDIDOS
              SET idRepartidor=@idRepartidor, Status='REPARTIDOR_ASIGNADO', FechaMod=GETUTCDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido
                AND Status='BUSCANDO_REPARTIDOR'`);

    if (asignaR.rowsAffected[0] === 0) {
      return reply.code(409).send({ error: 'Otro repartidor ya tomó este pedido' });
    }

    await pool.request()
      .input('idBranch',     sql.BigInt,      idBranch)
      .input('idCuenta',     sql.BigInt,      idCuenta)
      .input('idRepartidor', sql.BigInt,      idRepartidor)
      .query(`UPDATE VIDA_REPARTIDORES SET StatusRepartidor='OCUPADO'
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);

    // Obtener datos del repartidor
    const repR = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`SELECT Nombre, Telefono FROM VIDA_REPARTIDORES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);
    const rep = repR.recordset[0];

    // Obtener dirección de la sucursal
    const pvR = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idPuntoVenta', sql.BigInt, pedido.idPuntoVenta)
      .query(`SELECT NomComercial,
                     CONCAT(ISNULL(Calle,''), ' ', ISNULL(NumExt,''), ' ',
                            ISNULL(Colonia,''), ' ', ISNULL(Ciudad,'')) AS Direccion,
                     Latitud, Longitud, Telefono
              FROM VIDA_CUENTA_PUNTOS_VENTA
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@idPuntoVenta`);

    // Obtener items del pedido
    const itemsR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idPedido', sql.BigInt, idPedido)
      .query(`SELECT d.idProducto, p.Nombre, d.Cantidad, d.PrecioUnitario,
                     d.Cantidad * d.PrecioUnitario AS Subtotal
              FROM VIDA_PEDIDOS_DETALLE d
              LEFT JOIN VIDA_INVENTARIO_PRODUCTOS p
                ON p.idBranch=d.idBranch AND p.idCuenta=d.idCuenta AND p.idProducto=d.idProducto
              WHERE d.idBranch=@idBranch AND d.idCuenta=@idCuenta AND d.idPedido=@idPedido`);

    // Push al cliente: su pedido fue aceptado
    tokenClientePedido(pool, idBranch, idCuenta, pedido.idCliente)
      .then(token => token && enviarPush(token, {
        title: '✅ Pedido aceptado',
        body: `${rep?.Nombre || 'Un repartidor'} va por tu pedido #${idPedido}`,
        data: { tipo: 'status_pedido', idPedido, status: 'REPARTIDOR_ASIGNADO' },
      }, request.log))
      .catch(() => {});

    broadcast(idBranch, idCuenta, {
      tipo:             'pedido_asignado',
      idPedido,
      idRepartidor,
      NombreRepartidor: rep.Nombre,
      Telefono:         rep.Telefono,
    });

    // La ruta cambió: reordenar paradas y ETAs con el pedido nuevo incluido
    let ruta = null;
    try {
      ruta = await recalcularRuta(idBranch, idCuenta, idRepartidor, request.log);
    } catch (errRuta) {
      request.log.error('recalcularRuta al aceptar falló: ' + errRuta.message);
    }

    return reply.send({
      idPedido,
      status:           'REPARTIDOR_ASIGNADO',
      ruta,
      sucursal:         pvR.recordset[0],
      DireccionEntrega: pedido.DireccionEntrega,
      UbicacionEntregaLat: pedido.UbicacionEntregaLat,
      UbicacionEntregaLon: pedido.UbicacionEntregaLon,
      TotalUSD:         pedido.TotalUSD,
      MetodoPago:       pedido.MetodoPago,
      items:            itemsR.recordset,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al aceptar pedido' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — ACTUALIZAR STATUS DEL PEDIDO
// POST /delivery/repartidor/status-pedido
// ══════════════════════════════════════════════════════════════════════════
// Antes de recoger en sucursal el repartidor NO puede cancelar el pedido del
// cliente: su salida es liberarlo (liberarPedido) para que lo tome otro.
// Una vez que tiene la mercancia encima ya no puede pasarsela a nadie, asi
// que ahi si se le permite cancelar — pero con motivo obligatorio.
const TRANSICIONES_DELIVERY = {
  REPARTIDOR_ASIGNADO: ['IR_A_SUCURSAL'],
  IR_A_SUCURSAL:       ['EN_SUCURSAL'],
  EN_SUCURSAL:         ['EN_CAMINO',  'CANCELADO'],
  EN_CAMINO:           ['ENTREGADO',  'CANCELADO'],
};

// Estados en los que el pedido todavia esta en la sucursal: se puede liberar
const LIBERABLES = ['REPARTIDOR_ASIGNADO', 'IR_A_SUCURSAL'];

export async function actualizarStatusPedido(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  const { idPedido, nuevoStatus } = request.body;
  const motivo = (request.body?.motivo || '').trim().slice(0, 200);

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  let enTransaccion = false;

  try {
    const pedR = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idPedido',     sql.BigInt, idPedido)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`SELECT p.Status, p.MetodoPago, p.TotalUSD, p.PagoMonedaJSON,
                     p.idPuntoVenta, p.idCliente, r.ComisionPct
              FROM VIDA_PEDIDOS p
              LEFT JOIN VIDA_REPARTIDORES r
                ON r.idBranch=p.idBranch AND r.idCuenta=p.idCuenta AND r.idRepartidor=p.idRepartidor
              WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
                AND p.idPedido=@idPedido AND p.idRepartidor=@idRepartidor`);

    if (!pedR.recordset.length) {
      return reply.code(404).send({ error: 'Pedido no encontrado o no asignado a este repartidor' });
    }

    const pedido = pedR.recordset[0];
    const statusActual = pedido.Status;
    const permitidos = TRANSICIONES_DELIVERY[statusActual] ?? [];

    if (!permitidos.includes(nuevoStatus)) {
      // Cancelar antes de recoger ya no es transición válida: se libera
      if (nuevoStatus === 'CANCELADO' && LIBERABLES.includes(statusActual)) {
        return reply.code(422).send({
          error: 'Todavía no recogiste el pedido: liberalo para que lo tome otro repartidor en vez de cancelarlo.',
          liberable: true,
          permitidos,
        });
      }
      return reply.code(422).send({
        error: `Transición inválida: ${statusActual} → ${nuevoStatus}`,
        permitidos,
      });
    }

    // Cancelar un pedido ya recogido deja al cliente sin su compra: exigimos
    // motivo para que quede en el historial y la auditoría
    if (nuevoStatus === 'CANCELADO' && motivo.length < 3) {
      return reply.code(400).send({ error: 'Indicá el motivo de la cancelación' });
    }

    // Comisión: del repartidor o de la config global (fuera de la transacción).
    // Se registra en TODA entrega; el efectivo a rendir solo aplica a EFECTIVO.
    const esEntrega = nuevoStatus === 'ENTREGADO';
    const esEntregaEfectivo = esEntrega && pedido.MetodoPago === 'EFECTIVO';
    let comision = 0, efectivoARendir = 0, liquidacionMoneda = null;
    if (esEntrega) {
      const pctComision = pedido.ComisionPct != null
        ? parseFloat(pedido.ComisionPct)
        : parseFloat(await getConfigVal(pool, idBranch, idCuenta, 'ComisionRepartidorPct', '0'));
      comision = parseFloat(pedido.TotalUSD) * pctComision / 100;
      if (esEntregaEfectivo) {
        liquidacionMoneda = calcularCobroEfectivoRepartidor({
          totalUSD: pedido.TotalUSD, comisionUSD: comision,
          pagoMonedaJSON: pedido.PagoMonedaJSON,
        });
        efectivoARendir = liquidacionMoneda.MontoARendirUSD;
      }
    }

    await transaction.begin();
    enTransaccion = true;

    // Actualizar pedido exigiendo el status leído: si otra petición (doble tap,
    // admin desde el panel) ya lo cambió, no se toca stock ni saldo dos veces
    const updReq = new sql.Request(transaction)
      .input('idBranch',     sql.BigInt,       idBranch)
      .input('idCuenta',     sql.BigInt,       idCuenta)
      .input('idPedido',     sql.BigInt,       idPedido)
      .input('nuevoStatus',  sql.VarChar(40),  nuevoStatus)
      .input('statusActual', sql.VarChar(40),  statusActual)
      .input('comision',     sql.Decimal(18,4), comision)
      .input('efectivo',     sql.Decimal(18,4), efectivoARendir)
      .input('liquidacionJSON', sql.NVarChar(sql.MAX), liquidacionMoneda ? JSON.stringify(liquidacionMoneda) : null)
      .input('motivo',       sql.VarChar(200), motivo || null);

    const setComision = esEntrega
      ? `, ComisionRepartidor=@comision${esEntregaEfectivo ? ', MontoEfectivoRepartidor=@efectivo, LiquidacionRepartidorJSON=@liquidacionJSON' : ''}`
      : '';
    const setMotivo = nuevoStatus === 'CANCELADO' ? ', MotivoCancelacion=@motivo' : '';

    const updR = await updReq.query(`UPDATE VIDA_PEDIDOS
            SET Status=@nuevoStatus, FechaMod=GETUTCDATE() ${setComision}${setMotivo}
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido
              AND Status=@statusActual`);

    if (updR.rowsAffected[0] === 0) {
      await transaction.rollback();
      enTransaccion = false;
      return reply.code(409).send({ error: 'El pedido fue modificado por otra operación' });
    }

    if (nuevoStatus === 'ENTREGADO') {
      // Descontar inventario del pedido entregado (los pedidos APP no manejan
      // reserva: solo se descuenta Cantidad) + registrar movimiento
      const detR = await new sql.Request(transaction)
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta)
        .input('idPedido', sql.BigInt, idPedido)
        .query(`SELECT idProducto, Cantidad FROM VIDA_PEDIDOS_DETALLE
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);

      for (const item of detR.recordset) {
        const stockR = await new sql.Request(transaction)
          .input('idBranch',    sql.BigInt,       idBranch)
          .input('idCuenta',    sql.BigInt,       idCuenta)
          .input('idPuntoVenta',sql.BigInt,       pedido.idPuntoVenta)
          .input('idProducto',  sql.BigInt,       item.idProducto)
          .input('Cantidad',    sql.Decimal(18,4), parseFloat(item.Cantidad))
          .query(`UPDATE VIDA_INVENTARIO_STOCK WITH (UPDLOCK, HOLDLOCK) SET
                    Cantidad = CASE WHEN ISNULL(Cantidad,0) - @Cantidad < 0 THEN 0
                                    ELSE ISNULL(Cantidad,0) - @Cantidad END,
                    FechaMod = GETUTCDATE()
                  OUTPUT ISNULL(deleted.Cantidad,0) AS CantidadAntes,
                         ISNULL(inserted.Cantidad,0) AS CantidadDespues
                  WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                    AND idPuntoVenta=@idPuntoVenta AND idProducto=@idProducto`);

        const s = stockR.recordset[0] || { CantidadAntes: 0, CantidadDespues: 0 };

        const movId = await nextIdTx(transaction, 'VIDA_INVENTARIO_MOVIMIENTOS', 'idMovimiento', idBranch, idCuenta);
        await new sql.Request(transaction)
          .input('idBranch',        sql.BigInt,       idBranch)
          .input('idCuenta',        sql.BigInt,       idCuenta)
          .input('idMovimiento',    sql.BigInt,       movId)
          .input('idPuntoVenta',    sql.BigInt,       pedido.idPuntoVenta)
          .input('idProducto',      sql.BigInt,       item.idProducto)
          .input('Cantidad',        sql.Decimal(18,4), parseFloat(item.Cantidad))
          .input('CantidadAntes',   sql.Decimal(18,4), parseFloat(s.CantidadAntes))
          .input('CantidadDespues', sql.Decimal(18,4), parseFloat(s.CantidadDespues))
          .input('Motivo',          sql.VarChar(300),  `Entrega delivery pedido #${idPedido}`)
          .input('Referencia',      sql.VarChar(100),  String(idPedido))
          .input('UsuAlta',         sql.VarChar(20),   `REP:${idRepartidor}`)
          .query(`INSERT INTO VIDA_INVENTARIO_MOVIMIENTOS
                    (idBranch, idCuenta, idMovimiento, idPuntoVenta, idProducto,
                     TipoMovimiento, Cantidad, CantidadAntes, CantidadDespues,
                     Motivo, Referencia, UsuAlta)
                  VALUES
                    (@idBranch, @idCuenta, @idMovimiento, @idPuntoVenta, @idProducto,
                     'SALIDA', @Cantidad, @CantidadAntes, @CantidadDespues,
                     @Motivo, @Referencia, @UsuAlta)`);
      }

      if (esEntregaEfectivo) {
        await new sql.Request(transaction)
          .input('idBranch',     sql.BigInt,       idBranch)
          .input('idCuenta',     sql.BigInt,       idCuenta)
          .input('idRepartidor', sql.BigInt,       idRepartidor)
          // Saldo físico por moneda (el combinado suma a las dos)
          .input('efectivoUSD',  sql.Decimal(18,4), liquidacionMoneda?.Moneda === 'MIXTA' ? liquidacionMoneda.MontoARendirUSDOriginal
                                                     : liquidacionMoneda?.Moneda === 'VES' ? 0 : efectivoARendir)
          .input('efectivoVES',  sql.Decimal(18,4), liquidacionMoneda?.Moneda === 'MIXTA' ? liquidacionMoneda.MontoARendirVESOriginal
                                                     : liquidacionMoneda?.Moneda === 'VES' ? liquidacionMoneda.MontoARendirOriginal : 0)
          .query(`UPDATE VIDA_REPARTIDORES
                  SET SaldoPendiente = ISNULL(SaldoPendiente,0) + @efectivoUSD,
                      SaldoPendienteVES = ISNULL(SaldoPendienteVES,0) + @efectivoVES
                  WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);
      }

      // ── Fidelización: acreditar puntos al cliente (idempotente por pedido) ──
      if (pedido.idCliente) {
        const puntosPorDolar = parseInt(await getConfigVal(pool, idBranch, idCuenta, 'PuntosPorDolar', '10')) || 10;
        const puntos = Math.round(parseFloat(pedido.TotalUSD || 0) * puntosPorDolar);
        if (puntos > 0) {
          const yaR = await new sql.Request(transaction)
            .input('idBranch', sql.BigInt, idBranch)
            .input('idCuenta', sql.BigInt, idCuenta)
            .input('idPedido', sql.BigInt, idPedido)
            .query(`SELECT TOP 1 idMovimiento FROM VIDA_CLIENTE_PUNTOS
                    WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido AND Tipo='GANADO'`);
          if (!yaR.recordset.length) {
            const movId = await nextIdTx(transaction, 'VIDA_CLIENTE_PUNTOS', 'idMovimiento', idBranch, idCuenta);
            await new sql.Request(transaction)
              .input('idBranch',     sql.BigInt,      idBranch)
              .input('idCuenta',     sql.BigInt,      idCuenta)
              .input('idMovimiento', sql.BigInt,      movId)
              .input('idCliente',    sql.BigInt,      pedido.idCliente)
              .input('Puntos',       sql.Int,         puntos)
              .input('idPedido',     sql.BigInt,      idPedido)
              .input('Descripcion',  sql.NVarChar(200), `Compra pedido #${idPedido}`)
              .query(`INSERT INTO VIDA_CLIENTE_PUNTOS
                        (idBranch, idCuenta, idMovimiento, idCliente, Tipo, Puntos, idPedido, Descripcion)
                      VALUES (@idBranch, @idCuenta, @idMovimiento, @idCliente, 'GANADO', @Puntos, @idPedido, @Descripcion)`);
            await new sql.Request(transaction)
              .input('idBranch',  sql.BigInt, idBranch)
              .input('idCuenta',  sql.BigInt, idCuenta)
              .input('idCliente', sql.BigInt, pedido.idCliente)
              .input('Puntos',    sql.Int,    puntos)
              .query(`UPDATE VIDA_APP_CLIENTES SET PuntosSaldo = ISNULL(PuntosSaldo,0) + @Puntos
                      WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
          }
        }
      }
    }

    // Multi-pedido: el repartidor queda DISPONIBLE solo cuando ya no tiene
    // ningún pedido activo (puede llevar varios a la vez)
    if (nuevoStatus === 'ENTREGADO' || nuevoStatus === 'CANCELADO') {
      await new sql.Request(transaction)
        .input('idBranch',     sql.BigInt, idBranch)
        .input('idCuenta',     sql.BigInt, idCuenta)
        .input('idRepartidor', sql.BigInt, idRepartidor)
        .query(`UPDATE VIDA_REPARTIDORES SET StatusRepartidor='DISPONIBLE'
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor
                  AND NOT EXISTS (
                    SELECT 1 FROM VIDA_PEDIDOS p
                    WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
                      AND p.idRepartidor=@idRepartidor
                      AND p.Status IN ('${STATUS_ACTIVOS_REPARTIDOR.join("','")}'))`);
    }

    // Si se cancela, devolver al cliente los puntos que hubiera canjeado
    if (nuevoStatus === 'CANCELADO') {
      await reembolsarPuntosPedido(() => new sql.Request(transaction), idBranch, idCuenta, idPedido);
    }

    // Historial del pedido (el panel admin lo muestra como línea de tiempo)
    const histId = await nextIdTx(transaction, 'VIDA_PEDIDOS_HISTORIAL', 'idHistorial', idBranch, idCuenta);
    await new sql.Request(transaction)
      .input('idBranch',      sql.BigInt,      idBranch)
      .input('idCuenta',      sql.BigInt,      idCuenta)
      .input('idHistorial',   sql.BigInt,      histId)
      .input('idPedido',      sql.BigInt,      idPedido)
      .input('StatusAnterior',sql.VarChar(40), statusActual)
      .input('StatusNuevo',   sql.VarChar(40), nuevoStatus)
      .input('Notas',         sql.VarChar(500), motivo || null)
      .input('UsuAlta',       sql.VarChar(20), `REP:${idRepartidor}`)
      .query(`INSERT INTO VIDA_PEDIDOS_HISTORIAL
                (idBranch, idCuenta, idHistorial, idPedido, StatusAnterior, StatusNuevo, Notas, UsuAlta)
              VALUES (@idBranch, @idCuenta, @idHistorial, @idPedido, @StatusAnterior, @StatusNuevo, @Notas, @UsuAlta)`);

    if (['ENTREGADO', 'CANCELADO'].includes(nuevoStatus)) {
      await registrarAuditoria(transaction, {
        idBranch, idCuenta,
        entityType: 'PEDIDO', entityId: idPedido,
        accion: nuevoStatus, actor: `REP:${idRepartidor}`,
        data: {
          StatusAnterior: statusActual, TotalUSD: parseFloat(pedido.TotalUSD),
          MetodoPago: pedido.MetodoPago,
          ...(nuevoStatus === 'CANCELADO' ? { Motivo: motivo } : {}),
          ...(esEntrega ? { ComisionRepartidor: comision } : {}),
          ...(esEntregaEfectivo ? { EfectivoARendir: efectivoARendir, LiquidacionMoneda: liquidacionMoneda } : {}),
        },
      }, request.log);
    }

    await transaction.commit();
    enTransaccion = false;

    broadcast(idBranch, idCuenta, {
      tipo:       'pedido_status',
      idPedido,
      idRepartidor,
      nuevoStatus,
    });

    // Cada transición cambia la ruta (se recogió, se entregó, se canceló):
    // reordenar paradas y ETAs de los pedidos que le quedan al repartidor
    recalcularRuta(idBranch, idCuenta, idRepartidor, request.log)
      .catch(errRuta => request.log.error('recalcularRuta post-status falló: ' + errRuta.message));

    // Push al cliente en los hitos que le importan
    const MENSAJES_CLIENTE = {
      EN_CAMINO: { title: '🛵 Tu pedido va en camino', body: `El repartidor salió con tu pedido #${idPedido}` },
      ENTREGADO: { title: '📦 Pedido entregado', body: `Tu pedido #${idPedido} fue entregado. ¡Gracias por tu compra!` },
      CANCELADO: { title: '❌ Pedido cancelado', body: `Tu pedido #${idPedido} fue cancelado` },
    };
    if (MENSAJES_CLIENTE[nuevoStatus]) {
      tokenClientePedido(pool, idBranch, idCuenta, pedido.idCliente)
        .then(token => token && enviarPush(token, {
          ...MENSAJES_CLIENTE[nuevoStatus],
          data: { tipo: 'status_pedido', idPedido, status: nuevoStatus },
        }, request.log))
        .catch(() => {});
    }

    return reply.send({ ok: true, nuevoStatus });
  } catch (err) {
    if (enTransaccion) {
      try { await transaction.rollback(); } catch (rbErr) { request.log.error('Rollback falló: ' + rbErr.message); }
    }
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al actualizar status del pedido' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — LIBERAR PEDIDO (devolverlo al pool)
// POST /delivery/repartidor/liberar
//
// Solo antes de recoger en sucursal (LIBERABLES). El pedido vuelve a
// BUSCANDO_REPARTIDOR y el job procesarBusquedas lo re-ofrece solo, con el
// radio escalonado de siempre. Tres cosas que no son obvias:
//   1. Se repone FechaLimiteBusqueda: se calcula desde FechaAlta, así que un
//      pedido viejo liberado se auto-cancelaría en el siguiente tick.
//      AvisoSinRepartidor se deja como estaba a propósito: resetearlo hace
//      que procesarBusquedas le mande al cliente el aviso de 'seguimos
//      buscando' en el tick siguiente, pisando el push de la liberación.
//   2. Se registra en VIDA_PEDIDOS_LIBERADOS para NO volver a ofrecérselo al
//      que lo soltó (ni por polling ni por el despacho escalonado).
//   3. Se limpian OrdenRuta/ETA/DistanciaKm: ya no es parada de nadie.
// ══════════════════════════════════════════════════════════════════════════
export async function liberarPedido(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  const { idPedido } = request.body;
  const motivo = (request.body?.motivo || '').trim().slice(0, 200);

  if (!idPedido) return reply.code(400).send({ error: 'Falta idPedido' });

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  let enTransaccion = false;

  try {
    const pedR = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idPedido',     sql.BigInt, idPedido)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`SELECT Status, idCliente, idPuntoVenta, TotalUSD
              FROM VIDA_PEDIDOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND idPedido=@idPedido AND idRepartidor=@idRepartidor`);

    if (!pedR.recordset.length) {
      return reply.code(404).send({ error: 'Pedido no encontrado o no asignado a este repartidor' });
    }

    const pedido = pedR.recordset[0];
    const statusActual = pedido.Status;

    if (!LIBERABLES.includes(statusActual)) {
      return reply.code(422).send({
        error: 'Ya recogiste este pedido en la sucursal: no se puede pasar a otro repartidor. Si no podés entregarlo, cancelalo indicando el motivo.',
        status: statusActual,
        cancelable: TRANSICIONES_DELIVERY[statusActual]?.includes('CANCELADO') ?? false,
      });
    }

    const prorrogaMin = parseInt(
      await getConfigVal(pool, idBranch, idCuenta, 'ProrrogaLiberacionMin', '15')) || 15;

    await transaction.begin();
    enTransaccion = true;

    // La guarda Status=@statusActual AND idRepartidor=@idRepartidor hace que
    // dos peticiones simultáneas (doble tap) no liberen el pedido dos veces
    // ni pisen una reasignación hecha desde el panel
    const updR = await new sql.Request(transaction)
      .input('idBranch',     sql.BigInt,      idBranch)
      .input('idCuenta',     sql.BigInt,      idCuenta)
      .input('idPedido',     sql.BigInt,      idPedido)
      .input('idRepartidor', sql.BigInt,      idRepartidor)
      .input('statusActual', sql.VarChar(40), statusActual)
      .input('prorroga',     sql.Int,         prorrogaMin)
      .query(`UPDATE VIDA_PEDIDOS
              SET Status='BUSCANDO_REPARTIDOR',
                  idRepartidor=NULL,
                  FechaLimiteBusqueda=DATEADD(MINUTE, @prorroga, GETUTCDATE()),
                  VecesLiberado=ISNULL(VecesLiberado,0)+1,
                  OrdenRuta=NULL, DistanciaKm=NULL, ETAEntrega=NULL,
                  FechaMod=GETUTCDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido
                AND Status=@statusActual AND idRepartidor=@idRepartidor`);

    if (updR.rowsAffected[0] === 0) {
      await transaction.rollback();
      enTransaccion = false;
      return reply.code(409).send({ error: 'El pedido fue modificado por otra operación' });
    }

    // Idempotente por la PK compuesta: si ya estaba registrado, no reinserta
    await new sql.Request(transaction)
      .input('idBranch',     sql.BigInt,       idBranch)
      .input('idCuenta',     sql.BigInt,       idCuenta)
      .input('idPedido',     sql.BigInt,       idPedido)
      .input('idRepartidor', sql.BigInt,       idRepartidor)
      .input('statusActual', sql.VarChar(20),  statusActual)
      .input('motivo',       sql.VarChar(200), motivo || null)
      .query(`INSERT INTO VIDA_PEDIDOS_LIBERADOS
                (idBranch, idCuenta, idPedido, idRepartidor, StatusAlLiberar, Motivo)
              SELECT @idBranch, @idCuenta, @idPedido, @idRepartidor, @statusActual, @motivo
              WHERE NOT EXISTS (
                SELECT 1 FROM VIDA_PEDIDOS_LIBERADOS
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                  AND idPedido=@idPedido AND idRepartidor=@idRepartidor)`);

    // Queda DISPONIBLE solo si no le sobra ningún otro pedido activo
    await new sql.Request(transaction)
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`UPDATE VIDA_REPARTIDORES SET StatusRepartidor='DISPONIBLE'
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor
                AND NOT EXISTS (
                  SELECT 1 FROM VIDA_PEDIDOS p
                  WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
                    AND p.idRepartidor=@idRepartidor
                    AND p.Status IN ('${STATUS_ACTIVOS_REPARTIDOR.join("','")}'))`);

    const histId = await nextIdTx(transaction, 'VIDA_PEDIDOS_HISTORIAL', 'idHistorial', idBranch, idCuenta);
    await new sql.Request(transaction)
      .input('idBranch',      sql.BigInt,       idBranch)
      .input('idCuenta',      sql.BigInt,       idCuenta)
      .input('idHistorial',   sql.BigInt,       histId)
      .input('idPedido',      sql.BigInt,       idPedido)
      .input('StatusAnterior',sql.VarChar(40),  statusActual)
      .input('StatusNuevo',   sql.VarChar(40),  'BUSCANDO_REPARTIDOR')
      .input('Notas',         sql.VarChar(500), `Liberado por el repartidor${motivo ? `: ${motivo}` : ''}`)
      .input('UsuAlta',       sql.VarChar(20),  `REP:${idRepartidor}`)
      .query(`INSERT INTO VIDA_PEDIDOS_HISTORIAL
                (idBranch, idCuenta, idHistorial, idPedido, StatusAnterior, StatusNuevo, Notas, UsuAlta)
              VALUES (@idBranch, @idCuenta, @idHistorial, @idPedido, @StatusAnterior, @StatusNuevo, @Notas, @UsuAlta)`);

    await registrarAuditoria(transaction, {
      idBranch, idCuenta,
      entityType: 'PEDIDO', entityId: idPedido,
      accion: 'LIBERADO', actor: `REP:${idRepartidor}`,
      data: {
        StatusAnterior: statusActual,
        TotalUSD: parseFloat(pedido.TotalUSD),
        Motivo: motivo || null,
        ProrrogaMin: prorrogaMin,
      },
    }, request.log);

    await transaction.commit();
    enTransaccion = false;

    // Que el proximo tick del despacho lo trate como pedido nuevo y vuelva a
    // notificar (con el que lo solto ya excluido por VIDA_PEDIDOS_LIBERADOS)
    olvidarPedido(idPedido);

    // La ruta del que lo soltó cambió: reordenar sus paradas restantes
    recalcularRuta(idBranch, idCuenta, idRepartidor, request.log)
      .catch(errRuta => request.log.error('recalcularRuta post-liberar falló: ' + errRuta.message));

    // Panel admin (Logística y Pedidos escuchan eventos distintos)
    broadcast(idBranch, idCuenta, { tipo: 'pedido_status', idPedido, idRepartidor: null, nuevoStatus: 'BUSCANDO_REPARTIDOR' });
    broadcast(idBranch, idCuenta, { tipo: 'pedido:actualizado', idPedido, StatusNuevo: 'BUSCANDO_REPARTIDOR' });
    // App del cliente: el badge y el refetch (ya no tiene repartidor asignado)
    broadcast(idBranch, idCuenta, { tipo: 'status_pedido',   idPedido, idCliente: pedido.idCliente, estado: 'BUSCANDO_REPARTIDOR' });
    broadcast(idBranch, idCuenta, { tipo: 'pedido_liberado', idPedido, idCliente: pedido.idCliente });

    tokenClientePedido(pool, idBranch, idCuenta, pedido.idCliente)
      .then(token => token && enviarPush(token, {
        title: '🔄 Buscando otro repartidor',
        body: `El repartidor no pudo seguir con tu pedido #${idPedido}. Ya lo estamos ofreciendo a otro.`,
        data: { tipo: 'status_pedido', idPedido, status: 'BUSCANDO_REPARTIDOR' },
      }, request.log))
      .catch(() => {});

    return reply.send({ ok: true, idPedido, nuevoStatus: 'BUSCANDO_REPARTIDOR', prorrogaMin });
  } catch (err) {
    if (enTransaccion) {
      try { await transaction.rollback(); } catch (rbErr) { request.log.error('Rollback falló: ' + rbErr.message); }
    }
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al liberar el pedido' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — SUBIR EVIDENCIA DE ENTREGA (foto, multipart)
// POST /delivery/repartidor/pedido/:idPedido/evidencia
// ══════════════════════════════════════════════════════════════════════════
export async function subirEvidenciaEntrega(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  const { idPedido } = request.params;

  try {
    const pool = await getPool();

    // El pedido debe estar asignado a este repartidor
    const pedR = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idPedido',     sql.BigInt, idPedido)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`SELECT idPedido FROM VIDA_PEDIDOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND idPedido=@idPedido AND idRepartidor=@idRepartidor`);
    if (!pedR.recordset.length) {
      return reply.code(404).send({ error: 'Pedido no encontrado o no asignado' });
    }

    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No se recibió la foto' });

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(data.mimetype)) {
      return reply.code(400).send({ error: 'Solo se permiten imágenes JPG, PNG o WebP' });
    }

    const uploadDir = path.join(process.cwd(), 'uploads', 'evidencias');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const ext = (data.filename.split('.').pop() || 'jpg').toLowerCase();
    const filename = `entrega_${idBranch}_${idCuenta}_${idPedido}_${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(uploadDir, filename), await data.toBuffer());
    const url = `/uploads/evidencias/${filename}`;

    await pool.request()
      .input('idBranch', sql.BigInt,       idBranch)
      .input('idCuenta', sql.BigInt,       idCuenta)
      .input('idPedido', sql.BigInt,       idPedido)
      .input('url',      sql.VarChar(300), url)
      .query(`UPDATE VIDA_PEDIDOS SET EvidenciaEntregaURL=@url, FechaMod=GETUTCDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);

    return reply.code(201).send({ url });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al subir evidencia' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — PEDIDOS ACTIVOS
// GET /delivery/repartidor/pedidos-activos
// ══════════════════════════════════════════════════════════════════════════
// Adjunta a cada pedido lo que el repartidor debe cobrar (moneda y monto
// físico); el snapshot crudo no viaja a la app.
function conCobro({ PagoMonedaJSON, ...p }) {
  return { ...p, Cobro: cobroSeguro({ metodoPago: p.MetodoPago, totalUSD: p.TotalUSD, pagoMonedaJSON: PagoMonedaJSON }) };
}

export async function pedidosActivos(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`
        SELECT p.idPedido, p.Status, p.MetodoPago, p.TotalUSD, p.PagoMonedaJSON,
               p.DireccionEntrega, p.UbicacionEntregaLat, p.UbicacionEntregaLon,
               p.NotasCliente, p.FechaAlta, p.idPuntoVenta,
               p.OrdenRuta, p.DistanciaKm, p.ETAEntrega,
               DATEDIFF(MINUTE, GETUTCDATE(), p.ETAEntrega) AS MinutosRestantes,
               c.Nombre AS NombreCliente, c.Telefono AS TelefonoCliente,
               pv.NomComercial AS NombreSucursal,
               CONCAT(ISNULL(pv.Calle,''), ' ', ISNULL(pv.NumExt,''), ' ',
                      ISNULL(pv.Colonia,''), ' ', ISNULL(pv.Ciudad,'')) AS DireccionSucursal,
               pv.Latitud AS LatSucursal, pv.Longitud AS LonSucursal
        FROM VIDA_PEDIDOS p
        LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv
          ON pv.idBranch=p.idBranch AND pv.idCuenta=p.idCuenta AND pv.idPuntoVenta=p.idPuntoVenta
        LEFT JOIN VIDA_APP_CLIENTES c
          ON c.idBranch=p.idBranch AND c.idCuenta=p.idCuenta AND c.idCliente=p.idCliente
        WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
          AND p.idRepartidor=@idRepartidor
          AND p.Status NOT IN ('ENTREGADO','CANCELADO')
        ORDER BY ISNULL(p.OrdenRuta, 999), p.FechaAlta ASC
      `);
    // Productos de cada pedido, para revisar al recoger y al entregar
    const ids = r.recordset.map(p => Number(p.idPedido)).filter(Number.isSafeInteger);
    const items = new Map();
    if (ids.length) {
      const d = await pool.request()
        .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
        .query(`SELECT d.idPedido, ISNULL(pr.Nombre, CONCAT('Producto ', d.idProducto)) AS Nombre, d.Cantidad
                FROM VIDA_PEDIDOS_DETALLE d
                LEFT JOIN VIDA_INVENTARIO_PRODUCTOS pr ON pr.idBranch=d.idBranch AND pr.idCuenta=d.idCuenta AND pr.idProducto=d.idProducto
                WHERE d.idBranch=@idBranch AND d.idCuenta=@idCuenta AND d.idPedido IN (${ids.join(',')})
                ORDER BY d.idPedido, d.idDetalle`);
      for (const it of d.recordset) {
        const k = String(it.idPedido);
        if (!items.has(k)) items.set(k, []);
        items.get(k).push({ Nombre: it.Nombre, Cantidad: Number(it.Cantidad) });
      }
    }
    return reply.send(r.recordset.map(p => ({ ...conCobro(p), items: items.get(String(p.idPedido)) || [] })));
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener pedidos activos' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — PEDIDOS DISPONIBLES (BUSCANDO_REPARTIDOR)
// GET /delivery/repartidor/pedidos-disponibles
// ══════════════════════════════════════════════════════════════════════════
export async function pedidosDisponibles(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`
        SELECT p.idPedido, p.Status, p.MetodoPago, p.TotalUSD, p.PagoMonedaJSON,
               p.DireccionEntrega, p.UbicacionEntregaLat, p.UbicacionEntregaLon,
               p.NotasCliente, p.FechaAlta,
               pv.NomComercial AS NombreSucursal,
               pv.Latitud AS LatSucursal, pv.Longitud AS LonSucursal,
               (SELECT COUNT(*) FROM VIDA_PEDIDOS_DETALLE d
                WHERE d.idBranch=p.idBranch AND d.idCuenta=p.idCuenta AND d.idPedido=p.idPedido) AS TotalItems
        FROM VIDA_PEDIDOS p
        LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv
          ON pv.idBranch=p.idBranch AND pv.idCuenta=p.idCuenta AND pv.idPuntoVenta=p.idPuntoVenta
        WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
          AND p.Status='BUSCANDO_REPARTIDOR'
          -- Un pedido que este repartidor liberó no se le vuelve a ofrecer:
          -- sin esto el polling de su app se lo devolvería a los 10 segundos
          AND NOT EXISTS (
            SELECT 1 FROM VIDA_PEDIDOS_LIBERADOS l
            WHERE l.idBranch=p.idBranch AND l.idCuenta=p.idCuenta
              AND l.idPedido=p.idPedido AND l.idRepartidor=@idRepartidor)
        ORDER BY p.FechaAlta ASC
      `);
    return reply.send(r.recordset.map(conCobro));
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener pedidos disponibles' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — HISTORIAL PAGINADO
// GET /delivery/repartidor/historial?page=1&limit=20
// ══════════════════════════════════════════════════════════════════════════
// Entregas del repartidor con la hora real de entrega (historial del pedido),
// el cliente abreviado ("María G.") y la calificación que dejó.
const SQL_ENTREGAS = (joins = '') => `
  FROM VIDA_PEDIDOS p
  OUTER APPLY (SELECT TOP 1 h.FechaAlta FROM VIDA_PEDIDOS_HISTORIAL h
               WHERE h.idBranch=p.idBranch AND h.idCuenta=p.idCuenta AND h.idPedido=p.idPedido
                 AND h.StatusNuevo='ENTREGADO' ORDER BY h.FechaAlta DESC) he
  CROSS APPLY (SELECT ISNULL(he.FechaAlta, ISNULL(p.FechaMod, p.FechaAlta)) AS FechaEntrega) fe
  ${joins}
  WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
    AND p.idRepartidor=@idRepartidor AND p.Status='ENTREGADO'`;
// Día de negocio (Caracas, UTC−4) de la entrega
const DIA_ENTREGA = 'CAST(DATEADD(HOUR,-4,fe.FechaEntrega) AS DATE)';

export async function historialRepartidor(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  const { page = 1, limit = 20, mes } = request.query;
  const lim = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const offset = (Math.max(parseInt(page) || 1, 1) - 1) * lim;
  // Filtro opcional por mes de entrega (YYYY-MM, hora de Caracas)
  const filtroMes = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes || '')) ? String(mes) : null;
  const condMes = filtroMes ? ` AND ${DIA_ENTREGA} >= @desde AND ${DIA_ENTREGA} < DATEADD(MONTH,1,@desde)` : '';
  const req = (pool) => {
    const r = pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor);
    if (filtroMes) r.input('desde', sql.Date, filtroMes + '-01');
    return r;
  };

  try {
    const pool = await getPool();
    const r = await req(pool)
      .input('offset',       sql.Int,    offset)
      .input('limit',        sql.Int,    lim)
      .query(`
        SELECT p.idPedido, p.Status, p.MetodoPago, p.TotalUSD, p.PagoMonedaJSON,
               p.ComisionRepartidor, p.MontoEfectivoRepartidor, p.LiquidacionRepartidorJSON,
               p.DireccionEntrega, p.DistanciaKm, p.FechaAlta, fe.FechaEntrega,
               LTRIM(RTRIM(c.Nombre + ISNULL(' ' + LEFT(NULLIF(LTRIM(c.Apellidos),''),1) + '.', ''))) AS Cliente,
               cal.Estrellas
        ${SQL_ENTREGAS(`
        LEFT JOIN VIDA_APP_CLIENTES c ON c.idBranch=p.idBranch AND c.idCuenta=p.idCuenta AND c.idCliente=p.idCliente
        LEFT JOIN VIDA_REPARTIDORES_CALIFICACIONES cal
          ON cal.idBranch=p.idBranch AND cal.idCuenta=p.idCuenta AND cal.idPedido=p.idPedido AND cal.idRepartidor=p.idRepartidor`)}
        ${condMes}
        ORDER BY fe.FechaEntrega DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    const totalR = await req(pool).query(`
      SELECT COUNT(*) AS total, ISNULL(SUM(p.ComisionRepartidor),0) AS Comisiones
      ${SQL_ENTREGAS()} ${condMes}`);
    const { total, Comisiones } = totalR.recordset[0];

    return reply.send({
      data:  r.recordset,
      total,
      Comisiones: Number(Comisiones),
      page:  parseInt(page) || 1,
      pages: Math.ceil(total / lim),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener historial' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — GANANCIAS
// GET /delivery/repartidor/ganancias?periodo=hoy|semana|mes
// Comisiones y entregas por día (Caracas), efectivo por rendir por moneda y
// las últimas liquidaciones.
// ══════════════════════════════════════════════════════════════════════════
const DIAS_PERIODO = { hoy: 1, semana: 7, mes: 30 };

// % de comisión que de verdad se le aplica: el suyo o el global de la cuenta
// (misma regla que al entregar, en actualizarStatusPedido)
async function comisionPctEfectiva(pool, idBranch, idCuenta, propio) {
  if (propio != null) return Number(propio);
  const g = parseFloat(await getConfigVal(pool, idBranch, idCuenta, 'ComisionRepartidorPct', '0'));
  return Number.isFinite(g) ? g : 0;
}

export async function gananciasRepartidor(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  const periodo = DIAS_PERIODO[request.query?.periodo] ? request.query.periodo : 'semana';
  // Semana = lunes a domingo de esta semana (Caracas); hoy y mes = días corridos
  const hoy = new Date(Date.now() - 4 * 3600 * 1000);
  const desdeLunes = (hoy.getUTCDay() + 6) % 7; // 0 = lunes
  const dias = periodo === 'semana' ? desdeLunes + 1 : DIAS_PERIODO[periodo];
  const largo = periodo === 'semana' ? 7 : dias;
  try {
    const pool = await getPool();
    const base = () => pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor);
    const [serieR, repR, liqR] = await Promise.all([
      base().input('dias', sql.Int, dias).query(`
        SELECT ${DIA_ENTREGA} AS Dia, COUNT(*) AS Entregas, ISNULL(SUM(p.ComisionRepartidor),0) AS Comision
        ${SQL_ENTREGAS()}
          AND ${DIA_ENTREGA} > DATEADD(DAY, -@dias, CAST(DATEADD(HOUR,-4,GETUTCDATE()) AS DATE))
        GROUP BY ${DIA_ENTREGA}`),
      base().query(`SELECT SaldoPendiente, SaldoPendienteVES, Calificacion, ComisionPct FROM VIDA_REPARTIDORES
                    WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`),
      base().query(`SELECT TOP 5 idLiquidacion, FechaAlta, MontoALiquidar, NumPedidos, DesgloseMonedasJSON
                    FROM VIDA_REPARTIDOR_LIQUIDACIONES
                    WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor
                    ORDER BY FechaAlta DESC`),
    ]);
    // Serie completa (días sin entregas en cero), del más viejo a hoy
    const porDia = new Map(serieR.recordset.map(d => [new Date(d.Dia).toISOString().slice(0, 10), d]));
    const serie = [];
    for (let i = 0; i < largo; i++) {
      const fecha = new Date(hoy.getTime() - (dias - 1 - i) * 86400000);
      const f = fecha.toISOString().slice(0, 10);
      const d = porDia.get(f);
      serie.push({ Fecha: f, Hoy: i === dias - 1, Futuro: i > dias - 1,
        Entregas: d ? d.Entregas : 0, Comision: d ? Math.round(Number(d.Comision) * 100) / 100 : 0 });
    }
    const rep = repR.recordset[0] || {};
    return reply.send({
      periodo,
      Comision: Math.round(serie.reduce((s, d) => s + d.Comision, 0) * 100) / 100,
      Entregas: serie.reduce((s, d) => s + d.Entregas, 0),
      serie,
      SaldoPendienteUSD: Number(rep.SaldoPendiente || 0),
      SaldoPendienteVES: Number(rep.SaldoPendienteVES || 0),
      Calificacion: rep.Calificacion ?? null,
      ComisionPctEfectiva: await comisionPctEfectiva(pool, idBranch, idCuenta, rep.ComisionPct),
      liquidaciones: liqR.recordset.map(l => {
        let d = null; try { d = JSON.parse(l.DesgloseMonedasJSON || 'null'); } catch { /* legado */ }
        return {
          idLiquidacion: l.idLiquidacion, Fecha: l.FechaAlta, NumPedidos: l.NumPedidos,
          USD: d ? Number(d.USD?.MontoALiquidar || 0) : Number(l.MontoALiquidar || 0),
          VES: d ? Number(d.VES?.MontoALiquidar || 0) : 0,
        };
      }),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener ganancias' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — SUBIR FOTO DE PERFIL (multipart)
// POST /delivery/repartidor/foto
// ══════════════════════════════════════════════════════════════════════════
export async function subirFotoRepartidor(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  try {
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No se recibió archivo' });
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(data.mimetype)) {
      return reply.code(400).send({ error: 'Solo se permiten imágenes JPG, PNG o WebP' });
    }
    const uploadDir = path.join(process.cwd(), 'uploads', 'fotos-repartidor');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const ext = (data.filename?.split('.').pop() || 'jpg').toLowerCase();
    const filename = `rep_${idBranch}_${idCuenta}_${idRepartidor}.${ext}`;
    fs.writeFileSync(path.join(uploadDir, filename), await data.toBuffer());
    const fotoURL = `/uploads/fotos-repartidor/${filename}`;
    const pool = await getPool();
    await pool.request()
      .input('idBranch',     sql.BigInt,      idBranch)
      .input('idCuenta',     sql.BigInt,      idCuenta)
      .input('idRepartidor', sql.BigInt,      idRepartidor)
      .input('FotoURL',      sql.VarChar(500), fotoURL)
      .query(`UPDATE VIDA_REPARTIDORES SET FotoURL=@FotoURL
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);
    return reply.send({ fotoURL });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al subir foto' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — ACTUALIZAR DATOS DE PERFIL
// PUT /delivery/repartidor/perfil
// ══════════════════════════════════════════════════════════════════════════
export async function actualizarPerfilRepartidor(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  const { Nombre, Telefono, Vehiculo, PlacaVehiculo } = request.body || {};
  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',      sql.BigInt,      idBranch)
      .input('idCuenta',      sql.BigInt,      idCuenta)
      .input('idRepartidor',  sql.BigInt,      idRepartidor)
      .input('Nombre',        sql.VarChar(200), Nombre?.trim()        || null)
      .input('Telefono',      sql.VarChar(30),  Telefono?.trim()      || null)
      .input('Vehiculo',      sql.VarChar(100), Vehiculo?.trim()      || null)
      .input('PlacaVehiculo', sql.VarChar(20),  PlacaVehiculo?.trim() || null)
      .query(`UPDATE VIDA_REPARTIDORES SET
                Nombre        = COALESCE(@Nombre,        Nombre),
                Telefono      = COALESCE(@Telefono,      Telefono),
                Vehiculo      = COALESCE(@Vehiculo,      Vehiculo),
                PlacaVehiculo = COALESCE(@PlacaVehiculo, PlacaVehiculo)
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);

    // Devolver los datos actualizados
    const r = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`SELECT Nombre, Telefono, Vehiculo, PlacaVehiculo, FotoURL,
                     Calificacion, TotalCalificaciones, SaldoPendiente, SaldoPendienteVES, ComisionPct
              FROM VIDA_REPARTIDORES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);

    return reply.send(r.recordset[0]);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al actualizar perfil' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — PERFIL COMPLETO CON ESTADÍSTICAS
// GET /delivery/repartidor/perfil
// ══════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — CAMBIAR CONTRASEÑA
// PUT /delivery/repartidor/password  { actual, nueva }
// ══════════════════════════════════════════════════════════════════════════
export async function cambiarPasswordRepartidor(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  const { actual, nueva } = request.body || {};
  if (typeof nueva !== 'string' || nueva.length < 6 || nueva.length > 100)
    return reply.code(400).send({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  try {
    const pool = await getPool();
    const ids = () => pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idRepartidor', sql.BigInt, idRepartidor);
    const rep = (await ids().query(`SELECT Contrasena FROM VIDA_REPARTIDORES
      WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`)).recordset[0];
    if (!rep) return reply.code(404).send({ error: 'Repartidor no encontrado' });
    if (rep.Contrasena) {
      if (!actual) return reply.code(400).send({ error: 'Escribe tu contraseña actual' });
      if (!(await bcrypt.compare(String(actual), rep.Contrasena))) return reply.code(401).send({ error: 'La contraseña actual no es correcta' });
    }
    await ids().input('Contrasena', sql.NVarChar(200), await bcrypt.hash(nueva, 10))
      .query(`UPDATE VIDA_REPARTIDORES SET Contrasena=@Contrasena
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);
    return reply.send({ ok: true });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'No se pudo cambiar la contraseña' });
  }
}

export async function perfilRepartidorApp(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`
        SELECT r.Nombre, r.Telefono, r.Email, r.Vehiculo, r.PlacaVehiculo,
               r.FotoURL, r.Calificacion, r.TotalCalificaciones,
               r.SaldoPendiente, r.SaldoPendienteVES, r.ComisionPct,
               (SELECT COUNT(*) FROM VIDA_PEDIDOS p
                WHERE p.idBranch=r.idBranch AND p.idCuenta=r.idCuenta
                  AND p.idRepartidor=r.idRepartidor AND p.Status='ENTREGADO') AS TotalPedidosEntregados
        FROM VIDA_REPARTIDORES r
        WHERE r.idBranch=@idBranch AND r.idCuenta=@idCuenta AND r.idRepartidor=@idRepartidor
      `);
    if (!r.recordset.length) return reply.code(404).send({ error: 'Repartidor no encontrado' });
    const perfil = r.recordset[0];
    return reply.send({ ...perfil, idRepartidor: Number(idRepartidor), ComisionPctEfectiva: await comisionPctEfectiva(pool, idBranch, idCuenta, perfil.ComisionPct) });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener perfil' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — CALIFICAR REPARTIDOR
// POST /delivery/pedido/:idPedido/calificar
// ══════════════════════════════════════════════════════════════════════════
export async function calificarRepartidor(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const { idPedido } = request.params;
  const { Estrellas, Comentario } = request.body || {};
  if (!Estrellas || Estrellas < 1 || Estrellas > 5) {
    return reply.code(400).send({ error: 'Estrellas debe ser entre 1 y 5' });
  }
  try {
    const pool = await getPool();
    const pedR = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idPedido',  sql.BigInt, idPedido)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT idRepartidor, Status FROM VIDA_PEDIDOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND idPedido=@idPedido AND idCliente=@idCliente`);
    if (!pedR.recordset.length) return reply.code(404).send({ error: 'Pedido no encontrado' });
    const pedido = pedR.recordset[0];
    if (pedido.Status !== 'ENTREGADO') return reply.code(400).send({ error: 'El pedido aún no fue entregado' });
    if (!pedido.idRepartidor) return reply.code(400).send({ error: 'No hay repartidor asignado' });

    // MERGE: inserta o actualiza la calificación del pedido
    await pool.request()
      .input('idBranch',     sql.BigInt,      idBranch)
      .input('idCuenta',     sql.BigInt,      idCuenta)
      .input('idRepartidor', sql.BigInt,      pedido.idRepartidor)
      .input('idPedido',     sql.BigInt,      idPedido)
      .input('idCliente',    sql.BigInt,      idCliente)
      .input('Estrellas',    sql.TinyInt,     Estrellas)
      .input('Comentario',   sql.VarChar(500), Comentario?.trim() || null)
      .query(`
        MERGE VIDA_REPARTIDORES_CALIFICACIONES AS t
        USING (SELECT @idBranch AS idBranch, @idCuenta AS idCuenta, @idPedido AS idPedido) AS s
          ON t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.idPedido=s.idPedido
        WHEN MATCHED THEN
          UPDATE SET Estrellas=@Estrellas, Comentario=@Comentario
        WHEN NOT MATCHED THEN
          INSERT (idBranch,idCuenta,idRepartidor,idPedido,idCliente,Estrellas,Comentario)
          VALUES (@idBranch,@idCuenta,@idRepartidor,@idPedido,@idCliente,@Estrellas,@Comentario);
      `);

    // Recalcular promedio en VIDA_REPARTIDORES
    await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, pedido.idRepartidor)
      .query(`
        UPDATE VIDA_REPARTIDORES
        SET Calificacion = (
              SELECT AVG(CAST(Estrellas AS DECIMAL(3,2)))
              FROM VIDA_REPARTIDORES_CALIFICACIONES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor),
            TotalCalificaciones = (
              SELECT COUNT(*) FROM VIDA_REPARTIDORES_CALIFICACIONES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor)
        WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor
      `);

    return reply.send({ ok: true });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al calificar' });
  }
}
