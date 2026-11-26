// src/controllers/inventarioLayout.controller.js
// Carga de productos por layout (Excel) a una tienda (tarea 19).
//
// POST /inventario/layout { idPuntoVenta?, filas, confirmar, paraCatalogo? }
//   · confirmar=false → solo revisa: qué fila crea, actualiza o tiene error
//   · confirmar=true  → guarda TODO o NADA (una transacción), y deja cada
//     cambio de existencia como movimiento de inventario
// El panel lee el Excel y manda las filas; aquí se vuelven a validar con las
// mismas reglas (domain/layoutInventario.mjs), nunca se confía en el cliente.
import { getPool, sql } from '../db/sqlserver.js';
import { registrarAuditoria } from '../services/audit.service.js';
import { operadorMatriz, tiendaEnAlcance } from '../services/alcance.service.js';
import { puedeEditarProducto, esRolRed } from '../services/productosTienda.service.js';
import { planCarga, MAX_FILAS_LAYOUT } from '../domain/layoutInventario.mjs';

// Inserta con id secuencial por cuenta en UNA sentencia (igual que
// inventario.controller): con UPDLOCK+HOLDLOCK dos altas no chocan.
async function insertarConId(req, { tabla, idCol, columnas, valores }) {
  const r = await req.query(`
    INSERT INTO ${tabla} (idBranch, idCuenta, ${idCol}, ${columnas.join(', ')})
    OUTPUT inserted.${idCol} AS nuevoId
    SELECT @idBranch, @idCuenta, ISNULL(MAX(${idCol}), 0) + 1, ${valores.join(', ')}
    FROM ${tabla} WITH (UPDLOCK, HOLDLOCK)
    WHERE idBranch = @idBranch AND idCuenta = @idCuenta`);
  return r.recordset[0].nuevoId;
}

