// src/controllers/arranque.controller.js
// Cuadro de arranque del mes (tareas 6, 7 y 8; audios de Lila): en una sola
// vista, cómo le fue a la tienda los meses anteriores contra su meta, qué se
// vende más, cuántas unidades PLUS vende y cómo va con su producto estrella.
// También aquí VIDA define los PLUS y el producto estrella de cada tienda.
import { getPool, sql } from '../db/sqlserver.js';
import { tiendaEnAlcance, operadorMatriz, filtroTiendasRed } from '../services/alcance.service.js';
import { registrarAuditoria } from '../services/audit.service.js';
import { sqlEsPlus, validarDestacados } from '../services/destacadosTienda.service.js';

const ROLES_RED = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO'];
const pvEfectivo = (user, pv) => (ROLES_RED.includes(user.TipoUsuario) ? (pv || user.idPuntoVenta) : user.idPuntoVenta);
const MESES = 6;
// Mes en hora de Venezuela (UTC−4), como número AAAAMM
const SQL_PERIODO = `(YEAR(DATEADD(HOUR,-4,ped.FechaAlta))*100 + MONTH(DATEADD(HOUR,-4,ped.FechaAlta)))`;

function periodos(n, hoy = new Date()) {
  const d = new Date(hoy.getTime() - 4 * 3600e3);
  let a = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const out = [];
  for (let i = 0; i < n; i++) { out.unshift(a * 100 + m); m--; if (m === 0) { m = 12; a--; } }
  return out;
}

