// src/controllers/delivery/puntos.js
// Puntos de fidelización del cliente: saldo, acreditación y reembolso al cancelar.
// (Separado de delivery.controller.js, que reexporta todo.)
import { getPool, sql } from '../../db/sqlserver.js';
import { getConfigVal } from './comun.js';

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — LOGIN
// POST /delivery/repartidor/login
// ══════════════════════════════════════════════════════════════════════════

// Reembolsa al cliente los puntos usados en un pedido cancelado. Idempotente
// (no reembolsa dos veces). `makeReq` crea un request nuevo sobre el pool o la
// transacción, según el contexto donde se llame.
export async function reembolsarPuntosPedido(makeReq, idBranch, idCuenta, idPedido) {
  const ped = await makeReq()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .input('idPedido', sql.BigInt, idPedido)
    .query(`SELECT idCliente, ISNULL(PuntosUsados,0) AS PuntosUsados FROM VIDA_PEDIDOS
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);
  const row = ped.recordset[0];
  if (!row || !row.idCliente || row.PuntosUsados <= 0) return;

  const ya = await makeReq()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .input('idPedido', sql.BigInt, idPedido)
    .query(`SELECT TOP 1 idMovimiento FROM VIDA_CLIENTE_PUNTOS
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido AND Tipo='REEMBOLSO'`);
  if (ya.recordset.length) return;

  const idR = await makeReq()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(idMovimiento),0)+1 AS next FROM VIDA_CLIENTE_PUNTOS WITH (UPDLOCK, HOLDLOCK)
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
  const movId = idR.recordset[0].next;

  await makeReq()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .input('idMovimiento', sql.BigInt, movId)
    .input('idCliente', sql.BigInt, row.idCliente)
    .input('Puntos', sql.Int, row.PuntosUsados)
    .input('idPedido', sql.BigInt, idPedido)
    .input('Descripcion', sql.NVarChar(200), `Reembolso por cancelación del pedido #${idPedido}`)
    .query(`INSERT INTO VIDA_CLIENTE_PUNTOS (idBranch,idCuenta,idMovimiento,idCliente,Tipo,Puntos,idPedido,Descripcion)
            VALUES (@idBranch,@idCuenta,@idMovimiento,@idCliente,'REEMBOLSO',@Puntos,@idPedido,@Descripcion)`);
  await makeReq()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .input('idCliente', sql.BigInt, row.idCliente)
    .input('Puntos', sql.Int, row.PuntosUsados)
    .query(`UPDATE VIDA_APP_CLIENTES SET PuntosSaldo = ISNULL(PuntosSaldo,0) + @Puntos
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — BILLETERA DE PUNTOS (saldo + historial)
// GET /delivery/cliente/puntos
// ══════════════════════════════════════════════════════════════════════════
export async function puntosCliente(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  try {
    const pool = await getPool();
    const puntosPorDolar = parseInt(await getConfigVal(pool, idBranch, idCuenta, 'PuntosPorDolar', '10')) || 10;
    const puntosPorDolarCanje = parseInt(await getConfigVal(pool, idBranch, idCuenta, 'PuntosPorDolarCanje', '100')) || 100;

    const saldoR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT ISNULL(PuntosSaldo,0) AS PuntosSaldo FROM VIDA_APP_CLIENTES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);

    const movR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT TOP 50 idMovimiento, Tipo, Puntos, idPedido, Descripcion, FechaAlta
              FROM VIDA_CLIENTE_PUNTOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente
              ORDER BY FechaAlta DESC, idMovimiento DESC`);

    return reply.send({
      saldo: saldoR.recordset[0]?.PuntosSaldo ?? 0,
      puntosPorDolar,
      puntosPorDolarCanje,
      movimientos: movR.recordset,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener puntos' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — SALUD: "Mi Consumo Vida" (hidratación)
// ══════════════════════════════════════════════════════════════════════════

// Acredita puntos al cliente (pool, no transacción). Actualiza saldo + ledger.
export async function acreditarPuntosCliente(pool, idBranch, idCuenta, idCliente, puntos, descripcion) {
  if (!puntos || puntos <= 0) return;
  // Ledger + saldo en una transacción; id atómico en el mismo INSERT
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idCliente', sql.BigInt, idCliente)
      .input('Puntos', sql.Int, puntos).input('Descripcion', sql.NVarChar(200), descripcion)
      .query(`INSERT INTO VIDA_CLIENTE_PUNTOS (idBranch,idCuenta,idMovimiento,idCliente,Tipo,Puntos,idPedido,Descripcion)
              SELECT @idBranch,@idCuenta,ISNULL(MAX(idMovimiento),0)+1,@idCliente,'GANADO',@Puntos,NULL,@Descripcion
              FROM VIDA_CLIENTE_PUNTOS WITH (UPDLOCK, HOLDLOCK) WHERE idBranch=@idBranch AND idCuenta=@idCuenta;
              UPDATE VIDA_APP_CLIENTES SET PuntosSaldo = ISNULL(PuntosSaldo,0) + @Puntos
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
    await tx.commit();
  } catch (e) { try { await tx.rollback(); } catch { } throw e; }
}
