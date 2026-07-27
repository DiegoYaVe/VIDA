// src/controllers/promociones.controller.js
// Promociones: descuentos y combos (T-0049).
import { getPool, sql } from '../db/sqlserver.js';

async function nextId(pool, tabla, campo, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}),0)+1 AS nextId FROM ${tabla}
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
  return r.recordset[0].nextId;
}

const TIPOS = ['DESCUENTO_PCT', 'DESCUENTO_USD', 'PRECIO_ESPECIAL', 'NXM'];
const ALCANCES = ['TODO', 'CATEGORIA', 'PRODUCTO'];

// ─── Helper de negocio: promos vigentes de la cuenta ──────────────────────────
// Devuelve las promociones ACTIVAS y dentro de su rango de fechas.
export async function promocionesVigentes(pool, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT idPromocion, Nombre, Tipo, Valor, Valor2, Alcance, idCategoria, idProducto
            FROM VIDA_PROMOCIONES
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO'
              AND (FechaInicio IS NULL OR FechaInicio <= CAST(GETDATE() AS DATE))
              AND (FechaFin    IS NULL OR FechaFin    >= CAST(GETDATE() AS DATE))`);
  return r.recordset;
}

// ¿Aplica esta promo a este producto?
function promoAplicaA(promo, producto) {
  if (promo.Alcance === 'TODO') return true;
  if (promo.Alcance === 'PRODUCTO')  return String(promo.idProducto)  === String(producto.idProducto);
  if (promo.Alcance === 'CATEGORIA') return String(promo.idCategoria) === String(producto.idCategoria);
  return false;
}

// Escoge la mejor promo por-unidad para un producto (la que deja el precio más
// bajo). Los combos NXM se manejan aparte porque dependen de la cantidad.
export function mejorPromoUnitaria(promos, producto) {
  const precio = parseFloat(producto.PrecioUSD || 0);
  let mejor = null;
  let mejorPrecio = precio;
  for (const p of promos) {
    if (p.Tipo === 'NXM') continue;
    if (!promoAplicaA(p, producto)) continue;
    let nuevo = precio;
    if (p.Tipo === 'DESCUENTO_PCT')   nuevo = precio * (1 - parseFloat(p.Valor) / 100);
    if (p.Tipo === 'DESCUENTO_USD')   nuevo = precio - parseFloat(p.Valor);
    if (p.Tipo === 'PRECIO_ESPECIAL') nuevo = parseFloat(p.Valor);
    nuevo = Math.max(0, nuevo);
    if (nuevo < mejorPrecio) { mejorPrecio = nuevo; mejor = p; }
  }
  return mejor ? { promo: mejor, precioUnitario: +mejorPrecio.toFixed(4) } : null;
}

// Combo NXM aplicable a un producto (el de mayor N que aplique)
function comboNXM(promos, producto) {
  const candidatos = promos.filter(p => p.Tipo === 'NXM' && promoAplicaA(p, producto));
  if (!candidatos.length) return null;
  // el de mayor "paga menos por grupo" (mejor descuento relativo)
  return candidatos.sort((a, b) =>
    (parseFloat(b.Valor) - parseFloat(b.Valor2)) - (parseFloat(a.Valor) - parseFloat(a.Valor2)))[0];
}

// Calcula el subtotal de una línea aplicando la mejor promo disponible.
// Devuelve { subtotal, precioUnitarioBase, promoAplicada }.
export function calcularLinea(promos, producto, cantidad) {
  const precioBase = parseFloat(producto.PrecioUSD || 0);
  const cant = parseInt(cantidad) || 0;

  // Combo NXM primero (suele ser mejor a cierta cantidad)
  const combo = comboNXM(promos, producto);
  const unit = mejorPromoUnitaria(promos, producto);

  let subtotalUnit = unit ? unit.precioUnitario * cant : precioBase * cant;
  let subtotalCombo = Infinity;
  if (combo) {
    const N = parseInt(combo.Valor), M = parseInt(combo.Valor2);
    if (N > 0 && M > 0 && M < N) {
      const grupos = Math.floor(cant / N);
      const resto  = cant % N;
      const pagadas = grupos * M + resto;
      subtotalCombo = pagadas * precioBase;
    }
  }

  if (subtotalCombo < subtotalUnit) {
    return { subtotal: +subtotalCombo.toFixed(4), precioUnitarioBase: precioBase, promoAplicada: combo };
  }
  return {
    subtotal: +subtotalUnit.toFixed(4),
    precioUnitarioBase: precioBase,
    promoAplicada: unit ? unit.promo : null,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — LISTAR PROMOCIONES
// GET /promociones
// ══════════════════════════════════════════════════════════════════════════
export async function listarPromociones(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT pr.*, cat.Nombre AS NombreCategoria, prod.Nombre AS NombreProducto,
                     CASE WHEN pr.Status='ACTIVO'
                            AND (pr.FechaInicio IS NULL OR pr.FechaInicio <= CAST(GETDATE() AS DATE))
                            AND (pr.FechaFin    IS NULL OR pr.FechaFin    >= CAST(GETDATE() AS DATE))
                          THEN 1 ELSE 0 END AS Vigente
              FROM VIDA_PROMOCIONES pr
              LEFT JOIN VIDA_INVENTARIO_CATEGORIAS cat
                ON cat.idBranch=pr.idBranch AND cat.idCuenta=pr.idCuenta AND cat.idCategoria=pr.idCategoria
              LEFT JOIN VIDA_INVENTARIO_PRODUCTOS prod
                ON prod.idBranch=pr.idBranch AND prod.idCuenta=pr.idCuenta AND prod.idProducto=pr.idProducto
              WHERE pr.idBranch=@idBranch AND pr.idCuenta=@idCuenta
              ORDER BY pr.Status, pr.FechaAlta DESC`);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al listar promociones' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — CREAR PROMOCIÓN
