// src/controllers/premios.controller.js
// Fidelización fase 3: catálogo de premios + canje, y vencimiento de puntos por
// inactividad. Reutiliza el ledger VIDA_CLIENTE_PUNTOS (decoupled de delivery).
import { getPool, sql } from '../db/sqlserver.js';

async function nextId(pool, tabla, campo, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}),0)+1 AS next FROM ${tabla} WITH (UPDLOCK, HOLDLOCK)
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
  return r.recordset[0].next;
}
async function nextIdTx(tx, tabla, campo, idBranch, idCuenta) {
  const r = await new sql.Request(tx)
    .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}),0)+1 AS next FROM ${tabla} WITH (UPDLOCK, HOLDLOCK)
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
  return r.recordset[0].next;
}
async function getConfigVal(pool, idBranch, idCuenta, clave, def) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT Valor FROM VIDA_CONFIG_DELIVERY WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Clave='${clave}'`);
  return r.recordset[0]?.Valor ?? def;
}
// Movimiento de puntos con pool (ledger + saldo)
async function movPuntos(pool, ib, ic, cli, puntos, tipo, desc) {
  if (!puntos) return;
  const movId = await nextId(pool, 'VIDA_CLIENTE_PUNTOS', 'idMovimiento', ib, ic);
  await pool.request()
    .input('idBranch', sql.BigInt, ib).input('idCuenta', sql.BigInt, ic).input('idMovimiento', sql.BigInt, movId)
    .input('idCliente', sql.BigInt, cli).input('Tipo', sql.VarChar(20), tipo).input('Puntos', sql.Int, puntos).input('Desc', sql.VarChar(200), desc)
    .query(`INSERT INTO VIDA_CLIENTE_PUNTOS (idBranch,idCuenta,idMovimiento,idCliente,Tipo,Puntos,idPedido,Descripcion)
            VALUES (@idBranch,@idCuenta,@idMovimiento,@idCliente,@Tipo,@Puntos,NULL,@Desc)`);
  await pool.request()
    .input('idBranch', sql.BigInt, ib).input('idCuenta', sql.BigInt, ic).input('idCliente', sql.BigInt, cli).input('Puntos', sql.Int, puntos)
    .query(`UPDATE VIDA_APP_CLIENTES SET PuntosSaldo = ISNULL(PuntosSaldo,0) + @Puntos
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
}