export async function cargarLayout(request, reply) {
  const { idBranch, idCuenta, idUsuario, idPuntoVenta: pvUsuario } = request.user;
  const b = request.body || {};
  const filas = Array.isArray(b.filas) ? b.filas : null;
  if (!filas || !filas.length) return reply.code(400).send({ error: 'El archivo no trae productos' });
  if (filas.length > MAX_FILAS_LAYOUT)
    return reply.code(400).send({ error: `Máximo ${MAX_FILAS_LAYOUT} productos por archivo; divídelo en varios` });

  const pool = await getPool();
  const opera = (await operadorMatriz(request.user, pool)).permitido;
  const deVida = opera || esRolRed(request.user);
  // La tienda carga siempre en la suya; VIDA elige la tienda
  const idPuntoVenta = deVida ? b.idPuntoVenta : pvUsuario;
  if (!idPuntoVenta) return reply.code(400).send({ error: 'Elige la tienda a la que va el inventario' });
  if (!(await tiendaEnAlcance(request.user, idPuntoVenta, pool)))
    return reply.code(403).send({ error: 'Esa tienda está fuera de tu alcance' });
  // Productos nuevos: de la tienda, salvo que VIDA los cargue a su catálogo
  const dueno = deVida && b.paraCatalogo ? null : idPuntoVenta;

  try {
    const base = () => pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('pv', sql.BigInt, idPuntoVenta);
    const [catR, prodR] = await Promise.all([
      base().query(`SELECT idCategoria, Nombre FROM VIDA_INVENTARIO_CATEGORIAS
                    WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO'`),
      base().query(`SELECT p.idProducto, p.SKU, p.CodigoBarras, p.Nombre, p.idPuntoVentaDueno, ISNULL(s.Cantidad,0) AS Stock
                    FROM VIDA_INVENTARIO_PRODUCTOS p
                    LEFT JOIN VIDA_INVENTARIO_STOCK s ON s.idBranch=p.idBranch AND s.idCuenta=p.idCuenta
                      AND s.idProducto=p.idProducto AND s.idPuntoVenta=@pv
                    WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
                      AND (p.idPuntoVentaDueno IS NULL OR p.idPuntoVentaDueno=@pv)`),
    ]);
    const existentes = prodR.recordset.map(p => ({ ...p, Editable: puedeEditarProducto(request.user, opera, p.idPuntoVentaDueno) }));
    const plan = planCarga(filas, { categorias: catR.recordset, existentes, puedeCrearCategorias: deVida });
    if (!b.confirmar) return reply.send({ ...plan, idPuntoVenta: Number(idPuntoVenta), paraCatalogo: dueno == null });
    if (plan.resumen.errores > 0)
      return reply.code(422).send({ error: 'Corrige las filas con error antes de cargar', ...plan });

    const stockDe = new Map(prodR.recordset.map(p => [String(p.idProducto), Number(p.Stock)]));
    const resultado = { creados: 0, actualizados: 0, movimientos: 0, categoriasCreadas: 0 };
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const req = () => new sql.Request(tx).input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta);
      // 1. Categorías nuevas (solo VIDA)
      const idCatNueva = new Map();
      for (const nombre of plan.resumen.categoriasNuevas) {
        const id = await insertarConId(req().input('Nombre', sql.VarChar(100), nombre).input('Usu', sql.VarChar(20), String(idUsuario)), {
          tabla: 'VIDA_INVENTARIO_CATEGORIAS', idCol: 'idCategoria',
          columnas: ['Nombre', 'OrdenCategoria', 'UsuAlta'], valores: ['@Nombre', '0', '@Usu'],
        });
        idCatNueva.set(nombre, id); resultado.categoriasCreadas++;
      }
      // 2. Productos
      for (const f of plan.filas) {
        if (f.accion === 'SIN_CAMBIOS') continue;
        const d = f.datos;
        let idProducto = d.idProducto;
        const datos = () => req()
          .input('idCategoria', sql.BigInt, d.idCategoria ?? idCatNueva.get(d.CategoriaNueva))
          .input('Nombre', sql.VarChar(200), d.Nombre).input('Descripcion', sql.VarChar(500), d.Descripcion)
          .input('SKU', sql.VarChar(100), d.SKU).input('CodigoBarras', sql.VarChar(100), d.CodigoBarras)
          .input('UnidadMedida', sql.VarChar(50), d.UnidadMedida).input('UnidadesPorCaja', sql.Int, d.UnidadesPorCaja ?? null)
          .input('PrecioUSD', sql.Decimal(18, 4), d.PrecioUSD).input('CostoUSD', sql.Decimal(18, 4), d.CostoUSD)
          .input('StockMinimo', sql.Decimal(18, 4), d.StockMinimo ?? 0).input('EsProductoPlus', sql.Bit, d.EsProductoPlus ? 1 : 0)
          .input('AlicuotaIVA', sql.VarChar(10), d.AlicuotaIVA).input('PesoKg', sql.Decimal(10, 3), d.PesoKg)
          .input('Usu', sql.VarChar(20), String(idUsuario));
        if (f.accion === 'CREAR') {
          idProducto = await insertarConId(datos().input('Dueno', sql.BigInt, dueno), {
            tabla: 'VIDA_INVENTARIO_PRODUCTOS', idCol: 'idProducto',
            columnas: ['idCategoria', 'Nombre', 'Descripcion', 'SKU', 'CodigoBarras', 'UnidadMedida', 'UnidadesPorCaja', 'PrecioUSD',
                       'CostoUSD', 'StockMinimo', 'EsProductoPlus', 'AlicuotaIVA', 'PesoKg', 'idPuntoVentaDueno', 'UsuAlta'],
            valores: ['@idCategoria', '@Nombre', '@Descripcion', '@SKU', '@CodigoBarras', '@UnidadMedida', '@UnidadesPorCaja', '@PrecioUSD',
                      '@CostoUSD', '@StockMinimo', '@EsProductoPlus', '@AlicuotaIVA', '@PesoKg', '@Dueno', '@Usu'],
          });
          resultado.creados++;
        } else if (f.accion === 'ACTUALIZAR') {
          // Lo que la fila trae vacío (costo, peso, descripción…) no borra lo que ya había
          await datos().input('idProducto', sql.BigInt, idProducto).query(`
            UPDATE VIDA_INVENTARIO_PRODUCTOS SET idCategoria=@idCategoria, Nombre=@Nombre,
              Descripcion=ISNULL(@Descripcion, Descripcion), SKU=ISNULL(@SKU, SKU), CodigoBarras=ISNULL(@CodigoBarras, CodigoBarras),
              UnidadMedida=@UnidadMedida, UnidadesPorCaja=ISNULL(@UnidadesPorCaja, UnidadesPorCaja), PrecioUSD=@PrecioUSD,
              CostoUSD=ISNULL(@CostoUSD, CostoUSD), StockMinimo=@StockMinimo, EsProductoPlus=@EsProductoPlus,
              AlicuotaIVA=@AlicuotaIVA, PesoKg=ISNULL(@PesoKg, PesoKg), FechaMod=GETUTCDATE(), UsuMod=@Usu
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idProducto=@idProducto`);
          resultado.actualizados++;
        }
        // 3. Existencia en la tienda: queda en lo que dice el layout
        if (d.Existencia == null) continue;
        const antes = f.accion === 'CREAR' ? 0 : (stockDe.get(String(idProducto)) ?? 0);
        if (antes === d.Existencia) continue;
        await req().input('pv', sql.BigInt, idPuntoVenta).input('idProducto', sql.BigInt, idProducto)
          .input('Cantidad', sql.Decimal(18, 4), d.Existencia)
          .query(`MERGE VIDA_INVENTARIO_STOCK WITH (HOLDLOCK) AS t
                  USING (SELECT @idBranch AS idBranch, @idCuenta AS idCuenta, @pv AS idPuntoVenta, @idProducto AS idProducto) AS s
                    ON t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.idPuntoVenta=s.idPuntoVenta AND t.idProducto=s.idProducto
                  WHEN MATCHED THEN UPDATE SET Cantidad=@Cantidad, FechaMod=GETUTCDATE()
                  WHEN NOT MATCHED THEN INSERT (idBranch, idCuenta, idPuntoVenta, idProducto, Cantidad)
                    VALUES (@idBranch, @idCuenta, @pv, @idProducto, @Cantidad);`);
        const tipo = f.accion === 'CREAR' ? 'ENTRADA' : 'AJUSTE';
        await insertarConId(req().input('pv', sql.BigInt, idPuntoVenta).input('idProducto', sql.BigInt, idProducto)
          .input('Tipo', sql.VarChar(20), tipo)
          // Igual que registrarMovimiento: en ENTRADA es lo que entra (desde 0); en AJUSTE, el nuevo stock
          .input('Cantidad', sql.Decimal(18, 4), d.Existencia)
          .input('Antes', sql.Decimal(18, 4), antes).input('Despues', sql.Decimal(18, 4), d.Existencia)
          .input('Motivo', sql.VarChar(300), 'Carga por layout').input('Ref', sql.VarChar(100), `LAYOUT:fila ${f.fila}`)
          .input('Usu', sql.VarChar(20), String(idUsuario)), {
          tabla: 'VIDA_INVENTARIO_MOVIMIENTOS', idCol: 'idMovimiento',
          columnas: ['idPuntoVenta', 'idProducto', 'TipoMovimiento', 'Cantidad', 'CantidadAntes', 'CantidadDespues', 'Motivo', 'Referencia', 'UsuAlta'],
          valores: ['@pv', '@idProducto', '@Tipo', '@Cantidad', '@Antes', '@Despues', '@Motivo', '@Ref', '@Usu'],
        });
        resultado.movimientos++;
      }
      await tx.commit();
    } catch (e) {
      try { await tx.rollback(); } catch {}
      throw e;
    }
    registrarAuditoria(pool, {
      idBranch, idCuenta, entityType: 'INVENTARIO', entityId: idPuntoVenta, accion: 'CARGA_LAYOUT', actor: idUsuario,
      data: { ...resultado, filas: plan.resumen.total, paraCatalogo: dueno == null },
    }, request.log).catch(() => {});
    return reply.send({ ok: true, ...resultado, resumen: plan.resumen });
  } catch (err) {
    request.log.error(err);
    // Un SKU que ya usa otro producto de la misma tienda o del catálogo
    if ([2627, 2601].includes(err?.number))
      return reply.code(409).send({ error: 'Algún SKU ya lo usa otro producto. Revisa los SKU del archivo y vuelve a intentar.' });
    return reply.code(500).send({ error: 'No se pudo cargar el layout' });
  }
}
