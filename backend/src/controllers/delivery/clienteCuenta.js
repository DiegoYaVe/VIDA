// src/controllers/delivery/clienteCuenta.js
// Cuenta del cliente de la app: registro, login (incluido Google), perfil, contraseña, direcciones y tokens push.
// (Separado de delivery.controller.js, que reexporta todo.)
import { getPool, sql } from '../../db/sqlserver.js';
import { conIdUnico } from '../../db/idUnico.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { createTransport } from 'nodemailer';
import { nextId, resolverBaseUrl } from './comun.js';

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — REGISTRO
// POST /delivery/cliente/registro
// ══════════════════════════════════════════════════════════════════════════
export async function registrarCliente(request, reply) {
  const { idBranch, idCuenta, Nombre, Apellidos, Telefono, Email, Contrasena, FcmToken } = request.body;
  try {
    const pool = await getPool();

    // Verificar duplicado de teléfono
    const dupTel = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('Telefono', sql.VarChar(30), Telefono)
      .query(`SELECT idCliente FROM VIDA_APP_CLIENTES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND Telefono=@Telefono AND Status='ACTIVO'`);

    if (dupTel.recordset.length) {
      return reply.code(409).send({ error: 'El teléfono ya está registrado' });
    }

    // Verificar duplicado de email
    if (Email) {
      const dupEmail = await pool.request()
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta)
        .input('Email', sql.VarChar(100), Email)
        .query(`SELECT idCliente FROM VIDA_APP_CLIENTES
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                  AND Email=@Email AND Status='ACTIVO'`);

      if (dupEmail.recordset.length) {
        return reply.code(409).send({ error: 'El email ya está registrado' });
      }
    }


    const contrasenaHash = Contrasena ? await bcrypt.hash(Contrasena, 10) : null;
    const confirmToken   = crypto.randomBytes(32).toString('hex');
    const tokenExpira    = new Date(Date.now() + 24 * 60 * 60 * 1000); // +24h

    // id con MAX()+1: si otra alta concurrente toma el mismo, se reintenta
    const idCliente = await conIdUnico(async () => {
      const idCliente = await nextId(pool, 'VIDA_APP_CLIENTES', 'idCliente', idBranch, idCuenta);
      await pool.request()
        .input('idBranch',          sql.BigInt,      idBranch)
        .input('idCuenta',          sql.BigInt,      idCuenta)
        .input('idCliente',         sql.BigInt,      idCliente)
        .input('Nombre',            sql.VarChar(200), Nombre)
        .input('Apellidos',         sql.VarChar(200), Apellidos          || null)
        .input('Telefono',          sql.VarChar(30),  Telefono)
        .input('Email',             sql.VarChar(100), Email              || null)
        .input('FcmToken',          sql.VarChar(500), FcmToken           || null)
        .input('Contrasena',        sql.NVarChar(200), contrasenaHash    || null)
        .input('EmailConfirmado',   sql.Bit,           0)
        .input('TokenConfirmacion', sql.NVarChar(100), Email ? confirmToken : null)
        .input('TokenExpira',       sql.DateTime,      Email ? tokenExpira : null)
        .query(`INSERT INTO VIDA_APP_CLIENTES
                  (idBranch,idCuenta,idCliente,Nombre,Apellidos,Telefono,Email,FcmToken,
                   Contrasena,GoogleId,EmailConfirmado,TokenConfirmacion,TokenExpira)
                VALUES
                  (@idBranch,@idCuenta,@idCliente,@Nombre,@Apellidos,@Telefono,@Email,@FcmToken,
                   @Contrasena,NULL,@EmailConfirmado,@TokenConfirmacion,@TokenExpira)`);
      return idCliente;
    });

    // Enviar email de confirmación si hay email
    if (Email) {
      try {
        const transporter = createTransport({
          host:   process.env.EMAIL_HOST || 'smtp.gmail.com',
          port:   parseInt(process.env.EMAIL_PORT || '587'),
          secure: false,
          auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
          tls: { rejectUnauthorized: false },
        });

        const confirmUrl = `${resolverBaseUrl(request)}/api/delivery/cliente/confirmar-email?token=${confirmToken}`;
        const htmlEmail = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/></head>
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
            <h2 style="color:#0D1B2A;font-size:20px;margin:0 0 8px 0;">¡Hola, ${Nombre}!</h2>
            <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 24px 0;">
              Gracias por registrarte en VIDA. Confirma tu correo electrónico para activar tu cuenta.
            </p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${confirmUrl}"
                style="background:linear-gradient(135deg,#1A6A9A,#27AE60);color:#fff;text-decoration:none;
                       padding:14px 32px;border-radius:12px;font-size:15px;font-weight:700;display:inline-block;">
                Confirmar mi correo
              </a>
            </div>
            <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">
              Este enlace expira en 24 horas. Si no creaste esta cuenta, ignora este correo.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="color:#94a3b8;font-size:11px;margin:0;">VIDA · Correo automático, no respondas a este mensaje.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

        await transporter.sendMail({
          from:    `"VIDA" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
          to:      Email,
          subject: 'Confirma tu correo - VIDA',
          html:    htmlEmail,
        });
      } catch (emailErr) {
        // Silently ignore email errors — registration already succeeded
        request.log.warn({ err: emailErr }, 'No se pudo enviar email de confirmación');
      }
    }

    const token = request.server.jwt.sign(
      { idBranch, idCuenta, idCliente, rol: 'CLIENTE' },
      { expiresIn: '180d' }
    );

    return reply.code(201).send({ idCliente, token, emailPendiente: !!Email });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al registrar cliente' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — LOGIN
// POST /delivery/cliente/login
// ══════════════════════════════════════════════════════════════════════════
export async function loginCliente(request, reply) {
  const { idBranch, idCuenta, Telefono, Contrasena } = request.body;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt,    idBranch)
      .input('idCuenta', sql.BigInt,    idCuenta)
      .input('Telefono', sql.VarChar(30), Telefono)
      .query(`SELECT idCliente, Nombre, Apellidos, Email, FcmToken, Contrasena, EmailConfirmado
              FROM VIDA_APP_CLIENTES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND Telefono=@Telefono AND Status='ACTIVO'`);

    if (!r.recordset.length) {
      return reply.code(404).send({ error: 'Cliente no registrado' });
    }

    const cliente = r.recordset[0];

    if (cliente.Contrasena) {
      if (!Contrasena) {
        return reply.code(401).send({ error: 'Esta cuenta tiene contraseña. Ingrésala para continuar.' });
      }
      const ok = await bcrypt.compare(Contrasena, cliente.Contrasena);
      if (!ok) {
        return reply.code(401).send({ error: 'Contraseña incorrecta' });
      }
    }

    const token = request.server.jwt.sign(
      { idBranch, idCuenta, idCliente: cliente.idCliente, rol: 'CLIENTE' },
      { expiresIn: '180d' }
    );

    return reply.send({
      idCliente:      cliente.idCliente,
      Nombre:         cliente.Nombre,
      Apellidos:      cliente.Apellidos,
      Email:          cliente.Email,
      token,
      emailConfirmado: !!cliente.EmailConfirmado,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error en login de cliente' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — CONFIRMAR EMAIL
// GET /delivery/cliente/confirmar-email?token=...
// ══════════════════════════════════════════════════════════════════════════
export async function confirmarEmailCliente(request, reply) {
  const { token } = request.query;

  const htmlError = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Enlace inválido - VIDA</title></head>
<body style="margin:0;padding:0;background:#1A6A9A;font-family:Arial,sans-serif;
             display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="text-align:center;color:#fff;padding:40px 24px;max-width:400px;">
    <div style="font-size:60px;margin-bottom:16px;">⏰</div>
    <h1 style="font-size:24px;margin:0 0 12px 0;">Enlace no válido</h1>
    <p style="font-size:15px;opacity:0.85;line-height:1.6;margin:0;">
      El enlace no es válido o ya expiró. Inicia sesión en la app para solicitar uno nuevo.
    </p>
  </div>
</body></html>`;

  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('token', sql.NVarChar(100), token)
      .query(`SELECT idBranch, idCuenta, idCliente, Nombre
              FROM VIDA_APP_CLIENTES
              WHERE TokenConfirmacion=@token
                AND TokenExpira > GETUTCDATE()
                AND Status='ACTIVO'`);

    if (!r.recordset.length) {
      return reply.type('text/html').send(htmlError);
    }

    const { idBranch, idCuenta, idCliente, Nombre } = r.recordset[0];

    await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`UPDATE VIDA_APP_CLIENTES
              SET EmailConfirmado=1, TokenConfirmacion=NULL, TokenExpira=NULL
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);

    const htmlOk = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Email confirmado - VIDA</title>
<script>
  setTimeout(function() { window.location.href = 'vida-cliente://'; }, 1500);
</script>
</head>
<body style="margin:0;padding:0;background:#1A6A9A;font-family:Arial,sans-serif;
             display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="text-align:center;color:#fff;padding:40px 24px;max-width:400px;">
    <div style="font-size:64px;margin-bottom:16px;">✅</div>
    <h1 style="font-size:26px;font-weight:900;margin:0 0 12px 0;">¡Email confirmado!</h1>
    <p style="font-size:15px;opacity:0.85;line-height:1.6;margin:0 0 32px 0;">
      ¡Hola, ${Nombre}! Tu correo ha sido verificado exitosamente.<br/>
      Ya puedes usar todas las funciones de la app VIDA.
    </p>
    <a href="vida-cliente://"
       style="display:inline-block;background:#fff;color:#1A6A9A;text-decoration:none;
              padding:14px 32px;border-radius:12px;font-size:15px;font-weight:700;">
      Abrir la app VIDA
    </a>
  </div>
</body></html>`;

    return reply.type('text/html').send(htmlOk);
  } catch (err) {
    request.log.error(err);
    return reply.type('text/html').send(htmlError);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — ACTUALIZAR DATOS DE PERFIL
// PUT /delivery/cliente/perfil
// ══════════════════════════════════════════════════════════════════════════
export async function actualizarPerfilCliente(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const { Nombre, Apellidos, Telefono, Email } = request.body || {};
  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',  sql.BigInt,      idBranch)
      .input('idCuenta',  sql.BigInt,      idCuenta)
      .input('idCliente', sql.BigInt,      idCliente)
      .input('Nombre',    sql.VarChar(200), Nombre?.trim()    || null)
      .input('Apellidos', sql.VarChar(200), Apellidos?.trim() || null)
      .input('Telefono',  sql.VarChar(30),  Telefono?.trim()  || null)
      .input('Email',     sql.VarChar(100), Email?.trim()     || null)
      .query(`UPDATE VIDA_APP_CLIENTES SET
                Nombre    = COALESCE(@Nombre,    Nombre),
                Apellidos = COALESCE(@Apellidos, Apellidos),
                Telefono  = COALESCE(@Telefono,  Telefono),
                Email     = COALESCE(@Email,     Email)
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
    const r = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT Nombre, Apellidos, Telefono, Email, FotoURL FROM VIDA_APP_CLIENTES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
    return reply.send(r.recordset[0]);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al actualizar perfil' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — SUBIR FOTO DE PERFIL (multipart)
// POST /delivery/cliente/foto
// ══════════════════════════════════════════════════════════════════════════
export async function subirFotoCliente(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  try {
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No se recibió archivo' });
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(data.mimetype)) {
      return reply.code(400).send({ error: 'Solo JPG, PNG o WebP' });
    }
    const uploadDir = path.join(process.cwd(), 'uploads', 'fotos-cliente');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const ext = (data.filename?.split('.').pop() || 'jpg').toLowerCase();
    const filename = `cli_${idBranch}_${idCuenta}_${idCliente}.${ext}`;
    fs.writeFileSync(path.join(uploadDir, filename), await data.toBuffer());
    const fotoURL = `/uploads/fotos-cliente/${filename}`;
    const pool = await getPool();
    await pool.request()
      .input('idBranch',  sql.BigInt,      idBranch)
      .input('idCuenta',  sql.BigInt,      idCuenta)
      .input('idCliente', sql.BigInt,      idCliente)
      .input('FotoURL',   sql.VarChar(500), fotoURL)
      .query(`UPDATE VIDA_APP_CLIENTES SET FotoURL=@FotoURL
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
    return reply.send({ fotoURL });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al subir foto' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — CAMBIAR CONTRASEÑA
// PUT /delivery/cliente/password
// ══════════════════════════════════════════════════════════════════════════
export async function cambiarPasswordCliente(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const { actual, nueva } = request.body || {};
  if (!nueva || nueva.length < 6) {
    return reply.code(400).send({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT Contrasena FROM VIDA_APP_CLIENTES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
    const cliente = r.recordset[0];
    if (cliente?.Contrasena) {
      if (!actual) return reply.code(400).send({ error: 'Debes ingresar tu contraseña actual' });
      const ok = await bcrypt.compare(actual, cliente.Contrasena);
      if (!ok) return reply.code(401).send({ error: 'La contraseña actual es incorrecta' });
    }
    const hash = await bcrypt.hash(nueva, 10);
    await pool.request()
      .input('idBranch',   sql.BigInt,      idBranch)
      .input('idCuenta',   sql.BigInt,      idCuenta)
      .input('idCliente',  sql.BigInt,      idCliente)
      .input('Contrasena', sql.VarChar(200), hash)
      .query(`UPDATE VIDA_APP_CLIENTES SET Contrasena=@Contrasena
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
    return reply.send({ ok: true });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al cambiar contraseña' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — ELIMINAR CUENTA (soft delete)
// DELETE /delivery/cliente
// ══════════════════════════════════════════════════════════════════════════
export async function eliminarCuentaCliente(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`UPDATE VIDA_APP_CLIENTES SET Status='ELIMINADO'
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
    return reply.send({ ok: true });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al eliminar cuenta' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — ACTUALIZAR FCM TOKEN
// PUT /delivery/cliente/fcm
// ══════════════════════════════════════════════════════════════════════════
export async function actualizarFcmCliente(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const { FcmToken } = request.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',  sql.BigInt,    idBranch)
      .input('idCuenta',  sql.BigInt,    idCuenta)
      .input('idCliente', sql.BigInt,    idCliente)
      .input('FcmToken',  sql.VarChar(500), FcmToken)
      .query(`UPDATE VIDA_APP_CLIENTES SET FcmToken=@FcmToken
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
    return reply.send({ ok: true });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al actualizar FCM token' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — ACTUALIZAR FCM TOKEN
// PUT /delivery/repartidor/fcm
// ══════════════════════════════════════════════════════════════════════════
export async function actualizarFcmRepartidor(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  const { FcmToken } = request.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',     sql.BigInt,    idBranch)
      .input('idCuenta',     sql.BigInt,    idCuenta)
      .input('idRepartidor', sql.BigInt,    idRepartidor)
      .input('FcmToken',     sql.VarChar(500), FcmToken)
      .query(`UPDATE VIDA_REPARTIDORES SET FcmToken=@FcmToken
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);
    return reply.send({ ok: true });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al actualizar FCM token' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — DIRECCIONES GUARDADAS
// ══════════════════════════════════════════════════════════════════════════
export async function listarDireccionesCliente(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT idDireccion, Alias, Direccion, Latitud, Longitud, EsPrincipal
              FROM VIDA_APP_CLIENTES_DIRECCIONES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente
                AND Status='ACTIVO'
              ORDER BY EsPrincipal DESC, idDireccion DESC`);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener direcciones' });
  }
}

export async function guardarDireccionCliente(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const { Alias, Direccion, Latitud, Longitud, EsPrincipal = false } = request.body || {};

  if (!Direccion?.trim()) {
    return reply.code(400).send({ error: 'Direccion es requerida' });
  }
  const lat = parseFloat(Latitud), lon = parseFloat(Longitud);
  const coordsValidas = Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;

  try {
    const pool = await getPool();

    if (EsPrincipal) {
      await pool.request()
        .input('idBranch',  sql.BigInt, idBranch)
        .input('idCuenta',  sql.BigInt, idCuenta)
        .input('idCliente', sql.BigInt, idCliente)
        .query(`UPDATE VIDA_APP_CLIENTES_DIRECCIONES SET EsPrincipal=0
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
    }

    const idR = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT ISNULL(MAX(idDireccion),0)+1 AS next FROM VIDA_APP_CLIENTES_DIRECCIONES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
    const idDireccion = idR.recordset[0].next;

    await pool.request()
      .input('idBranch',    sql.BigInt,        idBranch)
      .input('idCuenta',    sql.BigInt,        idCuenta)
      .input('idCliente',   sql.BigInt,        idCliente)
      .input('idDireccion', sql.BigInt,        idDireccion)
      .input('Alias',       sql.VarChar(100),  Alias?.trim() || null)
      .input('Direccion',   sql.VarChar(500),  Direccion.trim())
      .input('Latitud',     sql.Decimal(10,7), coordsValidas ? lat : null)
      .input('Longitud',    sql.Decimal(10,7), coordsValidas ? lon : null)
      .input('EsPrincipal', sql.Bit,           EsPrincipal ? 1 : 0)
      .query(`INSERT INTO VIDA_APP_CLIENTES_DIRECCIONES
                (idBranch, idCuenta, idCliente, idDireccion, Alias, Direccion, Latitud, Longitud, EsPrincipal)
              VALUES
                (@idBranch, @idCuenta, @idCliente, @idDireccion, @Alias, @Direccion, @Latitud, @Longitud, @EsPrincipal)`);

    return reply.code(201).send({ idDireccion });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al guardar dirección' });
  }
}

export async function eliminarDireccionCliente(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const { idDireccion } = request.params;
  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',    sql.BigInt, idBranch)
      .input('idCuenta',    sql.BigInt, idCuenta)
      .input('idCliente',   sql.BigInt, idCliente)
      .input('idDireccion', sql.BigInt, idDireccion)
      .query(`UPDATE VIDA_APP_CLIENTES_DIRECCIONES SET Status='INACTIVO'
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND idCliente=@idCliente AND idDireccion=@idDireccion`);
    return reply.send({ ok: true });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al eliminar dirección' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — GOOGLE SIGN-IN NATIVO (APK, sin navegador ni túnel)
// POST /delivery/cliente/google/native  { idBranch, idCuenta, idToken }
// La app obtiene el idToken directo de Google Play Services y el backend
// lo verifica contra Google. No requiere callback URL ni URL pública.
// ══════════════════════════════════════════════════════════════════════════
export async function googleLoginNativo(request, reply) {
  const { idBranch = 1, idCuenta = 1, idToken } = request.body || {};
  if (!idToken) return reply.code(400).send({ error: 'idToken es requerido' });

  try {
    // Verificar el token con Google (firma, expiración y emisor)
    const vRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    const info = await vRes.json();
    if (!vRes.ok || info.error || info.error_description) {
      request.log.warn('[GoogleNative] token inválido: ' + JSON.stringify(info));
      return reply.code(401).send({ error: 'Token de Google inválido o expirado' });
    }

    // El token debe haber sido emitido para NUESTRA app (web client id)
    const audsValidas = [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_ANDROID_CLIENT_ID].filter(Boolean);
    if (!audsValidas.includes(info.aud)) {
      request.log.warn(`[GoogleNative] aud no reconocida: ${info.aud}`);
      return reply.code(401).send({ error: 'Token no emitido para esta aplicación' });
    }

    const googleId  = info.sub;
    const Email     = info.email || null;
    const Nombre    = info.given_name || info.name || 'Usuario';
    const Apellidos = info.family_name || '';
    const pool = await getPool();

    // Buscar por GoogleId → por Email → crear (mismo criterio que el flujo web)
    let row = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('googleId', sql.NVarChar(200), googleId)
      .query(`SELECT idCliente, Nombre FROM VIDA_APP_CLIENTES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND GoogleId=@googleId AND Status='ACTIVO'`);

    let idCliente, nombreFinal;

    if (row.recordset.length) {
      idCliente = row.recordset[0].idCliente;
      nombreFinal = row.recordset[0].Nombre;
    } else {
      if (Email) {
        row = await pool.request()
          .input('idBranch', sql.BigInt, idBranch)
          .input('idCuenta', sql.BigInt, idCuenta)
          .input('Email', sql.VarChar(100), Email)
          .query(`SELECT idCliente, Nombre FROM VIDA_APP_CLIENTES
                  WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Email=@Email AND Status='ACTIVO'`);
      }

      if (row.recordset.length) {
        idCliente = row.recordset[0].idCliente;
        nombreFinal = row.recordset[0].Nombre;
        await pool.request()
          .input('idBranch', sql.BigInt, idBranch)
          .input('idCuenta', sql.BigInt, idCuenta)
          .input('idCliente', sql.BigInt, idCliente)
          .input('googleId', sql.NVarChar(200), googleId)
          .query(`UPDATE VIDA_APP_CLIENTES SET GoogleId=@googleId, EmailConfirmado=1
                  WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
      } else {
        nombreFinal = Nombre;
        // id con MAX()+1: si otra alta concurrente toma el mismo, se reintenta
        idCliente = await conIdUnico(async () => {
          idCliente = await nextId(pool, 'VIDA_APP_CLIENTES', 'idCliente', idBranch, idCuenta);
          await pool.request()
            .input('idBranch', sql.BigInt, idBranch)
            .input('idCuenta', sql.BigInt, idCuenta)
            .input('idCliente', sql.BigInt, idCliente)
            .input('Nombre', sql.VarChar(200), Nombre)
            .input('Apellidos', sql.VarChar(200), Apellidos || null)
            .input('Email', sql.VarChar(100), Email)
            .input('GoogleId', sql.NVarChar(200), googleId)
            .query(`INSERT INTO VIDA_APP_CLIENTES
                      (idBranch,idCuenta,idCliente,Nombre,Apellidos,Telefono,Email,
                       Contrasena,GoogleId,EmailConfirmado)
                    VALUES
                      (@idBranch,@idCuenta,@idCliente,@Nombre,@Apellidos,NULL,@Email,
                       NULL,@GoogleId,1)`);
          return idCliente;
        });
      }
    }

    const token = request.server.jwt.sign(
      { idBranch, idCuenta, idCliente, rol: 'CLIENTE' },
      { expiresIn: '180d' }
    );

    return reply.send({ token, idCliente, Nombre: nombreFinal, Email });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error en login con Google' });
  }
}
