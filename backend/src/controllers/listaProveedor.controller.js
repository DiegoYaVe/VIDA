// src/controllers/listaProveedor.controller.js
// Lista de precios del proveedor por layout de Excel (tarea 26). Solo VIDA.
//
// GET  /proveedores/:idProveedor/lista            → lo que hoy tiene el proveedor (para armar el layout)
// POST /proveedores/:idProveedor/lista            { filas, confirmar, vigenteHasta?, marcarAusentes? }
//   · confirmar=false → solo revisa (qué actualiza, liga, queda por aprobar o tiene error)
//   · confirmar=true  → guarda TODO o NADA en una transacción
// GET  /proveedores/productos-nuevos?status=PENDIENTE
// POST /proveedores/productos-nuevos/:idNuevo/aprobar  { modo:'CREAR'|'VINCULAR', idCategoria?, PrecioUSD?, Nombre?, SKU?, idProducto? }
// POST /proveedores/productos-nuevos/:idNuevo/rechazar { Motivo? }
// El panel lee el Excel; aquí se vuelve a validar con las mismas reglas
// (domain/listaProveedor.mjs), nunca se confía en el cliente.
import { getPool, sql } from '../db/sqlserver.js';
import { registrarAuditoria } from '../services/audit.service.js';
import { planLista, MAX_FILAS_LISTA } from '../domain/listaProveedor.mjs';

const UNIDAD_PRODUCTO = { Pieza: 'Pieza', Caja: 'Pieza', Bulto: 'Pieza', Kg: 'Kg', Litro: 'Litro' };   // el precio es por unidad
const fechaValida = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);

async function proveedorDe(pool, idBranch, idCuenta, idProveedor) {
  const r = await pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
    .input('idProveedor', sql.BigInt, idProveedor)
    .query(`SELECT idProveedor, Nombre, Status, ListaFechaCarga, ListaVigenteHasta FROM VIDA_PROVEEDORES
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idProveedor=@idProveedor`);
  return r.recordset[0] || null;
}

// Productos del proveedor con los datos del producto VIDA
async function actualesDe(pool, idBranch, idCuenta, idProveedor) {
  const r = await pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
    .input('idProveedor', sql.BigInt, idProveedor)
    .query(`SELECT pp.idProducto, pp.CodigoProveedor, pp.PrecioCosto, pp.Disponible, pp.UnidadCompra, pp.UnidadesEmpaque,
                   pp.PrecioSugeridoUSD, pp.PedidoMinimo, pp.DiasEntrega,
                   p.Nombre, p.CodigoBarras, p.PrecioUSD, p.AlicuotaIVA, p.PesoKg, c.Nombre AS NombreCategoria
            FROM VIDA_PROVEEDORES_PRODUCTOS pp
            JOIN VIDA_INVENTARIO_PRODUCTOS p ON p.idBranch=pp.idBranch AND p.idCuenta=pp.idCuenta AND p.idProducto=pp.idProducto
            LEFT JOIN VIDA_INVENTARIO_CATEGORIAS c ON c.idBranch=p.idBranch AND c.idCuenta=p.idCuenta AND c.idCategoria=p.idCategoria
            WHERE pp.idBranch=@idBranch AND pp.idCuenta=@idCuenta AND pp.idProveedor=@idProveedor
            ORDER BY p.Nombre`);
  return r.recordset.map(a => ({ ...a, Disponible: !!a.Disponible }));
}

// GET /proveedores/:idProveedor/lista
export async function verListaProveedor(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();
    const prov = await proveedorDe(pool, idBranch, idCuenta, request.params.idProveedor);
    if (!prov) return reply.code(404).send({ error: 'Proveedor no encontrado' });
    return reply.send({ proveedor: prov, productos: await actualesDe(pool, idBranch, idCuenta, prov.idProveedor) });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al leer la lista del proveedor' });
  }
}