// POST /promociones
// ══════════════════════════════════════════════════════════════════════════
export async function crearPromocion(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { Nombre, Tipo, Valor, Valor2, Alcance = 'TODO',
          idCategoria, idProducto, FechaInicio, FechaFin, Descripcion } = request.body || {};

  if (!Nombre?.trim())          return reply.code(400).send({ error: 'El nombre es obligatorio' });
  if (!TIPOS.includes(Tipo))    return reply.code(400).send({ error: 'Tipo de promoción inválido' });
  if (!ALCANCES.includes(Alcance)) return reply.code(400).send({ error: 'Alcance inválido' });
  if (Valor == null || isNaN(parseFloat(Valor))) return reply.code(400).send({ error: 'Valor inválido' });
  if (Tipo === 'NXM' && (Valor2 == null || parseInt(Valor2) >= parseInt(Valor)))
    return reply.code(400).send({ error: 'En NxM, "paga" (M) debe ser menor que "lleva" (N)' });
  if (Alcance === 'CATEGORIA' && !idCategoria) return reply.code(400).send({ error: 'Selecciona una categoría' });
  if (Alcance === 'PRODUCTO'  && !idProducto)  return reply.code(400).send({ error: 'Selecciona un producto' });

  try {
    const pool = await getPool();
    const idPromocion = await nextId(pool, 'VIDA_PROMOCIONES', 'idPromocion', idBranch, idCuenta);
    await pool.request()
      .input('idBranch',    sql.BigInt,       idBranch)
      .input('idCuenta',    sql.BigInt,       idCuenta)
      .input('idPromocion', sql.BigInt,       idPromocion)
      .input('Nombre',      sql.VarChar(150), Nombre.trim())
      .input('Tipo',        sql.VarChar(20),  Tipo)
      .input('Valor',       sql.Decimal(18,4), parseFloat(Valor))
      .input('Valor2',      sql.Decimal(18,4), Valor2 != null ? parseFloat(Valor2) : null)
      .input('Alcance',     sql.VarChar(20),  Alcance)
      .input('idCategoria', sql.BigInt,       Alcance === 'CATEGORIA' ? idCategoria : null)
      .input('idProducto',  sql.BigInt,       Alcance === 'PRODUCTO'  ? idProducto  : null)
      .input('FechaInicio', sql.Date,         FechaInicio || null)
      .input('FechaFin',    sql.Date,         FechaFin || null)
      .input('Descripcion', sql.VarChar(300), Descripcion?.trim() || null)
      .input('UsuAlta',     sql.VarChar(30),  `U:${idUsuario}`)
      .query(`INSERT INTO VIDA_PROMOCIONES
                (idBranch,idCuenta,idPromocion,Nombre,Tipo,Valor,Valor2,Alcance,
                 idCategoria,idProducto,FechaInicio,FechaFin,Descripcion,UsuAlta)
              VALUES
                (@idBranch,@idCuenta,@idPromocion,@Nombre,@Tipo,@Valor,@Valor2,@Alcance,
                 @idCategoria,@idProducto,@FechaInicio,@FechaFin,@Descripcion,@UsuAlta)`);
    return reply.code(201).send({ idPromocion });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al crear la promoción' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — EDITAR PROMOCIÓN
// PUT /promociones/:idPromocion
// ══════════════════════════════════════════════════════════════════════════
export async function editarPromocion(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idPromocion } = request.params;
  const { Nombre, Tipo, Valor, Valor2, Alcance, idCategoria, idProducto,
          FechaInicio, FechaFin, Descripcion, Status } = request.body || {};

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',    sql.BigInt,       idBranch)
      .input('idCuenta',    sql.BigInt,       idCuenta)
      .input('idPromocion', sql.BigInt,       idPromocion)
      .input('Nombre',      sql.VarChar(150), Nombre ?? null)
      .input('Tipo',        sql.VarChar(20),  Tipo ?? null)
      .input('Valor',       sql.Decimal(18,4), Valor != null ? parseFloat(Valor) : null)
      .input('Valor2',      sql.Decimal(18,4), Valor2 != null ? parseFloat(Valor2) : null)
      .input('Alcance',     sql.VarChar(20),  Alcance ?? null)
      .input('idCategoria', sql.BigInt,       Alcance === 'CATEGORIA' ? idCategoria : null)
      .input('idProducto',  sql.BigInt,       Alcance === 'PRODUCTO'  ? idProducto  : null)
      .input('FechaInicio', sql.Date,         FechaInicio || null)
      .input('FechaFin',    sql.Date,         FechaFin || null)
      .input('Descripcion', sql.VarChar(300), Descripcion ?? null)
      .input('Status',      sql.VarChar(20),  Status ?? null)
      .query(`UPDATE VIDA_PROMOCIONES SET
                Nombre      = COALESCE(@Nombre, Nombre),
                Tipo        = COALESCE(@Tipo, Tipo),
                Valor       = COALESCE(@Valor, Valor),
                Valor2      = @Valor2,
                Alcance     = COALESCE(@Alcance, Alcance),
                idCategoria = @idCategoria,
                idProducto  = @idProducto,
                FechaInicio = @FechaInicio,
                FechaFin    = @FechaFin,
                Descripcion = COALESCE(@Descripcion, Descripcion),
                Status      = COALESCE(@Status, Status)
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPromocion=@idPromocion`);
    return reply.send({ ok: true });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al editar la promoción' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — ELIMINAR (soft) PROMOCIÓN
// DELETE /promociones/:idPromocion
// ══════════════════════════════════════════════════════════════════════════
export async function eliminarPromocion(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idPromocion } = request.params;
  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('idPromocion', sql.BigInt, idPromocion)
      .query(`UPDATE VIDA_PROMOCIONES SET Status='INACTIVO'
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPromocion=@idPromocion`);
    return reply.send({ ok: true });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al eliminar la promoción' });
  }
}