// GET /delivery/cliente/premios
export async function listarPremios(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  try {
    const pool = await getPool();
    const sR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT ISNULL(PuntosSaldo,0) AS Saldo FROM VIDA_APP_CLIENTES WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
    const pR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT idPremio, Nombre, Descripcion, CostoPuntos, Stock, ImagenUrl FROM VIDA_PREMIOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO' ORDER BY Orden, idPremio`);
    const mesesVence = parseInt(await getConfigVal(pool, idBranch, idCuenta, 'MesesInactividadVence', '12')) || 0;
    return reply.send({ saldo: sR.recordset[0]?.Saldo ?? 0, mesesVence, premios: pR.recordset });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al obtener premios' }); }
}

// POST /delivery/cliente/premios/:idPremio/canjear
export async function canjearPremio(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const { idPremio } = request.params;
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  let enTx = false;
  try {
    const pR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idPremio', sql.BigInt, idPremio)
      .query(`SELECT Nombre, CostoPuntos, Stock FROM VIDA_PREMIOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPremio=@idPremio AND Status='ACTIVO'`);
    if (!pR.recordset.length) return reply.code(404).send({ error: 'Premio no disponible' });
    const premio = pR.recordset[0];

    await tx.begin(); enTx = true;

    // Descontar stock (si es limitado)
    const stockR = await new sql.Request(tx)
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idPremio', sql.BigInt, idPremio)
      .query(`UPDATE VIDA_PREMIOS SET Stock = CASE WHEN Stock = -1 THEN -1 ELSE Stock - 1 END
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPremio=@idPremio AND (Stock = -1 OR Stock > 0)`);
    if (!stockR.rowsAffected[0]) { await tx.rollback(); return reply.code(409).send({ error: 'Premio agotado' }); }

    // Descontar puntos (atómico: solo si alcanza)
    const debR = await new sql.Request(tx)
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idCliente', sql.BigInt, idCliente).input('Costo', sql.Int, premio.CostoPuntos)
      .query(`UPDATE VIDA_APP_CLIENTES SET PuntosSaldo = PuntosSaldo - @Costo
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente AND ISNULL(PuntosSaldo,0) >= @Costo`);
    if (!debR.rowsAffected[0]) { await tx.rollback(); enTx = false; return reply.code(409).send({ error: 'No tienes puntos suficientes' }); }

    const idCanje = await nextIdTx(tx, 'VIDA_PREMIOS_CANJES', 'idCanje', idBranch, idCuenta);
    const codigo = `PRM-${idCanje}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const movId = await nextIdTx(tx, 'VIDA_CLIENTE_PUNTOS', 'idMovimiento', idBranch, idCuenta);
    await new sql.Request(tx)
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idMovimiento', sql.BigInt, movId)
      .input('idCliente', sql.BigInt, idCliente).input('Puntos', sql.Int, -premio.CostoPuntos).input('Desc', sql.VarChar(200), `Canje: ${premio.Nombre} (${codigo})`)
      .query(`INSERT INTO VIDA_CLIENTE_PUNTOS (idBranch,idCuenta,idMovimiento,idCliente,Tipo,Puntos,idPedido,Descripcion)
              VALUES (@idBranch,@idCuenta,@idMovimiento,@idCliente,'CANJEADO',@Puntos,NULL,@Desc)`);
    await new sql.Request(tx)
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idCanje', sql.BigInt, idCanje)
      .input('idCliente', sql.BigInt, idCliente).input('idPremio', sql.BigInt, idPremio).input('Nombre', sql.VarChar(150), premio.Nombre)
      .input('Costo', sql.Int, premio.CostoPuntos).input('Codigo', sql.VarChar(40), codigo)
      .query(`INSERT INTO VIDA_PREMIOS_CANJES (idBranch,idCuenta,idCanje,idCliente,idPremio,NombrePremio,CostoPuntos,Codigo,Status)
              VALUES (@idBranch,@idCuenta,@idCanje,@idCliente,@idPremio,@Nombre,@Costo,@Codigo,'PENDIENTE')`);

    await tx.commit();
    return reply.code(201).send({ idCanje, codigo, premio: premio.Nombre, costoPuntos: premio.CostoPuntos });
  } catch (err) {
    if (enTx) { try { await tx.rollback(); } catch {} }
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al canjear el premio' });
  }
}

// GET /delivery/cliente/premios/canjes
export async function misCanjes(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT TOP 50 idCanje, NombrePremio, CostoPuntos, Codigo, Status, FechaAlta
              FROM VIDA_PREMIOS_CANJES WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente
              ORDER BY FechaAlta DESC, idCanje DESC`);
    return reply.send(r.recordset);
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al obtener canjes' }); }
}

// GET /delivery/admin/premios/canjes?status=PENDIENTE  (ops)
export async function listarCanjesAdmin(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { status } = request.query;
  try {
    const pool = await getPool();
    const req = pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta);
    let filtro = '';
    if (status) { req.input('st', sql.VarChar(20), status); filtro = ' AND j.Status = @st'; }
    const r = await req.query(`
      SELECT TOP 100 j.idCanje, j.NombrePremio, j.CostoPuntos, j.Codigo, j.Status, j.FechaAlta,
             c.Nombre AS Cliente, c.Telefono AS TelefonoCliente
      FROM VIDA_PREMIOS_CANJES j
      LEFT JOIN VIDA_APP_CLIENTES c ON c.idBranch=j.idBranch AND c.idCuenta=j.idCuenta AND c.idCliente=j.idCliente
      WHERE j.idBranch=@idBranch AND j.idCuenta=@idCuenta ${filtro}
      ORDER BY j.FechaAlta DESC`);
    return reply.send(r.recordset);
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al listar canjes' }); }
}

// PATCH /delivery/admin/premios/canjes/:idCanje/estado  { Status }  (ops)
export async function cambiarEstadoCanje(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idCanje } = request.params;
  const { Status } = request.body || {};
  if (!['ENTREGADO', 'CANCELADO'].includes(Status)) return reply.code(400).send({ error: 'Status debe ser ENTREGADO o CANCELADO' });
  try {
    const pool = await getPool();
    const cR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idCanje', sql.BigInt, idCanje)
      .query(`SELECT idCliente, idPremio, CostoPuntos, Status, NombrePremio, Codigo FROM VIDA_PREMIOS_CANJES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCanje=@idCanje`);
    if (!cR.recordset.length) return reply.code(404).send({ error: 'Canje no encontrado' });
    const c = cR.recordset[0];
    if (c.Status !== 'PENDIENTE') return reply.code(409).send({ error: `El canje ya está ${c.Status}` });

    await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idCanje', sql.BigInt, idCanje).input('Status', sql.VarChar(20), Status)
      .query(`UPDATE VIDA_PREMIOS_CANJES SET Status=@Status, FechaMod=GETDATE() WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCanje=@idCanje`);

    // Si se cancela, devolver puntos y reponer stock
    if (Status === 'CANCELADO') {
      await movPuntos(pool, idBranch, idCuenta, c.idCliente, c.CostoPuntos, 'REEMBOLSO', `Reverso canje ${c.Codigo}`);
      await pool.request()
        .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idPremio', sql.BigInt, c.idPremio)
        .query(`UPDATE VIDA_PREMIOS SET Stock = CASE WHEN Stock = -1 THEN -1 ELSE Stock + 1 END
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPremio=@idPremio`);
    }
    return reply.send({ ok: true, status: Status });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al cambiar el estado del canje' }); }
}

// ── CRUD de catálogo de premios (corporativo) ─────────────────────────────
// GET /delivery/admin/premios/catalogo
export async function listarPremiosCatalogo(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();
    const r = await pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT idPremio, Nombre, Descripcion, CostoPuntos, Stock, ImagenUrl, Orden, Status
              FROM VIDA_PREMIOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta ORDER BY Orden, idPremio`);
    return reply.send(r.recordset);
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al listar premios' }); }
}
// POST /delivery/admin/premios
export async function crearPremio(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const b = request.body || {};
  if (!b.Nombre?.trim()) return reply.code(400).send({ error: 'El nombre es obligatorio' });
  try {
    const pool = await getPool();
    const id = await nextId(pool, 'VIDA_PREMIOS', 'idPremio', idBranch, idCuenta);
    await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idPremio', sql.BigInt, id)
      .input('Nombre', sql.VarChar(150), b.Nombre.trim()).input('Descripcion', sql.VarChar(500), b.Descripcion || null)
      .input('CostoPuntos', sql.Int, parseInt(b.CostoPuntos) || 0).input('Stock', sql.Int, b.Stock === '' || b.Stock == null ? -1 : parseInt(b.Stock))
      .input('ImagenUrl', sql.VarChar(400), b.ImagenUrl || null).input('Orden', sql.Int, parseInt(b.Orden) || 0)
      .query(`INSERT INTO VIDA_PREMIOS (idBranch,idCuenta,idPremio,Nombre,Descripcion,CostoPuntos,Stock,ImagenUrl,Orden,Status)
              VALUES (@idBranch,@idCuenta,@idPremio,@Nombre,@Descripcion,@CostoPuntos,@Stock,@ImagenUrl,@Orden,'ACTIVO')`);
    return reply.code(201).send({ idPremio: id });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al crear premio' }); }
}
// PUT /delivery/admin/premios/:idPremio
export async function editarPremio(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idPremio } = request.params;
  const b = request.body || {};
  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idPremio', sql.BigInt, idPremio)
      .input('Nombre', sql.VarChar(150), b.Nombre?.trim() || null).input('Descripcion', sql.VarChar(500), b.Descripcion || null)
      .input('CostoPuntos', sql.Int, parseInt(b.CostoPuntos) || 0).input('Stock', sql.Int, b.Stock === '' || b.Stock == null ? -1 : parseInt(b.Stock))
      .input('ImagenUrl', sql.VarChar(400), b.ImagenUrl || null).input('Orden', sql.Int, parseInt(b.Orden) || 0)
      .input('Status', sql.VarChar(20), b.Status || 'ACTIVO')
      .query(`UPDATE VIDA_PREMIOS SET Nombre=@Nombre, Descripcion=@Descripcion, CostoPuntos=@CostoPuntos,
                Stock=@Stock, ImagenUrl=@ImagenUrl, Orden=@Orden, Status=@Status
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPremio=@idPremio`);
    return reply.send({ ok: true });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al editar premio' }); }
}
// DELETE /delivery/admin/premios/:idPremio  (soft delete)
export async function eliminarPremio(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idPremio } = request.params;
  try {
    const pool = await getPool();
    await pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idPremio', sql.BigInt, idPremio)
      .query(`UPDATE VIDA_PREMIOS SET Status='INACTIVO' WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPremio=@idPremio`);
    return reply.send({ ok: true });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al eliminar premio' }); }
}

// Núcleo del vencimiento para UN tenant. Reutilizado por el endpoint HTTP y
// por el job programado. Devuelve { meses, expirados }.
export async function expirarPuntosInactivosCore(pool, idBranch, idCuenta) {
  const meses = parseInt(await getConfigVal(pool, idBranch, idCuenta, 'MesesInactividadVence', '12')) || 0;
  if (meses <= 0) return { meses, expirados: 0, desactivado: true };

  // Clientes con saldo > 0 y sin movimientos en los últimos N meses
  const cR = await pool.request()
    .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('meses', sql.Int, meses)
    .query(`SELECT c.idCliente, ISNULL(c.PuntosSaldo,0) AS Saldo
            FROM VIDA_APP_CLIENTES c
            WHERE c.idBranch=@idBranch AND c.idCuenta=@idCuenta AND ISNULL(c.PuntosSaldo,0) > 0
              AND ISNULL((SELECT MAX(FechaAlta) FROM VIDA_CLIENTE_PUNTOS p
                          WHERE p.idBranch=c.idBranch AND p.idCuenta=c.idCuenta AND p.idCliente=c.idCliente),
                         '1900-01-01') < DATEADD(MONTH, -@meses, GETDATE())`);
  let expirados = 0;
  for (const cli of cR.recordset) {
    await movPuntos(pool, idBranch, idCuenta, cli.idCliente, -cli.Saldo, 'VENCIDO', `Vencimiento por ${meses} meses de inactividad`);
    expirados++;
  }
  return { meses, expirados };
}

// POST /delivery/admin/puntos/expirar-inactivos   (disparo manual desde el panel)
export async function expirarPuntosInactivos(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();
    const r = await expirarPuntosInactivosCore(pool, idBranch, idCuenta);
    return reply.send(r.desactivado
      ? { meses: r.meses, expirados: 0, mensaje: 'Vencimiento desactivado' }
      : { meses: r.meses, expirados: r.expirados });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al expirar puntos' }); }
}

// Job programado: expira puntos inactivos en TODOS los tenants con clientes.
// Idempotente: al expirar se registra un movimiento VENCIDO (que actualiza la
// última actividad) y el saldo queda en 0, así que el cliente no se re-expira.
export async function expirarPuntosInactivosJob(pool, log) {
  const tenants = await pool.request().query(
    `SELECT DISTINCT idBranch, idCuenta FROM VIDA_APP_CLIENTES`);
  let totalExpirados = 0, tenantsConVencimiento = 0;
  for (const t of tenants.recordset) {
    try {
      const r = await expirarPuntosInactivosCore(pool, t.idBranch, t.idCuenta);
      if (r.expirados > 0) {
        tenantsConVencimiento++;
        totalExpirados += r.expirados;
        log?.info(`[puntos] vencimiento tenant (${t.idBranch},${t.idCuenta}): ${r.expirados} cliente(s), ${r.meses} meses`);
      }
    } catch (e) {
      log?.error(`[puntos] error en vencimiento tenant (${t.idBranch},${t.idCuenta}): ${e.message}`);
    }
  }
  if (totalExpirados > 0)
    log?.info(`[puntos] vencimiento total: ${totalExpirados} cliente(s) en ${tenantsConVencimiento} tenant(s)`);
  return { totalExpirados, tenantsConVencimiento };
}