// POST /proveedores/:idProveedor/lista
export async function cargarListaProveedor(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const b = request.body || {};
  const filas = Array.isArray(b.filas) ? b.filas : null;
  if (!filas || !filas.length) return reply.code(400).send({ error: 'El archivo no trae productos' });
  if (filas.length > MAX_FILAS_LISTA) return reply.code(400).send({ error: `Máximo ${MAX_FILAS_LISTA} productos por archivo; divídelo en varios` });
  const vigenteHasta = b.vigenteHasta ? fechaValida(b.vigenteHasta) : null;
  if (b.vigenteHasta && !vigenteHasta) return reply.code(400).send({ error: 'Fecha de vigencia no válida' });

  try {
    const pool = await getPool();
    const prov = await proveedorDe(pool, idBranch, idCuenta, request.params.idProveedor);
    if (!prov) return reply.code(404).send({ error: 'Proveedor no encontrado' });
    const base = () => pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('idProveedor', sql.BigInt, prov.idProveedor);
    const [actuales, catR, penR] = await Promise.all([
      actualesDe(pool, idBranch, idCuenta, prov.idProveedor),
      base().query(`SELECT idProducto, Nombre, CodigoBarras, PrecioUSD FROM VIDA_INVENTARIO_PRODUCTOS
                    WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO' AND idPuntoVentaDueno IS NULL
                      AND CodigoBarras IS NOT NULL AND CodigoBarras <> ''`),
      base().query(`SELECT CodigoProveedor FROM VIDA_PROVEEDORES_PRODUCTOS_NUEVOS
                    WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idProveedor=@idProveedor AND Status='PENDIENTE'`),
    ]);
    const plan = planLista(filas, { actuales, catalogo: catR.recordset, pendientes: penR.recordset.map(x => x.CodigoProveedor) });
    if (!b.confirmar) return reply.send({ ...plan, proveedor: prov });
    if (plan.resumen.errores > 0) return reply.code(422).send({ error: 'Corrige las filas con error antes de cargar', ...plan });

    const r = { actualizados: 0, ligados: 0, porAprobar: 0, noDisponibles: 0, preciosCambiados: 0 };
    const usu = String(idUsuario);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const req = () => new sql.Request(tx).input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
        .input('idProveedor', sql.BigInt, prov.idProveedor).input('Usu', sql.VarChar(20), usu);
      const precioAntes = new Map(actuales.map(a => [String(a.idProducto), a.PrecioCosto == null ? null : Number(a.PrecioCosto)]));
      for (const f of plan.filas) {
        const d = f.datos;
        const datos = () => req()
          .input('Codigo', sql.VarChar(100), d.CodigoProveedor).input('Precio', sql.Decimal(18, 4), d.PrecioLista)
          .input('Unidad', sql.VarChar(20), d.UnidadCompra).input('Empaque', sql.Int, d.UnidadesEmpaque)
          .input('Sugerido', sql.Decimal(18, 4), d.PrecioSugerido).input('Minimo', sql.Decimal(18, 4), d.PedidoMinimo)
          .input('Dias', sql.Int, d.DiasEntrega).input('Disp', sql.Bit, d.Disponible ? 1 : 0);
        if (f.accion === 'ACTUALIZAR' || f.accion === 'VINCULAR') {
          await datos().input('idProducto', sql.BigInt, d.idProducto).query(`
            MERGE VIDA_PROVEEDORES_PRODUCTOS WITH (HOLDLOCK) AS t
            USING (SELECT @idBranch AS idBranch, @idCuenta AS idCuenta, @idProveedor AS idProveedor, @idProducto AS idProducto) AS s
              ON t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.idProveedor=s.idProveedor AND t.idProducto=s.idProducto
            WHEN MATCHED THEN UPDATE SET CodigoProveedor=@Codigo, PrecioCosto=@Precio, UnidadCompra=@Unidad, UnidadesEmpaque=@Empaque,
              PrecioSugeridoUSD=@Sugerido, PedidoMinimo=@Minimo, DiasEntrega=@Dias, Disponible=@Disp, FechaMod=GETUTCDATE(), UsuMod=@Usu
            WHEN NOT MATCHED THEN INSERT (idBranch, idCuenta, idProveedor, idProducto, PrecioCosto, CodigoProveedor, UnidadCompra,
              UnidadesEmpaque, PrecioSugeridoUSD, PedidoMinimo, DiasEntrega, Disponible, UsuAlta)
              VALUES (@idBranch, @idCuenta, @idProveedor, @idProducto, @Precio, @Codigo, @Unidad, @Empaque, @Sugerido, @Minimo, @Dias, @Disp, @Usu);`);
          // El peso y el código de barras del producto VIDA se completan si no los tenía (no se pisan)
          await req().input('idProducto', sql.BigInt, d.idProducto).input('Peso', sql.Decimal(10, 3), d.PesoKg)
            .input('Barras', sql.VarChar(100), d.CodigoBarras)
            .query(`UPDATE VIDA_INVENTARIO_PRODUCTOS SET PesoKg=ISNULL(PesoKg, @Peso), CodigoBarras=ISNULL(NULLIF(CodigoBarras,''), @Barras)
                    WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idProducto=@idProducto
                      AND ((PesoKg IS NULL AND @Peso IS NOT NULL) OR ((CodigoBarras IS NULL OR CodigoBarras='') AND @Barras IS NOT NULL))`);
          const antes = precioAntes.has(String(d.idProducto)) ? precioAntes.get(String(d.idProducto)) : null;
          if (antes !== d.PrecioLista) {
            await req().input('idProducto', sql.BigInt, d.idProducto).input('Antes', sql.Decimal(18, 4), antes)
              .input('Nuevo', sql.Decimal(18, 4), d.PrecioLista)
              .query(`INSERT INTO VIDA_PROVEEDORES_PRECIOS_HIST (idBranch, idCuenta, idProveedor, idProducto, PrecioAnterior, PrecioNuevo, Origen, UsuAlta)
                      VALUES (@idBranch, @idCuenta, @idProveedor, @idProducto, @Antes, @Nuevo, 'LAYOUT', @Usu)`);
            r.preciosCambiados++;
          }
          if (f.accion === 'VINCULAR') r.ligados++; else r.actualizados++;
        } else if (f.accion === 'NUEVO') {
          // Si ya esperaba aprobación, se actualizan sus datos; si no, entra a la bandeja
          await datos().input('Barras', sql.VarChar(100), d.CodigoBarras).input('Nombre', sql.VarChar(200), d.Nombre)
            .input('Marca', sql.VarChar(100), d.Marca).input('Categoria', sql.VarChar(100), d.Categoria)
            .input('IVA', sql.VarChar(10), d.AlicuotaIVA).input('Peso', sql.Decimal(10, 3), d.PesoKg)
            .query(`
            UPDATE VIDA_PROVEEDORES_PRODUCTOS_NUEVOS SET CodigoBarras=@Barras, Nombre=@Nombre, Marca=@Marca, Categoria=@Categoria,
              UnidadCompra=@Unidad, UnidadesEmpaque=@Empaque, PrecioListaUSD=@Precio, PrecioSugeridoUSD=@Sugerido, AlicuotaIVA=@IVA,
              PedidoMinimo=@Minimo, PesoKg=@Peso, DiasEntrega=@Dias, Disponible=@Disp
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idProveedor=@idProveedor AND CodigoProveedor=@Codigo AND Status='PENDIENTE';
            IF @@ROWCOUNT = 0
              INSERT INTO VIDA_PROVEEDORES_PRODUCTOS_NUEVOS (idBranch, idCuenta, idProveedor, CodigoProveedor, CodigoBarras, Nombre, Marca,
                Categoria, UnidadCompra, UnidadesEmpaque, PrecioListaUSD, PrecioSugeridoUSD, AlicuotaIVA, PedidoMinimo, PesoKg, DiasEntrega,
                Disponible, UsuAlta)
              VALUES (@idBranch, @idCuenta, @idProveedor, @Codigo, @Barras, @Nombre, @Marca, @Categoria, @Unidad, @Empaque, @Precio,
                @Sugerido, @IVA, @Minimo, @Peso, @Dias, @Disp, @Usu);`);
          r.porAprobar++;
        }
      }
      // Lo que la lista ya no trae deja de estar disponible (no se borra: guarda su historial)
      if (b.marcarAusentes) {
        for (const a of plan.ausentes.filter(x => x.Disponible)) {
          await req().input('idProducto', sql.BigInt, a.idProducto)
            .query(`UPDATE VIDA_PROVEEDORES_PRODUCTOS SET Disponible=0, FechaMod=GETUTCDATE(), UsuMod=@Usu
                    WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idProveedor=@idProveedor AND idProducto=@idProducto`);
          r.noDisponibles++;
        }
      }
      await req().input('Vig', sql.Date, vigenteHasta)
        .query(`UPDATE VIDA_PROVEEDORES SET ListaFechaCarga=GETUTCDATE(), ListaVigenteHasta=@Vig, FechaMod=GETDATE()
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idProveedor=@idProveedor`);
      await tx.commit();
    } catch (e) {
      try { await tx.rollback(); } catch {}
      throw e;
    }
    registrarAuditoria(pool, {
      idBranch, idCuenta, entityType: 'PROVEEDOR', entityId: prov.idProveedor, accion: 'LISTA_PRECIOS', actor: idUsuario,
      data: { ...r, filas: plan.resumen.total, vigenteHasta },
    }, request.log).catch(() => {});
    return reply.send({ ok: true, ...r, resumen: plan.resumen });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'No se pudo cargar la lista del proveedor' });
  }
}

