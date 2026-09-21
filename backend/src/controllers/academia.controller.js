// src/controllers/academia.controller.js
// Academia VIDA — LMS (estilo Udemy/Platzi). Handlers del ALUMNO, compartidos
// entre el PANEL (empresarios, VIDA_CUENTA_USUARIOS) y la APP (clientes,
// VIDA_APP_CLIENTES). El "actor" se deriva de request.user o request.cliente y
// se distingue en las tablas de progreso/constancias por la columna TipoActor
// (EMPRESARIO|CLIENTE) — ver sql/35. La lógica pura vive en academia.logic.js.
import QRCode from 'qrcode';
import { getPool, sql } from '../db/sqlserver.js';
import {
  puedeVerCurso, estaFueraDeTiempo, diasRestantes,
  porcentajeProgreso, cursoCompleto, calificarQuiz, generarFolio,
} from './academia.logic.js';

// ── Actor actual (empresario del panel o cliente de la app) ─────────────────
function getActor(request) {
  if (request.cliente) {
    const cl = request.cliente;
    return { idBranch: cl.idBranch, idCuenta: cl.idCuenta, actorTipo: 'CLIENTE', actorId: cl.idCliente, rol: 'CLIENTE' };
  }
  const u = request.user;
  return {
    idBranch: u.idBranch, idCuenta: u.idCuenta, actorTipo: 'EMPRESARIO', actorId: u.idUsuario,
    nombre: [u.Nombre, u.Apellidos].filter(Boolean).join(' ').trim() || `Usuario ${u.idUsuario}`,
    rol: u.TipoUsuario,
  };
}

// ── Inserta con id secuencial atómico (patrón inventario.controller.js) ─────
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

async function nextId(pool, tabla, campo, idBranch, idCuenta) {
  const r = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}),0)+1 AS next FROM ${tabla} WITH (UPDLOCK, HOLDLOCK) WHERE idBranch=@b AND idCuenta=@c`);
  return r.recordset[0].next;
}

// ── Targeting (roles + usuarios) de un curso — solo aplica a empresarios ────
async function targetingCurso(pool, idBranch, idCuenta, idCurso) {
  const [roles, usuarios] = await Promise.all([
    pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
      .query(`SELECT Rol FROM VIDA_ACADEMIA_CURSO_ROLES WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur`),
    pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
      .query(`SELECT idUsuario FROM VIDA_ACADEMIA_CURSO_USUARIOS WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur`),
  ]);
  return { roles: roles.recordset.map(r => r.Rol), usuarios: usuarios.recordset.map(r => Number(r.idUsuario)) };
}

// ── Acredita puntos VIDA al cliente al completar un curso (idempotente) ──────
// Solo para actores CLIENTE. El marcador en Descripcion evita re-acreditar.
async function acreditarPuntosCliente(pool, idBranch, idCuenta, idCliente, idCurso, puntos, titulo) {
  if (!puntos || puntos <= 0) return;
  const marcador = `ACADEMIA#${idCurso}`;
  const ya = await pool.request()
    .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cl', sql.BigInt, idCliente).input('m', sql.NVarChar(200), `%${marcador}%`)
    .query(`SELECT TOP 1 idMovimiento FROM VIDA_CLIENTE_PUNTOS
            WHERE idBranch=@b AND idCuenta=@c AND idCliente=@cl AND Tipo='GANADO' AND Descripcion LIKE @m`);
  if (ya.recordset.length) return; // ya acreditado
  const movId = await nextId(pool, 'VIDA_CLIENTE_PUNTOS', 'idMovimiento', idBranch, idCuenta);
  await pool.request()
    .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('mid', sql.BigInt, movId)
    .input('cl', sql.BigInt, idCliente).input('p', sql.Int, puntos)
    .input('d', sql.NVarChar(200), `Academia: ${titulo || 'curso'} (${marcador})`)
    .query(`INSERT INTO VIDA_CLIENTE_PUNTOS (idBranch,idCuenta,idMovimiento,idCliente,Tipo,Puntos,idPedido,Descripcion)
            VALUES (@b,@c,@mid,@cl,'GANADO',@p,NULL,@d)`);
  await pool.request()
    .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cl', sql.BigInt, idCliente).input('p', sql.Int, puntos)
    .query(`UPDATE VIDA_APP_CLIENTES SET PuntosSaldo=ISNULL(PuntosSaldo,0)+@p WHERE idBranch=@b AND idCuenta=@c AND idCliente=@cl`);
}

