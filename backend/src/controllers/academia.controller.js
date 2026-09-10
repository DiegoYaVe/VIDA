// src/controllers/academia.controller.js
// Academia VIDA — capacitación del empresario. Cursos + progreso por usuario.
// Al completar un curso suma "puntos de academia" (separados del cliente).
import { getPool, sql } from '../db/sqlserver.js';

async function nextId(pool, tabla, campo, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}),0)+1 AS next FROM ${tabla} WITH (UPDLOCK, HOLDLOCK)
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
  return r.recordset[0].next;
}

async function resumen(pool, idBranch, idCuenta, idUsuario) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .input('idUsuario', sql.BigInt, idUsuario)
    .query(`
      SELECT
        (SELECT COUNT(*) FROM VIDA_ACADEMIA_CURSOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO') AS Total,
        (SELECT COUNT(*) FROM VIDA_ACADEMIA_PROGRESO p JOIN VIDA_ACADEMIA_CURSOS c
            ON c.idBranch=p.idBranch AND c.idCuenta=p.idCuenta AND c.idCurso=p.idCurso AND c.Status='ACTIVO'
          WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta AND p.idUsuario=@idUsuario AND p.Completado=1) AS Completados,
        (SELECT ISNULL(SUM(c.Puntos),0) FROM VIDA_ACADEMIA_PROGRESO p JOIN VIDA_ACADEMIA_CURSOS c
            ON c.idBranch=p.idBranch AND c.idCuenta=p.idCuenta AND c.idCurso=p.idCurso AND c.Status='ACTIVO'
          WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta AND p.idUsuario=@idUsuario AND p.Completado=1) AS Puntos`);
  const s = r.recordset[0];
  return { total: s.Total, completados: s.Completados, puntos: s.Puntos };
}

// GET /academia/cursos
export async function listarCursos(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idUsuario', sql.BigInt, idUsuario)
      .query(`
        SELECT c.idCurso, c.Titulo, c.Descripcion, c.Categoria, c.VideoUrl, c.DuracionMin, c.Puntos,
               CAST(CASE WHEN p.Completado=1 THEN 1 ELSE 0 END AS BIT) AS Completado,
               p.FechaCompletado
        FROM VIDA_ACADEMIA_CURSOS c
        LEFT JOIN VIDA_ACADEMIA_PROGRESO p
          ON p.idBranch=c.idBranch AND p.idCuenta=c.idCuenta AND p.idCurso=c.idCurso AND p.idUsuario=@idUsuario
        WHERE c.idBranch=@idBranch AND c.idCuenta=@idCuenta AND c.Status='ACTIVO'
        ORDER BY c.Orden, c.idCurso`);
    return reply.send({ cursos: r.recordset, resumen: await resumen(pool, idBranch, idCuenta, idUsuario) });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener los cursos' });
  }
}

// POST /academia/cursos/:idCurso/completar
export async function completarCurso(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idCurso } = request.params;
  try {
    const pool = await getPool();
    const c = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idCurso', sql.BigInt, idCurso)
      .query(`SELECT Titulo FROM VIDA_ACADEMIA_CURSOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCurso=@idCurso AND Status='ACTIVO'`);
    if (!c.recordset.length) return reply.code(404).send({ error: 'Curso no encontrado' });

    await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('idUsuario', sql.BigInt, idUsuario).input('idCurso', sql.BigInt, idCurso)
      .query(`MERGE VIDA_ACADEMIA_PROGRESO AS t
              USING (SELECT @idBranch AS idBranch,@idCuenta AS idCuenta,@idUsuario AS idUsuario,@idCurso AS idCurso) AS s
                ON (t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.idUsuario=s.idUsuario AND t.idCurso=s.idCurso)
              WHEN MATCHED AND t.Completado=0 THEN UPDATE SET Completado=1, FechaCompletado=GETDATE()
              WHEN NOT MATCHED THEN INSERT (idBranch,idCuenta,idUsuario,idCurso,Completado,FechaCompletado)
                VALUES (@idBranch,@idCuenta,@idUsuario,@idCurso,1,GETDATE());`);

    return reply.send({ ok: true, resumen: await resumen(pool, idBranch, idCuenta, idUsuario) });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al completar el curso' });
  }
}

