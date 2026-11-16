// src/controllers/reabastoVida.controller.js
// Reabasto por proveedor con VIDA como intermediario (tarea 24, sql/59).
//
// La tienda le pide a VIDA productos (nunca proveedores) y le paga a VIDA. Al
// validar el pago, VIDA parte el pedido en un paquete por proveedor y se lo
// manda (por su API o por el Portal de proveedores) con folio de VIDA y sin
// datos de la tienda. El proveedor entrega al repartidor de VIDA o a la tienda
// contra el código del QR; la tienda recibe, sube su inventario y nace la
// cuenta por pagar de VIDA al proveedor: precio de lista menos la comisión.
//
// Dos reglas que no se negocian:
//   · la tienda nunca recibe el nombre, RIF ni contacto del proveedor;
//   · el proveedor nunca recibe el nombre ni la dirección de la tienda.
import { getPool, sql } from '../db/sqlserver.js';
import { registrarAuditoria } from '../services/audit.service.js';
import { emitirCuenta } from '../services/cuentas.service.js';
import { prepararMoneda } from '../services/moneda.service.js';
import { operadorMatriz } from '../services/alcance.service.js';
import {
  elegirProveedores, repartoComision, sucursalMasCercana, codigoRetiro, normalizarCodigo,
  folioReabasto, estadoTrasPaquetes, repartidorAguanta,
} from '../services/reabastoProveedor.service.js';
import { enviarPedidoApi } from '../services/envioProveedor.service.js';
import { broadcast } from '../ws/ws.manager.js';
import { enviarPush } from '../services/push.service.js';

const operaVida = async (user, pool) => (await operadorMatriz(user, pool)).permitido;
const esPropia = (user, idPuntoVenta) =>
  user.idPuntoVenta != null && String(idPuntoVenta) === String(user.idPuntoVenta);
const MODOS = ['ENVIO_VIDA', 'RECOJO'];
const METODOS_PAGO = ['PAGO_MOVIL', 'TRANSFERENCIA'];

async function getConfigVal(pool, idBranch, idCuenta, clave, defVal = null) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .input('clave', sql.VarChar(100), clave)
    .query(`SELECT Valor FROM VIDA_CONFIG_DELIVERY
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Clave=@clave`);
  return r.recordset.length ? r.recordset[0].Valor : defVal;
}

async function nextIdTx(tx, tabla, campo, idBranch, idCuenta) {
  const r = await new sql.Request(tx)
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}),0)+1 AS nextId FROM ${tabla} WITH (UPDLOCK, HOLDLOCK)
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
  return r.recordset[0].nextId;
}

