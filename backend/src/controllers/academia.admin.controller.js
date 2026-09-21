// src/controllers/academia.admin.controller.js
// Academia VIDA — LMS: endpoints de AUTORÍA (corporativo). CRUD de curso →
// módulos → lecciones, quiz, targeting (visibilidad por rol/usuario), subida de
// video (multipart), y analítica administrativa. Roles de red.
import path from 'path';
import fs from 'fs';
import { getPool, sql } from '../db/sqlserver.js';
import { estaFueraDeTiempo } from './academia.logic.js';

const TIPOS_CURSO   = ['CAPACITACION', 'NORMAS', 'GUBERNAMENTAL'];
const VISIBILIDADES = ['TODOS', 'ROLES', 'USUARIOS', 'MIXTO'];
const AUDIENCIAS    = ['EMPRESARIO', 'CLIENTE', 'AMBOS'];
const TIPOS_LECCION = ['VIDEO', 'TEXTO', 'PDF', 'QUIZ'];
const ROLES_VALIDOS = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN', 'SUPERVISOR', 'CAJERO'];

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

// ════════════════════════════════════════════════════════════════════════════
// CURSOS
// ════════════════════════════════════════════════════════════════════════════

// GET /academia/admin/cursos  — lista con conteos
export async function listarCursosAdmin(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();
    const r = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
      .query(`SELECT c.idCurso, c.Titulo, c.Descripcion, c.Categoria, c.Tipo, c.Obligatorio, c.FechaLimite,
                     c.Portada, c.Visibilidad, c.Audiencia, c.VideoUrl, c.DuracionMin, c.Puntos, c.Orden, c.Status,
                     (SELECT COUNT(*) FROM VIDA_ACADEMIA_MODULOS m WHERE m.idBranch=c.idBranch AND m.idCuenta=c.idCuenta AND m.idCurso=c.idCurso AND m.Status='ACTIVO') AS Modulos,
                     (SELECT COUNT(*) FROM VIDA_ACADEMIA_LECCIONES l WHERE l.idBranch=c.idBranch AND l.idCuenta=c.idCuenta AND l.idCurso=c.idCurso AND l.Status='ACTIVO') AS Lecciones,
                     (SELECT COUNT(*) FROM VIDA_ACADEMIA_PROGRESO p WHERE p.idBranch=c.idBranch AND p.idCuenta=c.idCuenta AND p.idCurso=c.idCurso AND p.Completado=1) AS Completaron
              FROM VIDA_ACADEMIA_CURSOS c
              WHERE c.idBranch=@b AND c.idCuenta=@c AND c.Status<>'ELIMINADO'
              ORDER BY c.Orden, c.idCurso`);
    return reply.send(r.recordset);
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al listar cursos' }); }
}

