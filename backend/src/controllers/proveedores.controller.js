// src/controllers/proveedores.controller.js
import { getPool, sql } from '../db/sqlserver.js';

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

// Transiciones válidas de estado
const TRANSICIONES = {
  BORRADOR:          ['ENVIADA', 'CANCELADA'],
  ENVIADA:           ['RECIBIDA_PARCIAL', 'RECIBIDA_COMPLETA', 'CANCELADA'],
  RECIBIDA_PARCIAL:  ['RECIBIDA_COMPLETA', 'CANCELADA'],
  RECIBIDA_COMPLETA: [],
  CANCELADA:         [],
};

// ══════════════════════════════════════════════════════════════════════════
// PROVEEDORES — CRUD
// ══════════════════════════════════════════════════════════════════════════

// GET /api/proveedores
export async function listarProveedores(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { page = 1, limit = 20, search = '', status = '' } = request.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const pool = await getPool();

    let whereExtra = '';
    if (search) whereExtra += ` AND (p.Nombre LIKE @search OR p.RIF LIKE @search OR p.Contacto LIKE @search OR p.Email LIKE @search)`;
    if (status) whereExtra += ` AND p.Status = @status`;

    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('offset',   sql.Int,    offset)
      .input('limit',    sql.Int,    parseInt(limit));

    if (search) req.input('search', sql.VarChar(200), `%${search}%`);
    if (status) req.input('status', sql.VarChar(20),  status);

    const r = await req.query(`
      SELECT p.idProveedor, p.Nombre, p.RIF, p.Contacto, p.Email,
             p.Telefono, p.Direccion, p.Ciudad, p.Notas, p.Status, p.FechaAlta,
             (SELECT COUNT(*) FROM VIDA_PROVEEDORES_PRODUCTOS pp
              WHERE pp.idBranch = p.idBranch AND pp.idCuenta = p.idCuenta
                AND pp.idProveedor = p.idProveedor) AS totalProductos,
             (SELECT COUNT(*) FROM VIDA_ORDENES_COMPRA oc
              WHERE oc.idBranch = p.idBranch AND oc.idCuenta = p.idCuenta
                AND oc.idProveedor = p.idProveedor
                AND oc.Status NOT IN ('CANCELADA', 'RECIBIDA_COMPLETA')) AS ordenesActivas
      FROM VIDA_PROVEEDORES p
      WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
      ${whereExtra}
      ORDER BY p.Nombre
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const totalReq = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta);
    if (search) totalReq.input('search', sql.VarChar(200), `%${search}%`);
    if (status) totalReq.input('status', sql.VarChar(20),  status);

    const totalR = await totalReq.query(`
      SELECT COUNT(*) AS total FROM VIDA_PROVEEDORES p
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
    return reply.code(500).send({ error: 'Error al obtener proveedores' });
  }
}

// GET /api/proveedores/:idProveedor
export async function obtenerProveedor(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idProveedor } = request.params;

  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('idProveedor', sql.BigInt, idProveedor)
      .query(`
        SELECT idProveedor, Nombre, RIF, Contacto, Email,
               Telefono, Direccion, Ciudad, Notas, Status, FechaAlta
        FROM VIDA_PROVEEDORES
        WHERE idBranch = @idBranch AND idCuenta = @idCuenta AND idProveedor = @idProveedor
      `);

    if (!r.recordset[0]) return reply.code(404).send({ error: 'Proveedor no encontrado' });
    return reply.send(r.recordset[0]);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener proveedor' });
  }
}

