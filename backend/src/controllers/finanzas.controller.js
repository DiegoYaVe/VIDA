// src/controllers/finanzas.controller.js
// Calculadora de Rentabilidad por tienda: el empresario carga sus costos una vez
// y el sistema calcula punto de equilibrio, rentabilidad en 3 modos (Solo Plus /
// Mixto / Solo Normal) y meta diaria. Operación USD-only.
import { getPool, sql } from '../db/sqlserver.js';

const ROLES_RED = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO'];

// Punto de venta efectivo: roles de tienda quedan forzados al suyo; los de red
// pueden consultar/guardar el que pasen por query/body.
function pvEfectivo(request, pvExplicito) {
  const { TipoUsuario, idPuntoVenta } = request.user;
  const esRed = ROLES_RED.includes(TipoUsuario);
  return esRed ? (pvExplicito || idPuntoVenta) : idPuntoVenta;
}

const DEF = {
  CostosFijosMensualUSD: 0, PctComisionDelivery: 0, PctImpuestos: 0,
  PctPasarela: 0, InversionInicialUSD: 0, MetaGananciaMensualUSD: 0,
};

async function leerFinanzas(pool, idBranch, idCuenta, idPuntoVenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .input('idPuntoVenta', sql.BigInt, idPuntoVenta)
    .query(`SELECT CostosFijosMensualUSD, PctComisionDelivery, PctImpuestos,
                   PctPasarela, InversionInicialUSD, MetaGananciaMensualUSD
            FROM VIDA_TIENDA_FINANZAS
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@idPuntoVenta`);
  return r.recordset[0] ? { ...DEF, ...r.recordset[0] } : { ...DEF };
}

// GET /finanzas?idPuntoVenta=
export async function obtenerFinanzas(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const idPuntoVenta = pvEfectivo(request, request.query.idPuntoVenta);
  if (!idPuntoVenta) return reply.code(400).send({ error: 'Se requiere idPuntoVenta' });
  try {
    const pool = await getPool();
    const fin = await leerFinanzas(pool, idBranch, idCuenta, idPuntoVenta);
    return reply.send({ idPuntoVenta: Number(idPuntoVenta), ...fin });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener finanzas' });
  }
}

// PUT /finanzas  { idPuntoVenta?, CostosFijosMensualUSD, PctComisionDelivery, ... }
export async function guardarFinanzas(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const b = request.body || {};
  const idPuntoVenta = pvEfectivo(request, b.idPuntoVenta);
  if (!idPuntoVenta) return reply.code(400).send({ error: 'Se requiere idPuntoVenta' });

  const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? 0 : Number(v));
  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',     sql.BigInt,        idBranch)
      .input('idCuenta',     sql.BigInt,        idCuenta)
      .input('idPuntoVenta', sql.BigInt,        idPuntoVenta)
      .input('Fijos',        sql.Decimal(18,2), num(b.CostosFijosMensualUSD))
      .input('Delivery',     sql.Decimal(5,2),  num(b.PctComisionDelivery))
      .input('Impuestos',    sql.Decimal(5,2),  num(b.PctImpuestos))
      .input('Pasarela',     sql.Decimal(5,2),  num(b.PctPasarela))
      .input('Inversion',    sql.Decimal(18,2), num(b.InversionInicialUSD))
      .input('Meta',         sql.Decimal(18,2), num(b.MetaGananciaMensualUSD))
      .input('Usu',          sql.VarChar(20),   String(idUsuario))
      .query(`
        MERGE VIDA_TIENDA_FINANZAS AS t
        USING (SELECT @idBranch AS idBranch, @idCuenta AS idCuenta, @idPuntoVenta AS idPuntoVenta) AS s
          ON (t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.idPuntoVenta=s.idPuntoVenta)
        WHEN MATCHED THEN UPDATE SET
          CostosFijosMensualUSD=@Fijos, PctComisionDelivery=@Delivery, PctImpuestos=@Impuestos,
          PctPasarela=@Pasarela, InversionInicialUSD=@Inversion, MetaGananciaMensualUSD=@Meta,
          FechaMod=GETDATE(), UsuMod=@Usu
        WHEN NOT MATCHED THEN INSERT
          (idBranch,idCuenta,idPuntoVenta,CostosFijosMensualUSD,PctComisionDelivery,PctImpuestos,
           PctPasarela,InversionInicialUSD,MetaGananciaMensualUSD,UsuAlta)
          VALUES (@idBranch,@idCuenta,@idPuntoVenta,@Fijos,@Delivery,@Impuestos,
                  @Pasarela,@Inversion,@Meta,@Usu);`);
    return reply.send({ message: 'Finanzas guardadas' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al guardar finanzas' });
  }
}

