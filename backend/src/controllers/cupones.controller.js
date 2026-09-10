// src/controllers/cupones.controller.js
// Cupones: códigos de descuento canjeables en el checkout (sql/32).
// A diferencia de las promociones (que se aplican solas), el cupón requiere que
// el cliente ingrese un CÓDIGO y tiene límites de uso (global y por cliente).
import { getPool, sql } from '../db/sqlserver.js';

const TIPOS    = ['DESCUENTO_PCT', 'DESCUENTO_USD'];
const ALCANCES = ['TODO', 'CATEGORIA', 'PRODUCTO'];
const CANALES  = ['TODO', 'POS', 'DELIVERY'];

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

const normCodigo = (c) => String(c || '').trim().toUpperCase().slice(0, 40);

// ─── Motor de evaluación ─────────────────────────────────────────────────────
// Decide si un cupón aplica y cuánto descuenta, dado el subtotal y el canal.
// `items` (opcional) permite recomputar el subtotal elegible cuando el cupón es
// por producto/categoría: [{ idProducto, idCategoria, subtotal }]
// Devuelve { ok, descuento, motivo }.
export function evaluarCupon(cupon, { subtotal, canal, items } = {}) {
  if (!cupon) return { ok: false, descuento: 0, motivo: 'Cupón no encontrado' };
  if (cupon.Status !== 'ACTIVO') return { ok: false, descuento: 0, motivo: 'Cupón inactivo' };

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  if (cupon.FechaInicio && new Date(cupon.FechaInicio) > hoy)
    return { ok: false, descuento: 0, motivo: 'El cupón aún no está vigente' };
  if (cupon.FechaFin && new Date(cupon.FechaFin) < hoy)
    return { ok: false, descuento: 0, motivo: 'El cupón está vencido' };

  if (cupon.Canal && cupon.Canal !== 'TODO' && canal && cupon.Canal !== canal)
    return { ok: false, descuento: 0, motivo: `Cupón válido solo en ${cupon.Canal}` };

  if (cupon.UsosMax != null && Number(cupon.UsosActuales) >= Number(cupon.UsosMax))
    return { ok: false, descuento: 0, motivo: 'El cupón agotó sus usos' };

  // Base sobre la que aplica el descuento: si el cupón es por producto/categoría
  // y nos dieron el detalle, sumamos solo los items elegibles.
  let base = Number(subtotal) || 0;
  if (cupon.Alcance !== 'TODO' && Array.isArray(items) && items.length) {
    base = items.reduce((acc, it) => {
      const aplica =
        (cupon.Alcance === 'PRODUCTO'  && String(it.idProducto)  === String(cupon.idProducto)) ||
        (cupon.Alcance === 'CATEGORIA' && String(it.idCategoria) === String(cupon.idCategoria));
      return acc + (aplica ? (Number(it.subtotal) || 0) : 0);
    }, 0);
    if (base <= 0) return { ok: false, descuento: 0, motivo: 'El cupón no aplica a estos productos' };
  }

  if (cupon.MinCompra != null && (Number(subtotal) || 0) < Number(cupon.MinCompra))
    return { ok: false, descuento: 0, motivo: `Compra mínima de $${Number(cupon.MinCompra).toFixed(2)}` };

  let descuento = 0;
  if (cupon.Tipo === 'DESCUENTO_PCT') descuento = base * (Number(cupon.Valor) / 100);
  else if (cupon.Tipo === 'DESCUENTO_USD') descuento = Number(cupon.Valor);

  if (cupon.MaxDescuento != null) descuento = Math.min(descuento, Number(cupon.MaxDescuento));
  // Nunca descontar más que el subtotal total del pedido
  descuento = Math.min(descuento, Number(subtotal) || 0);
  descuento = +Math.max(0, descuento).toFixed(2);

  if (descuento <= 0) return { ok: false, descuento: 0, motivo: 'El cupón no genera descuento' };
  return { ok: true, descuento, motivo: 'OK' };
}

async function buscarCuponPorCodigo(pool, idBranch, idCuenta, codigo) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .input('Codigo',   sql.VarChar(40), normCodigo(codigo))
    .query(`SELECT TOP 1 * FROM VIDA_CUPONES
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Codigo=@Codigo`);
  return r.recordset[0] || null;
}

