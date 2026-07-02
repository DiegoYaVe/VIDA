// src/controllers/inventario.controller.js
import path from 'path';
import fs from 'fs';
import { getPool, sql } from '../db/sqlserver.js';
import { registrarAuditoria } from '../services/audit.service.js';

// ── Helpers ────────────────────────────────────────────────────────────────

async function nextId(pool, tabla, campo, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}), 0) + 1 AS nextId
            FROM ${tabla}
            WHERE idBranch = @idBranch AND idCuenta = @idCuenta`);
  return r.recordset[0].nextId;
}

// ══════════════════════════════════════════════════════════════════════════
// CATEGORÍAS
// ══════════════════════════════════════════════════════════════════════════

// GET /api/inventario/categorias
export async function listarCategorias(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT idCategoria, Nombre, Descripcion, Icono, OrdenCategoria, Status, FechaAlta
              FROM VIDA_INVENTARIO_CATEGORIAS
              WHERE idBranch = @idBranch AND idCuenta = @idCuenta AND Status = 'ACTIVO'
              ORDER BY OrdenCategoria, Nombre`);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener categorías' });
  }
}

// POST /api/inventario/categorias
export async function crearCategoria(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { Nombre, Descripcion, Icono, OrdenCategoria } = request.body;

  if (!Nombre) return reply.code(400).send({ error: 'El nombre es requerido' });

  try {
    const pool = await getPool();
    const nuevoId = await nextId(pool, 'VIDA_INVENTARIO_CATEGORIAS', 'idCategoria', idBranch, idCuenta);

    await pool.request()
      .input('idBranch',       sql.BigInt,      idBranch)
      .input('idCuenta',       sql.BigInt,      idCuenta)
      .input('idCategoria',    sql.BigInt,      nuevoId)
      .input('Nombre',         sql.VarChar(100), Nombre)
      .input('Descripcion',    sql.VarChar(300), Descripcion || null)
      .input('Icono',          sql.VarChar(100), Icono || null)
      .input('OrdenCategoria', sql.Int,          OrdenCategoria ?? 0)
      .input('UsuAlta',        sql.VarChar(20),  String(idUsuario))
      .query(`INSERT INTO VIDA_INVENTARIO_CATEGORIAS
                (idBranch, idCuenta, idCategoria, Nombre, Descripcion, Icono, OrdenCategoria, UsuAlta)
              VALUES
                (@idBranch, @idCuenta, @idCategoria, @Nombre, @Descripcion, @Icono, @OrdenCategoria, @UsuAlta)`);

    return reply.code(201).send({ message: 'Categoría creada', idCategoria: nuevoId });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al crear categoría' });
  }
}

