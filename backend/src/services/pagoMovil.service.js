// src/services/pagoMovil.service.js
// Plazo para pagar los pedidos de Pago Móvil. Un pedido que se queda en
// ESPERANDO_PAGO sin comprobante en revisión se cancela al vencer el plazo y
// se le devuelven los puntos canjeados (igual que las demás cancelaciones).
import { getPool, sql } from '../db/sqlserver.js';
import { broadcast } from '../ws/ws.manager.js';
import { enviarPush } from './push.service.js';
import { reembolsarPuntosPedido } from '../controllers/delivery.controller.js';

export const PLAZO_PAGO_MOVIL_DEFAULT_MIN = 60;

// Minutos que tiene el cliente para mandar su comprobante, según la clave
// PlazoPagoMovilMin de VIDA_CONFIG_DELIVERY. '0' desactiva el vencimiento;
// vacío o inválido usa el valor por defecto.
export function plazoPagoMinutos(valor) {
  if (valor == null || String(valor).trim() === '') return PLAZO_PAGO_MOVIL_DEFAULT_MIN;
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 ? n : PLAZO_PAGO_MOVIL_DEFAULT_MIN;
}

// El plazo corre desde la última novedad del pedido (alta, comprobante subido
// o rechazado): un rechazo le devuelve al cliente el plazo completo. Las
// fechas de delivery se guardan con GETDATE(), así que todo se compara en SQL
// contra el mismo reloj (no en JS, donde saldría corrido por zona horaria).
export const SQL_SEGUNDOS_SIN_PAGO = 'DATEDIFF(SECOND, COALESCE(p.FechaMod, p.FechaAlta), GETDATE())';
const SIN_COMPROBANTE_PENDIENTE = `NOT EXISTS (SELECT 1 FROM VIDA_PEDIDOS_COMPROBANTES c
  WHERE c.idBranch=p.idBranch AND c.idCuenta=p.idCuenta AND c.idPedido=p.idPedido AND c.StatusRevision='PENDIENTE')`;

async function cancelarPorPlazo(pool, p, plazo, log) {
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    // Se revalida todo en la misma sentencia: el cliente pudo subir un
    // comprobante (o el panel rechazarlo) entre la consulta y este momento.
    const upd = await new sql.Request(transaction)
      .input('idBranch', sql.BigInt, p.idBranch)
      .input('idCuenta', sql.BigInt, p.idCuenta)
      .input('idPedido', sql.BigInt, p.idPedido)
      .input('segundos', sql.Int, plazo * 60)
      .query(`UPDATE p SET Status='CANCELADO', FechaMod=GETDATE()
              FROM VIDA_PEDIDOS p
              WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta AND p.idPedido=@idPedido
                AND p.Status='ESPERANDO_PAGO' AND ${SIN_COMPROBANTE_PENDIENTE}
                AND ${SQL_SEGUNDOS_SIN_PAGO} >= @segundos`);
    if (upd.rowsAffected[0] === 0) { await transaction.rollback(); return false; }

    await reembolsarPuntosPedido(() => new sql.Request(transaction), p.idBranch, p.idCuenta, p.idPedido);

    await new sql.Request(transaction)
      .input('idBranch', sql.BigInt, p.idBranch)
      .input('idCuenta', sql.BigInt, p.idCuenta)
      .input('idPedido', sql.BigInt, p.idPedido)
      .input('Notas', sql.VarChar(300), `Plazo de pago vencido (${plazo} min sin comprobante)`)
      .query(`INSERT INTO VIDA_PEDIDOS_HISTORIAL
                (idBranch, idCuenta, idHistorial, idPedido, StatusAnterior, StatusNuevo, Notas, UsuAlta)
              SELECT @idBranch, @idCuenta, ISNULL(MAX(idHistorial),0)+1, @idPedido, 'ESPERANDO_PAGO', 'CANCELADO', @Notas, 'SISTEMA'
              FROM VIDA_PEDIDOS_HISTORIAL WITH (UPDLOCK, HOLDLOCK)
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);

    await transaction.commit();
    return true;
  } catch (err) {
    try { await transaction.rollback(); } catch {}
    log?.error?.(`Vencimiento de Pago Móvil del pedido ${p.idPedido} falló: ${err.message}`);
    return false;
  }
}

// Job (cada minuto): cancela los Pago Móvil cuyo plazo venció. Devuelve los
// idPedido cancelados.
export async function vencerPagosMovilesImpagos(log) {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT p.idBranch, p.idCuenta, p.idPedido, p.idCliente, cl.FcmToken,
           cfg.Valor AS PlazoCfg, ${SQL_SEGUNDOS_SIN_PAGO} AS SegundosSinPago
    FROM VIDA_PEDIDOS p
    LEFT JOIN VIDA_CONFIG_DELIVERY cfg
      ON cfg.idBranch=p.idBranch AND cfg.idCuenta=p.idCuenta AND cfg.Clave='PlazoPagoMovilMin'
    LEFT JOIN VIDA_APP_CLIENTES cl
      ON cl.idBranch=p.idBranch AND cl.idCuenta=p.idCuenta AND cl.idCliente=p.idCliente
    WHERE p.Status='ESPERANDO_PAGO' AND p.MetodoPago='PAGO_MOVIL' AND ${SIN_COMPROBANTE_PENDIENTE}`);

  const cancelados = [];
  for (const p of r.recordset) {
    const plazo = plazoPagoMinutos(p.PlazoCfg);
    if (!plazo || p.SegundosSinPago < plazo * 60) continue;
    if (!(await cancelarPorPlazo(pool, p, plazo, log))) continue;
    cancelados.push(Number(p.idPedido));

    broadcast(p.idBranch, p.idCuenta, {
      tipo: 'status_pedido', idPedido: Number(p.idPedido), idCliente: p.idCliente, estado: 'CANCELADO', motivo: 'PLAZO_PAGO',
    });
    broadcast(p.idBranch, p.idCuenta, {
      tipo: 'pedido:actualizado', idPedido: Number(p.idPedido), StatusNuevo: 'CANCELADO',
    });
    enviarPush(p.FcmToken, {
      title: '⏰ Pedido cancelado',
      body: `Tu pedido #${p.idPedido} se canceló porque no recibimos el comprobante de Pago Móvil a tiempo.`,
      data: { tipo: 'status_pedido', idPedido: Number(p.idPedido), status: 'CANCELADO' },
    }, log);
  }
  if (cancelados.length) log?.info?.(`Pago Móvil vencido: pedidos cancelados ${cancelados.join(', ')}`);
  return cancelados;
}