// ── CRUD de cursos (corporativo) ──────────────────────────────────────────
// GET /academia/admin/cursos
export async function listarCursosAdmin(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();
    const r = await pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT idCurso, Titulo, Descripcion, Categoria, VideoUrl, DuracionMin, Puntos, Orden, Status
              FROM VIDA_ACADEMIA_CURSOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta ORDER BY Orden, idCurso`);
    return reply.send(r.recordset);
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al listar cursos' }); }
}
// POST /academia/admin/cursos
export async function crearCurso(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const b = request.body || {};
  if (!b.Titulo?.trim()) return reply.code(400).send({ error: 'El título es obligatorio' });
  try {
    const pool = await getPool();
    const id = await nextId(pool, 'VIDA_ACADEMIA_CURSOS', 'idCurso', idBranch, idCuenta);
    await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idCurso', sql.BigInt, id)
      .input('Titulo', sql.VarChar(150), b.Titulo.trim()).input('Descripcion', sql.VarChar(600), b.Descripcion || null)
      .input('Categoria', sql.VarChar(60), b.Categoria || null).input('VideoUrl', sql.VarChar(400), b.VideoUrl || null)
      .input('DuracionMin', sql.Int, parseInt(b.DuracionMin) || 0).input('Puntos', sql.Int, parseInt(b.Puntos) || 0)
      .input('Orden', sql.Int, parseInt(b.Orden) || 0)
      .query(`INSERT INTO VIDA_ACADEMIA_CURSOS (idBranch,idCuenta,idCurso,Titulo,Descripcion,Categoria,VideoUrl,DuracionMin,Puntos,Orden,Status)
              VALUES (@idBranch,@idCuenta,@idCurso,@Titulo,@Descripcion,@Categoria,@VideoUrl,@DuracionMin,@Puntos,@Orden,'ACTIVO')`);
    return reply.code(201).send({ idCurso: id });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al crear curso' }); }
}
// PUT /academia/admin/cursos/:idCurso
export async function editarCurso(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idCurso } = request.params;
  const b = request.body || {};
  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idCurso', sql.BigInt, idCurso)
      .input('Titulo', sql.VarChar(150), b.Titulo?.trim() || null).input('Descripcion', sql.VarChar(600), b.Descripcion || null)
      .input('Categoria', sql.VarChar(60), b.Categoria || null).input('VideoUrl', sql.VarChar(400), b.VideoUrl || null)
      .input('DuracionMin', sql.Int, parseInt(b.DuracionMin) || 0).input('Puntos', sql.Int, parseInt(b.Puntos) || 0)
      .input('Orden', sql.Int, parseInt(b.Orden) || 0).input('Status', sql.VarChar(20), b.Status || 'ACTIVO')
      .query(`UPDATE VIDA_ACADEMIA_CURSOS SET Titulo=@Titulo, Descripcion=@Descripcion, Categoria=@Categoria, VideoUrl=@VideoUrl,
                DuracionMin=@DuracionMin, Puntos=@Puntos, Orden=@Orden, Status=@Status
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCurso=@idCurso`);
    return reply.send({ ok: true });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al editar curso' }); }
}
// DELETE /academia/admin/cursos/:idCurso  (soft)
export async function eliminarCurso(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idCurso } = request.params;
  try {
    const pool = await getPool();
    await pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idCurso', sql.BigInt, idCurso)
      .query(`UPDATE VIDA_ACADEMIA_CURSOS SET Status='INACTIVO' WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCurso=@idCurso`);
    return reply.send({ ok: true });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al eliminar curso' }); }
}