// ── Emite constancia (idempotente por actor+curso). Devuelve { idDiploma, nueva }
async function emitirConstancia(pool, actor, idCurso) {
  const { idBranch, idCuenta, actorTipo, actorId } = actor;
  const ya = await pool.request()
    .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('ta', sql.VarChar(20), actorTipo)
    .input('u', sql.BigInt, actorId).input('cur', sql.BigInt, idCurso)
    .query(`SELECT idDiploma FROM VIDA_ACADEMIA_DIPLOMAS WHERE idBranch=@b AND idCuenta=@c AND TipoActor=@ta AND idUsuario=@u AND idCurso=@cur`);
  if (ya.recordset.length) return { idDiploma: ya.recordset[0].idDiploma, nueva: false };

  const curso = await pool.request()
    .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
    .query(`SELECT Titulo FROM VIDA_ACADEMIA_CURSOS WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur`);
  const titulo = curso.recordset[0]?.Titulo || 'Curso';

  // Nombre del actor para el diploma
  let nombre = actor.nombre;
  if (actorTipo === 'CLIENTE') {
    const cl = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cl', sql.BigInt, actorId)
      .query(`SELECT Nombre, Apellidos FROM VIDA_APP_CLIENTES WHERE idBranch=@b AND idCuenta=@c AND idCliente=@cl`);
    nombre = [cl.recordset[0]?.Nombre, cl.recordset[0]?.Apellidos].filter(Boolean).join(' ').trim() || `Cliente ${actorId}`;
  }
  const folio = generarFolio(idCurso, actorId);

  try {
    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('Folio', sql.VarChar(40), folio).input('TipoActor', sql.VarChar(20), actorTipo)
      .input('idCurso', sql.BigInt, idCurso).input('idUsuario', sql.BigInt, actorId)
      .input('NombreUsuario', sql.VarChar(200), nombre).input('TituloCurso', sql.VarChar(200), titulo);
    const idDiploma = await insertarConId(req, {
      tabla: 'VIDA_ACADEMIA_DIPLOMAS', idCol: 'idDiploma',
      columnas: ['Folio', 'TipoActor', 'idCurso', 'idUsuario', 'NombreUsuario', 'TituloCurso'],
      valores: ['@Folio', '@TipoActor', '@idCurso', '@idUsuario', '@NombreUsuario', '@TituloCurso'],
    });
    return { idDiploma, nueva: true };
  } catch (e) {
    if (String(e.message || '').includes('UX_ACAD_DIPLOMA')) return { idDiploma: null, nueva: false };
    throw e;
  }
}

// ── Recomputa el curso para el actor a partir del progreso por lección.
// Si quedó completo: marca VIDA_ACADEMIA_PROGRESO, emite constancia y —solo para
// clientes— acredita puntos VIDA (una vez). Devuelve { completado, total, completadas }.
async function recomputarCurso(pool, actor, idCurso) {
  const { idBranch, idCuenta, actorTipo, actorId } = actor;
  const r = await pool.request()
    .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('ta', sql.VarChar(20), actorTipo)
    .input('u', sql.BigInt, actorId).input('cur', sql.BigInt, idCurso)
    .query(`
      SELECT
        (SELECT COUNT(*) FROM VIDA_ACADEMIA_LECCIONES
           WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur AND Status='ACTIVO') AS Total,
        (SELECT COUNT(*) FROM VIDA_ACADEMIA_LECCION_PROGRESO p
           JOIN VIDA_ACADEMIA_LECCIONES l ON l.idBranch=p.idBranch AND l.idCuenta=p.idCuenta AND l.idLeccion=p.idLeccion AND l.Status='ACTIVO'
           WHERE p.idBranch=@b AND p.idCuenta=@c AND p.TipoActor=@ta AND p.idUsuario=@u AND p.idCurso=@cur AND p.Completado=1) AS Hechas`);
  const total = r.recordset[0].Total, completadas = r.recordset[0].Hechas;
  const completo = cursoCompleto(total, completadas);

  if (completo) {
    await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('ta', sql.VarChar(20), actorTipo)
      .input('u', sql.BigInt, actorId).input('cur', sql.BigInt, idCurso)
      .query(`MERGE VIDA_ACADEMIA_PROGRESO AS t
              USING (SELECT @b AS idBranch,@c AS idCuenta,@ta AS TipoActor,@u AS idUsuario,@cur AS idCurso) AS s
                ON (t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.TipoActor=s.TipoActor AND t.idUsuario=s.idUsuario AND t.idCurso=s.idCurso)
              WHEN MATCHED AND t.Completado=0 THEN UPDATE SET Completado=1, FechaCompletado=GETDATE()
              WHEN NOT MATCHED THEN INSERT (idBranch,idCuenta,TipoActor,idUsuario,idCurso,Completado,FechaCompletado)
                VALUES (@b,@c,@ta,@u,@cur,1,GETDATE());`);
    const dip = await emitirConstancia(pool, actor, idCurso);
    if (actorTipo === 'CLIENTE' && dip.nueva) {
      const cur = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
        .query(`SELECT Titulo, Puntos FROM VIDA_ACADEMIA_CURSOS WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur`);
      await acreditarPuntosCliente(pool, idBranch, idCuenta, actorId, idCurso, cur.recordset[0]?.Puntos || 0, cur.recordset[0]?.Titulo);
    }
  }
  return { completado: completo, total, completadas };
}

