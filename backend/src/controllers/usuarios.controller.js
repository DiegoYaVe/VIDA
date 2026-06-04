// src/controllers/usuarios.controller.js
import bcrypt from 'bcrypt';
import { getPool, sql } from '../db/sqlserver.js';

async function getConfig(pool, idBranch, clave) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('Clave', sql.VarChar(100), clave)
    .query(`SELECT Valor FROM VIDA_CONFIGURACION
            WHERE idBranch=@idBranch AND Clave=@Clave AND Status='ACTIVO'`);
  return r.recordset[0]?.Valor ?? null;
}

function generarPasswordTemporal() {
  const letras   = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const numeros  = '23456789';
  const especiales = '#$@!';
  let pass = 'Vida';
  pass += especiales[Math.floor(Math.random() * especiales.length)];
  for (let i = 0; i < 3; i++) pass += numeros[Math.floor(Math.random() * numeros.length)];
  for (let i = 0; i < 3; i++) pass += letras[Math.floor(Math.random() * letras.length)];
  return pass;
}

async function enviarEmailInvitacion(pool, usuario, passwordTemporal, idBranch) {
  const smtpHost   = await getConfig(pool, idBranch, 'SMTP_HOST');
  const smtpPort   = await getConfig(pool, idBranch, 'SMTP_PORT');
  const smtpUser   = await getConfig(pool, idBranch, 'SMTP_USER');
  const smtpPass   = await getConfig(pool, idBranch, 'SMTP_PASS');
  const smtpFrom   = await getConfig(pool, idBranch, 'SMTP_FROM');
  const smtpName   = await getConfig(pool, idBranch, 'SMTP_NAME');
  const urlSistema = await getConfig(pool, idBranch, 'URL_SISTEMA');

  const { createTransport } = await import('nodemailer');
  const transporter = createTransport({
    host: smtpHost,
    port: parseInt(smtpPort),
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
    tls: { rejectUnauthorized: false },
  });

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/></head>
  <body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
      <tr><td align="center">
        <table width="580" cellpadding="0" cellspacing="0"
          style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:linear-gradient(135deg,#1A6A9A,#27AE60);padding:32px;text-align:center;">
              <div style="font-size:30px;font-weight:900;color:#fff;letter-spacing:2px;">VIDA</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:4px;">PLATAFORMA DE DESARROLLO EMPRESARIAL</div>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px;">
              <h2 style="color:#0D1B2A;font-size:20px;margin:0 0 8px 0;">¡Bienvenido a VIDA, ${usuario.Nombre}!</h2>
              <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 24px 0;">
                El administrador te ha creado una cuenta como <strong style="color:#27AE60;">${usuario.TipoUsuario}</strong>.
                Usa las siguientes credenciales para iniciar sesión. Al entrar, el sistema te pedirá cambiar tu contraseña.
              </p>
              <div style="background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:24px;">
                <table width="100%" cellpadding="6">
                  <tr>
                    <td style="font-size:12px;color:#94a3b8;">Usuario</td>
                    <td style="font-size:14px;color:#0D1B2A;font-weight:700;text-align:right;font-family:monospace;">${usuario.Cve}</td>
                  </tr>
                  <tr>
                    <td style="font-size:12px;color:#94a3b8;">Contraseña temporal</td>
                    <td style="font-size:16px;color:#27AE60;font-weight:900;text-align:right;font-family:monospace;letter-spacing:2px;">${passwordTemporal}</td>
                  </tr>
                  <tr>
                    <td style="font-size:12px;color:#94a3b8;">Rol</td>
                    <td style="font-size:13px;color:#0D1B2A;font-weight:700;text-align:right;">${usuario.TipoUsuario}</td>
                  </tr>
                </table>
              </div>
              <div style="text-align:center;margin:28px 0;">
                <a href="${urlSistema}/login"
                  style="background:linear-gradient(135deg,#27AE60,#1A6A9A);color:#fff;text-decoration:none;
                         padding:14px 32px;border-radius:12px;font-size:15px;font-weight:700;display:inline-block;">
                  Iniciar sesión
                </a>
              </div>
              <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:12px 16px;">
                <p style="color:#92400e;font-size:12px;margin:0;line-height:1.6;">
                  ⚠️ Esta es una contraseña temporal. Al iniciar sesión, el sistema te pedirá crear una contraseña personal segura.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="color:#94a3b8;font-size:11px;margin:0;">${smtpName} · Correo automático, no respondas a este mensaje.</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;

  await transporter.sendMail({
    from: `"${smtpName}" <${smtpFrom}>`,
    to: usuario.Correo,
    subject: `Tus credenciales de acceso — ${smtpName}`,
    html,
  });
}

function nivelPorRol(rol) {
  const niveles = { SUPER_ADMIN: 0, ADMIN_PAIS: 1, ADMIN: 1, SUPERVISOR: 2, CAJERO: 3, CASHIER: 3 };
  return niveles[rol] ?? 3;
}

// ── GET /api/usuarios ──────────────────────────────────────────────────────
export async function listarUsuarios(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { page = 1, limit = 20, search = '', rol = '' } = request.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const pool = await getPool();
    let whereExtra = '';
    if (search) whereExtra += ` AND (u.Nombre LIKE @search OR u.Apellidos LIKE @search OR u.Correo LIKE @search OR u.Cve LIKE @search)`;
    if (rol)    whereExtra += ` AND u.TipoUsuario = @rol`;

    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('offset',   sql.Int,    offset)
      .input('limit',    sql.Int,    parseInt(limit));

    if (search) req.input('search', sql.VarChar(200), `%${search}%`);
    if (rol)    req.input('rol',    sql.VarChar(50),  rol);

    const result = await req.query(`
      SELECT u.idUsuario, u.Nombre, u.Apellidos, u.NomComercial,
        u.Correo, u.Telefono, u.Cve, u.TipoUsuario, u.NivelAcceso, u.Puesto,
        u.idPuntoVenta, u.Status, u.FechaAlta, u.ImagenUsuario, u.FechaNacimiento, u.CambiarPass,
        p.NomComercial AS NombreSucursal,
        (SELECT COUNT(*) FROM VIDA_CUENTA_PANTALLAS_ACCESOS_USUARIO a
         WHERE a.idBranch=u.idBranch AND a.idCuenta=u.idCuenta
           AND a.idUsuario=u.idUsuario AND a.StatusAcceso='ACTIVO') AS totalAccesos
      FROM VIDA_CUENTA_USUARIOS u
      LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA p
        ON p.idBranch=u.idBranch AND p.idCuenta=u.idCuenta AND p.idPuntoVenta=u.idPuntoVenta
      WHERE u.idBranch=@idBranch AND u.idCuenta=@idCuenta
      ${whereExtra}
      ORDER BY u.idUsuario
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const totalRes = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT COUNT(*) AS total FROM VIDA_CUENTA_USUARIOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);

    return reply.send({
      data:  result.recordset,
      total: totalRes.recordset[0].total,
      page:  parseInt(page),
      pages: Math.ceil(totalRes.recordset[0].total / parseInt(limit)),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener usuarios' });
  }
}

// ── POST /api/usuarios ────────────────────────────────────────────────────
export async function crearUsuario(request, reply) {
  const { idBranch, idCuenta, idUsuario: idCreador } = request.user;
  const { Nombre, Apellidos, NomComercial, Correo, Cve, TipoUsuario, Puesto, Telefono, FechaNacimiento, idPuntoVenta, pantallas = [] } = request.body;

  if (!Nombre || !Correo || !Cve || !TipoUsuario) {
    return reply.code(400).send({ error: 'Nombre, Correo, Usuario y Rol son requeridos' });
  }

  try {
    const pool = await getPool();

    const existe = await pool.request()
      .input('Cve', sql.VarChar(50), Cve)
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT idUsuario FROM VIDA_CUENTA_USUARIOS WHERE Cve=@Cve AND idBranch=@idBranch AND idCuenta=@idCuenta`);

    if (existe.recordset.length > 0) {
      return reply.code(409).send({ error: 'El nombre de usuario ya está en uso' });
    }

    const maxId = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT ISNULL(MAX(idUsuario),0)+1 AS nextId FROM VIDA_CUENTA_USUARIOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);

    const nuevoId = maxId.recordset[0].nextId;

    // Generar password temporal
    const passwordTemporal = generarPasswordTemporal();
    const hash = await bcrypt.hash(passwordTemporal, 12);

    await pool.request()
      .input('idBranch',       sql.BigInt,       idBranch)
      .input('idCuenta',       sql.BigInt,       idCuenta)
      .input('idUsuario',      sql.BigInt,       nuevoId)
      .input('Nombre',         sql.VarChar(200), Nombre)
      .input('Apellidos',      sql.VarChar(200), Apellidos || null)
      .input('NomComercial',   sql.VarChar(200), NomComercial || null)
      .input('Correo',         sql.VarChar(100), Correo)
      .input('Telefono',       sql.VarChar(50),  Telefono || null)
      .input('Cve',            sql.VarChar(50),  Cve)
      .input('TipoUsuario',    sql.VarChar(50),  TipoUsuario)
      .input('Puesto',         sql.VarChar(200), Puesto || null)
      .input('FechaNacimiento',sql.Date,         FechaNacimiento || null)
      .input('idPuntoVenta',   sql.BigInt,       idPuntoVenta || null)
      .input('NivelAcceso',    sql.Int,           nivelPorRol(TipoUsuario))
      .input('Pass',           sql.VarChar(255), hash)
      .input('UsuAlta',        sql.VarChar(10),  String(idCreador))
      .query(`INSERT INTO VIDA_CUENTA_USUARIOS
                (idBranch, idCuenta, idUsuario, Nombre, Apellidos, NomComercial,
                 Correo, Telefono, Cve, TipoUsuario, Puesto, FechaNacimiento,
                 idPuntoVenta, NivelAcceso, Pass, CambiarPass, UsuAlta, Status)
              VALUES
                (@idBranch, @idCuenta, @idUsuario, @Nombre, @Apellidos, @NomComercial,
                 @Correo, @Telefono, @Cve, @TipoUsuario, @Puesto, @FechaNacimiento,
                 @idPuntoVenta, @NivelAcceso, @Pass, 1, @UsuAlta, 'ACTIVO')`);

    for (const idPantalla of pantallas) {
      await pool.request()
        .input('idBranch',   sql.BigInt, idBranch)
        .input('idCuenta',   sql.BigInt, idCuenta)
        .input('idPantalla', sql.BigInt, idPantalla)
        .input('idUsuario',  sql.BigInt, nuevoId)
        .input('UsuAlta',    sql.VarChar(10), String(idCreador))
        .query(`INSERT INTO VIDA_CUENTA_PANTALLAS_ACCESOS_USUARIO
                  (idBranch, idCuenta, idPantalla, idUsuario, StatusAcceso, UsuAlta, Status)
                VALUES (@idBranch, @idCuenta, @idPantalla, @idUsuario, 'ACTIVO', @UsuAlta, 'ACTIVO')`);
    }

    await enviarEmailInvitacion(pool, { Nombre, Correo, Cve, TipoUsuario }, passwordTemporal, idBranch);

    return reply.code(201).send({
      message: 'Usuario creado. Se enviaron las credenciales por email.',
      idUsuario: nuevoId,
    });

  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al crear usuario: ' + err.message });
  }
}

