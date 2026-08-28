// src/controllers/matriz.controller.js
// Matriz y reabasto (T-0038/T-0039). La Matriz es un punto de venta central
// que surte a las tiendas; el traspaso se valúa al costo (CostoUSD) y mueve
// stock: baja en la Matriz, sube en la tienda al recibir.
import { getPool, sql } from '../db/sqlserver.js';
import { registrarAuditoria } from '../services/audit.service.js';

// Roles de RED: ven/gestionan los pedidos de todas las tiendas (bandeja de la
// Matriz). Los roles de tienda (ADMIN, SUPERVISOR) solo pueden pedir, ver y
// recibir el reabasto de SU propia tienda.
const ROLES_RED = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO'];
const esRed = (user) => ROLES_RED.includes(user.TipoUsuario);

async function nextId(pool, tabla, campo, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}),0)+1 AS nextId FROM ${tabla}
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
  return r.recordset[0].nextId;
}

async function nextIdTx(tx, tabla, campo, idBranch, idCuenta) {
  const r = await new sql.Request(tx)
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}),0)+1 AS nextId FROM ${tabla} WITH (UPDLOCK, HOLDLOCK)
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
  return r.recordset[0].nextId;
}

// El punto de venta marcado como Matriz (o null si no hay)
async function getMatriz(pool, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT TOP 1 idPuntoVenta, NomComercial FROM VIDA_CUENTA_PUNTOS_VENTA
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND EsMatriz=1 AND Status='ACTIVO'`);
  return r.recordset[0] || null;
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — DESIGNAR / VER LA MATRIZ
// GET /matriz  ·  POST /matriz/designar { idPuntoVenta }
// ══════════════════════════════════════════════════════════════════════════
export async function estadoMatriz(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();
    const matriz = await getMatriz(pool, idBranch, idCuenta);
    const pv = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT idPuntoVenta, NomComercial, Ciudad, Estado, EsMatriz
              FROM VIDA_CUENTA_PUNTOS_VENTA
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO'
              ORDER BY EsMatriz DESC, NomComercial`);
    return reply.send({ matriz, puntosVenta: pv.recordset });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener la matriz' });
  }
}