// ════════════════════════════════════════════════════════════════════════════
// LISTADOS — "mis cursos"
// ════════════════════════════════════════════════════════════════════════════

// GET /academia/cursos  (EMPRESARIO) — filtra por audiencia + targeting rol/usuario
export async function listarCursos(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const user = { TipoUsuario: request.user.TipoUsuario, idUsuario };
  try {
    const pool = await getPool();
    const cursosQ = await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('u', sql.BigInt, idUsuario)
      .query(`
        SELECT c.idCurso, c.Titulo, c.Descripcion, c.Categoria, c.Tipo, c.Obligatorio, c.FechaLimite,
               c.Portada, c.Visibilidad, c.Audiencia, c.DuracionMin, c.Puntos, c.Orden,
               CAST(CASE WHEN pr.Completado=1 THEN 1 ELSE 0 END AS BIT) AS Completado, pr.FechaCompletado,
               (SELECT COUNT(*) FROM VIDA_ACADEMIA_LECCIONES l WHERE l.idBranch=c.idBranch AND l.idCuenta=c.idCuenta AND l.idCurso=c.idCurso AND l.Status='ACTIVO') AS TotalLecciones,
               (SELECT COUNT(*) FROM VIDA_ACADEMIA_LECCION_PROGRESO p
                  JOIN VIDA_ACADEMIA_LECCIONES l ON l.idBranch=p.idBranch AND l.idCuenta=p.idCuenta AND l.idLeccion=p.idLeccion AND l.Status='ACTIVO'
                  WHERE p.idBranch=c.idBranch AND p.idCuenta=c.idCuenta AND p.idCurso=c.idCurso AND p.TipoActor='EMPRESARIO' AND p.idUsuario=@u AND p.Completado=1) AS LeccionesHechas
        FROM VIDA_ACADEMIA_CURSOS c
        LEFT JOIN VIDA_ACADEMIA_PROGRESO pr
          ON pr.idBranch=c.idBranch AND pr.idCuenta=c.idCuenta AND pr.idCurso=c.idCurso AND pr.TipoActor='EMPRESARIO' AND pr.idUsuario=@u
        WHERE c.idBranch=@b AND c.idCuenta=@c AND c.Status='ACTIVO' AND c.Audiencia IN ('EMPRESARIO','AMBOS')
        ORDER BY c.Obligatorio DESC, c.Orden, c.idCurso`);

    const [rolesQ, usrQ] = await Promise.all([
      pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
        .query(`SELECT idCurso, Rol FROM VIDA_ACADEMIA_CURSO_ROLES WHERE idBranch=@b AND idCuenta=@c`),
      pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
        .query(`SELECT idCurso, idUsuario FROM VIDA_ACADEMIA_CURSO_USUARIOS WHERE idBranch=@b AND idCuenta=@c`),
    ]);
    const rolesPorCurso = {}, usrPorCurso = {};
    for (const r of rolesQ.recordset) (rolesPorCurso[r.idCurso] ||= []).push(r.Rol);
    for (const r of usrQ.recordset) (usrPorCurso[r.idCurso] ||= []).push(Number(r.idUsuario));

    return reply.send(armarRespuestaCursos(cursosQ.recordset, c => puedeVerCurso(c, rolesPorCurso[c.idCurso], usrPorCurso[c.idCurso], user)));
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener los cursos' });
  }
}

