// src/controllers/academia.controller.js
// Academia VIDA — LMS completo (estilo Udemy/Platzi) para el panel.
//   Curso → Módulos → Lecciones (VIDEO/TEXTO/PDF/QUIZ)
//   Targeting por rol y por usuario · progreso granular por lección ·
//   comentarios · diplomas con folio+QR · analítica administrativa.
// Multi-tenant por (idBranch, idCuenta). La lógica pura vive en academia.logic.js.
import QRCode from 'qrcode';
import { getPool, sql } from '../db/sqlserver.js';
import {
  puedeVerCurso, estaFueraDeTiempo, diasRestantes,
  porcentajeProgreso, cursoCompleto, calificarQuiz, generarFolio,
} from './academia.logic.js';

// ── Helper: inserta con id secuencial por (idBranch,idCuenta) de forma ATÓMICA
// (INSERT…OUTPUT…SELECT ISNULL(MAX)+1 … WITH (UPDLOCK,HOLDLOCK)); mismo patrón
// que inventario.controller.js — evita PK duplicada bajo concurrencia.
async function insertarConId(req, { tabla, idCol, columnas, valores }) {
  const colList = ['idBranch', 'idCuenta', idCol, ...columnas].join(', ');
  const valExpr = ['@idBranch', '@idCuenta', `ISNULL(MAX(${idCol}), 0) + 1`, ...valores].join(', ');
  const r = await req.query(`
    INSERT INTO ${tabla} (${colList})
    OUTPUT inserted.${idCol} AS nuevoId
    SELECT ${valExpr}
    FROM ${tabla} WITH (UPDLOCK, HOLDLOCK)
    WHERE idBranch = @idBranch AND idCuenta = @idCuenta`);
  return r.recordset[0].nuevoId;
}

// ── Helper: targeting (roles + usuarios asignados) de un curso ──────────────
async function targetingCurso(pool, idBranch, idCuenta, idCurso) {
  const [roles, usuarios] = await Promise.all([
    pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
      .query(`SELECT Rol FROM VIDA_ACADEMIA_CURSO_ROLES WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur`),
    pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
      .query(`SELECT idUsuario FROM VIDA_ACADEMIA_CURSO_USUARIOS WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur`),
  ]);
  return {
    roles: roles.recordset.map(r => r.Rol),
    usuarios: usuarios.recordset.map(r => Number(r.idUsuario)),
  };
}

// ── Helper: recomputa el estado del curso para un usuario a partir del
// progreso granular por lección. Si quedó completo, marca VIDA_ACADEMIA_PROGRESO
// y emite la constancia (idempotente). Devuelve { completado, total, completadas }.
async function recomputarCurso(pool, idBranch, idCuenta, idUsuario, idCurso, nombreUsuario) {
  const r = await pool.request()
    .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
    .input('u', sql.BigInt, idUsuario).input('cur', sql.BigInt, idCurso)
    .query(`
      SELECT
        (SELECT COUNT(*) FROM VIDA_ACADEMIA_LECCIONES
           WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur AND Status='ACTIVO') AS Total,
        (SELECT COUNT(*) FROM VIDA_ACADEMIA_LECCION_PROGRESO p
           JOIN VIDA_ACADEMIA_LECCIONES l ON l.idBranch=p.idBranch AND l.idCuenta=p.idCuenta AND l.idLeccion=p.idLeccion AND l.Status='ACTIVO'
           WHERE p.idBranch=@b AND p.idCuenta=@c AND p.idUsuario=@u AND p.idCurso=@cur AND p.Completado=1) AS Hechas`);
  const total = r.recordset[0].Total, completadas = r.recordset[0].Hechas;
  const completo = cursoCompleto(total, completadas);

  if (completo) {
    // Marca el curso completado (MERGE idempotente sobre la tabla v1)
    await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
      .input('u', sql.BigInt, idUsuario).input('cur', sql.BigInt, idCurso)
      .query(`MERGE VIDA_ACADEMIA_PROGRESO AS t
              USING (SELECT @b AS idBranch,@c AS idCuenta,@u AS idUsuario,@cur AS idCurso) AS s
                ON (t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.idUsuario=s.idUsuario AND t.idCurso=s.idCurso)
              WHEN MATCHED AND t.Completado=0 THEN UPDATE SET Completado=1, FechaCompletado=GETDATE()
              WHEN NOT MATCHED THEN INSERT (idBranch,idCuenta,idUsuario,idCurso,Completado,FechaCompletado)
                VALUES (@b,@c,@u,@cur,1,GETDATE());`);
    await emitirConstancia(pool, idBranch, idCuenta, idUsuario, idCurso, nombreUsuario);
  }
  return { completado: completo, total, completadas };
}