// GET /arranque?idPuntoVenta=
export async function cuadroArranque(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const idPuntoVenta = pvEfectivo(request.user, request.query.idPuntoVenta);
  if (!idPuntoVenta) return reply.code(400).send({ error: 'Elige una tienda' });
  try {
    const pool = await getPool();
    if (!(await tiendaEnAlcance(request.user, idPuntoVenta, pool))) return reply.code(403).send({ error: 'Esa tienda está fuera de tu alcance' });
    const lista = periodos(MESES);
    const desde = lista[0];
    const req = () => pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('pv', sql.BigInt, idPuntoVenta).input('desde', sql.Int, desde);
    const [ventasR, prodR, metaR, destR] = await Promise.all([
      // Ventas por mes (POS y app, entregadas)
      req().query(`SELECT ${SQL_PERIODO} AS Periodo, COUNT(*) AS Ventas, SUM(ped.TotalUSD) AS VentasUSD
                   FROM VIDA_PEDIDOS ped
                   WHERE ped.idBranch=@idBranch AND ped.idCuenta=@idCuenta AND ped.idPuntoVenta=@pv AND ped.Status='ENTREGADO'
                     AND ${SQL_PERIODO} >= @desde
                   GROUP BY ${SQL_PERIODO}`),
      // Unidades e importe por producto y mes, con si es PLUS o estrella en esta tienda
      req().query(`SELECT ${SQL_PERIODO} AS Periodo, d.idProducto, p.Nombre, ${sqlEsPlus('p', '@pv')} AS EsPlus,
                          SUM(d.Cantidad) AS Unidades, SUM(d.Cantidad * d.PrecioUnitario) AS ImporteUSD
                   FROM VIDA_PEDIDOS_DETALLE d
                   JOIN VIDA_PEDIDOS ped ON ped.idBranch=d.idBranch AND ped.idCuenta=d.idCuenta AND ped.idPedido=d.idPedido
                   JOIN VIDA_INVENTARIO_PRODUCTOS p ON p.idBranch=d.idBranch AND p.idCuenta=d.idCuenta AND p.idProducto=d.idProducto
                   WHERE d.idBranch=@idBranch AND d.idCuenta=@idCuenta AND ped.idPuntoVenta=@pv AND ped.Status='ENTREGADO'
                     AND ${SQL_PERIODO} >= @desde
                   GROUP BY ${SQL_PERIODO}, d.idProducto, p.Nombre, p.idBranch, p.idCuenta, p.idProducto, p.EsProductoPlus`),
      req().query(`SELECT MetaMensualUSD FROM VIDA_TIENDA_METAS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@pv`),
      req().query(`SELECT dd.Tipo, dd.idProducto, p.Nombre, ${sqlEsPlus('p', '@pv')} AS EsPlus
                   FROM VIDA_TIENDA_PRODUCTOS_DESTACADOS dd
                   JOIN VIDA_INVENTARIO_PRODUCTOS p ON p.idBranch=dd.idBranch AND p.idCuenta=dd.idCuenta AND p.idProducto=dd.idProducto
                   WHERE dd.idBranch=@idBranch AND dd.idCuenta=@idCuenta AND dd.idPuntoVenta=@pv`),
    ]);

    const meta = Number(metaR.recordset[0]?.MetaMensualUSD || 0);
    const actual = lista[lista.length - 1], anterior = lista[lista.length - 2];
    const filasProd = prodR.recordset.map(r => ({ ...r, Periodo: Number(r.Periodo), Unidades: Number(r.Unidades), ImporteUSD: Number(r.ImporteUSD), EsPlus: !!r.EsPlus }));
    const meses = lista.map(per => {
      const v = ventasR.recordset.find(r => Number(r.Periodo) === per);
      const plus = filasProd.filter(r => r.Periodo === per && r.EsPlus);
      return {
        Periodo: per, Ventas: Number(v?.Ventas || 0), VentasUSD: Math.round(Number(v?.VentasUSD || 0) * 100) / 100, MetaUSD: meta,
        UnidadesPlus: plus.reduce((s, r) => s + r.Unidades, 0),
        VentasPlusUSD: Math.round(plus.reduce((s, r) => s + r.ImporteUSD, 0) * 100) / 100,
      };
    });
    // Avance del mes en curso y proyección al cierre (ritmo diario de lo que va)
    const hoy = new Date(Date.now() - 4 * 3600e3);
    const diasMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 0)).getUTCDate();
    const dia = hoy.getUTCDate();
    const mesActual = meses[meses.length - 1];
    const masVendidos = per => filasProd.filter(r => r.Periodo === per).sort((a, b) => b.Unidades - a.Unidades).slice(0, 5)
      .map(({ idProducto, Nombre, Unidades, ImporteUSD, EsPlus }) => ({ idProducto, Nombre, Unidades, ImporteUSD, EsPlus }));
    const unidadesDe = (id, per) => filasProd.filter(r => String(r.idProducto) === String(id) && r.Periodo === per).reduce((s, r) => s + r.Unidades, 0);
    const destacados = destR.recordset;
    const estrellas = destacados.filter(d => d.Tipo === 'ESTRELLA').map(d => ({
      idProducto: d.idProducto, Nombre: d.Nombre, UnidadesMes: unidadesDe(d.idProducto, actual), UnidadesMesAnterior: unidadesDe(d.idProducto, anterior),
    }));
    // PLUS de la tienda: su lista propia o, si no tiene, los marcados PLUS que vendió en el período
    const idsPlus = destacados.some(d => d.Tipo === 'PLUS')
      ? destacados.filter(d => d.Tipo === 'PLUS').map(d => ({ idProducto: d.idProducto, Nombre: d.Nombre }))
      : [...new Map(filasProd.filter(r => r.EsPlus).map(r => [String(r.idProducto), { idProducto: r.idProducto, Nombre: r.Nombre }])).values()];
    return reply.send({
      idPuntoVenta: Number(idPuntoVenta), meses, MetaMensualUSD: meta,
      mesActual: {
        ...mesActual, Dia: dia, DiasMes: diasMes,
        AvancePct: meta > 0 ? Math.round(mesActual.VentasUSD / meta * 1000) / 10 : null,
        ProyeccionUSD: dia > 0 ? Math.round(mesActual.VentasUSD / dia * diasMes * 100) / 100 : 0,
        PctVentasPlus: mesActual.VentasUSD > 0 ? Math.round(mesActual.VentasPlusUSD / mesActual.VentasUSD * 1000) / 10 : null,
      },
      masVendidosMes: masVendidos(actual), masVendidosMesAnterior: masVendidos(anterior),
      estrellas,
      plus: idsPlus.map(p => ({ ...p, UnidadesMes: unidadesDe(p.idProducto, actual), UnidadesMesAnterior: unidadesDe(p.idProducto, anterior) }))
        .sort((a, b) => b.UnidadesMes - a.UnidadesMes),
      plusPropios: destacados.some(d => d.Tipo === 'PLUS'),
      puedeEditar: (await operadorMatriz(request.user, pool)).permitido,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al armar el cuadro de arranque' });
  }
}

