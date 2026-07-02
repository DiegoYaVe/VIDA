// src/routes/audit.routes.js
// Consulta y verificación de integridad del audit log (solo lectura — la
// tabla es inmutable por trigger y las firmas HMAC detectan alteraciones)
import { requireRole } from '../middlewares/auth.js';
import { getPool, sql } from '../db/sqlserver.js';
import { verificarFila } from '../services/audit.service.js';

const AUDITORES = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN'];

export async function auditRoutes(fastify) {

  // GET /audit-log?entityType=PEDIDO&entityId=123&accion=&page=1&limit=50
  fastify.get('/audit-log', { preHandler: [requireRole(...AUDITORES)] }, async (request, reply) => {
    const { idBranch, idCuenta } = request.user;
    const { entityType = '', entityId = '', accion = '', page = 1, limit = 50 } = request.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
      const pool = await getPool();

      let whereExtra = '';
      if (entityType) whereExtra += ' AND EntityType = @entityType';
      if (entityId)   whereExtra += ' AND EntityId = @entityId';
      if (accion)     whereExtra += ' AND Accion = @accion';

      const req = pool.request()
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta)
        .input('offset',   sql.Int,    offset)
        .input('limit',    sql.Int,    Math.min(parseInt(limit), 200));

      if (entityType) req.input('entityType', sql.VarChar(50), entityType);
      if (entityId)   req.input('entityId',   sql.VarChar(50), String(entityId));
      if (accion)     req.input('accion',     sql.VarChar(50), accion);

      const r = await req.query(`
        SELECT idAudit, idBranch, idCuenta, EntityType, EntityId, Accion, Actor, DataJSON, Hash, FechaAlta
        FROM VIDA_AUDIT_LOG
        WHERE idBranch = @idBranch AND idCuenta = @idCuenta
        ${whereExtra}
        ORDER BY idAudit DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

      // Verificación de integridad: si alguien alteró una fila directamente
      // en la BD (saltándose el trigger), la firma no coincide → valida: false
      const data = r.recordset.map(fila => ({
        idAudit:    fila.idAudit,
        EntityType: fila.EntityType,
        EntityId:   fila.EntityId,
        Accion:     fila.Accion,
        Actor:      fila.Actor,
        Data:       JSON.parse(fila.DataJSON),
        FechaAlta:  fila.FechaAlta,
        integra:    verificarFila(fila),
      }));

      const totalR = await pool.request()
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta)
        .query(`SELECT COUNT(*) AS total FROM VIDA_AUDIT_LOG WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);

      return reply.send({
        data,
        total: totalR.recordset[0].total,
        page: parseInt(page),
        comprometidas: data.filter(d => !d.integra).length,
      });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Error al consultar audit log' });
    }
  });
}