// Métricas de un conjunto de productos dado el % de costos variables sobre venta
function metricasModo(productos, pctVar) {
  const items = productos.filter(p => Number(p.PrecioUSD) > 0);
  if (!items.length) return { nProductos: 0, precioProm: 0, margenBrutoPct: 0, margenContribPct: 0, contribProm: 0 };
  let precioSum = 0, brutoPctSum = 0, contribPctSum = 0, contribSum = 0;
  for (const p of items) {
    const precio = Number(p.PrecioUSD);
    const costo  = Number(p.CostoUSD || 0);
    const costoVar = precio * (pctVar / 100);
    const contrib  = precio - costo - costoVar;      // margen de contribución en $
    precioSum     += precio;
    brutoPctSum   += (precio - costo) / precio;       // margen bruto %
    contribPctSum += contrib / precio;                // margen de contribución %
    contribSum    += contrib;
  }
  const n = items.length;
  return {
    nProductos: n,
    precioProm: precioSum / n,
    margenBrutoPct: (brutoPctSum / n) * 100,
    margenContribPct: (contribPctSum / n) * 100,
    contribProm: contribSum / n,
  };
}

// ── METAS DE VENTA ────────────────────────────────────────────────────────
const DEF_METAS = { MetaDiariaUSD: 0, MetaSemanalUSD: 0, MetaMensualUSD: 0 };

async function leerMetas(pool, idBranch, idCuenta, idPuntoVenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .input('idPuntoVenta', sql.BigInt, idPuntoVenta)
    .query(`SELECT MetaDiariaUSD, MetaSemanalUSD, MetaMensualUSD
            FROM VIDA_TIENDA_METAS
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@idPuntoVenta`);
  return r.recordset[0] ? { ...DEF_METAS, ...r.recordset[0] } : { ...DEF_METAS };
}

// GET /metas?idPuntoVenta=
export async function obtenerMetas(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const idPuntoVenta = pvEfectivo(request, request.query.idPuntoVenta);
  if (!idPuntoVenta) return reply.code(400).send({ error: 'Se requiere idPuntoVenta' });
  try {
    const pool = await getPool();
    const metas = await leerMetas(pool, idBranch, idCuenta, idPuntoVenta);
    return reply.send({ idPuntoVenta: Number(idPuntoVenta), ...metas });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener metas' });
  }
}

// PUT /metas  { idPuntoVenta?, MetaDiariaUSD, MetaSemanalUSD, MetaMensualUSD }
export async function guardarMetas(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const b = request.body || {};
  const idPuntoVenta = pvEfectivo(request, b.idPuntoVenta);
  if (!idPuntoVenta) return reply.code(400).send({ error: 'Se requiere idPuntoVenta' });
  const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? 0 : Number(v));
  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',     sql.BigInt,        idBranch)
      .input('idCuenta',     sql.BigInt,        idCuenta)
      .input('idPuntoVenta', sql.BigInt,        idPuntoVenta)
      .input('Dia',          sql.Decimal(18,2), num(b.MetaDiariaUSD))
      .input('Sem',          sql.Decimal(18,2), num(b.MetaSemanalUSD))
      .input('Mes',          sql.Decimal(18,2), num(b.MetaMensualUSD))
      .input('Usu',          sql.VarChar(20),   String(idUsuario))
      .query(`
        MERGE VIDA_TIENDA_METAS AS t
        USING (SELECT @idBranch AS idBranch, @idCuenta AS idCuenta, @idPuntoVenta AS idPuntoVenta) AS s
          ON (t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.idPuntoVenta=s.idPuntoVenta)
        WHEN MATCHED THEN UPDATE SET
          MetaDiariaUSD=@Dia, MetaSemanalUSD=@Sem, MetaMensualUSD=@Mes, FechaMod=GETDATE(), UsuMod=@Usu
        WHEN NOT MATCHED THEN INSERT
          (idBranch,idCuenta,idPuntoVenta,MetaDiariaUSD,MetaSemanalUSD,MetaMensualUSD,UsuAlta)
          VALUES (@idBranch,@idCuenta,@idPuntoVenta,@Dia,@Sem,@Mes,@Usu);`);
    return reply.send({ message: 'Metas guardadas' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al guardar metas' });
  }
}

