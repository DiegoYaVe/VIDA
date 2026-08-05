// src/controllers/reportes.controller.js
import { getPool, sql } from '../db/sqlserver.js';

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: construye el filtro de acceso + los filtros opcionales de geografía
// Modifica el objeto `req` (mssql request) in-place y devuelve la cadena WHERE
// ─────────────────────────────────────────────────────────────────────────────
function buildGeoFilter(user, query, dbReq) {
  const { TipoUsuario, idPuntoVenta } = user;
  const { filtroPais, filtroEstado, filtroIdPuntoVenta } = query;

  // Roles de solo-su-sucursal
  if (['SUPERVISOR', 'CAJERO', 'CASHIER'].includes(TipoUsuario)) {
    dbReq.input('geoForzado', sql.BigInt, idPuntoVenta);
    return ' AND pv.idPuntoVenta = @geoForzado';
  }

  // ADMIN: puede filtrar por estado o sucursal (no por país)
  if (TipoUsuario === 'ADMIN') {
    if (filtroIdPuntoVenta) {
      dbReq.input('geoPV', sql.BigInt, filtroIdPuntoVenta);
      return ' AND pv.idPuntoVenta = @geoPV';
    }
    if (filtroEstado) {
      dbReq.input('geoEstado', sql.VarChar(100), filtroEstado);
      return ' AND pv.Estado = @geoEstado';
    }
    return '';
  }

  // SUPER_ADMIN / ADMIN_PAIS: acceso completo con filtros opcionales
  if (filtroIdPuntoVenta) {
    dbReq.input('geoPV', sql.BigInt, filtroIdPuntoVenta);
    return ' AND pv.idPuntoVenta = @geoPV';
  }
  if (filtroEstado) {
    dbReq.input('geoEstado', sql.VarChar(100), filtroEstado);
    return ' AND pv.Estado = @geoEstado';
  }
  if (filtroPais) {
    dbReq.input('geoPais', sql.VarChar(100), filtroPais);
    return ' AND pv.Pais = @geoPais';
  }
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reportes/filtros  — opciones disponibles para los selectores del UI
// ─────────────────────────────────────────────────────────────────────────────
export async function obtenerFiltros(request, reply) {
  const { idBranch, idCuenta, TipoUsuario, idPuntoVenta } = request.user;
  try {
    const pool = await getPool();
    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta);

    let whereExtra = '';
    if (['SUPERVISOR', 'CAJERO', 'CASHIER'].includes(TipoUsuario)) {
      req.input('pvFilt', sql.BigInt, idPuntoVenta);
      whereExtra = ' AND idPuntoVenta = @pvFilt';
    }

    const r = await req.query(`
      SELECT idPuntoVenta, NomComercial AS NombrePuntoVenta, Ciudad, Estado, Pais, Status
      FROM VIDA_CUENTA_PUNTOS_VENTA
      WHERE idBranch = @idBranch AND idCuenta = @idCuenta AND Status = 'ACTIVO'
      ${whereExtra}
      ORDER BY Pais, Estado, NomComercial
    `);

    const sucursales = r.recordset;
    const paises  = [...new Set(sucursales.map(s => s.Pais).filter(Boolean))].sort();
    const estados = [...new Set(sucursales.map(s => s.Estado).filter(Boolean))].sort();

    return reply.send({ sucursales, paises, estados });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener filtros' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reportes/ventas
// Query: fechaInicio, fechaFin, filtroPais?, filtroEstado?, filtroIdPuntoVenta?
// ─────────────────────────────────────────────────────────────────────────────
export async function reporteVentas(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { fechaInicio, fechaFin } = request.query;

  if (!fechaInicio || !fechaFin)
    return reply.code(400).send({ error: 'fechaInicio y fechaFin son requeridos' });

  try {
    const pool = await getPool();
    const req  = pool.request()
      .input('idBranch',    sql.BigInt,     idBranch)
      .input('idCuenta',    sql.BigInt,     idCuenta)
      .input('fechaInicio', sql.Date, new Date(fechaInicio))
      .input('fechaFin',    sql.Date, new Date(fechaFin));

    const geoFilter = buildGeoFilter(request.user, request.query, req);

    // Filas agrupadas por sucursal
    const filas = await req.query(`
      SELECT
        pv.idPuntoVenta,
        pv.NomComercial AS NombrePuntoVenta,
        pv.Ciudad,
        pv.Estado,
        pv.Pais,
        COUNT(p.idPedido)              AS NumVentas,
        SUM(p.TotalUSD)                AS TotalUSD,
        SUM(ISNULL(p.MontoEfectivo,0)) AS TotalEfectivo,
        SUM(ISNULL(p.MontoTarjeta,0))  AS TotalTarjeta,
        SUM(ISNULL(p.MontoCambio,0))   AS TotalCambio
      FROM VIDA_PEDIDOS p
      JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch = p.idBranch AND pv.idCuenta = p.idCuenta
       AND pv.idPuntoVenta = p.idPuntoVenta
      WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
        AND p.Canal   = 'POS'
        AND p.Status  = 'ENTREGADO'
        AND CAST(p.FechaAlta AS DATE) BETWEEN @fechaInicio AND @fechaFin
        ${geoFilter}
      GROUP BY pv.idPuntoVenta, pv.NomComercial, pv.Ciudad, pv.Estado, pv.Pais
      ORDER BY pv.Pais, pv.Estado, pv.NomComercial
    `);

    // Gráfica: ventas agrupadas por día
    const req2 = pool.request()
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('fechaInicio', sql.Date,   new Date(fechaInicio))
      .input('fechaFin',    sql.Date,   new Date(fechaFin));
    const geoFilter2 = buildGeoFilter(request.user, request.query, req2);

    const grafica = await req2.query(`
      SELECT
        CAST(p.FechaAlta AS DATE)  AS Fecha,
        COUNT(p.idPedido)              AS NumVentas,
        SUM(p.TotalUSD)                AS TotalUSD
      FROM VIDA_PEDIDOS p
      JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch = p.idBranch AND pv.idCuenta = p.idCuenta
       AND pv.idPuntoVenta = p.idPuntoVenta
      WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
        AND p.Canal  = 'POS'
        AND p.Status = 'ENTREGADO'
        AND CAST(p.FechaAlta AS DATE) BETWEEN @fechaInicio AND @fechaFin
        ${geoFilter2}
      GROUP BY CAST(p.FechaAlta AS DATE)
      ORDER BY CAST(p.FechaAlta AS DATE)
    `);

    const rows = filas.recordset;
    const totales = {
      NumVentas:     rows.reduce((s, r) => s + r.NumVentas, 0),
      TotalUSD:      rows.reduce((s, r) => s + (r.TotalUSD      || 0), 0),
      TotalEfectivo: rows.reduce((s, r) => s + (r.TotalEfectivo || 0), 0),
      TotalTarjeta:  rows.reduce((s, r) => s + (r.TotalTarjeta  || 0), 0),
      TotalCambio:   rows.reduce((s, r) => s + (r.TotalCambio   || 0), 0),
    };

    return reply.send({
      filas: rows,
      totales,
      graficaDiaria: grafica.recordset,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error en reporte de ventas: ' + err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reportes/productos
// Query: fechaInicio, fechaFin, top?, filtroPais?, filtroEstado?, filtroIdPuntoVenta?
// ─────────────────────────────────────────────────────────────────────────────
export async function reporteProductos(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { fechaInicio, fechaFin, top = 20 } = request.query;

  if (!fechaInicio || !fechaFin)
    return reply.code(400).send({ error: 'fechaInicio y fechaFin son requeridos' });

  try {
    const pool = await getPool();
    const req  = pool.request()
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('fechaInicio', sql.Date,   new Date(fechaInicio))
      .input('fechaFin',    sql.Date,   new Date(fechaFin))
      .input('topN',        sql.Int,    parseInt(top));

    const geoFilter = buildGeoFilter(request.user, request.query, req);

    const r = await req.query(`
      SELECT TOP (@topN)
        d.idProducto,
        ISNULL(prod.Nombre, CAST(d.idProducto AS VARCHAR)) AS NombreProducto,
        ISNULL(cat.Nombre, 'Sin categoría')                AS Categoria,
        SUM(d.Cantidad)                                    AS TotalCantidad,
        SUM(d.Cantidad * d.PrecioUnitario)                 AS TotalRevenue,
        COUNT(DISTINCT p.idPedido)                         AS NumPedidos,
        prod.UnidadMedida,
        prod.PrecioUSD                                     AS PrecioActual
      FROM VIDA_PEDIDOS_DETALLE d
      JOIN VIDA_PEDIDOS p
        ON p.idBranch = d.idBranch AND p.idCuenta = d.idCuenta AND p.idPedido = d.idPedido
      JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch = p.idBranch AND pv.idCuenta = p.idCuenta
       AND pv.idPuntoVenta = p.idPuntoVenta
      LEFT JOIN VIDA_INVENTARIO_PRODUCTOS prod
        ON prod.idBranch = p.idBranch AND prod.idCuenta = p.idCuenta
       AND prod.idProducto = d.idProducto
      LEFT JOIN VIDA_INVENTARIO_CATEGORIAS cat
        ON cat.idBranch = prod.idBranch AND cat.idCuenta = prod.idCuenta
       AND cat.idCategoria = prod.idCategoria
      WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
        AND p.Canal  = 'POS'
        AND p.Status = 'ENTREGADO'
        AND CAST(p.FechaAlta AS DATE) BETWEEN @fechaInicio AND @fechaFin
        ${geoFilter}
      GROUP BY d.idProducto, prod.Nombre, cat.Nombre, prod.UnidadMedida, prod.PrecioUSD
      ORDER BY TotalRevenue DESC
    `);

    const rows = r.recordset;
    const totales = {
      TotalCantidad: rows.reduce((s, r) => s + (r.TotalCantidad || 0), 0),
      TotalRevenue:  rows.reduce((s, r) => s + (r.TotalRevenue  || 0), 0),
      NumProductos:  rows.length,
    };

    return reply.send({ filas: rows, totales });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error en reporte de productos: ' + err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reportes/inventario
// Query: filtroPais?, filtroEstado?, filtroIdPuntoVenta?, soloStockBajo?
// ─────────────────────────────────────────────────────────────────────────────
export async function reporteInventario(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { soloStockBajo = 'false' } = request.query;

  try {
    const pool = await getPool();
    const req  = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta);

    const geoFilter = buildGeoFilter(request.user, request.query, req);

    const stockFiltro = soloStockBajo === 'true'
      ? ' HAVING ISNULL(s.Cantidad, 0) <= p.StockMinimo'
      : '';

    const r = await req.query(`
      SELECT
        pv.idPuntoVenta,
        pv.NomComercial AS NombrePuntoVenta,
        pv.Ciudad,
        pv.Estado,
        pv.Pais,
        p.idProducto,
        p.Nombre                            AS Producto,
        p.SKU,
        ISNULL(cat.Nombre, 'Sin cat.')       AS Categoria,
        p.UnidadMedida,
        ISNULL(s.Cantidad, 0)               AS Stock,
        p.StockMinimo,
        p.PrecioUSD,
        CASE WHEN ISNULL(s.Cantidad,0) <= p.StockMinimo THEN 1 ELSE 0 END AS StockBajo,
        ISNULL(s.Cantidad, 0) * p.PrecioUSD AS ValorStock
      FROM VIDA_INVENTARIO_PRODUCTOS p
      CROSS JOIN VIDA_CUENTA_PUNTOS_VENTA pv
      LEFT JOIN VIDA_INVENTARIO_STOCK s
        ON s.idBranch = pv.idBranch AND s.idCuenta = pv.idCuenta
       AND s.idProducto = p.idProducto AND s.idPuntoVenta = pv.idPuntoVenta
      LEFT JOIN VIDA_INVENTARIO_CATEGORIAS cat
        ON cat.idBranch = p.idBranch AND cat.idCuenta = p.idCuenta
       AND cat.idCategoria = p.idCategoria
      WHERE p.idBranch  = @idBranch AND p.idCuenta  = @idCuenta
        AND pv.idBranch = @idBranch AND pv.idCuenta = @idCuenta
        AND p.Status    = 'ACTIVO'
        AND pv.Status   = 'ACTIVO'
        ${geoFilter}
      ${stockFiltro}
      ORDER BY pv.Pais, pv.Estado, pv.NomComercial, p.Nombre
    `);

    const rows = r.recordset;
    const resumen = {
      TotalProductos:  rows.length,
      TotalBajoStock:  rows.filter(r => r.StockBajo).length,
      ValorTotalStock: rows.reduce((s, r) => s + (r.ValorStock || 0), 0),
    };

    return reply.send({ filas: rows, resumen });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error en reporte de inventario: ' + err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reportes/movimientos
// Query: fechaInicio, fechaFin, tipo?, filtroPais?, filtroEstado?, filtroIdPuntoVenta?
// ─────────────────────────────────────────────────────────────────────────────
export async function reporteMovimientos(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { fechaInicio, fechaFin, tipo } = request.query;

  if (!fechaInicio || !fechaFin)
    return reply.code(400).send({ error: 'fechaInicio y fechaFin son requeridos' });

  try {
    const pool = await getPool();
    const req  = pool.request()
      .input('idBranch',    sql.BigInt,    idBranch)
      .input('idCuenta',    sql.BigInt,    idCuenta)
      .input('fechaInicio', sql.Date,      new Date(fechaInicio))
      .input('fechaFin',    sql.Date,      new Date(fechaFin));

    let tipoFilter = '';
    if (tipo && ['ENTRADA', 'SALIDA', 'AJUSTE'].includes(tipo)) {
      req.input('tipoMov', sql.VarChar(20), tipo);
      tipoFilter = ' AND m.TipoMovimiento = @tipoMov';
    }

    const geoFilter = buildGeoFilter(request.user, request.query, req);

    const r = await req.query(`
      SELECT
        m.idMovimiento,
        m.FechaAlta,
        pv.NomComercial AS NombrePuntoVenta,
        pv.Ciudad,
        pv.Estado,
        pv.Pais,
        p.Nombre        AS Producto,
        p.SKU,
        ISNULL(cat.Nombre, 'Sin cat.') AS Categoria,
        p.UnidadMedida,
        m.TipoMovimiento,
        m.Cantidad,
        m.CantidadAntes,
        m.CantidadDespues,
        m.Motivo,
        m.Referencia,
        m.UsuAlta
      FROM VIDA_INVENTARIO_MOVIMIENTOS m
      JOIN VIDA_INVENTARIO_PRODUCTOS p
        ON p.idBranch = m.idBranch AND p.idCuenta = m.idCuenta
       AND p.idProducto = m.idProducto
      JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch = m.idBranch AND pv.idCuenta = m.idCuenta
       AND pv.idPuntoVenta = m.idPuntoVenta
      LEFT JOIN VIDA_INVENTARIO_CATEGORIAS cat
        ON cat.idBranch = p.idBranch AND cat.idCuenta = p.idCuenta
       AND cat.idCategoria = p.idCategoria
      WHERE m.idBranch = @idBranch AND m.idCuenta = @idCuenta
        AND CAST(m.FechaAlta AS DATE) BETWEEN @fechaInicio AND @fechaFin
        ${tipoFilter}
        ${geoFilter}
      ORDER BY m.FechaAlta DESC
    `);

    const rows = r.recordset;
    const resumen = {
      TotalEntradas: rows.filter(r => r.TipoMovimiento === 'ENTRADA').length,
      TotalSalidas:  rows.filter(r => r.TipoMovimiento === 'SALIDA').length,
      TotalAjustes:  rows.filter(r => r.TipoMovimiento === 'AJUSTE').length,
      CantEntradas:  rows.filter(r => r.TipoMovimiento === 'ENTRADA').reduce((s, r) => s + (r.Cantidad || 0), 0),
      CantSalidas:   rows.filter(r => r.TipoMovimiento === 'SALIDA').reduce((s, r) => s + (r.Cantidad || 0), 0),
    };

    return reply.send({ filas: rows, resumen });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error en reporte de movimientos: ' + err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reportes/delivery
// Reporte del canal APP (delivery): ventas por día, desempeño y comisiones
// por repartidor, y desglose por método de pago.
// Query: fechaInicio, fechaFin, filtroPais?, filtroEstado?, filtroIdPuntoVenta?
// ─────────────────────────────────────────────────────────────────────────────
export async function reporteDelivery(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { fechaInicio, fechaFin } = request.query;

  if (!fechaInicio || !fechaFin)
    return reply.code(400).send({ error: 'fechaInicio y fechaFin son requeridos' });

  try {
    const pool = await getPool();

    // Filtro base común a todas las consultas del reporte
    const mkReq = () => {
      const r = pool.request()
        .input('idBranch',    sql.BigInt, idBranch)
        .input('idCuenta',    sql.BigInt, idCuenta)
        .input('fechaInicio', sql.Date,   new Date(fechaInicio))
        .input('fechaFin',    sql.Date,   new Date(fechaFin));
      const geo = buildGeoFilter(request.user, request.query, r);
      return { r, geo };
    };

    // ── Ventas del canal APP por día ──────────────────────────────────────
    const { r: reqDia, geo: geoDia } = mkReq();
    const grafica = await reqDia.query(`
      SELECT
        CAST(p.FechaAlta AS DATE)  AS Fecha,
        COUNT(p.idPedido)          AS NumPedidos,
        SUM(p.TotalUSD)            AS TotalUSD
      FROM VIDA_PEDIDOS p
      JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch = p.idBranch AND pv.idCuenta = p.idCuenta
       AND pv.idPuntoVenta = p.idPuntoVenta
      WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
        AND p.Canal  = 'APP'
        AND p.Status = 'ENTREGADO'
        AND CAST(p.FechaAlta AS DATE) BETWEEN @fechaInicio AND @fechaFin
        ${geoDia}
      GROUP BY CAST(p.FechaAlta AS DATE)
      ORDER BY CAST(p.FechaAlta AS DATE)
    `);

    // ── Desempeño por repartidor ──────────────────────────────────────────
    const { r: reqRep, geo: geoRep } = mkReq();
    const porRepartidor = await reqRep.query(`
      SELECT
        rep.idRepartidor,
        rep.Nombre,
        rep.Vehiculo,
        rep.Calificacion,
        COUNT(p.idPedido)                        AS Entregas,
        SUM(p.TotalUSD)                          AS MontoGenerado,
        SUM(ISNULL(p.ComisionRepartidor,0))      AS Comisiones,
        SUM(ISNULL(p.MontoEfectivoRepartidor,0)) AS EfectivoRecaudado
      FROM VIDA_PEDIDOS p
      JOIN VIDA_REPARTIDORES rep
        ON rep.idBranch = p.idBranch AND rep.idCuenta = p.idCuenta
       AND rep.idRepartidor = p.idRepartidor
      JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch = p.idBranch AND pv.idCuenta = p.idCuenta
       AND pv.idPuntoVenta = p.idPuntoVenta
      WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
        AND p.Canal  = 'APP'
        AND p.Status = 'ENTREGADO'
        AND CAST(p.FechaAlta AS DATE) BETWEEN @fechaInicio AND @fechaFin
        ${geoRep}
      GROUP BY rep.idRepartidor, rep.Nombre, rep.Vehiculo, rep.Calificacion
      ORDER BY SUM(p.TotalUSD) DESC
    `);

    // ── Desglose por método de pago ───────────────────────────────────────
    const { r: reqMet, geo: geoMet } = mkReq();
    const porMetodo = await reqMet.query(`
      SELECT
        ISNULL(p.MetodoPago, 'OTRO') AS MetodoPago,
        COUNT(p.idPedido)            AS NumPedidos,
        SUM(p.TotalUSD)              AS TotalUSD
      FROM VIDA_PEDIDOS p
      JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch = p.idBranch AND pv.idCuenta = p.idCuenta
       AND pv.idPuntoVenta = p.idPuntoVenta
      WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
        AND p.Canal  = 'APP'
        AND p.Status = 'ENTREGADO'
        AND CAST(p.FechaAlta AS DATE) BETWEEN @fechaInicio AND @fechaFin
        ${geoMet}
      GROUP BY p.MetodoPago
      ORDER BY SUM(p.TotalUSD) DESC
    `);

    // ── Pedidos cancelados (sin repartidor u otros) en el período ─────────
    const { r: reqCanc, geo: geoCanc } = mkReq();
    const cancelados = await reqCanc.query(`
      SELECT COUNT(p.idPedido) AS Cancelados
      FROM VIDA_PEDIDOS p
      JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch = p.idBranch AND pv.idCuenta = p.idCuenta
       AND pv.idPuntoVenta = p.idPuntoVenta
      WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
        AND p.Canal  = 'APP'
        AND p.Status = 'CANCELADO'
        AND CAST(p.FechaAlta AS DATE) BETWEEN @fechaInicio AND @fechaFin
        ${geoCanc}
    `);

    const reps = porRepartidor.recordset;
    const totales = {
      NumEntregas:      reps.reduce((s, r) => s + (r.Entregas || 0), 0),
      MontoGenerado:    reps.reduce((s, r) => s + (r.MontoGenerado || 0), 0),
      Comisiones:       reps.reduce((s, r) => s + (r.Comisiones || 0), 0),
      EfectivoRecaudado: reps.reduce((s, r) => s + (r.EfectivoRecaudado || 0), 0),
      Cancelados:       cancelados.recordset[0]?.Cancelados || 0,
    };
    totales.TicketPromedio = totales.NumEntregas ? totales.MontoGenerado / totales.NumEntregas : 0;

    return reply.send({
      graficaDiaria: grafica.recordset,
      porRepartidor: reps,
      porMetodo:     porMetodo.recordset,
      totales,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error en reporte de delivery: ' + err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reportes/red — Reporte ejecutivo de RED (T-0053)
// Visión corporativa: consolida TODOS los canales (POS + delivery) y rankea
// las tiendas. Query: fechaInicio, fechaFin, filtroPais?, filtroEstado?
// ─────────────────────────────────────────────────────────────────────────────
export async function reporteRed(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { fechaInicio, fechaFin } = request.query;

  if (!fechaInicio || !fechaFin)
    return reply.code(400).send({ error: 'fechaInicio y fechaFin son requeridos' });

  try {
    const pool = await getPool();

    // Ranking de tiendas: POS + delivery consolidados por punto de venta
    const reqTiendas = pool.request()
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('fechaInicio', sql.Date,   new Date(fechaInicio))
      .input('fechaFin',    sql.Date,   new Date(fechaFin));
    const geoTiendas = buildGeoFilter(request.user, request.query, reqTiendas);

    const tiendas = await reqTiendas.query(`
      SELECT
        pv.idPuntoVenta, pv.NomComercial AS NombrePuntoVenta, pv.Ciudad, pv.Estado, pv.Pais,
        ISNULL(pv.EstadoOnboarding,'ACTIVA') AS EstadoOnboarding,
        SUM(CASE WHEN p.Canal='POS' THEN 1 ELSE 0 END)              AS VentasPOS,
        SUM(CASE WHEN p.Canal='APP' THEN 1 ELSE 0 END)              AS VentasDelivery,
        COUNT(p.idPedido)                                           AS NumTransacciones,
        SUM(CASE WHEN p.Canal='POS' THEN p.TotalUSD ELSE 0 END)     AS TotalPOS,
        SUM(CASE WHEN p.Canal='APP' THEN p.TotalUSD ELSE 0 END)     AS TotalDelivery,
        SUM(p.TotalUSD)                                             AS TotalUSD
      FROM VIDA_CUENTA_PUNTOS_VENTA pv
      LEFT JOIN VIDA_PEDIDOS p
        ON p.idBranch=pv.idBranch AND p.idCuenta=pv.idCuenta AND p.idPuntoVenta=pv.idPuntoVenta
       AND p.Status='ENTREGADO' AND p.Canal IN ('POS','APP')
       AND CAST(p.FechaAlta AS DATE) BETWEEN @fechaInicio AND @fechaFin
      WHERE pv.idBranch=@idBranch AND pv.idCuenta=@idCuenta AND pv.Status='ACTIVO'
        ${geoTiendas}
      GROUP BY pv.idPuntoVenta, pv.NomComercial, pv.Ciudad, pv.Estado, pv.Pais, pv.EstadoOnboarding
      ORDER BY SUM(p.TotalUSD) DESC
    `);

    // Ventas de la red por día (todos los canales) para la gráfica
    const reqDia = pool.request()
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('fechaInicio', sql.Date,   new Date(fechaInicio))
      .input('fechaFin',    sql.Date,   new Date(fechaFin));
    const geoDia = buildGeoFilter(request.user, request.query, reqDia);
    const grafica = await reqDia.query(`
      SELECT CAST(p.FechaAlta AS DATE) AS Fecha,
             SUM(CASE WHEN p.Canal='POS' THEN p.TotalUSD ELSE 0 END) AS TotalPOS,
             SUM(CASE WHEN p.Canal='APP' THEN p.TotalUSD ELSE 0 END) AS TotalDelivery,
             SUM(p.TotalUSD) AS TotalUSD
      FROM VIDA_PEDIDOS p
      JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch=p.idBranch AND pv.idCuenta=p.idCuenta AND pv.idPuntoVenta=p.idPuntoVenta
      WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
        AND p.Status='ENTREGADO' AND p.Canal IN ('POS','APP')
        AND CAST(p.FechaAlta AS DATE) BETWEEN @fechaInicio AND @fechaFin
        ${geoDia}
      GROUP BY CAST(p.FechaAlta AS DATE)
      ORDER BY CAST(p.FechaAlta AS DATE)
    `);

    const rows = tiendas.recordset;
    const totales = {
      NumTiendas:       rows.filter(r => r.NumTransacciones > 0).length,
      TotalTiendas:     rows.length,
      NumTransacciones: rows.reduce((s, r) => s + (r.NumTransacciones || 0), 0),
      TotalUSD:         rows.reduce((s, r) => s + (r.TotalUSD || 0), 0),
      TotalPOS:         rows.reduce((s, r) => s + (r.TotalPOS || 0), 0),
      TotalDelivery:    rows.reduce((s, r) => s + (r.TotalDelivery || 0), 0),
    };
    totales.TicketPromedio = totales.NumTransacciones ? totales.TotalUSD / totales.NumTransacciones : 0;

    // % de participación de cada tienda en la red
    const filas = rows.map(r => ({
      ...r,
      ParticipacionPct: totales.TotalUSD ? +((r.TotalUSD / totales.TotalUSD) * 100).toFixed(1) : 0,
    }));

    return reply.send({ filas, totales, graficaDiaria: grafica.recordset });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error en reporte de red: ' + err.message });
  }
}
