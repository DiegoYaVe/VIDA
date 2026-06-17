// src/controllers/dashboard.controller.js
import { getPool, sql } from '../db/sqlserver.js';

const HOY   = () => new Date().toISOString().split('T')[0];
const AYER  = () => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().split('T')[0]; };
const HACE7 = () => { const d = new Date(); d.setDate(d.getDate()-6); return d.toISOString().split('T')[0]; };

export async function getStats(request, reply) {
  const { idBranch, idCuenta, TipoUsuario, idPuntoVenta } = request.user;

  const esAdmin  = ['SUPER_ADMIN','ADMIN_PAIS','ADMIN'].includes(TipoUsuario);
  const esCajero = ['SUPERVISOR','CAJERO','CASHIER'].includes(TipoUsuario);

  try {
    const pool = await getPool();

    // ── Filtro de acceso ─────────────────────────────────────────────────────
    // Para cajeros/supervisores filtramos por su punto de venta
    const pvWhere = esCajero ? ' AND p.idPuntoVenta = @pvId' : '';
    const pvWhereM = esCajero ? ' AND s.idPuntoVenta = @pvId' : '';

    const base = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('hoy',       sql.Date,   new Date(HOY()))
      .input('ayer',      sql.Date,   new Date(AYER()))
      .input('hace7',     sql.Date,   new Date(HACE7()));

    if (esCajero) base.input('pvId', sql.BigInt, idPuntoVenta);

    // ── 1. Ventas HOY y AYER ─────────────────────────────────────────────────
    const qVentas = await base.query(`
      SELECT
        SUM(CASE WHEN CAST(p.FechaAlta AS DATE) = @hoy  THEN p.TotalUSD ELSE 0 END) AS VentasHoy,
        COUNT(CASE WHEN CAST(p.FechaAlta AS DATE) = @hoy  THEN 1 END)               AS NumHoy,
        SUM(CASE WHEN CAST(p.FechaAlta AS DATE) = @ayer THEN p.TotalUSD ELSE 0 END) AS VentasAyer,
        COUNT(CASE WHEN CAST(p.FechaAlta AS DATE) = @ayer THEN 1 END)               AS NumAyer,
        SUM(CASE WHEN CAST(p.FechaAlta AS DATE) = @hoy  THEN ISNULL(p.MontoEfectivo,0) ELSE 0 END) AS EfectivoHoy,
        SUM(CASE WHEN CAST(p.FechaAlta AS DATE) = @hoy  THEN ISNULL(p.MontoTarjeta,0)  ELSE 0 END) AS TarjetaHoy
      FROM VIDA_PEDIDOS p
      WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
        AND p.Canal = 'POS' AND p.Status = 'ENTREGADO'
        ${pvWhere}
    `);
    const v = qVentas.recordset[0];

    // ── 2. Gráfica: ventas últimos 7 días ─────────────────────────────────────
    const base2 = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('hace7',     sql.Date,   new Date(HACE7()))
      .input('hoy',       sql.Date,   new Date(HOY()));
    if (esCajero) base2.input('pvId', sql.BigInt, idPuntoVenta);

    const qGrafica = await base2.query(`
      SELECT
        CAST(p.FechaAlta AS DATE)  AS Fecha,
        COUNT(p.idPedido)          AS NumVentas,
        SUM(p.TotalUSD)            AS TotalUSD
      FROM VIDA_PEDIDOS p
      WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
        AND p.Canal = 'POS' AND p.Status = 'ENTREGADO'
        AND CAST(p.FechaAlta AS DATE) BETWEEN @hace7 AND @hoy
        ${pvWhere}
      GROUP BY CAST(p.FechaAlta AS DATE)
      ORDER BY CAST(p.FechaAlta AS DATE)
    `);

    // ── 3. Top 5 productos HOY ────────────────────────────────────────────────
    const base3 = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('hoy',       sql.Date,   new Date(HOY()));
    if (esCajero) base3.input('pvId', sql.BigInt, idPuntoVenta);

    const qTop = await base3.query(`
      SELECT TOP 5
        ISNULL(prod.Nombre, CAST(d.idProducto AS VARCHAR)) AS NombreProducto,
        SUM(d.Cantidad)                                    AS TotalCantidad,
        SUM(d.Cantidad * d.PrecioUnitario)                 AS TotalUSD
      FROM VIDA_PEDIDOS_DETALLE d
      JOIN VIDA_PEDIDOS p
        ON p.idBranch = d.idBranch AND p.idCuenta = d.idCuenta AND p.idPedido = d.idPedido
      LEFT JOIN VIDA_INVENTARIO_PRODUCTOS prod
        ON prod.idBranch = d.idBranch AND prod.idCuenta = d.idCuenta AND prod.idProducto = d.idProducto
      WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
        AND p.Canal = 'POS' AND p.Status = 'ENTREGADO'
        AND CAST(p.FechaAlta AS DATE) = @hoy
        ${pvWhere}
      GROUP BY d.idProducto, prod.Nombre
      ORDER BY TotalUSD DESC
    `);

    // ── 4. Top 5 sucursales HOY (solo admins) ─────────────────────────────────
    let topSucursales = [];
    if (esAdmin) {
      const qSuc = await pool.request()
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta',  sql.BigInt, idCuenta)
        .input('hoy',       sql.Date,   new Date(HOY()))
        .query(`
          SELECT TOP 5
            pv.NomComercial AS Nombre,
            pv.Ciudad,
            pv.Estado,
            COUNT(p.idPedido)   AS NumVentas,
            SUM(p.TotalUSD)     AS TotalUSD
          FROM VIDA_PEDIDOS p
          JOIN VIDA_CUENTA_PUNTOS_VENTA pv
            ON pv.idBranch = p.idBranch AND pv.idCuenta = p.idCuenta
           AND pv.idPuntoVenta = p.idPuntoVenta
          WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
            AND p.Canal = 'POS' AND p.Status = 'ENTREGADO'
            AND CAST(p.FechaAlta AS DATE) = @hoy
          GROUP BY pv.NomComercial, pv.Ciudad, pv.Estado
          ORDER BY TotalUSD DESC
        `);
      topSucursales = qSuc.recordset;
    }

    // ── 5. Stock bajo ─────────────────────────────────────────────────────────
    const base5 = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta);
    if (esCajero) base5.input('pvId', sql.BigInt, idPuntoVenta);

    const qStock = await base5.query(`
      SELECT COUNT(*) AS TotalBajoStock
      FROM VIDA_INVENTARIO_PRODUCTOS p
      JOIN VIDA_INVENTARIO_STOCK s
        ON s.idBranch = p.idBranch AND s.idCuenta = p.idCuenta
       AND s.idProducto = p.idProducto
      WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
        AND p.Status = 'ACTIVO'
        AND s.Cantidad <= p.StockMinimo
        ${pvWhereM}
    `);

    // Stock bajo detalle (top 5)
    const base5b = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta);
    if (esCajero) base5b.input('pvId', sql.BigInt, idPuntoVenta);

    const qStockDet = await base5b.query(`
      SELECT TOP 5
        p.Nombre AS Producto,
        p.StockMinimo,
        s.Cantidad AS Stock,
        pv.NomComercial AS Sucursal
      FROM VIDA_INVENTARIO_PRODUCTOS p
      JOIN VIDA_INVENTARIO_STOCK s
        ON s.idBranch = p.idBranch AND s.idCuenta = p.idCuenta
       AND s.idProducto = p.idProducto
      JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch = s.idBranch AND pv.idCuenta = s.idCuenta
       AND pv.idPuntoVenta = s.idPuntoVenta
      WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
        AND p.Status = 'ACTIVO'
        AND s.Cantidad <= p.StockMinimo
        ${pvWhereM}
      ORDER BY s.Cantidad ASC
    `);

    // ── 6. Pedidos activos ahora ──────────────────────────────────────────────
    const base6 = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta);
    if (esCajero) base6.input('pvId', sql.BigInt, idPuntoVenta);

    const qPedidos = await base6.query(`
      SELECT
        COUNT(*) AS Total,
        SUM(CASE WHEN p.Status = 'NUEVO'      THEN 1 ELSE 0 END) AS Nuevos,
        SUM(CASE WHEN p.Status = 'CONFIRMADO' THEN 1 ELSE 0 END) AS Confirmados,
        SUM(CASE WHEN p.Status = 'EN_CAMINO'  THEN 1 ELSE 0 END) AS EnCamino,
        SUM(CASE WHEN p.Status = 'LISTO'      THEN 1 ELSE 0 END) AS Listos
      FROM VIDA_PEDIDOS p
      WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
        AND p.Status NOT IN ('ENTREGADO','CANCELADO','EXPIRADO')
        ${pvWhere}
    `);

    // ── 7. Últimas ventas (actividad reciente) ────────────────────────────────
    const base7 = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta);
    if (esCajero) base7.input('pvId', sql.BigInt, idPuntoVenta);

    const qRecientes = await base7.query(`
      SELECT TOP 8
        p.idPedido,
        p.TotalUSD,
        p.MetodoPago,
        p.FechaAlta,
        pv.NomComercial AS Sucursal
      FROM VIDA_PEDIDOS p
      JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch = p.idBranch AND pv.idCuenta = p.idCuenta
       AND pv.idPuntoVenta = p.idPuntoVenta
      WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
        AND p.Canal = 'POS' AND p.Status = 'ENTREGADO'
        ${pvWhere}
      ORDER BY p.FechaAlta DESC
    `);

    // ── 8. Totales generales + estado de conexión (solo admins) ──────────────
    let totalesGlobales = null;
    let sucursalesConexion = [];
    if (esAdmin) {
      const qGlobal = await pool.request()
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta',  sql.BigInt, idCuenta)
        .query(`
          SELECT
            (SELECT COUNT(*) FROM VIDA_CUENTA_PUNTOS_VENTA WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO')                               AS TotalSucursales,
            (SELECT COUNT(*) FROM VIDA_CUENTA_PUNTOS_VENTA WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO' AND StatusConexion='ONLINE')    AS SucursalesOnline,
            (SELECT COUNT(*) FROM VIDA_CUENTA_USUARIOS       WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO')                              AS TotalUsuarios,
            (SELECT COUNT(*) FROM VIDA_INVENTARIO_PRODUCTOS  WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO')                              AS TotalProductos
        `);
      totalesGlobales = qGlobal.recordset[0];

      // Lista de sucursales con su estado de conexión
      const qConex = await pool.request()
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta',  sql.BigInt, idCuenta)
        .query(`
          SELECT idPuntoVenta, NomComercial AS Nombre, Ciudad, Estado,
                 StatusConexion, UltimoHeartbeat
          FROM VIDA_CUENTA_PUNTOS_VENTA
          WHERE idBranch = @idBranch AND idCuenta = @idCuenta AND Status = 'ACTIVO'
          ORDER BY StatusConexion DESC, NomComercial
        `);
      sucursalesConexion = qConex.recordset;
    }

    // ── Calcular variación % hoy vs ayer ─────────────────────────────────────
    const varPct = (hoy, ayer) => {
      if (!ayer || ayer === 0) return hoy > 0 ? 100 : 0;
      return Math.round(((hoy - ayer) / ayer) * 100);
    };

    return reply.send({
      rol: TipoUsuario,
      ventas: {
        hoy:          Number(v.VentasHoy   || 0),
        ayer:         Number(v.VentasAyer  || 0),
        numHoy:       v.NumHoy  || 0,
        numAyer:      v.NumAyer || 0,
        variacion:    varPct(v.VentasHoy || 0, v.VentasAyer || 0),
        varNum:       varPct(v.NumHoy    || 0, v.NumAyer    || 0),
        efectivoHoy:  Number(v.EfectivoHoy || 0),
        tarjetaHoy:   Number(v.TarjetaHoy  || 0),
      },
      graficaDiaria:  qGrafica.recordset,
      topProductos:   qTop.recordset,
      topSucursales,
      stockBajo: {
        total:    qStock.recordset[0].TotalBajoStock,
        detalle:  qStockDet.recordset,
      },
      pedidosActivos: qPedidos.recordset[0],
      recientes:      qRecientes.recordset,
      globales:           totalesGlobales,
      sucursalesConexion,
    });

  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener estadísticas del dashboard' });
  }
}
