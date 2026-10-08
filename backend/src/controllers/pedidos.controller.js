import { calcularPagoPos, validarVigenciaCotizacion } from '../services/pagoPos.service.js';
// src/controllers/pedidos.controller.js
import { getPool, sql } from '../db/sqlserver.js';
import { conIdUnico } from '../db/idUnico.js';
import { broadcast } from '../ws/ws.manager.js';
import { enviarPush } from '../services/push.service.js';
import { registrarAuditoria } from '../services/audit.service.js';
import { fechaCaracas } from '../services/fechas.service.js';
import { tiendaEnAlcance, filtroTiendasRed, esRed } from '../services/alcance.service.js';
import { turnoDeLaVenta } from '../services/turnoVenta.service.js';
import { esRechazoPermanente, guardarEnRevision, obtenerEnRevision, marcarRegistrada, marcarAnulada, anotarFallo } from '../services/ventasRevision.service.js';

// ── Helper ─────────────────────────────────────────────────────────────────
async function nextId(pool, tabla, campo, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}), 0) + 1 AS nextId
            FROM ${tabla}
            WHERE idBranch = @idBranch AND idCuenta = @idCuenta`);
  return r.recordset[0].nextId;
}

// Variante transaccional: UPDLOCK+HOLDLOCK serializa la obtención del ID —
// dos transacciones concurrentes no pueden obtener el mismo MAX()+1
async function nextIdTx(transaction, tabla, campo, idBranch, idCuenta) {
  const r = await new sql.Request(transaction)
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}), 0) + 1 AS nextId
            FROM ${tabla} WITH (UPDLOCK, HOLDLOCK)
            WHERE idBranch = @idBranch AND idCuenta = @idCuenta`);
  return r.recordset[0].nextId;
}

const MINUTOS_EXPIRACION = 10;

// Transiciones válidas
const TRANSICIONES = {
  NUEVO:      ['PREPARANDO', 'CANCELADO'],
  PREPARANDO: ['LISTO', 'CANCELADO'],
  LISTO:      ['EN_CAMINO', 'ENTREGADO', 'CANCELADO'], // ENTREGADO directo si es POS
  EN_CAMINO:  ['ENTREGADO', 'CANCELADO'],
  ENTREGADO:  [],
  CANCELADO:  [],
};