async function usosDelCliente(pool, idBranch, idCuenta, idCupon, idCliente) {
  if (!idCliente) return 0;
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .input('idCupon',  sql.BigInt, idCupon)
    .input('idCliente',sql.BigInt, idCliente)
    .query(`SELECT COUNT(*) AS n FROM VIDA_CUPONES_USOS
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCupon=@idCupon AND idCliente=@idCliente`);
  return r.recordset[0].n;
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN / PANEL — CRUD
// ══════════════════════════════════════════════════════════════════════════
export async function listarCupones(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT * FROM VIDA_CUPONES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
              ORDER BY Status ASC, FechaAlta DESC`);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al listar cupones' });
  }
}

export async function crearCupon(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const b = request.body || {};
  const Codigo = normCodigo(b.Codigo);
  const Nombre = String(b.Nombre || '').trim();
  const Tipo   = String(b.Tipo || '').trim();
  const Valor  = parseFloat(b.Valor);

  if (!Codigo)  return reply.code(400).send({ error: 'Código es requerido' });
  if (!Nombre)  return reply.code(400).send({ error: 'Nombre es requerido' });
  if (!TIPOS.includes(Tipo)) return reply.code(400).send({ error: `Tipo inválido (${TIPOS.join('|')})` });
  if (!(Valor > 0)) return reply.code(400).send({ error: 'Valor debe ser mayor a 0' });
  if (Tipo === 'DESCUENTO_PCT' && Valor > 100) return reply.code(400).send({ error: 'El porcentaje no puede superar 100' });

  const Alcance = ALCANCES.includes(b.Alcance) ? b.Alcance : 'TODO';
  const Canal   = CANALES.includes(b.Canal) ? b.Canal : 'TODO';
  if (Alcance === 'PRODUCTO'  && !b.idProducto)  return reply.code(400).send({ error: 'idProducto requerido para alcance PRODUCTO' });
  if (Alcance === 'CATEGORIA' && !b.idCategoria) return reply.code(400).send({ error: 'idCategoria requerido para alcance CATEGORIA' });

  try {
    const pool = await getPool();
    if (await buscarCuponPorCodigo(pool, idBranch, idCuenta, Codigo))
      return reply.code(409).send({ error: 'Ya existe un cupón con ese código' });

    const idCupon = await nextId(pool, 'VIDA_CUPONES', 'idCupon', idBranch, idCuenta);
    await pool.request()
      .input('idBranch',      sql.BigInt,       idBranch)
      .input('idCuenta',      sql.BigInt,       idCuenta)
      .input('idCupon',       sql.BigInt,       idCupon)
      .input('Codigo',        sql.VarChar(40),  Codigo)
      .input('Nombre',        sql.VarChar(150), Nombre)
      .input('Tipo',          sql.VarChar(20),  Tipo)
      .input('Valor',         sql.Decimal(18,4),Valor)
      .input('MinCompra',     sql.Decimal(18,4),b.MinCompra != null ? parseFloat(b.MinCompra) : null)
      .input('MaxDescuento',  sql.Decimal(18,4),b.MaxDescuento != null ? parseFloat(b.MaxDescuento) : null)
      .input('Alcance',       sql.VarChar(20),  Alcance)
      .input('idCategoria',   sql.BigInt,       Alcance === 'CATEGORIA' ? b.idCategoria : null)
      .input('idProducto',    sql.BigInt,       Alcance === 'PRODUCTO'  ? b.idProducto  : null)
      .input('Canal',         sql.VarChar(20),  Canal)
      .input('FechaInicio',   sql.Date,         b.FechaInicio || null)
      .input('FechaFin',      sql.Date,         b.FechaFin || null)
      .input('UsosMax',       sql.Int,          b.UsosMax != null && b.UsosMax !== '' ? parseInt(b.UsosMax) : null)
      .input('UsosPorCliente',sql.Int,          b.UsosPorCliente != null && b.UsosPorCliente !== '' ? parseInt(b.UsosPorCliente) : null)
      .input('Descripcion',   sql.VarChar(300), b.Descripcion || null)
      .input('UsuAlta',       sql.VarChar(30),  String(idUsuario))
      .query(`INSERT INTO VIDA_CUPONES
                (idBranch,idCuenta,idCupon,Codigo,Nombre,Tipo,Valor,MinCompra,MaxDescuento,
                 Alcance,idCategoria,idProducto,Canal,FechaInicio,FechaFin,UsosMax,UsosPorCliente,
                 UsosActuales,Descripcion,Status,UsuAlta)
              VALUES
                (@idBranch,@idCuenta,@idCupon,@Codigo,@Nombre,@Tipo,@Valor,@MinCompra,@MaxDescuento,
                 @Alcance,@idCategoria,@idProducto,@Canal,@FechaInicio,@FechaFin,@UsosMax,@UsosPorCliente,
                 0,@Descripcion,'ACTIVO',@UsuAlta)`);

    return reply.code(201).send({ idCupon, Codigo, mensaje: 'Cupón creado' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al crear cupón' });
  }
}

export async function editarCupon(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idCupon } = request.params;
  const b = request.body || {};

  const sets = [];
  const reqDb = (await getPool()).request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .input('idCupon',  sql.BigInt, BigInt(idCupon));

  const campos = {
    Nombre: sql.VarChar(150), Tipo: sql.VarChar(20), Valor: sql.Decimal(18,4),
    MinCompra: sql.Decimal(18,4), MaxDescuento: sql.Decimal(18,4),
    Alcance: sql.VarChar(20), idCategoria: sql.BigInt, idProducto: sql.BigInt,
    Canal: sql.VarChar(20), FechaInicio: sql.Date, FechaFin: sql.Date,
    UsosMax: sql.Int, UsosPorCliente: sql.Int, Descripcion: sql.VarChar(300),
    Status: sql.VarChar(20),
  };
  const DECIMALES = ['Valor', 'MinCompra', 'MaxDescuento'];
  const ENTEROS   = ['UsosMax', 'UsosPorCliente', 'idCategoria', 'idProducto'];

  try {
    for (const [campo, tipo] of Object.entries(campos)) {
      if (b[campo] === undefined) continue;
      let val = b[campo];
      if (val === '') val = null;
      if (val !== null && DECIMALES.includes(campo)) val = parseFloat(val);
      if (val !== null && ENTEROS.includes(campo))   val = parseInt(val);
      if (campo === 'Tipo'    && val && !TIPOS.includes(val))    return reply.code(400).send({ error: 'Tipo inválido' });
      if (campo === 'Alcance' && val && !ALCANCES.includes(val)) return reply.code(400).send({ error: 'Alcance inválido' });
      if (campo === 'Canal'   && val && !CANALES.includes(val))  return reply.code(400).send({ error: 'Canal inválido' });
      reqDb.input(campo, tipo, val);
      sets.push(`${campo}=@${campo}`);
    }
    if (!sets.length) return reply.code(400).send({ error: 'Nada que actualizar' });

    const r = await reqDb.query(`UPDATE VIDA_CUPONES SET ${sets.join(', ')}
             WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCupon=@idCupon`);
    if (r.rowsAffected[0] === 0) return reply.code(404).send({ error: 'Cupón no encontrado' });
    return reply.send({ mensaje: 'Cupón actualizado' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al editar cupón' });
  }
}

export async function eliminarCupon(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idCupon } = request.params;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idCupon',  sql.BigInt, BigInt(idCupon))
      .query(`UPDATE VIDA_CUPONES SET Status='INACTIVO'
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCupon=@idCupon`);
    if (r.rowsAffected[0] === 0) return reply.code(404).send({ error: 'Cupón no encontrado' });
    return reply.send({ mensaje: 'Cupón desactivado' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al desactivar cupón' });
  }
}

export async function usosCupon(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idCupon } = request.params;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idCupon',  sql.BigInt, BigInt(idCupon))
      .query(`SELECT TOP 200 idUso, Codigo, idCliente, idPedido, Canal, DescuentoUSD, FechaAlta
              FROM VIDA_CUPONES_USOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCupon=@idCupon
              ORDER BY FechaAlta DESC`);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al consultar usos' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// VALIDACIÓN (preview) — panel/POS
// ══════════════════════════════════════════════════════════════════════════
export async function validarCuponPOS(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { codigo, subtotal, items } = request.body || {};
  if (!codigo) return reply.code(400).send({ error: 'codigo es requerido' });
  try {
    const pool = await getPool();
    const cupon = await buscarCuponPorCodigo(pool, idBranch, idCuenta, codigo);
    const res = evaluarCupon(cupon, { subtotal, canal: 'POS', items });
    return reply.send({
      valido: res.ok, descuento: res.descuento, motivo: res.motivo,
      cupon: cupon ? { Codigo: cupon.Codigo, Nombre: cupon.Nombre, Tipo: cupon.Tipo, Valor: cupon.Valor } : null,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al validar cupón' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE (app) — validar preview + aplicar a un pedido existente
// ══════════════════════════════════════════════════════════════════════════
export async function validarCuponCliente(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const { codigo, subtotal, items } = request.body || {};
  if (!codigo) return reply.code(400).send({ error: 'codigo es requerido' });
  try {
    const pool = await getPool();
    const cupon = await buscarCuponPorCodigo(pool, idBranch, idCuenta, codigo);
    let res = evaluarCupon(cupon, { subtotal, canal: 'DELIVERY', items });

    // Límite por cliente
    if (res.ok && cupon.UsosPorCliente != null) {
      const usados = await usosDelCliente(pool, idBranch, idCuenta, cupon.idCupon, idCliente);
      if (usados >= Number(cupon.UsosPorCliente))
        res = { ok: false, descuento: 0, motivo: 'Ya usaste este cupón' };
    }
    return reply.send({
      valido: res.ok, descuento: res.descuento, motivo: res.motivo,
      cupon: cupon ? { Codigo: cupon.Codigo, Nombre: cupon.Nombre, Tipo: cupon.Tipo, Valor: cupon.Valor } : null,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al validar cupón' });
  }
}

// POST /delivery/cliente/cupones/aplicar { codigo, idPedido }
// Valida contra el TotalUSD actual del pedido, registra el uso, ajusta el total
// y el contador — todo en una transacción, idempotente por (cupón, pedido).
export async function aplicarCuponPedido(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const { codigo, idPedido } = request.body || {};
  if (!codigo || !idPedido) return reply.code(400).send({ error: 'codigo e idPedido son requeridos' });

  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  let enTx = false;
  try {
    // Cupón con lock (para leer UsosActuales consistente)
    const cuponR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('Codigo',   sql.VarChar(40), normCodigo(codigo))
      .query(`SELECT TOP 1 * FROM VIDA_CUPONES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Codigo=@Codigo`);
    const cupon = cuponR.recordset[0];
    if (!cupon) return reply.code(404).send({ error: 'Cupón no encontrado' });

    // Pedido del cliente
    const pedR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idPedido', sql.BigInt, BigInt(idPedido))
      .query(`SELECT TOP 1 idPedido, idCliente, Status, StatusPago, TotalUSD, CuponCodigo, Canal
              FROM VIDA_PEDIDOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);
    const pedido = pedR.recordset[0];
    if (!pedido) return reply.code(404).send({ error: 'Pedido no encontrado' });
    if (String(pedido.idCliente) !== String(idCliente))
      return reply.code(403).send({ error: 'El pedido no pertenece al cliente' });
    if (pedido.CuponCodigo)
      return reply.code(409).send({ error: 'El pedido ya tiene un cupón aplicado' });
    // El cupón baja lo que se cobra: solo aplica mientras el pago siga pendiente
    // y el pedido no esté finalizado.
    if (['ENTREGADO', 'CANCELADO', 'RECHAZADO'].includes(pedido.Status))
      return reply.code(409).send({ error: 'El pedido ya no admite cupón' });
    if (pedido.StatusPago === 'PAGADO')
      return reply.code(409).send({ error: 'El pedido ya fue pagado' });

    // El subtotal a evaluar es el total vigente (ya trae, si acaso, el descuento
    // de puntos aplicado en la creación del pedido).
    const subtotal = parseFloat(pedido.TotalUSD);
    const evalRes = evaluarCupon(cupon, { subtotal, canal: 'DELIVERY' });
    if (!evalRes.ok) return reply.code(422).send({ error: evalRes.motivo });

    // Límite por cliente
    if (cupon.UsosPorCliente != null) {
      const usados = await usosDelCliente(pool, idBranch, idCuenta, cupon.idCupon, idCliente);
      if (usados >= Number(cupon.UsosPorCliente))
        return reply.code(409).send({ error: 'Ya usaste este cupón' });
    }

    const descuento = evalRes.descuento;
    const nuevoTotal = +Math.max(0, subtotal - descuento).toFixed(2);

    await tx.begin(); enTx = true;

    // Límite global atómico: solo incrementa si aún hay cupos
    const incR = await new sql.Request(tx)
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idCupon',  sql.BigInt, cupon.idCupon)
      .query(`UPDATE VIDA_CUPONES SET UsosActuales = UsosActuales + 1
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCupon=@idCupon
                AND (UsosMax IS NULL OR UsosActuales < UsosMax)`);
    if (incR.rowsAffected[0] === 0) {
      await tx.rollback(); enTx = false;
      return reply.code(409).send({ error: 'El cupón agotó sus usos' });
    }

    // Aplica al pedido exigiendo que siga sin cupón (evita doble aplicación)
    const updR = await new sql.Request(tx)
      .input('idBranch',   sql.BigInt,       idBranch)
      .input('idCuenta',   sql.BigInt,       idCuenta)
      .input('idPedido',   sql.BigInt,       BigInt(idPedido))
      .input('Codigo',     sql.VarChar(40),  cupon.Codigo)
      .input('Descuento',  sql.Decimal(18,4),descuento)
      .input('NuevoTotal', sql.Decimal(18,4),nuevoTotal)
      .query(`UPDATE VIDA_PEDIDOS
                SET TotalUSD=@NuevoTotal, CuponCodigo=@Codigo, CuponDescuentoUSD=@Descuento, FechaMod=GETDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido
                AND CuponCodigo IS NULL`);
    if (updR.rowsAffected[0] === 0) {
      await tx.rollback(); enTx = false;
      return reply.code(409).send({ error: 'El pedido ya tiene un cupón aplicado' });
    }

    // Ledger de uso (idempotente por índice único cupón+pedido)
    const idUso = await nextIdTx(tx, 'VIDA_CUPONES_USOS', 'idUso', idBranch, idCuenta);
    await new sql.Request(tx)
      .input('idBranch',  sql.BigInt,       idBranch)
      .input('idCuenta',  sql.BigInt,       idCuenta)
      .input('idUso',     sql.BigInt,       idUso)
      .input('idCupon',   sql.BigInt,       cupon.idCupon)
      .input('Codigo',    sql.VarChar(40),  cupon.Codigo)
      .input('idCliente', sql.BigInt,       idCliente)
      .input('idPedido',  sql.BigInt,       BigInt(idPedido))
      .input('Canal',     sql.VarChar(20),  'DELIVERY')
      .input('Descuento', sql.Decimal(18,4),descuento)
      .input('UsuAlta',   sql.VarChar(30),  String(idCliente))
      .query(`INSERT INTO VIDA_CUPONES_USOS
                (idBranch,idCuenta,idUso,idCupon,Codigo,idCliente,idPedido,Canal,DescuentoUSD,UsuAlta)
              VALUES
                (@idBranch,@idCuenta,@idUso,@idCupon,@Codigo,@idCliente,@idPedido,@Canal,@Descuento,@UsuAlta)`);

    await tx.commit(); enTx = false;
    return reply.send({ mensaje: 'Cupón aplicado', codigo: cupon.Codigo, descuento, TotalUSD: nuevoTotal });
  } catch (err) {
    if (enTx) { try { await tx.rollback(); } catch {} }
    // Colisión del índice único = ya se aplicó ese cupón a ese pedido (idempotente)
    if (err.number === 2601 || err.number === 2627)
      return reply.code(409).send({ error: 'El cupón ya fue aplicado a este pedido' });
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al aplicar cupón' });
  }
}
