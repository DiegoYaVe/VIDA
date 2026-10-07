import { prepararMoneda } from '../services/moneda.service.js';
import { validarRecepcion } from '../services/recepcionOrden.service.js';
// src/controllers/proveedores.controller.js
import { getPool, sql } from '../db/sqlserver.js';
import { conIdUnico } from '../db/idUnico.js';
import { emitirCuenta } from '../services/cuentas.service.js';

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

// Variante transaccional: UPDLOCK+HOLDLOCK serializa la obtencion del ID
async function nextIdTx(tx, tabla, campo, idBranch, idCuenta) {
  const r = await new sql.Request(tx)
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}), 0) + 1 AS nextId
            FROM ${tabla} WITH (UPDLOCK, HOLDLOCK)
            WHERE idBranch = @idBranch AND idCuenta = @idCuenta`);
  return r.recordset[0].nextId;
}

function folioOrden(idOrden, fecha = new Date()) {
  return `OC-${fecha.getUTCFullYear()}-${String(idOrden).padStart(6, '0')}`;
}

// Transiciones válidas de estado
// RECIBIDA_PARCIAL admite quedarse en si misma: con la recepcion atomizada una
// orden puede recibir tres o mas entregas, y antes la segunda parcial no era
// expresable (obligaba a marcarla COMPLETA antes de tiempo). Cada paso por aca
// genera su propia recepcion y su propia cuenta por pagar.
const TRANSICIONES = {
  BORRADOR:          ['ENVIADA', 'CANCELADA'],
  ENVIADA:           ['RECIBIDA_PARCIAL', 'RECIBIDA_COMPLETA', 'CANCELADA'],
  RECIBIDA_PARCIAL:  ['RECIBIDA_PARCIAL', 'RECIBIDA_COMPLETA', 'CANCELADA'],
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
    // id con MAX()+1: si otra alta concurrente toma el mismo, se reintenta
    const nuevoId = await conIdUnico(async () => {
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
      return nuevoId;
    });

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
                FechaMod = GETUTCDATE(), UsuMod = @UsuMod
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
                Status = @Status, FechaMod = GETUTCDATE(), UsuMod = @UsuMod
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

// GET /api/ordenes-compra/siguiente-folio
// Es una vista previa para el formulario. La asignacion definitiva se vuelve a
// calcular dentro de la transaccion de crearOrden, porque otro usuario podria
// guardar una orden entre esta consulta y el clic en Guardar.
export async function siguienteFolioOrden(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();
    const siguiente = await nextId(pool, 'VIDA_ORDENES_COMPRA', 'idOrden', idBranch, idCuenta);
    return reply.send({ folio: folioOrden(siguiente) });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al generar la vista previa del folio' });
  }
}

// POST /api/ordenes-compra
export async function crearOrden(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idProveedor, Notas, FechaEstimada, items } = request.body;
  // Una compra a proveedor siempre entra a la Matriz/CEDIS. El destino no se
  // confía al cliente para impedir compras directas proveedor → sucursal.
  const idPuntoVenta = request.matriz?.idPuntoVentaMatriz;

  if (!idPuntoVenta)
    return reply.code(409).send({ error: 'La red todavía no tiene una Matriz designada' });
  if (!idProveedor || !items?.length)
    return reply.code(400).send({ error: 'idProveedor e items son requeridos' });

  let tx;
  try {
    const pool = await getPool();
    tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const nuevoId = await nextIdTx(tx, 'VIDA_ORDENES_COMPRA', 'idOrden', idBranch, idCuenta);
    const folio = folioOrden(nuevoId);

    // Comprobacion explicita dentro de la misma transaccion. El indice unico de
    // la migracion 46 es la ultima barrera frente a concurrencia o escrituras
    // realizadas fuera de esta API.
    const repetido = await new sql.Request(tx)
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('Folio', sql.VarChar(50), folio)
      .query(`SELECT TOP 1 idOrden FROM VIDA_ORDENES_COMPRA WITH (UPDLOCK, HOLDLOCK)
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Folio=@Folio`);
    if (repetido.recordset.length) {
      await tx.rollback(); tx = null;
      return reply.code(409).send({ error: 'El folio propuesto ya fue utilizado. Vuelve a abrir la orden para generar uno nuevo.' });
    }

    // Calcular total
    const totalUSD = items.reduce((sum, i) => sum + (i.CantidadOrdenada * i.PrecioUnitario), 0);

    await new sql.Request(tx)
      .input('idBranch',      sql.BigInt,       idBranch)
      .input('idCuenta',      sql.BigInt,       idCuenta)
      .input('idOrden',       sql.BigInt,       nuevoId)
      .input('idProveedor',   sql.BigInt,       idProveedor)
      .input('idPuntoVenta',  sql.BigInt,       idPuntoVenta)
      .input('Folio',         sql.VarChar(50),  folio)
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
      await new sql.Request(tx)
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
    const nuevoHistId = await nextIdTx(tx, 'VIDA_ORDENES_COMPRA_HISTORIAL', 'idHistorial', idBranch, idCuenta);
    await new sql.Request(tx)
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

    await tx.commit(); tx = null;
    return reply.code(201).send({ message: 'Orden creada', idOrden: nuevoId, Folio: folio });
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch {} }
    request.log.error(err);
    if (err?.number === 2601 || err?.number === 2627)
      return reply.code(409).send({ error: 'El folio acaba de ser utilizado por otra orden. Intenta guardar nuevamente.' });
    return reply.code(500).send({ error: 'Error al crear orden: ' + err.message });
  }
}

// POST /api/ordenes-compra/:idOrden/estado
//
// Cambia el estado de la orden y, cuando es una recepción, registra la entrega
// como DOCUMENTO propio (VIDA_OC_RECEPCIONES) y emite la cuenta por pagar por
// lo que realmente llegó.
//
// Antes esto hacía `SET CantidadRecibida = @CantidadRecibida` (asignaba, no
// acumulaba): dos entregas de 5 y 3 dejaban el detalle en 3 aunque el stock
// subiera a 8. Con dinero de por medio eso le pagaría al proveedor por 3 cajas
// en vez de 8. Además corría fuera de transacción, así que un fallo a la mitad
// dejaba unos productos con stock y otros no.
//
// Body: { StatusNuevo, Notas?, cantidadesRecibidas?, Folio?, DiasPlazo? }
//   cantidadesRecibidas: [{ idDetalle, CantidadRecibida }] — requerido al recibir
export async function cambiarEstadoOrden(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idOrden } = request.params;
  const { StatusNuevo, Notas, cantidadesRecibidas, Folio, DiasPlazo } = request.body || {};

  if (!StatusNuevo) return reply.code(400).send({ error: 'StatusNuevo es requerido' });

  const esRecepcion = ['RECIBIDA_PARCIAL', 'RECIBIDA_COMPLETA'].includes(StatusNuevo);
  if (esRecepcion && !cantidadesRecibidas?.length)
    return reply.code(400).send({ error: 'cantidadesRecibidas es requerido para este estado' });

  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  let enTx = false;

  try {
    const ordenR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idOrden',  sql.BigInt, idOrden)
      .query(`SELECT oc.Status, oc.idPuntoVenta, oc.idProveedor, oc.Folio AS FolioOC,
                     ISNULL(p.DiasCredito, 0) AS DiasCredito
              FROM VIDA_ORDENES_COMPRA oc
              LEFT JOIN VIDA_PROVEEDORES p
                ON p.idBranch=oc.idBranch AND p.idCuenta=oc.idCuenta AND p.idProveedor=oc.idProveedor
              WHERE oc.idBranch=@idBranch AND oc.idCuenta=@idCuenta AND oc.idOrden=@idOrden`);

    const orden = ordenR.recordset[0];
    if (!orden) return reply.code(404).send({ error: 'Orden no encontrada' });

    const permitidos = TRANSICIONES[orden.Status] || [];
    if (!permitidos.includes(StatusNuevo))
      return reply.code(400).send({
        error: `No se puede pasar de ${orden.Status} a ${StatusNuevo}`,
        transicionesValidas: permitidos,
      });

    // El plazo sale del proveedor y se puede pisar por documento
    const plazo = DiasPlazo != null && DiasPlazo !== ''
      ? Math.max(0, parseInt(DiasPlazo) || 0)
      : (parseInt(orden.DiasCredito) || 0);

    if (esRecepcion) await prepararMoneda(pool,request.user);
    await tx.begin(); enTx = true;
    // Serializa cambios de estado y recepciones sobre la misma orden.
    const actual = await new sql.Request(tx)
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idOrden', sql.BigInt, idOrden)
      .query(`SELECT Status FROM VIDA_ORDENES_COMPRA WITH (UPDLOCK, HOLDLOCK)
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idOrden=@idOrden`);
    if (actual.recordset[0]?.Status !== orden.Status) {
      await tx.rollback(); enTx = false;
      return reply.code(409).send({ error: 'La orden cambió. Recarga su detalle antes de continuar.' });
    }


    let recepcion = null;

    if (esRecepcion) {
      // Líneas de la orden con lock: se valida TODO antes de escribir nada, para
      // no dejar media recepción aplicada si un renglón se pasa de lo pedido.
      const lineasR = await new sql.Request(tx)
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta)
        .input('idOrden',  sql.BigInt, idOrden)
        .query(`SELECT idDetalle, idProducto, CantidadOrdenada,
                       ISNULL(CantidadRecibida,0) AS CantidadRecibida, PrecioUnitario
                FROM VIDA_ORDENES_COMPRA_DETALLE WITH (UPDLOCK, HOLDLOCK)
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idOrden=@idOrden`);

      const aplicar = validarRecepcion(lineasR.recordset, cantidadesRecibidas, StatusNuevo);

      const totalRecepcion = aplicar.reduce((s, a) => s + a.cantidad * a.precio, 0);

      // ── Cabecera de la recepción ──
      const idRecepcion = await nextIdTx(tx, 'VIDA_OC_RECEPCIONES', 'idRecepcion', idBranch, idCuenta);
      await new sql.Request(tx)
        .input('idBranch',     sql.BigInt,       idBranch)
        .input('idCuenta',     sql.BigInt,       idCuenta)
        .input('idRecepcion',  sql.BigInt,       idRecepcion)
        .input('idOrden',      sql.BigInt,       idOrden)
        .input('idPuntoVenta', sql.BigInt,       orden.idPuntoVenta)
        .input('Folio',        sql.VarChar(50),  Folio || null)
        .input('TotalUSD',     sql.Decimal(18,4), totalRecepcion)
        .input('Notas',        sql.VarChar(500), Notas || null)
        .input('UsuAlta',      sql.VarChar(30),  String(idUsuario))
        .query(`INSERT INTO VIDA_OC_RECEPCIONES
                  (idBranch, idCuenta, idRecepcion, idOrden, idPuntoVenta, Folio, TotalUSD, Notas, UsuAlta)
                VALUES
                  (@idBranch, @idCuenta, @idRecepcion, @idOrden, @idPuntoVenta, @Folio, @TotalUSD, @Notas, @UsuAlta)`);

      let idDetRecep = 0;
      for (const a of aplicar) {
        idDetRecep += 1;

        await new sql.Request(tx)
          .input('idBranch',       sql.BigInt,       idBranch)
          .input('idCuenta',       sql.BigInt,       idCuenta)
          .input('idRecepcion',    sql.BigInt,       idRecepcion)
          .input('idDetalleRecep', sql.BigInt,       idDetRecep)
          .input('idDetalleOC',    sql.BigInt,       a.idDetalle)
          .input('idProducto',     sql.BigInt,       a.idProducto)
          .input('Cantidad',       sql.Decimal(18,4), a.cantidad)
          .input('PrecioUnitario', sql.Decimal(18,4), a.precio)
          .input('Subtotal',       sql.Decimal(18,4), a.cantidad * a.precio)
          .query(`INSERT INTO VIDA_OC_RECEPCIONES_DETALLE
                    (idBranch, idCuenta, idRecepcion, idDetalleRecep, idDetalleOC,
                     idProducto, Cantidad, PrecioUnitario, Subtotal)
                  VALUES
                    (@idBranch, @idCuenta, @idRecepcion, @idDetalleRecep, @idDetalleOC,
                     @idProducto, @Cantidad, @PrecioUnitario, @Subtotal)`);

        // ACUMULA (antes pisaba)
        await new sql.Request(tx)
          .input('idBranch',  sql.BigInt,       idBranch)
          .input('idCuenta',  sql.BigInt,       idCuenta)
          .input('idOrden',   sql.BigInt,       idOrden)
          .input('idDetalle', sql.BigInt,       a.idDetalle)
          .input('Cantidad',  sql.Decimal(18,4), a.cantidad)
          .query(`UPDATE VIDA_ORDENES_COMPRA_DETALLE
                  SET CantidadRecibida = ISNULL(CantidadRecibida,0) + @Cantidad
                  WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                    AND idOrden=@idOrden AND idDetalle=@idDetalle`);

        // Stock: suma relativa y en una sola sentencia, así no hay
        // leer-modificar-escribir que dos recepciones simultáneas puedan pisar
        const stockR = await new sql.Request(tx)
          .input('idBranch',     sql.BigInt,       idBranch)
          .input('idCuenta',     sql.BigInt,       idCuenta)
          .input('idPuntoVenta', sql.BigInt,       orden.idPuntoVenta)
          .input('idProducto',   sql.BigInt,       a.idProducto)
          .input('Cantidad',     sql.Decimal(18,4), a.cantidad)
          .query(`MERGE VIDA_INVENTARIO_STOCK WITH (HOLDLOCK) AS target
                  USING (SELECT @idBranch AS idBranch, @idCuenta AS idCuenta,
                                @idPuntoVenta AS idPuntoVenta, @idProducto AS idProducto) AS src
                    ON target.idBranch=src.idBranch AND target.idCuenta=src.idCuenta
                   AND target.idPuntoVenta=src.idPuntoVenta AND target.idProducto=src.idProducto
                  WHEN MATCHED THEN
                    UPDATE SET Cantidad = ISNULL(target.Cantidad,0) + @Cantidad, FechaMod = GETUTCDATE()
                  WHEN NOT MATCHED THEN
                    INSERT (idBranch, idCuenta, idPuntoVenta, idProducto, Cantidad)
                    VALUES (@idBranch, @idCuenta, @idPuntoVenta, @idProducto, @Cantidad)
                  OUTPUT ISNULL(deleted.Cantidad,0) AS CantidadAntes,
                         inserted.Cantidad          AS CantidadDespues;`);

        const s = stockR.recordset[0] || { CantidadAntes: 0, CantidadDespues: a.cantidad };

        const idMov = await nextIdTx(tx, 'VIDA_INVENTARIO_MOVIMIENTOS', 'idMovimiento', idBranch, idCuenta);
        await new sql.Request(tx)
          .input('idBranch',        sql.BigInt,       idBranch)
          .input('idCuenta',        sql.BigInt,       idCuenta)
          .input('idMovimiento',    sql.BigInt,       idMov)
          .input('idPuntoVenta',    sql.BigInt,       orden.idPuntoVenta)
          .input('idProducto',      sql.BigInt,       a.idProducto)
          .input('Cantidad',        sql.Decimal(18,4), a.cantidad)
          .input('CantidadAntes',   sql.Decimal(18,4), parseFloat(s.CantidadAntes))
          .input('CantidadDespues', sql.Decimal(18,4), parseFloat(s.CantidadDespues))
          .input('Motivo',          sql.VarChar(300),  `Recepción #${idRecepcion} de OC #${idOrden}`)
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

      // ── La cuenta por pagar, por lo que REALMENTE llegó ──
      // Nace dentro de la misma transacción que la mercancía: o entran las dos
      // o no entra ninguna.
      const cuenta = await emitirCuenta(tx, {
        idBranch, idCuenta,
        Tipo: 'CXP',
        OrigenTipo: 'RECEPCION_OC',
        idOrigen: idRecepcion,
        idProveedor: orden.idProveedor,
        idPuntoVentaEmisor: orden.idPuntoVenta,
        TotalUSD: totalRecepcion,
        DiasPlazo: plazo,
        Folio: Folio || orden.FolioOC || null,
        Notas: `Recepción #${idRecepcion} de la orden de compra #${idOrden}`,
        UsuAlta: idUsuario,
      });

      recepcion = {
        idRecepcion,
        TotalUSD: +totalRecepcion.toFixed(4),
        renglones: aplicar.length,
        idDocumentoCxP: cuenta?.idDocumento ?? null,
      };
    }

    await new sql.Request(tx)
      .input('idBranch', sql.BigInt,      idBranch)
      .input('idCuenta', sql.BigInt,      idCuenta)
      .input('idOrden',  sql.BigInt,      idOrden)
      .input('Status',   sql.VarChar(30), StatusNuevo)
      .input('UsuMod',   sql.VarChar(20), String(idUsuario))
      .query(`UPDATE VIDA_ORDENES_COMPRA
              SET Status=@Status, FechaMod=GETUTCDATE(), UsuMod=@UsuMod
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idOrden=@idOrden`);

    const idHist = await nextIdTx(tx, 'VIDA_ORDENES_COMPRA_HISTORIAL', 'idHistorial', idBranch, idCuenta);
    await new sql.Request(tx)
      .input('idBranch',       sql.BigInt,       idBranch)
      .input('idCuenta',       sql.BigInt,       idCuenta)
      .input('idHistorial',    sql.BigInt,       idHist)
      .input('idOrden',        sql.BigInt,       idOrden)
      .input('StatusAnterior', sql.VarChar(30),  orden.Status)
      .input('StatusNuevo',    sql.VarChar(30),  StatusNuevo)
      .input('Notas',          sql.VarChar(500), recepcion
        ? `Recepción #${recepcion.idRecepcion} · $${recepcion.TotalUSD.toFixed(2)}${Notas ? ` · ${Notas}` : ''}`
        : (Notas || null))
      .input('UsuAlta',        sql.VarChar(20),  String(idUsuario))
      .query(`INSERT INTO VIDA_ORDENES_COMPRA_HISTORIAL
                (idBranch, idCuenta, idHistorial, idOrden, StatusAnterior, StatusNuevo, Notas, UsuAlta)
              VALUES
                (@idBranch, @idCuenta, @idHistorial, @idOrden, @StatusAnterior, @StatusNuevo, @Notas, @UsuAlta)`);

    await tx.commit(); enTx = false;

    return reply.send({ message: `Orden actualizada a ${StatusNuevo}`, recepcion });
  } catch (err) {
    if (enTx) { try { await tx.rollback(); } catch { /* la tx ya murió */ } }
    request.log.error(err);
    return reply.code(err.statusCode || 500).send({ error: 'Error al cambiar estado: ' + err.message });
  }
}