// GET /proveedores/productos-nuevos?status=PENDIENTE
export async function listarProductosNuevos(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const status = ['PENDIENTE', 'APROBADO', 'RECHAZADO'].includes(request.query.status) ? request.query.status : 'PENDIENTE';
  try {
    const pool = await getPool();
    const r = await pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('Status', sql.VarChar(10), status)
      .query(`SELECT TOP 500 n.*, pr.Nombre AS NombreProveedor, p.Nombre AS NombreProductoVida
              FROM VIDA_PROVEEDORES_PRODUCTOS_NUEVOS n
              JOIN VIDA_PROVEEDORES pr ON pr.idBranch=n.idBranch AND pr.idCuenta=n.idCuenta AND pr.idProveedor=n.idProveedor
              LEFT JOIN VIDA_INVENTARIO_PRODUCTOS p ON p.idBranch=n.idBranch AND p.idCuenta=n.idCuenta AND p.idProducto=n.idProducto
              WHERE n.idBranch=@idBranch AND n.idCuenta=@idCuenta AND n.Status=@Status
              ORDER BY ${status === 'PENDIENTE' ? 'n.FechaAlta' : 'n.FechaResuelto DESC'}`);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al leer los productos por aprobar' });
  }
}

async function nuevoPendiente(pool, idBranch, idCuenta, idNuevo) {
  const r = await pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
    .input('idNuevo', sql.BigInt, idNuevo)
    .query(`SELECT * FROM VIDA_PROVEEDORES_PRODUCTOS_NUEVOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idNuevo=@idNuevo`);
  return r.recordset[0] || null;
}