// GET /delivery/cliente/academia/cursos  (CLIENTE) — audiencia CLIENTE/AMBOS + Visibilidad TODOS
export async function listarCursosCliente(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  try {
    const pool = await getPool();
    const cursosQ = await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('u', sql.BigInt, idCliente)
      .query(`
        SELECT c.idCurso, c.Titulo, c.Descripcion, c.Categoria, c.Tipo, c.Obligatorio, c.FechaLimite,
               c.Portada, c.Visibilidad, c.Audiencia, c.DuracionMin, c.Puntos, c.Orden,
               CAST(CASE WHEN pr.Completado=1 THEN 1 ELSE 0 END AS BIT) AS Completado, pr.FechaCompletado,
               (SELECT COUNT(*) FROM VIDA_ACADEMIA_LECCIONES l WHERE l.idBranch=c.idBranch AND l.idCuenta=c.idCuenta AND l.idCurso=c.idCurso AND l.Status='ACTIVO') AS TotalLecciones,
               (SELECT COUNT(*) FROM VIDA_ACADEMIA_LECCION_PROGRESO p
                  JOIN VIDA_ACADEMIA_LECCIONES l ON l.idBranch=p.idBranch AND l.idCuenta=p.idCuenta AND l.idLeccion=p.idLeccion AND l.Status='ACTIVO'
                  WHERE p.idBranch=c.idBranch AND p.idCuenta=c.idCuenta AND p.idCurso=c.idCurso AND p.TipoActor='CLIENTE' AND p.idUsuario=@u AND p.Completado=1) AS LeccionesHechas
        FROM VIDA_ACADEMIA_CURSOS c
        LEFT JOIN VIDA_ACADEMIA_PROGRESO pr
          ON pr.idBranch=c.idBranch AND pr.idCuenta=c.idCuenta AND pr.idCurso=c.idCurso AND pr.TipoActor='CLIENTE' AND pr.idUsuario=@u
        WHERE c.idBranch=@b AND c.idCuenta=@c AND c.Status='ACTIVO' AND c.Audiencia IN ('CLIENTE','AMBOS') AND c.Visibilidad='TODOS'
        ORDER BY c.Orden, c.idCurso`);
    return reply.send(armarRespuestaCursos(cursosQ.recordset, () => true));
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener los cursos' });
  }
}

