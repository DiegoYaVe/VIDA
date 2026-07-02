// src/controllers/pedidos.controller.js
import { getPool, sql } from '../db/sqlserver.js';
import { broadcast } from '../ws/ws.manager.js';

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
  const { idBranch, idCuenta } = request.user;
  const { page = 1, limit = 20, status = '', canal = '', idPuntoVenta = '' } = request.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const pool = await getPool();

    let whereExtra = '';
    if (status)       whereExtra += ' AND p.Status = @status';
    if (canal)        whereExtra += ' AND p.Canal = @canal';
    if (idPuntoVenta) whereExtra += ' AND p.idPuntoVenta = @idPuntoVenta';

    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('offset',   sql.Int,    offset)
      .input('limit',    sql.Int,    parseInt(limit));

    if (status)       req.input('status',       sql.VarChar(20), status);
    if (canal)        req.input('canal',         sql.VarChar(10), canal);
    if (idPuntoVenta) req.input('idPuntoVenta',  sql.BigInt,      idPuntoVenta);

    const r = await req.query(`
      SELECT p.idPedido, p.Canal, p.Status, p.MetodoPago, p.StatusPago,
             p.TotalUSD, p.MontoEfectivo, p.MontoTarjeta, p.MontoCambio,
             p.Notas, p.FechaAlta, p.FechaExpiracion,
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
               p.TotalUSD, p.MontoEfectivo, p.MontoTarjeta, p.MontoCambio,
               p.Notas, p.FechaAlta, p.FechaExpiracion,
               pv.NomComercial AS NombreSucursal,
               cl.Nombre AS NombreCliente, cl.Telefono AS TelefonoCliente,
               cl.Direccion AS DireccionCliente,
               rep.Nombre AS NombreRepartidor, rep.Telefono AS TelefonoRepartidor,
               rep.FotoURL AS FotoRepartidor
        FROM VIDA_PEDIDOS p
        LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv
          ON pv.idBranch = p.idBranch AND pv.idCuenta = p.idCuenta AND pv.idPuntoVenta = p.idPuntoVenta
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
                  FechaMod = GETDATE()
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
                 @Notas, GETDATE(), DATEADD(MINUTE, @Minutos, GETDATE()), @UsuAlta)`);

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
    const totalUSD = venta.items.reduce((s, i) => s + (parseFloat(i.Cantidad) * parseFloat(i.PrecioUnitario)), 0);
    const fechaVenta = fechaVentaValida(venta.FechaVenta);

    await new sql.Request(transaction)
      .input('idBranch',      sql.BigInt,       idBranch)
      .input('idCuenta',      sql.BigInt,       idCuenta)
      .input('idPedido',      sql.BigInt,       idPedido)
      .input('idPuntoVenta',  sql.BigInt,       venta.idPuntoVenta)
      .input('ClienteUUID',   sql.VarChar(40),  venta.ClienteUUID)
      .input('MetodoPago',    sql.VarChar(20),  venta.MetodoPago || null)
      .input('TotalUSD',      sql.Decimal(18,4), totalUSD)
      .input('MontoEfectivo', sql.Decimal(18,4), venta.MontoEfectivo ?? null)
      .input('MontoTarjeta',  sql.Decimal(18,4), venta.MontoTarjeta  ?? null)
      .input('MontoCambio',   sql.Decimal(18,4), venta.MontoCambio   ?? null)
      .input('Notas',         sql.VarChar(500), venta.Notas || null)
      .input('FechaVenta',    sql.DateTime,     fechaVenta)
      .input('UsuAlta',       sql.VarChar(20),  String(idUsuario))
      .query(`INSERT INTO VIDA_PEDIDOS
                (idBranch, idCuenta, idPedido, idPuntoVenta, Canal, Status,
                 MetodoPago, StatusPago, TotalUSD, MontoEfectivo, MontoTarjeta, MontoCambio,
                 Notas, ClienteUUID, EsOffline, FechaAlta, UsuAlta)
              VALUES
                (@idBranch, @idCuenta, @idPedido, @idPuntoVenta, 'POS', 'ENTREGADO',
                 @MetodoPago, 'PAGADO', @TotalUSD, @MontoEfectivo, @MontoTarjeta, @MontoCambio,
                 @Notas, @ClienteUUID, 1, ISNULL(@FechaVenta, GETDATE()), @UsuAlta)`);

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
                  FechaMod = GETDATE()
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

    await transaction.commit();
    return { idPedido, requiereRevision };
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

  for (const venta of ventas) {
    const uuid = typeof venta?.ClienteUUID === 'string' ? venta.ClienteUUID.slice(0, 40) : null;
    try {
      if (!uuid) {
        failed.push({ ClienteUUID: null, motivo: 'ClienteUUID es requerido' });
        continue;
      }
      if (!venta.idPuntoVenta || !Array.isArray(venta.items) || venta.items.length === 0) {
        failed.push({ ClienteUUID: uuid, motivo: 'idPuntoVenta e items son requeridos' });
        continue;
      }
      const itemInvalido = venta.items.some(it =>
        !it.idProducto || !(parseFloat(it.Cantidad) > 0) || !(parseFloat(it.PrecioUnitario) >= 0));
      if (itemInvalido) {
        failed.push({ ClienteUUID: uuid, motivo: 'Items con cantidad o precio inválido' });
        continue;
      }

      // Idempotencia: si el UUID ya está registrado, se responde como synced
      const dupR = await pool.request()
        .input('uuid', sql.VarChar(40), uuid)
        .query(`SELECT idPedido FROM VIDA_PEDIDOS WHERE ClienteUUID=@uuid`);
      if (dupR.recordset[0]) {
        synced.push({ ClienteUUID: uuid, idPedido: dupR.recordset[0].idPedido, duplicado: true });
        continue;
      }

      const res = await procesarVentaOffline(pool, { venta: { ...venta, ClienteUUID: uuid }, idBranch, idCuenta, idUsuario });
      synced.push({ ClienteUUID: uuid, idPedido: res.idPedido, requiereRevision: res.requiereRevision });

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
          .query(`SELECT idPedido FROM VIDA_PEDIDOS WHERE ClienteUUID=@uuid`);
        if (r.recordset[0]) {
          synced.push({ ClienteUUID: uuid, idPedido: r.recordset[0].idPedido, duplicado: true });
          continue;
        }
      }
      request.log.error(err);
      failed.push({ ClienteUUID: uuid, motivo: err.message });
    }
  }

  return reply.send({ synced, failed });
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
                          Status = @Status, FechaMod = GETDATE() ${setExtra}
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
                    FechaMod = GETDATE()
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
                    FechaMod = GETDATE()
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
        AND FechaExpiracion < GETDATE()
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
                    FechaMod = GETDATE()
                  WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                    AND idPuntoVenta=@idPuntoVenta AND idProducto=@idProducto`);
      }

      // Cancelar pedido
      await pool.request()
        .input('idBranch', sql.BigInt,     pedido.idBranch)
        .input('idCuenta', sql.BigInt,     pedido.idCuenta)
        .input('idPedido', sql.BigInt,     pedido.idPedido)
        .query(`UPDATE VIDA_PEDIDOS SET Status='CANCELADO', FechaMod=GETDATE()
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);

      // Historial
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
      .query(`UPDATE VIDA_PEDIDOS SET idRepartidor=@idRepartidor, FechaMod=GETDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);

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
    const nuevoId = await nextId(pool, 'VIDA_PEDIDOS_COMPROBANTES', 'idComprobante', idBranch, idCuenta);

    await pool.request()
      .input('idBranch',     sql.BigInt,      idBranch)
      .input('idCuenta',     sql.BigInt,      idCuenta)
      .input('idComprobante',sql.BigInt,      nuevoId)
      .input('idPedido',     sql.BigInt,      idPedido)
      .input('ImagenURL',    sql.VarChar(500), ImagenURL)
      .input('Referencia',   sql.VarChar(100), Referencia || null)
      .input('UsuAlta',      sql.VarChar(20),  String(idUsuario))
      .query(`INSERT INTO VIDA_PEDIDOS_COMPROBANTES
                (idBranch, idCuenta, idComprobante, idPedido, ImagenURL, Referencia, UsuAlta)
              VALUES (@idBranch, @idCuenta, @idComprobante, @idPedido, @ImagenURL, @Referencia, @UsuAlta)`);

    return reply.code(201).send({ message: 'Comprobante subido', idComprobante: nuevoId });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al subir comprobante' });
  }
}

export async function revisarComprobante(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idPedido, idComprobante } = request.params;
  const { StatusRevision, Notas } = request.body;

  if (!['APROBADO', 'RECHAZADO'].includes(StatusRevision))
    return reply.code(400).send({ error: 'StatusRevision debe ser APROBADO o RECHAZADO' });

  try {
    const pool = await getPool();

    await pool.request()
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

    // Si se aprueba → marcar pedido como pagado
    if (StatusRevision === 'APROBADO') {
      await pool.request()
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta)
        .input('idPedido', sql.BigInt, idPedido)
        .query(`UPDATE VIDA_PEDIDOS SET StatusPago='PAGADO', FechaMod=GETDATE()
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);
    }

    return reply.send({ message: `Comprobante ${StatusRevision === 'APROBADO' ? 'aprobado' : 'rechazado'}` });
  } catch (err) {
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
  const { idBranch, idCuenta } = request.user;
  const { fecha, idPuntoVenta } = request.query;

  // Por defecto: hoy
  const fechaFiltro = fecha || new Date().toISOString().slice(0, 10);

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

    // Pedidos POS entregados (ventas completadas)
    const pedidosR = await req.query(`
      SELECT p.idPedido, p.FechaAlta, p.MetodoPago, p.StatusPago,
             p.TotalUSD, p.MontoEfectivo, p.MontoTarjeta, p.MontoCambio,
             p.Status, pv.NomComercial AS NombreSucursal
      FROM VIDA_PEDIDOS p
      LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch = p.idBranch AND pv.idCuenta = p.idCuenta
       AND pv.idPuntoVenta = p.idPuntoVenta
      WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
        AND p.Canal = 'POS'
        AND p.Status = 'ENTREGADO'
        AND p.FechaAlta BETWEEN @fechaInicio AND @fechaFin
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