// POST /proveedores/productos-nuevos/:idNuevo/aprobar
export async function aprobarProductoNuevo(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const b = request.body || {};
  if (!['CREAR', 'VINCULAR'].includes(b.modo)) return reply.code(400).send({ error: 'Elige si se crea en el catálogo o si ya existe' });
  const usu = String(idUsuario);
  try {
    const pool = await getPool();
    const n = await nuevoPendiente(pool, idBranch, idCuenta, request.params.idNuevo);
    if (!n) return reply.code(404).send({ error: 'No existe ese producto por aprobar' });
    if (n.Status !== 'PENDIENTE') return reply.code(409).send({ error: 'Ese producto ya se resolvió' });

    let idProducto = null, nombre = null, idCategoria = null, precioVenta = null, sku = null;
    if (b.modo === 'VINCULAR') {
      idProducto = Number(b.idProducto);
      if (!Number.isSafeInteger(idProducto) || idProducto <= 0) return reply.code(400).send({ error: 'Elige el producto de VIDA' });
      const p = await pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
        .input('idProducto', sql.BigInt, idProducto)
        .query(`SELECT idProducto FROM VIDA_INVENTARIO_PRODUCTOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idProducto=@idProducto
                  AND Status='ACTIVO' AND idPuntoVentaDueno IS NULL`);
      if (!p.recordset.length) return reply.code(400).send({ error: 'Ese producto no está activo en el catálogo de VIDA' });
    } else {
      nombre = String(b.Nombre ?? n.Nombre).trim().slice(0, 200);
      idCategoria = Number(b.idCategoria);
      precioVenta = Number(b.PrecioUSD ?? n.PrecioSugeridoUSD);
      sku = b.SKU ? String(b.SKU).trim().slice(0, 100) : null;
      if (!nombre) return reply.code(400).send({ error: 'Falta el nombre' });
      if (!Number.isSafeInteger(idCategoria) || idCategoria <= 0) return reply.code(400).send({ error: 'Elige la categoría' });
      if (!(precioVenta > 0)) return reply.code(400).send({ error: 'Escribe el precio de venta en tiendas' });
      const chk = await pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
        .input('idCategoria', sql.BigInt, idCategoria).input('Barras', sql.VarChar(100), n.CodigoBarras).input('SKU', sql.VarChar(100), sku)
        .query(`SELECT
                  (SELECT COUNT(*) FROM VIDA_INVENTARIO_CATEGORIAS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCategoria=@idCategoria AND Status='ACTIVO') AS cat,
                  (SELECT TOP 1 idProducto FROM VIDA_INVENTARIO_PRODUCTOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVentaDueno IS NULL
                     AND Status='ACTIVO' AND @Barras IS NOT NULL AND CodigoBarras=@Barras) AS porBarras,
                  (SELECT COUNT(*) FROM VIDA_INVENTARIO_PRODUCTOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVentaDueno IS NULL
                     AND @SKU IS NOT NULL AND SKU=@SKU) AS sku`);
      const c = chk.recordset[0];
      if (!c.cat) return reply.code(400).send({ error: 'Esa categoría no existe' });
      if (c.porBarras) return reply.code(409).send({ error: 'Ya hay un producto con ese código de barras en el catálogo: lígalo en vez de crearlo', idProducto: c.porBarras });
      if (c.sku) return reply.code(409).send({ error: 'Ese SKU ya lo usa otro producto del catálogo' });
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const req = () => new sql.Request(tx).input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
        .input('idProveedor', sql.BigInt, n.idProveedor).input('Usu', sql.VarChar(20), usu);
      if (b.modo === 'CREAR') {
        const ins = await req().input('idCategoria', sql.BigInt, idCategoria).input('Nombre', sql.VarChar(200), nombre)
          .input('SKU', sql.VarChar(100), sku).input('Barras', sql.VarChar(100), n.CodigoBarras)
          .input('Unidad', sql.VarChar(50), UNIDAD_PRODUCTO[n.UnidadCompra] || 'Pieza')
          .input('Precio', sql.Decimal(18, 4), precioVenta).input('Costo', sql.Decimal(18, 4), n.PrecioListaUSD)
          .input('IVA', sql.VarChar(10), n.AlicuotaIVA || 'GENERAL').input('Peso', sql.Decimal(10, 3), n.PesoKg)
          .input('Desc', sql.VarChar(500), n.Marca ? `Marca: ${n.Marca}` : null)
          .query(`INSERT INTO VIDA_INVENTARIO_PRODUCTOS (idBranch, idCuenta, idProducto, idCategoria, Nombre, Descripcion, SKU, CodigoBarras,
                    UnidadMedida, PrecioUSD, CostoUSD, StockMinimo, EsProductoPlus, AlicuotaIVA, PesoKg, idPuntoVentaDueno, UsuAlta)
                  OUTPUT inserted.idProducto AS nuevoId
                  SELECT @idBranch, @idCuenta, ISNULL(MAX(idProducto), 0) + 1, @idCategoria, @Nombre, @Desc, @SKU, @Barras,
                    @Unidad, @Precio, @Costo, 0, 0, @IVA, @Peso, NULL, @Usu
                  FROM VIDA_INVENTARIO_PRODUCTOS WITH (UPDLOCK, HOLDLOCK) WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
        idProducto = ins.recordset[0].nuevoId;
      }
      await req().input('idProducto', sql.BigInt, idProducto).input('Codigo', sql.VarChar(100), n.CodigoProveedor)
        .input('Precio', sql.Decimal(18, 4), n.PrecioListaUSD).input('Unidad', sql.VarChar(20), n.UnidadCompra)
        .input('Empaque', sql.Int, n.UnidadesEmpaque).input('Sugerido', sql.Decimal(18, 4), n.PrecioSugeridoUSD)
        .input('Minimo', sql.Decimal(18, 4), n.PedidoMinimo).input('Dias', sql.Int, n.DiasEntrega).input('Disp', sql.Bit, n.Disponible ? 1 : 0)
        .query(`
          MERGE VIDA_PROVEEDORES_PRODUCTOS WITH (HOLDLOCK) AS t
          USING (SELECT @idBranch AS idBranch, @idCuenta AS idCuenta, @idProveedor AS idProveedor, @idProducto AS idProducto) AS s
            ON t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.idProveedor=s.idProveedor AND t.idProducto=s.idProducto
          WHEN MATCHED THEN UPDATE SET CodigoProveedor=@Codigo, PrecioCosto=@Precio, UnidadCompra=@Unidad, UnidadesEmpaque=@Empaque,
            PrecioSugeridoUSD=@Sugerido, PedidoMinimo=@Minimo, DiasEntrega=@Dias, Disponible=@Disp, FechaMod=GETUTCDATE(), UsuMod=@Usu
          WHEN NOT MATCHED THEN INSERT (idBranch, idCuenta, idProveedor, idProducto, PrecioCosto, CodigoProveedor, UnidadCompra,
            UnidadesEmpaque, PrecioSugeridoUSD, PedidoMinimo, DiasEntrega, Disponible, UsuAlta)
            VALUES (@idBranch, @idCuenta, @idProveedor, @idProducto, @Precio, @Codigo, @Unidad, @Empaque, @Sugerido, @Minimo, @Dias, @Disp, @Usu);
          INSERT INTO VIDA_PROVEEDORES_PRECIOS_HIST (idBranch, idCuenta, idProveedor, idProducto, PrecioAnterior, PrecioNuevo, Origen, UsuAlta)
            VALUES (@idBranch, @idCuenta, @idProveedor, @idProducto, NULL, @Precio, 'APROBADO', @Usu);`);
      const upd = await req().input('idNuevo', sql.BigInt, n.idNuevo).input('idProducto', sql.BigInt, idProducto)
        .query(`UPDATE VIDA_PROVEEDORES_PRODUCTOS_NUEVOS SET Status='APROBADO', idProducto=@idProducto, FechaResuelto=GETUTCDATE(), UsuResuelto=@Usu
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idNuevo=@idNuevo AND Status='PENDIENTE'`);
      if (upd.rowsAffected[0] !== 1) throw Object.assign(new Error('ya resuelto'), { yaResuelto: true });
      await tx.commit();
    } catch (e) {
      try { await tx.rollback(); } catch {}
      if (e.yaResuelto) return reply.code(409).send({ error: 'Ese producto ya se resolvió' });
      throw e;
    }
    registrarAuditoria(pool, {
      idBranch, idCuenta, entityType: 'PROVEEDOR', entityId: n.idProveedor, accion: 'PRODUCTO_NUEVO_APROBADO', actor: idUsuario,
      data: { idNuevo: n.idNuevo, modo: b.modo, idProducto, CodigoProveedor: n.CodigoProveedor },
    }, request.log).catch(() => {});
    return reply.send({ ok: true, idProducto, message: b.modo === 'CREAR' ? 'Producto creado en el catálogo y ligado al proveedor' : 'Producto ligado al proveedor' });
  } catch (err) {
    request.log.error(err);
    if ([2627, 2601].includes(err?.number)) return reply.code(409).send({ error: 'Ese SKU ya lo usa otro producto del catálogo' });
    return reply.code(500).send({ error: 'No se pudo aprobar el producto' });
  }
}

// POST /proveedores/productos-nuevos/:idNuevo/rechazar
export async function rechazarProductoNuevo(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const motivo = request.body?.Motivo ? String(request.body.Motivo).trim().slice(0, 300) : null;
  try {
    const pool = await getPool();
    const r = await pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('idNuevo', sql.BigInt, request.params.idNuevo).input('Motivo', sql.VarChar(300), motivo).input('Usu', sql.VarChar(20), String(idUsuario))
      .query(`UPDATE VIDA_PROVEEDORES_PRODUCTOS_NUEVOS SET Status='RECHAZADO', Motivo=@Motivo, FechaResuelto=GETUTCDATE(), UsuResuelto=@Usu
              OUTPUT inserted.idProveedor, inserted.CodigoProveedor
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idNuevo=@idNuevo AND Status='PENDIENTE'`);
    if (!r.recordset.length) return reply.code(404).send({ error: 'No hay un producto pendiente con ese número' });
    registrarAuditoria(pool, {
      idBranch, idCuenta, entityType: 'PROVEEDOR', entityId: r.recordset[0].idProveedor, accion: 'PRODUCTO_NUEVO_RECHAZADO', actor: idUsuario,
      data: { idNuevo: Number(request.params.idNuevo), CodigoProveedor: r.recordset[0].CodigoProveedor, motivo },
    }, request.log).catch(() => {});
    return reply.send({ ok: true });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'No se pudo rechazar el producto' });
  }
}
