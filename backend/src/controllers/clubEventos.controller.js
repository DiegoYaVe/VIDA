// src/controllers/clubEventos.controller.js
// Club VIDA fase 2 — eventos con confirmación de asistencia (sql/55).
// Cliente: ve los próximos eventos, confirma o cancela su asistencia (cupo y
// nivel mínimo del Club). Panel (corporativo): CRUD de eventos y asistentes.
// Las fechas se guardan en UTC; el panel las escribe y las lee en hora de
// Caracas (UTC−4 fijo).
import { getPool, sql } from '../db/sqlserver.js';
import { nivelDelCliente } from './club.controller.js';

// 'YYYY-MM-DDTHH:mm' en hora de Caracas ⇄ Date UTC
export function caracasAUtc(local) {
  const m = String(local || '').match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}:${m[3]}:00-04:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
export const utcACaracas = (d) => (d ? new Date(new Date(d).getTime() - 4 * 3600e3).toISOString().slice(0, 16) : null);

// ¿Puede confirmar? null si sí; si no, el motivo para el cliente
export function motivoNoConfirma({ evento, nivel, inscritos, ahora = new Date() }) {
  if (!evento || evento.Status !== 'ACTIVO') return 'El evento no está disponible';
  if (new Date(evento.FechaInicio) <= ahora) return 'El evento ya comenzó';
  if ((evento.NivelMinimo || 1) > nivel) return 'Este evento es para un nivel más alto del Club VIDA';
  if (evento.Cupo != null && inscritos >= Number(evento.Cupo)) return 'Ya no quedan cupos';
  return null;
}

const SQL_INSCRITOS = `(SELECT COUNT(*) FROM VIDA_CLUB_EVENTOS_RSVP r WHERE r.idBranch=e.idBranch AND r.idCuenta=e.idCuenta
                         AND r.idEvento=e.idEvento AND r.Status='CONFIRMADO')`;