// POST /api/proveedores
export async function crearProveedor(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { Nombre, RIF, Contacto, Email, Telefono, Direccion, Ciudad, Notas } = request.body;

  if (!Nombre) return reply.code(400).send({ error: 'El nombre es requerido' });

  try {
    const pool = await getPool();
    const nuevoId = await nextId(pool, 'VIDA_PROVEEDORES', 'idProveedor', idBranch, idCuenta);

    await pool.request()
      .input('idBranch',    sql.BigInt,      idBranch)
      .input('idCuenta',    sql.BigInt,      idCuenta)
      .input('idProveedor', sql.BigInt,      nuevoId)
      .input('Nombre',      sql.VarChar(200), Nombre)
      .input('RIF',         sql.VarChar(50),  RIF || null)
      .input('Contacto',    sql.VarChar(200), Contacto || null)
      .input('Email',       sql.VarChar(100), Email || null)
      .input('Telefono',    sql.VarChar(50),  Telefono || null)
      .input('Direccion',   sql.VarChar(500), Direccion || null)
      .input('Ciudad',      sql.VarChar(100), Ciudad || null)
      .input('Notas',       sql.VarChar(500), Notas || null)
      .input('UsuAlta',     sql.VarChar(20),  String(idUsuario))
      .query(`INSERT INTO VIDA_PROVEEDORES
                (idBranch, idCuenta, idProveedor, Nombre, RIF, Contacto,
                 Email, Telefono, Direccion, Ciudad, Notas, UsuAlta)
              VALUES
                (@idBranch, @idCuenta, @idProveedor, @Nombre, @RIF, @Contacto,
                 @Email, @Telefono, @Direccion, @Ciudad, @Notas, @UsuAlta)`);

    return reply.code(201).send({ message: 'Proveedor creado', idProveedor: nuevoId });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al crear proveedor' });
  }
}