// GET /arranque/red → cada tienda: ventas del mes, unidades PLUS y % de la
// venta en PLUS (indicador de la tarea 8, comparado entre tiendas)
export async function rankingPlusRed(request, reply) {
  const { idBranch, idCuenta } = request.user;
  if (!ROLES_RED.includes(request.user.TipoUsuario)) return reply.code(403).send({ error: 'Solo para VIDA' });
  try {
    const pool = await getPool();
    const per = periodos(1)[0];
    const req = pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('per', sql.Int, per);
    const filtro = filtroTiendasRed(request.user, 'pv.idPuntoVenta', req);
    // Primero cada línea vendida con su marca PLUS (de esa tienda); luego se
    // suma por tienda (SQL Server no suma sobre una subconsulta directamente).
    const r = await req.query(`
      SELECT x.idPuntoVenta, x.NomComercial,
             COUNT(DISTINCT x.idPedido) AS Ventas, ISNULL(SUM(x.Importe), 0) AS VentasUSD,
             ISNULL(SUM(CASE WHEN x.EsPlus = 1 THEN x.Cantidad ELSE 0 END), 0) AS UnidadesPlus,
             ISNULL(SUM(CASE WHEN x.EsPlus = 1 THEN x.Importe ELSE 0 END), 0) AS VentasPlusUSD
      FROM (
        SELECT pv.idPuntoVenta, pv.NomComercial, ped.idPedido, d.Cantidad, d.Cantidad * d.PrecioUnitario AS Importe,
               CASE WHEN p.idProducto IS NULL THEN 0 ELSE ${sqlEsPlus('p', 'pv.idPuntoVenta')} END AS EsPlus
        FROM VIDA_CUENTA_PUNTOS_VENTA pv
        LEFT JOIN VIDA_PEDIDOS ped ON ped.idBranch=pv.idBranch AND ped.idCuenta=pv.idCuenta AND ped.idPuntoVenta=pv.idPuntoVenta
          AND ped.Status='ENTREGADO' AND ${SQL_PERIODO} = @per
        LEFT JOIN VIDA_PEDIDOS_DETALLE d ON d.idBranch=ped.idBranch AND d.idCuenta=ped.idCuenta AND d.idPedido=ped.idPedido
        LEFT JOIN VIDA_INVENTARIO_PRODUCTOS p ON p.idBranch=d.idBranch AND p.idCuenta=d.idCuenta AND p.idProducto=d.idProducto
        WHERE pv.idBranch=@idBranch AND pv.idCuenta=@idCuenta AND pv.Status='ACTIVO' AND ISNULL(pv.EsMatriz,0)=0 ${filtro}
      ) x
      GROUP BY x.idPuntoVenta, x.NomComercial`);
    const filas = r.recordset.map(x => ({
      ...x, VentasUSD: Number(x.VentasUSD), UnidadesPlus: Number(x.UnidadesPlus), VentasPlusUSD: Number(x.VentasPlusUSD),
      PctPlus: Number(x.VentasUSD) > 0 ? Math.round(Number(x.VentasPlusUSD) / Number(x.VentasUSD) * 1000) / 10 : null,
    })).sort((a, b) => b.UnidadesPlus - a.UnidadesPlus || b.VentasUSD - a.VentasUSD);
    return reply.send({ Periodo: per, tiendas: filas });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al armar el indicador PLUS de la red' });
  }
}