// GET /academia/admin/cursos/:idCurso — detalle completo (módulos+lecciones+quiz+targeting)
export async function detalleCursoAdmin(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idCurso } = request.params;
  try {
    const pool = await getPool();
    const cQ = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
      .query(`SELECT * FROM VIDA_ACADEMIA_CURSOS WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur`);
    if (!cQ.recordset.length) return reply.code(404).send({ error: 'Curso no encontrado' });

    const [modQ, lecQ, pregQ, opcQ, rolesQ, usrQ] = await Promise.all([
      pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
        .query(`SELECT idModulo, Titulo, Descripcion, Orden FROM VIDA_ACADEMIA_MODULOS WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur AND Status='ACTIVO' ORDER BY Orden, idModulo`),
      pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
        .query(`SELECT idLeccion, idModulo, Titulo, Descripcion, TipoLeccion, VideoUrl, ArchivoUrl, Contenido, DuracionMin, QuizAprob, Orden FROM VIDA_ACADEMIA_LECCIONES WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur AND Status='ACTIVO' ORDER BY Orden, idLeccion`),
      pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
        .query(`SELECT p.idPregunta, p.idLeccion, p.Texto, p.TipoPregunta, p.Orden FROM VIDA_ACADEMIA_QUIZ_PREGUNTAS p
                JOIN VIDA_ACADEMIA_LECCIONES l ON l.idBranch=p.idBranch AND l.idCuenta=p.idCuenta AND l.idLeccion=p.idLeccion
                WHERE p.idBranch=@b AND p.idCuenta=@c AND l.idCurso=@cur ORDER BY p.Orden`),
      pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
        .query(`SELECT o.idOpcion, o.idPregunta, o.Texto, o.EsCorrecta, o.Orden FROM VIDA_ACADEMIA_QUIZ_OPCIONES o
                JOIN VIDA_ACADEMIA_QUIZ_PREGUNTAS p ON p.idBranch=o.idBranch AND p.idCuenta=o.idCuenta AND p.idPregunta=o.idPregunta
                JOIN VIDA_ACADEMIA_LECCIONES l ON l.idBranch=p.idBranch AND l.idCuenta=p.idCuenta AND l.idLeccion=p.idLeccion
                WHERE o.idBranch=@b AND o.idCuenta=@c AND l.idCurso=@cur ORDER BY o.Orden`),
      pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
        .query(`SELECT Rol FROM VIDA_ACADEMIA_CURSO_ROLES WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur`),
      pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
        .query(`SELECT idUsuario FROM VIDA_ACADEMIA_CURSO_USUARIOS WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur`),
    ]);

    const preguntas = pregQ.recordset.map(p => ({
      ...p, opciones: opcQ.recordset.filter(o => o.idPregunta === p.idPregunta),
    }));
    const lecciones = lecQ.recordset.map(l => ({
      ...l, quiz: preguntas.filter(p => p.idLeccion === l.idLeccion),
    }));
    const modulos = modQ.recordset.map(m => ({
      ...m, lecciones: lecciones.filter(l => l.idModulo === m.idModulo),
    }));

    return reply.send({
      curso: cQ.recordset[0],
      modulos,
      targeting: { roles: rolesQ.recordset.map(r => r.Rol), usuarios: usrQ.recordset.map(u => Number(u.idUsuario)) },
    });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al obtener el curso' }); }
}

// POST /academia/admin/cursos
export async function crearCurso(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const b = request.body || {};
  if (!b.Titulo?.trim()) return reply.code(400).send({ error: 'El título es obligatorio' });
  const tipo = TIPOS_CURSO.includes(b.Tipo) ? b.Tipo : 'CAPACITACION';
  const vis  = VISIBILIDADES.includes(b.Visibilidad) ? b.Visibilidad : 'TODOS';
  const aud  = AUDIENCIAS.includes(b.Audiencia) ? b.Audiencia : 'EMPRESARIO';
  try {
    const pool = await getPool();
    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('Titulo', sql.VarChar(150), b.Titulo.trim())
      .input('Descripcion', sql.VarChar(600), b.Descripcion || null)
      .input('Categoria', sql.VarChar(60), b.Categoria || null)
      .input('Tipo', sql.VarChar(30), tipo)
      .input('Obligatorio', sql.Bit, b.Obligatorio ? 1 : 0)
      .input('FechaLimite', sql.Date, b.FechaLimite || null)
      .input('Portada', sql.VarChar(400), b.Portada || null)
      .input('Visibilidad', sql.VarChar(20), vis)
      .input('Audiencia', sql.VarChar(20), aud)
      .input('VideoUrl', sql.VarChar(500), b.VideoUrl || null)
      .input('DuracionMin', sql.Int, parseInt(b.DuracionMin) || 0)
      .input('Puntos', sql.Int, parseInt(b.Puntos) || 0)
      .input('Orden', sql.Int, parseInt(b.Orden) || 0)
      .input('UsuAlta', sql.VarChar(30), String(idUsuario));
    const id = await insertarConId(req, {
      tabla: 'VIDA_ACADEMIA_CURSOS', idCol: 'idCurso',
      columnas: ['Titulo', 'Descripcion', 'Categoria', 'Tipo', 'Obligatorio', 'FechaLimite', 'Portada', 'Visibilidad', 'Audiencia', 'VideoUrl', 'DuracionMin', 'Puntos', 'Orden', 'Status', 'UsuAlta'],
      valores: ['@Titulo', '@Descripcion', '@Categoria', '@Tipo', '@Obligatorio', '@FechaLimite', '@Portada', '@Visibilidad', '@Audiencia', '@VideoUrl', '@DuracionMin', '@Puntos', '@Orden', `'ACTIVO'`, '@UsuAlta'],
    });
    return reply.code(201).send({ idCurso: id });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al crear curso' }); }
}

// PUT /academia/admin/cursos/:idCurso
export async function editarCurso(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idCurso } = request.params;
  const b = request.body || {};
  const tipo = TIPOS_CURSO.includes(b.Tipo) ? b.Tipo : 'CAPACITACION';
  const vis  = VISIBILIDADES.includes(b.Visibilidad) ? b.Visibilidad : 'TODOS';
  const aud  = AUDIENCIAS.includes(b.Audiencia) ? b.Audiencia : 'EMPRESARIO';
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
      .input('Titulo', sql.VarChar(150), b.Titulo?.trim() || null).input('Descripcion', sql.VarChar(600), b.Descripcion || null)
      .input('Categoria', sql.VarChar(60), b.Categoria || null).input('Tipo', sql.VarChar(30), tipo)
      .input('Obligatorio', sql.Bit, b.Obligatorio ? 1 : 0).input('FechaLimite', sql.Date, b.FechaLimite || null)
      .input('Portada', sql.VarChar(400), b.Portada || null).input('Visibilidad', sql.VarChar(20), vis)
      .input('Audiencia', sql.VarChar(20), aud).input('VideoUrl', sql.VarChar(500), b.VideoUrl || null)
      .input('DuracionMin', sql.Int, parseInt(b.DuracionMin) || 0).input('Puntos', sql.Int, parseInt(b.Puntos) || 0)
      .input('Orden', sql.Int, parseInt(b.Orden) || 0).input('Status', sql.VarChar(20), b.Status || 'ACTIVO')
      .query(`UPDATE VIDA_ACADEMIA_CURSOS SET Titulo=@Titulo, Descripcion=@Descripcion, Categoria=@Categoria, Tipo=@Tipo,
                Obligatorio=@Obligatorio, FechaLimite=@FechaLimite, Portada=@Portada, Visibilidad=@Visibilidad,
                Audiencia=@Audiencia, VideoUrl=@VideoUrl, DuracionMin=@DuracionMin, Puntos=@Puntos, Orden=@Orden, Status=@Status
              WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur`);
    if (r.rowsAffected[0] === 0) return reply.code(404).send({ error: 'Curso no encontrado' });
    return reply.send({ ok: true });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al editar curso' }); }
}