// ── PUT /api/usuarios/:idUsuario ──────────────────────────────────────────
export async function editarUsuario(request, reply) {
  const { idBranch, idCuenta, idUsuario: idEditor } = request.user;
  const { idUsuario } = request.params;
  const { Nombre, Apellidos, NomComercial, Correo, Telefono, TipoUsuario, Puesto, FechaNacimiento, idPuntoVenta, pantallas } = request.body;

  try {
    const pool = await getPool();

    await pool.request()
      .input('idBranch',       sql.BigInt,       idBranch)
      .input('idCuenta',       sql.BigInt,       idCuenta)
      .input('idUsuario',      sql.BigInt,       idUsuario)
      .input('Nombre',         sql.VarChar(200), Nombre)
      .input('Apellidos',      sql.VarChar(200), Apellidos || null)
      .input('NomComercial',   sql.VarChar(200), NomComercial || null)
      .input('Correo',         sql.VarChar(100), Correo)
      .input('Telefono',       sql.VarChar(50),  Telefono || null)
      .input('TipoUsuario',    sql.VarChar(50),  TipoUsuario)
      .input('Puesto',         sql.VarChar(200), Puesto || null)
      .input('FechaNacimiento',sql.Date,         FechaNacimiento || null)
      .input('idPuntoVenta',   sql.BigInt,       idPuntoVenta || null)
      .input('NivelAcceso',    sql.Int,           nivelPorRol(TipoUsuario))
      .input('UsuMod',         sql.VarChar(10),  String(idEditor))
      .query(`UPDATE VIDA_CUENTA_USUARIOS SET
                Nombre=@Nombre, Apellidos=@Apellidos, NomComercial=@NomComercial,
                Correo=@Correo, Telefono=@Telefono, TipoUsuario=@TipoUsuario,
                Puesto=@Puesto, FechaNacimiento=@FechaNacimiento,
                idPuntoVenta=@idPuntoVenta, NivelAcceso=@NivelAcceso,
                FechaMod=GETDATE(), UsuMod=@UsuMod
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idUsuario=@idUsuario`);

    if (pantallas !== undefined) {
      await pool.request()
        .input('idBranch',  sql.BigInt, idBranch)
        .input('idCuenta',  sql.BigInt, idCuenta)
        .input('idUsuario', sql.BigInt, idUsuario)
        .query(`DELETE FROM VIDA_CUENTA_PANTALLAS_ACCESOS_USUARIO WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idUsuario=@idUsuario`);

      for (const idPantalla of pantallas) {
        await pool.request()
          .input('idBranch',   sql.BigInt, idBranch)
          .input('idCuenta',   sql.BigInt, idCuenta)
          .input('idPantalla', sql.BigInt, idPantalla)
          .input('idUsuario',  sql.BigInt, idUsuario)
          .input('UsuAlta',    sql.VarChar(10), String(idEditor))
          .query(`INSERT INTO VIDA_CUENTA_PANTALLAS_ACCESOS_USUARIO
                    (idBranch, idCuenta, idPantalla, idUsuario, StatusAcceso, UsuAlta, Status)
                  VALUES (@idBranch, @idCuenta, @idPantalla, @idUsuario, 'ACTIVO', @UsuAlta, 'ACTIVO')`);
      }
    }

    return reply.send({ message: 'Usuario actualizado correctamente' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al editar usuario' });
  }
}

// ── PATCH /api/usuarios/:idUsuario/status ─────────────────────────────────
export async function toggleStatus(request, reply) {
  const { idBranch, idCuenta, idUsuario: idEditor } = request.user;
  const { idUsuario } = request.params;
  const { status } = request.body;

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',  sql.BigInt,      idBranch)
      .input('idCuenta',  sql.BigInt,      idCuenta)
      .input('idUsuario', sql.BigInt,      idUsuario)
      .input('Status',    sql.VarChar(50), status)
      .input('UsuMod',    sql.VarChar(10), String(idEditor))
      .query(`UPDATE VIDA_CUENTA_USUARIOS SET Status=@Status, FechaMod=GETDATE(), UsuMod=@UsuMod
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idUsuario=@idUsuario`);

    return reply.send({ message: `Usuario ${status === 'ACTIVO' ? 'activado' : 'desactivado'} correctamente` });
  } catch (err) {
    return reply.code(500).send({ error: 'Error al cambiar status' });
  }
}

// ── POST /api/usuarios/cambiar-pass ───────────────────────────────────────
export async function cambiarPassword(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { passwordActual, passwordNueva } = request.body;

  if (!passwordActual || !passwordNueva) {
    return reply.code(400).send({ error: 'Contraseña actual y nueva son requeridas' });
  }
  if (passwordNueva.length < 8) {
    return reply.code(400).send({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  try {
    const pool = await getPool();

    const res = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idUsuario', sql.BigInt, idUsuario)
      .query(`SELECT Pass FROM VIDA_CUENTA_USUARIOS WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idUsuario=@idUsuario`);

    const usuario = res.recordset[0];
    if (!usuario) return reply.code(404).send({ error: 'Usuario no encontrado' });

    const valido = await bcrypt.compare(passwordActual, usuario.Pass);
    if (!valido) return reply.code(401).send({ error: 'La contraseña actual es incorrecta' });

    const hash = await bcrypt.hash(passwordNueva, 12);
    await pool.request()
      .input('idBranch',  sql.BigInt,       idBranch)
      .input('idCuenta',  sql.BigInt,       idCuenta)
      .input('idUsuario', sql.BigInt,       idUsuario)
      .input('Pass',      sql.VarChar(255), hash)
      .query(`UPDATE VIDA_CUENTA_USUARIOS SET Pass=@Pass, CambiarPass=0, FechaMod=GETDATE(), UsuMod='CAMBIO_PASS'
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idUsuario=@idUsuario`);

    return reply.send({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al cambiar contraseña' });
  }
}

// ── GET /api/usuarios/pantallas ───────────────────────────────────────────
export async function getPantallas(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT idPantalla, Nombre, Modulo, Icono, OrdenPantalla
              FROM VIDA_CUENTA_PANTALLAS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO'
              ORDER BY OrdenPantalla`);
    return reply.send(result.recordset);
  } catch (err) {
    return reply.code(500).send({ error: 'Error al obtener pantallas' });
  }
}