export async function designarMatriz(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idPuntoVenta } = request.body || {};
  if (!idPuntoVenta) return reply.code(400).send({ error: 'idPuntoVenta es requerido' });
  try {
    const pool = await getPool();
    // Solo una Matriz a la vez
    await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`UPDATE VIDA_CUENTA_PUNTOS_VENTA SET EsMatriz=0
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
    await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idPuntoVenta', sql.BigInt, idPuntoVenta)
      .query(`UPDATE VIDA_CUENTA_PUNTOS_VENTA SET EsMatriz=1
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@idPuntoVenta`);
    return reply.send({ ok: true });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al designar la matriz' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CATÁLOGO CENTRAL — productos con stock de la Matriz y costo (para reabastecer)
// GET /matriz/catalogo?search=&idCategoria=
// ══════════════════════════════════════════════════════════════════════════
export async function catalogoMatriz(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { search, idCategoria } = request.query;
  try {
    const pool = await getPool();
    const matriz = await getMatriz(pool, idBranch, idCuenta);
    if (!matriz) return reply.code(400).send({ error: 'No hay una Matriz designada', codigo: 'SIN_MATRIZ' });

    const req = pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idMatriz',     sql.BigInt, matriz.idPuntoVenta);
    let filtro = '';
    if (search)      { req.input('search', sql.VarChar(200), `%${search}%`); filtro += ' AND (p.Nombre LIKE @search OR p.SKU LIKE @search)'; }
    if (idCategoria) { req.input('idCategoria', sql.BigInt, idCategoria);     filtro += ' AND p.idCategoria = @idCategoria'; }

    const r = await req.query(`
      SELECT p.idProducto, p.Nombre, p.SKU, p.UnidadMedida, p.ImagenProducto,
             p.CostoUSD, p.PrecioUSD, p.idCategoria, cat.Nombre AS NombreCategoria,
             ISNULL(inv.Cantidad, 0) AS StockMatriz
      FROM VIDA_INVENTARIO_PRODUCTOS p
      LEFT JOIN VIDA_INVENTARIO_STOCK inv
        ON inv.idBranch=p.idBranch AND inv.idCuenta=p.idCuenta
           AND inv.idProducto=p.idProducto AND inv.idPuntoVenta=@idMatriz
      LEFT JOIN VIDA_INVENTARIO_CATEGORIAS cat
        ON cat.idBranch=p.idBranch AND cat.idCuenta=p.idCuenta AND cat.idCategoria=p.idCategoria
      WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta AND p.Status='ACTIVO'
        ${filtro}
      ORDER BY p.Nombre`);

    return reply.send({ matriz, productos: r.recordset });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener el catálogo de la matriz' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// TIENDA — CREAR PEDIDO A LA MATRIZ (reabasto)
// POST /matriz/pedidos  { idPuntoVentaSolicita, items:[{idProducto,Cantidad}], Notas }
// ══════════════════════════════════════════════════════════════════════════
export async function crearPedidoMatriz(request, reply) {
  const { idBranch, idCuenta, idUsuario, idPuntoVenta: pvUsuario } = request.user;
  const { items, Notas } = request.body || {};
  // Roles de tienda solo pueden pedir reabasto para SU tienda; los de red
  // pueden crear a nombre de la tienda que indiquen.
  const idPuntoVentaSolicita = esRed(request.user)
    ? request.body?.idPuntoVentaSolicita
    : pvUsuario;
  if (!idPuntoVentaSolicita || !items?.length)
    return reply.code(400).send({ error: 'idPuntoVentaSolicita e items son requeridos' });

  try {
    const pool = await getPool();
    const matriz = await getMatriz(pool, idBranch, idCuenta);
    if (!matriz) return reply.code(400).send({ error: 'No hay una Matriz designada', codigo: 'SIN_MATRIZ' });
    if (String(matriz.idPuntoVenta) === String(idPuntoVentaSolicita))
      return reply.code(400).send({ error: 'La Matriz no puede pedirse reabasto a sí misma' });

    // Costos desde la BD (nunca del cliente)
    const idsProd = [...new Set(items.map(i => parseInt(i.idProducto)))];
    const costoReq = pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta);
    idsProd.forEach((id, i) => costoReq.input(`p${i}`, sql.BigInt, id));
    const costoR = await costoReq.query(`
      SELECT idProducto, ISNULL(CostoUSD,0) AS CostoUSD FROM VIDA_INVENTARIO_PRODUCTOS
      WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO'
        AND idProducto IN (${idsProd.map((_, i) => `@p${i}`).join(',')})`);
    const costoPorId = new Map(costoR.recordset.map(p => [String(p.idProducto), parseFloat(p.CostoUSD)]));

    const detalle = items
      .filter(i => costoPorId.has(String(i.idProducto)) && parseFloat(i.Cantidad) > 0)
      .map(i => ({
        idProducto: parseInt(i.idProducto),
        Cantidad: parseFloat(i.Cantidad),
        CostoUnitario: costoPorId.get(String(i.idProducto)),
      }));
    if (!detalle.length) return reply.code(400).send({ error: 'Ningún producto válido en el pedido' });

    const totalCosto = detalle.reduce((s, d) => s + d.Cantidad * d.CostoUnitario, 0);
    const idPedidoMatriz = await nextId(pool, 'VIDA_PEDIDOS_MATRIZ', 'idPedidoMatriz', idBranch, idCuenta);

    await pool.request()
      .input('idBranch',            sql.BigInt,       idBranch)
      .input('idCuenta',            sql.BigInt,       idCuenta)
      .input('idPedidoMatriz',      sql.BigInt,       idPedidoMatriz)
      .input('idPuntoVentaSolicita',sql.BigInt,       idPuntoVentaSolicita)
      .input('idPuntoVentaMatriz',  sql.BigInt,       matriz.idPuntoVenta)
      .input('TotalCostoUSD',       sql.Decimal(18,4), totalCosto)
      .input('Notas',               sql.VarChar(500), Notas?.trim() || null)
      .input('UsuAlta',             sql.VarChar(30),  `U:${idUsuario}`)
      .query(`INSERT INTO VIDA_PEDIDOS_MATRIZ
                (idBranch,idCuenta,idPedidoMatriz,idPuntoVentaSolicita,idPuntoVentaMatriz,
                 Status,TotalCostoUSD,Notas,UsuAlta)
              VALUES
                (@idBranch,@idCuenta,@idPedidoMatriz,@idPuntoVentaSolicita,@idPuntoVentaMatriz,
                 'SOLICITADO',@TotalCostoUSD,@Notas,@UsuAlta)`);

    let idDetalle = 1;
    for (const d of detalle) {
      await pool.request()
        .input('idBranch',           sql.BigInt,       idBranch)
        .input('idCuenta',           sql.BigInt,       idCuenta)
        .input('idPedidoMatriz',     sql.BigInt,       idPedidoMatriz)
        .input('idDetalle',          sql.BigInt,       idDetalle++)
        .input('idProducto',         sql.BigInt,       d.idProducto)
        .input('CantidadSolicitada', sql.Decimal(18,4), d.Cantidad)
        .input('CostoUnitario',      sql.Decimal(18,4), d.CostoUnitario)
        .query(`INSERT INTO VIDA_PEDIDOS_MATRIZ_DETALLE
                  (idBranch,idCuenta,idPedidoMatriz,idDetalle,idProducto,CantidadSolicitada,CostoUnitario)
                VALUES
                  (@idBranch,@idCuenta,@idPedidoMatriz,@idDetalle,@idProducto,@CantidadSolicitada,@CostoUnitario)`);
    }

    return reply.code(201).send({ idPedidoMatriz, status: 'SOLICITADO', TotalCostoUSD: totalCosto });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al crear el pedido a la matriz' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// LISTAR PEDIDOS A LA MATRIZ (?rol=tienda&idPuntoVenta= para una tienda; sin
// filtro = bandeja de la Matriz con todos)
// GET /matriz/pedidos?idPuntoVenta=&status=
// ══════════════════════════════════════════════════════════════════════════
export async function listarPedidosMatriz(request, reply) {
  const { idBranch, idCuenta, idPuntoVenta: pvUsuario } = request.user;
  const { status } = request.query;
  // Roles de tienda solo ven sus pedidos; los de red ven la bandeja completa
  // y pueden filtrar por la tienda que pasen en la query.
  const idPuntoVenta = esRed(request.user) ? request.query.idPuntoVenta : pvUsuario;
  try {
    const pool = await getPool();
    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta);
    let filtro = '';
    if (idPuntoVenta) { req.input('idpv', sql.BigInt, idPuntoVenta); filtro += ' AND pm.idPuntoVentaSolicita=@idpv'; }
    if (status)       { req.input('st', sql.VarChar(30), status);     filtro += ' AND pm.Status=@st'; }

    const r = await req.query(`
      SELECT pm.idPedidoMatriz, pm.Status, pm.TotalCostoUSD, pm.Notas,
             pm.FechaAlta, pm.FechaMod, pm.idPuntoVentaSolicita,
             pvs.NomComercial AS NombreTienda,
             (SELECT COUNT(*) FROM VIDA_PEDIDOS_MATRIZ_DETALLE d
              WHERE d.idBranch=pm.idBranch AND d.idCuenta=pm.idCuenta AND d.idPedidoMatriz=pm.idPedidoMatriz) AS TotalItems
      FROM VIDA_PEDIDOS_MATRIZ pm
      LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pvs
        ON pvs.idBranch=pm.idBranch AND pvs.idCuenta=pm.idCuenta AND pvs.idPuntoVenta=pm.idPuntoVentaSolicita
      WHERE pm.idBranch=@idBranch AND pm.idCuenta=@idCuenta ${filtro}
      ORDER BY pm.FechaAlta DESC`);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al listar pedidos a la matriz' });
  }
}

// GET /matriz/pedidos/:idPedidoMatriz
export async function obtenerPedidoMatriz(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idPedidoMatriz } = request.params;
  try {
    const pool = await getPool();
    const cab = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idPedidoMatriz', sql.BigInt, idPedidoMatriz)
      .query(`SELECT pm.*, pvs.NomComercial AS NombreTienda, pvm.NomComercial AS NombreMatriz
              FROM VIDA_PEDIDOS_MATRIZ pm
              LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pvs
                ON pvs.idBranch=pm.idBranch AND pvs.idCuenta=pm.idCuenta AND pvs.idPuntoVenta=pm.idPuntoVentaSolicita
              LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pvm
                ON pvm.idBranch=pm.idBranch AND pvm.idCuenta=pm.idCuenta AND pvm.idPuntoVenta=pm.idPuntoVentaMatriz
              WHERE pm.idBranch=@idBranch AND pm.idCuenta=@idCuenta AND pm.idPedidoMatriz=@idPedidoMatriz`);
    if (!cab.recordset.length) return reply.code(404).send({ error: 'Pedido no encontrado' });

    // Un rol de tienda solo puede ver su propio pedido de reabasto.
    if (!esRed(request.user) &&
        String(cab.recordset[0].idPuntoVentaSolicita) !== String(request.user.idPuntoVenta))
      return reply.code(404).send({ error: 'Pedido no encontrado' });

    const det = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idPedidoMatriz', sql.BigInt, idPedidoMatriz)
      .query(`SELECT d.idDetalle, d.idProducto, d.CantidadSolicitada, d.CantidadRecibida, d.CostoUnitario,
                     p.Nombre AS NombreProducto, p.SKU, p.UnidadMedida
              FROM VIDA_PEDIDOS_MATRIZ_DETALLE d
              LEFT JOIN VIDA_INVENTARIO_PRODUCTOS p
                ON p.idBranch=d.idBranch AND p.idCuenta=d.idCuenta AND p.idProducto=d.idProducto
              WHERE d.idBranch=@idBranch AND d.idCuenta=@idCuenta AND d.idPedidoMatriz=@idPedidoMatriz
              ORDER BY d.idDetalle`);

    const hist = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idPedidoMatriz', sql.BigInt, idPedidoMatriz)
      .query(`SELECT StatusAnterior, StatusNuevo, Notas, UsuAlta, FechaAlta
              FROM VIDA_PEDIDOS_MATRIZ_HISTORIAL
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedidoMatriz=@idPedidoMatriz
              ORDER BY idHistorial`);

    return reply.send({ ...cab.recordset[0], detalle: det.recordset, historial: hist.recordset });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener el pedido' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CAMBIAR ESTADO DEL PEDIDO A LA MATRIZ (+ recepción que mueve stock)
// PATCH /matriz/pedidos/:idPedidoMatriz/status
//   { StatusNuevo, Notas?, cantidadesRecibidas?:[{idDetalle,CantidadRecibida}] }
// ══════════════════════════════════════════════════════════════════════════
const TRANSICIONES = {
  SOLICITADO: ['PREPARANDO', 'CANCELADO'],
  PREPARANDO: ['ENVIADO', 'CANCELADO'],
  ENVIADO:    ['RECIBIDO', 'CANCELADO'],
  RECIBIDO:   [],
  CANCELADO:  [],
};

export async function cambiarEstadoPedidoMatriz(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idPedidoMatriz } = request.params;
  const { StatusNuevo, Notas, cantidadesRecibidas } = request.body || {};

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  let enTx = false;

  try {
    const cabR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idPedidoMatriz', sql.BigInt, idPedidoMatriz)
      .query(`SELECT Status, idPuntoVentaSolicita, idPuntoVentaMatriz
              FROM VIDA_PEDIDOS_MATRIZ
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedidoMatriz=@idPedidoMatriz`);
    if (!cabR.recordset.length) return reply.code(404).send({ error: 'Pedido no encontrado' });

    const ped = cabR.recordset[0];
    // Un rol de tienda solo puede cambiar el estado de su propio pedido
    // (p. ej. recibir el reabasto o cancelar su solicitud).
    if (!esRed(request.user) &&
        String(ped.idPuntoVentaSolicita) !== String(request.user.idPuntoVenta)) {
      if (enTx) { try { await transaction.rollback(); } catch {} }
      return reply.code(403).send({ error: 'No puedes modificar el pedido de otra tienda' });
    }
    const permitidos = TRANSICIONES[ped.Status] ?? [];
    if (!permitidos.includes(StatusNuevo))
      return reply.code(422).send({ error: `Transición inválida: ${ped.Status} → ${StatusNuevo}`, permitidos });

    if (StatusNuevo === 'RECIBIDO' && !cantidadesRecibidas?.length)
      return reply.code(400).send({ error: 'cantidadesRecibidas es requerido para recibir' });

    await transaction.begin();
    enTx = true;

    // Actualizar status
    await new sql.Request(transaction)
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idPedidoMatriz', sql.BigInt, idPedidoMatriz)
      .input('StatusNuevo', sql.VarChar(30), StatusNuevo)
      .query(`UPDATE VIDA_PEDIDOS_MATRIZ SET Status=@StatusNuevo, FechaMod=GETDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedidoMatriz=@idPedidoMatriz`);

    // Recepción: mover stock (baja Matriz, sube tienda) al costo
    if (StatusNuevo === 'RECIBIDO') {
      for (const item of cantidadesRecibidas) {
        const cant = parseFloat(item.CantidadRecibida);
        if (!cant || cant <= 0) continue;

        const detR = await new sql.Request(transaction)
          .input('idBranch', sql.BigInt, idBranch)
          .input('idCuenta', sql.BigInt, idCuenta)
          .input('idPedidoMatriz', sql.BigInt, idPedidoMatriz)
          .input('idDetalle', sql.BigInt, item.idDetalle)
          .query(`SELECT idProducto FROM VIDA_PEDIDOS_MATRIZ_DETALLE
                  WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                    AND idPedidoMatriz=@idPedidoMatriz AND idDetalle=@idDetalle`);
        const idProducto = detR.recordset[0]?.idProducto;
        if (!idProducto) continue;

        await new sql.Request(transaction)
          .input('idBranch', sql.BigInt, idBranch)
          .input('idCuenta', sql.BigInt, idCuenta)
          .input('idPedidoMatriz', sql.BigInt, idPedidoMatriz)
          .input('idDetalle', sql.BigInt, item.idDetalle)
          .input('CantidadRecibida', sql.Decimal(18,4), cant)
          .query(`UPDATE VIDA_PEDIDOS_MATRIZ_DETALLE SET CantidadRecibida=@CantidadRecibida
                  WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                    AND idPedidoMatriz=@idPedidoMatriz AND idDetalle=@idDetalle`);

        // Movimiento en cada punto de venta: -Matriz, +Tienda
        for (const mov of [
          { pv: ped.idPuntoVentaMatriz,   signo: -1, tipo: 'SALIDA',  motivo: `Traspaso a tienda (pedido matriz #${idPedidoMatriz})` },
          { pv: ped.idPuntoVentaSolicita, signo: +1, tipo: 'ENTRADA', motivo: `Reabasto desde matriz (pedido #${idPedidoMatriz})` },
        ]) {
          const stockR = await new sql.Request(transaction)
            .input('idBranch', sql.BigInt, idBranch)
            .input('idCuenta', sql.BigInt, idCuenta)
            .input('idPuntoVenta', sql.BigInt, mov.pv)
            .input('idProducto', sql.BigInt, idProducto)
            .input('delta', sql.Decimal(18,4), mov.signo * cant)
            .query(`
              MERGE VIDA_INVENTARIO_STOCK WITH (HOLDLOCK) AS t
              USING (SELECT @idBranch AS idBranch, @idCuenta AS idCuenta,
                            @idPuntoVenta AS idPuntoVenta, @idProducto AS idProducto) AS s
                ON t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta
                   AND t.idPuntoVenta=s.idPuntoVenta AND t.idProducto=s.idProducto
              WHEN MATCHED THEN
                UPDATE SET Cantidad = CASE WHEN ISNULL(t.Cantidad,0)+@delta < 0 THEN 0
                                           ELSE ISNULL(t.Cantidad,0)+@delta END,
                           FechaMod = GETDATE()
              WHEN NOT MATCHED THEN
                INSERT (idBranch,idCuenta,idPuntoVenta,idProducto,Cantidad)
                VALUES (@idBranch,@idCuenta,@idPuntoVenta,@idProducto,CASE WHEN @delta<0 THEN 0 ELSE @delta END)
              OUTPUT ISNULL(deleted.Cantidad,0) AS Antes, inserted.Cantidad AS Despues;`);
          const s = stockR.recordset[0] || { Antes: 0, Despues: 0 };

          const movId = await nextIdTx(transaction, 'VIDA_INVENTARIO_MOVIMIENTOS', 'idMovimiento', idBranch, idCuenta);
          await new sql.Request(transaction)
            .input('idBranch', sql.BigInt, idBranch)
            .input('idCuenta', sql.BigInt, idCuenta)
            .input('idMovimiento', sql.BigInt, movId)
            .input('idPuntoVenta', sql.BigInt, mov.pv)
            .input('idProducto', sql.BigInt, idProducto)
            .input('TipoMovimiento', sql.VarChar(20), mov.tipo)
            .input('Cantidad', sql.Decimal(18,4), cant)
            .input('CantidadAntes', sql.Decimal(18,4), parseFloat(s.Antes))
            .input('CantidadDespues', sql.Decimal(18,4), parseFloat(s.Despues))
            .input('Motivo', sql.VarChar(300), mov.motivo)
            .input('Referencia', sql.VarChar(100), `MATRIZ:${idPedidoMatriz}`)
            .input('UsuAlta', sql.VarChar(20), `U:${idUsuario}`)
            .query(`INSERT INTO VIDA_INVENTARIO_MOVIMIENTOS
                      (idBranch,idCuenta,idMovimiento,idPuntoVenta,idProducto,
                       TipoMovimiento,Cantidad,CantidadAntes,CantidadDespues,Motivo,Referencia,UsuAlta)
                    VALUES
                      (@idBranch,@idCuenta,@idMovimiento,@idPuntoVenta,@idProducto,
                       @TipoMovimiento,@Cantidad,@CantidadAntes,@CantidadDespues,@Motivo,@Referencia,@UsuAlta)`);
        }
      }
    }

    // Historial
    const histId = await nextIdTx(transaction, 'VIDA_PEDIDOS_MATRIZ_HISTORIAL', 'idHistorial', idBranch, idCuenta);
    await new sql.Request(transaction)
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idHistorial', sql.BigInt, histId)
      .input('idPedidoMatriz', sql.BigInt, idPedidoMatriz)
      .input('StatusAnterior', sql.VarChar(30), ped.Status)
      .input('StatusNuevo', sql.VarChar(30), StatusNuevo)
      .input('Notas', sql.VarChar(500), Notas?.trim() || null)
      .input('UsuAlta', sql.VarChar(30), `U:${idUsuario}`)
      .query(`INSERT INTO VIDA_PEDIDOS_MATRIZ_HISTORIAL
                (idBranch,idCuenta,idHistorial,idPedidoMatriz,StatusAnterior,StatusNuevo,Notas,UsuAlta)
              VALUES (@idBranch,@idCuenta,@idHistorial,@idPedidoMatriz,@StatusAnterior,@StatusNuevo,@Notas,@UsuAlta)`);

    await transaction.commit();
    enTx = false;

    if (StatusNuevo === 'RECIBIDO') {
      registrarAuditoria(pool, {
        idBranch, idCuenta, entityType: 'PEDIDO_MATRIZ', entityId: idPedidoMatriz,
        accion: 'RECIBIDO', actor: `U:${idUsuario}`,
        data: { idPuntoVentaSolicita: ped.idPuntoVentaSolicita, items: cantidadesRecibidas.length },
      }, request.log).catch(() => {});
    }

    return reply.send({ ok: true, status: StatusNuevo });
  } catch (err) {
    if (enTx) { try { await transaction.rollback(); } catch {} }
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al cambiar el estado del pedido' });
  }
}