// DELETE /academia/admin/cursos/:idCurso  (soft)
export async function eliminarCurso(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idCurso } = request.params;
  try {
    const pool = await getPool();
    await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
      .query(`UPDATE VIDA_ACADEMIA_CURSOS SET Status='INACTIVO' WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur`);
    return reply.send({ ok: true });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al eliminar curso' }); }
}

// ── Targeting / visibilidad ─────────────────────────────────────────────────
// PUT /academia/admin/cursos/:idCurso/visibilidad   body: { Visibilidad, roles:[], usuarios:[] }
export async function guardarVisibilidad(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idCurso } = request.params;
  const b = request.body || {};
  const vis = VISIBILIDADES.includes(b.Visibilidad) ? b.Visibilidad : 'TODOS';
  const roles = Array.isArray(b.roles) ? [...new Set(b.roles.filter(r => ROLES_VALIDOS.includes(r)))] : [];
  const usuarios = Array.isArray(b.usuarios) ? [...new Set(b.usuarios.map(Number).filter(n => Number.isFinite(n)))] : [];
  try {
    const pool = await getPool();
    const tx = pool.transaction();
    await tx.begin();
    try {
      await tx.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso).input('vis', sql.VarChar(20), vis)
        .query(`UPDATE VIDA_ACADEMIA_CURSOS SET Visibilidad=@vis WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur`);
      await tx.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
        .query(`DELETE FROM VIDA_ACADEMIA_CURSO_ROLES WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur`);
      await tx.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
        .query(`DELETE FROM VIDA_ACADEMIA_CURSO_USUARIOS WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur`);
      for (const rol of roles) {
        await tx.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso).input('rol', sql.VarChar(30), rol)
          .query(`INSERT INTO VIDA_ACADEMIA_CURSO_ROLES (idBranch,idCuenta,idCurso,Rol) VALUES (@b,@c,@cur,@rol)`);
      }
      for (const u of usuarios) {
        await tx.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso).input('u', sql.BigInt, u)
          .query(`INSERT INTO VIDA_ACADEMIA_CURSO_USUARIOS (idBranch,idCuenta,idCurso,idUsuario) VALUES (@b,@c,@cur,@u)`);
      }
      await tx.commit();
    } catch (e) { await tx.rollback(); throw e; }
    return reply.send({ ok: true, Visibilidad: vis, roles, usuarios });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al guardar visibilidad' }); }
}

