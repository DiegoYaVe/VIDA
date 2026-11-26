// src/controllers/prospectos.controller.js
// Formulario "Regístrate" de comercializadoravida.com (sql/64). La página es
// pública: cualquiera puede enviar, así que se valida, se limita por IP y se
// descarta en silencio lo que llena el campo trampa. VIDA lo atiende en el
// panel (Portal Corporativo → Registros de la web) y le llega un aviso por correo.
import { getPool, sql } from '../db/sqlserver.js';
import { conIdUnico } from '../db/idUnico.js';
import { enviarCorreo, correoConfigurado, plantillaCorreo } from '../services/correo.service.js';
import { validarRegistro, INTERESES, STATUS_PROSPECTO } from '../services/prospectos.service.js';
import { ordenSql, limiteSeguro } from '../services/ordenLista.js';

// La página web no tiene sesión: los registros van a la cuenta de VIDA.
const ID_BRANCH = Number(process.env.LANDING_ID_BRANCH || 1);
const ID_CUENTA = Number(process.env.LANDING_ID_CUENTA || 1);

// POST /prospectos (público) { nombre, email, telefono, interes, mensaje, sitio_web }
export async function registrarProspecto(request, reply) {
  const r = validarRegistro(request.body || {});
  // Al robot se le responde igual que a una persona, para que no insista
  if (r.robot) return reply.code(201).send({ ok: true });
  if (r.error) return reply.code(400).send({ error: r.error });
  const d = r.datos;
  try {
    const pool = await getPool();
    const idProspecto = await conIdUnico(async () => {
      const id = (await pool.request()
        .input('b', sql.BigInt, ID_BRANCH).input('c', sql.BigInt, ID_CUENTA)
        .query(`SELECT ISNULL(MAX(idProspecto),0)+1 AS id FROM VIDA_PROSPECTOS_WEB WHERE idBranch=@b AND idCuenta=@c`)).recordset[0].id;
      await pool.request()
        .input('b', sql.BigInt, ID_BRANCH).input('c', sql.BigInt, ID_CUENTA).input('id', sql.BigInt, id)
        .input('Nombre', sql.NVarChar(150), d.Nombre).input('Email', sql.VarChar(150), d.Email)
        .input('Telefono', sql.VarChar(40), d.Telefono).input('Interes', sql.VarChar(20), d.Interes)
        .input('Mensaje', sql.NVarChar(1000), d.Mensaje)
        .query(`INSERT INTO VIDA_PROSPECTOS_WEB (idBranch,idCuenta,idProspecto,Nombre,Email,Telefono,Interes,Mensaje)
                VALUES (@b,@c,@id,@Nombre,@Email,@Telefono,@Interes,@Mensaje)`);
      return id;
    });
    avisarPorCorreo(d, request.log);
    return reply.code(201).send({ ok: true, idProspecto });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'No pudimos guardar tu registro. Intenta de nuevo o escríbenos por WhatsApp.' });
  }
}

// Aviso a VIDA (PROSPECTOS_CORREO o, si no hay, el buzón que envía los correos).
// Si el correo falla, el registro igual quedó guardado.
function avisarPorCorreo(d, log) {
  const para = process.env.PROSPECTOS_CORREO || process.env.EMAIL_USER;
  if (!correoConfigurado() || !para) return;
  enviarCorreo({
    to: para,
    subject: `Nuevo registro en la web: ${d.Nombre}`,
    html: plantillaCorreo({
      saludo: 'Llegó un registro desde comercializadoravida.com',
      parrafos: [
        `Nombre: ${d.Nombre}`, `Correo: ${d.Email}`, `Teléfono: ${d.Telefono || '—'}`,
        `Le interesa: ${INTERESES[d.Interes] || 'No lo indicó'}`, ...(d.Mensaje ? [`Mensaje: ${d.Mensaje}`] : []),
      ],
      pie: 'Atiéndelo en el panel: Portal Corporativo → Registros de la web.',
    }),
  }).catch((e) => log?.warn?.({ err: e.message }, 'No se pudo avisar por correo del registro web'));
}

// GET /prospectos?status=&search=&page=&limit=  (VIDA)
export async function listarProspectos(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { status = '', search = '', page = 1 } = request.query;
  const limit = limiteSeguro(request.query.limit, 25);
  const orden = ordenSql(request.query, { FechaAlta: 'FechaAlta', Nombre: 'Nombre', Interes: 'Interes', Status: 'Status' }, 'FechaAlta DESC', 'idProspecto DESC');
  try {
    const pool = await getPool();
    const req = () => {
      const q = pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta);
      if (status) q.input('status', sql.VarChar(20), status);
      if (search) q.input('search', sql.NVarChar(160), `%${search}%`);
      return q;
    };
    const where = `WHERE idBranch=@b AND idCuenta=@c${status ? ' AND Status=@status' : ''}${search ? ' AND (Nombre LIKE @search OR Email LIKE @search OR Telefono LIKE @search)' : ''}`;
    const [filas, tot] = await Promise.all([
      req().input('off', sql.Int, (Math.max(1, parseInt(page)) - 1) * limit).input('lim', sql.Int, limit)
        .query(`SELECT idProspecto, Nombre, Email, Telefono, Interes, Mensaje, Origen, Status, Notas, FechaAlta, FechaMod
                FROM VIDA_PROSPECTOS_WEB ${where} ORDER BY ${orden} OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY`),
      req().query(`SELECT COUNT(*) AS total, SUM(CASE WHEN Status='NUEVO' THEN 1 ELSE 0 END) AS nuevos FROM VIDA_PROSPECTOS_WEB WHERE idBranch=@b AND idCuenta=@c;
                   SELECT COUNT(*) AS total FROM VIDA_PROSPECTOS_WEB ${where}`),
    ]);
    return reply.send({ data: filas.recordset, total: tot.recordsets[1][0].total, nuevos: tot.recordsets[0][0].nuevos || 0 });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener los registros' });
  }
}

// PATCH /prospectos/:idProspecto { Status, Notas }  (VIDA)
export async function actualizarProspecto(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { Status, Notas } = request.body || {};
  if (Status !== undefined && !STATUS_PROSPECTO.includes(Status)) return reply.code(400).send({ error: 'Estado inválido' });
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('id', sql.BigInt, request.params.idProspecto)
      .input('Status', sql.VarChar(20), Status ?? null)
      .input('Notas', sql.NVarChar(1000), Notas === undefined ? null : String(Notas).trim().slice(0, 1000))
      .input('CambiarNotas', sql.Bit, Notas === undefined ? 0 : 1)
      .input('Usu', sql.VarChar(30), `U:${idUsuario}`)
      .query(`UPDATE VIDA_PROSPECTOS_WEB SET Status=ISNULL(@Status, Status),
                Notas=CASE WHEN @CambiarNotas=1 THEN @Notas ELSE Notas END, FechaMod=GETUTCDATE(), UsuMod=@Usu
              WHERE idBranch=@b AND idCuenta=@c AND idProspecto=@id`);
    if (!r.rowsAffected[0]) return reply.code(404).send({ error: 'Registro no encontrado' });
    return reply.send({ ok: true });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al actualizar el registro' });
  }
}
