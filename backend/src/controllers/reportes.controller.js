import {construirReporteVentas} from '../services/reporteMonedas.service.js';
import {construirReporteCaja} from '../services/reporteCaja.service.js';
import {construirConciliacionPagoMovil} from '../services/conciliacionPagoMovil.service.js';
// src/controllers/reportes.controller.js
import { getPool, sql } from '../db/sqlserver.js';
import { alcanceGeo, ROLES_TIENDA } from '../services/alcance.service.js';

// Se reexporta para los tests y para quien ya lo importaba desde aquí.
export { alcanceGeo };

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: alcance del rol + filtros opcionales de geografía del selector, que
// siempre se aplican DENTRO de ese alcance. Agrega los parámetros a `dbReq`
// (mssql request) y devuelve la condición WHERE.
// ─────────────────────────────────────────────────────────────────────────────
export function buildGeoFilter(user, query, dbReq) {
  const alcance = alcanceGeo(user);
  for (const [nombre, tipo, valor] of alcance.params) dbReq.input(nombre, tipo, valor);

  // Los roles de tienda ya quedan fijados a su tienda: no aplican filtros.
  if (ROLES_TIENDA.includes(user?.TipoUsuario)) return alcance.sql;

  const { filtroPais, filtroEstado, filtroIdPuntoVenta } = query || {};
  if (filtroIdPuntoVenta) {
    dbReq.input('geoPV', sql.BigInt, filtroIdPuntoVenta);
    return `${alcance.sql} AND pv.idPuntoVenta = @geoPV`;
  }
  if (filtroEstado) {
    dbReq.input('geoEstado', sql.VarChar(100), filtroEstado);
    return `${alcance.sql} AND pv.Estado = @geoEstado`;
  }
  if (filtroPais) {
    dbReq.input('geoPais', sql.VarChar(100), filtroPais);
    return `${alcance.sql} AND pv.Pais = @geoPais`;
  }
  return alcance.sql;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reportes/filtros  — opciones disponibles para los selectores del UI
// ─────────────────────────────────────────────────────────────────────────────
export async function obtenerFiltros(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();
    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta);

    // El selector solo ofrece las tiendas dentro del alcance del rol.
    const alcance = alcanceGeo(request.user, '');
    for (const [nombre, tipo, valor] of alcance.params) req.input(nombre, tipo, valor);
    const whereExtra = alcance.sql;

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
  const fechaValida=f=>/^\d{4}-\d{2}-\d{2}$/.test(f)&&Number.isFinite(Date.parse(f))&&new Date(f).toISOString().slice(0,10)===f;
  if(!fechaValida(fechaInicio)||!fechaValida(fechaFin)||fechaInicio>fechaFin)
    return reply.code(400).send({error:'Selecciona un rango de fechas válido'});

  try {
    const pool = await getPool();
    const req  = pool.request()
      .input('idBranch',    sql.BigInt,     idBranch)
      .input('idCuenta',    sql.BigInt,     idCuenta)
      .input('fechaInicio', sql.Date, new Date(fechaInicio))
      .input('fechaFin',    sql.Date, new Date(fechaFin));

    const geoFilter = buildGeoFilter(request.user, request.query, req);

    const datos=await req.query(`
      SELECT TOP (50001) p.idPedido,p.FechaAlta,p.TotalUSD,p.MontoEfectivo,p.MontoTarjeta,p.MontoCambio,p.PagoMonedaJSON,
        pv.idPuntoVenta,pv.NomComercial AS NombrePuntoVenta,pv.Pais,pv.Estado,pv.Ciudad
      FROM VIDA_PEDIDOS p JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch=p.idBranch AND pv.idCuenta=p.idCuenta AND pv.idPuntoVenta=p.idPuntoVenta
      WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta AND p.Canal='POS' AND p.Status='ENTREGADO'
        AND p.FechaAlta>=DATEADD(HOUR,4,CAST(@fechaInicio AS DATETIME)) AND p.FechaAlta<DATEADD(HOUR,4,DATEADD(day,1,CAST(@fechaFin AS DATETIME)))
        ${geoFilter}
      ORDER BY p.FechaAlta,p.idPedido
    `);
    if(datos.recordset.length>50000) return reply.code(422).send({error:'El reporte supera 50,000 ventas. Reduce el rango o filtra una tienda.'});
    return reply.send(construirReporteVentas(datos.recordset));
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error en reporte de ventas: ' + err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reportes/caja  — arqueos de caja por moneda (turnos CERRADOS)
// Query: fechaInicio, fechaFin, filtroPais?, filtroEstado?, filtroIdPuntoVenta?
// El rango filtra por fecha de CIERRE del turno.
// ─────────────────────────────────────────────────────────────────────────────
export async function reporteCaja(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { fechaInicio, fechaFin } = request.query;

  if (!fechaInicio || !fechaFin)
    return reply.code(400).send({ error: 'fechaInicio y fechaFin son requeridos' });
  const fechaValida=f=>/^\d{4}-\d{2}-\d{2}$/.test(f)&&Number.isFinite(Date.parse(f))&&new Date(f).toISOString().slice(0,10)===f;
  if(!fechaValida(fechaInicio)||!fechaValida(fechaFin)||fechaInicio>fechaFin)
    return reply.code(400).send({error:'Selecciona un rango de fechas válido'});

  try {
    const pool = await getPool();
    const req  = pool.request()
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('fechaInicio', sql.Date,   new Date(fechaInicio))
      .input('fechaFin',    sql.Date,   new Date(fechaFin));

    const geoFilter = buildGeoFilter(request.user, request.query, req);
    const joinPV = `JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch=t.idBranch AND pv.idCuenta=t.idCuenta AND pv.idPuntoVenta=t.idPuntoVenta`;
    const enRango = `t.Status='CERRADO' AND t.FechaCierre>=DATEADD(HOUR,4,CAST(@fechaInicio AS DATETIME)) AND t.FechaCierre<DATEADD(HOUR,4,DATEADD(day,1,CAST(@fechaFin AS DATETIME)))`;

    const r = await req.query(`
      SELECT TOP (20001) t.idTurno,t.idPuntoVenta,pv.NomComercial AS NombrePuntoVenta,pv.Pais,pv.Estado,pv.Ciudad,
        t.NombreUsuario,t.FechaApertura,t.FechaCierre,t.TotalVentas,t.NumTransacciones,t.Diferencia,t.ArqueoMonedasJSON
      FROM VIDA_CAJA_TURNOS t ${joinPV}
      WHERE t.idBranch=@idBranch AND t.idCuenta=@idCuenta AND ${enRango} ${geoFilter}
      ORDER BY t.FechaCierre,t.idTurno;

      SELECT m.idTurno,m.Tipo,m.Moneda,m.Monto,m.Status
      FROM VIDA_CAJA_MOVIMIENTOS m
      JOIN VIDA_CAJA_TURNOS t ON t.idBranch=m.idBranch AND t.idCuenta=m.idCuenta AND t.idTurno=m.idTurno
      ${joinPV}
      WHERE m.idBranch=@idBranch AND m.idCuenta=@idCuenta AND m.Status='ACTIVO' AND ${enRango} ${geoFilter};

      SELECT COUNT(*) AS Abiertos
      FROM VIDA_CAJA_TURNOS t ${joinPV}
      WHERE t.idBranch=@idBranch AND t.idCuenta=@idCuenta AND t.Status='ABIERTO' ${geoFilter};
    `);
    if (r.recordsets[0].length > 20000)
      return reply.code(422).send({ error: 'El reporte supera 20,000 turnos. Reduce el rango o filtra una tienda.' });

    const reporte = construirReporteCaja(r.recordsets[0], r.recordsets[1]);
    return reply.send({ ...reporte, turnosAbiertos: r.recordsets[2][0]?.Abiertos ?? 0 });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error en reporte de caja: ' + err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reportes/pago-movil  — conciliación de pagos Pago Móvil
// Query: fechaInicio, fechaFin, filtroPais?, filtroEstado?, filtroIdPuntoVenta?
// El rango filtra por fecha de alta del pedido.
// ─────────────────────────────────────────────────────────────────────────────
export async function reportePagoMovil(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { fechaInicio, fechaFin } = request.query;

  if (!fechaInicio || !fechaFin)
    return reply.code(400).send({ error: 'fechaInicio y fechaFin son requeridos' });
  const fechaValida=f=>/^\d{4}-\d{2}-\d{2}$/.test(f)&&Number.isFinite(Date.parse(f))&&new Date(f).toISOString().slice(0,10)===f;
  if(!fechaValida(fechaInicio)||!fechaValida(fechaFin)||fechaInicio>fechaFin)
    return reply.code(400).send({error:'Selecciona un rango de fechas válido'});

  try {
    const pool = await getPool();
    const req  = pool.request()
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('fechaInicio', sql.Date,   new Date(fechaInicio))
      .input('fechaFin',    sql.Date,   new Date(fechaFin));
    const geoFilter = buildGeoFilter(request.user, request.query, req);
    const base = `FROM VIDA_PEDIDOS p
      JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch=p.idBranch AND pv.idCuenta=p.idCuenta AND pv.idPuntoVenta=p.idPuntoVenta
      WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta AND p.MetodoPago='PAGO_MOVIL'
        AND p.FechaAlta>=DATEADD(HOUR,4,CAST(@fechaInicio AS DATETIME)) AND p.FechaAlta<DATEADD(HOUR,4,DATEADD(day,1,CAST(@fechaFin AS DATETIME))) ${geoFilter}`;

    const r = await req.query(`
      SELECT TOP (20001) p.idPedido,p.FechaAlta,p.Status,p.StatusPago,p.TotalUSD,p.PagoMonedaJSON,
        pv.idPuntoVenta,pv.NomComercial AS NombrePuntoVenta,
        cl.Nombre AS ClienteNombre,cl.Apellidos AS ClienteApellidos,cl.Telefono AS ClienteTelefono
      ${base.replace('WHERE', `LEFT JOIN VIDA_APP_CLIENTES cl
        ON cl.idBranch=p.idBranch AND cl.idCuenta=p.idCuenta AND cl.idCliente=p.idCliente
      WHERE`)}
      ORDER BY p.FechaAlta DESC,p.idPedido DESC;

      SELECT c.idPedido,c.idComprobante,c.Referencia,c.ImagenURL,c.StatusRevision,c.Notas,c.FechaAlta,c.UsuRevision
      FROM VIDA_PEDIDOS_COMPROBANTES c
      JOIN VIDA_PEDIDOS p0 ON p0.idBranch=c.idBranch AND p0.idCuenta=c.idCuenta AND p0.idPedido=c.idPedido
      WHERE c.idBranch=@idBranch AND c.idCuenta=@idCuenta
        AND c.idPedido IN (SELECT p.idPedido ${base});
    `);
    if (r.recordsets[0].length > 20000)
      return reply.code(422).send({ error: 'El reporte supera 20,000 pedidos. Reduce el rango o filtra una tienda.' });
    return reply.send(construirConciliacionPagoMovil(r.recordsets[0], r.recordsets[1]));
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error en conciliación de Pago Móvil: ' + err.message });
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
        AND CAST(DATEADD(HOUR,-4,p.FechaAlta) AS DATE) BETWEEN @fechaInicio AND @fechaFin
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
        AND CAST(DATEADD(HOUR,-4,m.FechaAlta) AS DATE) BETWEEN @fechaInicio AND @fechaFin
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
        CAST(DATEADD(HOUR,-4,p.FechaAlta) AS DATE)  AS Fecha,
        COUNT(p.idPedido)          AS NumPedidos,
        SUM(p.TotalUSD)            AS TotalUSD
      FROM VIDA_PEDIDOS p
      JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch = p.idBranch AND pv.idCuenta = p.idCuenta
       AND pv.idPuntoVenta = p.idPuntoVenta
      WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
        AND p.Canal  = 'APP'
        AND p.Status = 'ENTREGADO'
        AND CAST(DATEADD(HOUR,-4,p.FechaAlta) AS DATE) BETWEEN @fechaInicio AND @fechaFin
        ${geoDia}
      GROUP BY CAST(DATEADD(HOUR,-4,p.FechaAlta) AS DATE)
      ORDER BY CAST(DATEADD(HOUR,-4,p.FechaAlta) AS DATE)
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
        AND CAST(DATEADD(HOUR,-4,p.FechaAlta) AS DATE) BETWEEN @fechaInicio AND @fechaFin
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
        AND CAST(DATEADD(HOUR,-4,p.FechaAlta) AS DATE) BETWEEN @fechaInicio AND @fechaFin
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
        AND CAST(DATEADD(HOUR,-4,p.FechaAlta) AS DATE) BETWEEN @fechaInicio AND @fechaFin
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
       AND CAST(DATEADD(HOUR,-4,p.FechaAlta) AS DATE) BETWEEN @fechaInicio AND @fechaFin
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
      SELECT CAST(DATEADD(HOUR,-4,p.FechaAlta) AS DATE) AS Fecha,
             SUM(CASE WHEN p.Canal='POS' THEN p.TotalUSD ELSE 0 END) AS TotalPOS,
             SUM(CASE WHEN p.Canal='APP' THEN p.TotalUSD ELSE 0 END) AS TotalDelivery,
             SUM(p.TotalUSD) AS TotalUSD
      FROM VIDA_PEDIDOS p
      JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch=p.idBranch AND pv.idCuenta=p.idCuenta AND pv.idPuntoVenta=p.idPuntoVenta
      WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
        AND p.Status='ENTREGADO' AND p.Canal IN ('POS','APP')
        AND CAST(DATEADD(HOUR,-4,p.FechaAlta) AS DATE) BETWEEN @fechaInicio AND @fechaFin
        ${geoDia}
      GROUP BY CAST(DATEADD(HOUR,-4,p.FechaAlta) AS DATE)
      ORDER BY CAST(DATEADD(HOUR,-4,p.FechaAlta) AS DATE)
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
