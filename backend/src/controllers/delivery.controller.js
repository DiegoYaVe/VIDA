// src/controllers/delivery.controller.js
import { getPool, sql } from '../db/sqlserver.js';
import { broadcast } from '../ws/ws.manager.js';
import { enviarPush } from '../services/push.service.js';
import { registrarAuditoria } from '../services/audit.service.js';
import { recalcularRuta, recalcularRutaThrottled, STATUS_ACTIVOS_REPARTIDOR } from '../services/rutas.service.js';
import { promocionesVigentes, mejorPromoUnitaria, calcularLinea } from './promociones.controller.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { createTransport } from 'nodemailer';

// URL pública del backend (API) para los links de confirmación de email.
// Se resuelve detectando el ambiente, para que en local apunte a localhost y en
// producción al dominio real sin cambiar código:
//   1) BASE_URL del .env      → si está, manda (override explícito por ambiente)
//   2) si NO es producción     → http://localhost:PORT (backend local)
//   3) en producción sin .env  → se deriva del propio request (proto + host,
//      respetando proxy/x-forwarded-*), que es el dominio por el que entró la app
function resolverBaseUrl(request) {
  const limpiar = (u) => (u || '').trim().replace(/\/+$/, '');
  if (process.env.BASE_URL) return limpiar(process.env.BASE_URL);
  const esProd = (process.env.NODE_ENV || 'development') === 'production';
  if (!esProd) return `http://localhost:${process.env.PORT || 3001}`;
  const proto = request?.headers['x-forwarded-proto'] || request?.protocol || 'https';
  const host  = request?.headers['x-forwarded-host']  || request?.headers?.host;
  return host ? `${proto}://${host}` : '';
}

// ── Helper ─────────────────────────────────────────────────────────────────
async function nextId(pool, tabla, campo, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}),0)+1 AS next
            FROM ${tabla}
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
  return r.recordset[0].next;
}

// Variante transaccional: UPDLOCK+HOLDLOCK serializa la obtención del ID
async function nextIdTx(transaction, tabla, campo, idBranch, idCuenta) {
  const r = await new sql.Request(transaction)
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}),0)+1 AS next
            FROM ${tabla} WITH (UPDLOCK, HOLDLOCK)
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
  return r.recordset[0].next;
}

async function getConfigVal(pool, idBranch, idCuenta, clave, defVal = null) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .input('clave', sql.VarChar(100), clave)
    .query(`SELECT Valor FROM VIDA_CONFIG_DELIVERY
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Clave=@clave`);
  return r.recordset.length ? r.recordset[0].Valor : defVal;
}

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

    const idCliente = await nextId(pool, 'VIDA_APP_CLIENTES', 'idCliente', idBranch, idCuenta);

    const contrasenaHash = Contrasena ? await bcrypt.hash(Contrasena, 10) : null;
    const confirmToken   = crypto.randomBytes(32).toString('hex');
    const tokenExpira    = new Date(Date.now() + 24 * 60 * 60 * 1000); // +24h

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
                AND TokenExpira > GETDATE()
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
// DATOS DE PAGO MÓVIL (públicos — la app los muestra en el checkout)
// GET /delivery/pago-movil?idBranch=1&idCuenta=1
// Se configuran desde el panel admin (claves PagoMovil* en config delivery)
// ══════════════════════════════════════════════════════════════════════════
export async function datosPagoMovil(request, reply) {
  const { idBranch, idCuenta } = request.query;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT Clave, Valor FROM VIDA_CONFIG_DELIVERY
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND Clave IN ('PagoMovilBanco','PagoMovilTelefono','PagoMovilCedula','PagoMovilTitular')`);

    const cfg = Object.fromEntries(r.recordset.map(x => [x.Clave, x.Valor]));
    return reply.send({
      Banco:    cfg.PagoMovilBanco    || null,
      Telefono: cfg.PagoMovilTelefono || null,
      Cedula:   cfg.PagoMovilCedula   || null,
      Titular:  cfg.PagoMovilTitular  || null,
      disponible: !!(cfg.PagoMovilBanco && cfg.PagoMovilTelefono),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener datos de Pago Móvil' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — SUBIR COMPROBANTE DE PAGO (multipart)
// POST /delivery/pedido/:idPedido/comprobante
// ══════════════════════════════════════════════════════════════════════════
export async function subirComprobanteCliente(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const { idPedido } = request.params;

  try {
    const pool = await getPool();

    // El pedido debe ser de este cliente
    const pedR = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idPedido',  sql.BigInt, idPedido)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT idPedido FROM VIDA_PEDIDOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND idPedido=@idPedido AND idCliente=@idCliente`);
    if (!pedR.recordset.length) {
      return reply.code(404).send({ error: 'Pedido no encontrado' });
    }

    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No se recibió el comprobante' });

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(data.mimetype)) {
      return reply.code(400).send({ error: 'Solo se permiten imágenes JPG, PNG o WebP' });
    }

    const referencia = (data.fields?.Referencia?.value || '').slice(0, 100) || null;

    const uploadDir = path.join(process.cwd(), 'uploads', 'comprobantes');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const ext = (data.filename.split('.').pop() || 'jpg').toLowerCase();
    const filename = `comp_${idBranch}_${idCuenta}_${idPedido}_${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(uploadDir, filename), await data.toBuffer());
    const urlImagen = `/uploads/comprobantes/${filename}`;

    const idR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT ISNULL(MAX(idComprobante),0)+1 AS next FROM VIDA_PEDIDOS_COMPROBANTES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
    const idComprobante = idR.recordset[0].next;

    await pool.request()
      .input('idBranch',      sql.BigInt,       idBranch)
      .input('idCuenta',      sql.BigInt,       idCuenta)
      .input('idComprobante', sql.BigInt,       idComprobante)
      .input('idPedido',      sql.BigInt,       idPedido)
      .input('ImagenURL',     sql.VarChar(500), urlImagen)
      .input('Referencia',    sql.VarChar(100), referencia)
      .input('UsuAlta',       sql.VarChar(20),  `CLI:${idCliente}`)
      .query(`INSERT INTO VIDA_PEDIDOS_COMPROBANTES
                (idBranch, idCuenta, idComprobante, idPedido, ImagenURL, Referencia, StatusRevision, UsuAlta)
              VALUES (@idBranch, @idCuenta, @idComprobante, @idPedido, @ImagenURL, @Referencia, 'PENDIENTE', @UsuAlta)`);

    return reply.code(201).send({ idComprobante, url: urlImagen });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al subir comprobante' });
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

// Token push del cliente de un pedido (para notificarle cambios de status)
async function tokenClientePedido(pool, idBranch, idCuenta, idCliente) {
  if (!idCliente) return null;
  const r = await pool.request()
    .input('idBranch',  sql.BigInt, idBranch)
    .input('idCuenta',  sql.BigInt, idCuenta)
    .input('idCliente', sql.BigInt, idCliente)
    .query(`SELECT FcmToken FROM VIDA_APP_CLIENTES
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
  return r.recordset[0]?.FcmToken || null;
}