// GET /academia/admin/usuarios  — lista para el selector de asignación
export async function usuariosAsignables(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();
    const r = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
      .query(`SELECT idUsuario, Nombre, Apellidos, TipoUsuario, Correo
              FROM VIDA_CUENTA_USUARIOS WHERE idBranch=@b AND idCuenta=@c AND Status='ACTIVO'
              ORDER BY Nombre, Apellidos`);
    return reply.send(r.recordset);
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al listar usuarios' }); }
}

// ════════════════════════════════════════════════════════════════════════════
// MÓDULOS
// ════════════════════════════════════════════════════════════════════════════
// POST /academia/admin/cursos/:idCurso/modulos
export async function crearModulo(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idCurso } = request.params;
  const b = request.body || {};
  if (!b.Titulo?.trim()) return reply.code(400).send({ error: 'El título del módulo es obligatorio' });
  try {
    const pool = await getPool();
    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('idCurso', sql.BigInt, idCurso).input('Titulo', sql.VarChar(150), b.Titulo.trim())
      .input('Descripcion', sql.VarChar(600), b.Descripcion || null).input('Orden', sql.Int, parseInt(b.Orden) || 0);
    const id = await insertarConId(req, {
      tabla: 'VIDA_ACADEMIA_MODULOS', idCol: 'idModulo',
      columnas: ['idCurso', 'Titulo', 'Descripcion', 'Orden', 'Status'],
      valores: ['@idCurso', '@Titulo', '@Descripcion', '@Orden', `'ACTIVO'`],
    });
    return reply.code(201).send({ idModulo: id });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al crear módulo' }); }
}
// PUT /academia/admin/modulos/:idModulo
export async function editarModulo(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idModulo } = request.params;
  const b = request.body || {};
  try {
    const pool = await getPool();
    await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('m', sql.BigInt, idModulo)
      .input('Titulo', sql.VarChar(150), b.Titulo?.trim() || null).input('Descripcion', sql.VarChar(600), b.Descripcion || null).input('Orden', sql.Int, parseInt(b.Orden) || 0)
      .query(`UPDATE VIDA_ACADEMIA_MODULOS SET Titulo=@Titulo, Descripcion=@Descripcion, Orden=@Orden WHERE idBranch=@b AND idCuenta=@c AND idModulo=@m`);
    return reply.send({ ok: true });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al editar módulo' }); }
}
// DELETE /academia/admin/modulos/:idModulo  (soft + sus lecciones)
export async function eliminarModulo(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idModulo } = request.params;
  try {
    const pool = await getPool();
    await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('m', sql.BigInt, idModulo)
      .query(`UPDATE VIDA_ACADEMIA_MODULOS SET Status='INACTIVO' WHERE idBranch=@b AND idCuenta=@c AND idModulo=@m;
              UPDATE VIDA_ACADEMIA_LECCIONES SET Status='INACTIVO' WHERE idBranch=@b AND idCuenta=@c AND idModulo=@m;`);
    return reply.send({ ok: true });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al eliminar módulo' }); }
}

