// src/controllers/devoluciones.controller.js
// Devolución de ventas: inventario, reembolso en caja y nota de crédito en una
// sola operación (ver services/devolucion.service.js).
import { getPool, sql } from '../db/sqlserver.js';
import { registrarAuditoria } from '../services/audit.service.js';
import { tiendaEnAlcance } from '../services/alcance.service.js';
import { devolverVenta, estadoDevoluciones } from '../services/devolucion.service.js';
import { tasaDeLaVenta } from '../services/factura.service.js';
import { enTransaccion, autorizador } from './facturas.controller.js';

// GET /pedidos/:idPedido/devoluciones — lo vendido, lo ya devuelto y el historial
export async function verDevoluciones(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idPedido } = request.params;
  try {
    const pool = await getPool();
    const pr = await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('id', sql.BigInt, idPedido)
      .query(`SELECT p.idPedido, p.idPuntoVenta, p.Status, p.TotalUSD, p.MetodoPago, p.PagoMonedaJSON, p.FechaAlta,
                     f.idFactura, f.Status AS StatusFactura
              FROM VIDA_PEDIDOS p
              LEFT JOIN VIDA_FACTURAS f ON f.idBranch=p.idBranch AND f.idCuenta=p.idCuenta AND f.idPedido=p.idPedido AND f.TipoDocumento='FACTURA'
              WHERE p.idBranch=@b AND p.idCuenta=@c AND p.idPedido=@id`);
    const p = pr.recordset[0];
    if (!p || !(await tiendaEnAlcance(request.user, p.idPuntoVenta, pool))) return reply.code(404).send({ error: 'Venta no encontrada' });
    const estado = await estadoDevoluciones(pool, request.user, idPedido);
    let tasa = null;
    try { tasa = (await tasaDeLaVenta(pool, request.user, p)).tasa; } catch { /* sin tasa: solo reembolso en USD */ }
    const { PagoMonedaJSON, ...pedido } = p;
    const pago = JSON.parse(PagoMonedaJSON || 'null');
    return reply.send({ pedido: { ...pedido, MonedaPago: pago?.Moneda ?? 'USD' }, tasa, ...estado });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al consultar las devoluciones' });
  }
}

// POST /pedidos/:idPedido/devolucion
// { Items: [{ idDetalle, Cantidad }], Motivo, MetodoReembolso: 'EFECTIVO'|'EXTERNO', Moneda: 'USD'|'VES' }
export async function crearDevolucion(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { Items, Motivo, MetodoReembolso, Moneda } = request.body || {};
  return enTransaccion(request, reply, async (tx, pool) => {
    const res = await devolverVenta(tx, request.user, {
      idPedido: request.params.idPedido, items: Items, motivo: Motivo, metodoReembolso: MetodoReembolso, moneda: Moneda,
    }, autorizador(request.user, pool));
    await registrarAuditoria(tx, { idBranch, idCuenta, entityType: 'PEDIDO', entityId: res.idPedido,
      accion: 'DEVOLUCION_VENTA', actor: idUsuario, data: { ...res, Items, Motivo } }, request.log);
    return res;
  }, 201);
}