// ══════════════════════════════════════════════════════════════════════════
// LISTAR PEDIDOS
// ══════════════════════════════════════════════════════════════════════════
export async function listarPedidos(request, reply) {
  const { idBranch, idCuenta, TipoUsuario, idPuntoVenta: pvUsuario } = request.user;
  const { page = 1, limit = 20, status = '', canal = '', requiereRevision = '' } = request.query;
  // Roles de tienda quedan forzados a su punto de venta; los de red filtran por query.
  const esRed = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO'].includes(TipoUsuario);
  const idPuntoVenta = esRed ? (request.query.idPuntoVenta || '') : pvUsuario;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const pool = await getPool();

    let whereExtra = '';
    if (status)       whereExtra += ' AND p.Status = @status';
    if (canal)        whereExtra += ' AND p.Canal = @canal';
    if (idPuntoVenta) whereExtra += ' AND p.idPuntoVenta = @idPuntoVenta';
    if (requiereRevision === '1') whereExtra += ' AND p.RequiereRevision = 1';
    // Roles de red: solo pedidos de tiendas de su alcance
    const conRed = esRed ? (rq) => filtroTiendasRed(request.user, 'p.idPuntoVenta', rq) : () => '';

    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('offset',   sql.Int,    offset)
      .input('limit',    sql.Int,    parseInt(limit));

    if (status)       req.input('status',       sql.VarChar(20), status);
    if (canal)        req.input('canal',         sql.VarChar(10), canal);
    if (idPuntoVenta) req.input('idPuntoVenta',  sql.BigInt,      idPuntoVenta);
    whereExtra += conRed(req);

    const r = await req.query(`
      SELECT p.idPedido, p.Canal, p.Status, p.MetodoPago, p.StatusPago,
             p.TotalUSD, p.MontoEfectivo, p.MontoTarjeta, p.MontoCambio, p.PagoMonedaJSON,
             p.Notas, p.FechaAlta, p.FechaExpiracion,
             p.RequiereRevision, p.EsOffline,
             p.OrdenRuta, p.ETAEntrega,
             DATEDIFF(MINUTE, GETUTCDATE(), p.ETAEntrega) AS MinutosRestantes,
             pv.NomComercial AS NombreSucursal,
             cl.Nombre AS NombreCliente, cl.Telefono AS TelefonoCliente,
             rep.Nombre AS NombreRepartidor, rep.Telefono AS TelefonoRepartidor,
             (SELECT COUNT(*) FROM VIDA_PEDIDOS_DETALLE d
              WHERE d.idBranch = p.idBranch AND d.idCuenta = p.idCuenta
                AND d.idPedido = p.idPedido) AS totalItems
      FROM VIDA_PEDIDOS p
      LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch = p.idBranch AND pv.idCuenta = p.idCuenta AND pv.idPuntoVenta = p.idPuntoVenta
      LEFT JOIN VIDA_CLIENTES cl
        ON cl.idBranch = p.idBranch AND cl.idCuenta = p.idCuenta AND cl.idCliente = p.idCliente
      LEFT JOIN VIDA_REPARTIDORES rep
        ON rep.idBranch = p.idBranch AND rep.idCuenta = p.idCuenta AND rep.idRepartidor = p.idRepartidor
      WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
      ${whereExtra}
      ORDER BY p.FechaAlta DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const totalReq = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta);
    if (status)       totalReq.input('status',      sql.VarChar(20), status);
    if (canal)        totalReq.input('canal',        sql.VarChar(10), canal);
    if (idPuntoVenta) totalReq.input('idPuntoVenta', sql.BigInt,      idPuntoVenta);
    conRed(totalReq);

    const totalR = await totalReq.query(`
      SELECT COUNT(*) AS total FROM VIDA_PEDIDOS p
      WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta ${whereExtra}
    `);

    return reply.send({
      data:  r.recordset,
      total: totalR.recordset[0].total,
      page:  parseInt(page),
      pages: Math.ceil(totalR.recordset[0].total / parseInt(limit)),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener pedidos' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// OBTENER PEDIDO (con detalle e historial)
// ══════════════════════════════════════════════════════════════════════════
export async function obtenerPedido(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idPedido } = request.params;

  try {
    const pool = await getPool();

    const cabR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idPedido', sql.BigInt, idPedido)
      .query(`
        SELECT p.idPedido, p.idCliente, p.idRepartidor, p.idPuntoVenta,
               p.Canal, p.Status, p.MetodoPago, p.StatusPago,
               p.TotalUSD, p.MontoEfectivo, p.MontoTarjeta, p.MontoCambio, p.PagoMonedaJSON,
               p.Notas, p.FechaAlta, p.FechaExpiracion,
               p.RequiereRevision, p.EsOffline, p.EvidenciaEntregaURL,
               p.OrdenRuta, p.DistanciaKm, p.ETAEntrega,
               DATEDIFF(MINUTE, GETUTCDATE(), p.ETAEntrega) AS MinutosRestantes,
               pv.NomComercial AS NombreSucursal, pv.ModalidadFiscal,
               cl.Nombre AS NombreCliente, cl.Telefono AS TelefonoCliente,
               cl.Direccion AS DireccionCliente,
               rep.Nombre AS NombreRepartidor, rep.Telefono AS TelefonoRepartidor,
               rep.FotoURL AS FotoRepartidor,
               fa.idFactura, fa.Numero AS NumeroFactura, fa.Status AS StatusFactura
        FROM VIDA_PEDIDOS p
        LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv
          ON pv.idBranch = p.idBranch AND pv.idCuenta = p.idCuenta AND pv.idPuntoVenta = p.idPuntoVenta
        LEFT JOIN VIDA_FACTURAS fa
          ON fa.idBranch = p.idBranch AND fa.idCuenta = p.idCuenta AND fa.idPedido = p.idPedido AND fa.TipoDocumento = 'FACTURA'
        LEFT JOIN VIDA_CLIENTES cl
          ON cl.idBranch = p.idBranch AND cl.idCuenta = p.idCuenta AND cl.idCliente = p.idCliente
        LEFT JOIN VIDA_REPARTIDORES rep
          ON rep.idBranch = p.idBranch AND rep.idCuenta = p.idCuenta AND rep.idRepartidor = p.idRepartidor
        WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta AND p.idPedido = @idPedido
      `);

    if (!cabR.recordset[0]) return reply.code(404).send({ error: 'Pedido no encontrado' });

    const [detR, histR, compR] = await Promise.all([
      pool.request()
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta)
        .input('idPedido', sql.BigInt, idPedido)
        .query(`
          SELECT d.idDetalle, d.idProducto, d.Cantidad, d.PrecioUnitario,
                 pr.Nombre AS NombreProducto, pr.SKU, pr.UnidadMedida
          FROM VIDA_PEDIDOS_DETALLE d
          INNER JOIN VIDA_INVENTARIO_PRODUCTOS pr
            ON pr.idBranch = d.idBranch AND pr.idCuenta = d.idCuenta AND pr.idProducto = d.idProducto
          WHERE d.idBranch = @idBranch AND d.idCuenta = @idCuenta AND d.idPedido = @idPedido
        `),
      pool.request()
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta)
        .input('idPedido', sql.BigInt, idPedido)
        .query(`
          SELECT idHistorial, StatusAnterior, StatusNuevo, Notas, FechaAlta, UsuAlta
          FROM VIDA_PEDIDOS_HISTORIAL
          WHERE idBranch = @idBranch AND idCuenta = @idCuenta AND idPedido = @idPedido
          ORDER BY FechaAlta ASC
        `),
      pool.request()
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta)
        .input('idPedido', sql.BigInt, idPedido)
        .query(`
          SELECT idComprobante, ImagenURL, Referencia, StatusRevision, Notas, FechaAlta
          FROM VIDA_PEDIDOS_COMPROBANTES
          WHERE idBranch = @idBranch AND idCuenta = @idCuenta AND idPedido = @idPedido
          ORDER BY FechaAlta DESC
        `),
    ]);

    return reply.send({
      ...cabR.recordset[0],
      detalle:      detR.recordset,
      historial:    histR.recordset,
      comprobantes: compR.recordset,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener pedido' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CREAR PEDIDO (APP o POS)
// ══════════════════════════════════════════════════════════════════════════
export async function crearPedido(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idPuntoVenta, idCliente, Canal = 'POS', MetodoPago,
          MontoEfectivo, MontoTarjeta, MontoCambio, Notas, items } = request.body;

  if (!idPuntoVenta || !items?.length)
    return reply.code(400).send({ error: 'idPuntoVenta e items son requeridos' });

  if (!['APP', 'POS'].includes(Canal))
    return reply.code(400).send({ error: 'Canal debe ser APP o POS' });

  // Validar items antes de tocar la BD: cantidades negativas o NaN
  // manipularían el total y la reserva de stock
  for (const item of items) {
    const cant   = parseFloat(item.Cantidad);
    const precio = parseFloat(item.PrecioUnitario);
    if (!item.idProducto || !(cant > 0) || !(precio >= 0)) {
      return reply.code(400).send({ error: 'Cada item requiere idProducto, Cantidad mayor a 0 y PrecioUnitario válido' });
    }
  }

  const totalUSD = items.reduce((s, i) => s + (parseFloat(i.Cantidad) * parseFloat(i.PrecioUnitario)), 0);

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  let enTransaccion = false;

  try {
    await transaction.begin();
    enTransaccion = true;

    // Reservar stock de forma atómica: el UPDATE valida disponibilidad y
    // reserva en una sola operación — sin ventana entre verificar y reservar.
    // Si otra venta concurrente toma la última unidad, rowsAffected = 0.
    for (const item of items) {
      const resR = await new sql.Request(transaction)
        .input('idBranch',    sql.BigInt,       idBranch)
        .input('idCuenta',    sql.BigInt,       idCuenta)
        .input('idPuntoVenta',sql.BigInt,       idPuntoVenta)
        .input('idProducto',  sql.BigInt,       item.idProducto)
        .input('Cantidad',    sql.Decimal(18,4), parseFloat(item.Cantidad))
        .query(`UPDATE VIDA_INVENTARIO_STOCK WITH (UPDLOCK, HOLDLOCK) SET
                  StockReservado = ISNULL(StockReservado, 0) + @Cantidad,
                  FechaMod = GETUTCDATE()
                WHERE idBranch = @idBranch AND idCuenta = @idCuenta
                  AND idPuntoVenta = @idPuntoVenta AND idProducto = @idProducto
                  AND ISNULL(Cantidad, 0) - ISNULL(StockReservado, 0) >= @Cantidad`);

      if (resR.rowsAffected[0] === 0) {
        await transaction.rollback();
        enTransaccion = false;

        const infoR = await pool.request()
          .input('idBranch',    sql.BigInt, idBranch)
          .input('idCuenta',    sql.BigInt, idCuenta)
          .input('idPuntoVenta',sql.BigInt, idPuntoVenta)
          .input('idProducto',  sql.BigInt, item.idProducto)
          .query(`SELECT p.Nombre,
                         ISNULL(s.Cantidad, 0) - ISNULL(s.StockReservado, 0) AS Disponible
                  FROM VIDA_INVENTARIO_PRODUCTOS p
                  LEFT JOIN VIDA_INVENTARIO_STOCK s
                    ON s.idBranch = p.idBranch AND s.idCuenta = p.idCuenta
                   AND s.idProducto = p.idProducto AND s.idPuntoVenta = @idPuntoVenta
                  WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta AND p.idProducto = @idProducto`);
        const info = infoR.recordset[0];
        const nombre = info?.Nombre || `Producto #${item.idProducto}`;
        const disponible = info ? parseFloat(info.Disponible) : 0;
        return reply.code(409).send({
          error: `Stock insuficiente para "${nombre}". Disponible: ${disponible}, solicitado: ${item.Cantidad}`,
        });
      }
    }

    // ID serializado por el lock — sin carrera de MAX()+1
    const nuevoId = await nextIdTx(transaction, 'VIDA_PEDIDOS', 'idPedido', idBranch, idCuenta);

    // Cabecera con fechas de reserva y expiración
    await new sql.Request(transaction)
      .input('idBranch',       sql.BigInt,       idBranch)
      .input('idCuenta',       sql.BigInt,       idCuenta)
      .input('idPedido',       sql.BigInt,       nuevoId)
      .input('idPuntoVenta',   sql.BigInt,       idPuntoVenta)
      .input('idCliente',      sql.BigInt,       idCliente || null)
      .input('Canal',          sql.VarChar(10),  Canal)
      .input('MetodoPago',     sql.VarChar(20),   MetodoPago    || null)
      .input('TotalUSD',       sql.Decimal(18,4), totalUSD)
      .input('MontoEfectivo',  sql.Decimal(18,4), MontoEfectivo ?? null)
      .input('MontoTarjeta',   sql.Decimal(18,4), MontoTarjeta  ?? null)
      .input('MontoCambio',    sql.Decimal(18,4), MontoCambio   ?? null)
      .input('Notas',          sql.VarChar(500),  Notas         || null)
      .input('Minutos',        sql.Int,           MINUTOS_EXPIRACION)
      .input('UsuAlta',        sql.VarChar(20),   String(idUsuario))
      .query(`INSERT INTO VIDA_PEDIDOS
                (idBranch, idCuenta, idPedido, idPuntoVenta, idCliente,
                 Canal, MetodoPago, TotalUSD, MontoEfectivo, MontoTarjeta, MontoCambio,
                 Notas, FechaReserva, FechaExpiracion, UsuAlta)
              VALUES
                (@idBranch, @idCuenta, @idPedido, @idPuntoVenta, @idCliente,
                 @Canal, @MetodoPago, @TotalUSD, @MontoEfectivo, @MontoTarjeta, @MontoCambio,
                 @Notas, GETUTCDATE(), DATEADD(MINUTE, @Minutos, GETUTCDATE()), @UsuAlta)`);

    // Detalle
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await new sql.Request(transaction)
        .input('idBranch',       sql.BigInt,       idBranch)
        .input('idCuenta',       sql.BigInt,       idCuenta)
        .input('idPedido',       sql.BigInt,       nuevoId)
        .input('idDetalle',      sql.BigInt,       i + 1)
        .input('idProducto',     sql.BigInt,       item.idProducto)
        .input('Cantidad',       sql.Decimal(18,4), parseFloat(item.Cantidad))
        .input('PrecioUnitario', sql.Decimal(18,4), parseFloat(item.PrecioUnitario))
        .query(`INSERT INTO VIDA_PEDIDOS_DETALLE
                  (idBranch, idCuenta, idPedido, idDetalle, idProducto, Cantidad, PrecioUnitario)
                VALUES
                  (@idBranch, @idCuenta, @idPedido, @idDetalle, @idProducto, @Cantidad, @PrecioUnitario)`);
    }

    // Historial
    const histId = await nextIdTx(transaction, 'VIDA_PEDIDOS_HISTORIAL', 'idHistorial', idBranch, idCuenta);
    await new sql.Request(transaction)
      .input('idBranch',    sql.BigInt,     idBranch)
      .input('idCuenta',    sql.BigInt,     idCuenta)
      .input('idHistorial', sql.BigInt,     histId)
      .input('idPedido',    sql.BigInt,     nuevoId)
      .input('StatusNuevo', sql.VarChar(20), 'NUEVO')
      .input('UsuAlta',     sql.VarChar(20), String(idUsuario))
      .query(`INSERT INTO VIDA_PEDIDOS_HISTORIAL
                (idBranch, idCuenta, idHistorial, idPedido, StatusNuevo, UsuAlta)
              VALUES (@idBranch, @idCuenta, @idHistorial, @idPedido, @StatusNuevo, @UsuAlta)`);

    await registrarAuditoria(transaction, {
      idBranch, idCuenta,
      entityType: 'PEDIDO', entityId: nuevoId,
      accion: 'VENTA_CREADA', actor: idUsuario,
      data: { Canal, idPuntoVenta, TotalUSD: totalUSD, MetodoPago: MetodoPago || null, numItems: items.length },
    }, request.log);

    await transaction.commit();
    enTransaccion = false;

    // Notificar en tiempo real a todos los clientes conectados de esta cuenta
    broadcast(idBranch, idCuenta, {
      tipo:     'pedido:nuevo',
      idPedido: nuevoId,
      Canal,
      idPuntoVenta,
      TotalUSD: totalUSD,
      MetodoPago: MetodoPago || null,
      items: items.map(i => ({ idProducto: i.idProducto, Cantidad: i.Cantidad, PrecioUnitario: i.PrecioUnitario })),
    });

    return reply.code(201).send({ message: 'Pedido creado', idPedido: nuevoId });
  } catch (err) {
    if (enTransaccion) {
      try { await transaction.rollback(); } catch (rbErr) { request.log.error('Rollback falló: ' + rbErr.message); }
    }
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al crear pedido: ' + err.message });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SINCRONIZAR VENTAS OFFLINE (batch idempotente)
// POST /pedidos/sync — body: { ventas: [{ClienteUUID, idPuntoVenta, MetodoPago,
//   MontoEfectivo, MontoTarjeta, MontoCambio, FechaVenta, items:[...]}] }
// Cada venta se procesa en su propia transacción: una que falla no afecta
// a las demás. Un ClienteUUID ya registrado se responde como synced (no error).
// ══════════════════════════════════════════════════════════════════════════
const MAX_VENTAS_POR_LOTE = 50;
const MAX_DIAS_VENTA_OFFLINE = 30;

function fechaVentaValida(fechaStr) {
  if (!fechaStr) return null;
  const f = new Date(fechaStr);
  if (isNaN(f.getTime())) return null;
  const ahora = Date.now();
  const antiguedadDias = (ahora - f.getTime()) / 86400000;
  // Rechazar fechas futuras (>5 min de tolerancia por desfase de reloj) o muy viejas
  if (f.getTime() > ahora + 5 * 60000 || antiguedadDias > MAX_DIAS_VENTA_OFFLINE) return null;
  return f;
}

async function procesarVentaOffline(pool, { venta, idBranch, idCuenta, idUsuario }) {
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const idPedido = await nextIdTx(transaction, 'VIDA_PEDIDOS', 'idPedido', idBranch, idCuenta);
    const itemsSum = venta.items.reduce((s, i) => s + (parseFloat(i.Cantidad) * parseFloat(i.PrecioUnitario)), 0);
    // Cupón aplicado en el POS: el descuento ya viene calculado por el cliente;
    // aquí se refleja en el total registrado (lo que realmente se cobró).
    const cuponCodigo = venta.CuponCodigo ? String(venta.CuponCodigo).trim().toUpperCase().slice(0, 40) : null;
    const descuentoCupon = Math.max(0, Math.min(parseFloat(venta.CuponDescuentoUSD) || 0, itemsSum));
    const totalUSD = +Math.max(0, itemsSum - descuentoCupon).toFixed(venta.PagoMoneda ? 2 : 4);
    const fechaVenta = fechaVentaValida(venta.FechaVenta);
    let pagoMoneda=null;
    if (venta.PagoMoneda) {
      if(!fechaVenta) throw new Error('Fecha de venta inválida');
      const c=await new sql.Request(transaction).input('id',sql.UniqueIdentifier,venta.PagoMoneda.idCotizacion)
        .input('b',sql.BigInt,idBranch).input('c',sql.BigInt,idCuenta)
        .query(`SELECT q.*,t.VESporUSD,t.FechaValor,t.Fuente FROM VIDA_POS_COTIZACIONES q
          JOIN VIDA_TASAS_CAMBIO t ON t.idTasa=q.idTasa AND t.idBranch=q.idBranch AND t.idCuenta=q.idCuenta
          WHERE q.idCotizacion=@id AND q.idBranch=@b AND q.idCuenta=@c`);
      const cot=c.recordset[0];
      validarVigenciaCotizacion(cot,{idBranch,idCuenta,idUsuario,idPuntoVenta:venta.idPuntoVenta},fechaVenta);
      pagoMoneda=calcularPagoPos(totalUSD,venta.PagoMoneda,cot,cot.Modo,!!cot.AplicaIGTF);
      venta={...venta,MetodoPago:pagoMoneda.Metodo,MontoEfectivo:pagoMoneda.EfectivoUSD,MontoTarjeta:pagoMoneda.TarjetaUSD,MontoCambio:pagoMoneda.CambioUSD};
    } else {
      const corte=await new sql.Request(transaction).query('SELECT FechaInicio FROM VIDA_POS_MONEDA_VERSION WHERE id=1');
      if(!fechaVenta || fechaVenta>=corte.recordset[0].FechaInicio) throw new Error('Actualiza el POS y consulta una tasa antes de cobrar');
    }

    // Turno de caja que cubrió la venta (tardía si ya cerró o si no hay)
    const { idTurno: idTurnoVenta, ventaTardia } = await turnoDeLaVenta(transaction, { idBranch, idCuenta }, venta.idPuntoVenta, fechaVenta);


    await new sql.Request(transaction)
      .input('idBranch',      sql.BigInt,       idBranch)
      .input('idCuenta',      sql.BigInt,       idCuenta)
      .input('idPedido',      sql.BigInt,       idPedido)
      .input('idPuntoVenta',  sql.BigInt,       venta.idPuntoVenta)
      .input('ClienteUUID',   sql.VarChar(40),  venta.ClienteUUID)
      .input('PagoMonedaJSON',sql.NVarChar(sql.MAX),pagoMoneda ? JSON.stringify(pagoMoneda) : null)
      .input('MetodoPago',    sql.VarChar(20),  venta.MetodoPago || null)
      .input('TotalUSD',      sql.Decimal(18,4), totalUSD)
      .input('MontoEfectivo', sql.Decimal(18,4), venta.MontoEfectivo ?? null)
      .input('MontoTarjeta',  sql.Decimal(18,4), venta.MontoTarjeta  ?? null)
      .input('MontoCambio',   sql.Decimal(18,4), venta.MontoCambio   ?? null)
      .input('Notas',         sql.VarChar(500), venta.Notas || null)
      .input('FechaVenta',    sql.DateTime,     fechaVenta)
      .input('CuponCodigo',   sql.VarChar(40),  cuponCodigo)
      .input('CuponDescuentoUSD', sql.Decimal(18,4), cuponCodigo ? descuentoCupon : null)
      .input('UsuAlta',       sql.VarChar(20),  String(idUsuario))
      .input('idTurno',       sql.BigInt,       idTurnoVenta)
      .input('VentaTardia',   sql.Bit,          ventaTardia ? 1 : 0)
      .query(`INSERT INTO VIDA_PEDIDOS
                (idBranch, idCuenta, idPedido, idPuntoVenta, Canal, Status,
                 MetodoPago, StatusPago, TotalUSD, MontoEfectivo, MontoTarjeta, MontoCambio,
                 Notas, ClienteUUID, PagoMonedaJSON, EsOffline, CuponCodigo, CuponDescuentoUSD, FechaAlta, UsuAlta,
                 idTurno, VentaTardia)
              VALUES
                (@idBranch, @idCuenta, @idPedido, @idPuntoVenta, 'POS', 'ENTREGADO',
                 @MetodoPago, 'PAGADO', @TotalUSD, @MontoEfectivo, @MontoTarjeta, @MontoCambio,
                 @Notas, @ClienteUUID, @PagoMonedaJSON, 1, @CuponCodigo, @CuponDescuentoUSD, ISNULL(@FechaVenta, GETUTCDATE()), @UsuAlta,
                 @idTurno, @VentaTardia)`);

    let requiereRevision = false;

    for (let i = 0; i < venta.items.length; i++) {
      const item = venta.items[i];
      const cantidad = parseFloat(item.Cantidad);

      await new sql.Request(transaction)
        .input('idBranch',       sql.BigInt,       idBranch)
        .input('idCuenta',       sql.BigInt,       idCuenta)
        .input('idPedido',       sql.BigInt,       idPedido)
        .input('idDetalle',      sql.BigInt,       i + 1)
        .input('idProducto',     sql.BigInt,       item.idProducto)
        .input('Cantidad',       sql.Decimal(18,4), cantidad)
        .input('PrecioUnitario', sql.Decimal(18,4), parseFloat(item.PrecioUnitario))
        .query(`INSERT INTO VIDA_PEDIDOS_DETALLE
                  (idBranch, idCuenta, idPedido, idDetalle, idProducto, Cantidad, PrecioUnitario)
                VALUES
                  (@idBranch, @idCuenta, @idPedido, @idDetalle, @idProducto, @Cantidad, @PrecioUnitario)`);

      // La venta física ya ocurrió: se descuenta stock aunque quede corto
      // (floor 0) y se marca para revisión en vez de rechazar
      const stockR = await new sql.Request(transaction)
        .input('idBranch',    sql.BigInt,       idBranch)
        .input('idCuenta',    sql.BigInt,       idCuenta)
        .input('idPuntoVenta',sql.BigInt,       venta.idPuntoVenta)
        .input('idProducto',  sql.BigInt,       item.idProducto)
        .input('Cantidad',    sql.Decimal(18,4), cantidad)
        .query(`UPDATE VIDA_INVENTARIO_STOCK WITH (UPDLOCK, HOLDLOCK) SET
                  Cantidad = CASE WHEN ISNULL(Cantidad,0) - @Cantidad < 0 THEN 0
                                  ELSE ISNULL(Cantidad,0) - @Cantidad END,
                  FechaMod = GETUTCDATE()
                OUTPUT ISNULL(deleted.Cantidad,0) AS CantidadAntes,
                       ISNULL(inserted.Cantidad,0) AS CantidadDespues
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                  AND idPuntoVenta=@idPuntoVenta AND idProducto=@idProducto`);

      const s = stockR.recordset[0];
      if (!s || parseFloat(s.CantidadAntes) < cantidad) requiereRevision = true;

      const movId = await nextIdTx(transaction, 'VIDA_INVENTARIO_MOVIMIENTOS', 'idMovimiento', idBranch, idCuenta);
      await new sql.Request(transaction)
        .input('idBranch',        sql.BigInt,       idBranch)
        .input('idCuenta',        sql.BigInt,       idCuenta)
        .input('idMovimiento',    sql.BigInt,       movId)
        .input('idPuntoVenta',    sql.BigInt,       venta.idPuntoVenta)
        .input('idProducto',      sql.BigInt,       item.idProducto)
        .input('Cantidad',        sql.Decimal(18,4), cantidad)
        .input('CantidadAntes',   sql.Decimal(18,4), parseFloat(s?.CantidadAntes ?? 0))
        .input('CantidadDespues', sql.Decimal(18,4), parseFloat(s?.CantidadDespues ?? 0))
        .input('Motivo',          sql.VarChar(300),  `Venta offline sincronizada #${idPedido}`)
        .input('Referencia',      sql.VarChar(100),  String(idPedido))
        .input('UsuAlta',         sql.VarChar(20),   String(idUsuario))
        .query(`INSERT INTO VIDA_INVENTARIO_MOVIMIENTOS
                  (idBranch, idCuenta, idMovimiento, idPuntoVenta, idProducto,
                   TipoMovimiento, Cantidad, CantidadAntes, CantidadDespues,
                   Motivo, Referencia, UsuAlta)
                VALUES
                  (@idBranch, @idCuenta, @idMovimiento, @idPuntoVenta, @idProducto,
                   'SALIDA', @Cantidad, @CantidadAntes, @CantidadDespues,
                   @Motivo, @Referencia, @UsuAlta)`);
    }

    if (requiereRevision) {
      await new sql.Request(transaction)
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta)
        .input('idPedido', sql.BigInt, idPedido)
        .query(`UPDATE VIDA_PEDIDOS SET RequiereRevision=1
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);
    }

    const histId = await nextIdTx(transaction, 'VIDA_PEDIDOS_HISTORIAL', 'idHistorial', idBranch, idCuenta);
    await new sql.Request(transaction)
      .input('idBranch',    sql.BigInt,      idBranch)
      .input('idCuenta',    sql.BigInt,      idCuenta)
      .input('idHistorial', sql.BigInt,      histId)
      .input('idPedido',    sql.BigInt,      idPedido)
      .input('Notas',       sql.VarChar(500), 'Venta offline sincronizada')
      .input('UsuAlta',     sql.VarChar(20), String(idUsuario))
      .query(`INSERT INTO VIDA_PEDIDOS_HISTORIAL
                (idBranch, idCuenta, idHistorial, idPedido, StatusAnterior, StatusNuevo, Notas, UsuAlta)
              VALUES (@idBranch, @idCuenta, @idHistorial, @idPedido, 'NUEVO', 'ENTREGADO', @Notas, @UsuAlta)`);

    // Registro del uso del cupón (best-effort: la venta física ya ocurrió, así
    // que se registra el uso e incrementa el contador sin bloquear la venta).
    if (cuponCodigo && descuentoCupon > 0) {
      const cupR = await new sql.Request(transaction)
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta)
        .input('Codigo',   sql.VarChar(40), cuponCodigo)
        .query(`SELECT TOP 1 idCupon FROM VIDA_CUPONES WITH (UPDLOCK, HOLDLOCK)
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Codigo=@Codigo`);
      const cup = cupR.recordset[0];
      if (cup) {
        await new sql.Request(transaction)
          .input('idBranch', sql.BigInt, idBranch)
          .input('idCuenta', sql.BigInt, idCuenta)
          .input('idCupon',  sql.BigInt, cup.idCupon)
          .query(`UPDATE VIDA_CUPONES SET UsosActuales = UsosActuales + 1
                  WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCupon=@idCupon`);
        const idUso = await nextIdTx(transaction, 'VIDA_CUPONES_USOS', 'idUso', idBranch, idCuenta);
        await new sql.Request(transaction)
          .input('idBranch',  sql.BigInt,       idBranch)
          .input('idCuenta',  sql.BigInt,       idCuenta)
          .input('idUso',     sql.BigInt,       idUso)
          .input('idCupon',   sql.BigInt,       cup.idCupon)
          .input('Codigo',    sql.VarChar(40),  cuponCodigo)
          .input('idPedido',  sql.BigInt,       idPedido)
          .input('Descuento', sql.Decimal(18,4),descuentoCupon)
          .input('UsuAlta',   sql.VarChar(30),  String(idUsuario))
          .query(`INSERT INTO VIDA_CUPONES_USOS
                    (idBranch,idCuenta,idUso,idCupon,Codigo,idCliente,idPedido,Canal,DescuentoUSD,UsuAlta)
                  VALUES
                    (@idBranch,@idCuenta,@idUso,@idCupon,@Codigo,NULL,@idPedido,'POS',@Descuento,@UsuAlta)`);
      }
    }

    await registrarAuditoria(transaction, {
      idBranch, idCuenta,
      entityType: 'PEDIDO', entityId: idPedido,
      accion: 'VENTA_OFFLINE_SINCRONIZADA', actor: idUsuario,
      data: {
        ClienteUUID: venta.ClienteUUID, idPuntoVenta: venta.idPuntoVenta,
        TotalUSD: totalUSD, MetodoPago: venta.MetodoPago || null,
        FechaVenta: venta.FechaVenta || null, requiereRevision,
        idTurno: idTurnoVenta, ventaTardia,
      },
    });

    await transaction.commit();
    return { idPedido, requiereRevision, idTurno: idTurnoVenta, ventaTardia };
  } catch (err) {
    try { await transaction.rollback(); } catch {}
    throw err;
  }
}

export async function sincronizarVentasOffline(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { ventas } = request.body || {};

  if (!Array.isArray(ventas) || ventas.length === 0)
    return reply.code(400).send({ error: 'ventas (array) es requerido' });
  if (ventas.length > MAX_VENTAS_POR_LOTE)
    return reply.code(400).send({ error: `Máximo ${MAX_VENTAS_POR_LOTE} ventas por lote` });

  const pool = await getPool();
  const synced = [];
  const failed = [];

  const rechazo = (mensaje) => Object.assign(new Error(mensaje), { statusCode: 422 });
  for (const venta of ventas) {
    const uuid = typeof venta?.ClienteUUID === 'string' ? venta.ClienteUUID.slice(0, 40) : null;
    let previa = null;
    try {
      if (!uuid) {
        failed.push({ ClienteUUID: null, motivo: 'ClienteUUID es requerido' });
        continue;
      }
      // Ya anulada por un administrador: no se registra; el POS la suelta
      previa = await obtenerEnRevision(pool, { idBranch, idCuenta }, uuid);
      if (previa?.Status === 'ANULADA') {
        failed.push({ ClienteUUID: uuid, motivo: `Anulada en revisión: ${previa.Resolucion}`, enRevision: true });
        continue;
      }
      if (!venta.idPuntoVenta || !Array.isArray(venta.items) || venta.items.length === 0)
        throw rechazo('idPuntoVenta e items son requeridos');
      const itemInvalido = venta.items.some(it =>
        !it.idProducto || !(parseFloat(it.Cantidad) > 0) || !(parseFloat(it.PrecioUnitario) >= 0));
      if (itemInvalido) throw rechazo('Items con cantidad o precio inválido');

      if (!(await tiendaEnAlcance(request.user, venta.idPuntoVenta, pool))) throw rechazo('Tienda no autorizada');

      // Idempotencia: si el UUID ya está registrado, se responde como synced
      const dupR = await pool.request()
        .input('uuid', sql.VarChar(40), uuid)
        .input('b',sql.BigInt,idBranch).input('c',sql.BigInt,idCuenta)
        .query(`SELECT idPedido FROM VIDA_PEDIDOS WHERE ClienteUUID=@uuid AND idBranch=@b AND idCuenta=@c`);
      if (dupR.recordset[0]) {
        synced.push({ ClienteUUID: uuid, idPedido: dupR.recordset[0].idPedido, duplicado: true });
        continue;
      }

      const res = await procesarVentaOffline(pool, { venta: { ...venta, ClienteUUID: uuid }, idBranch, idCuenta, idUsuario });
      // Estaba en revisión y ahora entró (p. ej. reenviada tras corregir el catálogo)
      if (previa?.Status === 'PENDIENTE') await marcarRegistrada(pool, { idBranch, idCuenta, idUsuario }, uuid, res.idPedido);
      synced.push({ ClienteUUID: uuid, idPedido: res.idPedido, requiereRevision: res.requiereRevision, ventaTardia: res.ventaTardia });

      broadcast(idBranch, idCuenta, {
        tipo: 'pedido:nuevo',
        idPedido: res.idPedido,
        Canal: 'POS',
        idPuntoVenta: venta.idPuntoVenta,
        esOffline: true,
      });
    } catch (err) {
      // Violación del índice único de UUID = otra petición concurrente ya la
      // registró → es un éxito de idempotencia, no un error
      if (err.number === 2601 || err.number === 2627) {
        const r = await pool.request()
          .input('uuid', sql.VarChar(40), uuid)
        .input('b',sql.BigInt,idBranch).input('c',sql.BigInt,idCuenta)
          .query(`SELECT idPedido FROM VIDA_PEDIDOS WHERE ClienteUUID=@uuid AND idBranch=@b AND idCuenta=@c`);
        if (r.recordset[0]) {
          synced.push({ ClienteUUID: uuid, idPedido: r.recordset[0].idPedido, duplicado: true });
          continue;
        }
      }
      request.log.error(err);
      // Rechazo que no se arregla reintentando: pasa a revisión en el servidor
      // (el dinero ya se cobró) y el POS la saca de su cola. Si ni eso se pudo
      // guardar, sigue en la cola y se reintenta.
      if (uuid && esRechazoPermanente(err)) {
        try {
          await guardarEnRevision(pool, { idBranch, idCuenta, idUsuario }, { ...venta, ClienteUUID: uuid }, err.message);
          failed.push({ ClienteUUID: uuid, motivo: err.message, enRevision: true });
          continue;
        } catch (e2) { request.log.error(e2); }
      }
      failed.push({ ClienteUUID: uuid, motivo: err.message, transitorio: true });
    }
  }

  return reply.send({ synced, failed });
}

// ══════════════════════════════════════════════════════════════════════════
// VENTAS OFFLINE EN REVISIÓN (rechazadas al sincronizar)
// GET  /pedidos/offline-revision?status=PENDIENTE&idPuntoVenta=
// POST /pedidos/offline-revision/:uuid/reintentar
// POST /pedidos/offline-revision/:uuid/anular  { Motivo }
// ══════════════════════════════════════════════════════════════════════════
export async function listarVentasRevision(request, reply) {
  const { idBranch, idCuenta, TipoUsuario, idPuntoVenta: pvUsuario } = request.user;
  const status = ['PENDIENTE', 'REGISTRADA', 'ANULADA'].includes(request.query?.status) ? request.query.status : 'PENDIENTE';
  try {
    const pool = await getPool();
    const req = pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('status', sql.VarChar(12), status);
    let filtro = '';
    if (!esRed({ TipoUsuario })) { req.input('pvU', sql.BigInt, pvUsuario ?? null); filtro += ' AND r.idPuntoVenta=@pvU'; }
    else filtro += filtroTiendasRed(request.user, 'r.idPuntoVenta', req);
    const pv = Number(request.query?.idPuntoVenta);
    if (Number.isSafeInteger(pv) && pv > 0) { req.input('pv', sql.BigInt, pv); filtro += ' AND r.idPuntoVenta=@pv'; }
    const r = await req.query(`
      SELECT TOP 200 r.ClienteUUID, r.idPuntoVenta, pv.NomComercial AS NombreSucursal, r.idUsuario,
             u.Nombre AS NombreCajero, r.TotalUSD, r.FechaVenta, r.Motivo, r.Intentos, r.Status,
             r.idPedido, r.Resolucion, r.FechaAlta, r.FechaResuelta, r.VentaJSON
      FROM VIDA_POS_VENTAS_REVISION r
      LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv ON pv.idBranch=r.idBranch AND pv.idCuenta=r.idCuenta AND pv.idPuntoVenta=r.idPuntoVenta
      LEFT JOIN VIDA_CUENTA_USUARIOS u ON u.idBranch=r.idBranch AND u.idCuenta=r.idCuenta AND u.idUsuario=r.idUsuario
      WHERE r.idBranch=@idBranch AND r.idCuenta=@idCuenta AND r.Status=@status ${filtro}
      ORDER BY r.FechaAlta DESC`);
    const ventas = r.recordset.map(({ VentaJSON, ...f }) => {
      let v = null; try { v = JSON.parse(VentaJSON); } catch { /* se muestra sin detalle */ }
      return { f, v };
    });
    const ids = [...new Set(ventas.flatMap(({ v }) => (v?.items || []).map(i => Number(i.idProducto)))
      .filter(n => Number.isSafeInteger(n) && n > 0))].slice(0, 500);
    const nombres = new Map();
    if (ids.length) {
      const pr = await pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
        .query(`SELECT idProducto, Nombre FROM VIDA_INVENTARIO_PRODUCTOS
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idProducto IN (${ids.join(',')})`);
      for (const p of pr.recordset) nombres.set(String(p.idProducto), p.Nombre);
    }
    const data = ventas.map(({ f, v }) => {
      return { ...f,
        Items: (v?.items || []).map(i => ({ idProducto: i.idProducto, Nombre: nombres.get(String(i.idProducto)) ?? null, Cantidad: i.Cantidad, PrecioUnitario: i.PrecioUnitario })),
        Moneda: v?.PagoMoneda?.Moneda ?? null, MetodoPago: v?.PagoMoneda?.Metodo ?? v?.MetodoPago ?? null };
    });
    return reply.send({ data });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'No se pudieron consultar las ventas en revisión' });
  }
}

async function ventaRevisionOperable(request, reply, pool) {
  const { idBranch, idCuenta } = request.user;
  const fila = await obtenerEnRevision(pool, { idBranch, idCuenta }, String(request.params.uuid).slice(0, 40));
  if (!fila || !(await tiendaEnAlcance(request.user, fila.idPuntoVenta, pool))) { reply.code(404).send({ error: 'Venta no encontrada' }); return null; }
  if (fila.Status !== 'PENDIENTE') { reply.code(409).send({ error: 'La venta ya fue resuelta' }); return null; }
  return fila;
}

export async function reintentarVentaRevision(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  try {
    const pool = await getPool();
    const fila = await ventaRevisionOperable(request, reply, pool);
    if (!fila) return reply;
    const existente = async () => (await pool.request().input('uuid', sql.VarChar(40), fila.ClienteUUID)
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
      .query(`SELECT idPedido FROM VIDA_PEDIDOS WHERE ClienteUUID=@uuid AND idBranch=@b AND idCuenta=@c`)).recordset[0];
    let idPedido = (await existente())?.idPedido, res = null;
    if (!idPedido) {
      // Se registra a nombre del cajero que cobró: la cotización es suya
      try {
        res = await procesarVentaOffline(pool, { venta: JSON.parse(fila.VentaJSON), idBranch, idCuenta, idUsuario: fila.idUsuario });
        idPedido = res.idPedido;
      } catch (err) {
        if (err.number === 2601 || err.number === 2627) idPedido = (await existente())?.idPedido;
        if (!idPedido) {
          if (!esRechazoPermanente(err)) throw err;
          await anotarFallo(pool, { idBranch, idCuenta }, fila.ClienteUUID, err.message);
          return reply.code(422).send({ error: `Sigue sin poder registrarse: ${err.message}` });
        }
      }
    }
    await marcarRegistrada(pool, { idBranch, idCuenta, idUsuario }, fila.ClienteUUID, idPedido);
    await registrarAuditoria(pool, { idBranch, idCuenta, entityType: 'PEDIDO', entityId: idPedido,
      accion: 'VENTA_OFFLINE_REVISION_REGISTRADA', actor: idUsuario,
      data: { ClienteUUID: fila.ClienteUUID, idPuntoVenta: fila.idPuntoVenta, idCajero: fila.idUsuario, MotivoRechazo: fila.Motivo } }, request.log);
    if (res) broadcast(idBranch, idCuenta, { tipo: 'pedido:nuevo', idPedido, Canal: 'POS', idPuntoVenta: fila.idPuntoVenta, esOffline: true });
    return reply.send({ ok: true, idPedido, requiereRevision: !!res?.requiereRevision, ventaTardia: !!res?.ventaTardia });
  } catch (err) {
    request.log.error(err);
    return reply.code(503).send({ error: 'No se pudo reintentar ahora; prueba de nuevo' });
  }
}

export async function anularVentaRevision(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const motivo = String(request.body?.Motivo || '').trim();
  if (motivo.length < 10) return reply.code(400).send({ error: 'Explica en al menos 10 caracteres por qué se anula (p. ej. qué se hizo con el dinero)' });
  try {
    const pool = await getPool();
    const fila = await ventaRevisionOperable(request, reply, pool);
    if (!fila) return reply;
    if (!(await marcarAnulada(pool, { idBranch, idCuenta, idUsuario }, fila.ClienteUUID, motivo.slice(0, 500))))
      return reply.code(409).send({ error: 'La venta ya fue resuelta' });
    await registrarAuditoria(pool, { idBranch, idCuenta, entityType: 'VENTA_OFFLINE', entityId: fila.ClienteUUID,
      accion: 'VENTA_OFFLINE_REVISION_ANULADA', actor: idUsuario,
      data: { idPuntoVenta: fila.idPuntoVenta, idCajero: fila.idUsuario, TotalUSD: fila.TotalUSD, MotivoRechazo: fila.Motivo, Motivo: motivo } }, request.log);
    return reply.send({ ok: true });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'No se pudo anular la venta' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CAMBIAR STATUS DEL PEDIDO
// ══════════════════════════════════════════════════════════════════════════
export async function cambiarStatusPedido(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idPedido } = request.params;
  const { StatusNuevo, Notas, idRepartidor } = request.body;

  if (!StatusNuevo) return reply.code(400).send({ error: 'StatusNuevo es requerido' });

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  let enTransaccion = false;

  try {
    const pedR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idPedido', sql.BigInt, idPedido)
      .query(`SELECT Status, idPuntoVenta, Canal FROM VIDA_PEDIDOS
              WHERE idBranch = @idBranch AND idCuenta = @idCuenta AND idPedido = @idPedido`);

    const pedido = pedR.recordset[0];
    if (!pedido) return reply.code(404).send({ error: 'Pedido no encontrado' });

    // Las ventas POS son inmediatas: permiten NUEVO → ENTREGADO directamente
    const esPOS = pedido.Canal === 'POS';
    const permitidos = esPOS && pedido.Status === 'NUEVO'
      ? ['ENTREGADO', 'CANCELADO']
      : (TRANSICIONES[pedido.Status] || []);

    if (!permitidos.includes(StatusNuevo))
      return reply.code(400).send({
        error: `No se puede pasar de ${pedido.Status} a ${StatusNuevo}`,
        transicionesValidas: permitidos,
      });

    await transaction.begin();
    enTransaccion = true;

    // Actualizar pedido PRIMERO, exigiendo el status leído: si otra petición
    // concurrente ya lo cambió, rowsAffected = 0 y se aborta sin tocar stock
    // (evita doble descuento por doble click o dos requests simultáneos)
    const updReq = new sql.Request(transaction)
      .input('idBranch',      sql.BigInt,     idBranch)
      .input('idCuenta',      sql.BigInt,     idCuenta)
      .input('idPedido',      sql.BigInt,     idPedido)
      .input('Status',        sql.VarChar(20), StatusNuevo)
      .input('StatusAnterior',sql.VarChar(20), pedido.Status);

    let setExtra = '';
    if (idRepartidor) {
      updReq.input('idRepartidor', sql.BigInt, idRepartidor);
      setExtra = ', idRepartidor = @idRepartidor';
    }

    const updR = await updReq.query(`UPDATE VIDA_PEDIDOS SET
                          Status = @Status, FechaMod = GETUTCDATE() ${setExtra}
                        WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido
                          AND Status = @StatusAnterior`);

    if (updR.rowsAffected[0] === 0) {
      await transaction.rollback();
      enTransaccion = false;
      return reply.code(409).send({ error: 'El pedido fue modificado por otra operación. Recarga e intenta de nuevo.' });
    }

    // Si se entrega → descontar stock real y liberar reserva
    if (StatusNuevo === 'ENTREGADO') {
      const detR = await new sql.Request(transaction)
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta)
        .input('idPedido', sql.BigInt, idPedido)
        .query(`SELECT idProducto, Cantidad FROM VIDA_PEDIDOS_DETALLE
                WHERE idBranch = @idBranch AND idCuenta = @idCuenta AND idPedido = @idPedido`);

      for (const item of detR.recordset) {
        // Descuento atómico: OUTPUT devuelve el antes/después de la misma
        // operación — sin SELECT previo que pueda quedar desactualizado
        const stockR = await new sql.Request(transaction)
          .input('idBranch',    sql.BigInt,       idBranch)
          .input('idCuenta',    sql.BigInt,       idCuenta)
          .input('idPuntoVenta',sql.BigInt,       pedido.idPuntoVenta)
          .input('idProducto',  sql.BigInt,       item.idProducto)
          .input('Cantidad',    sql.Decimal(18,4), parseFloat(item.Cantidad))
          .query(`UPDATE VIDA_INVENTARIO_STOCK WITH (UPDLOCK, HOLDLOCK) SET
                    Cantidad = CASE WHEN ISNULL(Cantidad,0) - @Cantidad < 0 THEN 0
                                    ELSE ISNULL(Cantidad,0) - @Cantidad END,
                    StockReservado = CASE WHEN ISNULL(StockReservado,0) - @Cantidad < 0 THEN 0
                                          ELSE ISNULL(StockReservado,0) - @Cantidad END,
                    FechaMod = GETUTCDATE()
                  OUTPUT ISNULL(deleted.Cantidad,0) AS CantidadAntes,
                         ISNULL(inserted.Cantidad,0) AS CantidadDespues
                  WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                    AND idPuntoVenta=@idPuntoVenta AND idProducto=@idProducto`);

        const s = stockR.recordset[0] || { CantidadAntes: 0, CantidadDespues: 0 };

        // Movimiento de inventario
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
          .input('Motivo',          sql.VarChar(300),  `Venta pedido #${idPedido}`)
          .input('Referencia',      sql.VarChar(100),  String(idPedido))
          .input('UsuAlta',         sql.VarChar(20),   String(idUsuario))
          .query(`INSERT INTO VIDA_INVENTARIO_MOVIMIENTOS
                    (idBranch, idCuenta, idMovimiento, idPuntoVenta, idProducto,
                     TipoMovimiento, Cantidad, CantidadAntes, CantidadDespues,
                     Motivo, Referencia, UsuAlta)
                  VALUES
                    (@idBranch, @idCuenta, @idMovimiento, @idPuntoVenta, @idProducto,
                     'SALIDA', @Cantidad, @CantidadAntes, @CantidadDespues,
                     @Motivo, @Referencia, @UsuAlta)`);
      }
    }

    // Si se cancela → liberar reserva sin descontar stock
    // (CASE WHEN en lugar de GREATEST: no existe en SQL Server < 2022)
    if (StatusNuevo === 'CANCELADO') {
      const detR = await new sql.Request(transaction)
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta)
        .input('idPedido', sql.BigInt, idPedido)
        .query(`SELECT idProducto, Cantidad FROM VIDA_PEDIDOS_DETALLE
                WHERE idBranch = @idBranch AND idCuenta = @idCuenta AND idPedido = @idPedido`);

      for (const item of detR.recordset) {
        await new sql.Request(transaction)
          .input('idBranch',    sql.BigInt,       idBranch)
          .input('idCuenta',    sql.BigInt,       idCuenta)
          .input('idPuntoVenta',sql.BigInt,       pedido.idPuntoVenta)
          .input('idProducto',  sql.BigInt,       item.idProducto)
          .input('Cantidad',    sql.Decimal(18,4), parseFloat(item.Cantidad))
          .query(`UPDATE VIDA_INVENTARIO_STOCK SET
                    StockReservado = CASE WHEN ISNULL(StockReservado,0) - @Cantidad < 0 THEN 0
                                          ELSE ISNULL(StockReservado,0) - @Cantidad END,
                    FechaMod = GETUTCDATE()
                  WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                    AND idPuntoVenta=@idPuntoVenta AND idProducto=@idProducto`);
      }
    }

    // Historial
    const histId = await nextIdTx(transaction, 'VIDA_PEDIDOS_HISTORIAL', 'idHistorial', idBranch, idCuenta);
    await new sql.Request(transaction)
      .input('idBranch',      sql.BigInt,     idBranch)
      .input('idCuenta',      sql.BigInt,     idCuenta)
      .input('idHistorial',   sql.BigInt,     histId)
      .input('idPedido',      sql.BigInt,     idPedido)
      .input('StatusAnterior',sql.VarChar(20), pedido.Status)
      .input('StatusNuevo',   sql.VarChar(20), StatusNuevo)
      .input('Notas',         sql.VarChar(500), Notas || null)
      .input('UsuAlta',       sql.VarChar(20), String(idUsuario))
      .query(`INSERT INTO VIDA_PEDIDOS_HISTORIAL
                (idBranch, idCuenta, idHistorial, idPedido, StatusAnterior, StatusNuevo, Notas, UsuAlta)
              VALUES (@idBranch, @idCuenta, @idHistorial, @idPedido, @StatusAnterior, @StatusNuevo, @Notas, @UsuAlta)`);

    if (['ENTREGADO', 'CANCELADO'].includes(StatusNuevo)) {
      await registrarAuditoria(transaction, {
        idBranch, idCuenta,
        entityType: 'PEDIDO', entityId: idPedido,
        accion: StatusNuevo, actor: idUsuario,
        data: { StatusAnterior: pedido.Status, Canal: pedido.Canal, idPuntoVenta: pedido.idPuntoVenta, Notas: Notas || null },
      }, request.log);
    }

    await transaction.commit();
    enTransaccion = false;

    // Notificar en tiempo real
    broadcast(idBranch, idCuenta, {
      tipo:        'pedido:actualizado',
      idPedido:    parseInt(idPedido),
      StatusAnterior: pedido.Status,
      StatusNuevo,
      idPuntoVenta: pedido.idPuntoVenta,
    });

    return reply.send({ message: `Pedido actualizado a ${StatusNuevo}` });
  } catch (err) {
    if (enTransaccion) {
      try { await transaction.rollback(); } catch (rbErr) { request.log.error('Rollback falló: ' + rbErr.message); }
    }
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al cambiar status: ' + err.message });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// RESOLVER REVISIÓN DE STOCK
// PATCH /pedidos/:idPedido/revision-stock — marca como revisada una venta
// offline que se sincronizó con stock insuficiente
// ══════════════════════════════════════════════════════════════════════════
export async function resolverRevisionStock(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idPedido } = request.params;
  const { Notas } = request.body || {};

  try {
    const pool = await getPool();

    // Guard de status: solo la primera resolución afecta filas
    const updR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idPedido', sql.BigInt, idPedido)
      .query(`UPDATE VIDA_PEDIDOS SET RequiereRevision = 0, FechaMod = GETUTCDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido
                AND RequiereRevision = 1`);

    if (updR.rowsAffected[0] === 0) {
      return reply.code(404).send({ error: 'El pedido no existe o ya fue revisado' });
    }

    // id con MAX()+1: si otra alta concurrente toma el mismo, se reintenta
    const histId = await conIdUnico(async () => {
      const histId = await nextId(pool, 'VIDA_PEDIDOS_HISTORIAL', 'idHistorial', idBranch, idCuenta);
      await pool.request()
        .input('idBranch',    sql.BigInt,      idBranch)
        .input('idCuenta',    sql.BigInt,      idCuenta)
        .input('idHistorial', sql.BigInt,      histId)
        .input('idPedido',    sql.BigInt,      idPedido)
        .input('Notas',       sql.VarChar(500), Notas ? `Revisión de stock resuelta: ${Notas}`.slice(0, 500) : 'Revisión de stock resuelta')
        .input('UsuAlta',     sql.VarChar(20), String(idUsuario))
        .query(`INSERT INTO VIDA_PEDIDOS_HISTORIAL
                  (idBranch, idCuenta, idHistorial, idPedido, StatusAnterior, StatusNuevo, Notas, UsuAlta)
                VALUES (@idBranch, @idCuenta, @idHistorial, @idPedido, 'ENTREGADO', 'ENTREGADO', @Notas, @UsuAlta)`);
      return histId;
    });

    return reply.send({ message: 'Revisión resuelta' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al resolver revisión' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// EXPIRAR PEDIDOS (job que corre cada minuto)
// ══════════════════════════════════════════════════════════════════════════
export async function expirarPedidosVencidos(pool, log) {
  try {
    // Buscar pedidos NUEVO o PREPARANDO que ya vencieron y no están pagados
    const r = await pool.request().query(`
      SELECT idBranch, idCuenta, idPedido, idPuntoVenta
      FROM VIDA_PEDIDOS
      WHERE Status IN ('NUEVO')
        AND StatusPago = 'PENDIENTE'
        AND FechaExpiracion < GETUTCDATE()
    `);

    for (const pedido of r.recordset) {
      // Liberar reserva
      const detR = await pool.request()
        .input('idBranch', sql.BigInt, pedido.idBranch)
        .input('idCuenta', sql.BigInt, pedido.idCuenta)
        .input('idPedido', sql.BigInt, pedido.idPedido)
        .query(`SELECT idProducto, Cantidad FROM VIDA_PEDIDOS_DETALLE
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);

      for (const item of detR.recordset) {
        await pool.request()
          .input('idBranch',    sql.BigInt,       pedido.idBranch)
          .input('idCuenta',    sql.BigInt,       pedido.idCuenta)
          .input('idPuntoVenta',sql.BigInt,       pedido.idPuntoVenta)
          .input('idProducto',  sql.BigInt,       item.idProducto)
          .input('Cantidad',    sql.Decimal(18,4), parseFloat(item.Cantidad))
          .query(`UPDATE VIDA_INVENTARIO_STOCK SET
                    StockReservado = CASE WHEN ISNULL(StockReservado,0) - @Cantidad < 0 THEN 0
                                         ELSE ISNULL(StockReservado,0) - @Cantidad END,
                    FechaMod = GETUTCDATE()
                  WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                    AND idPuntoVenta=@idPuntoVenta AND idProducto=@idProducto`);
      }

      // Cancelar pedido
      await pool.request()
        .input('idBranch', sql.BigInt,     pedido.idBranch)
        .input('idCuenta', sql.BigInt,     pedido.idCuenta)
        .input('idPedido', sql.BigInt,     pedido.idPedido)
        .query(`UPDATE VIDA_PEDIDOS SET Status='CANCELADO', FechaMod=GETUTCDATE()
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);

      // Historial
      // id con MAX()+1: si otra alta concurrente toma el mismo, se reintenta
      await conIdUnico(async () => {
        const histId = await nextId(pool, 'VIDA_PEDIDOS_HISTORIAL', 'idHistorial', pedido.idBranch, pedido.idCuenta);
        await pool.request()
          .input('idBranch',    sql.BigInt,     pedido.idBranch)
          .input('idCuenta',    sql.BigInt,     pedido.idCuenta)
          .input('idHistorial', sql.BigInt,     histId)
          .input('idPedido',    sql.BigInt,     pedido.idPedido)
          .query(`INSERT INTO VIDA_PEDIDOS_HISTORIAL
                    (idBranch, idCuenta, idHistorial, idPedido, StatusAnterior, StatusNuevo, Notas, UsuAlta)
                  VALUES (@idBranch, @idCuenta, @idHistorial, @idPedido,
                          'NUEVO', 'CANCELADO', 'Expirado por falta de pago (10 min)', 'SISTEMA')`);
      });

      if (log) log.info(`Pedido ${pedido.idPedido} expirado y cancelado`);
    }
  } catch (err) {
    if (log) log.error('Error en job de expiración: ' + err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ASIGNAR REPARTIDOR
// ══════════════════════════════════════════════════════════════════════════
export async function asignarRepartidor(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idPedido } = request.params;
  const { idRepartidor } = request.body;

  if (!idRepartidor) return reply.code(400).send({ error: 'idRepartidor es requerido' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('idPedido',    sql.BigInt, idPedido)
      .input('idRepartidor',sql.BigInt, idRepartidor)
      .query(`UPDATE VIDA_PEDIDOS SET idRepartidor=@idRepartidor, FechaMod=GETUTCDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);

    // Push al repartidor asignado manualmente desde el panel
    const repR = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`SELECT FcmToken FROM VIDA_REPARTIDORES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);
    const token = repR.recordset[0]?.FcmToken;
    if (token) {
      enviarPush(token, {
        title: '📋 Pedido asignado',
        body: `Te asignaron el pedido #${idPedido} desde el panel`,
        data: { tipo: 'pedido_asignado', idPedido: parseInt(idPedido) },
      }, request.log);
    }

    return reply.send({ message: 'Repartidor asignado' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al asignar repartidor' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// COMPROBANTE DE PAGO
// ══════════════════════════════════════════════════════════════════════════
export async function subirComprobante(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idPedido } = request.params;
  const { ImagenURL, Referencia } = request.body;

  if (!ImagenURL) return reply.code(400).send({ error: 'ImagenURL es requerido' });

  try {
    const pool = await getPool();
    // ID en la misma sentencia del INSERT (MAX+1 con bloqueo de rango): dos
    // altas simultáneas ya no chocan por llave primaria.
    const ins = await pool.request()
      .input('idBranch',     sql.BigInt,      idBranch)
      .input('idCuenta',     sql.BigInt,      idCuenta)
      .input('idPedido',     sql.BigInt,      idPedido)
      .input('ImagenURL',    sql.VarChar(500), ImagenURL)
      .input('Referencia',   sql.VarChar(100), Referencia || null)
      .input('UsuAlta',      sql.VarChar(20),  String(idUsuario))
      .query(`INSERT INTO VIDA_PEDIDOS_COMPROBANTES
                (idBranch, idCuenta, idComprobante, idPedido, ImagenURL, Referencia, UsuAlta)
              OUTPUT inserted.idComprobante
              SELECT @idBranch, @idCuenta, ISNULL(MAX(idComprobante),0)+1, @idPedido, @ImagenURL, @Referencia, @UsuAlta
              FROM VIDA_PEDIDOS_COMPROBANTES WITH (UPDLOCK, HOLDLOCK)
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
    const nuevoId = ins.recordset[0].idComprobante;

    return reply.code(201).send({ message: 'Comprobante subido', idComprobante: nuevoId });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al subir comprobante' });
  }
}

export async function revisarComprobante(request, reply) {
  const { idBranch, idCuenta, idUsuario, TipoUsuario, idPuntoVenta: pvUsuario } = request.user;
  const { idPedido, idComprobante } = request.params;
  const { StatusRevision, Notas } = request.body;

  if (!['APROBADO', 'RECHAZADO'].includes(StatusRevision))
    return reply.code(400).send({ error: 'StatusRevision debe ser APROBADO o RECHAZADO' });

  let transaction;
  try {
    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    const actual = await new sql.Request(transaction)
      .input('idBranch',sql.BigInt,idBranch).input('idCuenta',sql.BigInt,idCuenta)
      .input('idComprobante',sql.BigInt,idComprobante).input('idPedido',sql.BigInt,idPedido)
      .query(`SELECT c.StatusRevision,p.Status,p.StatusPago,p.idCliente,p.idPuntoVenta,cl.FcmToken
              FROM VIDA_PEDIDOS_COMPROBANTES c WITH (UPDLOCK,HOLDLOCK)
              JOIN VIDA_PEDIDOS p ON p.idBranch=c.idBranch AND p.idCuenta=c.idCuenta AND p.idPedido=c.idPedido
              LEFT JOIN VIDA_APP_CLIENTES cl ON cl.idBranch=p.idBranch AND cl.idCuenta=p.idCuenta AND cl.idCliente=p.idCliente
              WHERE c.idBranch=@idBranch AND c.idCuenta=@idCuenta AND c.idComprobante=@idComprobante AND c.idPedido=@idPedido`);
    if (!actual.recordset.length) {
      await transaction.rollback(); transaction=null;
      return reply.code(404).send({ error:'Comprobante no encontrado' });
    }
    const pedido = actual.recordset[0];
    // Cada rol revisa pagos solo de las tiendas de su alcance.
    if (!(await tiendaEnAlcance(request.user, pedido.idPuntoVenta, pool))) {
      await transaction.rollback(); transaction=null;
      return reply.code(403).send({ error:'No puedes revisar pagos de otra tienda' });
    }
    if (pedido.StatusRevision !== 'PENDIENTE') {
      await transaction.rollback(); transaction=null;
      return reply.code(409).send({ error:'El comprobante ya fue resuelto' });
    }
    const flujoRetenido = pedido.Status === 'ESPERANDO_PAGO';
    let otroPendiente = false;

    await new sql.Request(transaction)
      .input('idBranch',      sql.BigInt,     idBranch)
      .input('idCuenta',      sql.BigInt,     idCuenta)
      .input('idComprobante', sql.BigInt,     idComprobante)
      .input('idPedido',      sql.BigInt,     idPedido)
      .input('StatusRevision',sql.VarChar(20), StatusRevision)
      .input('Notas',         sql.VarChar(300), Notas || null)
      .input('UsuRevision',   sql.VarChar(20), String(idUsuario))
      .query(`UPDATE VIDA_PEDIDOS_COMPROBANTES SET
                StatusRevision=@StatusRevision, Notas=@Notas, UsuRevision=@UsuRevision
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND idComprobante=@idComprobante AND idPedido=@idPedido`);

    // Al aprobar empieza ahora el reloj de búsqueda; el job de despacho lo
    // ofrecerá a repartidores en su siguiente ejecución.
    if (StatusRevision === 'APROBADO' && flujoRetenido) {
      const cfg = await new sql.Request(transaction)
        .input('idBranch',sql.BigInt,idBranch).input('idCuenta',sql.BigInt,idCuenta)
        .query(`SELECT TOP 1 TRY_CONVERT(INT,Valor) AS Minutos FROM VIDA_CONFIG_DELIVERY
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Clave='TiempoCancelacionBusquedaMin'`);
      const minutos = Number(cfg.recordset[0]?.Minutos) > 0 ? Number(cfg.recordset[0].Minutos) : 25;
      await new sql.Request(transaction)
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta)
        .input('idPedido', sql.BigInt, idPedido)
        .input('minutos',sql.Int,minutos)
        .query(`UPDATE VIDA_PEDIDOS
                SET StatusPago='PAGADO',Status='BUSCANDO_REPARTIDOR',
                    FechaInicioBusqueda=GETUTCDATE(),FechaLimiteBusqueda=DATEADD(MINUTE,@minutos,GETUTCDATE()),
                    AvisoSinRepartidor=0,FechaMod=GETUTCDATE()
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido AND Status='ESPERANDO_PAGO'`);
    } else if (flujoRetenido) {
      // Si el cliente ya mandó otro comprobante que sigue en revisión, el pago
      // no está rechazado: se conserva PENDIENTE y no se le pide uno nuevo.
      const rech = await new sql.Request(transaction)
        .input('idBranch',sql.BigInt,idBranch).input('idCuenta',sql.BigInt,idCuenta).input('idPedido',sql.BigInt,idPedido)
        .query(`UPDATE VIDA_PEDIDOS SET StatusPago='RECHAZADO',FechaMod=GETUTCDATE()
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido AND Status='ESPERANDO_PAGO'
                  AND NOT EXISTS (SELECT 1 FROM VIDA_PEDIDOS_COMPROBANTES c
                                  WHERE c.idBranch=@idBranch AND c.idCuenta=@idCuenta AND c.idPedido=@idPedido
                                    AND c.StatusRevision='PENDIENTE')`);
      otroPendiente = rech.rowsAffected[0] === 0;
    } else if (StatusRevision === 'APROBADO') {
      // Compatibilidad con comprobantes históricos creados antes del flujo
      // retenido: se valida el pago sin retroceder ni reiniciar su despacho.
      await new sql.Request(transaction)
        .input('idBranch',sql.BigInt,idBranch).input('idCuenta',sql.BigInt,idCuenta).input('idPedido',sql.BigInt,idPedido)
        .query(`UPDATE VIDA_PEDIDOS SET StatusPago='PAGADO',FechaMod=GETUTCDATE()
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);
    }

    await transaction.commit(); transaction=null;

    const estado = flujoRetenido && StatusRevision === 'APROBADO' ? 'BUSCANDO_REPARTIDOR' : pedido.Status;
    const statusPago = StatusRevision==='APROBADO' ? 'PAGADO' : otroPendiente ? 'PENDIENTE' : 'RECHAZADO';
    broadcast(idBranch,idCuenta,{tipo:'status_pedido',idPedido:Number(idPedido),idCliente:pedido.idCliente,estado,StatusPago:statusPago});
    broadcast(idBranch,idCuenta,{tipo:'pedido:actualizado',idPedido:Number(idPedido),StatusNuevo:estado,StatusPago:statusPago});
    enviarPush(pedido.FcmToken,{
      title:StatusRevision==='APROBADO'?'✅ Pago aprobado':'⚠️ Comprobante rechazado',
      body:StatusRevision==='APROBADO'
        ? (flujoRetenido ? `Tu pedido #${idPedido} ya está buscando repartidor.` : `El pago del pedido #${idPedido} fue aprobado.`)
        : otroPendiente ? `Rechazamos un comprobante del pedido #${idPedido}; seguimos revisando el más reciente.`
        : (flujoRetenido ? `Revisa el comprobante del pedido #${idPedido} y envía uno nuevo.` : `El comprobante del pedido #${idPedido} fue rechazado.`),
      data:{tipo:'status_pedido',idPedido:Number(idPedido),status:estado},
    },request.log);

    return reply.send({ message: `Comprobante ${StatusRevision === 'APROBADO' ? 'aprobado' : 'rechazado'}` });
  } catch (err) {
    if (transaction) try { await transaction.rollback(); } catch {}
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al revisar comprobante' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDORES
// ══════════════════════════════════════════════════════════════════════════
export async function listarRepartidores(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { statusAprobacion = '', statusActividad = '' } = request.query;

  try {
    const pool = await getPool();
    let whereExtra = '';
    if (statusAprobacion) whereExtra += ' AND StatusAprobacion = @statusAprobacion';
    if (statusActividad)  whereExtra += ' AND StatusActividad = @statusActividad';

    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta);
    if (statusAprobacion) req.input('statusAprobacion', sql.VarChar(20), statusAprobacion);
    if (statusActividad)  req.input('statusActividad',  sql.VarChar(20), statusActividad);

    const r = await req.query(`
      SELECT idRepartidor, Nombre, Email, Telefono, FotoURL,
             StatusAprobacion, StatusActividad, FechaAlta
      FROM VIDA_REPARTIDORES
      WHERE idBranch=@idBranch AND idCuenta=@idCuenta
      ${whereExtra}
      ORDER BY Nombre
    `);

    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener repartidores' });
  }
}

export async function aprobarRepartidor(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idRepartidor } = request.params;
  const { StatusAprobacion } = request.body;

  if (!['APROBADO', 'RECHAZADO'].includes(StatusAprobacion))
    return reply.code(400).send({ error: 'StatusAprobacion debe ser APROBADO o RECHAZADO' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',        sql.BigInt,     idBranch)
      .input('idCuenta',        sql.BigInt,     idCuenta)
      .input('idRepartidor',    sql.BigInt,     idRepartidor)
      .input('StatusAprobacion',sql.VarChar(20), StatusAprobacion)
      .query(`UPDATE VIDA_REPARTIDORES SET StatusAprobacion=@StatusAprobacion
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);

    // Avisarle al repartidor si tiene token push registrado
    if (StatusAprobacion === 'APROBADO') {
      const tokR = await pool.request()
        .input('idBranch',     sql.BigInt, idBranch)
        .input('idCuenta',     sql.BigInt, idCuenta)
        .input('idRepartidor', sql.BigInt, idRepartidor)
        .query(`SELECT FcmToken FROM VIDA_REPARTIDORES
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);
      const token = tokR.recordset[0]?.FcmToken;
      if (token) {
        enviarPush(token, {
          title: '🎉 ¡Cuenta aprobada!',
          body: 'Ya puedes iniciar sesión y comenzar a repartir',
          data: { tipo: 'cuenta_aprobada' },
        }, request.log);
      }
    }

    return reply.send({ message: `Repartidor ${StatusAprobacion === 'APROBADO' ? 'aprobado' : 'rechazado'}` });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al actualizar repartidor' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// VENTAS POS — historial del día para reimpresión de tickets
// GET /api/pedidos/pos/ventas?fecha=YYYY-MM-DD&idPuntoVenta=X
// ══════════════════════════════════════════════════════════════════════════
export async function listarVentasPOS(request, reply) {
  const { idBranch, idCuenta, TipoUsuario, idPuntoVenta: pvUsuario } = request.user;
  const { fecha } = request.query;

  // Roles de tienda quedan forzados a su propio punto de venta; los de red
  // pueden filtrar por el que pasen en la query (o ver todas).
  const esRed = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO'].includes(TipoUsuario);
  const idPuntoVenta = esRed ? request.query.idPuntoVenta : pvUsuario;

  // Por defecto: hoy
  const fechaFiltro = fecha || fechaCaracas();

  try {
    const pool = await getPool();

    const req = pool.request()
      .input('idBranch',   sql.BigInt,    idBranch)
      .input('idCuenta',   sql.BigInt,    idCuenta)
      .input('fechaInicio',sql.VarChar(20), fechaFiltro + ' 00:00:00')
      .input('fechaFin',   sql.VarChar(20), fechaFiltro + ' 23:59:59');

    let whereExtra = '';
    if (idPuntoVenta) {
      req.input('idPuntoVenta', sql.BigInt, idPuntoVenta);
      whereExtra = 'AND p.idPuntoVenta = @idPuntoVenta';
    }
    // Roles de red: solo ventas de tiendas de su alcance
    if (esRed) whereExtra += filtroTiendasRed(request.user, 'p.idPuntoVenta', req);

    // Pedidos POS entregados (ventas completadas)
    const pedidosR = await req.query(`
      SELECT p.idPedido, p.FechaAlta, p.MetodoPago, p.StatusPago,
             p.TotalUSD, p.MontoEfectivo, p.MontoTarjeta, p.MontoCambio, p.PagoMonedaJSON,
             p.Status, pv.NomComercial AS NombreSucursal, pv.ModalidadFiscal,
             fa.idFactura, fa.Numero AS NumeroFactura, fa.Status AS StatusFactura,
             (SELECT COUNT(*) FROM VIDA_FACTURAS nc WHERE nc.idBranch = fa.idBranch AND nc.idCuenta = fa.idCuenta
                AND nc.idFacturaAfectada = fa.idFactura AND nc.TipoDocumento = 'NOTA_CREDITO') AS NotasCredito,
             (SELECT ISNULL(SUM(d.MontoUSD), 0) FROM VIDA_DEVOLUCIONES d WHERE d.idBranch = p.idBranch AND d.idCuenta = p.idCuenta
                AND d.idPedido = p.idPedido) AS DevueltoUSD
      FROM VIDA_PEDIDOS p
      LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch = p.idBranch AND pv.idCuenta = p.idCuenta
       AND pv.idPuntoVenta = p.idPuntoVenta
      LEFT JOIN VIDA_FACTURAS fa
        ON fa.idBranch = p.idBranch AND fa.idCuenta = p.idCuenta AND fa.idPedido = p.idPedido AND fa.TipoDocumento = 'FACTURA'
      WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
        AND p.Canal = 'POS'
        AND p.Status = 'ENTREGADO'
        AND DATEADD(HOUR,-4,p.FechaAlta) BETWEEN @fechaInicio AND @fechaFin
        ${whereExtra}
      ORDER BY p.FechaAlta DESC
    `);

    const pedidos = pedidosR.recordset;

    // Detalle de cada pedido
    const idsPedidos = pedidos.map(p => p.idPedido);
    let detalle = [];
    if (idsPedidos.length > 0) {
      const detalleR = await pool.request()
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta)
        .query(`
          SELECT d.idPedido, d.idProducto, d.Cantidad, d.PrecioUnitario,
                 pr.Nombre AS NombreProducto, pr.SKU
          FROM VIDA_PEDIDOS_DETALLE d
          INNER JOIN VIDA_INVENTARIO_PRODUCTOS pr
            ON pr.idBranch = d.idBranch AND pr.idCuenta = d.idCuenta
           AND pr.idProducto = d.idProducto
          WHERE d.idBranch = @idBranch AND d.idCuenta = @idCuenta
            AND d.idPedido IN (${idsPedidos.join(',')})
        `);
      detalle = detalleR.recordset;
    }

    // Combinar pedidos con su detalle
    const resultado = pedidos.map(p => ({
      ...p,
      items: detalle.filter(d => d.idPedido === p.idPedido),
    }));

    // Totales del día
    const totalDia     = resultado.reduce((s, p) => s + parseFloat(p.TotalUSD || 0), 0);
    const totalEfectivo = resultado.reduce((s, p) => s + parseFloat(p.MontoEfectivo || 0), 0);
    const totalTarjeta  = resultado.reduce((s, p) => s + parseFloat(p.MontoTarjeta  || 0), 0);
    const totalCambio   = resultado.reduce((s, p) => s + parseFloat(p.MontoCambio   || 0), 0);

    return reply.send({
      ventas: resultado,
      resumen: {
        totalVentas:   resultado.length,
        totalDia:      parseFloat(totalDia.toFixed(4)),
        totalEfectivo: parseFloat(totalEfectivo.toFixed(4)),
        totalTarjeta:  parseFloat(totalTarjeta.toFixed(4)),
        totalCambio:   parseFloat(totalCambio.toFixed(4)),
      },
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener ventas POS: ' + err.message });
  }
}