// ── Helper: emite una constancia (idempotente por usuario+curso) ────────────
async function emitirConstancia(pool, idBranch, idCuenta, idUsuario, idCurso, nombreUsuario) {
  const ya = await pool.request()
    .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
    .input('u', sql.BigInt, idUsuario).input('cur', sql.BigInt, idCurso)
    .query(`SELECT idDiploma FROM VIDA_ACADEMIA_DIPLOMAS WHERE idBranch=@b AND idCuenta=@c AND idUsuario=@u AND idCurso=@cur`);
  if (ya.recordset.length) return ya.recordset[0].idDiploma;

  const curso = await pool.request()
    .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
    .query(`SELECT Titulo FROM VIDA_ACADEMIA_CURSOS WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur`);
  const titulo = curso.recordset[0]?.Titulo || 'Curso';
  const folio = generarFolio(idCurso, idUsuario);

  try {
    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('Folio', sql.VarChar(40), folio)
      .input('idCurso', sql.BigInt, idCurso).input('idUsuario', sql.BigInt, idUsuario)
      .input('NombreUsuario', sql.VarChar(200), nombreUsuario || `Usuario ${idUsuario}`)
      .input('TituloCurso', sql.VarChar(200), titulo);
    return await insertarConId(req, {
      tabla: 'VIDA_ACADEMIA_DIPLOMAS', idCol: 'idDiploma',
      columnas: ['Folio', 'idCurso', 'idUsuario', 'NombreUsuario', 'TituloCurso'],
      valores: ['@Folio', '@idCurso', '@idUsuario', '@NombreUsuario', '@TituloCurso'],
    });
  } catch (e) {
    // Carrera: si otro request ya la creó (índice único usuario+curso), ignora.
    if (String(e.message || '').includes('UX_ACAD_DIPLOMA')) return null;
    throw e;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// LEARNER — "mis cursos" filtrados por targeting del usuario actual
// ════════════════════════════════════════════════════════════════════════════

// GET /academia/cursos
export async function listarCursos(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const user = { TipoUsuario: request.user.TipoUsuario, idUsuario };
  try {
    const pool = await getPool();
    // Cursos activos (audiencia empresario/ambos) + progreso del usuario
    const cursosQ = await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('u', sql.BigInt, idUsuario)
      .query(`
        SELECT c.idCurso, c.Titulo, c.Descripcion, c.Categoria, c.Tipo, c.Obligatorio, c.FechaLimite,
               c.Portada, c.Visibilidad, c.Audiencia, c.DuracionMin, c.Puntos, c.Orden,
               CAST(CASE WHEN pr.Completado=1 THEN 1 ELSE 0 END AS BIT) AS Completado,
               pr.FechaCompletado,
               (SELECT COUNT(*) FROM VIDA_ACADEMIA_LECCIONES l
                  WHERE l.idBranch=c.idBranch AND l.idCuenta=c.idCuenta AND l.idCurso=c.idCurso AND l.Status='ACTIVO') AS TotalLecciones,
               (SELECT COUNT(*) FROM VIDA_ACADEMIA_LECCION_PROGRESO p
                  JOIN VIDA_ACADEMIA_LECCIONES l ON l.idBranch=p.idBranch AND l.idCuenta=p.idCuenta AND l.idLeccion=p.idLeccion AND l.Status='ACTIVO'
                  WHERE p.idBranch=c.idBranch AND p.idCuenta=c.idCuenta AND p.idCurso=c.idCurso AND p.idUsuario=@u AND p.Completado=1) AS LeccionesHechas
        FROM VIDA_ACADEMIA_CURSOS c
        LEFT JOIN VIDA_ACADEMIA_PROGRESO pr
          ON pr.idBranch=c.idBranch AND pr.idCuenta=c.idCuenta AND pr.idCurso=c.idCurso AND pr.idUsuario=@u
        WHERE c.idBranch=@b AND c.idCuenta=@c AND c.Status='ACTIVO'
          AND c.Audiencia IN ('EMPRESARIO','AMBOS')
        ORDER BY c.Obligatorio DESC, c.Orden, c.idCurso`);

    // Targeting de todos los cursos en dos queries (evita N+1)
    const [rolesQ, usrQ] = await Promise.all([
      pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
        .query(`SELECT idCurso, Rol FROM VIDA_ACADEMIA_CURSO_ROLES WHERE idBranch=@b AND idCuenta=@c`),
      pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
        .query(`SELECT idCurso, idUsuario FROM VIDA_ACADEMIA_CURSO_USUARIOS WHERE idBranch=@b AND idCuenta=@c`),
    ]);
    const rolesPorCurso = {}, usrPorCurso = {};
    for (const r of rolesQ.recordset) (rolesPorCurso[r.idCurso] ||= []).push(r.Rol);
    for (const r of usrQ.recordset) (usrPorCurso[r.idCurso] ||= []).push(Number(r.idUsuario));

    const ahora = new Date();
    const visibles = cursosQ.recordset
      .filter(c => puedeVerCurso(c, rolesPorCurso[c.idCurso], usrPorCurso[c.idCurso], user))
      .map(c => {
        // Progreso: si no hay lecciones (curso plano legacy) usa el flag Completado.
        const pct = c.TotalLecciones > 0
          ? porcentajeProgreso(c.TotalLecciones, c.LeccionesHechas)
          : (c.Completado ? 100 : 0);
        return {
          ...c,
          ProgresoPct: pct,
          FueraDeTiempo: estaFueraDeTiempo(c, ahora),
          DiasRestantes: diasRestantes(c.FechaLimite, ahora),
        };
      });

    const total = visibles.length;
    const completados = visibles.filter(c => c.Completado).length;
    const puntos = visibles.filter(c => c.Completado).reduce((a, c) => a + (c.Puntos || 0), 0);
    const obligatoriosPend = visibles.filter(c => c.Obligatorio && !c.Completado).length;
    const fueraDeTiempo = visibles.filter(c => c.FueraDeTiempo).length;

    return reply.send({
      cursos: visibles,
      resumen: { total, completados, puntos, obligatoriosPendientes: obligatoriosPend, fueraDeTiempo },
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener los cursos' });
  }
}

// GET /academia/cursos/:idCurso  — detalle navegable (módulos + lecciones + mi progreso)
export async function detalleCurso(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const user = { TipoUsuario: request.user.TipoUsuario, idUsuario };
  const { idCurso } = request.params;
  try {
    const pool = await getPool();
    const cQ = await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
      .query(`SELECT idCurso, Titulo, Descripcion, Categoria, Tipo, Obligatorio, FechaLimite, Portada, Visibilidad, Audiencia, DuracionMin, Puntos
              FROM VIDA_ACADEMIA_CURSOS WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur AND Status='ACTIVO'`);
    if (!cQ.recordset.length) return reply.code(404).send({ error: 'Curso no encontrado' });
    const curso = cQ.recordset[0];

    const tg = await targetingCurso(pool, idBranch, idCuenta, idCurso);
    if (!puedeVerCurso(curso, tg.roles, tg.usuarios, user)) {
      return reply.code(403).send({ error: 'No tienes acceso a este curso' });
    }

    const [modQ, lecQ, progQ] = await Promise.all([
      pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
        .query(`SELECT idModulo, Titulo, Descripcion, Orden FROM VIDA_ACADEMIA_MODULOS
                WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur AND Status='ACTIVO' ORDER BY Orden, idModulo`),
      pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
        .query(`SELECT idLeccion, idModulo, Titulo, Descripcion, TipoLeccion, VideoUrl, ArchivoUrl, Contenido, DuracionMin, QuizAprob, Orden
                FROM VIDA_ACADEMIA_LECCIONES
                WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur AND Status='ACTIVO' ORDER BY Orden, idLeccion`),
      pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('u', sql.BigInt, idUsuario).input('cur', sql.BigInt, idCurso)
        .query(`SELECT idLeccion, Completado, FechaInicio, FechaFin, SegundosTomados, QuizPuntaje
                FROM VIDA_ACADEMIA_LECCION_PROGRESO WHERE idBranch=@b AND idCuenta=@c AND idUsuario=@u AND idCurso=@cur`),
    ]);
    const progPorLec = {};
    for (const p of progQ.recordset) progPorLec[p.idLeccion] = p;

    const modulos = modQ.recordset.map(m => ({
      ...m,
      lecciones: lecQ.recordset
        .filter(l => l.idModulo === m.idModulo)
        .map(l => ({
          idLeccion: l.idLeccion, Titulo: l.Titulo, Descripcion: l.Descripcion,
          TipoLeccion: l.TipoLeccion, VideoUrl: l.VideoUrl, ArchivoUrl: l.ArchivoUrl,
          Contenido: l.Contenido, DuracionMin: l.DuracionMin, QuizAprob: l.QuizAprob, Orden: l.Orden,
          Completado: progPorLec[l.idLeccion]?.Completado === true || progPorLec[l.idLeccion]?.Completado === 1,
          QuizPuntaje: progPorLec[l.idLeccion]?.QuizPuntaje ?? null,
        })),
    }));

    const total = lecQ.recordset.length;
    const hechas = lecQ.recordset.filter(l => {
      const p = progPorLec[l.idLeccion];
      return p && (p.Completado === true || p.Completado === 1);
    }).length;

    return reply.send({
      curso: { ...curso, ProgresoPct: porcentajeProgreso(total, hechas), FueraDeTiempo: estaFueraDeTiempo({ ...curso, Completado: hechas >= total && total > 0 }), DiasRestantes: diasRestantes(curso.FechaLimite) },
      modulos,
      progreso: { total, completadas: hechas },
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener el curso' });
  }
}

// POST /academia/lecciones/:idLeccion/iniciar
export async function iniciarLeccion(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idLeccion } = request.params;
  try {
    const pool = await getPool();
    const l = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('l', sql.BigInt, idLeccion)
      .query(`SELECT idCurso FROM VIDA_ACADEMIA_LECCIONES WHERE idBranch=@b AND idCuenta=@c AND idLeccion=@l AND Status='ACTIVO'`);
    if (!l.recordset.length) return reply.code(404).send({ error: 'Lección no encontrada' });
    const idCurso = l.recordset[0].idCurso;
    await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('u', sql.BigInt, idUsuario)
      .input('l', sql.BigInt, idLeccion).input('cur', sql.BigInt, idCurso)
      .query(`MERGE VIDA_ACADEMIA_LECCION_PROGRESO AS t
              USING (SELECT @b AS idBranch,@c AS idCuenta,@u AS idUsuario,@l AS idLeccion) AS s
                ON (t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.idUsuario=s.idUsuario AND t.idLeccion=s.idLeccion)
              WHEN MATCHED AND t.FechaInicio IS NULL THEN UPDATE SET FechaInicio=GETDATE()
              WHEN NOT MATCHED THEN INSERT (idBranch,idCuenta,idUsuario,idLeccion,idCurso,Completado,FechaInicio)
                VALUES (@b,@c,@u,@l,@cur,0,GETDATE());`);
    return reply.send({ ok: true });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al iniciar la lección' });
  }
}

// POST /academia/lecciones/:idLeccion/completar   body: { segundos }
export async function completarLeccion(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const nombre = [request.user.Nombre, request.user.Apellidos].filter(Boolean).join(' ').trim();
  const { idLeccion } = request.params;
  const segundos = Math.max(0, parseInt(request.body?.segundos) || 0);
  try {
    const pool = await getPool();
    const l = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('l', sql.BigInt, idLeccion)
      .query(`SELECT idCurso, TipoLeccion FROM VIDA_ACADEMIA_LECCIONES WHERE idBranch=@b AND idCuenta=@c AND idLeccion=@l AND Status='ACTIVO'`);
    if (!l.recordset.length) return reply.code(404).send({ error: 'Lección no encontrada' });
    const idCurso = l.recordset[0].idCurso;

    await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('u', sql.BigInt, idUsuario)
      .input('l', sql.BigInt, idLeccion).input('cur', sql.BigInt, idCurso).input('seg', sql.Int, segundos)
      .query(`MERGE VIDA_ACADEMIA_LECCION_PROGRESO AS t
              USING (SELECT @b AS idBranch,@c AS idCuenta,@u AS idUsuario,@l AS idLeccion) AS s
                ON (t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.idUsuario=s.idUsuario AND t.idLeccion=s.idLeccion)
              WHEN MATCHED THEN UPDATE SET Completado=1, FechaFin=GETDATE(),
                FechaInicio=COALESCE(t.FechaInicio, GETDATE()),
                SegundosTomados=CASE WHEN @seg>0 THEN @seg ELSE t.SegundosTomados END
              WHEN NOT MATCHED THEN INSERT (idBranch,idCuenta,idUsuario,idLeccion,idCurso,Completado,FechaInicio,FechaFin,SegundosTomados)
                VALUES (@b,@c,@u,@l,@cur,1,GETDATE(),GETDATE(),@seg);`);

    const estado = await recomputarCurso(pool, idBranch, idCuenta, idUsuario, idCurso, nombre);
    return reply.send({ ok: true, curso: estado });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al completar la lección' });
  }
}

// POST /academia/lecciones/:idLeccion/quiz/responder   body: { respuestas: {idPregunta: idOpcion} }
export async function responderQuiz(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const nombre = [request.user.Nombre, request.user.Apellidos].filter(Boolean).join(' ').trim();
  const { idLeccion } = request.params;
  const respuestas = request.body?.respuestas || {};
  try {
    const pool = await getPool();
    const l = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('l', sql.BigInt, idLeccion)
      .query(`SELECT idCurso, QuizAprob, TipoLeccion FROM VIDA_ACADEMIA_LECCIONES WHERE idBranch=@b AND idCuenta=@c AND idLeccion=@l AND Status='ACTIVO'`);
    if (!l.recordset.length) return reply.code(404).send({ error: 'Lección no encontrada' });
    if (l.recordset[0].TipoLeccion !== 'QUIZ') return reply.code(400).send({ error: 'La lección no es un quiz' });
    const idCurso = l.recordset[0].idCurso, minAprob = l.recordset[0].QuizAprob;

    const pregQ = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('l', sql.BigInt, idLeccion)
      .query(`SELECT p.idPregunta,
                (SELECT TOP 1 o.idOpcion FROM VIDA_ACADEMIA_QUIZ_OPCIONES o
                   WHERE o.idBranch=p.idBranch AND o.idCuenta=p.idCuenta AND o.idPregunta=p.idPregunta AND o.EsCorrecta=1) AS opcionCorrecta
              FROM VIDA_ACADEMIA_QUIZ_PREGUNTAS p
              WHERE p.idBranch=@b AND p.idCuenta=@c AND p.idLeccion=@l ORDER BY p.Orden`);
    if (!pregQ.recordset.length) return reply.code(400).send({ error: 'El quiz no tiene preguntas' });

    const res = calificarQuiz(pregQ.recordset, respuestas, minAprob);

    // Guarda el puntaje; marca completado solo si aprobó.
    await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('u', sql.BigInt, idUsuario)
      .input('l', sql.BigInt, idLeccion).input('cur', sql.BigInt, idCurso)
      .input('pj', sql.Int, res.puntaje).input('done', sql.Bit, res.aprobado ? 1 : 0)
      .query(`MERGE VIDA_ACADEMIA_LECCION_PROGRESO AS t
              USING (SELECT @b AS idBranch,@c AS idCuenta,@u AS idUsuario,@l AS idLeccion) AS s
                ON (t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.idUsuario=s.idUsuario AND t.idLeccion=s.idLeccion)
              WHEN MATCHED THEN UPDATE SET QuizPuntaje=@pj,
                Completado=CASE WHEN @done=1 THEN 1 ELSE t.Completado END,
                FechaInicio=COALESCE(t.FechaInicio, GETDATE()),
                FechaFin=CASE WHEN @done=1 THEN GETDATE() ELSE t.FechaFin END
              WHEN NOT MATCHED THEN INSERT (idBranch,idCuenta,idUsuario,idLeccion,idCurso,Completado,QuizPuntaje,FechaInicio,FechaFin)
                VALUES (@b,@c,@u,@l,@cur,@done,@pj,GETDATE(),CASE WHEN @done=1 THEN GETDATE() ELSE NULL END);`);

    let estado = null;
    if (res.aprobado) estado = await recomputarCurso(pool, idBranch, idCuenta, idUsuario, idCurso, nombre);
    return reply.send({ ...res, curso: estado });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al calificar el quiz' });
  }
}

// POST /academia/cursos/:idCurso/completar  — compat v1: cursos planos (sin lecciones)
export async function completarCurso(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const nombre = [request.user.Nombre, request.user.Apellidos].filter(Boolean).join(' ').trim();
  const { idCurso } = request.params;
  try {
    const pool = await getPool();
    const c = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
      .query(`SELECT Titulo,
                (SELECT COUNT(*) FROM VIDA_ACADEMIA_LECCIONES l WHERE l.idBranch=@b AND l.idCuenta=@c AND l.idCurso=@cur AND l.Status='ACTIVO') AS TotalLec
              FROM VIDA_ACADEMIA_CURSOS WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur AND Status='ACTIVO'`);
    if (!c.recordset.length) return reply.code(404).send({ error: 'Curso no encontrado' });
    // Con lecciones, no se puede "completar" el curso a mano: hay que hacer las lecciones.
    if (c.recordset[0].TotalLec > 0) {
      const estado = await recomputarCurso(pool, idBranch, idCuenta, idUsuario, idCurso, nombre);
      if (!estado.completado) return reply.code(409).send({ error: 'Completa todas las lecciones primero', curso: estado });
      return reply.send({ ok: true, curso: estado });
    }
    // Curso plano legacy: marca completo directo + constancia.
    await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('u', sql.BigInt, idUsuario).input('cur', sql.BigInt, idCurso)
      .query(`MERGE VIDA_ACADEMIA_PROGRESO AS t
              USING (SELECT @b AS idBranch,@c AS idCuenta,@u AS idUsuario,@cur AS idCurso) AS s
                ON (t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.idUsuario=s.idUsuario AND t.idCurso=s.idCurso)
              WHEN MATCHED AND t.Completado=0 THEN UPDATE SET Completado=1, FechaCompletado=GETDATE()
              WHEN NOT MATCHED THEN INSERT (idBranch,idCuenta,idUsuario,idCurso,Completado,FechaCompletado)
                VALUES (@b,@c,@u,@cur,1,GETDATE());`);
    await emitirConstancia(pool, idBranch, idCuenta, idUsuario, idCurso, nombre);
    return reply.send({ ok: true, curso: { completado: true } });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al completar el curso' });
  }
}

// ── Comentarios ─────────────────────────────────────────────────────────────
// GET /academia/cursos/:idCurso/comentarios  (?idLeccion=)
export async function listarComentarios(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idCurso } = request.params;
  const { idLeccion } = request.query || {};
  try {
    const pool = await getPool();
    const req = pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso);
    let filtro = '';
    if (idLeccion) { req.input('lec', sql.BigInt, idLeccion); filtro = ' AND idLeccion=@lec'; }
    const r = await req.query(`SELECT idComentario, idCurso, idLeccion, idUsuario, Autor, Texto, FechaAlta
                               FROM VIDA_ACADEMIA_COMENTARIOS
                               WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur AND Status='ACTIVO'${filtro}
                               ORDER BY FechaAlta DESC`);
    return reply.send(r.recordset);
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al listar comentarios' }); }
}

// POST /academia/cursos/:idCurso/comentarios   body: { texto, idLeccion? }
export async function crearComentario(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const autor = [request.user.Nombre, request.user.Apellidos].filter(Boolean).join(' ').trim();
  const { idCurso } = request.params;
  const texto = (request.body?.texto || '').trim();
  const idLeccion = request.body?.idLeccion || null;
  if (!texto) return reply.code(400).send({ error: 'El comentario no puede estar vacío' });
  if (texto.length > 1000) return reply.code(400).send({ error: 'Comentario demasiado largo' });
  try {
    const pool = await getPool();
    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('idCurso', sql.BigInt, idCurso).input('idLeccion', sql.BigInt, idLeccion)
      .input('idUsuario', sql.BigInt, idUsuario).input('Autor', sql.VarChar(150), autor || `Usuario ${idUsuario}`)
      .input('Texto', sql.NVarChar(1000), texto);
    const id = await insertarConId(req, {
      tabla: 'VIDA_ACADEMIA_COMENTARIOS', idCol: 'idComentario',
      columnas: ['idCurso', 'idLeccion', 'idUsuario', 'Autor', 'Texto'],
      valores: ['@idCurso', '@idLeccion', '@idUsuario', '@Autor', '@Texto'],
    });
    return reply.code(201).send({ idComentario: id, Autor: autor, Texto: texto, idLeccion, FechaAlta: new Date().toISOString() });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al comentar' }); }
}

// DELETE /academia/comentarios/:idComentario  (propio, o admin de red modera)
export async function eliminarComentario(request, reply) {
  const { idBranch, idCuenta, idUsuario, TipoUsuario } = request.user;
  const { idComentario } = request.params;
  const esModerador = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO'].includes(TipoUsuario);
  try {
    const pool = await getPool();
    const req = pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('id', sql.BigInt, idComentario);
    let cond = '';
    if (!esModerador) { req.input('u', sql.BigInt, idUsuario); cond = ' AND idUsuario=@u'; }
    const r = await req.query(`UPDATE VIDA_ACADEMIA_COMENTARIOS SET Status='ELIMINADO'
                               WHERE idBranch=@b AND idCuenta=@c AND idComentario=@id AND Status='ACTIVO'${cond}`);
    if (r.rowsAffected[0] === 0) return reply.code(403).send({ error: 'No puedes eliminar este comentario' });
    return reply.send({ ok: true });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al eliminar comentario' }); }
}

// ── Diplomas / constancias ──────────────────────────────────────────────────
// GET /academia/diplomas  — mis constancias
export async function misDiplomas(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  try {
    const pool = await getPool();
    const r = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('u', sql.BigInt, idUsuario)
      .query(`SELECT idDiploma, Folio, idCurso, NombreUsuario, TituloCurso, FechaEmision
              FROM VIDA_ACADEMIA_DIPLOMAS WHERE idBranch=@b AND idCuenta=@c AND idUsuario=@u AND Status='ACTIVO'
              ORDER BY FechaEmision DESC`);
    return reply.send(r.recordset);
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al listar constancias' }); }
}

// GET /academia/constancia/:folio  — detalle imprimible + QR de verificación
export async function verConstancia(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { folio } = request.params;
  try {
    const pool = await getPool();
    const r = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('f', sql.VarChar(40), folio)
      .query(`SELECT idDiploma, Folio, idCurso, idUsuario, NombreUsuario, TituloCurso, FechaEmision, Status
              FROM VIDA_ACADEMIA_DIPLOMAS WHERE idBranch=@b AND idCuenta=@c AND Folio=@f`);
    if (!r.recordset.length) return reply.code(404).send({ error: 'Constancia no encontrada' });
    const d = r.recordset[0];
    let qrDataUrl = null;
    try { qrDataUrl = await QRCode.toDataURL(`VIDA-CONSTANCIA:${d.Folio}`, { margin: 1, width: 240 }); } catch { /* opcional */ }
    return reply.send({ ...d, qrDataUrl });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al obtener la constancia' }); }
}