// PUT /api/proveedores/:idProveedor
export async function editarProveedor(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idProveedor } = request.params;
  const { Nombre, RIF, Contacto, Email, Telefono, Direccion, Ciudad, Notas } = request.body;

  if (!Nombre) return reply.code(400).send({ error: 'El nombre es requerido' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',    sql.BigInt,      idBranch)
      .input('idCuenta',    sql.BigInt,      idCuenta)
      .input('idProveedor', sql.BigInt,      idProveedor)
      .input('Nombre',      sql.VarChar(200), Nombre)
      .input('RIF',         sql.VarChar(50),  RIF || null)
      .input('Contacto',    sql.VarChar(200), Contacto || null)
      .input('Email',       sql.VarChar(100), Email || null)
      .input('Telefono',    sql.VarChar(50),  Telefono || null)
      .input('Direccion',   sql.VarChar(500), Direccion || null)
      .input('Ciudad',      sql.VarChar(100), Ciudad || null)
      .input('Notas',       sql.VarChar(500), Notas || null)
      .input('UsuMod',      sql.VarChar(20),  String(idUsuario))
      .query(`UPDATE VIDA_PROVEEDORES SET
                Nombre = @Nombre, RIF = @RIF, Contacto = @Contacto,
                Email = @Email, Telefono = @Telefono, Direccion = @Direccion,
                Ciudad = @Ciudad, Notas = @Notas,
                FechaMod = GETDATE(), UsuMod = @UsuMod
              WHERE idBranch = @idBranch AND idCuenta = @idCuenta AND idProveedor = @idProveedor`);

    return reply.send({ message: 'Proveedor actualizado' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al editar proveedor' });
  }
}

// PATCH /api/proveedores/:idProveedor/status
export async function toggleProveedor(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idProveedor } = request.params;
  const { status } = request.body;

  if (!['ACTIVO', 'INACTIVO'].includes(status))
    return reply.code(400).send({ error: 'Status debe ser ACTIVO o INACTIVO' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',    sql.BigInt,     idBranch)
      .input('idCuenta',    sql.BigInt,     idCuenta)
      .input('idProveedor', sql.BigInt,     idProveedor)
      .input('Status',      sql.VarChar(20), status)
      .input('UsuMod',      sql.VarChar(20), String(idUsuario))
      .query(`UPDATE VIDA_PROVEEDORES SET
                Status = @Status, FechaMod = GETDATE(), UsuMod = @UsuMod
              WHERE idBranch = @idBranch AND idCuenta = @idCuenta AND idProveedor = @idProveedor`);

    return reply.send({ message: `Proveedor ${status === 'ACTIVO' ? 'activado' : 'desactivado'}` });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al cambiar status' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// RELACIÓN PROVEEDOR ↔ PRODUCTOS
// ══════════════════════════════════════════════════════════════════════════

// GET /api/proveedores/:idProveedor/productos
export async function listarProductosProveedor(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idProveedor } = request.params;

  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('idProveedor', sql.BigInt, idProveedor)
      .query(`
        SELECT pp.idProducto, pp.PrecioCosto, pp.CodigoProveedor, pp.FechaAlta,
               p.Nombre, p.SKU, p.UnidadMedida, p.PrecioUSD,
               c.Nombre AS NombreCategoria
        FROM VIDA_PROVEEDORES_PRODUCTOS pp
        INNER JOIN VIDA_INVENTARIO_PRODUCTOS p
          ON p.idBranch = pp.idBranch AND p.idCuenta = pp.idCuenta AND p.idProducto = pp.idProducto
        LEFT JOIN VIDA_INVENTARIO_CATEGORIAS c
          ON c.idBranch = p.idBranch AND c.idCuenta = p.idCuenta AND c.idCategoria = p.idCategoria
        WHERE pp.idBranch = @idBranch AND pp.idCuenta = @idCuenta AND pp.idProveedor = @idProveedor
        ORDER BY p.Nombre
      `);

    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener productos del proveedor' });
  }
}

// POST /api/proveedores/:idProveedor/productos
export async function agregarProductoProveedor(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idProveedor } = request.params;
  const { idProducto, PrecioCosto, CodigoProveedor } = request.body;

  if (!idProducto) return reply.code(400).send({ error: 'idProducto es requerido' });

  try {
    const pool = await getPool();

    // Verificar si ya existe
    const existe = await pool.request()
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('idProveedor', sql.BigInt, idProveedor)
      .input('idProducto',  sql.BigInt, idProducto)
      .query(`SELECT idProducto FROM VIDA_PROVEEDORES_PRODUCTOS
              WHERE idBranch = @idBranch AND idCuenta = @idCuenta
                AND idProveedor = @idProveedor AND idProducto = @idProducto`);

    if (existe.recordset.length > 0)
      return reply.code(409).send({ error: 'Este producto ya está ligado al proveedor' });

    await pool.request()
      .input('idBranch',        sql.BigInt,       idBranch)
      .input('idCuenta',        sql.BigInt,       idCuenta)
      .input('idProveedor',     sql.BigInt,       idProveedor)
      .input('idProducto',      sql.BigInt,       idProducto)
      .input('PrecioCosto',     sql.Decimal(18,4), PrecioCosto || null)
      .input('CodigoProveedor', sql.VarChar(100), CodigoProveedor || null)
      .input('UsuAlta',         sql.VarChar(20),  String(idUsuario))
      .query(`INSERT INTO VIDA_PROVEEDORES_PRODUCTOS
                (idBranch, idCuenta, idProveedor, idProducto, PrecioCosto, CodigoProveedor, UsuAlta)
              VALUES
                (@idBranch, @idCuenta, @idProveedor, @idProducto, @PrecioCosto, @CodigoProveedor, @UsuAlta)`);

    return reply.code(201).send({ message: 'Producto ligado al proveedor' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al ligar producto' });
  }
}

// DELETE /api/proveedores/:idProveedor/productos/:idProducto
export async function quitarProductoProveedor(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idProveedor, idProducto } = request.params;

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('idProveedor', sql.BigInt, idProveedor)
      .input('idProducto',  sql.BigInt, idProducto)
      .query(`DELETE FROM VIDA_PROVEEDORES_PRODUCTOS
              WHERE idBranch = @idBranch AND idCuenta = @idCuenta
                AND idProveedor = @idProveedor AND idProducto = @idProducto`);

    return reply.send({ message: 'Producto desligado del proveedor' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al desligar producto' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ÓRDENES DE COMPRA
// ══════════════════════════════════════════════════════════════════════════

// GET /api/ordenes-compra
export async function listarOrdenes(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { page = 1, limit = 20, idProveedor = '', status = '', idPuntoVenta = '' } = request.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const pool = await getPool();

    let whereExtra = '';
    if (idProveedor)  whereExtra += ' AND oc.idProveedor = @idProveedor';
    if (status)       whereExtra += ' AND oc.Status = @status';
    if (idPuntoVenta) whereExtra += ' AND oc.idPuntoVenta = @idPuntoVenta';

    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('offset',   sql.Int,    offset)
      .input('limit',    sql.Int,    parseInt(limit));

    if (idProveedor)  req.input('idProveedor',  sql.BigInt,    idProveedor);
    if (status)       req.input('status',        sql.VarChar(30), status);
    if (idPuntoVenta) req.input('idPuntoVenta',  sql.BigInt,    idPuntoVenta);

    const r = await req.query(`
      SELECT oc.idOrden, oc.Folio, oc.Status, oc.TotalUSD, oc.FechaEstimada,
             oc.Notas, oc.FechaAlta, oc.UsuAlta,
             pr.Nombre AS NombreProveedor, pr.Contacto,
             pv.NomComercial AS NombreSucursal,
             (SELECT COUNT(*) FROM VIDA_ORDENES_COMPRA_DETALLE d
              WHERE d.idBranch = oc.idBranch AND d.idCuenta = oc.idCuenta
                AND d.idOrden = oc.idOrden) AS totalItems
      FROM VIDA_ORDENES_COMPRA oc
      INNER JOIN VIDA_PROVEEDORES pr
        ON pr.idBranch = oc.idBranch AND pr.idCuenta = oc.idCuenta AND pr.idProveedor = oc.idProveedor
      LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch = oc.idBranch AND pv.idCuenta = oc.idCuenta AND pv.idPuntoVenta = oc.idPuntoVenta
      WHERE oc.idBranch = @idBranch AND oc.idCuenta = @idCuenta
      ${whereExtra}
      ORDER BY oc.FechaAlta DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const totalReq = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta);
    if (idProveedor)  totalReq.input('idProveedor',  sql.BigInt,    idProveedor);
    if (status)       totalReq.input('status',        sql.VarChar(30), status);
    if (idPuntoVenta) totalReq.input('idPuntoVenta',  sql.BigInt,    idPuntoVenta);

    const totalR = await totalReq.query(`
      SELECT COUNT(*) AS total FROM VIDA_ORDENES_COMPRA oc
      WHERE oc.idBranch = @idBranch AND oc.idCuenta = @idCuenta ${whereExtra}
    `);

    return reply.send({
      data:  r.recordset,
      total: totalR.recordset[0].total,
      page:  parseInt(page),
      pages: Math.ceil(totalR.recordset[0].total / parseInt(limit)),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener órdenes' });
  }
}

// GET /api/ordenes-compra/:idOrden
export async function obtenerOrden(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idOrden } = request.params;

  try {
    const pool = await getPool();

    const cabR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idOrden',  sql.BigInt, idOrden)
      .query(`
        SELECT oc.idOrden, oc.idProveedor, oc.idPuntoVenta, oc.Folio,
               oc.Status, oc.TotalUSD, oc.Notas, oc.FechaEstimada, oc.FechaAlta,
               pr.Nombre AS NombreProveedor, pr.Contacto, pr.Email, pr.Telefono,
               pv.NomComercial AS NombreSucursal
        FROM VIDA_ORDENES_COMPRA oc
        INNER JOIN VIDA_PROVEEDORES pr
          ON pr.idBranch = oc.idBranch AND pr.idCuenta = oc.idCuenta AND pr.idProveedor = oc.idProveedor
        LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv
          ON pv.idBranch = oc.idBranch AND pv.idCuenta = oc.idCuenta AND pv.idPuntoVenta = oc.idPuntoVenta
        WHERE oc.idBranch = @idBranch AND oc.idCuenta = @idCuenta AND oc.idOrden = @idOrden
      `);

    if (!cabR.recordset[0]) return reply.code(404).send({ error: 'Orden no encontrada' });

    const detR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idOrden',  sql.BigInt, idOrden)
      .query(`
        SELECT d.idDetalle, d.idProducto, d.CantidadOrdenada, d.CantidadRecibida,
               d.PrecioUnitario, d.Notas,
               p.Nombre AS NombreProducto, p.SKU, p.UnidadMedida
        FROM VIDA_ORDENES_COMPRA_DETALLE d
        INNER JOIN VIDA_INVENTARIO_PRODUCTOS p
          ON p.idBranch = d.idBranch AND p.idCuenta = d.idCuenta AND p.idProducto = d.idProducto
        WHERE d.idBranch = @idBranch AND d.idCuenta = @idCuenta AND d.idOrden = @idOrden
        ORDER BY d.idDetalle
      `);

    const histR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idOrden',  sql.BigInt, idOrden)
      .query(`
        SELECT idHistorial, StatusAnterior, StatusNuevo, Notas, FechaAlta, UsuAlta
        FROM VIDA_ORDENES_COMPRA_HISTORIAL
        WHERE idBranch = @idBranch AND idCuenta = @idCuenta AND idOrden = @idOrden
        ORDER BY FechaAlta ASC
      `);

    return reply.send({
      ...cabR.recordset[0],
      detalle:   detR.recordset,
      historial: histR.recordset,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener orden' });
  }
}

// POST /api/ordenes-compra
export async function crearOrden(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idProveedor, idPuntoVenta, Folio, Notas, FechaEstimada, items } = request.body;

  if (!idProveedor || !idPuntoVenta || !items?.length)
    return reply.code(400).send({ error: 'idProveedor, idPuntoVenta e items son requeridos' });

  try {
    const pool = await getPool();
    const nuevoId = await nextId(pool, 'VIDA_ORDENES_COMPRA', 'idOrden', idBranch, idCuenta);

    // Calcular total
    const totalUSD = items.reduce((sum, i) => sum + (i.CantidadOrdenada * i.PrecioUnitario), 0);

    await pool.request()
      .input('idBranch',      sql.BigInt,       idBranch)
      .input('idCuenta',      sql.BigInt,       idCuenta)
      .input('idOrden',       sql.BigInt,       nuevoId)
      .input('idProveedor',   sql.BigInt,       idProveedor)
      .input('idPuntoVenta',  sql.BigInt,       idPuntoVenta)
      .input('Folio',         sql.VarChar(50),  Folio || null)
      .input('Notas',         sql.VarChar(500), Notas || null)
      .input('FechaEstimada', sql.Date,         FechaEstimada || null)
      .input('TotalUSD',      sql.Decimal(18,4), totalUSD)
      .input('UsuAlta',       sql.VarChar(20),  String(idUsuario))
      .query(`INSERT INTO VIDA_ORDENES_COMPRA
                (idBranch, idCuenta, idOrden, idProveedor, idPuntoVenta,
                 Folio, Notas, FechaEstimada, TotalUSD, UsuAlta)
              VALUES
                (@idBranch, @idCuenta, @idOrden, @idProveedor, @idPuntoVenta,
                 @Folio, @Notas, @FechaEstimada, @TotalUSD, @UsuAlta)`);

    // Insertar items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await pool.request()
        .input('idBranch',         sql.BigInt,       idBranch)
        .input('idCuenta',         sql.BigInt,       idCuenta)
        .input('idOrden',          sql.BigInt,       nuevoId)
        .input('idDetalle',        sql.BigInt,       i + 1)
        .input('idProducto',       sql.BigInt,       item.idProducto)
        .input('CantidadOrdenada', sql.Decimal(18,4), item.CantidadOrdenada)
        .input('PrecioUnitario',   sql.Decimal(18,4), item.PrecioUnitario)
        .input('Notas',            sql.VarChar(300), item.Notas || null)
        .query(`INSERT INTO VIDA_ORDENES_COMPRA_DETALLE
                  (idBranch, idCuenta, idOrden, idDetalle, idProducto,
                   CantidadOrdenada, PrecioUnitario, Notas)
                VALUES
                  (@idBranch, @idCuenta, @idOrden, @idDetalle, @idProducto,
                   @CantidadOrdenada, @PrecioUnitario, @Notas)`);
    }

    // Registrar en historial
    const nuevoHistId = await nextId(pool, 'VIDA_ORDENES_COMPRA_HISTORIAL', 'idHistorial', idBranch, idCuenta);
    await pool.request()
      .input('idBranch',       sql.BigInt,     idBranch)
      .input('idCuenta',       sql.BigInt,     idCuenta)
      .input('idHistorial',    sql.BigInt,     nuevoHistId)
      .input('idOrden',        sql.BigInt,     nuevoId)
      .input('StatusNuevo',    sql.VarChar(30), 'BORRADOR')
      .input('UsuAlta',        sql.VarChar(20), String(idUsuario))
      .query(`INSERT INTO VIDA_ORDENES_COMPRA_HISTORIAL
                (idBranch, idCuenta, idHistorial, idOrden, StatusNuevo, UsuAlta)
              VALUES
                (@idBranch, @idCuenta, @idHistorial, @idOrden, @StatusNuevo, @UsuAlta)`);

    return reply.code(201).send({ message: 'Orden creada', idOrden: nuevoId });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al crear orden: ' + err.message });
  }
}

// POST /api/ordenes-compra/:idOrden/estado
export async function cambiarEstadoOrden(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idOrden } = request.params;
  const { StatusNuevo, Notas, cantidadesRecibidas } = request.body;
  // cantidadesRecibidas: [{ idDetalle, CantidadRecibida }] — requerido para RECIBIDA_PARCIAL/COMPLETA

  if (!StatusNuevo) return reply.code(400).send({ error: 'StatusNuevo es requerido' });

  try {
    const pool = await getPool();

    // Obtener orden actual
    const ordenR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idOrden',  sql.BigInt, idOrden)
      .query(`SELECT Status, idPuntoVenta FROM VIDA_ORDENES_COMPRA
              WHERE idBranch = @idBranch AND idCuenta = @idCuenta AND idOrden = @idOrden`);

    const orden = ordenR.recordset[0];
    if (!orden) return reply.code(404).send({ error: 'Orden no encontrada' });

    // Validar transición
    const permitidos = TRANSICIONES[orden.Status] || [];
    if (!permitidos.includes(StatusNuevo))
      return reply.code(400).send({
        error: `No se puede pasar de ${orden.Status} a ${StatusNuevo}`,
        transicionesValidas: permitidos,
      });

    // Si es recepción, actualizar cantidades recibidas y generar movimientos de inventario
    if (['RECIBIDA_PARCIAL', 'RECIBIDA_COMPLETA'].includes(StatusNuevo)) {
      if (!cantidadesRecibidas?.length)
        return reply.code(400).send({ error: 'cantidadesRecibidas es requerido para este estado' });

      for (const item of cantidadesRecibidas) {
        if (!item.CantidadRecibida || item.CantidadRecibida <= 0) continue;

        // Actualizar cantidad recibida en detalle
        await pool.request()
          .input('idBranch',         sql.BigInt,       idBranch)
          .input('idCuenta',         sql.BigInt,       idCuenta)
          .input('idOrden',          sql.BigInt,       idOrden)
          .input('idDetalle',        sql.BigInt,       item.idDetalle)
          .input('CantidadRecibida', sql.Decimal(18,4), item.CantidadRecibida)
          .query(`UPDATE VIDA_ORDENES_COMPRA_DETALLE SET CantidadRecibida = @CantidadRecibida
                  WHERE idBranch = @idBranch AND idCuenta = @idCuenta
                    AND idOrden = @idOrden AND idDetalle = @idDetalle`);

        // Obtener idProducto del detalle
        const detR = await pool.request()
          .input('idBranch',  sql.BigInt, idBranch)
          .input('idCuenta',  sql.BigInt, idCuenta)
          .input('idOrden',   sql.BigInt, idOrden)
          .input('idDetalle', sql.BigInt, item.idDetalle)
          .query(`SELECT idProducto FROM VIDA_ORDENES_COMPRA_DETALLE
                  WHERE idBranch = @idBranch AND idCuenta = @idCuenta
                    AND idOrden = @idOrden AND idDetalle = @idDetalle`);

        const idProducto = detR.recordset[0]?.idProducto;
        if (!idProducto) continue;

        // Stock actual
        const stockR = await pool.request()
          .input('idBranch',    sql.BigInt, idBranch)
          .input('idCuenta',    sql.BigInt, idCuenta)
          .input('idPuntoVenta',sql.BigInt, orden.idPuntoVenta)
          .input('idProducto',  sql.BigInt, idProducto)
          .query(`SELECT ISNULL(Cantidad, 0) AS Cantidad FROM VIDA_INVENTARIO_STOCK
                  WHERE idBranch = @idBranch AND idCuenta = @idCuenta
                    AND idPuntoVenta = @idPuntoVenta AND idProducto = @idProducto`);

        const cantAntes   = stockR.recordset[0]?.Cantidad ?? 0;
        const cantDespues = cantAntes + parseFloat(item.CantidadRecibida);

        // Upsert stock
        await pool.request()
          .input('idBranch',    sql.BigInt,        idBranch)
          .input('idCuenta',    sql.BigInt,        idCuenta)
          .input('idPuntoVenta',sql.BigInt,        orden.idPuntoVenta)
          .input('idProducto',  sql.BigInt,        idProducto)
          .input('Cantidad',    sql.Decimal(18,4), cantDespues)
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

        // Movimiento de inventario
        const nuevoMovId = await nextId(pool, 'VIDA_INVENTARIO_MOVIMIENTOS', 'idMovimiento', idBranch, idCuenta);
        await pool.request()
          .input('idBranch',        sql.BigInt,        idBranch)
          .input('idCuenta',        sql.BigInt,        idCuenta)
          .input('idMovimiento',    sql.BigInt,        nuevoMovId)
          .input('idPuntoVenta',    sql.BigInt,        orden.idPuntoVenta)
          .input('idProducto',      sql.BigInt,        idProducto)
          .input('Cantidad',        sql.Decimal(18,4), parseFloat(item.CantidadRecibida))
          .input('CantidadAntes',   sql.Decimal(18,4), cantAntes)
          .input('CantidadDespues', sql.Decimal(18,4), cantDespues)
          .input('Motivo',          sql.VarChar(300),  `Recepción OC #${idOrden}`)
          .input('Referencia',      sql.VarChar(100),  String(idOrden))
          .input('UsuAlta',         sql.VarChar(20),   String(idUsuario))
          .query(`INSERT INTO VIDA_INVENTARIO_MOVIMIENTOS
                    (idBranch, idCuenta, idMovimiento, idPuntoVenta, idProducto,
                     TipoMovimiento, Cantidad, CantidadAntes, CantidadDespues,
                     Motivo, Referencia, UsuAlta)
                  VALUES
                    (@idBranch, @idCuenta, @idMovimiento, @idPuntoVenta, @idProducto,
                     'ENTRADA', @Cantidad, @CantidadAntes, @CantidadDespues,
                     @Motivo, @Referencia, @UsuAlta)`);
      }
    }

    // Actualizar status de la orden
    await pool.request()
      .input('idBranch',   sql.BigInt,     idBranch)
      .input('idCuenta',   sql.BigInt,     idCuenta)
      .input('idOrden',    sql.BigInt,     idOrden)
      .input('Status',     sql.VarChar(30), StatusNuevo)
      .input('UsuMod',     sql.VarChar(20), String(idUsuario))
      .query(`UPDATE VIDA_ORDENES_COMPRA SET
                Status = @Status, FechaMod = GETDATE(), UsuMod = @UsuMod
              WHERE idBranch = @idBranch AND idCuenta = @idCuenta AND idOrden = @idOrden`);

    // Registrar historial
    const nuevoHistId = await nextId(pool, 'VIDA_ORDENES_COMPRA_HISTORIAL', 'idHistorial', idBranch, idCuenta);
    await pool.request()
      .input('idBranch',      sql.BigInt,     idBranch)
      .input('idCuenta',      sql.BigInt,     idCuenta)
      .input('idHistorial',   sql.BigInt,     nuevoHistId)
      .input('idOrden',       sql.BigInt,     idOrden)
      .input('StatusAnterior',sql.VarChar(30), orden.Status)
      .input('StatusNuevo',   sql.VarChar(30), StatusNuevo)
      .input('Notas',         sql.VarChar(500), Notas || null)
      .input('UsuAlta',       sql.VarChar(20), String(idUsuario))
      .query(`INSERT INTO VIDA_ORDENES_COMPRA_HISTORIAL
                (idBranch, idCuenta, idHistorial, idOrden, StatusAnterior, StatusNuevo, Notas, UsuAlta)
              VALUES
                (@idBranch, @idCuenta, @idHistorial, @idOrden, @StatusAnterior, @StatusNuevo, @Notas, @UsuAlta)`);

    return reply.send({ message: `Orden actualizada a ${StatusNuevo}` });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al cambiar estado: ' + err.message });
  }
}