// GET /metas/progreso?idPuntoVenta=
export async function progresoMetas(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const idPuntoVenta = pvEfectivo(request, request.query.idPuntoVenta);
  if (!idPuntoVenta) return reply.code(400).send({ error: 'Se requiere idPuntoVenta' });
  try {
    const pool = await getPool();
    const metas = await leerMetas(pool, idBranch, idCuenta, idPuntoVenta);

    // Ventas POS entregadas: hoy, últimos 7 días, mes calendario actual
    const v = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idPuntoVenta', sql.BigInt, idPuntoVenta)
      .query(`
        SELECT
          ISNULL(SUM(CASE WHEN CAST(FechaAlta AS DATE)=CAST(GETDATE() AS DATE) THEN TotalUSD ELSE 0 END),0) AS Dia,
          ISNULL(SUM(CASE WHEN FechaAlta >= DATEADD(DAY,-6, CAST(GETDATE() AS DATE)) THEN TotalUSD ELSE 0 END),0) AS Semana,
          ISNULL(SUM(CASE WHEN FechaAlta >= DATEFROMPARTS(YEAR(GETDATE()),MONTH(GETDATE()),1) THEN TotalUSD ELSE 0 END),0) AS Mes
        FROM VIDA_PEDIDOS
        WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@idPuntoVenta
          AND Canal='POS' AND Status='ENTREGADO'`);
    const ventas = v.recordset[0];

    const arma = (ventasP, metaP) => {
      const meta = Number(metaP), ven = Number(ventasP);
      const pct = meta > 0 ? Math.min(100, Math.round((ven / meta) * 100)) : null;
      return { ventas: ven, meta, pct, cumplida: meta > 0 && ven >= meta, falta: meta > 0 ? Math.max(0, +(meta - ven).toFixed(2)) : null };
    };

    return reply.send({
      idPuntoVenta: Number(idPuntoVenta),
      metas,
      progreso: {
        dia:    arma(ventas.Dia,    metas.MetaDiariaUSD),
        semana: arma(ventas.Semana, metas.MetaSemanalUSD),
        mes:    arma(ventas.Mes,    metas.MetaMensualUSD),
      },
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al calcular progreso' });
  }
}

// GET /finanzas/rentabilidad?idPuntoVenta=
export async function calcularRentabilidad(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const idPuntoVenta = pvEfectivo(request, request.query.idPuntoVenta);
  if (!idPuntoVenta) return reply.code(400).send({ error: 'Se requiere idPuntoVenta' });

  try {
    const pool = await getPool();
    const fin = await leerFinanzas(pool, idBranch, idCuenta, idPuntoVenta);
    const pctVar = Number(fin.PctComisionDelivery) + Number(fin.PctImpuestos) + Number(fin.PctPasarela);

    // Catálogo (precio/costo/plus) — los productos son de la cuenta
    const prodR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT PrecioUSD, CostoUSD, EsProductoPlus
              FROM VIDA_INVENTARIO_PRODUCTOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO'`);
    const productos = prodR.recordset;
    const plus   = productos.filter(p => p.EsProductoPlus);
    const normal = productos.filter(p => !p.EsProductoPlus);

    const modos = {
      soloPlus:   metricasModo(plus,      pctVar),
      mixto:      metricasModo(productos, pctVar),
      soloNormal: metricasModo(normal,    pctVar),
    };

    // Ventas de hoy y últimos 30 días (POS entregado) de esta tienda
    const ventasR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idPuntoVenta', sql.BigInt, idPuntoVenta)
      .query(`
        SELECT
          ISNULL(SUM(CASE WHEN CAST(FechaAlta AS DATE)=CAST(GETDATE() AS DATE) THEN TotalUSD ELSE 0 END),0) AS VentasHoy,
          ISNULL(SUM(CASE WHEN FechaAlta >= DATEADD(DAY,-30,GETDATE()) THEN TotalUSD ELSE 0 END),0)         AS Ventas30
        FROM VIDA_PEDIDOS
        WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@idPuntoVenta
          AND Canal='POS' AND Status='ENTREGADO'`);
    const ventasHoy = Number(ventasR.recordset[0].VentasHoy);
    const ventas30  = Number(ventasR.recordset[0].Ventas30);

    // Punto de equilibrio (con el margen de contribución del modo MIXTO)
    const fijos = Number(fin.CostosFijosMensualUSD);
    const contribPctMixto = modos.mixto.margenContribPct / 100; // fracción
    const puedeCalcular = contribPctMixto > 0;

    const ventasEquilibrioMes = puedeCalcular ? fijos / contribPctMixto : null;
    const ventasEquilibrioDia = ventasEquilibrioMes != null ? ventasEquilibrioMes / 30 : null;
    const unidadesEquilibrioDia = (ventasEquilibrioDia != null && modos.mixto.precioProm > 0)
      ? ventasEquilibrioDia / modos.mixto.precioProm : null;

    // Meta diaria para lograr la ganancia objetivo
    const meta = Number(fin.MetaGananciaMensualUSD);
    const ventasMetaMes = puedeCalcular ? (fijos + meta) / contribPctMixto : null;
    const metaDiaria = ventasMetaMes != null ? ventasMetaMes / 30 : null;
    const faltaHoy = metaDiaria != null ? Math.max(0, metaDiaria - ventasHoy) : null;

    // ROI mensual estimado con las ventas reales de los últimos 30 días
    const gananciaNetaMes = ventas30 * contribPctMixto - fijos;
    const inversion = Number(fin.InversionInicialUSD);
    const roiPct = inversion > 0 ? (gananciaNetaMes / inversion) * 100 : null;

    return reply.send({
      idPuntoVenta: Number(idPuntoVenta),
      finanzas: fin,
      pctVariablesTotal: pctVar,
      modos,
      puntoEquilibrio: {
        ventasMes: ventasEquilibrioMes,
        ventasDia: ventasEquilibrioDia,
        unidadesDia: unidadesEquilibrioDia,
      },
      meta: { metaDiaria, ventasHoy, faltaHoy },
      roi: { ventas30, gananciaNetaMes, roiPct, inversionInicial: inversion },
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al calcular rentabilidad' });
  }
}
