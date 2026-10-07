// src/controllers/delivery/pedidosCliente.js
// Pedidos desde la app cliente: catálogo, tasa y cotización, crear pedido, estado, historial, Pago Móvil, cancelar y extender búsqueda.
// (Separado de delivery.controller.js, que reexporta todo.)
import { getPool, sql } from '../../db/sqlserver.js';
import { broadcast } from '../../ws/ws.manager.js';
import { enviarPush } from '../../services/push.service.js';
import { STATUS_ACTIVOS_REPARTIDOR } from '../../services/rutas.service.js';
import { promocionesVigentes, mejorPromoUnitaria, calcularLinea } from '../promociones.controller.js';
import { evaluarCupon } from '../cupones.controller.js';
import { prepararMoneda, leerMoneda } from '../../services/moneda.service.js';
import { calcularPagoDelivery } from '../../services/pagoDelivery.service.js';
import { cobroSeguro } from '../../services/liquidacionRepartidor.service.js';
import { plazoPagoMinutos, SQL_SEGUNDOS_SIN_PAGO } from '../../services/pagoMovil.service.js';
import path from 'path';
import fs from 'fs';
import { getConfigVal, nextIdTx } from './comun.js';
import { reembolsarPuntosPedido } from './puntos.js';

// ══════════════════════════════════════════════════════════════════════════
// DATOS DE PAGO MÓVIL (públicos — la app los muestra en el checkout)
// GET /delivery/pago-movil?idBranch=1&idCuenta=1
// Se configuran desde el panel admin (claves PagoMovil* en config delivery)
// ══════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════
// PÚBLICO — TASA REFERENCIAL PARA MOSTRAR PRECIOS EN BOLÍVARES
// GET /delivery/tasa-referencial?idBranch=&idCuenta=
// Solo lectura: devuelve la última tasa guardada (no consulta bcv.today ni
// escribe), así un endpoint abierto no dispara llamadas externas. Es solo
// referencia para el catálogo: el cobro real se cotiza y congela al pedir.
// ══════════════════════════════════════════════════════════════════════════
export async function tasaReferencial(request, reply) {
  const idBranch = Number(request.query.idBranch);
  const idCuenta = Number(request.query.idCuenta);
  if (!Number.isInteger(idBranch) || !Number.isInteger(idCuenta) || idBranch <= 0 || idCuenta <= 0) {
    return reply.code(400).send({ error: 'idBranch e idCuenta son requeridos' });
  }
  try {
    const cfg = await leerMoneda(await getPool(), idBranch, idCuenta);
    const vigente = cfg.tasa && Number(cfg.tasa.Vigente) === 1;
    return reply.send({
      Modo: cfg.Modo,
      tasa: vigente ? { VESporUSD: Number(cfg.tasa.VESporUSD), FechaValor: cfg.tasa.FechaValor, Fuente: cfg.tasa.Fuente } : null,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'No se pudo obtener la tasa de referencia' });
  }
}