// ════════════════════════════════════════════════════════════════════════════
// LECCIONES
// ════════════════════════════════════════════════════════════════════════════
// POST /academia/admin/modulos/:idModulo/lecciones
export async function crearLeccion(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idModulo } = request.params;
  const b = request.body || {};
  if (!b.Titulo?.trim()) return reply.code(400).send({ error: 'El título de la lección es obligatorio' });
  const tipo = TIPOS_LECCION.includes(b.TipoLeccion) ? b.TipoLeccion : 'VIDEO';
  try {
    const pool = await getPool();
    // Deriva idCurso del módulo
    const m = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('m', sql.BigInt, idModulo)
      .query(`SELECT idCurso FROM VIDA_ACADEMIA_MODULOS WHERE idBranch=@b AND idCuenta=@c AND idModulo=@m`);
    if (!m.recordset.length) return reply.code(404).send({ error: 'Módulo no encontrado' });
    const idCurso = m.recordset[0].idCurso;
    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('idCurso', sql.BigInt, idCurso).input('idModulo', sql.BigInt, idModulo)
      .input('Titulo', sql.VarChar(200), b.Titulo.trim()).input('Descripcion', sql.VarChar(600), b.Descripcion || null)
      .input('TipoLeccion', sql.VarChar(20), tipo).input('VideoUrl', sql.VarChar(500), b.VideoUrl || null)
      .input('ArchivoUrl', sql.VarChar(500), b.ArchivoUrl || null).input('Contenido', sql.NVarChar(sql.MAX), b.Contenido || null)
      .input('DuracionMin', sql.Int, parseInt(b.DuracionMin) || 0).input('QuizAprob', sql.Int, parseInt(b.QuizAprob) || 70)
      .input('Orden', sql.Int, parseInt(b.Orden) || 0);
    const id = await insertarConId(req, {
      tabla: 'VIDA_ACADEMIA_LECCIONES', idCol: 'idLeccion',
      columnas: ['idCurso', 'idModulo', 'Titulo', 'Descripcion', 'TipoLeccion', 'VideoUrl', 'ArchivoUrl', 'Contenido', 'DuracionMin', 'QuizAprob', 'Orden', 'Status'],
      valores: ['@idCurso', '@idModulo', '@Titulo', '@Descripcion', '@TipoLeccion', '@VideoUrl', '@ArchivoUrl', '@Contenido', '@DuracionMin', '@QuizAprob', '@Orden', `'ACTIVO'`],
    });
    return reply.code(201).send({ idLeccion: id });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al crear lección' }); }
}
// PUT /academia/admin/lecciones/:idLeccion
export async function editarLeccion(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idLeccion } = request.params;
  const b = request.body || {};
  const tipo = TIPOS_LECCION.includes(b.TipoLeccion) ? b.TipoLeccion : 'VIDEO';
  try {
    const pool = await getPool();
    await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('l', sql.BigInt, idLeccion)
      .input('Titulo', sql.VarChar(200), b.Titulo?.trim() || null).input('Descripcion', sql.VarChar(600), b.Descripcion || null)
      .input('TipoLeccion', sql.VarChar(20), tipo).input('VideoUrl', sql.VarChar(500), b.VideoUrl || null)
      .input('ArchivoUrl', sql.VarChar(500), b.ArchivoUrl || null).input('Contenido', sql.NVarChar(sql.MAX), b.Contenido || null)
      .input('DuracionMin', sql.Int, parseInt(b.DuracionMin) || 0).input('QuizAprob', sql.Int, parseInt(b.QuizAprob) || 70).input('Orden', sql.Int, parseInt(b.Orden) || 0)
      .query(`UPDATE VIDA_ACADEMIA_LECCIONES SET Titulo=@Titulo, Descripcion=@Descripcion, TipoLeccion=@TipoLeccion,
                VideoUrl=@VideoUrl, ArchivoUrl=@ArchivoUrl, Contenido=@Contenido, DuracionMin=@DuracionMin, QuizAprob=@QuizAprob, Orden=@Orden
              WHERE idBranch=@b AND idCuenta=@c AND idLeccion=@l`);
    return reply.send({ ok: true });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al editar lección' }); }
}
// DELETE /academia/admin/lecciones/:idLeccion  (soft)
export async function eliminarLeccion(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idLeccion } = request.params;
  try {
    const pool = await getPool();
    await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('l', sql.BigInt, idLeccion)
      .query(`UPDATE VIDA_ACADEMIA_LECCIONES SET Status='INACTIVO' WHERE idBranch=@b AND idCuenta=@c AND idLeccion=@l`);
    return reply.send({ ok: true });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al eliminar lección' }); }
}