// GET /arranque/destacados?idPuntoVenta= → los PLUS y estrella guardados de la tienda
export async function verDestacados(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const idPuntoVenta = pvEfectivo(request.user, request.query.idPuntoVenta);
  if (!idPuntoVenta) return reply.code(400).send({ error: 'Elige una tienda' });
  try {
    const pool = await getPool();
    if (!(await tiendaEnAlcance(request.user, idPuntoVenta, pool))) return reply.code(403).send({ error: 'Esa tienda está fuera de tu alcance' });
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('pv', sql.BigInt, idPuntoVenta)
      .query(`SELECT Tipo, idProducto FROM VIDA_TIENDA_PRODUCTOS_DESTACADOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@pv`);
    return reply.send({
      plus: r.recordset.filter(x => x.Tipo === 'PLUS').map(x => Number(x.idProducto)),
      estrella: r.recordset.filter(x => x.Tipo === 'ESTRELLA').map(x => Number(x.idProducto)),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al leer los productos destacados' });
  }
}

// PUT /arranque/destacados { idPuntoVenta, plus:[ids], estrella:[ids] } — solo VIDA
// Una lista de PLUS vacía devuelve la tienda a la marca PLUS general.
export async function guardarDestacados(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const pool = await getPool();
  if (!(await operadorMatriz(request.user, pool)).permitido) return reply.code(403).send({ error: 'Solo VIDA define los PLUS y el producto estrella de cada tienda' });
  const idPuntoVenta = Number(request.body?.idPuntoVenta);
  if (!Number.isSafeInteger(idPuntoVenta) || idPuntoVenta <= 0) return reply.code(400).send({ error: 'Elige una tienda' });
  let datos;
  try { datos = validarDestacados(request.body); } catch (e) { return reply.code(e.statusCode || 400).send({ error: e.message }); }
  let tx;
  try {
    // Solo productos que esa tienda ve (catálogo de VIDA + los suyos), activos
    const ids = [...new Set([...datos.plus, ...datos.estrella])];
    if (ids.length) {
      const r = pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('pv', sql.BigInt, idPuntoVenta);
      ids.forEach((id, i) => r.input(`p${i}`, sql.BigInt, id));
      const ok = await r.query(`SELECT COUNT(*) AS n FROM VIDA_INVENTARIO_PRODUCTOS
        WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO'
          AND (idPuntoVentaDueno IS NULL OR idPuntoVentaDueno=@pv)
          AND idProducto IN (${ids.map((_, i) => `@p${i}`).join(',')})`);
      if (ok.recordset[0].n !== ids.length) return reply.code(400).send({ error: 'Algún producto no está activo o no es de esta tienda' });
    }
    tx = new sql.Transaction(pool);
    await tx.begin();
    const base = () => new sql.Request(tx).input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('pv', sql.BigInt, idPuntoVenta);
    await base().query(`DELETE FROM VIDA_TIENDA_PRODUCTOS_DESTACADOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@pv`);
    for (const [Tipo, lista] of [['PLUS', datos.plus], ['ESTRELLA', datos.estrella]]) {
      for (const id of lista) {
        await base().input('Tipo', sql.VarChar(10), Tipo).input('id', sql.BigInt, id).input('Usu', sql.VarChar(30), `U:${idUsuario}`)
          .query(`INSERT INTO VIDA_TIENDA_PRODUCTOS_DESTACADOS (idBranch,idCuenta,idPuntoVenta,Tipo,idProducto,UsuAlta)
                  VALUES (@idBranch,@idCuenta,@pv,@Tipo,@id,@Usu)`);
      }
    }
    await tx.commit();
    tx = null;
    registrarAuditoria(pool, {
      idBranch, idCuenta, entityType: 'PUNTO_VENTA', entityId: idPuntoVenta, accion: 'PRODUCTOS_DESTACADOS', actor: `U:${idUsuario}`, data: datos,
    }, request.log).catch(() => {});
    return reply.send({ message: 'Productos PLUS y estrella guardados' });
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch {} }
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al guardar los productos destacados' });
  }
}