// ══════════════════════════════════════════════════════════════════════════
// SUCURSALES ACTIVAS (sin auth)
// GET /delivery/sucursales?idBranch=1&idCuenta=1
// ══════════════════════════════════════════════════════════════════════════
export async function listarSucursales(request, reply) {
  const { idBranch, idCuenta } = request.query;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT idPuntoVenta, NomComercial,
                     CONCAT(ISNULL(Calle,''), ' ', ISNULL(NumExt,''), ' ',
                            ISNULL(Colonia,''), ' ', ISNULL(Ciudad,'')) AS Direccion,
                     Latitud, Longitud, Telefono
              FROM VIDA_CUENTA_PUNTOS_VENTA
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND Status='ACTIVO' AND StatusPuntoVenta='ACTIVO'
              ORDER BY NomComercial`);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener sucursales' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// PRODUCTOS PARA APP (sin auth / token cliente opcional)
// GET /delivery/productos?idBranch=1&idCuenta=1&idPuntoVenta=3&search=&idCategoria=
// ══════════════════════════════════════════════════════════════════════════
export async function listarProductosApp(request, reply) {
  const { idBranch, idCuenta, idPuntoVenta = '', search = '', idCategoria = '' } = request.query;
  try {
    const pool = await getPool();

    let whereExtra = '';
    if (search)       whereExtra += ` AND (p.Nombre LIKE @search OR p.Descripcion LIKE @search)`;
    if (idCategoria)  whereExtra += ` AND p.idCategoria = @idCategoria`;
    // Sin idPuntoVenta: feed global — una fila por (producto, sucursal con stock),
    // estilo Uber Eats. Con idPuntoVenta: catálogo de esa sucursal.
    if (idPuntoVenta) whereExtra += ` AND inv.idPuntoVenta = @idPuntoVenta`;

    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta);

    if (idPuntoVenta) req.input('idPuntoVenta', sql.BigInt,       idPuntoVenta);
    if (search)       req.input('search',       sql.VarChar(200), `%${search}%`);
    if (idCategoria)  req.input('idCategoria',  sql.BigInt,       idCategoria);

    const r = await req.query(`
      SELECT p.idProducto, p.Nombre, p.Descripcion, p.PrecioUSD, p.ImagenProducto,
             p.EsProductoPlus, p.idCategoria, c.Nombre AS NombreCategoria,
             inv.Cantidad AS StockDisponible,
             inv.idPuntoVenta,
             pv.NomComercial AS NombreSucursal, pv.Ciudad
      FROM VIDA_INVENTARIO_PRODUCTOS p
      INNER JOIN VIDA_INVENTARIO_STOCK inv
        ON inv.idBranch=p.idBranch AND inv.idCuenta=p.idCuenta
           AND inv.idProducto=p.idProducto AND inv.Cantidad > 0
      INNER JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch=inv.idBranch AND pv.idCuenta=inv.idCuenta
           AND pv.idPuntoVenta=inv.idPuntoVenta AND pv.Status='ACTIVO'
      LEFT JOIN VIDA_INVENTARIO_CATEGORIAS c
        ON c.idBranch=p.idBranch AND c.idCuenta=p.idCuenta AND c.idCategoria=p.idCategoria
      WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
        AND p.Status='ACTIVO'
        ${whereExtra}
      ORDER BY p.Nombre, pv.NomComercial
    `);

    // Adjuntar precio promocional (si hay promo vigente que aplique al producto)
    const promos = await promocionesVigentes(pool, idBranch, idCuenta);
    const productos = r.recordset.map(p => {
      const unit = mejorPromoUnitaria(promos, p);
      const combo = promos.find(x => x.Tipo === 'NXM' &&
        (x.Alcance === 'TODO'
         || (x.Alcance === 'PRODUCTO'  && String(x.idProducto)  === String(p.idProducto))
         || (x.Alcance === 'CATEGORIA' && String(x.idCategoria) === String(p.idCategoria))));
      return {
        ...p,
        PrecioPromo: unit ? unit.precioUnitario : null,
        PromoNombre: unit ? unit.promo.Nombre : (combo ? combo.Nombre : null),
        // Etiqueta corta para el badge de la app
        PromoBadge: combo ? `${parseInt(combo.Valor)}x${parseInt(combo.Valor2)}`
                    : (unit && unit.promo.Tipo === 'DESCUENTO_PCT' ? `-${parseInt(unit.promo.Valor)}%`
                    : (unit ? 'OFERTA' : null)),
      };
    });

    return reply.send(productos);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener productos' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CREAR PEDIDO DESDE APP
// POST /delivery/pedido
// ══════════════════════════════════════════════════════════════════════════
export async function crearPedidoApp(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const {
    idPuntoVenta, items, DireccionEntrega,
    UbicacionEntregaLat, UbicacionEntregaLon,
    NotasCliente, MetodoPago = 'EFECTIVO',
  } = request.body;

  if (!idPuntoVenta || !items?.length) {
    return reply.code(400).send({ error: 'idPuntoVenta e items son requeridos' });
  }
  for (const item of items) {
    const cant = parseFloat(item.Cantidad);
    if (!item.idProducto || !(cant > 0)) {
      return reply.code(400).send({ error: 'Cada item requiere idProducto y Cantidad mayor a 0' });
    }
  }

  try {
    const pool = await getPool();

    // ── Precios desde la BD: nunca confiar en el precio que manda la app ──
    const idsProductos = [...new Set(items.map(i => parseInt(i.idProducto)))];
    const preciosReq = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta);
    idsProductos.forEach((id, i) => preciosReq.input(`p${i}`, sql.BigInt, id));
    const preciosR = await preciosReq.query(`
      SELECT idProducto, PrecioUSD, idCategoria FROM VIDA_INVENTARIO_PRODUCTOS
      WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO'
        AND idProducto IN (${idsProductos.map((_, i) => `@p${i}`).join(',')})`);

    const prodPorId = new Map(preciosR.recordset.map(p => [String(p.idProducto), p]));
    for (const item of items) {
      if (!prodPorId.has(String(item.idProducto))) {
        return reply.code(400).send({ error: `Producto ${item.idProducto} no existe o está inactivo` });
      }
    }

    // ── Aplicar promociones vigentes (precio efectivo por línea) ──────────
    // El precio y el descuento salen del servidor; nunca se confía en la app.
    const promos = await promocionesVigentes(pool, idBranch, idCuenta);
    const itemsNorm = items.map(i => {
      const prod = prodPorId.get(String(i.idProducto));
      const cantidad = parseFloat(i.Cantidad);
      const linea = calcularLinea(promos, prod, cantidad);
      // Precio unitario efectivo = subtotal / cantidad (uniforme, para el detalle)
      const precioUnitEfectivo = cantidad > 0 ? linea.subtotal / cantidad : parseFloat(prod.PrecioUSD);
      return {
        idProducto: parseInt(i.idProducto),
        Cantidad: cantidad,
        PrecioUnitario: +precioUnitEfectivo.toFixed(4),
        Subtotal: linea.subtotal, // subtotal exacto (sin deriva de redondeo)
        idPromocion: linea.promoAplicada?.idPromocion ?? null,
      };
    });

    // ── Verificar stock de cada item ──────────────────────────────────────
    for (const item of itemsNorm) {
      const stockR = await pool.request()
        .input('idBranch',     sql.BigInt, idBranch)
        .input('idCuenta',     sql.BigInt, idCuenta)
        .input('idProducto',   sql.BigInt, item.idProducto)
        .input('idPuntoVenta', sql.BigInt, idPuntoVenta)
        .query(`SELECT ISNULL(Cantidad,0) AS Cantidad FROM VIDA_INVENTARIO_STOCK
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                  AND idProducto=@idProducto AND idPuntoVenta=@idPuntoVenta`);
      const stock = stockR.recordset[0]?.Cantidad ?? 0;
      if (stock < item.Cantidad) {
        return reply.code(409).send({
          error: `Stock insuficiente para producto ${item.idProducto}`,
          disponible: stock,
        });
      }
    }

    // ── Calcular total con los subtotales exactos (precios/promos de BD) ──
    const TotalUSD = +itemsNorm.reduce((acc, i) => acc + i.Subtotal, 0).toFixed(2);

    // ── Obtener nombre de sucursal para broadcast ─────────────────────────
    const pvR = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idPuntoVenta', sql.BigInt, idPuntoVenta)
      .query(`SELECT NomComercial, Latitud, Longitud
              FROM VIDA_CUENTA_PUNTOS_VENTA
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@idPuntoVenta`);
    const pv = pvR.recordset[0];

    // ── Insertar cabecera + detalles en una transacción ──────────────────
    // Si falla cualquier INSERT, no queda pedido a medias en la BD
    const transaction = new sql.Transaction(pool);
    let idPedido;
    try {
      await transaction.begin();

      idPedido = await nextIdTx(transaction, 'VIDA_PEDIDOS', 'idPedido', idBranch, idCuenta);

      await new sql.Request(transaction)
        .input('idBranch',            sql.BigInt,      idBranch)
        .input('idCuenta',            sql.BigInt,      idCuenta)
        .input('idPedido',            sql.BigInt,      idPedido)
        .input('idPuntoVenta',        sql.BigInt,      idPuntoVenta)
        .input('idCliente',           sql.BigInt,      idCliente)
        .input('Canal',               sql.VarChar(10), 'APP')
        .input('Status',              sql.VarChar(40), 'BUSCANDO_REPARTIDOR')
        .input('MetodoPago',          sql.VarChar(20), MetodoPago)
        .input('StatusPago',          sql.VarChar(20), 'PENDIENTE')
        .input('TotalUSD',            sql.Decimal(18,4), TotalUSD)
        .input('DireccionEntrega',    sql.VarChar(500), DireccionEntrega    || null)
        .input('UbicacionEntregaLat', sql.Decimal(10,7), UbicacionEntregaLat ?? null)
        .input('UbicacionEntregaLon', sql.Decimal(10,7), UbicacionEntregaLon ?? null)
        .input('NotasCliente',        sql.VarChar(500), NotasCliente        || null)
        .query(`INSERT INTO VIDA_PEDIDOS
                  (idBranch,idCuenta,idPedido,idPuntoVenta,idCliente,Canal,Status,
                   MetodoPago,StatusPago,TotalUSD,DireccionEntrega,
                   UbicacionEntregaLat,UbicacionEntregaLon,NotasCliente,FechaAlta)
                VALUES
                  (@idBranch,@idCuenta,@idPedido,@idPuntoVenta,@idCliente,@Canal,@Status,
                   @MetodoPago,@StatusPago,@TotalUSD,@DireccionEntrega,
                   @UbicacionEntregaLat,@UbicacionEntregaLon,@NotasCliente,GETDATE())`);

      let idDetalle = await nextIdTx(transaction, 'VIDA_PEDIDOS_DETALLE', 'idDetalle', idBranch, idCuenta);
      for (const item of itemsNorm) {
        await new sql.Request(transaction)
          .input('idBranch',       sql.BigInt,      idBranch)
          .input('idCuenta',       sql.BigInt,      idCuenta)
          .input('idPedido',       sql.BigInt,      idPedido)
          .input('idDetalle',      sql.BigInt,      idDetalle++)
          .input('idProducto',     sql.BigInt,      item.idProducto)
          .input('Cantidad',       sql.Decimal(18,4), item.Cantidad)
          .input('PrecioUnitario', sql.Decimal(18,4), item.PrecioUnitario)
          .query(`INSERT INTO VIDA_PEDIDOS_DETALLE
                    (idBranch,idCuenta,idPedido,idDetalle,idProducto,Cantidad,PrecioUnitario)
                  VALUES
                    (@idBranch,@idCuenta,@idPedido,@idDetalle,@idProducto,@Cantidad,@PrecioUnitario)`);
      }

      await transaction.commit();
    } catch (txErr) {
      try { await transaction.rollback(); } catch (rbErr) { request.log.error('Rollback falló: ' + rbErr.message); }
      throw txErr;
    }

    // Deadline de búsqueda: pasado este tiempo sin repartidor el job de
    // despacho cancela el pedido (el cliente puede extenderlo desde la app)
    const cancelMin = parseInt(await getConfigVal(pool, idBranch, idCuenta, 'TiempoCancelacionBusquedaMin', '25')) || 25;
    await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idPedido', sql.BigInt, idPedido)
      .input('min',      sql.Int,    cancelMin)
      .query(`UPDATE VIDA_PEDIDOS SET FechaLimiteBusqueda = DATEADD(MINUTE, @min, GETDATE())
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);

    // ── Buscar repartidores disponibles ───────────────────────────────────
    const radioKm = parseFloat(await getConfigVal(pool, idBranch, idCuenta, 'RadioBusquedaKm', '3'));
    const maxPedidosRep = parseInt(await getConfigVal(pool, idBranch, idCuenta, 'MaxPedidosPorRepartidor', '3')) || 3;
    // Multi-pedido: también se ofrece a repartidores OCUPADOS con cupo
    const filtroCupo = `
      AND ISNULL(r.StatusAprobacion,'APROBADO') NOT IN ('PENDIENTE','RECHAZADO')
      AND r.StatusRepartidor IN ('DISPONIBLE','OCUPADO')
      AND (SELECT COUNT(*) FROM VIDA_PEDIDOS pa
           WHERE pa.idBranch=r.idBranch AND pa.idCuenta=r.idCuenta
             AND pa.idRepartidor=r.idRepartidor
             AND pa.Status IN ('${STATUS_ACTIVOS_REPARTIDOR.join("','")}')) < @maxPedidos`;

    let repartidoresQuery;
    if (pv?.Latitud && pv?.Longitud) {
      repartidoresQuery = pool.request()
        .input('idBranch',     sql.BigInt,  idBranch)
        .input('idCuenta',     sql.BigInt,  idCuenta)
        .input('latSucursal',  sql.Float,   parseFloat(pv.Latitud))
        .input('lonSucursal',  sql.Float,   parseFloat(pv.Longitud))
        .input('radioKm',      sql.Float,   radioKm)
        .input('maxPedidos',   sql.Int,     maxPedidosRep)
        .query(`
          SELECT r.idRepartidor, r.Nombre, r.Telefono, r.FcmToken,
            CASE
              WHEN r.UltimaLatitud IS NULL OR r.UltimaLongitud IS NULL THEN NULL
              ELSE (6371 * ACOS(
                COS(RADIANS(@latSucursal)) * COS(RADIANS(r.UltimaLatitud)) *
                COS(RADIANS(r.UltimaLongitud) - RADIANS(@lonSucursal)) +
                SIN(RADIANS(@latSucursal)) * SIN(RADIANS(r.UltimaLatitud))
              ))
            END AS DistanciaKm
          FROM VIDA_REPARTIDORES r
          WHERE r.idBranch=@idBranch AND r.idCuenta=@idCuenta
            AND r.Status='ACTIVO'
            ${filtroCupo}
            AND (
              r.UltimaLatitud IS NULL OR r.UltimaLongitud IS NULL
              OR (6371 * ACOS(
                COS(RADIANS(@latSucursal)) * COS(RADIANS(r.UltimaLatitud)) *
                COS(RADIANS(r.UltimaLongitud) - RADIANS(@lonSucursal)) +
                SIN(RADIANS(@latSucursal)) * SIN(RADIANS(r.UltimaLatitud))
              )) <= @radioKm
            )
        `);
    } else {
      repartidoresQuery = pool.request()
        .input('idBranch',   sql.BigInt, idBranch)
        .input('idCuenta',   sql.BigInt, idCuenta)
        .input('maxPedidos', sql.Int,    maxPedidosRep)
        .query(`SELECT r.idRepartidor, r.Nombre, r.Telefono, r.FcmToken, NULL AS DistanciaKm
                FROM VIDA_REPARTIDORES r
                WHERE r.idBranch=@idBranch AND r.idCuenta=@idCuenta
                  AND r.Status='ACTIVO'
                  ${filtroCupo}`);
    }

    const repartidores = await repartidoresQuery;

    // ── Broadcast WS a repartidores disponibles ───────────────────────────
    broadcast(idBranch, idCuenta, {
      tipo:            'nuevo_pedido_disponible',
      idPedido,
      idPuntoVenta,
      NombreSucursal:  pv?.NomComercial ?? '',
      TotalUSD,
      DireccionEntrega,
      items,
      repartidores:    repartidores.recordset.map(r => r.idRepartidor),
    });

    // Push a repartidores disponibles — les llega aunque tengan la app
    // en background o el teléfono bloqueado (el WS solo funciona en foreground)
    enviarPush(
      repartidores.recordset.map(r => r.FcmToken),
      {
        title: '🛵 Nuevo pedido disponible',
        body: `${pv?.NomComercial ?? 'Sucursal'} — $${TotalUSD.toFixed(2)} · ${DireccionEntrega || 'ver dirección en la app'}`,
        data: { tipo: 'nuevo_pedido_disponible', idPedido },
      },
      request.log,
    );

    return reply.code(201).send({ idPedido, status: 'BUSCANDO_REPARTIDOR' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al crear pedido' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ESTADO DEL PEDIDO PARA EL CLIENTE
// GET /delivery/pedido/:idPedido/estado
// ══════════════════════════════════════════════════════════════════════════
export async function estadoPedidoCliente(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const { idPedido } = request.params;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idPedido',  sql.BigInt, idPedido)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`
        SELECT p.Status, p.MetodoPago, p.TotalUSD,
               p.DireccionEntrega, p.NotasCliente,
               p.UbicacionEntregaLat, p.UbicacionEntregaLon,
               p.ETAEntrega, p.OrdenRuta, p.DistanciaKm,
               CASE WHEN p.OrdenRuta IS NOT NULL AND p.OrdenRuta > 1
                    THEN p.OrdenRuta - 1 ELSE 0 END AS ParadasAntes,
               DATEDIFF(MINUTE, GETUTCDATE(), p.ETAEntrega) AS MinutosRestantes,
               p.FechaLimiteBusqueda, p.AvisoSinRepartidor,
               DATEDIFF(SECOND, GETDATE(), p.FechaLimiteBusqueda) AS SegundosBusquedaRestantes,
               rep.Nombre AS NombreRepartidor,
               rep.Telefono AS TelefonoRepartidor,
               rep.Vehiculo AS VehiculoRepartidor,
               rep.PlacaVehiculo AS PlacaRepartidor,
               rep.FotoURL AS FotoRepartidor,
               rep.Calificacion AS CalificacionRepartidor,
               rep.TotalCalificaciones AS TotalCalificacionesRepartidor,
               rep.UltimaLatitud AS LatRepartidor,
               rep.UltimaLongitud AS LonRepartidor,
               CASE WHEN EXISTS (
                 SELECT 1 FROM VIDA_REPARTIDORES_CALIFICACIONES c
                 WHERE c.idBranch=p.idBranch AND c.idCuenta=p.idCuenta AND c.idPedido=p.idPedido
               ) THEN 1 ELSE 0 END AS YaCalificado
        FROM VIDA_PEDIDOS p
        LEFT JOIN VIDA_REPARTIDORES rep
          ON rep.idBranch=p.idBranch AND rep.idCuenta=p.idCuenta AND rep.idRepartidor=p.idRepartidor
        WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
          AND p.idPedido=@idPedido AND p.idCliente=@idCliente
      `);

    if (!r.recordset.length) {
      return reply.code(404).send({ error: 'Pedido no encontrado' });
    }

    return reply.send(r.recordset[0]);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener estado del pedido' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — HISTORIAL DE PEDIDOS
// GET /delivery/cliente/pedidos
// ══════════════════════════════════════════════════════════════════════════
export async function historialPedidosCliente(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`
        SELECT TOP 50
          p.idPedido, p.Status, p.MetodoPago, p.TotalUSD,
          p.FechaAlta AS FechaCreacion, p.DireccionEntrega,
          (SELECT COUNT(*) FROM VIDA_PEDIDOS_DETALLE d
           WHERE d.idBranch=p.idBranch AND d.idCuenta=p.idCuenta AND d.idPedido=p.idPedido) AS TotalItems
        FROM VIDA_PEDIDOS p
        WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta AND p.idCliente=@idCliente
        ORDER BY p.FechaAlta DESC
      `);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener historial' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — LOGIN
// POST /delivery/repartidor/login
// ══════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — REGISTRO DESDE LA APP (queda pendiente de aprobación)
// POST /delivery/repartidor/registro
// ══════════════════════════════════════════════════════════════════════════
export async function registrarRepartidor(request, reply) {
  const { idBranch, idCuenta, Nombre, Telefono, Email, Vehiculo, PlacaVehiculo, Contrasena } = request.body || {};

  if (!Nombre?.trim() || !Telefono?.trim()) {
    return reply.code(400).send({ error: 'Nombre y teléfono son obligatorios' });
  }
  if (!Contrasena || Contrasena.length < 6) {
    return reply.code(400).send({ error: 'La contraseña es obligatoria (mínimo 6 caracteres)' });
  }

  try {
    const pool = await getPool();

    const dup = await pool.request()
      .input('idBranch', sql.BigInt,      idBranch)
      .input('idCuenta', sql.BigInt,      idCuenta)
      .input('Telefono', sql.VarChar(30), Telefono.trim())
      .query(`SELECT idRepartidor, StatusAprobacion FROM VIDA_REPARTIDORES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Telefono=@Telefono`);
    if (dup.recordset.length) {
      const status = dup.recordset[0].StatusAprobacion;
      return reply.code(409).send({
        error: status === 'PENDIENTE'
          ? 'Ya tienes una solicitud en revisión. Te avisaremos cuando sea aprobada.'
          : 'Este teléfono ya está registrado. Intenta iniciar sesión.',
      });
    }

    const contrasenaHash = await bcrypt.hash(Contrasena, 10);
    const idRepartidor = await nextId(pool, 'VIDA_REPARTIDORES', 'idRepartidor', idBranch, idCuenta);
    await pool.request()
      .input('idBranch',     sql.BigInt,       idBranch)
      .input('idCuenta',     sql.BigInt,       idCuenta)
      .input('idRepartidor', sql.BigInt,       idRepartidor)
      .input('Nombre',       sql.VarChar(200), Nombre.trim())
      .input('Telefono',     sql.VarChar(30),  Telefono.trim())
      .input('Email',        sql.VarChar(100), Email?.trim() || null)
      .input('Vehiculo',     sql.VarChar(100), Vehiculo?.trim() || null)
      .input('PlacaVehiculo',sql.VarChar(20),  PlacaVehiculo?.trim() || null)
      .input('Contrasena',   sql.NVarChar(200), contrasenaHash)
      .query(`INSERT INTO VIDA_REPARTIDORES
                (idBranch, idCuenta, idRepartidor, Nombre, Telefono, Email, Vehiculo, PlacaVehiculo, Contrasena, StatusAprobacion)
              VALUES
                (@idBranch, @idCuenta, @idRepartidor, @Nombre, @Telefono, @Email, @Vehiculo, @PlacaVehiculo, @Contrasena, 'PENDIENTE')`);

    return reply.code(201).send({
      idRepartidor,
      mensaje: 'Solicitud enviada. Te avisaremos cuando el administrador apruebe tu cuenta.',
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al registrar repartidor' });
  }
}

export async function loginRepartidor(request, reply) {
  const { idBranch, idCuenta, Telefono, Contrasena } = request.body;

  if (!Contrasena) {
    return reply.code(400).send({ error: 'Ingresa tu contraseña' });
  }

  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt,    idBranch)
      .input('idCuenta', sql.BigInt,    idCuenta)
      .input('Telefono', sql.VarChar(30), Telefono)
      .query(`SELECT TOP 1 idRepartidor, Nombre, StatusRepartidor, StatusAprobacion, Contrasena
              FROM VIDA_REPARTIDORES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND Telefono=@Telefono AND Status='ACTIVO'
              ORDER BY CASE WHEN Contrasena IS NOT NULL THEN 0 ELSE 1 END, idRepartidor`);

    if (!r.recordset.length) {
      return reply.code(404).send({ error: 'Repartidor no encontrado. ¿Ya te registraste?' });
    }

    const rep = r.recordset[0];

    if (rep.StatusAprobacion === 'PENDIENTE') {
      return reply.code(403).send({
        error: 'Tu solicitud está en revisión. Te avisaremos cuando sea aprobada.',
        codigo: 'PENDIENTE_APROBACION',
      });
    }
    if (rep.StatusAprobacion === 'RECHAZADO') {
      return reply.code(403).send({
        error: 'Tu solicitud fue rechazada. Contacta al administrador.',
        codigo: 'RECHAZADO',
      });
    }

    if (rep.Contrasena) {
      const ok = await bcrypt.compare(Contrasena, rep.Contrasena);
      if (!ok) {
        return reply.code(401).send({ error: 'Contraseña incorrecta' });
      }
    } else {
      // Cuenta creada antes de la migración 12: el primer login define la contraseña
      if (Contrasena.length < 6) {
        return reply.code(400).send({ error: 'La contraseña debe tener mínimo 6 caracteres' });
      }
      const hash = await bcrypt.hash(Contrasena, 10);
      await pool.request()
        .input('idBranch',     sql.BigInt,        idBranch)
        .input('idCuenta',     sql.BigInt,        idCuenta)
        .input('idRepartidor', sql.BigInt,        rep.idRepartidor)
        .input('Contrasena',   sql.NVarChar(200), hash)
        .query(`UPDATE VIDA_REPARTIDORES SET Contrasena=@Contrasena
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                  AND idRepartidor=@idRepartidor AND Contrasena IS NULL`);
    }

    const token = request.server.jwt.sign(
      { idBranch, idCuenta, idRepartidor: rep.idRepartidor, rol: 'REPARTIDOR' },
      { expiresIn: '180d' }
    );

    return reply.send({ idRepartidor: rep.idRepartidor, Nombre: rep.Nombre, token });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error en login de repartidor' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — TOGGLE DISPONIBLE
// POST /delivery/repartidor/disponible
// ══════════════════════════════════════════════════════════════════════════
export async function toggleDisponible(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  const { disponible, Latitud, Longitud } = request.body;

  const nuevoStatus = disponible ? 'DISPONIBLE' : 'INACTIVO';

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',      sql.BigInt,      idBranch)
      .input('idCuenta',      sql.BigInt,      idCuenta)
      .input('idRepartidor',  sql.BigInt,      idRepartidor)
      .input('status',        sql.VarChar(20), nuevoStatus)
      .input('lat',           sql.Decimal(10,7), Latitud  ?? null)
      .input('lon',           sql.Decimal(10,7), Longitud ?? null)
      .query(`UPDATE VIDA_REPARTIDORES
              SET StatusRepartidor=@status,
                  UltimaLatitud = COALESCE(@lat, UltimaLatitud),
                  UltimaLongitud = COALESCE(@lon, UltimaLongitud),
                  UltimaUbicacion = CASE WHEN @lat IS NOT NULL THEN GETDATE() ELSE UltimaUbicacion END
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);

    broadcast(idBranch, idCuenta, {
      tipo: 'repartidor_status',
      idRepartidor,
      status: nuevoStatus,
    });

    return reply.send({ ok: true, status: nuevoStatus });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al actualizar disponibilidad' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — ACTUALIZAR UBICACIÓN
// POST /delivery/repartidor/ubicacion
// ══════════════════════════════════════════════════════════════════════════
export async function actualizarUbicacion(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  const { Latitud, Longitud } = request.body;

  try {
    const pool = await getPool();

    await pool.request()
      .input('idBranch',     sql.BigInt,      idBranch)
      .input('idCuenta',     sql.BigInt,      idCuenta)
      .input('idRepartidor', sql.BigInt,      idRepartidor)
      .input('lat',          sql.Decimal(10,7), Latitud)
      .input('lon',          sql.Decimal(10,7), Longitud)
      .query(`UPDATE VIDA_REPARTIDORES
              SET UltimaLatitud=@lat, UltimaLongitud=@lon, UltimaUbicacion=GETDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);

    broadcast(idBranch, idCuenta, {
      tipo: 'repartidor_ubicacion',
      idRepartidor,
      Latitud,
      Longitud,
    });

    // Notificar a TODOS los clientes con pedido activo de este repartidor
    const pedidoR = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`SELECT idPedido, idCliente
              FROM VIDA_PEDIDOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND idRepartidor=@idRepartidor
                AND Status IN ('REPARTIDOR_ASIGNADO','IR_A_SUCURSAL','EN_SUCURSAL','EN_CAMINO')`);

    for (const { idPedido, idCliente } of pedidoR.recordset) {
      broadcast(idBranch, idCuenta, {
        tipo: 'ubicacion_repartidor',
        idPedido,
        idCliente,
        Latitud,
        Longitud,
      });
    }

    // Con el repartidor en movimiento los ETAs cambian — recalcular con throttle
    if (pedidoR.recordset.length) {
      recalcularRutaThrottled(idBranch, idCuenta, idRepartidor, request.log);
    }

    return reply.send({ ok: true });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al actualizar ubicación' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — ACEPTAR PEDIDO
// POST /delivery/repartidor/aceptar
// ══════════════════════════════════════════════════════════════════════════
export async function aceptarPedido(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  const { idPedido } = request.body;

  try {
    const pool = await getPool();

    // Verificar que el pedido esté en BUSCANDO_REPARTIDOR
    const pedR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idPedido', sql.BigInt, idPedido)
      .query(`SELECT idPedido, Status, idPuntoVenta, idCliente,
                     DireccionEntrega, UbicacionEntregaLat, UbicacionEntregaLon,
                     TotalUSD, MetodoPago
              FROM VIDA_PEDIDOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);

    if (!pedR.recordset.length) {
      return reply.code(404).send({ error: 'Pedido no encontrado' });
    }

    const pedido = pedR.recordset[0];
    if (pedido.Status !== 'BUSCANDO_REPARTIDOR') {
      return reply.code(409).send({ error: `Pedido ya no está disponible (status: ${pedido.Status})` });
    }

    // Límite de pedidos simultáneos por repartidor (config MaxPedidosPorRepartidor)
    const maxPedidos = parseInt(await getConfigVal(pool, idBranch, idCuenta, 'MaxPedidosPorRepartidor', '3')) || 3;
    const activosR = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`SELECT COUNT(*) AS activos FROM VIDA_PEDIDOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor
                AND Status IN ('${STATUS_ACTIVOS_REPARTIDOR.join("','")}')`);
    const activos = activosR.recordset[0].activos;
    if (activos >= maxPedidos) {
      return reply.code(409).send({
        error: `Ya llevas ${activos} pedidos activos (máximo ${maxPedidos}). Entrega alguno antes de aceptar otro.`,
        maxPedidos,
        activos,
      });
    }

    // Asignar repartidor de forma atómica: la condición Status='BUSCANDO_REPARTIDOR'
    // en el UPDATE garantiza que solo el primero de dos repartidores simultáneos gana
    const asignaR = await pool.request()
      .input('idBranch',     sql.BigInt,      idBranch)
      .input('idCuenta',     sql.BigInt,      idCuenta)
      .input('idPedido',     sql.BigInt,      idPedido)
      .input('idRepartidor', sql.BigInt,      idRepartidor)
      .query(`UPDATE VIDA_PEDIDOS
              SET idRepartidor=@idRepartidor, Status='REPARTIDOR_ASIGNADO', FechaMod=GETDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido
                AND Status='BUSCANDO_REPARTIDOR'`);

    if (asignaR.rowsAffected[0] === 0) {
      return reply.code(409).send({ error: 'Otro repartidor ya tomó este pedido' });
    }

    await pool.request()
      .input('idBranch',     sql.BigInt,      idBranch)
      .input('idCuenta',     sql.BigInt,      idCuenta)
      .input('idRepartidor', sql.BigInt,      idRepartidor)
      .query(`UPDATE VIDA_REPARTIDORES SET StatusRepartidor='OCUPADO'
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);

    // Obtener datos del repartidor
    const repR = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`SELECT Nombre, Telefono FROM VIDA_REPARTIDORES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);
    const rep = repR.recordset[0];

    // Obtener dirección de la sucursal
    const pvR = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idPuntoVenta', sql.BigInt, pedido.idPuntoVenta)
      .query(`SELECT NomComercial,
                     CONCAT(ISNULL(Calle,''), ' ', ISNULL(NumExt,''), ' ',
                            ISNULL(Colonia,''), ' ', ISNULL(Ciudad,'')) AS Direccion,
                     Latitud, Longitud, Telefono
              FROM VIDA_CUENTA_PUNTOS_VENTA
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@idPuntoVenta`);

    // Obtener items del pedido
    const itemsR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idPedido', sql.BigInt, idPedido)
      .query(`SELECT d.idProducto, p.Nombre, d.Cantidad, d.PrecioUnitario,
                     d.Cantidad * d.PrecioUnitario AS Subtotal
              FROM VIDA_PEDIDOS_DETALLE d
              LEFT JOIN VIDA_INVENTARIO_PRODUCTOS p
                ON p.idBranch=d.idBranch AND p.idCuenta=d.idCuenta AND p.idProducto=d.idProducto
              WHERE d.idBranch=@idBranch AND d.idCuenta=@idCuenta AND d.idPedido=@idPedido`);

    // Push al cliente: su pedido fue aceptado
    tokenClientePedido(pool, idBranch, idCuenta, pedido.idCliente)
      .then(token => token && enviarPush(token, {
        title: '✅ Pedido aceptado',
        body: `${rep?.Nombre || 'Un repartidor'} va por tu pedido #${idPedido}`,
        data: { tipo: 'status_pedido', idPedido, status: 'REPARTIDOR_ASIGNADO' },
      }, request.log))
      .catch(() => {});

    broadcast(idBranch, idCuenta, {
      tipo:             'pedido_asignado',
      idPedido,
      idRepartidor,
      NombreRepartidor: rep.Nombre,
      Telefono:         rep.Telefono,
    });

    // La ruta cambió: reordenar paradas y ETAs con el pedido nuevo incluido
    let ruta = null;
    try {
      ruta = await recalcularRuta(idBranch, idCuenta, idRepartidor, request.log);
    } catch (errRuta) {
      request.log.error('recalcularRuta al aceptar falló: ' + errRuta.message);
    }

    return reply.send({
      idPedido,
      status:           'REPARTIDOR_ASIGNADO',
      ruta,
      sucursal:         pvR.recordset[0],
      DireccionEntrega: pedido.DireccionEntrega,
      UbicacionEntregaLat: pedido.UbicacionEntregaLat,
      UbicacionEntregaLon: pedido.UbicacionEntregaLon,
      TotalUSD:         pedido.TotalUSD,
      MetodoPago:       pedido.MetodoPago,
      items:            itemsR.recordset,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al aceptar pedido' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — ACTUALIZAR STATUS DEL PEDIDO
// POST /delivery/repartidor/status-pedido
// ══════════════════════════════════════════════════════════════════════════
const TRANSICIONES_DELIVERY = {
  REPARTIDOR_ASIGNADO: ['IR_A_SUCURSAL', 'CANCELADO'],
  IR_A_SUCURSAL:       ['EN_SUCURSAL',   'CANCELADO'],
  EN_SUCURSAL:         ['EN_CAMINO',     'CANCELADO'],
  EN_CAMINO:           ['ENTREGADO',     'CANCELADO'],
};

export async function actualizarStatusPedido(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  const { idPedido, nuevoStatus } = request.body;

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  let enTransaccion = false;

  try {
    const pedR = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idPedido',     sql.BigInt, idPedido)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`SELECT p.Status, p.MetodoPago, p.TotalUSD, p.idPuntoVenta, p.idCliente, r.ComisionPct
              FROM VIDA_PEDIDOS p
              LEFT JOIN VIDA_REPARTIDORES r
                ON r.idBranch=p.idBranch AND r.idCuenta=p.idCuenta AND r.idRepartidor=p.idRepartidor
              WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
                AND p.idPedido=@idPedido AND p.idRepartidor=@idRepartidor`);

    if (!pedR.recordset.length) {
      return reply.code(404).send({ error: 'Pedido no encontrado o no asignado a este repartidor' });
    }

    const pedido = pedR.recordset[0];
    const statusActual = pedido.Status;
    const permitidos = TRANSICIONES_DELIVERY[statusActual] ?? [];

    if (!permitidos.includes(nuevoStatus)) {
      return reply.code(422).send({
        error: `Transición inválida: ${statusActual} → ${nuevoStatus}`,
        permitidos,
      });
    }

    // Comisión: del repartidor o de la config global (fuera de la transacción).
    // Se registra en TODA entrega; el efectivo a rendir solo aplica a EFECTIVO.
    const esEntrega = nuevoStatus === 'ENTREGADO';
    const esEntregaEfectivo = esEntrega && pedido.MetodoPago === 'EFECTIVO';
    let comision = 0, efectivoARendir = 0;
    if (esEntrega) {
      const pctComision = pedido.ComisionPct != null
        ? parseFloat(pedido.ComisionPct)
        : parseFloat(await getConfigVal(pool, idBranch, idCuenta, 'ComisionRepartidorPct', '0'));
      comision = parseFloat(pedido.TotalUSD) * pctComision / 100;
      if (esEntregaEfectivo) efectivoARendir = parseFloat(pedido.TotalUSD) - comision;
    }

    await transaction.begin();
    enTransaccion = true;

    // Actualizar pedido exigiendo el status leído: si otra petición (doble tap,
    // admin desde el panel) ya lo cambió, no se toca stock ni saldo dos veces
    const updReq = new sql.Request(transaction)
      .input('idBranch',     sql.BigInt,       idBranch)
      .input('idCuenta',     sql.BigInt,       idCuenta)
      .input('idPedido',     sql.BigInt,       idPedido)
      .input('nuevoStatus',  sql.VarChar(40),  nuevoStatus)
      .input('statusActual', sql.VarChar(40),  statusActual)
      .input('comision',     sql.Decimal(18,4), comision)
      .input('efectivo',     sql.Decimal(18,4), efectivoARendir);

    const setComision = esEntrega
      ? `, ComisionRepartidor=@comision${esEntregaEfectivo ? ', MontoEfectivoRepartidor=@efectivo' : ''}`
      : '';

    const updR = await updReq.query(`UPDATE VIDA_PEDIDOS
            SET Status=@nuevoStatus, FechaMod=GETDATE() ${setComision}
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido
              AND Status=@statusActual`);

    if (updR.rowsAffected[0] === 0) {
      await transaction.rollback();
      enTransaccion = false;
      return reply.code(409).send({ error: 'El pedido fue modificado por otra operación' });
    }

    if (nuevoStatus === 'ENTREGADO') {
      // Descontar inventario del pedido entregado (los pedidos APP no manejan
      // reserva: solo se descuenta Cantidad) + registrar movimiento
      const detR = await new sql.Request(transaction)
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta)
        .input('idPedido', sql.BigInt, idPedido)
        .query(`SELECT idProducto, Cantidad FROM VIDA_PEDIDOS_DETALLE
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);

      for (const item of detR.recordset) {
        const stockR = await new sql.Request(transaction)
          .input('idBranch',    sql.BigInt,       idBranch)
          .input('idCuenta',    sql.BigInt,       idCuenta)
          .input('idPuntoVenta',sql.BigInt,       pedido.idPuntoVenta)
          .input('idProducto',  sql.BigInt,       item.idProducto)
          .input('Cantidad',    sql.Decimal(18,4), parseFloat(item.Cantidad))
          .query(`UPDATE VIDA_INVENTARIO_STOCK WITH (UPDLOCK, HOLDLOCK) SET
                    Cantidad = CASE WHEN ISNULL(Cantidad,0) - @Cantidad < 0 THEN 0
                                    ELSE ISNULL(Cantidad,0) - @Cantidad END,
                    FechaMod = GETDATE()
                  OUTPUT ISNULL(deleted.Cantidad,0) AS CantidadAntes,
                         ISNULL(inserted.Cantidad,0) AS CantidadDespues
                  WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                    AND idPuntoVenta=@idPuntoVenta AND idProducto=@idProducto`);

        const s = stockR.recordset[0] || { CantidadAntes: 0, CantidadDespues: 0 };

        const movId = await nextIdTx(transaction, 'VIDA_INVENTARIO_MOVIMIENTOS', 'idMovimiento', idBranch, idCuenta);
        await new sql.Request(transaction)
          .input('idBranch',        sql.BigInt,       idBranch)
          .input('idCuenta',        sql.BigInt,       idCuenta)
          .input('idMovimiento',    sql.BigInt,       movId)
          .input('idPuntoVenta',    sql.BigInt,       pedido.idPuntoVenta)
          .input('idProducto',      sql.BigInt,       item.idProducto)
          .input('Cantidad',        sql.Decimal(18,4), parseFloat(item.Cantidad))
          .input('CantidadAntes',   sql.Decimal(18,4), parseFloat(s.CantidadAntes))
          .input('CantidadDespues', sql.Decimal(18,4), parseFloat(s.CantidadDespues))
          .input('Motivo',          sql.VarChar(300),  `Entrega delivery pedido #${idPedido}`)
          .input('Referencia',      sql.VarChar(100),  String(idPedido))
          .input('UsuAlta',         sql.VarChar(20),   `REP:${idRepartidor}`)
          .query(`INSERT INTO VIDA_INVENTARIO_MOVIMIENTOS
                    (idBranch, idCuenta, idMovimiento, idPuntoVenta, idProducto,
                     TipoMovimiento, Cantidad, CantidadAntes, CantidadDespues,
                     Motivo, Referencia, UsuAlta)
                  VALUES
                    (@idBranch, @idCuenta, @idMovimiento, @idPuntoVenta, @idProducto,
                     'SALIDA', @Cantidad, @CantidadAntes, @CantidadDespues,
                     @Motivo, @Referencia, @UsuAlta)`);
      }

      if (esEntregaEfectivo) {
        await new sql.Request(transaction)
          .input('idBranch',     sql.BigInt,       idBranch)
          .input('idCuenta',     sql.BigInt,       idCuenta)
          .input('idRepartidor', sql.BigInt,       idRepartidor)
          .input('efectivo',     sql.Decimal(18,4), efectivoARendir)
          .query(`UPDATE VIDA_REPARTIDORES
                  SET SaldoPendiente = ISNULL(SaldoPendiente,0) + @efectivo
                  WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);
      }
    }

    // Multi-pedido: el repartidor queda DISPONIBLE solo cuando ya no tiene
    // ningún pedido activo (puede llevar varios a la vez)
    if (nuevoStatus === 'ENTREGADO' || nuevoStatus === 'CANCELADO') {
      await new sql.Request(transaction)
        .input('idBranch',     sql.BigInt, idBranch)
        .input('idCuenta',     sql.BigInt, idCuenta)
        .input('idRepartidor', sql.BigInt, idRepartidor)
        .query(`UPDATE VIDA_REPARTIDORES SET StatusRepartidor='DISPONIBLE'
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor
                  AND NOT EXISTS (
                    SELECT 1 FROM VIDA_PEDIDOS p
                    WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
                      AND p.idRepartidor=@idRepartidor
                      AND p.Status IN ('${STATUS_ACTIVOS_REPARTIDOR.join("','")}'))`);
    }

    // Historial del pedido (el panel admin lo muestra como línea de tiempo)
    const histId = await nextIdTx(transaction, 'VIDA_PEDIDOS_HISTORIAL', 'idHistorial', idBranch, idCuenta);
    await new sql.Request(transaction)
      .input('idBranch',      sql.BigInt,      idBranch)
      .input('idCuenta',      sql.BigInt,      idCuenta)
      .input('idHistorial',   sql.BigInt,      histId)
      .input('idPedido',      sql.BigInt,      idPedido)
      .input('StatusAnterior',sql.VarChar(40), statusActual)
      .input('StatusNuevo',   sql.VarChar(40), nuevoStatus)
      .input('UsuAlta',       sql.VarChar(20), `REP:${idRepartidor}`)
      .query(`INSERT INTO VIDA_PEDIDOS_HISTORIAL
                (idBranch, idCuenta, idHistorial, idPedido, StatusAnterior, StatusNuevo, UsuAlta)
              VALUES (@idBranch, @idCuenta, @idHistorial, @idPedido, @StatusAnterior, @StatusNuevo, @UsuAlta)`);

    if (['ENTREGADO', 'CANCELADO'].includes(nuevoStatus)) {
      await registrarAuditoria(transaction, {
        idBranch, idCuenta,
        entityType: 'PEDIDO', entityId: idPedido,
        accion: nuevoStatus, actor: `REP:${idRepartidor}`,
        data: {
          StatusAnterior: statusActual, TotalUSD: parseFloat(pedido.TotalUSD),
          MetodoPago: pedido.MetodoPago,
          ...(esEntrega ? { ComisionRepartidor: comision } : {}),
          ...(esEntregaEfectivo ? { EfectivoARendir: efectivoARendir } : {}),
        },
      }, request.log);
    }

    await transaction.commit();
    enTransaccion = false;

    broadcast(idBranch, idCuenta, {
      tipo:       'pedido_status',
      idPedido,
      idRepartidor,
      nuevoStatus,
    });

    // Cada transición cambia la ruta (se recogió, se entregó, se canceló):
    // reordenar paradas y ETAs de los pedidos que le quedan al repartidor
    recalcularRuta(idBranch, idCuenta, idRepartidor, request.log)
      .catch(errRuta => request.log.error('recalcularRuta post-status falló: ' + errRuta.message));

    // Push al cliente en los hitos que le importan
    const MENSAJES_CLIENTE = {
      EN_CAMINO: { title: '🛵 Tu pedido va en camino', body: `El repartidor salió con tu pedido #${idPedido}` },
      ENTREGADO: { title: '📦 Pedido entregado', body: `Tu pedido #${idPedido} fue entregado. ¡Gracias por tu compra!` },
      CANCELADO: { title: '❌ Pedido cancelado', body: `Tu pedido #${idPedido} fue cancelado` },
    };
    if (MENSAJES_CLIENTE[nuevoStatus]) {
      tokenClientePedido(pool, idBranch, idCuenta, pedido.idCliente)
        .then(token => token && enviarPush(token, {
          ...MENSAJES_CLIENTE[nuevoStatus],
          data: { tipo: 'status_pedido', idPedido, status: nuevoStatus },
        }, request.log))
        .catch(() => {});
    }

    return reply.send({ ok: true, nuevoStatus });
  } catch (err) {
    if (enTransaccion) {
      try { await transaction.rollback(); } catch (rbErr) { request.log.error('Rollback falló: ' + rbErr.message); }
    }
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al actualizar status del pedido' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — SUBIR EVIDENCIA DE ENTREGA (foto, multipart)
// POST /delivery/repartidor/pedido/:idPedido/evidencia
// ══════════════════════════════════════════════════════════════════════════
export async function subirEvidenciaEntrega(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  const { idPedido } = request.params;

  try {
    const pool = await getPool();

    // El pedido debe estar asignado a este repartidor
    const pedR = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idPedido',     sql.BigInt, idPedido)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`SELECT idPedido FROM VIDA_PEDIDOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND idPedido=@idPedido AND idRepartidor=@idRepartidor`);
    if (!pedR.recordset.length) {
      return reply.code(404).send({ error: 'Pedido no encontrado o no asignado' });
    }

    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No se recibió la foto' });

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(data.mimetype)) {
      return reply.code(400).send({ error: 'Solo se permiten imágenes JPG, PNG o WebP' });
    }

    const uploadDir = path.join(process.cwd(), 'uploads', 'evidencias');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const ext = (data.filename.split('.').pop() || 'jpg').toLowerCase();
    const filename = `entrega_${idBranch}_${idCuenta}_${idPedido}_${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(uploadDir, filename), await data.toBuffer());
    const url = `/uploads/evidencias/${filename}`;

    await pool.request()
      .input('idBranch', sql.BigInt,       idBranch)
      .input('idCuenta', sql.BigInt,       idCuenta)
      .input('idPedido', sql.BigInt,       idPedido)
      .input('url',      sql.VarChar(300), url)
      .query(`UPDATE VIDA_PEDIDOS SET EvidenciaEntregaURL=@url, FechaMod=GETDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);

    return reply.code(201).send({ url });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al subir evidencia' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — PEDIDOS ACTIVOS
// GET /delivery/repartidor/pedidos-activos
// ══════════════════════════════════════════════════════════════════════════
export async function pedidosActivos(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`
        SELECT p.idPedido, p.Status, p.MetodoPago, p.TotalUSD,
               p.DireccionEntrega, p.UbicacionEntregaLat, p.UbicacionEntregaLon,
               p.NotasCliente, p.FechaAlta, p.idPuntoVenta,
               p.OrdenRuta, p.DistanciaKm, p.ETAEntrega,
               DATEDIFF(MINUTE, GETUTCDATE(), p.ETAEntrega) AS MinutosRestantes,
               c.Nombre AS NombreCliente, c.Telefono AS TelefonoCliente,
               pv.NomComercial AS NombreSucursal,
               CONCAT(ISNULL(pv.Calle,''), ' ', ISNULL(pv.NumExt,''), ' ',
                      ISNULL(pv.Colonia,''), ' ', ISNULL(pv.Ciudad,'')) AS DireccionSucursal,
               pv.Latitud AS LatSucursal, pv.Longitud AS LonSucursal
        FROM VIDA_PEDIDOS p
        LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv
          ON pv.idBranch=p.idBranch AND pv.idCuenta=p.idCuenta AND pv.idPuntoVenta=p.idPuntoVenta
        LEFT JOIN VIDA_APP_CLIENTES c
          ON c.idBranch=p.idBranch AND c.idCuenta=p.idCuenta AND c.idCliente=p.idCliente
        WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
          AND p.idRepartidor=@idRepartidor
          AND p.Status NOT IN ('ENTREGADO','CANCELADO')
        ORDER BY ISNULL(p.OrdenRuta, 999), p.FechaAlta ASC
      `);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener pedidos activos' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — PEDIDOS DISPONIBLES (BUSCANDO_REPARTIDOR)
// GET /delivery/repartidor/pedidos-disponibles
// ══════════════════════════════════════════════════════════════════════════
export async function pedidosDisponibles(request, reply) {
  const { idBranch, idCuenta } = request.repartidor;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`
        SELECT p.idPedido, p.Status, p.MetodoPago, p.TotalUSD,
               p.DireccionEntrega, p.UbicacionEntregaLat, p.UbicacionEntregaLon,
               p.NotasCliente, p.FechaAlta,
               pv.NomComercial AS NombreSucursal,
               pv.Latitud AS LatSucursal, pv.Longitud AS LonSucursal,
               (SELECT COUNT(*) FROM VIDA_PEDIDOS_DETALLE d
                WHERE d.idBranch=p.idBranch AND d.idCuenta=p.idCuenta AND d.idPedido=p.idPedido) AS TotalItems
        FROM VIDA_PEDIDOS p
        LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv
          ON pv.idBranch=p.idBranch AND pv.idCuenta=p.idCuenta AND pv.idPuntoVenta=p.idPuntoVenta
        WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
          AND p.Status='BUSCANDO_REPARTIDOR'
        ORDER BY p.FechaAlta ASC
      `);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener pedidos disponibles' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — HISTORIAL PAGINADO
// GET /delivery/repartidor/historial?page=1&limit=20
// ══════════════════════════════════════════════════════════════════════════
export async function historialRepartidor(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  const { page = 1, limit = 20 } = request.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .input('offset',       sql.Int,    offset)
      .input('limit',        sql.Int,    parseInt(limit))
      .query(`
        SELECT idPedido, Status, MetodoPago, TotalUSD,
               ComisionRepartidor, MontoEfectivoRepartidor,
               DireccionEntrega, FechaAlta
        FROM VIDA_PEDIDOS
        WHERE idBranch=@idBranch AND idCuenta=@idCuenta
          AND idRepartidor=@idRepartidor AND Status='ENTREGADO'
        ORDER BY FechaAlta DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    const totalR = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`SELECT COUNT(*) AS total FROM VIDA_PEDIDOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND idRepartidor=@idRepartidor AND Status='ENTREGADO'`);

    return reply.send({
      data:  r.recordset,
      total: totalR.recordset[0].total,
      page:  parseInt(page),
      pages: Math.ceil(totalR.recordset[0].total / parseInt(limit)),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener historial' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — SUBIR FOTO DE PERFIL (multipart)
// POST /delivery/repartidor/foto
// ══════════════════════════════════════════════════════════════════════════
export async function subirFotoRepartidor(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  try {
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No se recibió archivo' });
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(data.mimetype)) {
      return reply.code(400).send({ error: 'Solo se permiten imágenes JPG, PNG o WebP' });
    }
    const uploadDir = path.join(process.cwd(), 'uploads', 'fotos-repartidor');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const ext = (data.filename?.split('.').pop() || 'jpg').toLowerCase();
    const filename = `rep_${idBranch}_${idCuenta}_${idRepartidor}.${ext}`;
    fs.writeFileSync(path.join(uploadDir, filename), await data.toBuffer());
    const fotoURL = `/uploads/fotos-repartidor/${filename}`;
    const pool = await getPool();
    await pool.request()
      .input('idBranch',     sql.BigInt,      idBranch)
      .input('idCuenta',     sql.BigInt,      idCuenta)
      .input('idRepartidor', sql.BigInt,      idRepartidor)
      .input('FotoURL',      sql.VarChar(500), fotoURL)
      .query(`UPDATE VIDA_REPARTIDORES SET FotoURL=@FotoURL
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);
    return reply.send({ fotoURL });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al subir foto' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — ACTUALIZAR DATOS DE PERFIL
// PUT /delivery/repartidor/perfil
// ══════════════════════════════════════════════════════════════════════════
export async function actualizarPerfilRepartidor(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  const { Nombre, Telefono, Vehiculo, PlacaVehiculo } = request.body || {};
  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',      sql.BigInt,      idBranch)
      .input('idCuenta',      sql.BigInt,      idCuenta)
      .input('idRepartidor',  sql.BigInt,      idRepartidor)
      .input('Nombre',        sql.VarChar(200), Nombre?.trim()        || null)
      .input('Telefono',      sql.VarChar(30),  Telefono?.trim()      || null)
      .input('Vehiculo',      sql.VarChar(100), Vehiculo?.trim()      || null)
      .input('PlacaVehiculo', sql.VarChar(20),  PlacaVehiculo?.trim() || null)
      .query(`UPDATE VIDA_REPARTIDORES SET
                Nombre        = COALESCE(@Nombre,        Nombre),
                Telefono      = COALESCE(@Telefono,      Telefono),
                Vehiculo      = COALESCE(@Vehiculo,      Vehiculo),
                PlacaVehiculo = COALESCE(@PlacaVehiculo, PlacaVehiculo)
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);

    // Devolver los datos actualizados
    const r = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`SELECT Nombre, Telefono, Vehiculo, PlacaVehiculo, FotoURL,
                     Calificacion, TotalCalificaciones, SaldoPendiente, ComisionPct
              FROM VIDA_REPARTIDORES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);

    return reply.send(r.recordset[0]);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al actualizar perfil' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — PERFIL COMPLETO CON ESTADÍSTICAS
// GET /delivery/repartidor/perfil
// ══════════════════════════════════════════════════════════════════════════
export async function perfilRepartidorApp(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`
        SELECT r.Nombre, r.Telefono, r.Email, r.Vehiculo, r.PlacaVehiculo,
               r.FotoURL, r.Calificacion, r.TotalCalificaciones,
               r.SaldoPendiente, r.ComisionPct,
               (SELECT COUNT(*) FROM VIDA_PEDIDOS p
                WHERE p.idBranch=r.idBranch AND p.idCuenta=r.idCuenta
                  AND p.idRepartidor=r.idRepartidor AND p.Status='ENTREGADO') AS TotalPedidosEntregados
        FROM VIDA_REPARTIDORES r
        WHERE r.idBranch=@idBranch AND r.idCuenta=@idCuenta AND r.idRepartidor=@idRepartidor
      `);
    if (!r.recordset.length) return reply.code(404).send({ error: 'Repartidor no encontrado' });
    return reply.send(r.recordset[0]);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener perfil' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — CALIFICAR REPARTIDOR
// POST /delivery/pedido/:idPedido/calificar
// ══════════════════════════════════════════════════════════════════════════
export async function calificarRepartidor(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const { idPedido } = request.params;
  const { Estrellas, Comentario } = request.body || {};
  if (!Estrellas || Estrellas < 1 || Estrellas > 5) {
    return reply.code(400).send({ error: 'Estrellas debe ser entre 1 y 5' });
  }
  try {
    const pool = await getPool();
    const pedR = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idPedido',  sql.BigInt, idPedido)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT idRepartidor, Status FROM VIDA_PEDIDOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND idPedido=@idPedido AND idCliente=@idCliente`);
    if (!pedR.recordset.length) return reply.code(404).send({ error: 'Pedido no encontrado' });
    const pedido = pedR.recordset[0];
    if (pedido.Status !== 'ENTREGADO') return reply.code(400).send({ error: 'El pedido aún no fue entregado' });
    if (!pedido.idRepartidor) return reply.code(400).send({ error: 'No hay repartidor asignado' });

    // MERGE: inserta o actualiza la calificación del pedido
    await pool.request()
      .input('idBranch',     sql.BigInt,      idBranch)
      .input('idCuenta',     sql.BigInt,      idCuenta)
      .input('idRepartidor', sql.BigInt,      pedido.idRepartidor)
      .input('idPedido',     sql.BigInt,      idPedido)
      .input('idCliente',    sql.BigInt,      idCliente)
      .input('Estrellas',    sql.TinyInt,     Estrellas)
      .input('Comentario',   sql.VarChar(500), Comentario?.trim() || null)
      .query(`
        MERGE VIDA_REPARTIDORES_CALIFICACIONES AS t
        USING (SELECT @idBranch AS idBranch, @idCuenta AS idCuenta, @idPedido AS idPedido) AS s
          ON t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.idPedido=s.idPedido
        WHEN MATCHED THEN
          UPDATE SET Estrellas=@Estrellas, Comentario=@Comentario
        WHEN NOT MATCHED THEN
          INSERT (idBranch,idCuenta,idRepartidor,idPedido,idCliente,Estrellas,Comentario)
          VALUES (@idBranch,@idCuenta,@idRepartidor,@idPedido,@idCliente,@Estrellas,@Comentario);
      `);

    // Recalcular promedio en VIDA_REPARTIDORES
    await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, pedido.idRepartidor)
      .query(`
        UPDATE VIDA_REPARTIDORES
        SET Calificacion = (
              SELECT AVG(CAST(Estrellas AS DECIMAL(3,2)))
              FROM VIDA_REPARTIDORES_CALIFICACIONES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor),
            TotalCalificaciones = (
              SELECT COUNT(*) FROM VIDA_REPARTIDORES_CALIFICACIONES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor)
        WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor
      `);

    return reply.send({ ok: true });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al calificar' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — LISTAR REPARTIDORES
// GET /delivery/admin/repartidores
// ══════════════════════════════════════════════════════════════════════════
export async function listarRepartidores(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT idRepartidor, Nombre, Telefono, Vehiculo, PlacaVehiculo,
                     ComisionPct, SaldoPendiente, StatusRepartidor, Status,
                     UltimaLatitud, UltimaLongitud, UltimaUbicacion, FechaAlta
              FROM VIDA_REPARTIDORES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
              ORDER BY Nombre`);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al listar repartidores' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — CREAR REPARTIDOR
// POST /delivery/admin/repartidores
// ══════════════════════════════════════════════════════════════════════════
export async function crearRepartidor(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { Nombre, Telefono, Vehiculo, PlacaVehiculo, ComisionPct } = request.body;

  try {
    const pool = await getPool();

    // Evitar duplicar un repartidor con el mismo teléfono (causa ambigüedad al
    // iniciar sesión y al asignar pedidos).
    if (Telefono?.trim()) {
      const dup = await pool.request()
        .input('idBranch', sql.BigInt, idBranch)
        .input('idCuenta', sql.BigInt, idCuenta)
        .input('Telefono', sql.VarChar(30), Telefono.trim())
        .query(`SELECT TOP 1 idRepartidor FROM VIDA_REPARTIDORES
                WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Telefono=@Telefono AND Status='ACTIVO'`);
      if (dup.recordset.length)
        return reply.code(409).send({ error: 'Ya existe un repartidor activo con ese teléfono' });
    }

    const idRepartidor = await nextId(pool, 'VIDA_REPARTIDORES', 'idRepartidor', idBranch, idCuenta);

    await pool.request()
      .input('idBranch',     sql.BigInt,     idBranch)
      .input('idCuenta',     sql.BigInt,     idCuenta)
      .input('idRepartidor', sql.BigInt,     idRepartidor)
      .input('Nombre',       sql.VarChar(200), Nombre)
      .input('Telefono',     sql.VarChar(30),  Telefono     || null)
      .input('Vehiculo',     sql.VarChar(100), Vehiculo     || null)
      .input('PlacaVehiculo',sql.VarChar(20),  PlacaVehiculo|| null)
      .input('ComisionPct',  sql.Decimal(5,2), ComisionPct  ?? null)
      .query(`INSERT INTO VIDA_REPARTIDORES
                (idBranch,idCuenta,idRepartidor,Nombre,Telefono,Vehiculo,PlacaVehiculo,ComisionPct)
              VALUES
                (@idBranch,@idCuenta,@idRepartidor,@Nombre,@Telefono,@Vehiculo,@PlacaVehiculo,@ComisionPct)`);

    return reply.code(201).send({ idRepartidor });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al crear repartidor' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — EDITAR REPARTIDOR
// PUT /delivery/admin/repartidores/:id
// ══════════════════════════════════════════════════════════════════════════
export async function editarRepartidor(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { id } = request.params;
  const { Nombre, Telefono, Vehiculo, PlacaVehiculo, ComisionPct, Status } = request.body;

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',     sql.BigInt,      idBranch)
      .input('idCuenta',     sql.BigInt,      idCuenta)
      .input('idRepartidor', sql.BigInt,      id)
      .input('Nombre',       sql.VarChar(200), Nombre        || null)
      .input('Telefono',     sql.VarChar(30),  Telefono      || null)
      .input('Vehiculo',     sql.VarChar(100), Vehiculo      || null)
      .input('PlacaVehiculo',sql.VarChar(20),  PlacaVehiculo || null)
      .input('ComisionPct',  sql.Decimal(5,2), ComisionPct   ?? null)
      .input('Status',       sql.VarChar(20),  Status        || null)
      .query(`UPDATE VIDA_REPARTIDORES SET
                Nombre        = COALESCE(@Nombre,        Nombre),
                Telefono      = COALESCE(@Telefono,      Telefono),
                Vehiculo      = COALESCE(@Vehiculo,      Vehiculo),
                PlacaVehiculo = COALESCE(@PlacaVehiculo, PlacaVehiculo),
                ComisionPct   = COALESCE(@ComisionPct,   ComisionPct),
                Status        = COALESCE(@Status,        Status)
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);

    return reply.send({ ok: true });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al editar repartidor' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — CAMBIAR/RESETEAR CONTRASEÑA DE UN REPARTIDOR
// PATCH /delivery/admin/repartidores/:id/contrasena  { Contrasena }
// ══════════════════════════════════════════════════════════════════════════
export async function resetContrasenaRepartidor(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { id } = request.params;
  const { Contrasena } = request.body || {};

  if (!Contrasena || Contrasena.length < 6)
    return reply.code(400).send({ error: 'La contraseña debe tener mínimo 6 caracteres' });

  try {
    const pool = await getPool();
    const hash = await bcrypt.hash(Contrasena, 10);
    const r = await pool.request()
      .input('idBranch',     sql.BigInt,        idBranch)
      .input('idCuenta',     sql.BigInt,        idCuenta)
      .input('idRepartidor', sql.BigInt,        id)
      .input('Contrasena',   sql.NVarChar(200), hash)
      .query(`UPDATE VIDA_REPARTIDORES SET Contrasena=@Contrasena
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);

    if (r.rowsAffected[0] === 0)
      return reply.code(404).send({ error: 'Repartidor no encontrado' });

    return reply.send({ message: 'Contraseña actualizada' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al cambiar la contraseña' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — LIQUIDAR REPARTIDOR
// POST /delivery/admin/liquidar/:idRepartidor
// ══════════════════════════════════════════════════════════════════════════
export async function liquidarRepartidor(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idRepartidor } = request.params;
  const { Observaciones } = request.body ?? {};

  try {
    const pool = await getPool();

    // Obtener saldo pendiente y contar pedidos a liquidar
    const repR = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`SELECT SaldoPendiente FROM VIDA_REPARTIDORES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);

    if (!repR.recordset.length) {
      return reply.code(404).send({ error: 'Repartidor no encontrado' });
    }

    const saldo = parseFloat(repR.recordset[0].SaldoPendiente);

    // Calcular totales de pedidos entregados no liquidados
    const pedR = await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`SELECT
                COUNT(*) AS NumPedidos,
                ISNULL(SUM(MontoEfectivoRepartidor),0) AS MontoEfectivo,
                ISNULL(SUM(ComisionRepartidor),0) AS Comision
              FROM VIDA_PEDIDOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND idRepartidor=@idRepartidor
                AND Status='ENTREGADO'
                AND MetodoPago='EFECTIVO'
                AND (MontoEfectivoRepartidor IS NOT NULL)`);

    const stats = pedR.recordset[0];

    const idLiquidacion = await nextId(
      pool, 'VIDA_REPARTIDOR_LIQUIDACIONES', 'idLiquidacion', idBranch, idCuenta
    );

    await pool.request()
      .input('idBranch',        sql.BigInt,      idBranch)
      .input('idCuenta',        sql.BigInt,      idCuenta)
      .input('idLiquidacion',   sql.BigInt,      idLiquidacion)
      .input('idRepartidor',    sql.BigInt,      idRepartidor)
      .input('MontoEfectivo',   sql.Decimal(18,4), stats.MontoEfectivo)
      .input('Comision',        sql.Decimal(18,4), stats.Comision)
      .input('MontoALiquidar',  sql.Decimal(18,4), saldo)
      .input('NumPedidos',      sql.Int,           stats.NumPedidos)
      .input('Observaciones',   sql.VarChar(500),  Observaciones || null)
      .input('idUsuarioLiquida',sql.BigInt,        idUsuario)
      .input('Status',          sql.VarChar(20),   'LIQUIDADO')
      .query(`INSERT INTO VIDA_REPARTIDOR_LIQUIDACIONES
                (idBranch,idCuenta,idLiquidacion,idRepartidor,
                 MontoEfectivo,Comision,MontoALiquidar,NumPedidos,
                 Observaciones,idUsuarioLiquida,Status)
              VALUES
                (@idBranch,@idCuenta,@idLiquidacion,@idRepartidor,
                 @MontoEfectivo,@Comision,@MontoALiquidar,@NumPedidos,
                 @Observaciones,@idUsuarioLiquida,@Status)`);

    // Resetear saldo pendiente del repartidor
    await pool.request()
      .input('idBranch',     sql.BigInt, idBranch)
      .input('idCuenta',     sql.BigInt, idCuenta)
      .input('idRepartidor', sql.BigInt, idRepartidor)
      .query(`UPDATE VIDA_REPARTIDORES SET SaldoPendiente=0
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idRepartidor=@idRepartidor`);

    await registrarAuditoria(pool, {
      idBranch, idCuenta,
      entityType: 'LIQUIDACION', entityId: idLiquidacion,
      accion: 'LIQUIDACION_REPARTIDOR', actor: idUsuario,
      data: {
        idRepartidor: parseInt(idRepartidor), MontoLiquidado: saldo,
        MontoEfectivo: parseFloat(stats.MontoEfectivo), Comision: parseFloat(stats.Comision),
        NumPedidos: stats.NumPedidos, Observaciones: Observaciones || null,
      },
    }, request.log);

    return reply.send({
      ok:             true,
      idLiquidacion,
      MontoLiquidado: saldo,
      NumPedidos:     stats.NumPedidos,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al liquidar repartidor' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — GET CONFIG DELIVERY
// GET /delivery/admin/config
// ══════════════════════════════════════════════════════════════════════════
export async function getConfigDelivery(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT Clave, Valor, Descripcion FROM VIDA_CONFIG_DELIVERY
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
              ORDER BY Clave`);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener configuración' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — SET CONFIG DELIVERY
// POST /delivery/admin/config — Body: [{ Clave, Valor }]
// ══════════════════════════════════════════════════════════════════════════
export async function setConfigDelivery(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const items = request.body; // array de { Clave, Valor }

  try {
    const pool = await getPool();
    for (const item of items) {
      await pool.request()
        .input('idBranch', sql.BigInt,    idBranch)
        .input('idCuenta', sql.BigInt,    idCuenta)
        .input('Clave',    sql.VarChar(100), item.Clave)
        .input('Valor',    sql.VarChar(500), item.Valor)
        .query(`MERGE VIDA_CONFIG_DELIVERY AS target
                USING (SELECT @idBranch AS idBranch, @idCuenta AS idCuenta,
                              @Clave AS Clave, @Valor AS Valor) AS src
                  ON target.idBranch=src.idBranch AND target.idCuenta=src.idCuenta
                     AND target.Clave=src.Clave
                WHEN MATCHED THEN
                  UPDATE SET Valor=src.Valor
                WHEN NOT MATCHED THEN
                  INSERT (idBranch,idCuenta,Clave,Valor)
                  VALUES (src.idBranch,src.idCuenta,src.Clave,src.Valor);`);
    }
    return reply.send({ ok: true, updated: items.length });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al guardar configuración' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// REPARTIDOR — RUTA ACTUAL (paradas ordenadas + ETAs)
// GET /delivery/repartidor/ruta
// ══════════════════════════════════════════════════════════════════════════
export async function rutaRepartidor(request, reply) {
  const { idBranch, idCuenta, idRepartidor } = request.repartidor;
  try {
    const ruta = await recalcularRuta(idBranch, idCuenta, idRepartidor, request.log);
    return reply.send(ruta);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al calcular la ruta' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — RESUMEN DE REPARTIDORES (pedidos activos, comisiones, generado)
// GET /delivery/admin/repartidores/resumen?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// ══════════════════════════════════════════════════════════════════════════
export async function resumenRepartidores(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { desde, hasta } = request.query;

  // Rango por defecto: el día de hoy
  const fDesde = desde || new Date().toISOString().slice(0, 10);
  const fHasta = hasta || fDesde;

  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('desde', sql.VarChar(10), fDesde)
      .input('hasta', sql.VarChar(10), fHasta)
      .query(`
        SELECT r.idRepartidor, r.Nombre, r.Telefono, r.Vehiculo, r.FotoURL,
               r.StatusRepartidor, r.SaldoPendiente, r.Calificacion,
               r.UltimaLatitud, r.UltimaLongitud, r.UltimaUbicacion,

               -- Pedidos activos en este momento (los que lleva encima)
               (SELECT COUNT(*) FROM VIDA_PEDIDOS p
                WHERE p.idBranch=r.idBranch AND p.idCuenta=r.idCuenta
                  AND p.idRepartidor=r.idRepartidor
                  AND p.Status IN ('REPARTIDOR_ASIGNADO','IR_A_SUCURSAL','EN_SUCURSAL','EN_CAMINO')
               ) AS PedidosActivos,

               -- Próxima entrega (menor ETA de sus pedidos activos)
               (SELECT MIN(p.ETAEntrega) FROM VIDA_PEDIDOS p
                WHERE p.idBranch=r.idBranch AND p.idCuenta=r.idCuenta
                  AND p.idRepartidor=r.idRepartidor
                  AND p.Status IN ('REPARTIDOR_ASIGNADO','IR_A_SUCURSAL','EN_SUCURSAL','EN_CAMINO')
               ) AS ProximaEntrega,

               -- Desempeño en el rango de fechas
               ISNULL(ent.Entregados, 0)      AS Entregados,
               ISNULL(ent.MontoGenerado, 0)   AS MontoGenerado,
               ISNULL(ent.Comisiones, 0)      AS Comisiones,
               ISNULL(ent.EfectivoRendido, 0) AS EfectivoRecaudado
        FROM VIDA_REPARTIDORES r
        OUTER APPLY (
          SELECT COUNT(*)                            AS Entregados,
                 SUM(p.TotalUSD)                     AS MontoGenerado,
                 SUM(ISNULL(p.ComisionRepartidor,0)) AS Comisiones,
                 SUM(ISNULL(p.MontoEfectivoRepartidor,0)) AS EfectivoRendido
          FROM VIDA_PEDIDOS p
          WHERE p.idBranch=r.idBranch AND p.idCuenta=r.idCuenta
            AND p.idRepartidor=r.idRepartidor AND p.Status='ENTREGADO'
            AND CONVERT(DATE, p.FechaMod) BETWEEN @desde AND @hasta
        ) ent
        WHERE r.idBranch=@idBranch AND r.idCuenta=@idCuenta
          AND r.Status='ACTIVO'
          AND ISNULL(r.StatusAprobacion,'APROBADO') NOT IN ('PENDIENTE','RECHAZADO')
        ORDER BY PedidosActivos DESC, r.Nombre
      `);

    return reply.send({ desde: fDesde, hasta: fHasta, repartidores: r.recordset });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener resumen de repartidores' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — MAPA EN VIVO (posiciones de repartidores + pedidos en curso)
// GET /delivery/admin/mapa-vivo
// Alimenta el mapa de logística del panel web; las actualizaciones en tiempo
// real llegan por WebSocket (repartidor_ubicacion / pedido_status).
// ══════════════════════════════════════════════════════════════════════════
export async function mapaVivoDelivery(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();

    // Repartidores con ubicación conocida y su carga actual
    const repR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`
        SELECT r.idRepartidor, r.Nombre, r.Telefono, r.Vehiculo,
               r.StatusRepartidor, r.UltimaLatitud, r.UltimaLongitud, r.UltimaUbicacion,
               (SELECT COUNT(*) FROM VIDA_PEDIDOS p
                WHERE p.idBranch=r.idBranch AND p.idCuenta=r.idCuenta
                  AND p.idRepartidor=r.idRepartidor
                  AND p.Status IN ('REPARTIDOR_ASIGNADO','IR_A_SUCURSAL','EN_SUCURSAL','EN_CAMINO')
               ) AS PedidosActivos
        FROM VIDA_REPARTIDORES r
        WHERE r.idBranch=@idBranch AND r.idCuenta=@idCuenta
          AND r.Status='ACTIVO'
          AND ISNULL(r.StatusAprobacion,'APROBADO') NOT IN ('PENDIENTE','RECHAZADO')
          AND r.StatusRepartidor IN ('DISPONIBLE','OCUPADO')
      `);

    // Pedidos en curso (con posición de sucursal y de entrega)
    const pedR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`
        SELECT p.idPedido, p.Status, p.idRepartidor, p.TotalUSD,
               p.OrdenRuta, p.ETAEntrega,
               DATEDIFF(MINUTE, GETUTCDATE(), p.ETAEntrega) AS MinutosRestantes,
               p.UbicacionEntregaLat AS EntregaLat, p.UbicacionEntregaLon AS EntregaLon,
               p.DireccionEntrega,
               c.Nombre AS NombreCliente,
               rep.Nombre AS NombreRepartidor,
               pv.NomComercial AS NombreSucursal,
               pv.Latitud  AS SucursalLat, pv.Longitud AS SucursalLon
        FROM VIDA_PEDIDOS p
        LEFT JOIN VIDA_APP_CLIENTES c
          ON c.idBranch=p.idBranch AND c.idCuenta=p.idCuenta AND c.idCliente=p.idCliente
        LEFT JOIN VIDA_REPARTIDORES rep
          ON rep.idBranch=p.idBranch AND rep.idCuenta=p.idCuenta AND rep.idRepartidor=p.idRepartidor
        LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv
          ON pv.idBranch=p.idBranch AND pv.idCuenta=p.idCuenta AND pv.idPuntoVenta=p.idPuntoVenta
        WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta
          AND p.Status IN ('BUSCANDO_REPARTIDOR','REPARTIDOR_ASIGNADO','IR_A_SUCURSAL','EN_SUCURSAL','EN_CAMINO')
        ORDER BY p.FechaAlta DESC
      `);

    return reply.send({
      repartidores: repR.recordset,
      pedidos:      pedR.recordset,
      timestamp:    new Date().toISOString(),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener el mapa en vivo' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — LISTAR CONSUMIDORES FINALES (clientes de la app) con métricas
// GET /delivery/admin/clientes?q=&page=1&limit=20
// ══════════════════════════════════════════════════════════════════════════
export async function listarClientesAdmin(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { q = '', page = 1, limit = 20 } = request.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const pool = await getPool();
    const busca = `%${String(q).trim()}%`;

    const filas = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('q',        sql.VarChar(200), busca)
      .input('offset',   sql.Int, offset)
      .input('limit',    sql.Int, parseInt(limit))
      .query(`
        SELECT c.idCliente, c.Nombre, c.Apellidos, c.Telefono, c.Email,
               c.FechaAlta, c.Status,
               CASE WHEN c.GoogleId IS NOT NULL THEN 1 ELSE 0 END AS EsGoogle,
               ISNULL(ped.NumPedidos, 0)   AS NumPedidos,
               ISNULL(ped.TotalGastado, 0) AS TotalGastado,
               ped.UltimoPedido
        FROM VIDA_APP_CLIENTES c
        OUTER APPLY (
          SELECT COUNT(*) AS NumPedidos,
                 SUM(CASE WHEN p.Status='ENTREGADO' THEN p.TotalUSD ELSE 0 END) AS TotalGastado,
                 MAX(p.FechaAlta) AS UltimoPedido
          FROM VIDA_PEDIDOS p
          WHERE p.idBranch=c.idBranch AND p.idCuenta=c.idCuenta AND p.idCliente=c.idCliente
        ) ped
        WHERE c.idBranch=@idBranch AND c.idCuenta=@idCuenta
          AND (c.Nombre LIKE @q OR c.Apellidos LIKE @q OR c.Telefono LIKE @q OR c.Email LIKE @q)
        ORDER BY ped.UltimoPedido DESC, c.FechaAlta DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    const totalR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('q',        sql.VarChar(200), busca)
      .query(`SELECT COUNT(*) AS total FROM VIDA_APP_CLIENTES c
              WHERE c.idBranch=@idBranch AND c.idCuenta=@idCuenta
                AND (c.Nombre LIKE @q OR c.Apellidos LIKE @q OR c.Telefono LIKE @q OR c.Email LIKE @q)`);

    return reply.send({
      data:  filas.recordset,
      total: totalR.recordset[0].total,
      page:  parseInt(page),
      pages: Math.ceil(totalR.recordset[0].total / parseInt(limit)),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al listar consumidores' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — DETALLE DE UN CONSUMIDOR + su historial de pedidos
// GET /delivery/admin/clientes/:idCliente
// ══════════════════════════════════════════════════════════════════════════
export async function detalleClienteAdmin(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idCliente } = request.params;

  try {
    const pool = await getPool();

    const cliR = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT c.idCliente, c.Nombre, c.Apellidos, c.Telefono, c.Email,
                     c.FechaAlta, c.Status, c.EmailConfirmado,
                     CASE WHEN c.GoogleId IS NOT NULL THEN 1 ELSE 0 END AS EsGoogle
              FROM VIDA_APP_CLIENTES c
              WHERE c.idBranch=@idBranch AND c.idCuenta=@idCuenta AND c.idCliente=@idCliente`);

    if (!cliR.recordset.length) {
      return reply.code(404).send({ error: 'Consumidor no encontrado' });
    }

    // Direcciones guardadas
    const dirR = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT Alias, Direccion, EsPrincipal FROM VIDA_APP_CLIENTES_DIRECCIONES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente
                AND Status='ACTIVO' ORDER BY EsPrincipal DESC`);

    // Historial de pedidos
    const pedR = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT TOP 100
                p.idPedido, p.Status, p.MetodoPago, p.TotalUSD, p.FechaAlta,
                p.DireccionEntrega,
                pv.NomComercial AS NombreSucursal,
                rep.Nombre      AS NombreRepartidor,
                (SELECT COUNT(*) FROM VIDA_PEDIDOS_DETALLE d
                 WHERE d.idBranch=p.idBranch AND d.idCuenta=p.idCuenta AND d.idPedido=p.idPedido) AS TotalItems
              FROM VIDA_PEDIDOS p
              LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv
                ON pv.idBranch=p.idBranch AND pv.idCuenta=p.idCuenta AND pv.idPuntoVenta=p.idPuntoVenta
              LEFT JOIN VIDA_REPARTIDORES rep
                ON rep.idBranch=p.idBranch AND rep.idCuenta=p.idCuenta AND rep.idRepartidor=p.idRepartidor
              WHERE p.idBranch=@idBranch AND p.idCuenta=@idCuenta AND p.idCliente=@idCliente
              ORDER BY p.FechaAlta DESC`);

    const pedidos = pedR.recordset;
    const metricas = {
      NumPedidos:   pedidos.length,
      Entregados:   pedidos.filter(p => p.Status === 'ENTREGADO').length,
      Cancelados:   pedidos.filter(p => p.Status === 'CANCELADO').length,
      TotalGastado: pedidos.filter(p => p.Status === 'ENTREGADO').reduce((s, p) => s + (p.TotalUSD || 0), 0),
    };
    metricas.TicketPromedio = metricas.Entregados ? metricas.TotalGastado / metricas.Entregados : 0;

    return reply.send({
      cliente:     cliR.recordset[0],
      direcciones: dirR.recordset,
      pedidos,
      metricas,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener el consumidor' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — EXTENDER LA BÚSQUEDA DE REPARTIDOR
// POST /delivery/pedido/:idPedido/extender-busqueda
// ══════════════════════════════════════════════════════════════════════════
export async function extenderBusquedaPedido(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const { idPedido } = request.params;

  try {
    const pool = await getPool();
    const extMin = parseInt(await getConfigVal(pool, idBranch, idCuenta, 'ExtensionBusquedaMin', '10')) || 10;

    const upd = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idPedido',  sql.BigInt, idPedido)
      .input('idCliente', sql.BigInt, idCliente)
      .input('min',       sql.Int,    extMin)
      .query(`UPDATE VIDA_PEDIDOS
              SET FechaLimiteBusqueda = DATEADD(MINUTE, @min, GETDATE()), FechaMod = GETDATE()
              OUTPUT inserted.FechaLimiteBusqueda
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND idPedido=@idPedido AND idCliente=@idCliente
                AND Status='BUSCANDO_REPARTIDOR'`);

    if (!upd.recordset.length) {
      return reply.code(409).send({ error: 'El pedido ya no está en búsqueda de repartidor' });
    }

    return reply.send({
      ok: true,
      minutosExtra: extMin,
      FechaLimiteBusqueda: upd.recordset[0].FechaLimiteBusqueda,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al extender la búsqueda' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLIENTE — CANCELAR SU PEDIDO (solo mientras busca repartidor)
// POST /delivery/pedido/:idPedido/cancelar
// ══════════════════════════════════════════════════════════════════════════
export async function cancelarPedidoCliente(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const { idPedido } = request.params;

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  let enTransaccion = false;

  try {
    await transaction.begin();
    enTransaccion = true;

    const upd = await new sql.Request(transaction)
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idPedido',  sql.BigInt, idPedido)
      .input('idCliente', sql.BigInt, idCliente)
      .query(`UPDATE VIDA_PEDIDOS SET Status='CANCELADO', FechaMod=GETDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta
                AND idPedido=@idPedido AND idCliente=@idCliente
                AND Status='BUSCANDO_REPARTIDOR'`);

    if (upd.rowsAffected[0] === 0) {
      await transaction.rollback();
      enTransaccion = false;
      return reply.code(409).send({
        error: 'El pedido ya no se puede cancelar (un repartidor ya lo tomó o ya fue procesado)',
      });
    }

    const histId = await nextIdTx(transaction, 'VIDA_PEDIDOS_HISTORIAL', 'idHistorial', idBranch, idCuenta);
    await new sql.Request(transaction)
      .input('idBranch',      sql.BigInt,      idBranch)
      .input('idCuenta',      sql.BigInt,      idCuenta)
      .input('idHistorial',   sql.BigInt,      histId)
      .input('idPedido',      sql.BigInt,      idPedido)
      .input('StatusAnterior',sql.VarChar(40), 'BUSCANDO_REPARTIDOR')
      .input('StatusNuevo',   sql.VarChar(40), 'CANCELADO')
      .input('UsuAlta',       sql.VarChar(20), `CLI:${idCliente}`)
      .query(`INSERT INTO VIDA_PEDIDOS_HISTORIAL
                (idBranch, idCuenta, idHistorial, idPedido, StatusAnterior, StatusNuevo, UsuAlta)
              VALUES (@idBranch, @idCuenta, @idHistorial, @idPedido, @StatusAnterior, @StatusNuevo, @UsuAlta)`);

    await transaction.commit();
    enTransaccion = false;

    broadcast(idBranch, idCuenta, {
      tipo: 'status_pedido', idPedido: Number(idPedido), idCliente, estado: 'CANCELADO',
    });
    broadcast(idBranch, idCuenta, {
      tipo: 'pedido:actualizado', idPedido: Number(idPedido), StatusNuevo: 'CANCELADO',
    });

    return reply.send({ ok: true, status: 'CANCELADO' });
  } catch (err) {
    if (enTransaccion) {
      try { await transaction.rollback(); } catch {}
    }
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al cancelar el pedido' });
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
        idCliente = await nextId(pool, 'VIDA_APP_CLIENTES', 'idCliente', idBranch, idCuenta);
        nombreFinal = Nombre;
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