async function getMatriz(pool, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT TOP 1 idPuntoVenta FROM VIDA_CUENTA_PUNTOS_VENTA
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND EsMatriz=1 AND Status='ACTIVO'`);
  return r.recordset[0] || null;
}

async function historial(tx, { idBranch, idCuenta, idPedidoMatriz, anterior, nuevo, notas, usuario }) {
  const id = await nextIdTx(tx, 'VIDA_PEDIDOS_MATRIZ_HISTORIAL', 'idHistorial', idBranch, idCuenta);
  await new sql.Request(tx)
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .input('idHistorial', sql.BigInt, id)
    .input('idPedidoMatriz', sql.BigInt, idPedidoMatriz)
    .input('StatusAnterior', sql.VarChar(30), anterior)
    .input('StatusNuevo', sql.VarChar(30), nuevo)
    .input('Notas', sql.VarChar(500), notas || null)
    .input('UsuAlta', sql.VarChar(30), usuario)
    .query(`INSERT INTO VIDA_PEDIDOS_MATRIZ_HISTORIAL
              (idBranch,idCuenta,idHistorial,idPedidoMatriz,StatusAnterior,StatusNuevo,Notas,UsuAlta)
            VALUES (@idBranch,@idCuenta,@idHistorial,@idPedidoMatriz,@StatusAnterior,@StatusNuevo,@Notas,@UsuAlta)`);
}

// Cabecera de un pedido de la modalidad PROVEEDOR, con candado si va en tx.
async function leerPedido(reqOTx, { idBranch, idCuenta, idPedidoMatriz }, bloquear = false) {
  const req = reqOTx instanceof sql.Transaction ? new sql.Request(reqOTx) : reqOTx.request();
  const r = await req
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .input('idPedidoMatriz', sql.BigInt, idPedidoMatriz)
    .query(`SELECT * FROM VIDA_PEDIDOS_MATRIZ ${bloquear ? 'WITH (UPDLOCK, HOLDLOCK)' : ''}
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedidoMatriz=@idPedidoMatriz AND Modalidad='PROVEEDOR'`);
  return r.recordset[0] || null;
}

// ══════════════════════════════════════════════════════════════════════════
// CATÁLOGO DE VIDA — lo que la tienda puede pedir, a precio de VIDA
// GET /reabasto-vida/catalogo?search=
// Solo productos que algún proveedor activo surte con precio de lista. No sale
// nada del proveedor: ni nombre ni cuántos hay.
// ══════════════════════════════════════════════════════════════════════════
export async function catalogoVida(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { search } = request.query;
  try {
    const pool = await getPool();
    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta);
    let filtro = '';
    if (search) { req.input('search', sql.VarChar(200), `%${search}%`); filtro = ' AND (p.Nombre LIKE @search OR p.SKU LIKE @search)'; }
    const r = await req.query(`
      SELECT p.idProducto, p.Nombre, p.SKU, p.UnidadMedida, p.ImagenProducto, p.EsProductoPlus,
             cat.Nombre AS NombreCategoria, MIN(pp.PrecioCosto) AS PrecioVidaUSD
      FROM VIDA_INVENTARIO_PRODUCTOS p
      JOIN VIDA_PROVEEDORES_PRODUCTOS pp
        ON pp.idBranch=p.idBranch AND pp.idCuenta=p.idCuenta AND pp.idProducto=p.idProducto AND pp.PrecioCosto > 0
      JOIN VIDA_PROVEEDORES pr
        ON pr.idBranch=pp.idBranch AND pr.idCuenta=pp.idCuenta AND pr.idProveedor=pp.idProveedor AND pr.Status='ACTIVO'
      LEFT JOIN VIDA_INVENTARIO_CATEGORIAS cat
        ON cat.idBranch=p.idBranch AND cat.idCuenta=p.idCuenta AND cat.idCategoria=p.idCategoria
      WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta AND p.Status='ACTIVO' ${filtro}
      GROUP BY p.idProducto, p.Nombre, p.SKU, p.UnidadMedida, p.ImagenProducto, p.EsProductoPlus, cat.Nombre
      ORDER BY p.Nombre`);
    const datosPago = await getConfigVal(pool, idBranch, idCuenta, 'DatosPagoVida', null);
    return reply.send({ productos: r.recordset, datosPago });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener el catálogo de VIDA' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// TIENDA — PEDIR A VIDA
// POST /reabasto-vida/pedidos { items:[{idProducto,Cantidad}], ModoRecepcion, Notas, idPuntoVentaSolicita? }
// Queda POR_PAGAR; los paquetes por proveedor nacen ya armados (con su precio
// de lista fijado) pero el proveedor no los ve hasta que VIDA valida el pago.
// ══════════════════════════════════════════════════════════════════════════
export async function crearPedidoVida(request, reply) {
  const { idBranch, idCuenta, idUsuario, idPuntoVenta: pvUsuario } = request.user;
  const { items, Notas, ModoRecepcion } = request.body || {};
  const pool = await getPool();
  const opera = await operaVida(request.user, pool);
  if (!opera && !pvUsuario) return reply.code(403).send({ error: 'Solo las tiendas y VIDA piden reabasto' });
  const idPuntoVentaSolicita = opera ? (request.body?.idPuntoVentaSolicita || pvUsuario) : pvUsuario;
  if (!idPuntoVentaSolicita) return reply.code(400).send({ error: 'Indica la tienda que recibe' });
  if (!MODOS.includes(ModoRecepcion)) return reply.code(400).send({ error: 'Elige cómo lo recibes: Envío VIDA o Recojo yo' });
  if (!Array.isArray(items) || !items.length ||
      items.some(i => !i || !Number.isSafeInteger(Number(i.idProducto)) || Number(i.idProducto) <= 0 ||
        !Number.isFinite(Number(i.Cantidad)) || Number(i.Cantidad) <= 0 ||
        Math.abs(Number(i.Cantidad) * 10000 - Math.round(Number(i.Cantidad) * 10000)) > 1e-6) ||
      new Set(items.map(i => String(i.idProducto))).size !== items.length)
    return reply.code(400).send({ error: 'Productos únicos y cantidades positivas con máximo cuatro decimales son requeridos' });

  let tx;
  try {
    const matriz = await getMatriz(pool, idBranch, idCuenta);
    if (!matriz) return reply.code(400).send({ error: 'No hay una Matriz (VIDA) designada', codigo: 'SIN_MATRIZ' });
    if (String(matriz.idPuntoVenta) === String(idPuntoVentaSolicita))
      return reply.code(400).send({ error: 'La Matriz no se pide reabasto a sí misma' });

    // Ofertas y precios desde la BD, nunca del cliente
    const ids = items.map(i => parseInt(i.idProducto));
    const oReq = pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta);
    ids.forEach((id, i) => oReq.input(`p${i}`, sql.BigInt, id));
    const oR = await oReq.query(`
      SELECT pp.idProducto, pp.idProveedor, pp.PrecioCosto AS PrecioLista, pr.ComisionVidaPct
      FROM VIDA_PROVEEDORES_PRODUCTOS pp
      JOIN VIDA_PROVEEDORES pr ON pr.idBranch=pp.idBranch AND pr.idCuenta=pp.idCuenta AND pr.idProveedor=pp.idProveedor AND pr.Status='ACTIVO'
      JOIN VIDA_INVENTARIO_PRODUCTOS p ON p.idBranch=pp.idBranch AND p.idCuenta=pp.idCuenta AND p.idProducto=pp.idProducto AND p.Status='ACTIVO'
      WHERE pp.idBranch=@idBranch AND pp.idCuenta=@idCuenta AND pp.idProducto IN (${ids.map((_, i) => `@p${i}`).join(',')})`);
    const elegido = elegirProveedores(oR.recordset);
    if (ids.some(id => !elegido.has(String(id))))
      return reply.code(400).send({ error: 'Algún producto ya no está disponible en VIDA; actualiza el catálogo' });

    // Un paquete por proveedor, con la sucursal más cercana a la tienda
    const tiendaR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('pv', sql.BigInt, idPuntoVentaSolicita)
      .query(`SELECT Latitud, Longitud FROM VIDA_CUENTA_PUNTOS_VENTA
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@pv`);
    if (!tiendaR.recordset.length) return reply.code(400).send({ error: 'La tienda no existe' });
    const tienda = tiendaR.recordset[0];
    const comisionGeneral = parseFloat(await getConfigVal(pool, idBranch, idCuenta, 'ComisionVidaPct', '0')) || 0;

    const paquetes = new Map();   // idProveedor → { comision, lineas[] }
    for (const it of items) {
      const o = elegido.get(String(it.idProducto));
      const k = String(o.idProveedor);
      if (!paquetes.has(k)) {
        paquetes.set(k, { idProveedor: o.idProveedor, comision: o.ComisionVidaPct != null ? Number(o.ComisionVidaPct) : comisionGeneral, lineas: [] });
      }
      paquetes.get(k).lineas.push({ idProducto: parseInt(it.idProducto), Cantidad: Number(it.Cantidad), Precio: o.PrecioLista });
    }
    const sucR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT idProveedor, idSucursal, Latitud, Longitud, Status FROM VIDA_PROVEEDORES_SUCURSALES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO'
                AND idProveedor IN (${[...paquetes.keys()].map(Number).join(',')})`);

    const total = +[...paquetes.values()].flatMap(p => p.lineas).reduce((s, l) => s + l.Cantidad * l.Precio, 0).toFixed(4);

    tx = new sql.Transaction(pool);
    await tx.begin();
    const idPedidoMatriz = await nextIdTx(tx, 'VIDA_PEDIDOS_MATRIZ', 'idPedidoMatriz', idBranch, idCuenta);
    await new sql.Request(tx)
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idPedidoMatriz', sql.BigInt, idPedidoMatriz)
      .input('idPuntoVentaSolicita', sql.BigInt, idPuntoVentaSolicita)
      .input('idPuntoVentaMatriz', sql.BigInt, matriz.idPuntoVenta)
      .input('Total', sql.Decimal(18, 4), total)
      .input('Notas', sql.VarChar(500), Notas?.trim() || null)
      .input('ModoRecepcion', sql.VarChar(12), ModoRecepcion)
      .input('UsuAlta', sql.VarChar(30), `U:${idUsuario}`)
      .query(`INSERT INTO VIDA_PEDIDOS_MATRIZ
                (idBranch,idCuenta,idPedidoMatriz,idPuntoVentaSolicita,idPuntoVentaMatriz,Status,
                 TotalCostoUSD,TotalSuministroUSD,Notas,UsuAlta,Modalidad,ModoRecepcion)
              VALUES (@idBranch,@idCuenta,@idPedidoMatriz,@idPuntoVentaSolicita,@idPuntoVentaMatriz,'POR_PAGAR',
                      @Total,@Total,@Notas,@UsuAlta,'PROVEEDOR',@ModoRecepcion)`);

    let idDetalle = 1;
    for (const paq of paquetes.values()) {
      const totalLista = paq.lineas.reduce((s, l) => s + l.Cantidad * l.Precio, 0);
      const { pagarProveedor } = repartoComision(totalLista, paq.comision);
      const suc = sucursalMasCercana(sucR.recordset.filter(s => String(s.idProveedor) === String(paq.idProveedor)), tienda.Latitud, tienda.Longitud);
      const idPP = await nextIdTx(tx, 'VIDA_PEDIDOS_PROVEEDOR', 'idPedidoProveedor', idBranch, idCuenta);
      await new sql.Request(tx)
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta)
        .input('idPP', sql.BigInt, idPP)
        .input('idPedidoMatriz', sql.BigInt, idPedidoMatriz)
        .input('idProveedor', sql.BigInt, paq.idProveedor)
        .input('idSucursal', sql.BigInt, suc?.idSucursal ?? null)
        .input('Folio', sql.VarChar(30), folioReabasto(idPP))
        .input('Codigo', sql.VarChar(12), codigoRetiro())
        .input('TotalLista', sql.Decimal(18, 4), +totalLista.toFixed(4))
        .input('Comision', sql.Decimal(9, 4), paq.comision)
        .input('Pagar', sql.Decimal(18, 4), pagarProveedor)
        .query(`INSERT INTO VIDA_PEDIDOS_PROVEEDOR
                  (idBranch,idCuenta,idPedidoProveedor,idPedidoMatriz,idProveedor,idSucursal,Folio,Status,
                   CodigoRetiro,TotalListaUSD,ComisionPct,TotalPagarUSD,CanalEnvio)
                SELECT @idBranch,@idCuenta,@idPP,@idPedidoMatriz,@idProveedor,@idSucursal,@Folio,'POR_PAGAR',
                       @Codigo,@TotalLista,@Comision,@Pagar,CanalPedido
                FROM VIDA_PROVEEDORES WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idProveedor=@idProveedor`);
      for (const l of paq.lineas) {
        await new sql.Request(tx)
          .input('idBranch', sql.BigInt, idBranch)
          .input('idCuenta', sql.BigInt, idCuenta)
          .input('idPedidoMatriz', sql.BigInt, idPedidoMatriz)
          .input('idDetalle', sql.BigInt, idDetalle++)
          .input('idProducto', sql.BigInt, l.idProducto)
          .input('Cantidad', sql.Decimal(18, 4), l.Cantidad)
          .input('Precio', sql.Decimal(18, 4), l.Precio)
          .input('idPP', sql.BigInt, idPP)
          .query(`INSERT INTO VIDA_PEDIDOS_MATRIZ_DETALLE
                    (idBranch,idCuenta,idPedidoMatriz,idDetalle,idProducto,CantidadSolicitada,CostoUnitario,
                     PrecioTiendaUnitario,PrecioListaUnitario,idPedidoProveedor)
                  VALUES (@idBranch,@idCuenta,@idPedidoMatriz,@idDetalle,@idProducto,@Cantidad,@Precio,@Precio,@Precio,@idPP)`);
      }
    }
    await historial(tx, { idBranch, idCuenta, idPedidoMatriz, anterior: null, nuevo: 'POR_PAGAR', notas: null, usuario: `U:${idUsuario}` });
    await tx.commit();
    tx = null;
    return reply.code(201).send({ idPedidoMatriz, status: 'POR_PAGAR', TotalUSD: total });
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch {} }
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al crear el pedido a VIDA' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// DETALLE — lo que ve la tienda y lo que ve VIDA
// GET /reabasto-vida/pedidos/:idPedidoMatriz
// ══════════════════════════════════════════════════════════════════════════
export async function obtenerPedidoVida(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const idPedidoMatriz = parseInt(request.params.idPedidoMatriz);
  try {
    const pool = await getPool();
    const ped = await leerPedido(pool, { idBranch, idCuenta, idPedidoMatriz });
    if (!ped) return reply.code(404).send({ error: 'Pedido no encontrado' });
    const opera = await operaVida(request.user, pool);
    if (!opera && !esPropia(request.user, ped.idPuntoVentaSolicita)) return reply.code(404).send({ error: 'Pedido no encontrado' });

    const base = () => pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('idPedidoMatriz', sql.BigInt, idPedidoMatriz);
    const [tiendaR, paqR, detR, histR] = await Promise.all([
      base().query(`SELECT pv.NomComercial FROM VIDA_CUENTA_PUNTOS_VENTA pv JOIN VIDA_PEDIDOS_MATRIZ pm
                      ON pm.idBranch=pv.idBranch AND pm.idCuenta=pv.idCuenta AND pm.idPuntoVentaSolicita=pv.idPuntoVenta
                    WHERE pm.idBranch=@idBranch AND pm.idCuenta=@idCuenta AND pm.idPedidoMatriz=@idPedidoMatriz`),
      base().query(`SELECT pp.idPedidoProveedor, pp.Folio, pp.Status, pp.CodigoRetiro, pp.TotalListaUSD, pp.ComisionPct,
                           pp.TotalPagarUSD, pp.CanalEnvio, pp.EnvioApiResultado, pp.NotasProveedor, pp.RetiradoPor, pp.FechaRetiro,
                           pp.idRepartidor, rep.Nombre AS NombreRepartidor,
                           pr.Nombre AS NombreProveedor, s.Direccion, s.Horario, s.Latitud, s.Longitud,
                           w.PesoKg, w.SinPeso
                    FROM VIDA_PEDIDOS_PROVEEDOR pp
                    JOIN VIDA_PROVEEDORES pr ON pr.idBranch=pp.idBranch AND pr.idCuenta=pp.idCuenta AND pr.idProveedor=pp.idProveedor
                    LEFT JOIN VIDA_PROVEEDORES_SUCURSALES s ON s.idBranch=pp.idBranch AND s.idCuenta=pp.idCuenta
                      AND s.idProveedor=pp.idProveedor AND s.idSucursal=pp.idSucursal
                    LEFT JOIN VIDA_REPARTIDORES rep ON rep.idBranch=pp.idBranch AND rep.idCuenta=pp.idCuenta AND rep.idRepartidor=pp.idRepartidor
                    OUTER APPLY (
                      SELECT SUM(d.CantidadSolicitada * inv.PesoKg) AS PesoKg,
                             SUM(CASE WHEN inv.PesoKg IS NULL THEN 1 ELSE 0 END) AS SinPeso
                      FROM VIDA_PEDIDOS_MATRIZ_DETALLE d
                      LEFT JOIN VIDA_INVENTARIO_PRODUCTOS inv ON inv.idBranch=d.idBranch AND inv.idCuenta=d.idCuenta AND inv.idProducto=d.idProducto
                      WHERE d.idBranch=pp.idBranch AND d.idCuenta=pp.idCuenta AND d.idPedidoProveedor=pp.idPedidoProveedor
                    ) w
                    WHERE pp.idBranch=@idBranch AND pp.idCuenta=@idCuenta AND pp.idPedidoMatriz=@idPedidoMatriz
                    ORDER BY pp.idPedidoProveedor`),
      base().query(`SELECT d.idDetalle, d.idPedidoProveedor, d.idProducto, d.CantidadSolicitada, d.CantidadRecibida,
                           d.PrecioTiendaUnitario, p.Nombre AS NombreProducto, p.SKU, p.UnidadMedida
                    FROM VIDA_PEDIDOS_MATRIZ_DETALLE d
                    LEFT JOIN VIDA_INVENTARIO_PRODUCTOS p ON p.idBranch=d.idBranch AND p.idCuenta=d.idCuenta AND p.idProducto=d.idProducto
                    WHERE d.idBranch=@idBranch AND d.idCuenta=@idCuenta AND d.idPedidoMatriz=@idPedidoMatriz
                    ORDER BY d.idDetalle`),
      base().query(`SELECT StatusAnterior, StatusNuevo, Notas, FechaAlta FROM VIDA_PEDIDOS_MATRIZ_HISTORIAL
                    WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedidoMatriz=@idPedidoMatriz ORDER BY idHistorial`),
    ]);

    // La tienda ve "Paquete 1, 2…": productos, estado y, si recoge ella, el
    // punto de retiro con su código. Nunca el proveedor ni lo que gana VIDA.
    const paquetes = paqR.recordset.map((p, i) => {
      const lineas = detR.recordset.filter(d => String(d.idPedidoProveedor) === String(p.idPedidoProveedor));
      const comun = {
        idPedidoProveedor: p.idPedidoProveedor, numero: i + 1, Status: p.Status, RetiradoPor: p.RetiradoPor,
        FechaRetiro: p.FechaRetiro, TotalUSD: p.TotalListaUSD, lineas,
      };
      const verRetiro = opera || ped.ModoRecepcion === 'RECOJO';
      const retiro = verRetiro && p.Status !== 'POR_PAGAR' && p.Status !== 'CANCELADO'
        ? { CodigoRetiro: p.CodigoRetiro, Direccion: p.Direccion, Horario: p.Horario, Latitud: p.Latitud, Longitud: p.Longitud }
        : null;
      if (!opera) return { ...comun, retiro };
      return {
        ...comun, retiro, Folio: p.Folio, NombreProveedor: p.NombreProveedor, ComisionPct: p.ComisionPct,
        TotalPagarUSD: p.TotalPagarUSD, CanalEnvio: p.CanalEnvio, EnvioApiResultado: p.EnvioApiResultado,
        NotasProveedor: p.NotasProveedor,
        idRepartidor: p.idRepartidor, NombreRepartidor: p.NombreRepartidor,
        PesoKg: p.SinPeso > 0 ? null : (p.PesoKg != null ? Number(p.PesoKg) : null), SinPeso: Number(p.SinPeso) || 0,
      };
    });
    return reply.send({
      idPedidoMatriz: ped.idPedidoMatriz, Status: ped.Status, ModoRecepcion: ped.ModoRecepcion,
      TotalUSD: ped.TotalSuministroUSD, Notas: ped.Notas, FechaAlta: ped.FechaAlta,
      PagoMetodo: ped.PagoMetodo, PagoReferencia: ped.PagoReferencia, PagoFecha: ped.PagoFecha,
      NombreTienda: tiendaR.recordset[0]?.NomComercial, operaVida: opera,
      puedeRecibir: esPropia(request.user, ped.idPuntoVentaSolicita) || opera,
      datosPago: await getConfigVal(pool, idBranch, idCuenta, 'DatosPagoVida', null),
      paquetes, historial: histR.recordset,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener el pedido' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// TIENDA — REPORTAR EL PAGO A VIDA
// POST /reabasto-vida/pedidos/:idPedidoMatriz/pago { Metodo, Referencia }
// ══════════════════════════════════════════════════════════════════════════
export async function reportarPago(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const idPedidoMatriz = parseInt(request.params.idPedidoMatriz);
  const { Metodo, Referencia } = request.body || {};
  const ref = String(Referencia || '').trim();
  if (!METODOS_PAGO.includes(Metodo)) return reply.code(400).send({ error: 'Indica si pagaste por Pago Móvil o transferencia' });
  if (ref.length < 4 || ref.length > 60) return reply.code(400).send({ error: 'Escribe la referencia del pago' });
  const pool = await getPool();
  let tx;
  try {
    tx = new sql.Transaction(pool);
    await tx.begin();
    const ped = await leerPedido(tx, { idBranch, idCuenta, idPedidoMatriz }, true);
    if (!ped) { await tx.rollback(); tx = null; return reply.code(404).send({ error: 'Pedido no encontrado' }); }
    if (!esPropia(request.user, ped.idPuntoVentaSolicita) && !(await operaVida(request.user, pool))) {
      await tx.rollback(); tx = null; return reply.code(403).send({ error: 'No es un pedido de tu tienda' });
    }
    if (ped.Status !== 'POR_PAGAR') { await tx.rollback(); tx = null; return reply.code(409).send({ error: 'Este pedido ya no espera pago' }); }
    await new sql.Request(tx)
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('id', sql.BigInt, idPedidoMatriz)
      .input('Metodo', sql.VarChar(20), Metodo).input('Ref', sql.VarChar(60), ref)
      .query(`UPDATE VIDA_PEDIDOS_MATRIZ SET Status='PAGO_REPORTADO', PagoMetodo=@Metodo, PagoReferencia=@Ref,
                PagoFecha=GETUTCDATE(), FechaMod=GETUTCDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedidoMatriz=@id`);
    await historial(tx, { idBranch, idCuenta, idPedidoMatriz, anterior: 'POR_PAGAR', nuevo: 'PAGO_REPORTADO', notas: `Ref. ${ref}`, usuario: `U:${idUsuario}` });
    await tx.commit();
    tx = null;
    return reply.send({ ok: true, status: 'PAGO_REPORTADO' });
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch {} }
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al reportar el pago' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// VIDA — VALIDAR (o rechazar) EL PAGO; al aprobar se mandan los paquetes
// POST /reabasto-vida/pedidos/:idPedidoMatriz/validar-pago { aprobar, Notas }
// ══════════════════════════════════════════════════════════════════════════
export async function validarPago(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const idPedidoMatriz = parseInt(request.params.idPedidoMatriz);
  const { aprobar, Notas } = request.body || {};
  const pool = await getPool();
  if (!(await operaVida(request.user, pool))) return reply.code(403).send({ error: 'Solo VIDA valida los pagos' });
  if (!aprobar && !String(Notas || '').trim()) return reply.code(400).send({ error: 'Explica por qué rechazas el pago' });
  let tx;
  try {
    tx = new sql.Transaction(pool);
    await tx.begin();
    const ped = await leerPedido(tx, { idBranch, idCuenta, idPedidoMatriz }, true);
    if (!ped) { await tx.rollback(); tx = null; return reply.code(404).send({ error: 'Pedido no encontrado' }); }
    if (ped.Status !== 'PAGO_REPORTADO') { await tx.rollback(); tx = null; return reply.code(409).send({ error: 'No hay un pago por validar en este pedido' }); }
    const nuevo = aprobar ? 'EN_PROCESO' : 'POR_PAGAR';
    const r = new sql.Request(tx)
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('id', sql.BigInt, idPedidoMatriz).input('Usu', sql.VarChar(30), `U:${idUsuario}`);
    await r.query(aprobar
      ? `UPDATE VIDA_PEDIDOS_MATRIZ SET Status='EN_PROCESO', PagoValidadoPor=@Usu, PagoValidadoFecha=GETUTCDATE(), FechaMod=GETUTCDATE()
           WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedidoMatriz=@id;
         UPDATE VIDA_PEDIDOS_PROVEEDOR SET Status='ENVIADO', FechaMod=GETUTCDATE()
           WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedidoMatriz=@id AND Status='POR_PAGAR';`
      : `UPDATE VIDA_PEDIDOS_MATRIZ SET Status='POR_PAGAR', PagoReferencia=NULL, PagoMetodo=NULL, PagoFecha=NULL, FechaMod=GETUTCDATE()
           WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedidoMatriz=@id;`);
    await historial(tx, {
      idBranch, idCuenta, idPedidoMatriz, anterior: 'PAGO_REPORTADO', nuevo,
      notas: aprobar ? 'Pago validado por VIDA; pedido enviado a los proveedores' : `Pago rechazado: ${String(Notas).trim()}`,
      usuario: `U:${idUsuario}`,
    });
    await tx.commit();
    tx = null;

    // Fuera de la transacción: avisar por API a los proveedores que la tengan.
    // Si falla, el pedido igual queda en su Portal de proveedores.
    if (aprobar) await notificarProveedoresApi(pool, { idBranch, idCuenta, idPedidoMatriz, ModoRecepcion: ped.ModoRecepcion }, request.log);
    registrarAuditoria(pool, {
      idBranch, idCuenta, entityType: 'PEDIDO_MATRIZ', entityId: idPedidoMatriz,
      accion: aprobar ? 'PAGO_VALIDADO' : 'PAGO_RECHAZADO', actor: `U:${idUsuario}`, data: { Referencia: ped.PagoReferencia },
    }, request.log).catch(() => {});
    return reply.send({ ok: true, status: nuevo });
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch {} }
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al validar el pago' });
  }
}

async function notificarProveedoresApi(pool, { idBranch, idCuenta, idPedidoMatriz, ModoRecepcion }, log) {
  const paq = await pool.request()
    .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('id', sql.BigInt, idPedidoMatriz)
    .query(`SELECT pp.idPedidoProveedor, pp.Folio, pp.CodigoRetiro, pp.TotalListaUSD, pr.ApiUrl, s.Nombre AS Sucursal
            FROM VIDA_PEDIDOS_PROVEEDOR pp
            JOIN VIDA_PROVEEDORES pr ON pr.idBranch=pp.idBranch AND pr.idCuenta=pp.idCuenta AND pr.idProveedor=pp.idProveedor
            LEFT JOIN VIDA_PROVEEDORES_SUCURSALES s ON s.idBranch=pp.idBranch AND s.idCuenta=pp.idCuenta
              AND s.idProveedor=pp.idProveedor AND s.idSucursal=pp.idSucursal
            WHERE pp.idBranch=@idBranch AND pp.idCuenta=@idCuenta AND pp.idPedidoMatriz=@id
              AND pp.CanalEnvio='API' AND pr.ApiUrl IS NOT NULL AND pp.Status='ENVIADO'`);
  for (const p of paq.recordset) {
    const lineas = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('pp', sql.BigInt, p.idPedidoProveedor)
      .query(`SELECT pr.CodigoProveedor, p.SKU, p.Nombre, d.CantidadSolicitada AS Cantidad, d.PrecioListaUnitario AS PrecioLista
              FROM VIDA_PEDIDOS_MATRIZ_DETALLE d
              JOIN VIDA_PEDIDOS_PROVEEDOR pp ON pp.idBranch=d.idBranch AND pp.idCuenta=d.idCuenta AND pp.idPedidoProveedor=d.idPedidoProveedor
              JOIN VIDA_INVENTARIO_PRODUCTOS p ON p.idBranch=d.idBranch AND p.idCuenta=d.idCuenta AND p.idProducto=d.idProducto
              LEFT JOIN VIDA_PROVEEDORES_PRODUCTOS pr ON pr.idBranch=d.idBranch AND pr.idCuenta=d.idCuenta
                AND pr.idProveedor=pp.idProveedor AND pr.idProducto=d.idProducto
              WHERE d.idBranch=@idBranch AND d.idCuenta=@idCuenta AND d.idPedidoProveedor=@pp`);
    const base = (process.env.BASE_URL || 'https://api.comercializadoravida.com').replace(/\/$/, '');
    const resultado = await enviarPedidoApi(p.ApiUrl, {
      folio: p.Folio, codigoRetiro: p.CodigoRetiro, recoge: ModoRecepcion === 'RECOJO' ? 'CLIENTE_VIDA' : 'REPARTIDOR_VIDA',
      sucursal: p.Sucursal, totalLista: Number(p.TotalListaUSD), pagado: true,
      productos: lineas.recordset.map(l => ({
        codigoProveedor: l.CodigoProveedor, sku: l.SKU, nombre: l.Nombre, cantidad: Number(l.Cantidad), precioLista: Number(l.PrecioLista),
      })),
      // A dónde reportar el avance del pedido (auth: Authorization: Bearer <tu API key de VIDA>).
      callback: {
        auth: 'Authorization: Bearer <tu API key de VIDA>',
        confirmar: `${base}/api/proveedor-api/pedidos/${encodeURIComponent(p.Folio)}/confirmar`,
        listo:     `${base}/api/proveedor-api/pedidos/${encodeURIComponent(p.Folio)}/listo`,
        entregar:  `${base}/api/proveedor-api/pedidos/${encodeURIComponent(p.Folio)}/entregar`,
      },
    }, log);
    await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('pp', sql.BigInt, p.idPedidoProveedor)
      .input('res', sql.VarChar(300), resultado.slice(0, 300))
      .query(`UPDATE VIDA_PEDIDOS_PROVEEDOR SET EnvioApiResultado=@res, FechaMod=GETUTCDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedidoProveedor=@pp`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CANCELAR — la tienda mientras no ha pagado (o VIDA no lo validó); VIDA
// mientras ningún paquete salió del proveedor.
// POST /reabasto-vida/pedidos/:idPedidoMatriz/cancelar { Notas }
// ══════════════════════════════════════════════════════════════════════════
export async function cancelarPedidoVida(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const idPedidoMatriz = parseInt(request.params.idPedidoMatriz);
  const notas = String(request.body?.Notas || '').trim() || null;
  const pool = await getPool();
  const opera = await operaVida(request.user, pool);
  let tx;
  try {
    tx = new sql.Transaction(pool);
    await tx.begin();
    const ped = await leerPedido(tx, { idBranch, idCuenta, idPedidoMatriz }, true);
    const fin = async (code, error) => { await tx.rollback(); tx = null; return reply.code(code).send({ error }); };
    if (!ped) return fin(404, 'Pedido no encontrado');
    if (!opera && !esPropia(request.user, ped.idPuntoVentaSolicita)) return fin(403, 'No es un pedido de tu tienda');
    if (!opera && !['POR_PAGAR', 'PAGO_REPORTADO'].includes(ped.Status))
      return fin(403, 'Ya está con los proveedores; pídele a VIDA que lo cancele');
    if (!['POR_PAGAR', 'PAGO_REPORTADO', 'EN_PROCESO'].includes(ped.Status)) return fin(409, 'Este pedido ya no se puede cancelar');
    const salio = await new sql.Request(tx)
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('id', sql.BigInt, idPedidoMatriz)
      .query(`SELECT COUNT(*) AS n FROM VIDA_PEDIDOS_PROVEEDOR
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedidoMatriz=@id AND Status IN ('RETIRADO','RECIBIDO')`);
    if (salio.recordset[0].n > 0) return fin(409, 'Algún paquete ya salió del proveedor; recíbelo y gestiona la devolución con VIDA');
    await new sql.Request(tx)
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('id', sql.BigInt, idPedidoMatriz)
      .query(`UPDATE VIDA_PEDIDOS_MATRIZ SET Status='CANCELADO', FechaMod=GETUTCDATE()
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedidoMatriz=@id;
              UPDATE VIDA_PEDIDOS_PROVEEDOR SET Status='CANCELADO', FechaMod=GETUTCDATE()
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedidoMatriz=@id;`);
    const reembolso = ped.Status === 'EN_PROCESO' ? 'Ya estaba pagado: VIDA debe devolverle el dinero a la tienda.' : null;
    await historial(tx, {
      idBranch, idCuenta, idPedidoMatriz, anterior: ped.Status, nuevo: 'CANCELADO',
      notas: [notas, reembolso].filter(Boolean).join(' · ') || null, usuario: `U:${idUsuario}`,
    });
    await tx.commit();
    tx = null;
    return reply.send({ ok: true, status: 'CANCELADO', reembolsoPendiente: !!reembolso });
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch {} }
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al cancelar el pedido' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// TIENDA — RECIBIR UN PAQUETE (sube su inventario; nace lo que VIDA le debe
// al proveedor por lo que realmente llegó)
// POST /reabasto-vida/paquetes/:idPedidoProveedor/recibir { cantidades:[{idDetalle,CantidadRecibida}] }
// ══════════════════════════════════════════════════════════════════════════
export async function recibirPaquete(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const idPP = parseInt(request.params.idPedidoProveedor);
  const cantidades = Array.isArray(request.body?.cantidades) ? request.body.cantidades : null;
  if (!cantidades) return reply.code(400).send({ error: 'Indica lo que llegó de cada producto' });
  const pool = await getPool();
  let tx;
  try {
    await prepararMoneda(pool, request.user);
    tx = new sql.Transaction(pool);
    await tx.begin();
    const fin = async (code, error) => { await tx.rollback(); tx = null; return reply.code(code).send({ error }); };
    const paqR = await new sql.Request(tx)
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('pp', sql.BigInt, idPP)
      .query(`SELECT pp.*, pm.idPuntoVentaSolicita, pm.idPuntoVentaMatriz, pm.Status AS StatusPedido, pm.ModoRecepcion
              FROM VIDA_PEDIDOS_PROVEEDOR pp WITH (UPDLOCK, HOLDLOCK)
              JOIN VIDA_PEDIDOS_MATRIZ pm ON pm.idBranch=pp.idBranch AND pm.idCuenta=pp.idCuenta AND pm.idPedidoMatriz=pp.idPedidoMatriz
              WHERE pp.idBranch=@idBranch AND pp.idCuenta=@idCuenta AND pp.idPedidoProveedor=@pp`);
    const paq = paqR.recordset[0];
    if (!paq) return fin(404, 'Paquete no encontrado');
    if (!esPropia(request.user, paq.idPuntoVentaSolicita) && !(await operaVida(request.user, pool))) return fin(403, 'No es un pedido de tu tienda');
    if (paq.Status !== 'RETIRADO') return fin(409, 'Este paquete todavía no sale del proveedor, o ya se recibió');

    const detR = await new sql.Request(tx)
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('pp', sql.BigInt, idPP)
      .query(`SELECT idDetalle, idProducto, CantidadSolicitada, PrecioListaUnitario FROM VIDA_PEDIDOS_MATRIZ_DETALLE
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedidoProveedor=@pp`);
    const porDetalle = new Map(cantidades.map(c => [String(c.idDetalle), Number(c.CantidadRecibida)]));
    for (const [k, v] of porDetalle) {
      if (!detR.recordset.some(d => String(d.idDetalle) === k)) return fin(400, 'Hay un producto que no es de este paquete');
      if (!Number.isFinite(v) || v < 0) return fin(400, 'Las cantidades recibidas no pueden ser negativas');
    }
    const lineas = detR.recordset.map(d => {
      const recibida = porDetalle.has(String(d.idDetalle)) ? porDetalle.get(String(d.idDetalle)) : Number(d.CantidadSolicitada);
      return { ...d, recibida: Math.min(recibida, Number(d.CantidadSolicitada)) };
    });

    let totalListaRecibido = 0;
    for (const l of lineas) {
      await new sql.Request(tx)
        .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
        .input('idDetalle', sql.BigInt, l.idDetalle).input('idPedidoMatriz', sql.BigInt, paq.idPedidoMatriz)
        .input('cant', sql.Decimal(18, 4), l.recibida)
        .query(`UPDATE VIDA_PEDIDOS_MATRIZ_DETALLE SET CantidadRecibida=@cant
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedidoMatriz=@idPedidoMatriz AND idDetalle=@idDetalle`);
      if (!(l.recibida > 0)) continue;
      totalListaRecibido += l.recibida * Number(l.PrecioListaUnitario);
      // Solo sube la tienda: la Matriz no tuvo la mercancía en ningún momento.
      const stockR = await new sql.Request(tx)
        .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
        .input('idPuntoVenta', sql.BigInt, paq.idPuntoVentaSolicita).input('idProducto', sql.BigInt, l.idProducto)
        .input('delta', sql.Decimal(18, 4), l.recibida)
        .query(`
          MERGE VIDA_INVENTARIO_STOCK WITH (HOLDLOCK) AS t
          USING (SELECT @idBranch AS idBranch, @idCuenta AS idCuenta, @idPuntoVenta AS idPuntoVenta, @idProducto AS idProducto) AS s
            ON t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.idPuntoVenta=s.idPuntoVenta AND t.idProducto=s.idProducto
          WHEN MATCHED THEN UPDATE SET Cantidad = ISNULL(t.Cantidad,0)+@delta, FechaMod = GETUTCDATE()
          WHEN NOT MATCHED THEN INSERT (idBranch,idCuenta,idPuntoVenta,idProducto,Cantidad)
            VALUES (@idBranch,@idCuenta,@idPuntoVenta,@idProducto,@delta)
          OUTPUT ISNULL(deleted.Cantidad,0) AS Antes, inserted.Cantidad AS Despues;`);
      const s = stockR.recordset[0] || { Antes: 0, Despues: l.recibida };
      const movId = await nextIdTx(tx, 'VIDA_INVENTARIO_MOVIMIENTOS', 'idMovimiento', idBranch, idCuenta);
      await new sql.Request(tx)
        .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
        .input('idMovimiento', sql.BigInt, movId).input('idPuntoVenta', sql.BigInt, paq.idPuntoVentaSolicita)
        .input('idProducto', sql.BigInt, l.idProducto)
        .input('Cantidad', sql.Decimal(18, 4), l.recibida)
        .input('Antes', sql.Decimal(18, 4), parseFloat(s.Antes)).input('Despues', sql.Decimal(18, 4), parseFloat(s.Despues))
        .input('Motivo', sql.VarChar(300), `Reabasto de VIDA (pedido #${paq.idPedidoMatriz})`)
        .input('Referencia', sql.VarChar(100), `REABASTO:${paq.idPedidoMatriz}`)
        .input('UsuAlta', sql.VarChar(20), `U:${idUsuario}`)
        .query(`INSERT INTO VIDA_INVENTARIO_MOVIMIENTOS
                  (idBranch,idCuenta,idMovimiento,idPuntoVenta,idProducto,TipoMovimiento,Cantidad,CantidadAntes,CantidadDespues,Motivo,Referencia,UsuAlta)
                VALUES (@idBranch,@idCuenta,@idMovimiento,@idPuntoVenta,@idProducto,'ENTRADA',@Cantidad,@Antes,@Despues,@Motivo,@Referencia,@UsuAlta)`);
    }

    // VIDA le debe al proveedor lo que llegó, a precio de lista menos su comisión
    const { pagarProveedor } = repartoComision(totalListaRecibido, paq.ComisionPct);
    await emitirCuenta(tx, {
      idBranch, idCuenta, Tipo: 'CXP', OrigenTipo: 'PEDIDO_PROVEEDOR', idOrigen: idPP,
      idProveedor: paq.idProveedor, idPuntoVentaEmisor: paq.idPuntoVentaMatriz,
      TotalUSD: pagarProveedor, Folio: paq.Folio,
      Notas: `Reabasto ${paq.Folio} · lista $${totalListaRecibido.toFixed(2)} − ${Number(paq.ComisionPct)}% de comisión VIDA`,
      UsuAlta: idUsuario,
    });
    await new sql.Request(tx)
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('pp', sql.BigInt, idPP)
      .query(`UPDATE VIDA_PEDIDOS_PROVEEDOR SET Status='RECIBIDO', FechaMod=GETUTCDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedidoProveedor=@pp`);

    // ¿Era el último paquete? Entonces el pedido queda recibido.
    const restR = await new sql.Request(tx)
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('id', sql.BigInt, paq.idPedidoMatriz)
      .query(`SELECT Status FROM VIDA_PEDIDOS_PROVEEDOR WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedidoMatriz=@id`);
    const nuevo = estadoTrasPaquetes(restR.recordset.map(r => r.Status));
    const faltante = lineas.reduce((s, l) => s + (Number(l.CantidadSolicitada) - l.recibida) * Number(l.PrecioListaUnitario), 0);
    if (nuevo !== paq.StatusPedido) {
      await new sql.Request(tx)
        .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('id', sql.BigInt, paq.idPedidoMatriz)
        .input('st', sql.VarChar(30), nuevo)
        .query(`UPDATE VIDA_PEDIDOS_MATRIZ SET Status=@st, FechaMod=GETUTCDATE()
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedidoMatriz=@id`);
    }
    await historial(tx, {
      idBranch, idCuenta, idPedidoMatriz: paq.idPedidoMatriz, anterior: paq.StatusPedido, nuevo,
      notas: `Paquete recibido${faltante > 0.00005 ? ` · faltó mercancía por $${faltante.toFixed(2)}: VIDA le debe ese saldo a la tienda` : ''}`,
      usuario: `U:${idUsuario}`,
    });
    await tx.commit();
    tx = null;
    return reply.send({ ok: true, status: nuevo, faltanteUSD: +faltante.toFixed(2) });
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch {} }
    request.log.error(err);
    return reply.code(err.statusCode || 500).send({ error: err.statusCode ? err.message : 'Error al recibir el paquete' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ASIGNACIÓN MANUAL DE UN ENVÍO (tarea 24): cuando ningún repartidor aguanta el
// peso (o falta el peso de algún producto), VIDA asigna a mano el repartidor.
// ══════════════════════════════════════════════════════════════════════════

// GET /reabasto-vida/paquetes/:idPedidoProveedor/repartidores
// VIDA ve los repartidores de proveedores y si aguantan el peso del paquete.
export async function repartidoresEnvioProveedor(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const idPP = parseInt(request.params.idPedidoProveedor);
  try {
    const pool = await getPool();
    if (!(await operaVida(request.user, pool))) return reply.code(403).send({ error: 'Solo VIDA asigna repartidores' });

    const pesoR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('pp', sql.BigInt, idPP)
      .query(`SELECT SUM(d.CantidadSolicitada * inv.PesoKg) AS PesoKg,
                     SUM(CASE WHEN inv.PesoKg IS NULL THEN 1 ELSE 0 END) AS SinPeso
              FROM VIDA_PEDIDOS_MATRIZ_DETALLE d
              LEFT JOIN VIDA_INVENTARIO_PRODUCTOS inv ON inv.idBranch=d.idBranch AND inv.idCuenta=d.idCuenta AND inv.idProducto=d.idProducto
              WHERE d.idBranch=@idBranch AND d.idCuenta=@idCuenta AND d.idPedidoProveedor=@pp`);
    const sinPeso = Number(pesoR.recordset[0]?.SinPeso) || 0;
    const peso = Number(pesoR.recordset[0]?.PesoKg) || 0;

    const repR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT idRepartidor, Nombre, Vehiculo, CapacidadKg,
                     (SELECT COUNT(*) FROM VIDA_PEDIDOS_PROVEEDOR pa
                      WHERE pa.idBranch=r.idBranch AND pa.idCuenta=r.idCuenta AND pa.idRepartidor=r.idRepartidor
                        AND pa.Status NOT IN ('RECIBIDO','CANCELADO')) AS Activas
              FROM VIDA_REPARTIDORES r
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO'
                AND ISNULL(StatusAprobacion,'APROBADO') NOT IN ('PENDIENTE','RECHAZADO')
                AND ISNULL(TipoReparto,'CLIENTES') IN ('PROVEEDORES','AMBOS')
              ORDER BY Nombre`);
    return reply.send({
      PesoKg: sinPeso > 0 ? null : peso,
      SinPeso: sinPeso,
      repartidores: repR.recordset.map(r => ({
        idRepartidor: r.idRepartidor, Nombre: r.Nombre, Vehiculo: r.Vehiculo,
        CapacidadKg: r.CapacidadKg != null ? Number(r.CapacidadKg) : null,
        Activas: Number(r.Activas) || 0,
        aguanta: sinPeso > 0 ? null : repartidorAguanta(r.CapacidadKg, peso),
      })),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'No se pudieron cargar los repartidores' });
  }
}

// POST /reabasto-vida/paquetes/:idPedidoProveedor/asignar  { idRepartidor }
// VIDA asigna a mano. Permite exceder la capacidad declarada (VIDA decide, p.ej.
// dos viajes o dividir el pedido); el panel avisa si no aguanta.
export async function asignarRepartidorEnvio(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const idPP = parseInt(request.params.idPedidoProveedor);
  const idRepartidor = parseInt(request.body?.idRepartidor);
  if (!idRepartidor) return reply.code(400).send({ error: 'Elige un repartidor' });
  try {
    const pool = await getPool();
    if (!(await operaVida(request.user, pool))) return reply.code(403).send({ error: 'Solo VIDA asigna repartidores' });

    const repR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idRep', sql.BigInt, idRepartidor)
      .query(`SELECT Nombre, FcmToken, ISNULL(TipoReparto,'CLIENTES') AS TipoReparto,
                     Status, ISNULL(StatusAprobacion,'APROBADO') AS StatusAprobacion
              FROM VIDA_REPARTIDORES WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRep`);
    const rep = repR.recordset[0];
    if (!rep || rep.Status !== 'ACTIVO' || ['PENDIENTE', 'RECHAZADO'].includes(rep.StatusAprobacion)
        || !['PROVEEDORES', 'AMBOS'].includes(rep.TipoReparto))
      return reply.code(400).send({ error: 'Ese repartidor no está disponible para recolecciones' });

    const pkgR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('pp', sql.BigInt, idPP)
      .query(`SELECT pp.Status, pp.idRepartidor, pp.Folio, pm.ModoRecepcion
              FROM VIDA_PEDIDOS_PROVEEDOR pp
              JOIN VIDA_PEDIDOS_MATRIZ pm ON pm.idBranch=pp.idBranch AND pm.idCuenta=pp.idCuenta AND pm.idPedidoMatriz=pp.idPedidoMatriz
              WHERE pp.idBranch=@idBranch AND pp.idCuenta=@idCuenta AND pp.idPedidoProveedor=@pp`);
    const pkg = pkgR.recordset[0];
    if (!pkg) return reply.code(404).send({ error: 'Paquete no encontrado' });
    if (pkg.ModoRecepcion !== 'ENVIO_VIDA') return reply.code(409).send({ error: 'Este paquete no es de envío por VIDA' });
    if (pkg.idRepartidor != null) return reply.code(409).send({ error: 'El paquete ya tiene repartidor asignado' });
    if (!['CONFIRMADO', 'LISTO'].includes(pkg.Status)) return reply.code(409).send({ error: 'El paquete todavía no está listo para recoger' });

    const upd = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('pp', sql.BigInt, idPP).input('idRep', sql.BigInt, idRepartidor)
      .query(`UPDATE VIDA_PEDIDOS_PROVEEDOR SET idRepartidor=@idRep, RetiradoPor='REPARTIDOR', FechaMod=GETUTCDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedidoProveedor=@pp
                AND idRepartidor IS NULL AND Status IN ('CONFIRMADO','LISTO')`);
    if (!upd.rowsAffected[0]) return reply.code(409).send({ error: 'El paquete cambió mientras tanto; vuelve a leerlo' });

    registrarAuditoria(pool, {
      idBranch, idCuenta, entityType: 'PEDIDO_PROVEEDOR', entityId: idPP,
      accion: 'ENVIO_ASIGNADO_MANUAL', actor: `U:${idUsuario}`, data: { idRepartidor, Folio: pkg.Folio },
    }, request.log).catch(() => {});
    broadcast(idBranch, idCuenta, { tipo: 'envio_proveedor_tomado', idPedidoProveedor: idPP, idRepartidor, manual: true });
    if (rep.FcmToken) enviarPush([rep.FcmToken], {
      title: '📦 Te asignaron una recolección',
      body: `VIDA te asignó la recolección ${pkg.Folio}.`,
      data: { tipo: 'envio_proveedor_disponible', idPedidoProveedor: idPP },
    }, request.log);
    return reply.send({ ok: true, idRepartidor, Nombre: rep.Nombre });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'No se pudo asignar el repartidor' });
  }
}