// PUT /api/inventario/categorias/:idCategoria
export async function editarCategoria(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idCategoria } = request.params;
  const { Nombre, Descripcion, Icono, OrdenCategoria } = request.body;

  if (!Nombre) return reply.code(400).send({ error: 'El nombre es requerido' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',       sql.BigInt,      idBranch)
      .input('idCuenta',       sql.BigInt,      idCuenta)
      .input('idCategoria',    sql.BigInt,      idCategoria)
      .input('Nombre',         sql.VarChar(100), Nombre)
      .input('Descripcion',    sql.VarChar(300), Descripcion || null)
      .input('Icono',          sql.VarChar(100), Icono || null)
      .input('OrdenCategoria', sql.Int,          OrdenCategoria ?? 0)
      .input('UsuMod',         sql.VarChar(20),  String(idUsuario))
      .query(`UPDATE VIDA_INVENTARIO_CATEGORIAS SET
                Nombre = @Nombre, Descripcion = @Descripcion, Icono = @Icono,
                OrdenCategoria = @OrdenCategoria, FechaMod = GETDATE(), UsuMod = @UsuMod
              WHERE idBranch = @idBranch AND idCuenta = @idCuenta AND idCategoria = @idCategoria`);

    return reply.send({ message: 'Categoría actualizada' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al editar categoría' });
  }
}

// PATCH /api/inventario/categorias/:idCategoria/status
export async function toggleCategoria(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idCategoria } = request.params;
  const { status } = request.body;

  if (!['ACTIVO', 'INACTIVO'].includes(status))
    return reply.code(400).send({ error: 'Status debe ser ACTIVO o INACTIVO' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',    sql.BigInt,     idBranch)
      .input('idCuenta',    sql.BigInt,     idCuenta)
      .input('idCategoria', sql.BigInt,     idCategoria)
      .input('Status',      sql.VarChar(20), status)
      .input('UsuMod',      sql.VarChar(20), String(idUsuario))
      .query(`UPDATE VIDA_INVENTARIO_CATEGORIAS SET
                Status = @Status, FechaMod = GETDATE(), UsuMod = @UsuMod
              WHERE idBranch = @idBranch AND idCuenta = @idCuenta AND idCategoria = @idCategoria`);

    return reply.send({ message: `Categoría ${status === 'ACTIVO' ? 'activada' : 'desactivada'}` });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al cambiar status de categoría' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// PRODUCTOS
// ══════════════════════════════════════════════════════════════════════════

// GET /api/inventario/productos
export async function listarProductos(request, reply) {
  const { idBranch, idCuenta, TipoUsuario, idPuntoVenta: pvUsuario } = request.user;
  const { page = 1, limit = 20, search = '', idCategoria = '', status = 'ACTIVO' } = request.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  // Cajeros y cashiers solo ven productos con stock en su punto de venta
  const esCajero = ['CAJERO', 'CASHIER', 'SUPERVISOR'].includes(TipoUsuario);

  try {
    const pool = await getPool();

    let whereExtra = '';
    if (search)      whereExtra += ` AND (p.Nombre LIKE @search OR p.SKU LIKE @search OR p.CodigoBarras LIKE @search)`;
    if (idCategoria) whereExtra += ` AND p.idCategoria = @idCategoria`;
    if (status)      whereExtra += ` AND p.Status = @status`;

    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('offset',   sql.Int,    offset)
      .input('limit',    sql.Int,    parseInt(limit));

    if (search)      req.input('search',      sql.VarChar(200), `%${search}%`);
    if (idCategoria) req.input('idCategoria', sql.BigInt,       idCategoria);
    if (status)      req.input('status',      sql.VarChar(20),  status);

    let query;
    if (esCajero && pvUsuario) {
      // Cajero: muestra solo productos con stock > 0 en su sucursal
      req.input('idPuntoVenta', sql.BigInt, pvUsuario);
      query = `
        SELECT p.idProducto, p.idCategoria, c.Nombre AS NombreCategoria,
               p.Nombre, p.Descripcion, p.SKU, p.CodigoBarras,
               p.UnidadMedida, p.PrecioUSD, p.CostoUSD, p.StockMinimo,
               p.ImagenProducto, p.Notas, p.Status, p.FechaAlta,
               ISNULL(s.Cantidad, 0) AS StockDisponible
        FROM VIDA_INVENTARIO_PRODUCTOS p
        LEFT JOIN VIDA_INVENTARIO_CATEGORIAS c
          ON c.idBranch = p.idBranch AND c.idCuenta = p.idCuenta AND c.idCategoria = p.idCategoria
        INNER JOIN VIDA_INVENTARIO_STOCK s
          ON s.idBranch = p.idBranch AND s.idCuenta = p.idCuenta
         AND s.idProducto = p.idProducto AND s.idPuntoVenta = @idPuntoVenta
        WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
          AND s.Cantidad > 0
        ${whereExtra}
        ORDER BY p.Nombre
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `;
    } else {
      // Admin/supervisor global: todos los productos con stock sumado
      query = `
        SELECT p.idProducto, p.idCategoria, c.Nombre AS NombreCategoria,
               p.Nombre, p.Descripcion, p.SKU, p.CodigoBarras,
               p.UnidadMedida, p.PrecioUSD, p.CostoUSD, p.StockMinimo,
               p.ImagenProducto, p.Notas, p.Status, p.FechaAlta,
               ISNULL((SELECT SUM(s2.Cantidad) FROM VIDA_INVENTARIO_STOCK s2
                       WHERE s2.idBranch=p.idBranch AND s2.idCuenta=p.idCuenta
                         AND s2.idProducto=p.idProducto), 0) AS StockDisponible
        FROM VIDA_INVENTARIO_PRODUCTOS p
        LEFT JOIN VIDA_INVENTARIO_CATEGORIAS c
          ON c.idBranch = p.idBranch AND c.idCuenta = p.idCuenta AND c.idCategoria = p.idCategoria
        WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
        ${whereExtra}
        ORDER BY p.Nombre
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `;
    }

    const r = await req.query(query);

    const totalReq = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta);
    if (search)      totalReq.input('search',      sql.VarChar(200), `%${search}%`);
    if (idCategoria) totalReq.input('idCategoria', sql.BigInt,       idCategoria);
    if (status)      totalReq.input('status',      sql.VarChar(20),  status);

    let totalQuery;
    if (esCajero && pvUsuario) {
      totalReq.input('idPuntoVenta', sql.BigInt, pvUsuario);
      totalQuery = `
        SELECT COUNT(*) AS total
        FROM VIDA_INVENTARIO_PRODUCTOS p
        INNER JOIN VIDA_INVENTARIO_STOCK s
          ON s.idBranch = p.idBranch AND s.idCuenta = p.idCuenta
         AND s.idProducto = p.idProducto AND s.idPuntoVenta = @idPuntoVenta
        WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
          AND s.Cantidad > 0
        ${whereExtra}
      `;
    } else {
      totalQuery = `
        SELECT COUNT(*) AS total
        FROM VIDA_INVENTARIO_PRODUCTOS p
        WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
        ${whereExtra}
      `;
    }

    const totalR = await totalReq.query(totalQuery);

    return reply.send({
      data:  r.recordset,
      total: totalR.recordset[0].total,
      page:  parseInt(page),
      pages: Math.ceil(totalR.recordset[0].total / parseInt(limit)),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener productos' });
  }
}

// GET /api/inventario/productos/:idProducto
export async function obtenerProducto(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idProducto } = request.params;

  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch',   sql.BigInt, idBranch)
      .input('idCuenta',   sql.BigInt, idCuenta)
      .input('idProducto', sql.BigInt, idProducto)
      .query(`
        SELECT p.idProducto, p.idCategoria, c.Nombre AS NombreCategoria,
               p.Nombre, p.Descripcion, p.SKU, p.CodigoBarras,
               p.UnidadMedida, p.PrecioUSD, p.CostoUSD, p.StockMinimo,
               p.ImagenProducto, p.Notas, p.Status, p.FechaAlta
        FROM VIDA_INVENTARIO_PRODUCTOS p
        LEFT JOIN VIDA_INVENTARIO_CATEGORIAS c
          ON c.idBranch = p.idBranch AND c.idCuenta = p.idCuenta AND c.idCategoria = p.idCategoria
        WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta AND p.idProducto = @idProducto
      `);

    if (!r.recordset[0]) return reply.code(404).send({ error: 'Producto no encontrado' });
    return reply.send(r.recordset[0]);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener producto' });
  }
}

// POST /api/inventario/productos
export async function crearProducto(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idCategoria, Nombre, Descripcion, SKU, CodigoBarras, UnidadMedida,
          PrecioUSD, CostoUSD, StockMinimo, Notas } = request.body;

  if (!Nombre || !UnidadMedida || !idCategoria)
    return reply.code(400).send({ error: 'Nombre, UnidadMedida e idCategoria son requeridos' });

  try {
    const pool = await getPool();

    // SKU único por cuenta
    if (SKU) {
      const existe = await pool.request()
        .input('idBranch', sql.BigInt,      idBranch)
        .input('idCuenta', sql.BigInt,      idCuenta)
        .input('SKU',      sql.VarChar(100), SKU)
        .query(`SELECT idProducto FROM VIDA_INVENTARIO_PRODUCTOS
                WHERE idBranch = @idBranch AND idCuenta = @idCuenta AND SKU = @SKU`);
      if (existe.recordset.length > 0)
        return reply.code(409).send({ error: 'El SKU ya está en uso' });
    }

    const nuevoId = await nextId(pool, 'VIDA_INVENTARIO_PRODUCTOS', 'idProducto', idBranch, idCuenta);

    await pool.request()
      .input('idBranch',     sql.BigInt,       idBranch)
      .input('idCuenta',     sql.BigInt,       idCuenta)
      .input('idProducto',   sql.BigInt,       nuevoId)
      .input('idCategoria',  sql.BigInt,       idCategoria)
      .input('Nombre',       sql.VarChar(200), Nombre)
      .input('Descripcion',  sql.VarChar(500), Descripcion || null)
      .input('SKU',          sql.VarChar(100), SKU || null)
      .input('CodigoBarras', sql.VarChar(100), CodigoBarras || null)
      .input('UnidadMedida', sql.VarChar(50),  UnidadMedida)
      .input('PrecioUSD',    sql.Decimal(18,4), PrecioUSD ?? 0)
      .input('CostoUSD',     sql.Decimal(18,4), CostoUSD || null)
      .input('StockMinimo',  sql.Decimal(18,4), StockMinimo ?? 0)
      .input('Notas',        sql.VarChar(500), Notas || null)
      .input('UsuAlta',      sql.VarChar(20),  String(idUsuario))
      .query(`INSERT INTO VIDA_INVENTARIO_PRODUCTOS
                (idBranch, idCuenta, idProducto, idCategoria, Nombre, Descripcion,
                 SKU, CodigoBarras, UnidadMedida, PrecioUSD, CostoUSD, StockMinimo, Notas, UsuAlta)
              VALUES
                (@idBranch, @idCuenta, @idProducto, @idCategoria, @Nombre, @Descripcion,
                 @SKU, @CodigoBarras, @UnidadMedida, @PrecioUSD, @CostoUSD, @StockMinimo, @Notas, @UsuAlta)`);

    return reply.code(201).send({ message: 'Producto creado', idProducto: nuevoId });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al crear producto: ' + err.message });
  }
}

// PUT /api/inventario/productos/:idProducto
export async function editarProducto(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idProducto } = request.params;
  const { idCategoria, Nombre, Descripcion, SKU, CodigoBarras, UnidadMedida,
          PrecioUSD, CostoUSD, StockMinimo, Notas } = request.body;

  if (!Nombre || !UnidadMedida || !idCategoria)
    return reply.code(400).send({ error: 'Nombre, UnidadMedida e idCategoria son requeridos' });

  try {
    const pool = await getPool();

    // SKU único (excluyendo el producto actual)
    if (SKU) {
      const existe = await pool.request()
        .input('idBranch',   sql.BigInt,       idBranch)
        .input('idCuenta',   sql.BigInt,       idCuenta)
        .input('SKU',        sql.VarChar(100), SKU)
        .input('idProducto', sql.BigInt,       idProducto)
        .query(`SELECT idProducto FROM VIDA_INVENTARIO_PRODUCTOS
                WHERE idBranch = @idBranch AND idCuenta = @idCuenta
                  AND SKU = @SKU AND idProducto <> @idProducto`);
      if (existe.recordset.length > 0)
        return reply.code(409).send({ error: 'El SKU ya está en uso por otro producto' });
    }

    await pool.request()
      .input('idBranch',     sql.BigInt,        idBranch)
      .input('idCuenta',     sql.BigInt,        idCuenta)
      .input('idProducto',   sql.BigInt,        idProducto)
      .input('idCategoria',  sql.BigInt,        idCategoria)
      .input('Nombre',       sql.VarChar(200),  Nombre)
      .input('Descripcion',  sql.VarChar(500),  Descripcion || null)
      .input('SKU',          sql.VarChar(100),  SKU || null)
      .input('CodigoBarras', sql.VarChar(100),  CodigoBarras || null)
      .input('UnidadMedida', sql.VarChar(50),   UnidadMedida)
      .input('PrecioUSD',    sql.Decimal(18,4), PrecioUSD ?? 0)
      .input('CostoUSD',     sql.Decimal(18,4), CostoUSD || null)
      .input('StockMinimo',  sql.Decimal(18,4), StockMinimo ?? 0)
      .input('Notas',        sql.VarChar(500),  Notas || null)
      .input('UsuMod',       sql.VarChar(20),   String(idUsuario))
      .query(`UPDATE VIDA_INVENTARIO_PRODUCTOS SET
                idCategoria = @idCategoria, Nombre = @Nombre, Descripcion = @Descripcion,
                SKU = @SKU, CodigoBarras = @CodigoBarras, UnidadMedida = @UnidadMedida,
                PrecioUSD = @PrecioUSD, CostoUSD = @CostoUSD, StockMinimo = @StockMinimo,
                Notas = @Notas, FechaMod = GETDATE(), UsuMod = @UsuMod
              WHERE idBranch = @idBranch AND idCuenta = @idCuenta AND idProducto = @idProducto`);

    return reply.send({ message: 'Producto actualizado' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al editar producto' });
  }
}

// PATCH /api/inventario/productos/:idProducto/status
export async function toggleProducto(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idProducto } = request.params;
  const { status } = request.body;

  if (!['ACTIVO', 'INACTIVO'].includes(status))
    return reply.code(400).send({ error: 'Status debe ser ACTIVO o INACTIVO' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',   sql.BigInt,     idBranch)
      .input('idCuenta',   sql.BigInt,     idCuenta)
      .input('idProducto', sql.BigInt,     idProducto)
      .input('Status',     sql.VarChar(20), status)
      .input('UsuMod',     sql.VarChar(20), String(idUsuario))
      .query(`UPDATE VIDA_INVENTARIO_PRODUCTOS SET
                Status = @Status, FechaMod = GETDATE(), UsuMod = @UsuMod
              WHERE idBranch = @idBranch AND idCuenta = @idCuenta AND idProducto = @idProducto`);

    return reply.send({ message: `Producto ${status === 'ACTIVO' ? 'activado' : 'desactivado'}` });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al cambiar status del producto' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// STOCK
// ══════════════════════════════════════════════════════════════════════════

// GET /api/inventario/stock?idPuntoVenta=X
export async function verStock(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idPuntoVenta, soloStockBajo = false } = request.query;

  if (!idPuntoVenta)
    return reply.code(400).send({ error: 'idPuntoVenta es requerido' });

  try {
    const pool = await getPool();

    let filtroStock = soloStockBajo === 'true'
      ? 'AND ISNULL(s.Cantidad, 0) <= p.StockMinimo'
      : '';

    const r = await pool.request()
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('idPuntoVenta',sql.BigInt, idPuntoVenta)
      .query(`
        SELECT p.idProducto, p.Nombre, p.SKU, p.CodigoBarras,
               p.UnidadMedida, p.PrecioUSD, p.StockMinimo,
               c.Nombre AS NombreCategoria,
               ISNULL(s.Cantidad, 0) AS Cantidad,
               CASE WHEN ISNULL(s.Cantidad, 0) <= p.StockMinimo THEN 1 ELSE 0 END AS StockBajo
        FROM VIDA_INVENTARIO_PRODUCTOS p
        LEFT JOIN VIDA_INVENTARIO_STOCK s
          ON s.idBranch = p.idBranch AND s.idCuenta = p.idCuenta
         AND s.idProducto = p.idProducto AND s.idPuntoVenta = @idPuntoVenta
        LEFT JOIN VIDA_INVENTARIO_CATEGORIAS c
          ON c.idBranch = p.idBranch AND c.idCuenta = p.idCuenta AND c.idCategoria = p.idCategoria
        WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta AND p.Status = 'ACTIVO'
        ${filtroStock}
        ORDER BY p.Nombre
      `);

    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener stock' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// MOVIMIENTOS (ENTRADAS / SALIDAS / AJUSTES)
// ══════════════════════════════════════════════════════════════════════════

// POST /api/inventario/movimientos
export async function registrarMovimiento(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idPuntoVenta, idProducto, TipoMovimiento, Cantidad, Motivo, Referencia } = request.body;

  if (!idPuntoVenta || !idProducto || !TipoMovimiento || !Cantidad)
    return reply.code(400).send({ error: 'idPuntoVenta, idProducto, TipoMovimiento y Cantidad son requeridos' });

  if (!['ENTRADA', 'SALIDA', 'AJUSTE'].includes(TipoMovimiento))
    return reply.code(400).send({ error: 'TipoMovimiento debe ser ENTRADA, SALIDA o AJUSTE' });

  if (Cantidad <= 0)
    return reply.code(400).send({ error: 'La cantidad debe ser mayor a 0' });

  try {
    const pool = await getPool();

    // Stock actual
    const stockActual = await pool.request()
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('idPuntoVenta',sql.BigInt, idPuntoVenta)
      .input('idProducto',  sql.BigInt, idProducto)
      .query(`SELECT ISNULL(Cantidad, 0) AS Cantidad
              FROM VIDA_INVENTARIO_STOCK
              WHERE idBranch = @idBranch AND idCuenta = @idCuenta
                AND idPuntoVenta = @idPuntoVenta AND idProducto = @idProducto`);

    const cantidadAntes = stockActual.recordset[0]?.Cantidad ?? 0;

    let cantidadDespues;
    if (TipoMovimiento === 'ENTRADA') {
      cantidadDespues = cantidadAntes + parseFloat(Cantidad);
    } else if (TipoMovimiento === 'SALIDA') {
      if (cantidadAntes < Cantidad)
        return reply.code(409).send({ error: 'Stock insuficiente', stockActual: cantidadAntes });
      cantidadDespues = cantidadAntes - parseFloat(Cantidad);
    } else {
      // AJUSTE: la cantidad enviada ES el nuevo stock
      cantidadDespues = parseFloat(Cantidad);
    }

    // Upsert stock
    await pool.request()
      .input('idBranch',    sql.BigInt,        idBranch)
      .input('idCuenta',    sql.BigInt,        idCuenta)
      .input('idPuntoVenta',sql.BigInt,        idPuntoVenta)
      .input('idProducto',  sql.BigInt,        idProducto)
      .input('Cantidad',    sql.Decimal(18,4), cantidadDespues)
      .query(`MERGE VIDA_INVENTARIO_STOCK AS target
              USING (SELECT @idBranch AS idBranch, @idCuenta AS idCuenta,
                            @idPuntoVenta AS idPuntoVenta, @idProducto AS idProducto) AS src
                ON target.idBranch = src.idBranch AND target.idCuenta = src.idCuenta
               AND target.idPuntoVenta = src.idPuntoVenta AND target.idProducto = src.idProducto
              WHEN MATCHED THEN
                UPDATE SET Cantidad = @Cantidad, FechaMod = GETDATE()
              WHEN NOT MATCHED THEN
                INSERT (idBranch, idCuenta, idPuntoVenta, idProducto, Cantidad)
                VALUES (@idBranch, @idCuenta, @idPuntoVenta, @idProducto, @Cantidad);`);

    // Registrar movimiento
    const nuevoId = await nextId(pool, 'VIDA_INVENTARIO_MOVIMIENTOS', 'idMovimiento', idBranch, idCuenta);

    await pool.request()
      .input('idBranch',         sql.BigInt,       idBranch)
      .input('idCuenta',         sql.BigInt,       idCuenta)
      .input('idMovimiento',     sql.BigInt,       nuevoId)
      .input('idPuntoVenta',     sql.BigInt,       idPuntoVenta)
      .input('idProducto',       sql.BigInt,       idProducto)
      .input('TipoMovimiento',   sql.VarChar(20),  TipoMovimiento)
      .input('Cantidad',         sql.Decimal(18,4), parseFloat(Cantidad))
      .input('CantidadAntes',    sql.Decimal(18,4), cantidadAntes)
      .input('CantidadDespues',  sql.Decimal(18,4), cantidadDespues)
      .input('Motivo',           sql.VarChar(300), Motivo || null)
      .input('Referencia',       sql.VarChar(100), Referencia || null)
      .input('UsuAlta',          sql.VarChar(20),  String(idUsuario))
      .query(`INSERT INTO VIDA_INVENTARIO_MOVIMIENTOS
                (idBranch, idCuenta, idMovimiento, idPuntoVenta, idProducto,
                 TipoMovimiento, Cantidad, CantidadAntes, CantidadDespues,
                 Motivo, Referencia, UsuAlta)
              VALUES
                (@idBranch, @idCuenta, @idMovimiento, @idPuntoVenta, @idProducto,
                 @TipoMovimiento, @Cantidad, @CantidadAntes, @CantidadDespues,
                 @Motivo, @Referencia, @UsuAlta)`);

    await registrarAuditoria(pool, {
      idBranch, idCuenta,
      entityType: 'INVENTARIO', entityId: nuevoId,
      accion: `MOVIMIENTO_${TipoMovimiento}`, actor: idUsuario,
      data: {
        idPuntoVenta: Number(idPuntoVenta), idProducto: Number(idProducto),
        Cantidad: parseFloat(Cantidad), CantidadAntes: parseFloat(cantidadAntes),
        CantidadDespues: parseFloat(cantidadDespues),
        Motivo: Motivo || null, Referencia: Referencia || null,
      },
    }, request.log);

    return reply.code(201).send({
      message: 'Movimiento registrado',
      idMovimiento:    nuevoId,
      cantidadAntes,
      cantidadDespues,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al registrar movimiento: ' + err.message });
  }
}

// GET /api/inventario/movimientos?idPuntoVenta=X&idProducto=Y
export async function listarMovimientos(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idPuntoVenta, idProducto, tipo, page = 1, limit = 30 } = request.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const pool = await getPool();

    let whereExtra = '';
    if (idPuntoVenta) whereExtra += ' AND m.idPuntoVenta = @idPuntoVenta';
    if (idProducto)   whereExtra += ' AND m.idProducto = @idProducto';
    if (tipo)         whereExtra += ' AND m.TipoMovimiento = @tipo';

    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('offset',   sql.Int,    offset)
      .input('limit',    sql.Int,    parseInt(limit));

    if (idPuntoVenta) req.input('idPuntoVenta', sql.BigInt,    idPuntoVenta);
    if (idProducto)   req.input('idProducto',   sql.BigInt,    idProducto);
    if (tipo)         req.input('tipo',          sql.VarChar(20), tipo);

    const r = await req.query(`
      SELECT m.idMovimiento, m.idPuntoVenta, m.idProducto,
             p.Nombre AS NombreProducto, p.UnidadMedida,
             m.TipoMovimiento, m.Cantidad, m.CantidadAntes, m.CantidadDespues,
             m.Motivo, m.Referencia, m.FechaAlta, m.UsuAlta
      FROM VIDA_INVENTARIO_MOVIMIENTOS m
      INNER JOIN VIDA_INVENTARIO_PRODUCTOS p
        ON p.idBranch = m.idBranch AND p.idCuenta = m.idCuenta AND p.idProducto = m.idProducto
      WHERE m.idBranch = @idBranch AND m.idCuenta = @idCuenta
      ${whereExtra}
      ORDER BY m.FechaAlta DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener movimientos' });
  }
}

// ── POST /api/inventario/productos/:idProducto/imagen ──────────────────────
// Sube la foto del producto (multipart) y actualiza ImagenProducto
export async function subirImagenProducto(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idProducto } = request.params;

  try {
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No se recibió ningún archivo' });

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(data.mimetype)) {
      return reply.code(400).send({ error: 'Solo se permiten imágenes JPG, PNG o WebP' });
    }

    const uploadDir = path.join(process.cwd(), 'uploads', 'productos');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const ext = (data.filename.split('.').pop() || 'jpg').toLowerCase();
    const filename = `prod_${idBranch}_${idCuenta}_${idProducto}_${Date.now()}.${ext}`;
    const filepath = path.join(uploadDir, filename);

    const buffer = await data.toBuffer();
    fs.writeFileSync(filepath, buffer);

    const urlImagen = `/uploads/productos/${filename}`;

    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch',       sql.BigInt,       idBranch)
      .input('idCuenta',       sql.BigInt,       idCuenta)
      .input('idProducto',     sql.BigInt,       idProducto)
      .input('ImagenProducto', sql.VarChar(300), urlImagen)
      .input('UsuMod',         sql.VarChar(20),  String(idUsuario))
      .query(`UPDATE VIDA_INVENTARIO_PRODUCTOS SET
                ImagenProducto=@ImagenProducto, FechaMod=GETDATE(), UsuMod=@UsuMod
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idProducto=@idProducto`);

    if (r.rowsAffected[0] === 0) {
      fs.unlinkSync(filepath);
      return reply.code(404).send({ error: 'Producto no encontrado' });
    }

    return reply.send({ url: urlImagen });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al subir imagen del producto' });
  }
}
