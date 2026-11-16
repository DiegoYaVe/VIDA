// src/controllers/portalProveedor.controller.js
// Portal de proveedores (tarea 24): la pantalla sencilla para el proveedor que
// no tiene API. Entra con un enlace secreto que VIDA le da (sin usuario ni
// contraseña) y ve SOLO sus pedidos de VIDA: folio, productos, cantidades, si
// lo recoge un repartidor de VIDA o un cliente de VIDA, y lo que VIDA le paga.
// Nunca ve a qué tienda va la mercancía.
import { getPool, sql } from '../db/sqlserver.js';
import { normalizarCodigo } from '../services/reabastoProveedor.service.js';

const VISIBLES = ['ENVIADO', 'CONFIRMADO', 'LISTO', 'RETIRADO', 'RECIBIDO'];

async function proveedorPorToken(pool, token) {
  if (!/^[a-f0-9]{48}$/.test(String(token || ''))) return null;
  const r = await pool.request()
    .input('token', sql.VarChar(64), token)
    .query(`SELECT idBranch, idCuenta, idProveedor, Nombre FROM VIDA_PROVEEDORES
            WHERE PortalToken=@token AND Status='ACTIVO'`);
  return r.recordset[0] || null;
}

// GET /portal-proveedor/:token
export async function verPortal(request, reply) {
  try {
    const pool = await getPool();
    const prov = await proveedorPorToken(pool, request.params.token);
    if (!prov) return reply.code(404).send({ error: 'Este enlace no es válido. Pídele a VIDA uno nuevo.' });
    const base = () => pool.request()
      .input('idBranch', sql.BigInt, prov.idBranch).input('idCuenta', sql.BigInt, prov.idCuenta)
      .input('idProveedor', sql.BigInt, prov.idProveedor);
    const [paqR, detR] = await Promise.all([
      base().query(`SELECT pp.idPedidoProveedor, pp.Folio, pp.Status, pp.TotalListaUSD, pp.ComisionPct, pp.TotalPagarUSD,
                           pp.NotasProveedor, pp.FechaAlta, pp.FechaRetiro, pp.RetiradoPor, pm.ModoRecepcion,
                           s.Nombre AS Sucursal, s.Direccion AS DireccionSucursal
                    FROM VIDA_PEDIDOS_PROVEEDOR pp
                    JOIN VIDA_PEDIDOS_MATRIZ pm ON pm.idBranch=pp.idBranch AND pm.idCuenta=pp.idCuenta AND pm.idPedidoMatriz=pp.idPedidoMatriz
                    LEFT JOIN VIDA_PROVEEDORES_SUCURSALES s ON s.idBranch=pp.idBranch AND s.idCuenta=pp.idCuenta
                      AND s.idProveedor=pp.idProveedor AND s.idSucursal=pp.idSucursal
                    WHERE pp.idBranch=@idBranch AND pp.idCuenta=@idCuenta AND pp.idProveedor=@idProveedor
                      AND pp.Status IN (${VISIBLES.map(s => `'${s}'`).join(',')})
                      AND (pp.Status NOT IN ('RETIRADO','RECIBIDO') OR pp.FechaRetiro > DATEADD(DAY,-30,GETUTCDATE()))
                    ORDER BY CASE pp.Status WHEN 'ENVIADO' THEN 0 WHEN 'CONFIRMADO' THEN 1 WHEN 'LISTO' THEN 2 ELSE 3 END, pp.FechaAlta DESC`),
      base().query(`SELECT d.idPedidoProveedor, p.Nombre, p.SKU, p.UnidadMedida, pr.CodigoProveedor,
                           d.CantidadSolicitada AS Cantidad, d.PrecioListaUnitario AS PrecioLista
                    FROM VIDA_PEDIDOS_MATRIZ_DETALLE d
                    JOIN VIDA_PEDIDOS_PROVEEDOR pp ON pp.idBranch=d.idBranch AND pp.idCuenta=d.idCuenta AND pp.idPedidoProveedor=d.idPedidoProveedor
                    JOIN VIDA_INVENTARIO_PRODUCTOS p ON p.idBranch=d.idBranch AND p.idCuenta=d.idCuenta AND p.idProducto=d.idProducto
                    LEFT JOIN VIDA_PROVEEDORES_PRODUCTOS pr ON pr.idBranch=d.idBranch AND pr.idCuenta=d.idCuenta
                      AND pr.idProveedor=pp.idProveedor AND pr.idProducto=d.idProducto
                    WHERE d.idBranch=@idBranch AND d.idCuenta=@idCuenta AND pp.idProveedor=@idProveedor
                      AND pp.Status IN (${VISIBLES.map(s => `'${s}'`).join(',')})`),
    ]);
    // El portal es público: sin cache para que un pedido nuevo aparezca al recargar.
    reply.header('Cache-Control', 'no-store');
    return reply.send({
      proveedor: prov.Nombre,
      pedidos: paqR.recordset.map(p => ({
        Folio: p.Folio, Status: p.Status, FechaAlta: p.FechaAlta, FechaRetiro: p.FechaRetiro,
        Recoge: p.ModoRecepcion === 'RECOJO' ? 'CLIENTE_VIDA' : 'REPARTIDOR_VIDA',
        Sucursal: p.Sucursal, DireccionSucursal: p.DireccionSucursal,
        TotalListaUSD: p.TotalListaUSD, ComisionPct: p.ComisionPct, TotalPagarUSD: p.TotalPagarUSD, NotasProveedor: p.NotasProveedor,
        productos: detR.recordset.filter(d => String(d.idPedidoProveedor) === String(p.idPedidoProveedor))
          .map(({ idPedidoProveedor, ...d }) => d),
      })),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'No se pudieron cargar tus pedidos' });
  }
}