// GET /delivery/cliente/club/eventos
export async function listarEventosCliente(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  try {
    const pool = await getPool();
    const club = await nivelDelCliente(pool, idBranch, idCuenta, idCliente);
    const r = await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cli', sql.BigInt, idCliente)
      .query(`SELECT TOP 30 e.idEvento, e.Titulo, e.Descripcion, e.Lugar, e.FechaInicio, e.Cupo, e.NivelMinimo, e.ImagenUrl,
                ${SQL_INSCRITOS} AS Inscritos,
                CASE WHEN EXISTS (SELECT 1 FROM VIDA_CLUB_EVENTOS_RSVP r WHERE r.idBranch=e.idBranch AND r.idCuenta=e.idCuenta
                  AND r.idEvento=e.idEvento AND r.idCliente=@cli AND r.Status='CONFIRMADO') THEN 1 ELSE 0 END AS Asistire
              FROM VIDA_CLUB_EVENTOS e
              WHERE e.idBranch=@b AND e.idCuenta=@c AND e.Status='ACTIVO' AND e.FechaInicio > DATEADD(HOUR,-3,SYSUTCDATETIME())
              ORDER BY e.FechaInicio`);
    const nombreNivel = (n) => club.niveles.find((x) => x.Nivel === n)?.Nombre || `nivel ${n}`;
    return reply.send({
      nivel: club.nivel, nombreNivel: club.nombre,
      eventos: r.recordset.map((e) => ({ ...e, Asistire: !!e.Asistire,
        Bloqueado: (e.NivelMinimo || 1) > club.nivel, NombreNivel: (e.NivelMinimo || 1) > 1 ? nombreNivel(e.NivelMinimo) : null,
        Lleno: e.Cupo != null && e.Inscritos >= e.Cupo, Comenzo: new Date(e.FechaInicio) <= new Date() })),
    });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al obtener los eventos' }); }
}

// POST /delivery/cliente/club/eventos/:idEvento/asistencia
export async function confirmarAsistencia(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const { idEvento } = request.params;
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  let enTx = false;
  try {
    const club = await nivelDelCliente(pool, idBranch, idCuenta, idCliente);
    await tx.begin(); enTx = true;
    const req = () => new sql.Request(tx).input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
      .input('ev', sql.BigInt, idEvento).input('cli', sql.BigInt, idCliente);
    // El lock sobre el evento serializa las confirmaciones: el cupo no se pasa
    const evento = (await req().query(`SELECT e.*, (SELECT COUNT(*) FROM VIDA_CLUB_EVENTOS_RSVP r WHERE r.idBranch=e.idBranch AND r.idCuenta=e.idCuenta
                                         AND r.idEvento=e.idEvento AND r.Status='CONFIRMADO' AND r.idCliente<>@cli) AS Otros
                                       FROM VIDA_CLUB_EVENTOS e WITH (UPDLOCK, HOLDLOCK)
                                       WHERE e.idBranch=@b AND e.idCuenta=@c AND e.idEvento=@ev`)).recordset[0];
    const motivo = motivoNoConfirma({ evento, nivel: club.nivel, inscritos: evento?.Otros ?? 0 });
    if (motivo) { await tx.rollback(); enTx = false; return reply.code(evento ? 409 : 404).send({ error: motivo }); }
    await req().query(`MERGE VIDA_CLUB_EVENTOS_RSVP AS t
      USING (SELECT @b b, @c c, @ev ev, @cli cli) s ON t.idBranch=s.b AND t.idCuenta=s.c AND t.idEvento=s.ev AND t.idCliente=s.cli
      WHEN MATCHED THEN UPDATE SET Status='CONFIRMADO', FechaMod=SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (idBranch,idCuenta,idEvento,idCliente,Status) VALUES (@b,@c,@ev,@cli,'CONFIRMADO');`);
    await tx.commit(); enTx = false;
    return reply.send({ ok: true, Inscritos: Number(evento.Otros) + 1 });
  } catch (err) {
    if (enTx) { try { await tx.rollback(); } catch { } }
    request.log.error(err);
    return reply.code(500).send({ error: 'No se pudo confirmar tu asistencia' });
  }
}

// DELETE /delivery/cliente/club/eventos/:idEvento/asistencia
export async function cancelarAsistencia(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('ev', sql.BigInt, request.params.idEvento).input('cli', sql.BigInt, idCliente)
      .query(`UPDATE r SET Status='CANCELADO', FechaMod=SYSUTCDATETIME()
              FROM VIDA_CLUB_EVENTOS_RSVP r JOIN VIDA_CLUB_EVENTOS e ON e.idBranch=r.idBranch AND e.idCuenta=r.idCuenta AND e.idEvento=r.idEvento
              WHERE r.idBranch=@b AND r.idCuenta=@c AND r.idEvento=@ev AND r.idCliente=@cli AND r.Status='CONFIRMADO'
                AND e.FechaInicio > SYSUTCDATETIME()`);
    if (!r.rowsAffected[0]) return reply.code(409).send({ error: 'No tienes una asistencia que cancelar (o el evento ya comenzó)' });
    return reply.send({ ok: true });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'No se pudo cancelar tu asistencia' }); }
}