function armarRespuestaCursos(rows, visibleFn) {
  const ahora = new Date();
  const visibles = rows.filter(visibleFn).map(c => {
    const pct = c.TotalLecciones > 0 ? porcentajeProgreso(c.TotalLecciones, c.LeccionesHechas) : (c.Completado ? 100 : 0);
    return { ...c, ProgresoPct: pct, FueraDeTiempo: estaFueraDeTiempo(c, ahora), DiasRestantes: diasRestantes(c.FechaLimite, ahora) };
  });
  const completados = visibles.filter(c => c.Completado).length;
  return {
    cursos: visibles,
    resumen: {
      total: visibles.length, completados,
      puntos: visibles.filter(c => c.Completado).reduce((a, c) => a + (c.Puntos || 0), 0),
      obligatoriosPendientes: visibles.filter(c => c.Obligatorio && !c.Completado).length,
      fueraDeTiempo: visibles.filter(c => c.FueraDeTiempo).length,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// DETALLE + PROGRESO (compartido por actor)
// ════════════════════════════════════════════════════════════════════════════

// GET /academia/cursos/:idCurso  (y variante cliente)
export async function detalleCurso(request, reply) {
  const actor = getActor(request);
  const { idBranch, idCuenta, actorTipo, actorId } = actor;
  const { idCurso } = request.params;
  try {
    const pool = await getPool();
    const cQ = await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
      .query(`SELECT idCurso, Titulo, Descripcion, Categoria, Tipo, Obligatorio, FechaLimite, Portada, Visibilidad, Audiencia, DuracionMin, Puntos
              FROM VIDA_ACADEMIA_CURSOS WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur AND Status='ACTIVO'`);
    if (!cQ.recordset.length) return reply.code(404).send({ error: 'Curso no encontrado' });
    const curso = cQ.recordset[0];

    // Guard de audiencia + visibilidad según el actor
    if (actorTipo === 'CLIENTE') {
      if (!['CLIENTE', 'AMBOS'].includes(curso.Audiencia) || curso.Visibilidad !== 'TODOS') {
        return reply.code(403).send({ error: 'No tienes acceso a este curso' });
      }
    } else {
      if (!['EMPRESARIO', 'AMBOS'].includes(curso.Audiencia)) return reply.code(403).send({ error: 'No tienes acceso a este curso' });
      const tg = await targetingCurso(pool, idBranch, idCuenta, idCurso);
      if (!puedeVerCurso(curso, tg.roles, tg.usuarios, { TipoUsuario: actor.rol, idUsuario: actorId })) {
        return reply.code(403).send({ error: 'No tienes acceso a este curso' });
      }
    }

    const [modQ, lecQ, progQ, pregQ, opcQ] = await Promise.all([
      pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
        .query(`SELECT idModulo, Titulo, Descripcion, Orden FROM VIDA_ACADEMIA_MODULOS WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur AND Status='ACTIVO' ORDER BY Orden, idModulo`),
      pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
        .query(`SELECT idLeccion, idModulo, Titulo, Descripcion, TipoLeccion, VideoUrl, ArchivoUrl, Contenido, DuracionMin, QuizAprob, Orden
                FROM VIDA_ACADEMIA_LECCIONES WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur AND Status='ACTIVO' ORDER BY Orden, idLeccion`),
      pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('ta', sql.VarChar(20), actorTipo).input('u', sql.BigInt, actorId).input('cur', sql.BigInt, idCurso)
        .query(`SELECT idLeccion, Completado, FechaInicio, FechaFin, SegundosTomados, QuizPuntaje
                FROM VIDA_ACADEMIA_LECCION_PROGRESO WHERE idBranch=@b AND idCuenta=@c AND TipoActor=@ta AND idUsuario=@u AND idCurso=@cur`),
      pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
        .query(`SELECT p.idPregunta, p.idLeccion, p.Texto, p.Orden FROM VIDA_ACADEMIA_QUIZ_PREGUNTAS p
                JOIN VIDA_ACADEMIA_LECCIONES l ON l.idBranch=p.idBranch AND l.idCuenta=p.idCuenta AND l.idLeccion=p.idLeccion
                WHERE p.idBranch=@b AND p.idCuenta=@c AND l.idCurso=@cur ORDER BY p.Orden`),
      pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
        .query(`SELECT o.idOpcion, o.idPregunta, o.Texto, o.Orden FROM VIDA_ACADEMIA_QUIZ_OPCIONES o
                JOIN VIDA_ACADEMIA_QUIZ_PREGUNTAS p ON p.idBranch=o.idBranch AND p.idCuenta=o.idCuenta AND p.idPregunta=o.idPregunta
                JOIN VIDA_ACADEMIA_LECCIONES l ON l.idBranch=p.idBranch AND l.idCuenta=p.idCuenta AND l.idLeccion=p.idLeccion
                WHERE o.idBranch=@b AND o.idCuenta=@c AND l.idCurso=@cur ORDER BY o.Orden`),
    ]);
    const progPorLec = {};
    for (const p of progQ.recordset) progPorLec[p.idLeccion] = p;
    const preguntasPorLec = {};
    for (const p of pregQ.recordset) {
      (preguntasPorLec[p.idLeccion] ||= []).push({
        idPregunta: p.idPregunta, Texto: p.Texto,
        opciones: opcQ.recordset.filter(o => o.idPregunta === p.idPregunta).map(o => ({ idOpcion: o.idOpcion, Texto: o.Texto })),
      });
    }

    const modulos = modQ.recordset.map(m => ({
      ...m,
      lecciones: lecQ.recordset.filter(l => l.idModulo === m.idModulo).map(l => ({
        idLeccion: l.idLeccion, Titulo: l.Titulo, Descripcion: l.Descripcion,
        TipoLeccion: l.TipoLeccion, VideoUrl: l.VideoUrl, ArchivoUrl: l.ArchivoUrl,
        Contenido: l.Contenido, DuracionMin: l.DuracionMin, QuizAprob: l.QuizAprob, Orden: l.Orden,
        Completado: progPorLec[l.idLeccion]?.Completado === true || progPorLec[l.idLeccion]?.Completado === 1,
        QuizPuntaje: progPorLec[l.idLeccion]?.QuizPuntaje ?? null,
        quiz: l.TipoLeccion === 'QUIZ' ? (preguntasPorLec[l.idLeccion] || []) : undefined,
      })),
    }));

    const total = lecQ.recordset.length;
    const hechas = lecQ.recordset.filter(l => { const p = progPorLec[l.idLeccion]; return p && (p.Completado === true || p.Completado === 1); }).length;

    return reply.send({
      curso: { ...curso, ProgresoPct: porcentajeProgreso(total, hechas), FueraDeTiempo: estaFueraDeTiempo({ ...curso, Completado: hechas >= total && total > 0 }), DiasRestantes: diasRestantes(curso.FechaLimite) },
      modulos, progreso: { total, completadas: hechas },
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener el curso' });
  }
}

// POST /academia/lecciones/:idLeccion/iniciar
export async function iniciarLeccion(request, reply) {
  const { idBranch, idCuenta, actorTipo, actorId } = getActor(request);
  const { idLeccion } = request.params;
  try {
    const pool = await getPool();
    const l = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('l', sql.BigInt, idLeccion)
      .query(`SELECT idCurso FROM VIDA_ACADEMIA_LECCIONES WHERE idBranch=@b AND idCuenta=@c AND idLeccion=@l AND Status='ACTIVO'`);
    if (!l.recordset.length) return reply.code(404).send({ error: 'Lección no encontrada' });
    const idCurso = l.recordset[0].idCurso;
    await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('ta', sql.VarChar(20), actorTipo).input('u', sql.BigInt, actorId)
      .input('l', sql.BigInt, idLeccion).input('cur', sql.BigInt, idCurso)
      .query(`MERGE VIDA_ACADEMIA_LECCION_PROGRESO AS t
              USING (SELECT @b AS idBranch,@c AS idCuenta,@ta AS TipoActor,@u AS idUsuario,@l AS idLeccion) AS s
                ON (t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.TipoActor=s.TipoActor AND t.idUsuario=s.idUsuario AND t.idLeccion=s.idLeccion)
              WHEN MATCHED AND t.FechaInicio IS NULL THEN UPDATE SET FechaInicio=GETDATE()
              WHEN NOT MATCHED THEN INSERT (idBranch,idCuenta,TipoActor,idUsuario,idLeccion,idCurso,Completado,FechaInicio)
                VALUES (@b,@c,@ta,@u,@l,@cur,0,GETDATE());`);
    return reply.send({ ok: true });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al iniciar la lección' }); }
}

// POST /academia/lecciones/:idLeccion/completar   body: { segundos }
export async function completarLeccion(request, reply) {
  const actor = getActor(request);
  const { idBranch, idCuenta, actorTipo, actorId } = actor;
  const { idLeccion } = request.params;
  const segundos = Math.max(0, parseInt(request.body?.segundos) || 0);
  try {
    const pool = await getPool();
    const l = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('l', sql.BigInt, idLeccion)
      .query(`SELECT idCurso FROM VIDA_ACADEMIA_LECCIONES WHERE idBranch=@b AND idCuenta=@c AND idLeccion=@l AND Status='ACTIVO'`);
    if (!l.recordset.length) return reply.code(404).send({ error: 'Lección no encontrada' });
    const idCurso = l.recordset[0].idCurso;

    await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('ta', sql.VarChar(20), actorTipo).input('u', sql.BigInt, actorId)
      .input('l', sql.BigInt, idLeccion).input('cur', sql.BigInt, idCurso).input('seg', sql.Int, segundos)
      .query(`MERGE VIDA_ACADEMIA_LECCION_PROGRESO AS t
              USING (SELECT @b AS idBranch,@c AS idCuenta,@ta AS TipoActor,@u AS idUsuario,@l AS idLeccion) AS s
                ON (t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.TipoActor=s.TipoActor AND t.idUsuario=s.idUsuario AND t.idLeccion=s.idLeccion)
              WHEN MATCHED THEN UPDATE SET Completado=1, FechaFin=GETDATE(), FechaInicio=COALESCE(t.FechaInicio, GETDATE()),
                SegundosTomados=CASE WHEN @seg>0 THEN @seg ELSE t.SegundosTomados END
              WHEN NOT MATCHED THEN INSERT (idBranch,idCuenta,TipoActor,idUsuario,idLeccion,idCurso,Completado,FechaInicio,FechaFin,SegundosTomados)
                VALUES (@b,@c,@ta,@u,@l,@cur,1,GETDATE(),GETDATE(),@seg);`);

    const estado = await recomputarCurso(pool, actor, idCurso);
    return reply.send({ ok: true, curso: estado });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al completar la lección' }); }
}

// POST /academia/lecciones/:idLeccion/quiz/responder   body: { respuestas }
export async function responderQuiz(request, reply) {
  const actor = getActor(request);
  const { idBranch, idCuenta, actorTipo, actorId } = actor;
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
              FROM VIDA_ACADEMIA_QUIZ_PREGUNTAS p WHERE p.idBranch=@b AND p.idCuenta=@c AND p.idLeccion=@l ORDER BY p.Orden`);
    if (!pregQ.recordset.length) return reply.code(400).send({ error: 'El quiz no tiene preguntas' });

    const res = calificarQuiz(pregQ.recordset, respuestas, minAprob);

    await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('ta', sql.VarChar(20), actorTipo).input('u', sql.BigInt, actorId)
      .input('l', sql.BigInt, idLeccion).input('cur', sql.BigInt, idCurso).input('pj', sql.Int, res.puntaje).input('done', sql.Bit, res.aprobado ? 1 : 0)
      .query(`MERGE VIDA_ACADEMIA_LECCION_PROGRESO AS t
              USING (SELECT @b AS idBranch,@c AS idCuenta,@ta AS TipoActor,@u AS idUsuario,@l AS idLeccion) AS s
                ON (t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.TipoActor=s.TipoActor AND t.idUsuario=s.idUsuario AND t.idLeccion=s.idLeccion)
              WHEN MATCHED THEN UPDATE SET QuizPuntaje=@pj, Completado=CASE WHEN @done=1 THEN 1 ELSE t.Completado END,
                FechaInicio=COALESCE(t.FechaInicio, GETDATE()), FechaFin=CASE WHEN @done=1 THEN GETDATE() ELSE t.FechaFin END
              WHEN NOT MATCHED THEN INSERT (idBranch,idCuenta,TipoActor,idUsuario,idLeccion,idCurso,Completado,QuizPuntaje,FechaInicio,FechaFin)
                VALUES (@b,@c,@ta,@u,@l,@cur,@done,@pj,GETDATE(),CASE WHEN @done=1 THEN GETDATE() ELSE NULL END);`);

    let estado = null;
    if (res.aprobado) estado = await recomputarCurso(pool, actor, idCurso);
    return reply.send({ ...res, curso: estado });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al calificar el quiz' }); }
}

// POST /academia/cursos/:idCurso/completar  — compat v1 (cursos planos sin lecciones)
export async function completarCurso(request, reply) {
  const actor = getActor(request);
  const { idBranch, idCuenta, actorTipo, actorId } = actor;
  const { idCurso } = request.params;
  try {
    const pool = await getPool();
    const c = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
      .query(`SELECT Titulo, Puntos,
                (SELECT COUNT(*) FROM VIDA_ACADEMIA_LECCIONES l WHERE l.idBranch=@b AND l.idCuenta=@c AND l.idCurso=@cur AND l.Status='ACTIVO') AS TotalLec
              FROM VIDA_ACADEMIA_CURSOS WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur AND Status='ACTIVO'`);
    if (!c.recordset.length) return reply.code(404).send({ error: 'Curso no encontrado' });
    if (c.recordset[0].TotalLec > 0) {
      const estado = await recomputarCurso(pool, actor, idCurso);
      if (!estado.completado) return reply.code(409).send({ error: 'Completa todas las lecciones primero', curso: estado });
      return reply.send({ ok: true, curso: estado });
    }
    await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('ta', sql.VarChar(20), actorTipo).input('u', sql.BigInt, actorId).input('cur', sql.BigInt, idCurso)
      .query(`MERGE VIDA_ACADEMIA_PROGRESO AS t
              USING (SELECT @b AS idBranch,@c AS idCuenta,@ta AS TipoActor,@u AS idUsuario,@cur AS idCurso) AS s
                ON (t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.TipoActor=s.TipoActor AND t.idUsuario=s.idUsuario AND t.idCurso=s.idCurso)
              WHEN MATCHED AND t.Completado=0 THEN UPDATE SET Completado=1, FechaCompletado=GETDATE()
              WHEN NOT MATCHED THEN INSERT (idBranch,idCuenta,TipoActor,idUsuario,idCurso,Completado,FechaCompletado)
                VALUES (@b,@c,@ta,@u,@cur,1,GETDATE());`);
    const dip = await emitirConstancia(pool, actor, idCurso);
    if (actorTipo === 'CLIENTE' && dip.nueva) await acreditarPuntosCliente(pool, idBranch, idCuenta, actorId, idCurso, c.recordset[0].Puntos || 0, c.recordset[0].Titulo);
    return reply.send({ ok: true, curso: { completado: true } });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al completar el curso' }); }
}

// ── Comentarios ─────────────────────────────────────────────────────────────
export async function listarComentarios(request, reply) {
  const { idBranch, idCuenta } = getActor(request);
  const { idCurso } = request.params;
  const { idLeccion } = request.query || {};
  try {
    const pool = await getPool();
    const req = pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso);
    let filtro = '';
    if (idLeccion) { req.input('lec', sql.BigInt, idLeccion); filtro = ' AND idLeccion=@lec'; }
    const r = await req.query(`SELECT idComentario, idCurso, idLeccion, idUsuario, TipoActor, Autor, Texto, FechaAlta
                               FROM VIDA_ACADEMIA_COMENTARIOS
                               WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur AND Status='ACTIVO'${filtro}
                               ORDER BY FechaAlta DESC`);
    return reply.send(r.recordset);
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al listar comentarios' }); }
}

export async function crearComentario(request, reply) {
  const actor = getActor(request);
  const { idBranch, idCuenta, actorTipo, actorId } = actor;
  const { idCurso } = request.params;
  const texto = (request.body?.texto || '').trim();
  const idLeccion = request.body?.idLeccion || null;
  if (!texto) return reply.code(400).send({ error: 'El comentario no puede estar vacío' });
  if (texto.length > 1000) return reply.code(400).send({ error: 'Comentario demasiado largo' });
  try {
    const pool = await getPool();
    // Nombre del autor
    let autor = actor.nombre;
    if (actorTipo === 'CLIENTE') {
      const cl = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cl', sql.BigInt, actorId)
        .query(`SELECT Nombre, Apellidos FROM VIDA_APP_CLIENTES WHERE idBranch=@b AND idCuenta=@c AND idCliente=@cl`);
      autor = [cl.recordset[0]?.Nombre, cl.recordset[0]?.Apellidos].filter(Boolean).join(' ').trim() || `Cliente ${actorId}`;
    }
    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('idCurso', sql.BigInt, idCurso).input('idLeccion', sql.BigInt, idLeccion)
      .input('idUsuario', sql.BigInt, actorId).input('TipoActor', sql.VarChar(20), actorTipo)
      .input('Autor', sql.VarChar(150), autor).input('Texto', sql.NVarChar(1000), texto);
    const id = await insertarConId(req, {
      tabla: 'VIDA_ACADEMIA_COMENTARIOS', idCol: 'idComentario',
      columnas: ['idCurso', 'idLeccion', 'idUsuario', 'TipoActor', 'Autor', 'Texto'],
      valores: ['@idCurso', '@idLeccion', '@idUsuario', '@TipoActor', '@Autor', '@Texto'],
    });
    return reply.code(201).send({ idComentario: id, idUsuario: actorId, TipoActor: actorTipo, Autor: autor, Texto: texto, idLeccion, FechaAlta: new Date().toISOString() });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al comentar' }); }
}

export async function eliminarComentario(request, reply) {
  const { idBranch, idCuenta, actorTipo, actorId, rol } = getActor(request);
  const { idComentario } = request.params;
  const esModerador = actorTipo === 'EMPRESARIO' && ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO'].includes(rol);
  try {
    const pool = await getPool();
    const req = pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('id', sql.BigInt, idComentario);
    let cond = '';
    if (!esModerador) { req.input('ta', sql.VarChar(20), actorTipo).input('u', sql.BigInt, actorId); cond = ' AND TipoActor=@ta AND idUsuario=@u'; }
    const r = await req.query(`UPDATE VIDA_ACADEMIA_COMENTARIOS SET Status='ELIMINADO'
                               WHERE idBranch=@b AND idCuenta=@c AND idComentario=@id AND Status='ACTIVO'${cond}`);
    if (r.rowsAffected[0] === 0) return reply.code(403).send({ error: 'No puedes eliminar este comentario' });
    return reply.send({ ok: true });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al eliminar comentario' }); }
}

// ── Diplomas / constancias ──────────────────────────────────────────────────
export async function misDiplomas(request, reply) {
  const { idBranch, idCuenta, actorTipo, actorId } = getActor(request);
  try {
    const pool = await getPool();
    const r = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('ta', sql.VarChar(20), actorTipo).input('u', sql.BigInt, actorId)
      .query(`SELECT idDiploma, Folio, idCurso, NombreUsuario, TituloCurso, FechaEmision
              FROM VIDA_ACADEMIA_DIPLOMAS WHERE idBranch=@b AND idCuenta=@c AND TipoActor=@ta AND idUsuario=@u AND Status='ACTIVO'
              ORDER BY FechaEmision DESC`);
    return reply.send(r.recordset);
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al listar constancias' }); }
}

// GET /academia/constancia/:folio  — imprimible + QR (folio único por cuenta)
export async function verConstancia(request, reply) {
  const { idBranch, idCuenta } = getActor(request);
  const { folio } = request.params;
  try {
    const pool = await getPool();
    const r = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('f', sql.VarChar(40), folio)
      .query(`SELECT idDiploma, Folio, idCurso, idUsuario, TipoActor, NombreUsuario, TituloCurso, FechaEmision, Status
              FROM VIDA_ACADEMIA_DIPLOMAS WHERE idBranch=@b AND idCuenta=@c AND Folio=@f`);
    if (!r.recordset.length) return reply.code(404).send({ error: 'Constancia no encontrada' });
    const d = r.recordset[0];
    let qrDataUrl = null;
    try { qrDataUrl = await QRCode.toDataURL(`VIDA-CONSTANCIA:${d.Folio}`, { margin: 1, width: 240 }); } catch { /* opcional */ }
    return reply.send({ ...d, qrDataUrl });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al obtener la constancia' }); }
}
