// src/controllers/servicios.controller.js
// Servicios y Recargas del consumidor (Movistar/Movilnet/Digitel/Inter/SimpleTV/
// CANTV…). Sin integración real de telco: la orden queda PROCESANDO y ops la
// completa o rechaza. El cliente gana puntos al crear (reversibles si se rechaza).
import { getPool, sql } from '../db/sqlserver.js';

async function nextId(pool, tabla, campo, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}),0)+1 AS next FROM ${tabla} WITH (UPDLOCK, HOLDLOCK)
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
  return r.recordset[0].next;
}

async function puntosPorDolar(pool, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT Valor FROM VIDA_CONFIG_DELIVERY WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Clave='PuntosPorDolar'`);
  return parseInt(r.recordset[0]?.Valor) || 10;
}

async function movPuntos(pool, idBranch, idCuenta, idCliente, puntos, tipo, descripcion) {
  if (!puntos) return;
  const movId = await nextId(pool, 'VIDA_CLIENTE_PUNTOS', 'idMovimiento', idBranch, idCuenta);
  await pool.request()
    .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
    .input('idMovimiento', sql.BigInt, movId).input('idCliente', sql.BigInt, idCliente)
    .input('Tipo', sql.VarChar(20), tipo).input('Puntos', sql.Int, puntos).input('Descripcion', sql.VarChar(200), descripcion)
    .query(`INSERT INTO VIDA_CLIENTE_PUNTOS (idBranch,idCuenta,idMovimiento,idCliente,Tipo,Puntos,idPedido,Descripcion)
            VALUES (@idBranch,@idCuenta,@idMovimiento,@idCliente,@Tipo,@Puntos,NULL,@Descripcion)`);
  await pool.request()
    .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
    .input('idCliente', sql.BigInt, idCliente).input('Puntos', sql.Int, puntos)
    .query(`UPDATE VIDA_APP_CLIENTES SET PuntosSaldo = ISNULL(PuntosSaldo,0) + @Puntos
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
}

// GET /delivery/cliente/servicios/operadoras
export async function listarOperadoras(request, reply) {
  const { idBranch, idCuenta } = request.cliente;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT idOperadora, Nombre, Tipo, Categoria, Color FROM VIDA_SERVICIOS_OPERADORAS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Activo=1 ORDER BY Orden, Nombre`);
    return reply.send(r.recordset);
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al obtener operadoras' }); }
}

// POST /delivery/cliente/servicios  { idOperadora, NumeroDestino, MontoUSD, MetodoPago }
export async function crearOrdenServicio(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const { idOperadora, NumeroDestino, MontoUSD, MetodoPago } = request.body || {};
  const monto = Number(MontoUSD);
  if (!idOperadora || !NumeroDestino?.trim() || !(monto > 0)) {
    return reply.code(400).send({ error: 'Operadora, número y monto (>0) son requeridos' });
  }
  try {
    const pool = await getPool();
    const opR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idOperadora', sql.BigInt, idOperadora)
      .query(`SELECT Nombre, Tipo FROM VIDA_SERVICIOS_OPERADORAS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idOperadora=@idOperadora AND Activo=1`);
    if (!opR.recordset.length) return reply.code(404).send({ error: 'Operadora no encontrada' });
    const op = opR.recordset[0];

    const idOrden = await nextId(pool, 'VIDA_SERVICIOS_ORDENES', 'idOrden', idBranch, idCuenta);
    const referencia = `SVC-${idOrden}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const ppd = await puntosPorDolar(pool, idBranch, idCuenta);
    const puntos = Math.round(monto * ppd);

    await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('idOrden', sql.BigInt, idOrden).input('idCliente', sql.BigInt, idCliente)
      .input('idOperadora', sql.BigInt, idOperadora).input('NombreOperadora', sql.VarChar(80), op.Nombre)
      .input('Tipo', sql.VarChar(30), op.Tipo).input('NumeroDestino', sql.VarChar(60), NumeroDestino.trim())
      .input('MontoUSD', sql.Decimal(18,2), monto).input('MetodoPago', sql.VarChar(20), (MetodoPago || 'PAGO_MOVIL'))
      .input('Referencia', sql.VarChar(40), referencia).input('PuntosGanados', sql.Int, puntos)
      .query(`INSERT INTO VIDA_SERVICIOS_ORDENES
                (idBranch,idCuenta,idOrden,idCliente,idOperadora,NombreOperadora,Tipo,NumeroDestino,MontoUSD,MetodoPago,Referencia,Status,PuntosGanados)
              VALUES (@idBranch,@idCuenta,@idOrden,@idCliente,@idOperadora,@NombreOperadora,@Tipo,@NumeroDestino,@MontoUSD,@MetodoPago,@Referencia,'PROCESANDO',@PuntosGanados)`);

    if (puntos > 0) await movPuntos(pool, idBranch, idCuenta, idCliente, puntos, 'GANADO', `${op.Nombre} ${NumeroDestino.trim()} (${referencia})`);

    return reply.code(201).send({ idOrden, referencia, status: 'PROCESANDO', montoUSD: monto, puntosGanados: puntos });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al crear la orden de servicio' }); }
}

// GET /delivery/cliente/servicios
export async function misServicios(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT TOP 50 idOrden, NombreOperadora, Tipo, NumeroDestino, MontoUSD, MetodoPago, Referencia, Status, PuntosGanados, FechaAlta
              FROM VIDA_SERVICIOS_ORDENES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente
              ORDER BY FechaAlta DESC, idOrden DESC`);
    return reply.send(r.recordset);
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al obtener servicios' }); }
}

// PATCH /delivery/admin/servicios/:idOrden/estado  { Status }  (ops)
export async function cambiarEstadoServicio(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idOrden } = request.params;
  const { Status } = request.body || {};
  if (!['COMPLETADO', 'RECHAZADO'].includes(Status)) {
    return reply.code(400).send({ error: 'Status debe ser COMPLETADO o RECHAZADO' });
  }
  try {
    const pool = await getPool();
    const oR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idOrden', sql.BigInt, idOrden)
      .query(`SELECT idCliente, Status, PuntosGanados, NombreOperadora, Referencia FROM VIDA_SERVICIOS_ORDENES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idOrden=@idOrden`);
    if (!oR.recordset.length) return reply.code(404).send({ error: 'Orden no encontrada' });
    const o = oR.recordset[0];
    if (o.Status !== 'PROCESANDO') return reply.code(409).send({ error: `La orden ya está ${o.Status}` });

    await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('idOrden', sql.BigInt, idOrden).input('Status', sql.VarChar(20), Status)
      .query(`UPDATE VIDA_SERVICIOS_ORDENES SET Status=@Status, FechaMod=GETDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idOrden=@idOrden`);

    // Si se rechaza, revertir los puntos otorgados al crear
    if (Status === 'RECHAZADO' && o.PuntosGanados > 0) {
      await movPuntos(pool, idBranch, idCuenta, o.idCliente, -o.PuntosGanados, 'AJUSTE',
        `Reverso servicio rechazado (${o.Referencia})`);
    }
    return reply.send({ ok: true, status: Status });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al cambiar el estado' }); }
}