// POST /academia/admin/lecciones/:idLeccion/video  (multipart) — sube video o PDF
export async function subirArchivoLeccion(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idLeccion } = request.params;
  try {
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No se recibió ningún archivo' });
    const permitidos = ['video/mp4', 'video/webm', 'video/ogg', 'application/pdf'];
    if (!permitidos.includes(data.mimetype)) {
      return reply.code(400).send({ error: 'Solo se permiten videos (MP4/WebM/OGG) o PDF' });
    }
    const uploadDir = path.join(process.cwd(), 'uploads', 'academia');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const ext = (data.filename.split('.').pop() || 'bin').toLowerCase();
    const filename = `acad_${idBranch}_${idCuenta}_${idLeccion}_${Date.now()}.${ext}`;
    const filepath = path.join(uploadDir, filename);
    const buffer = await data.toBuffer();
    fs.writeFileSync(filepath, buffer);
    const url = `/uploads/academia/${filename}`;

    const pool = await getPool();
    const r = await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('l', sql.BigInt, idLeccion)
      .input('url', sql.VarChar(500), url)
      .query(`UPDATE VIDA_ACADEMIA_LECCIONES SET ArchivoUrl=@url WHERE idBranch=@b AND idCuenta=@c AND idLeccion=@l`);
    if (r.rowsAffected[0] === 0) { fs.unlinkSync(filepath); return reply.code(404).send({ error: 'Lección no encontrada' }); }
    return reply.send({ url });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al subir el archivo' }); }
}

// ── Quiz (bulk replace) ─────────────────────────────────────────────────────
// PUT /academia/admin/lecciones/:idLeccion/quiz   body: { preguntas:[{Texto, opciones:[{Texto, EsCorrecta}]}] }
export async function guardarQuiz(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idLeccion } = request.params;
  const preguntas = Array.isArray(request.body?.preguntas) ? request.body.preguntas : [];
  try {
    const pool = await getPool();
    const lec = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('l', sql.BigInt, idLeccion)
      .query(`SELECT idLeccion FROM VIDA_ACADEMIA_LECCIONES WHERE idBranch=@b AND idCuenta=@c AND idLeccion=@l`);
    if (!lec.recordset.length) return reply.code(404).send({ error: 'Lección no encontrada' });

    const tx = pool.transaction();
    await tx.begin();
    try {
      // Borra el quiz previo (opciones de las preguntas de esta lección, luego preguntas)
      await tx.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('l', sql.BigInt, idLeccion)
        .query(`DELETE o FROM VIDA_ACADEMIA_QUIZ_OPCIONES o
                JOIN VIDA_ACADEMIA_QUIZ_PREGUNTAS p ON p.idBranch=o.idBranch AND p.idCuenta=o.idCuenta AND p.idPregunta=o.idPregunta
                WHERE o.idBranch=@b AND o.idCuenta=@c AND p.idLeccion=@l;
                DELETE FROM VIDA_ACADEMIA_QUIZ_PREGUNTAS WHERE idBranch=@b AND idCuenta=@c AND idLeccion=@l;`);

      const TIPOS_PREG = ['OPCION_UNICA', 'VERDADERO_FALSO', 'OPCION_MULTIPLE', 'RESPUESTA_CORTA'];
      let pOrden = 1;
      for (const preg of preguntas) {
        if (!preg?.Texto?.trim()) continue;
        const tipoPreg = TIPOS_PREG.includes(preg.TipoPregunta) ? preg.TipoPregunta : 'OPCION_UNICA';
        // id atómico de pregunta
        const pr = await tx.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
          .input('l', sql.BigInt, idLeccion).input('t', sql.VarChar(500), preg.Texto.trim()).input('tp', sql.VarChar(20), tipoPreg).input('o', sql.Int, pOrden++)
          .query(`INSERT INTO VIDA_ACADEMIA_QUIZ_PREGUNTAS (idBranch,idCuenta,idPregunta,idLeccion,Texto,TipoPregunta,Orden)
                  OUTPUT inserted.idPregunta AS id
                  SELECT @b,@c,ISNULL(MAX(idPregunta),0)+1,@l,@t,@tp,@o FROM VIDA_ACADEMIA_QUIZ_PREGUNTAS WITH (UPDLOCK,HOLDLOCK) WHERE idBranch=@b AND idCuenta=@c`);
        const idPregunta = pr.recordset[0].id;
        let oOrden = 1;
        const ops = Array.isArray(preg.opciones) ? preg.opciones : [];
        for (const op of ops) {
          if (!op?.Texto?.trim()) continue;
          // En respuesta corta cada opción es una respuesta ACEPTADA → siempre correcta.
          const esCorrecta = tipoPreg === 'RESPUESTA_CORTA' ? 1 : (op.EsCorrecta ? 1 : 0);
          await tx.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
            .input('p', sql.BigInt, idPregunta).input('t', sql.VarChar(500), op.Texto.trim())
            .input('ec', sql.Bit, esCorrecta).input('o', sql.Int, oOrden++)
            .query(`INSERT INTO VIDA_ACADEMIA_QUIZ_OPCIONES (idBranch,idCuenta,idOpcion,idPregunta,Texto,EsCorrecta,Orden)
                    SELECT @b,@c,ISNULL(MAX(idOpcion),0)+1,@p,@t,@ec,@o FROM VIDA_ACADEMIA_QUIZ_OPCIONES WITH (UPDLOCK,HOLDLOCK) WHERE idBranch=@b AND idCuenta=@c`);
        }
      }
      await tx.commit();
    } catch (e) { await tx.rollback(); throw e; }
    return reply.send({ ok: true, preguntas: preguntas.length });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al guardar el quiz' }); }
}