// ── Panel ───────────────────────────────────────────────────────────────────
function leerEvento(b) {
  const Titulo = String(b.Titulo || '').trim();
  const inicio = caracasAUtc(b.FechaInicioLocal);
  if (!Titulo) return { error: 'El título es obligatorio' };
  if (!inicio) return { error: 'Indica la fecha y hora del evento' };
  const cupo = b.Cupo === '' || b.Cupo == null ? null : parseInt(b.Cupo);
  if (cupo != null && !(cupo > 0)) return { error: 'El cupo debe ser mayor a 0 (vacío = sin límite)' };
  return { Titulo: Titulo.slice(0, 150), Descripcion: String(b.Descripcion || '').trim().slice(0, 1000) || null,
    Lugar: String(b.Lugar || '').trim().slice(0, 250) || null, inicio, cupo,
    nivel: Math.max(1, parseInt(b.NivelMinimo) || 1), ImagenUrl: String(b.ImagenUrl || '').trim().slice(0, 400) || null,
    Status: b.Status === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO' };
}
const conEvento = (rq, e) => rq.input('t', sql.VarChar(150), e.Titulo).input('d', sql.VarChar(1000), e.Descripcion)
  .input('l', sql.VarChar(250), e.Lugar).input('f', sql.DateTime2, e.inicio).input('cupo', sql.Int, e.cupo)
  .input('n', sql.Int, e.nivel).input('img', sql.VarChar(400), e.ImagenUrl).input('st', sql.VarChar(20), e.Status);

// GET /delivery/admin/club/eventos
export async function listarEventosAdmin(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const r = await (await getPool()).request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
      .query(`SELECT TOP 200 e.idEvento, e.Titulo, e.Descripcion, e.Lugar, e.FechaInicio, e.Cupo, e.NivelMinimo, e.ImagenUrl, e.Status,
                ${SQL_INSCRITOS} AS Inscritos
              FROM VIDA_CLUB_EVENTOS e WHERE e.idBranch=@b AND e.idCuenta=@c ORDER BY e.FechaInicio DESC`);
    return reply.send(r.recordset.map((e) => ({ ...e, FechaInicioLocal: utcACaracas(e.FechaInicio) })));
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al listar eventos' }); }
}

// POST /delivery/admin/club/eventos
export async function crearEvento(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const e = leerEvento(request.body || {});
  if (e.error) return reply.code(400).send({ error: e.error });
  try {
    const r = await conEvento((await getPool()).request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
      .input('u', sql.VarChar(30), String(idUsuario ?? '')), e)
      .query(`INSERT INTO VIDA_CLUB_EVENTOS (idBranch,idCuenta,idEvento,Titulo,Descripcion,Lugar,FechaInicio,Cupo,NivelMinimo,ImagenUrl,Status,UsuAlta)
              OUTPUT inserted.idEvento
              SELECT @b,@c,ISNULL(MAX(idEvento),0)+1,@t,@d,@l,@f,@cupo,@n,@img,@st,@u
              FROM VIDA_CLUB_EVENTOS WITH (UPDLOCK, HOLDLOCK) WHERE idBranch=@b AND idCuenta=@c`);
    return reply.code(201).send({ idEvento: r.recordset[0].idEvento });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al crear el evento' }); }
}

// PUT /delivery/admin/club/eventos/:idEvento
export async function editarEvento(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const e = leerEvento(request.body || {});
  if (e.error) return reply.code(400).send({ error: e.error });
  try {
    const r = await conEvento((await getPool()).request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
      .input('ev', sql.BigInt, request.params.idEvento), e)
      .query(`UPDATE VIDA_CLUB_EVENTOS SET Titulo=@t, Descripcion=@d, Lugar=@l, FechaInicio=@f, Cupo=@cupo, NivelMinimo=@n, ImagenUrl=@img, Status=@st
              WHERE idBranch=@b AND idCuenta=@c AND idEvento=@ev`);
    if (!r.rowsAffected[0]) return reply.code(404).send({ error: 'Evento no encontrado' });
    return reply.send({ ok: true });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al editar el evento' }); }
}

// DELETE /delivery/admin/club/eventos/:idEvento (lo desactiva; las asistencias quedan)
export async function eliminarEvento(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    await (await getPool()).request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('ev', sql.BigInt, request.params.idEvento)
      .query(`UPDATE VIDA_CLUB_EVENTOS SET Status='INACTIVO' WHERE idBranch=@b AND idCuenta=@c AND idEvento=@ev`);
    return reply.send({ ok: true });
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al desactivar el evento' }); }
}

// GET /delivery/admin/club/eventos/:idEvento/asistentes
export async function asistentesEvento(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const r = await (await getPool()).request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('ev', sql.BigInt, request.params.idEvento)
      .query(`SELECT r.idCliente, LTRIM(RTRIM(CONCAT(c.Nombre,' ',ISNULL(c.Apellidos,'')))) AS Cliente, c.Telefono, c.Email, r.FechaAlta
              FROM VIDA_CLUB_EVENTOS_RSVP r
              JOIN VIDA_APP_CLIENTES c ON c.idBranch=r.idBranch AND c.idCuenta=r.idCuenta AND c.idCliente=r.idCliente
              WHERE r.idBranch=@b AND r.idCuenta=@c AND r.idEvento=@ev AND r.Status='CONFIRMADO'
              ORDER BY r.FechaAlta`);
    return reply.send(r.recordset);
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Error al listar asistentes' }); }
}