export async function datosPagoMovil(request, reply) {
  const { idBranch, idCuenta } = request.query;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT Clave, Valor FROM VIDA_CONFIG_DELIVERY
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND Clave IN ('PagoMovilBanco','PagoMovilTelefono','PagoMovilCedula','PagoMovilTitular')`);

    const cfg = Object.fromEntries(r.recordset.map(x => [x.Clave, x.Valor]));
    return reply.send({
      Banco:    cfg.PagoMovilBanco    || null,
      Telefono: cfg.PagoMovilTelefono || null,
      Cedula:   cfg.PagoMovilCedula   || null,
      Titular:  cfg.PagoMovilTitular  || null,
      disponible: !!(cfg.PagoMovilBanco && cfg.PagoMovilTelefono),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener datos de Pago Móvil' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — SUBIR COMPROBANTE DE PAGO (multipart)
// POST /delivery/pedido/:idPedido/comprobante
// ══════════════════════════════════════════════════════════════════════════
export async function subirComprobanteCliente(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const { idPedido } = request.params;
  let transaction = null, rutaArchivo = null;

  try {
    const pool = await getPool();

    // El pedido debe ser de este cliente
    const pedR = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idPedido',  sql.BigInt, idPedido)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT idPedido, MetodoPago, Status, StatusPago FROM VIDA_PEDIDOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND idPedido=@idPedido AND idCliente=@idCliente`);
    if (!pedR.recordset.length) {
      return reply.code(404).send({ error: 'Pedido no encontrado' });
    }
    const pedido = pedR.recordset[0];
    if (pedido.MetodoPago !== 'PAGO_MOVIL' || pedido.Status !== 'ESPERANDO_PAGO') {
      return reply.code(409).send({ error: 'Este pedido no admite comprobantes de Pago Móvil' });
    }

    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No se recibió el comprobante' });

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(data.mimetype)) {
      return reply.code(400).send({ error: 'Solo se permiten imágenes JPG, PNG o WebP' });
    }

    const referencia = (data.fields?.Referencia?.value || '').slice(0, 100) || null;

    const uploadDir = path.join(process.cwd(), 'uploads', 'comprobantes');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const ext = (data.filename.split('.').pop() || 'jpg').toLowerCase();
    const filename = `comp_${idBranch}_${idCuenta}_${idPedido}_${Date.now()}.${ext}`;
    rutaArchivo = path.join(uploadDir, filename);
    fs.writeFileSync(rutaArchivo, await data.toBuffer());
    const urlImagen = `/uploads/comprobantes/${filename}`;

    // Alta del comprobante y paso a PENDIENTE en una sola transacción. El
    // pedido se vuelve a leer con bloqueo: pudo aprobarse, cancelarse o vencer
    // su plazo de pago mientras se subía la imagen.
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const vigente = await new sql.Request(transaction)
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idPedido', sql.BigInt, idPedido)
      .query(`SELECT Status FROM VIDA_PEDIDOS WITH (UPDLOCK, HOLDLOCK)
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);
    if (vigente.recordset[0]?.Status !== 'ESPERANDO_PAGO') {
      throw Object.assign(new Error('Este pedido ya no admite comprobantes de Pago Móvil'), { statusCode: 409 });
    }

    // ID en la misma sentencia del INSERT (MAX+1 con bloqueo de rango).
    const ins = await new sql.Request(transaction)
      .input('idBranch',   sql.BigInt,       idBranch)
      .input('idCuenta',   sql.BigInt,       idCuenta)
      .input('idPedido',   sql.BigInt,       idPedido)
      .input('ImagenURL',  sql.VarChar(500), urlImagen)
      .input('Referencia', sql.VarChar(100), referencia)
      .input('UsuAlta',    sql.VarChar(20),  `CLI:${idCliente}`)
      .query(`INSERT INTO VIDA_PEDIDOS_COMPROBANTES
                (idBranch, idCuenta, idComprobante, idPedido, ImagenURL, Referencia, StatusRevision, UsuAlta)
              OUTPUT inserted.idComprobante
              SELECT @idBranch, @idCuenta, ISNULL(MAX(idComprobante),0)+1, @idPedido, @ImagenURL, @Referencia, 'PENDIENTE', @UsuAlta
              FROM VIDA_PEDIDOS_COMPROBANTES WITH (UPDLOCK, HOLDLOCK)
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
    const idComprobante = ins.recordset[0].idComprobante;

    await new sql.Request(transaction)
      .input('idBranch',sql.BigInt,idBranch).input('idCuenta',sql.BigInt,idCuenta).input('idPedido',sql.BigInt,idPedido)
      .query(`UPDATE VIDA_PEDIDOS SET StatusPago='PENDIENTE', FechaMod=GETUTCDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido AND Status='ESPERANDO_PAGO'`);
    await transaction.commit();
    transaction = null;

    // El panel se entera de que hay un comprobante esperando revisión.
    broadcast(idBranch, idCuenta, {
      tipo: 'pedido:actualizado', idPedido: Number(idPedido), StatusNuevo: 'ESPERANDO_PAGO', StatusPago: 'PENDIENTE',
    });
    return reply.code(201).send({ idComprobante, url: urlImagen });
  } catch (err) {
    if (transaction) { try { await transaction.rollback(); } catch {} }
    // Sin fila en BD, la imagen queda huérfana: se borra.
    if (rutaArchivo) { try { fs.unlinkSync(rutaArchivo); } catch {} }
    request.log.error(err);
    return reply.code(err.statusCode || 500).send({ error: err.statusCode ? err.message : 'Error al subir comprobante' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SUCURSALES ACTIVAS (sin auth)
// GET /delivery/sucursales?idBranch=1&idCuenta=1
// ══════════════════════════════════════════════════════════════════════════
export async function listarSucursales(request, reply) {
  const { idBranch, idCuenta } = request.query;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT idPuntoVenta, NomComercial,
                     CONCAT(ISNULL(Calle,''), ' ', ISNULL(NumExt,''), ' ',
                            ISNULL(Colonia,''), ' ', ISNULL(Ciudad,'')) AS Direccion,
                     Latitud, Longitud, Telefono
              FROM VIDA_CUENTA_PUNTOS_VENTA
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND Status='ACTIVO' AND StatusPuntoVenta='ACTIVO'
              ORDER BY NomComercial`);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener sucursales' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// TIENDA PUBLICA (sin auth) — destino del QR de los flyers del empresario
// GET /delivery/tienda/:idPuntoVenta?idBranch=1&idCuenta=1
// Devuelve SOLO los datos publicos de una tienda. idPuntoVenta no es unico por
// si solo (la PK es idBranch+idCuenta+idPuntoVenta), por eso el tenant viaja
// en la query y es obligatorio.
// ══════════════════════════════════════════════════════════════════════════
export async function tiendaPublica(request, reply) {
  const { idPuntoVenta } = request.params;
  const { idBranch, idCuenta } = request.query;
  if (!idBranch || !idCuenta) {
    return reply.code(400).send({ error: 'idBranch e idCuenta son requeridos' });
  }
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idPuntoVenta', sql.BigInt, idPuntoVenta)
      .query(`SELECT idPuntoVenta, NomComercial,
                     CONCAT(ISNULL(Calle,''), ' ', ISNULL(NumExt,''), ' ',
                            ISNULL(Colonia,''), ' ', ISNULL(Ciudad,'')) AS Direccion,
                     Ciudad, Latitud, Longitud, Telefono
              FROM VIDA_CUENTA_PUNTOS_VENTA
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND idPuntoVenta=@idPuntoVenta
                AND Status='ACTIVO' AND StatusPuntoVenta='ACTIVO'`);
    if (!r.recordset.length) {
      return reply.code(404).send({ error: 'Tienda no encontrada' });
    }
    return reply.send(r.recordset[0]);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener la tienda' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// PRODUCTOS PARA APP (sin auth / token cliente opcional)
// GET /delivery/productos?idBranch=1&idCuenta=1&idPuntoVenta=3&search=&idCategoria=
// ══════════════════════════════════════════════════════════════════════════
export async function listarProductosApp(request, reply) {
  const { idBranch, idCuenta, idPuntoVenta = '', search = '', idCategoria = '' } = request.query;
  try {
    const pool = await getPool();

    let whereExtra = '';
    if (search)       whereExtra += ` AND (p.Nombre LIKE @search OR p.Descripcion LIKE @search)`;
    if (idCategoria)  whereExtra += ` AND p.idCategoria = @idCategoria`;
    // Sin idPuntoVenta: feed global — una fila por (producto, sucursal con stock),
    // estilo Uber Eats. Con idPuntoVenta: catálogo de esa sucursal.
    if (idPuntoVenta) whereExtra += ` AND inv.idPuntoVenta = @idPuntoVenta`;

    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta);

    if (idPuntoVenta) req.input('idPuntoVenta', sql.BigInt,       idPuntoVenta);
    if (search)       req.input('search',       sql.VarChar(200), `%${search}%`);
    if (idCategoria)  req.input('idCategoria',  sql.BigInt,       idCategoria);

    const r = await req.query(`
      SELECT p.idProducto, p.Nombre, p.Descripcion, p.PrecioUSD, p.ImagenProducto,
             p.EsProductoPlus, p.idCategoria, c.Nombre AS NombreCategoria,
             inv.Cantidad AS StockDisponible,
             inv.idPuntoVenta,
             pv.NomComercial AS NombreSucursal, pv.Ciudad
      FROM VIDA_INVENTARIO_PRODUCTOS p
      INNER JOIN VIDA_INVENTARIO_STOCK inv
        ON inv.idBranch=p.idBranch AND inv.idCuenta=p.idCuenta
           AND inv.idProducto=p.idProducto AND inv.Cantidad > 0
      INNER JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch=inv.idBranch AND pv.idCuenta=inv.idCuenta
           AND pv.idPuntoVenta=inv.idPuntoVenta AND pv.Status='ACTIVO'
      LEFT JOIN VIDA_INVENTARIO_CATEGORIAS c
        ON c.idBranch=p.idBranch AND c.idCuenta=p.idCuenta AND c.idCategoria=p.idCategoria
      WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
        AND p.Status='ACTIVO'
        ${whereExtra}
      ORDER BY p.Nombre, pv.NomComercial
    `);

    // Adjuntar precio promocional (si hay promo vigente que aplique al producto)
    const promos = await promocionesVigentes(pool, idBranch, idCuenta);
    const productos = r.recordset.map(p => {
      const unit = mejorPromoUnitaria(promos, p);
      const combo = promos.find(x => x.Tipo === 'NXM' &&
        (x.Alcance === 'TODO'
         || (x.Alcance === 'PRODUCTO'  && String(x.idProducto)  === String(p.idProducto))
         || (x.Alcance === 'CATEGORIA' && String(x.idCategoria) === String(p.idCategoria))));
      return {
        ...p,
        PrecioPromo: unit ? unit.precioUnitario : null,
        PromoNombre: unit ? unit.promo.Nombre : (combo ? combo.Nombre : null),
        // Etiqueta corta para el badge de la app
        PromoBadge: combo ? `${parseInt(combo.Valor)}x${parseInt(combo.Valor2)}`
                    : (unit && unit.promo.Tipo === 'DESCUENTO_PCT' ? `-${parseInt(unit.promo.Valor)}%`
                    : (unit ? 'OFERTA' : null)),
      };
    });

    return reply.send(productos);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener productos' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CREAR PEDIDO DESDE APP
// POST /delivery/pedido
// ══════════════════════════════════════════════════════════════════════════
export async function cotizacionMonedaCliente(request, reply) {
  const {idBranch,idCuenta,idCliente}=request.cliente;
  try {
    const cfg=await prepararMoneda(await getPool(),{idBranch,idCuenta,idUsuario:idCliente});
    if(!cfg.tasa||!cfg.tasa.Vigente) return reply.code(422).send({error:'No hay una tasa vigente para cobrar'});
    return reply.send({Modo:cfg.Modo,tasa:{idTasa:cfg.tasa.idTasa,VESporUSD:cfg.tasa.VESporUSD,FechaValor:cfg.tasa.FechaValor,Fuente:cfg.tasa.Fuente}});
  } catch(err) {
    request.log.error(err);return reply.code(err.statusCode||503).send({error:err.message||'No se pudo consultar la tasa'});
  }
}

export async function crearPedidoApp(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const {
    idPuntoVenta, items, DireccionEntrega,
    UbicacionEntregaLat, UbicacionEntregaLon,
    NotasCliente, MetodoPago = 'EFECTIVO',
    PuntosUsar = 0, CuponCodigo = null, PagoMoneda = null,
  } = request.body;

  if (!idPuntoVenta || !items?.length) {
    return reply.code(400).send({ error: 'idPuntoVenta e items son requeridos' });
  }
  const requiereAprobacionPago = MetodoPago === 'PAGO_MOVIL';
  const statusInicial = requiereAprobacionPago ? 'ESPERANDO_PAGO' : 'BUSCANDO_REPARTIDOR';
  for (const item of items) {
    const cant = parseFloat(item.Cantidad);
    if (!item.idProducto || !(cant > 0)) {
      return reply.code(400).send({ error: 'Cada item requiere idProducto y Cantidad mayor a 0' });
    }
  }

  try {
    const pool = await getPool();

    // ── Precios desde la BD: nunca confiar en el precio que manda la app ──
    const idsProductos = [...new Set(items.map(i => parseInt(i.idProducto)))];
    const preciosReq = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta);
    idsProductos.forEach((id, i) => preciosReq.input(`p${i}`, sql.BigInt, id));
    const preciosR = await preciosReq.query(`
      SELECT idProducto, PrecioUSD, idCategoria FROM VIDA_INVENTARIO_PRODUCTOS
      WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO'
        AND idProducto IN (${idsProductos.map((_, i) => `@p${i}`).join(',')})`);

    const prodPorId = new Map(preciosR.recordset.map(p => [String(p.idProducto), p]));
    for (const item of items) {
      if (!prodPorId.has(String(item.idProducto))) {
        return reply.code(400).send({ error: `Producto ${item.idProducto} no existe o está inactivo` });
      }
    }

    // ── Aplicar promociones vigentes (precio efectivo por línea) ──────────
    // El precio y el descuento salen del servidor; nunca se confía en la app.
    const promos = await promocionesVigentes(pool, idBranch, idCuenta);
    const itemsNorm = items.map(i => {
      const prod = prodPorId.get(String(i.idProducto));
      const cantidad = parseFloat(i.Cantidad);
      const linea = calcularLinea(promos, prod, cantidad);
      // Precio unitario efectivo = subtotal / cantidad (uniforme, para el detalle)
      const precioUnitEfectivo = cantidad > 0 ? linea.subtotal / cantidad : parseFloat(prod.PrecioUSD);
      return {
        idProducto: parseInt(i.idProducto),
        Cantidad: cantidad,
        PrecioUnitario: +precioUnitEfectivo.toFixed(4),
        Subtotal: linea.subtotal, // subtotal exacto (sin deriva de redondeo)
        idPromocion: linea.promoAplicada?.idPromocion ?? null,
      };
    });

    // ── Verificar stock de cada item ──────────────────────────────────────
    for (const item of itemsNorm) {
      const stockR = await pool.request()
        .input('idBranch',     sql.BigInt, idBranch)
        .input('idCuenta',     sql.BigInt, idCuenta)
        .input('idProducto',   sql.BigInt, item.idProducto)
        .input('idPuntoVenta', sql.BigInt, idPuntoVenta)
        .query(`SELECT ISNULL(Cantidad,0) AS Cantidad FROM VIDA_INVENTARIO_STOCK
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                  AND idProducto=@idProducto AND idPuntoVenta=@idPuntoVenta`);
      const stock = stockR.recordset[0]?.Cantidad ?? 0;
      if (stock < item.Cantidad) {
        return reply.code(409).send({
          error: `Stock insuficiente para producto ${item.idProducto}`,
          disponible: stock,
        });
      }
    }

    // ── Calcular subtotal con los subtotales exactos (precios/promos de BD) ──
    const subtotal = +itemsNorm.reduce((acc, i) => acc + i.Subtotal, 0).toFixed(2);

    // ── Canje de puntos (opcional): descuento hasta el subtotal ───────────
    let puntosUsados = 0, descuentoPuntos = 0;
    const pedirPuntos = Math.max(0, Math.floor(Number(PuntosUsar) || 0));
    if (pedirPuntos > 0) {
      const canjeRate = parseInt(await getConfigVal(pool, idBranch, idCuenta, 'PuntosPorDolarCanje', '100')) || 100;
      const saldoR = await pool.request()
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta)
        .input('idCliente', sql.BigInt, idCliente)
        .query(`SELECT ISNULL(PuntosSaldo,0) AS PuntosSaldo FROM VIDA_APP_CLIENTES
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
      const saldo = saldoR.recordset[0]?.PuntosSaldo ?? 0;
      const maxPorSubtotal = Math.floor(subtotal * canjeRate); // no pasar del subtotal
      puntosUsados = Math.min(pedirPuntos, saldo, maxPorSubtotal);
      descuentoPuntos = +(puntosUsados / canjeRate).toFixed(2);
    }
    let TotalUSD = +(subtotal - descuentoPuntos).toFixed(2);
    let descuentoCupon=0,cupon=null,pagoSnapshot=null;

    // La tasa se consulta fuera de la transacción; al guardar se valida por ID.
    if(PagoMoneda) {
      const cfg=await prepararMoneda(pool,{idBranch,idCuenta,idUsuario:idCliente});
      if(String(cfg.tasa?.idTasa)!==String(PagoMoneda.idTasa))
        return reply.code(409).send({error:'La tasa cambió. Actualiza el pago antes de confirmar.'});
    }

    // ── Obtener nombre de sucursal para broadcast ─────────────────────────
    const pvR = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idPuntoVenta', sql.BigInt, idPuntoVenta)
      .query(`SELECT NomComercial, Latitud, Longitud
              FROM VIDA_CUENTA_PUNTOS_VENTA
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@idPuntoVenta`);
    const pv = pvR.recordset[0];

    // ── Insertar cabecera + detalles en una transacción ──────────────────
    // Si falla cualquier INSERT, no queda pedido a medias en la BD
    const transaction = new sql.Transaction(pool);
    let idPedido;
    try {
      await transaction.begin();

      if(CuponCodigo) {
        const cr=await new sql.Request(transaction).input('b',sql.BigInt,idBranch).input('c',sql.BigInt,idCuenta)
          .input('codigo',sql.VarChar(40),String(CuponCodigo).trim().toUpperCase().slice(0,40))
          .query(`SELECT TOP 1 * FROM VIDA_CUPONES WITH (UPDLOCK,HOLDLOCK)
                  WHERE idBranch=@b AND idCuenta=@c AND Codigo=@codigo`);
        cupon=cr.recordset[0];
        const ev=evaluarCupon(cupon,{subtotal:TotalUSD,canal:'DELIVERY',items:itemsNorm.map(i=>({idProducto:i.idProducto,idCategoria:prodPorId.get(String(i.idProducto)).idCategoria,subtotal:i.Subtotal}))});
        if(!ev.ok) throw Object.assign(new Error(ev.motivo),{statusCode:422});
        const usos=await new sql.Request(transaction).input('b',sql.BigInt,idBranch).input('c',sql.BigInt,idCuenta)
          .input('cupon',sql.BigInt,cupon.idCupon).input('cliente',sql.BigInt,idCliente)
          .query(`SELECT COUNT(*) n FROM VIDA_CUPONES_USOS WITH (UPDLOCK,HOLDLOCK) WHERE idBranch=@b AND idCuenta=@c AND idCupon=@cupon AND idCliente=@cliente`);
        if(cupon.UsosPorCliente!=null&&usos.recordset[0].n>=Number(cupon.UsosPorCliente)) throw Object.assign(new Error('Ya usaste este cupón'),{statusCode:409});
        descuentoCupon=ev.descuento;TotalUSD=+Math.max(0,TotalUSD-descuentoCupon).toFixed(2);
      }
      if(PagoMoneda) {
        const cfg=await leerMoneda(transaction,idBranch,idCuenta);
        const tr=await new sql.Request(transaction).input('b',sql.BigInt,idBranch).input('c',sql.BigInt,idCuenta).input('id',sql.BigInt,PagoMoneda.idTasa)
          .query(`SELECT TOP 1 * FROM VIDA_TASAS_CAMBIO WHERE idBranch=@b AND idCuenta=@c AND idTasa=@id`);
        if(!tr.recordset[0]||String(cfg.tasa?.idTasa)!==String(PagoMoneda.idTasa)) throw Object.assign(new Error('La tasa cambió. Actualiza el pago.'),{statusCode:409});
        pagoSnapshot=calcularPagoDelivery(TotalUSD,{...PagoMoneda,Metodo:MetodoPago},tr.recordset[0],cfg.Modo);
      }

      idPedido = await nextIdTx(transaction, 'VIDA_PEDIDOS', 'idPedido', idBranch, idCuenta);

      await new sql.Request(transaction)
        .input('idBranch',            sql.BigInt,      idBranch)
        .input('idCuenta',            sql.BigInt,      idCuenta)
        .input('idPedido',            sql.BigInt,      idPedido)
        .input('idPuntoVenta',        sql.BigInt,      idPuntoVenta)
        .input('idCliente',           sql.BigInt,      idCliente)
        .input('Canal',               sql.VarChar(10), 'APP')
        .input('Status',              sql.VarChar(40), statusInicial)
        .input('MetodoPago',          sql.VarChar(20), MetodoPago)
        .input('StatusPago',          sql.VarChar(20), 'PENDIENTE')
        .input('TotalUSD',            sql.Decimal(18,4), TotalUSD)
        .input('PagoMonedaJSON',      sql.NVarChar(sql.MAX), pagoSnapshot?JSON.stringify(pagoSnapshot):null)
        .input('CuponCodigo',         sql.VarChar(40), cupon?.Codigo||null)
        .input('CuponDescuentoUSD',   sql.Decimal(18,4), descuentoCupon)
        .input('DescuentoPuntosUSD',  sql.Decimal(18,4), descuentoPuntos)
        .input('PuntosUsados',        sql.Int,           puntosUsados)
        .input('DireccionEntrega',    sql.VarChar(500), DireccionEntrega    || null)
        .input('UbicacionEntregaLat', sql.Decimal(10,7), UbicacionEntregaLat ?? null)
        .input('UbicacionEntregaLon', sql.Decimal(10,7), UbicacionEntregaLon ?? null)
        .input('NotasCliente',        sql.VarChar(500), NotasCliente        || null)
        .query(`INSERT INTO VIDA_PEDIDOS
                  (idBranch,idCuenta,idPedido,idPuntoVenta,idCliente,Canal,Status,
                   MetodoPago,StatusPago,TotalUSD,PagoMonedaJSON,CuponCodigo,CuponDescuentoUSD,DescuentoPuntosUSD,PuntosUsados,DireccionEntrega,
                   UbicacionEntregaLat,UbicacionEntregaLon,NotasCliente,FechaAlta)
                VALUES
                  (@idBranch,@idCuenta,@idPedido,@idPuntoVenta,@idCliente,@Canal,@Status,
                   @MetodoPago,@StatusPago,@TotalUSD,@PagoMonedaJSON,@CuponCodigo,@CuponDescuentoUSD,@DescuentoPuntosUSD,@PuntosUsados,@DireccionEntrega,
                   @UbicacionEntregaLat,@UbicacionEntregaLon,@NotasCliente,GETUTCDATE())`);

      // ── Debitar puntos usados (atómico: solo si el saldo alcanza) ────────
      if (puntosUsados > 0) {
        const debR = await new sql.Request(transaction)
          .input('idBranch', sql.BigInt, idBranch)
          .input('idCuenta', sql.BigInt, idCuenta)
          .input('idCliente', sql.BigInt, idCliente)
          .input('Puntos', sql.Int, puntosUsados)
          .query(`UPDATE VIDA_APP_CLIENTES SET PuntosSaldo = PuntosSaldo - @Puntos
                  WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente
                    AND ISNULL(PuntosSaldo,0) >= @Puntos`);
        if (!debR.rowsAffected[0]) {
          throw new Error('SALDO_PUNTOS_INSUFICIENTE');
        }
        const movId = await nextIdTx(transaction, 'VIDA_CLIENTE_PUNTOS', 'idMovimiento', idBranch, idCuenta);
        await new sql.Request(transaction)
          .input('idBranch',    sql.BigInt,      idBranch)
          .input('idCuenta',    sql.BigInt,      idCuenta)
          .input('idMovimiento',sql.BigInt,      movId)
          .input('idCliente',   sql.BigInt,      idCliente)
          .input('Puntos',      sql.Int,         -puntosUsados)
          .input('idPedido',    sql.BigInt,      idPedido)
          .input('Descripcion', sql.NVarChar(200), `Canje en pedido #${idPedido} (−$${descuentoPuntos.toFixed(2)})`)
          .query(`INSERT INTO VIDA_CLIENTE_PUNTOS
                    (idBranch,idCuenta,idMovimiento,idCliente,Tipo,Puntos,idPedido,Descripcion)
                  VALUES (@idBranch,@idCuenta,@idMovimiento,@idCliente,'CANJEADO',@Puntos,@idPedido,@Descripcion)`);
      }

      let idDetalle = await nextIdTx(transaction, 'VIDA_PEDIDOS_DETALLE', 'idDetalle', idBranch, idCuenta);
      for (const item of itemsNorm) {
        await new sql.Request(transaction)
          .input('idBranch',       sql.BigInt,      idBranch)
          .input('idCuenta',       sql.BigInt,      idCuenta)
          .input('idPedido',       sql.BigInt,      idPedido)
          .input('idDetalle',      sql.BigInt,      idDetalle++)
          .input('idProducto',     sql.BigInt,      item.idProducto)
          .input('Cantidad',       sql.Decimal(18,4), item.Cantidad)
          .input('PrecioUnitario', sql.Decimal(18,4), item.PrecioUnitario)
          .query(`INSERT INTO VIDA_PEDIDOS_DETALLE
                    (idBranch,idCuenta,idPedido,idDetalle,idProducto,Cantidad,PrecioUnitario)
                  VALUES
                    (@idBranch,@idCuenta,@idPedido,@idDetalle,@idProducto,@Cantidad,@PrecioUnitario)`);
      }

      if(cupon) {
        const inc=await new sql.Request(transaction).input('b',sql.BigInt,idBranch).input('c',sql.BigInt,idCuenta).input('id',sql.BigInt,cupon.idCupon)
          .query(`UPDATE VIDA_CUPONES SET UsosActuales=UsosActuales+1 WHERE idBranch=@b AND idCuenta=@c AND idCupon=@id AND (UsosMax IS NULL OR UsosActuales<UsosMax)`);
        if(!inc.rowsAffected[0]) throw Object.assign(new Error('El cupón agotó sus usos'),{statusCode:409});
        const idUso=await nextIdTx(transaction,'VIDA_CUPONES_USOS','idUso',idBranch,idCuenta);
        await new sql.Request(transaction).input('b',sql.BigInt,idBranch).input('c',sql.BigInt,idCuenta).input('id',sql.BigInt,idUso)
          .input('cupon',sql.BigInt,cupon.idCupon).input('codigo',sql.VarChar(40),cupon.Codigo).input('cliente',sql.BigInt,idCliente)
          .input('pedido',sql.BigInt,idPedido).input('d',sql.Decimal(18,4),descuentoCupon).input('u',sql.VarChar(30),String(idCliente))
          .query(`INSERT VIDA_CUPONES_USOS(idBranch,idCuenta,idUso,idCupon,Codigo,idCliente,idPedido,Canal,DescuentoUSD,UsuAlta)
                  VALUES(@b,@c,@id,@cupon,@codigo,@cliente,@pedido,'DELIVERY',@d,@u)`);
      }

      await transaction.commit();
    } catch (txErr) {
      try { await transaction.rollback(); } catch (rbErr) { request.log.error('Rollback falló: ' + rbErr.message); }
      throw txErr;
    }

    // Pago Móvil se queda retenido hasta que un administrador apruebe el
    // comprobante. No inicia reloj, radio ni notificaciones de reparto antes.
    if (requiereAprobacionPago) {
      return reply.code(201).send({
        idPedido, status: statusInicial, StatusPago: 'PENDIENTE',
        TotalUSD, subtotal, descuentoPuntos, puntosUsados, descuentoCupon,
        PagoMoneda: pagoSnapshot,
      });
    }

    // Deadline de búsqueda: pasado este tiempo sin repartidor el job de
    // despacho cancela el pedido (el cliente puede extenderlo desde la app)
    const cancelMin = parseInt(await getConfigVal(pool, idBranch, idCuenta, 'TiempoCancelacionBusquedaMin', '25')) || 25;
    await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idPedido', sql.BigInt, idPedido)
      .input('min',      sql.Int,    cancelMin)
      .query(`UPDATE VIDA_PEDIDOS SET FechaLimiteBusqueda = DATEADD(MINUTE, @min, GETUTCDATE())
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);

    // ── Buscar repartidores disponibles ───────────────────────────────────
    const radioKm = parseFloat(await getConfigVal(pool, idBranch, idCuenta, 'RadioBusquedaKm', '3'));
    const maxPedidosRep = parseInt(await getConfigVal(pool, idBranch, idCuenta, 'MaxPedidosPorRepartidor', '3')) || 3;
    // Multi-pedido: también se ofrece a repartidores OCUPADOS con cupo
    const filtroCupo = `
      AND ISNULL(r.StatusAprobacion,'APROBADO') NOT IN ('PENDIENTE','RECHAZADO')
      AND r.StatusRepartidor IN ('DISPONIBLE','OCUPADO')
      AND (SELECT COUNT(*) FROM VIDA_PEDIDOS pa
           WHERE pa.idBranch=r.idBranch AND pa.idCuenta=r.idCuenta
             AND pa.idRepartidor=r.idRepartidor
             AND pa.Status IN ('${STATUS_ACTIVOS_REPARTIDOR.join("','")}')) < @maxPedidos`;

    let repartidoresQuery;
    if (pv?.Latitud && pv?.Longitud) {
      repartidoresQuery = pool.request()
        .input('idBranch',     sql.BigInt,  idBranch)
        .input('idCuenta',     sql.BigInt,  idCuenta)
        .input('latSucursal',  sql.Float,   parseFloat(pv.Latitud))
        .input('lonSucursal',  sql.Float,   parseFloat(pv.Longitud))
        .input('radioKm',      sql.Float,   radioKm)
        .input('maxPedidos',   sql.Int,     maxPedidosRep)
        .query(`
          SELECT r.idRepartidor, r.Nombre, r.Telefono, r.FcmToken,
            CASE
              WHEN r.UltimaLatitud IS NULL OR r.UltimaLongitud IS NULL THEN NULL
              ELSE (6371 * ACOS(
                COS(RADIANS(@latSucursal)) * COS(RADIANS(r.UltimaLatitud)) *
                COS(RADIANS(r.UltimaLongitud) - RADIANS(@lonSucursal)) +
                SIN(RADIANS(@latSucursal)) * SIN(RADIANS(r.UltimaLatitud))
              ))
            END AS DistanciaKm
          FROM VIDA_REPARTIDORES r
          WHERE r.idBranch=@idBranch AND r.idCuenta=@idCuenta
            AND r.Status='ACTIVO'
            ${filtroCupo}
            AND (
              r.UltimaLatitud IS NULL OR r.UltimaLongitud IS NULL
              OR (6371 * ACOS(
                COS(RADIANS(@latSucursal)) * COS(RADIANS(r.UltimaLatitud)) *
                COS(RADIANS(r.UltimaLongitud) - RADIANS(@lonSucursal)) +
                SIN(RADIANS(@latSucursal)) * SIN(RADIANS(r.UltimaLatitud))
              )) <= @radioKm
            )
        `);
    } else {
      repartidoresQuery = pool.request()
        .input('idBranch',   sql.BigInt, idBranch)
        .input('idCuenta',   sql.BigInt, idCuenta)
        .input('maxPedidos', sql.Int,    maxPedidosRep)
        .query(`SELECT r.idRepartidor, r.Nombre, r.Telefono, r.FcmToken, NULL AS DistanciaKm
                FROM VIDA_REPARTIDORES r
                WHERE r.idBranch=@idBranch AND r.idCuenta=@idCuenta
                  AND r.Status='ACTIVO'
                  ${filtroCupo}`);
    }

    const repartidores = await repartidoresQuery;

    // ── Broadcast WS a repartidores disponibles ───────────────────────────
    broadcast(idBranch, idCuenta, {
      tipo:            'nuevo_pedido_disponible',
      idPedido,
      idPuntoVenta,
      NombreSucursal:  pv?.NomComercial ?? '',
      TotalUSD,
      MetodoPago,
      Cobro:           cobroSeguro({ metodoPago: MetodoPago, totalUSD: TotalUSD, pagoMonedaJSON: pagoSnapshot }),
      DireccionEntrega,
      items,
      repartidores:    repartidores.recordset.map(r => r.idRepartidor),
    });

    // Push a repartidores disponibles — les llega aunque tengan la app
    // en background o el teléfono bloqueado (el WS solo funciona en foreground)
    enviarPush(
      repartidores.recordset.map(r => r.FcmToken),
      {
        title: '🛵 Nuevo pedido disponible',
        body: `${pv?.NomComercial ?? 'Sucursal'} — $${TotalUSD.toFixed(2)} · ${DireccionEntrega || 'ver dirección en la app'}`,
        data: { tipo: 'nuevo_pedido_disponible', idPedido },
      },
      request.log,
    );

    return reply.code(201).send({
      idPedido, status: statusInicial,
      TotalUSD, subtotal, descuentoPuntos, puntosUsados, descuentoCupon, PagoMoneda:pagoSnapshot,
    });
  } catch (err) {
    if (String(err.message) === 'SALDO_PUNTOS_INSUFICIENTE') {
      return reply.code(409).send({ error: 'No tienes puntos suficientes para ese canje.' });
    }
    request.log.error(err);
    return reply.code(err.statusCode||500).send({ error: err.statusCode?err.message:'Error al crear pedido' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ESTADO DEL PEDIDO PARA EL CLIENTE
// GET /delivery/pedido/:idPedido/estado
// ══════════════════════════════════════════════════════════════════════════
export async function estadoPedidoCliente(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const { idPedido } = request.params;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idPedido',  sql.BigInt, idPedido)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`
        SELECT p.Status, p.StatusPago, p.MetodoPago, p.TotalUSD,
               p.PagoMonedaJSON, p.CuponCodigo, p.CuponDescuentoUSD,
               p.DireccionEntrega, p.NotasCliente,
               p.UbicacionEntregaLat, p.UbicacionEntregaLon,
               p.ETAEntrega, p.OrdenRuta, p.DistanciaKm,
               CASE WHEN p.OrdenRuta IS NOT NULL AND p.OrdenRuta > 1
                    THEN p.OrdenRuta - 1 ELSE 0 END AS ParadasAntes,
               DATEDIFF(MINUTE, GETUTCDATE(), p.ETAEntrega) AS MinutosRestantes,
               p.FechaLimiteBusqueda, p.AvisoSinRepartidor,
               DATEDIFF(SECOND, GETUTCDATE(), p.FechaLimiteBusqueda) AS SegundosBusquedaRestantes,
               ${SQL_SEGUNDOS_SIN_PAGO} AS SegundosSinPago,
               (SELECT COUNT(*) FROM VIDA_PEDIDOS_COMPROBANTES c
                WHERE c.idBranch=p.idBranch AND c.idCuenta=p.idCuenta AND c.idPedido=p.idPedido
                  AND c.StatusRevision='PENDIENTE') AS ComprobantesPendientes,
               rep.Nombre AS NombreRepartidor,
               rep.Telefono AS TelefonoRepartidor,
               rep.Vehiculo AS VehiculoRepartidor,
               rep.PlacaVehiculo AS PlacaRepartidor,
               rep.FotoURL AS FotoRepartidor,
               rep.Calificacion AS CalificacionRepartidor,
               rep.TotalCalificaciones AS TotalCalificacionesRepartidor,
               rep.UltimaLatitud AS LatRepartidor,
               rep.UltimaLongitud AS LonRepartidor,
               CASE WHEN EXISTS (
                 SELECT 1 FROM VIDA_REPARTIDORES_CALIFICACIONES c
                 WHERE c.idBranch=p.idBranch AND c.idCuenta=p.idCuenta AND c.idPedido=p.idPedido
               ) THEN 1 ELSE 0 END AS YaCalificado
        FROM VIDA_PEDIDOS p
        LEFT JOIN VIDA_REPARTIDORES rep
          ON rep.idBranch=p.idBranch AND rep.idCuenta=p.idCuenta AND rep.idRepartidor=p.idRepartidor
        WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
          AND p.idPedido=@idPedido AND p.idCliente=@idCliente
      `);

    if (!r.recordset.length) {
      return reply.code(404).send({ error: 'Pedido no encontrado' });
    }

    // Tiempo para mandar el comprobante de Pago Móvil antes de que el pedido
    // se cancele solo. Sin plazo mientras hay un comprobante en revisión.
    const { SegundosSinPago, ...estado } = r.recordset[0];
    let SegundosPagoRestantes = null;
    if (estado.Status === 'ESPERANDO_PAGO' && estado.MetodoPago === 'PAGO_MOVIL' && !estado.ComprobantesPendientes) {
      const plazo = plazoPagoMinutos(await getConfigVal(pool, idBranch, idCuenta, 'PlazoPagoMovilMin', ''));
      if (plazo) SegundosPagoRestantes = Math.max(0, plazo * 60 - Number(SegundosSinPago));
    }
    return reply.send({ ...estado, SegundosPagoRestantes });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener estado del pedido' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — HISTORIAL DE PEDIDOS
// GET /delivery/cliente/pedidos
// ══════════════════════════════════════════════════════════════════════════
export async function historialPedidosCliente(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`
        SELECT TOP 50
          p.idPedido, p.Status, p.StatusPago, p.MetodoPago, p.TotalUSD,
          p.PagoMonedaJSON, p.CuponCodigo, p.CuponDescuentoUSD,
          p.FechaAlta AS FechaCreacion, p.DireccionEntrega,
          (SELECT COUNT(*) FROM VIDA_PEDIDOS_DETALLE d
           WHERE d.idBranch=p.idBranch AND d.idCuenta=p.idCuenta AND d.idPedido=p.idPedido) AS TotalItems
        FROM VIDA_PEDIDOS p
        WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta AND p.idCliente=@idCliente
        ORDER BY p.FechaAlta DESC
      `);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener historial' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — EXTENDER LA BÚSQUEDA DE REPARTIDOR
// POST /delivery/pedido/:idPedido/extender-busqueda
// ══════════════════════════════════════════════════════════════════════════
export async function extenderBusquedaPedido(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const { idPedido } = request.params;

  try {
    const pool = await getPool();
    const extMin = parseInt(await getConfigVal(pool, idBranch, idCuenta, 'ExtensionBusquedaMin', '10')) || 10;

    const upd = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idPedido',  sql.BigInt, idPedido)
      .input('idCliente', sql.BigInt, idCliente)
      .input('min',       sql.Int,    extMin)
      .query(`UPDATE VIDA_PEDIDOS
              SET FechaLimiteBusqueda = DATEADD(MINUTE, @min, GETUTCDATE()), FechaMod = GETUTCDATE()
              OUTPUT inserted.FechaLimiteBusqueda
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND idPedido=@idPedido AND idCliente=@idCliente
                AND Status='BUSCANDO_REPARTIDOR'`);

    if (!upd.recordset.length) {
      return reply.code(409).send({ error: 'El pedido ya no está en búsqueda de repartidor' });
    }

    return reply.send({
      ok: true,
      minutosExtra: extMin,
      FechaLimiteBusqueda: upd.recordset[0].FechaLimiteBusqueda,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al extender la búsqueda' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — CANCELAR SU PEDIDO (solo mientras busca repartidor)
// POST /delivery/pedido/:idPedido/cancelar
// ══════════════════════════════════════════════════════════════════════════
export async function cancelarPedidoCliente(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const { idPedido } = request.params;

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  let enTransaccion = false;

  try {
    await transaction.begin();
    enTransaccion = true;

    // Estado actual con bloqueo (una subida de comprobante concurrente bloquea
    // la misma fila, así que no se cruzan).
    const actualR = await new sql.Request(transaction)
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idPedido',  sql.BigInt, idPedido)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT p.Status,
                (SELECT COUNT(*) FROM VIDA_PEDIDOS_COMPROBANTES c
                 WHERE c.idBranch=p.idBranch AND c.idCuenta=p.idCuenta AND c.idPedido=p.idPedido
                   AND c.StatusRevision='PENDIENTE') AS ComprobantesPendientes
              FROM VIDA_PEDIDOS p WITH (UPDLOCK, HOLDLOCK)
              WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
                AND p.idPedido=@idPedido AND p.idCliente=@idCliente`);
    const actual = actualR.recordset[0];
    // Pago Móvil sin pagar (o con el comprobante rechazado) también se puede
    // cancelar; con un comprobante en revisión no, porque podría haber dinero
    // de por medio y eso lo resuelve la tienda.
    const rechazo = !actual ? { code: 404, error: 'Pedido no encontrado' }
      : actual.Status === 'ESPERANDO_PAGO' && actual.ComprobantesPendientes > 0
        ? { code: 409, error: 'Tu comprobante de pago está en revisión. Espera la respuesta de la tienda o contáctala para cancelar.' }
      : !['BUSCANDO_REPARTIDOR', 'ESPERANDO_PAGO'].includes(actual.Status)
        ? { code: 409, error: 'El pedido ya no se puede cancelar (un repartidor ya lo tomó o ya fue procesado)' }
      : null;
    if (rechazo) {
      await transaction.rollback();
      enTransaccion = false;
      return reply.code(rechazo.code).send({ error: rechazo.error });
    }
    const statusAnterior = actual.Status;

    await new sql.Request(transaction)
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idPedido',  sql.BigInt, idPedido)
      .input('StatusAnterior', sql.VarChar(40), statusAnterior)
      .query(`UPDATE VIDA_PEDIDOS SET Status='CANCELADO', FechaMod=GETUTCDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido
                AND Status=@StatusAnterior`);

    // Devolver los puntos canjeados (si los hubo)
    await reembolsarPuntosPedido(() => new sql.Request(transaction), idBranch, idCuenta, idPedido);

    const histId = await nextIdTx(transaction, 'VIDA_PEDIDOS_HISTORIAL', 'idHistorial', idBranch, idCuenta);
    await new sql.Request(transaction)
      .input('idBranch',      sql.BigInt,      idBranch)
      .input('idCuenta',      sql.BigInt,      idCuenta)
      .input('idHistorial',   sql.BigInt,      histId)
      .input('idPedido',      sql.BigInt,      idPedido)
      .input('StatusAnterior',sql.VarChar(40), statusAnterior)
      .input('StatusNuevo',   sql.VarChar(40), 'CANCELADO')
      .input('UsuAlta',       sql.VarChar(20), `CLI:${idCliente}`)
      .query(`INSERT INTO VIDA_PEDIDOS_HISTORIAL
                (idBranch, idCuenta, idHistorial, idPedido, StatusAnterior, StatusNuevo, UsuAlta)
              VALUES (@idBranch, @idCuenta, @idHistorial, @idPedido, @StatusAnterior, @StatusNuevo, @UsuAlta)`);

    await transaction.commit();
    enTransaccion = false;

    broadcast(idBranch, idCuenta, {
      tipo: 'status_pedido', idPedido: Number(idPedido), idCliente, estado: 'CANCELADO',
    });
    broadcast(idBranch, idCuenta, {
      tipo: 'pedido:actualizado', idPedido: Number(idPedido), StatusNuevo: 'CANCELADO',
    });

    return reply.send({ ok: true, status: 'CANCELADO' });
  } catch (err) {
    if (enTransaccion) {
      try { await transaction.rollback(); } catch {}
    }
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al cancelar el pedido' });
  }
}