// ════════════════════════════════════════════════════════════════════════════
// ANALÍTICA ADMINISTRATIVA
// ════════════════════════════════════════════════════════════════════════════
// GET /academia/admin/analitica  — resumen por curso + totales
export async function analitica(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();
    // Usuarios activos del panel (denominador de "avance")
    const totUsr = (await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
      .query(`SELECT COUNT(*) AS n FROM VIDA_CUENTA_USUARIOS WHERE idBranch=@b AND idCuenta=@c AND Status='ACTIVO'`)).recordset[0].n;

    const cursosQ = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
      .query(`
        SELECT c.idCurso, c.Titulo, c.Tipo, c.Obligatorio, c.FechaLimite,
          (SELECT COUNT(*) FROM VIDA_ACADEMIA_LECCIONES l WHERE l.idBranch=c.idBranch AND l.idCuenta=c.idCuenta AND l.idCurso=c.idCurso AND l.Status='ACTIVO') AS TotalLecciones,
          (SELECT COUNT(DISTINCT p.idUsuario) FROM VIDA_ACADEMIA_LECCION_PROGRESO p WHERE p.idBranch=c.idBranch AND p.idCuenta=c.idCuenta AND p.idCurso=c.idCurso AND p.TipoActor='EMPRESARIO') AS Inscritos,
          (SELECT COUNT(*) FROM VIDA_ACADEMIA_PROGRESO pr WHERE pr.idBranch=c.idBranch AND pr.idCuenta=c.idCuenta AND pr.idCurso=c.idCurso AND pr.TipoActor='EMPRESARIO' AND pr.Completado=1) AS Completaron,
          (SELECT MIN(DATEDIFF(SECOND, x.Inicio, x.Fin)) FROM (
             SELECT p.idUsuario, MIN(p.FechaInicio) AS Inicio, MAX(p.FechaFin) AS Fin
             FROM VIDA_ACADEMIA_LECCION_PROGRESO p
             WHERE p.idBranch=c.idBranch AND p.idCuenta=c.idCuenta AND p.idCurso=c.idCurso AND p.TipoActor='EMPRESARIO' AND p.Completado=1 AND p.FechaInicio IS NOT NULL AND p.FechaFin IS NOT NULL
             GROUP BY p.idUsuario
             HAVING COUNT(*) >= (SELECT COUNT(*) FROM VIDA_ACADEMIA_LECCIONES l2 WHERE l2.idBranch=c.idBranch AND l2.idCuenta=c.idCuenta AND l2.idCurso=c.idCurso AND l2.Status='ACTIVO')
           ) x) AS MenorTiempoSeg
        FROM VIDA_ACADEMIA_CURSOS c
        WHERE c.idBranch=@b AND c.idCuenta=@c AND c.Status='ACTIVO'
        ORDER BY c.Obligatorio DESC, c.Orden, c.idCurso`);

    const ahora = new Date();
    const cursos = cursosQ.recordset.map(c => ({
      ...c,
      PctCompletado: totUsr > 0 ? Math.round((c.Completaron / totUsr) * 100) : 0,
      Vencido: !!c.Obligatorio && !!c.FechaLimite && estaFueraDeTiempo({ Obligatorio: 1, FechaLimite: c.FechaLimite, Completado: false }, ahora),
    }));

    const totales = {
      usuarios: totUsr,
      cursos: cursos.length,
      obligatorios: cursos.filter(c => c.Obligatorio).length,
      completaciones: cursos.reduce((a, c) => a + (c.Completaron || 0), 0),
    };
    return reply.send({ totales, cursos });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al obtener analítica' }); }
}