// Cambios que hace el proveedor desde su portal
//   POST /portal-proveedor/:token/pedidos/:folio/confirmar { Notas }   ENVIADO → CONFIRMADO
//   POST /portal-proveedor/:token/pedidos/:folio/listo                  CONFIRMADO → LISTO
//   POST /portal-proveedor/:token/pedidos/:folio/entregar { codigo }    LISTO → RETIRADO, solo con el código del QR
const PASOS = {
  confirmar: { desde: ['ENVIADO'], hacia: 'CONFIRMADO' },
  listo:     { desde: ['CONFIRMADO'], hacia: 'LISTO' },
  entregar:  { desde: ['CONFIRMADO', 'LISTO'], hacia: 'RETIRADO' },
};

export async function avanzarPedidoPortal(request, reply) {
  const { token, folio, accion } = request.params;
  const paso = PASOS[accion];
  if (!paso) return reply.code(404).send({ error: 'Acción desconocida' });
  try {
    const pool = await getPool();
    const prov = await proveedorPorToken(pool, token);
    if (!prov) return reply.code(404).send({ error: 'Este enlace no es válido. Pídele a VIDA uno nuevo.' });
    const r = await pool.request()
      .input('idBranch', sql.BigInt, prov.idBranch).input('idCuenta', sql.BigInt, prov.idCuenta)
      .input('idProveedor', sql.BigInt, prov.idProveedor).input('folio', sql.VarChar(30), String(folio || ''))
      .query(`SELECT pp.idPedidoProveedor, pp.Status, pp.CodigoRetiro, pm.ModoRecepcion FROM VIDA_PEDIDOS_PROVEEDOR pp
              JOIN VIDA_PEDIDOS_MATRIZ pm ON pm.idBranch=pp.idBranch AND pm.idCuenta=pp.idCuenta AND pm.idPedidoMatriz=pp.idPedidoMatriz
              WHERE pp.idBranch=@idBranch AND pp.idCuenta=@idCuenta AND pp.idProveedor=@idProveedor AND pp.Folio=@folio`);
    const paq = r.recordset[0];
    if (!paq || !VISIBLES.includes(paq.Status)) return reply.code(404).send({ error: 'Pedido no encontrado' });
    if (!paso.desde.includes(paq.Status)) return reply.code(409).send({ error: 'El pedido ya no está en ese paso; recarga la página' });
    if (accion === 'entregar' && normalizarCodigo(request.body?.codigo) !== paq.CodigoRetiro)
      return reply.code(422).send({ error: 'El código no coincide. Pide que te muestren el QR del pedido.' });

    const notas = accion === 'confirmar' ? (String(request.body?.Notas || '').trim().slice(0, 500) || null) : undefined;
    // El UPDATE repite el Status esperado: si dos personas tocan el pedido a la vez, solo entra una.
    const upd = await pool.request()
      .input('idBranch', sql.BigInt, prov.idBranch).input('idCuenta', sql.BigInt, prov.idCuenta)
      .input('pp', sql.BigInt, paq.idPedidoProveedor).input('antes', sql.VarChar(20), paq.Status)
      .input('st', sql.VarChar(20), paso.hacia).input('notas', sql.VarChar(500), notas ?? null)
      .input('retiro', sql.VarChar(12), paq.ModoRecepcion === 'RECOJO' ? 'TIENDA' : 'REPARTIDOR')
      .query(`UPDATE VIDA_PEDIDOS_PROVEEDOR SET Status=@st, FechaMod=GETUTCDATE()
                ${accion === 'confirmar' ? ', NotasProveedor=@notas' : ''}
                ${accion === 'entregar' ? ', RetiradoPor=@retiro, FechaRetiro=GETUTCDATE()' : ''}
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedidoProveedor=@pp AND Status=@antes`);
    if (!upd.rowsAffected[0]) return reply.code(409).send({ error: 'El pedido cambió mientras tanto; recarga la página' });
    return reply.send({ ok: true, Status: paso.hacia });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'No se pudo actualizar el pedido' });
  }
}