// GET /academia/admin/analitica/curso/:idCurso — por usuario (avance, tiempo, fuera de tiempo)
export async function analiticaCurso(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idCurso } = request.params;
  try {
    const pool = await getPool();
    const cQ = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
      .query(`SELECT idCurso, Titulo, Obligatorio, FechaLimite,
                (SELECT COUNT(*) FROM VIDA_ACADEMIA_LECCIONES l WHERE l.idBranch=@b AND l.idCuenta=@c AND l.idCurso=@cur AND l.Status='ACTIVO') AS TotalLecciones
              FROM VIDA_ACADEMIA_CURSOS WHERE idBranch=@b AND idCuenta=@c AND idCurso=@cur`);
    if (!cQ.recordset.length) return reply.code(404).send({ error: 'Curso no encontrado' });
    const curso = cQ.recordset[0];
    const total = curso.TotalLecciones;

    const rows = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cur', sql.BigInt, idCurso)
      .query(`
        SELECT u.idUsuario, u.Nombre, u.Apellidos, u.TipoUsuario,
          (SELECT COUNT(*) FROM VIDA_ACADEMIA_LECCION_PROGRESO p
             JOIN VIDA_ACADEMIA_LECCIONES l ON l.idBranch=p.idBranch AND l.idCuenta=p.idCuenta AND l.idLeccion=p.idLeccion AND l.Status='ACTIVO'
             WHERE p.idBranch=@b AND p.idCuenta=@c AND p.idCurso=@cur AND p.TipoActor='EMPRESARIO' AND p.idUsuario=u.idUsuario AND p.Completado=1) AS Hechas,
          (SELECT MIN(p.FechaInicio) FROM VIDA_ACADEMIA_LECCION_PROGRESO p WHERE p.idBranch=@b AND p.idCuenta=@c AND p.idCurso=@cur AND p.TipoActor='EMPRESARIO' AND p.idUsuario=u.idUsuario) AS Inicio,
          (SELECT MAX(p.FechaFin) FROM VIDA_ACADEMIA_LECCION_PROGRESO p WHERE p.idBranch=@b AND p.idCuenta=@c AND p.idCurso=@cur AND p.TipoActor='EMPRESARIO' AND p.idUsuario=u.idUsuario AND p.Completado=1) AS Fin,
          (SELECT TOP 1 pr.Completado FROM VIDA_ACADEMIA_PROGRESO pr WHERE pr.idBranch=@b AND pr.idCuenta=@c AND pr.idCurso=@cur AND pr.TipoActor='EMPRESARIO' AND pr.idUsuario=u.idUsuario) AS Completado,
          (SELECT TOP 1 pr.FechaCompletado FROM VIDA_ACADEMIA_PROGRESO pr WHERE pr.idBranch=@b AND pr.idCuenta=@c AND pr.idCurso=@cur AND pr.TipoActor='EMPRESARIO' AND pr.idUsuario=u.idUsuario) AS FechaCompletado
        FROM VIDA_CUENTA_USUARIOS u
        WHERE u.idBranch=@b AND u.idCuenta=@c AND u.Status='ACTIVO'
        ORDER BY u.Nombre, u.Apellidos`);

    const ahora = new Date();
    const usuarios = rows.recordset.map(r => {
      const completado = r.Completado === true || r.Completado === 1;
      const pct = total > 0 ? Math.round((Math.min(r.Hechas, total) / total) * 100) : (completado ? 100 : 0);
      let tiempoSeg = null;
      if (completado && r.Inicio && r.Fin) tiempoSeg = Math.max(0, Math.round((new Date(r.Fin) - new Date(r.Inicio)) / 1000));
      return {
        idUsuario: r.idUsuario, Nombre: `${r.Nombre || ''} ${r.Apellidos || ''}`.trim(), TipoUsuario: r.TipoUsuario,
        Hechas: r.Hechas, Total: total, ProgresoPct: pct, Completado: completado, FechaCompletado: r.FechaCompletado,
        TiempoSeg: tiempoSeg,
        FueraDeTiempo: estaFueraDeTiempo({ Obligatorio: curso.Obligatorio, FechaLimite: curso.FechaLimite, Completado: completado }, ahora),
      };
    });
    return reply.send({ curso, usuarios });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al obtener analítica del curso' }); }
}
