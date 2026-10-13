// src/controllers/delivery/recuperacion.js
// Recuperar la contraseña del cliente con un código de 6 dígitos por correo.
//   POST /delivery/cliente/password/codigo        { idBranch, idCuenta, Telefono }
//   POST /delivery/cliente/password/restablecer   { idBranch, idCuenta, Telefono, Codigo, Nueva }
// El código se guarda con bcrypt, vence a los 15 minutos, admite 5 intentos y
// sirve una sola vez. Al restablecer, el cliente queda con sesión iniciada.
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { getPool, sql } from '../../db/sqlserver.js';
import { enviarCorreo, plantillaCorreo, enmascararCorreo, correoConfigurado } from '../../services/correo.service.js';
import { instanteCorte, olvidarSesion } from '../../services/sesiones.service.js';

export const MINUTOS_CODIGO = 15;
export const MAX_INTENTOS = 5;
export const SEGUNDOS_REENVIO = 60;

export const generarCodigo = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

// Estado del código guardado frente a un intento: 'ok' para comparar, o el motivo del rechazo
export function estadoCodigo(fila, ahora = new Date()) {
  if (!fila || fila.Usado) return 'SIN_CODIGO';
  if (new Date(fila.Expira) <= ahora) return 'VENCIDO';
  if (Number(fila.Intentos) >= MAX_INTENTOS) return 'BLOQUEADO';
  return 'ok';
}

const buscarCliente = (db, { idBranch, idCuenta, Telefono }) => db.request()
  .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('t', sql.VarChar(30), String(Telefono).trim())
  .query(`SELECT idCliente, Nombre, Apellidos, Email, EmailConfirmado FROM VIDA_APP_CLIENTES
          WHERE idBranch=@b AND idCuenta=@c AND Telefono=@t AND Status='ACTIVO'`)
  .then((r) => r.recordset[0] || null);

export async function solicitarCodigoRecuperacion(request, reply) {
  const { idBranch, idCuenta, Telefono } = request.body || {};
  if (!idBranch || !idCuenta || !String(Telefono || '').trim()) return reply.code(400).send({ error: 'Escribe tu número de teléfono' });
  try {
    const pool = await getPool();
    const cli = await buscarCliente(pool, { idBranch, idCuenta, Telefono });
    if (!cli) return reply.code(404).send({ error: 'No hay una cuenta con ese teléfono' });
    if (!cli.Email) return reply.code(422).send({ error: 'Tu cuenta no tiene un correo registrado. Escríbenos a soporte para recuperarla.', sinCorreo: true });
    if (!correoConfigurado()) return reply.code(503).send({ error: 'El envío de correos no está disponible en este momento. Intenta más tarde.' });

    const previo = (await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('id', sql.BigInt, cli.idCliente)
      .query(`SELECT Usado, DATEDIFF(SECOND, FechaAlta, SYSUTCDATETIME()) AS Hace FROM VIDA_CLIENTE_RECUPERACION
              WHERE idBranch=@b AND idCuenta=@c AND idCliente=@id`)).recordset[0];
    if (previo && !previo.Usado && previo.Hace < SEGUNDOS_REENVIO)
      return reply.code(429).send({ error: `Espera ${SEGUNDOS_REENVIO - previo.Hace} segundos para pedir otro código` });

    const codigo = generarCodigo();
    const hash = await bcrypt.hash(codigo, 8);
    await pool.request()
      .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('id', sql.BigInt, cli.idCliente)
      .input('h', sql.VarChar(100), hash).input('m', sql.Int, MINUTOS_CODIGO)
      .query(`MERGE VIDA_CLIENTE_RECUPERACION WITH (HOLDLOCK) AS t
              USING (SELECT @b b, @c c, @id id) s ON t.idBranch=s.b AND t.idCuenta=s.c AND t.idCliente=s.id
              WHEN MATCHED THEN UPDATE SET CodigoHash=@h, Expira=DATEADD(MINUTE,@m,SYSUTCDATETIME()), Intentos=0, Usado=0, FechaAlta=SYSUTCDATETIME()
              WHEN NOT MATCHED THEN INSERT (idBranch,idCuenta,idCliente,CodigoHash,Expira)
                VALUES (@b,@c,@id,@h,DATEADD(MINUTE,@m,SYSUTCDATETIME()));`);
    try {
      await enviarCorreo({
        to: cli.Email,
        subject: `${codigo} es tu código para recuperar tu cuenta VIDA`,
        html: plantillaCorreo({
          saludo: `Hola, ${cli.Nombre || 'cliente VIDA'}`,
          parrafos: ['Pediste recuperar la contraseña de tu cuenta VIDA. Escribe este código en la app:'],
          destacado: codigo,
          pie: `Vence en ${MINUTOS_CODIGO} minutos. Si no lo pediste tú, ignora este correo: tu contraseña no cambia.`,
        }),
      });
    } catch (e) {
      request.log.warn({ err: e.message }, 'no se pudo enviar el código de recuperación');
      await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('id', sql.BigInt, cli.idCliente)
        .query(`DELETE FROM VIDA_CLIENTE_RECUPERACION WHERE idBranch=@b AND idCuenta=@c AND idCliente=@id`);
      return reply.code(502).send({ error: 'No pudimos enviar el correo. Intenta de nuevo en unos minutos.' });
    }
    return reply.send({ ok: true, destino: enmascararCorreo(cli.Email), minutos: MINUTOS_CODIGO });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'No se pudo enviar el código' });
  }
}

export async function restablecerPasswordCliente(request, reply) {
  const { idBranch, idCuenta, Telefono, Codigo, Nueva } = request.body || {};
  if (!idBranch || !idCuenta || !String(Telefono || '').trim()) return reply.code(400).send({ error: 'Falta el teléfono' });
  if (!/^\d{6}$/.test(String(Codigo || '').trim())) return reply.code(400).send({ error: 'El código tiene 6 dígitos' });
  if (!Nueva || String(Nueva).length < 6) return reply.code(400).send({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  let enTx = false;
  try {
    const cli = await buscarCliente(pool, { idBranch, idCuenta, Telefono });
    if (!cli) return reply.code(400).send({ error: 'El código no es válido. Pide uno nuevo.' });
    await tx.begin(); enTx = true;
    const req = () => new sql.Request(tx).input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('id', sql.BigInt, cli.idCliente);
    const fila = (await req().query(`SELECT CodigoHash, Expira, Intentos, Usado FROM VIDA_CLIENTE_RECUPERACION WITH (UPDLOCK, HOLDLOCK)
                                     WHERE idBranch=@b AND idCuenta=@c AND idCliente=@id`)).recordset[0];
    const estado = estadoCodigo(fila);
    if (estado !== 'ok') {
      await tx.rollback(); enTx = false;
      if (estado === 'BLOQUEADO') return reply.code(429).send({ error: 'Demasiados intentos. Pide un código nuevo.' });
      return reply.code(400).send({ error: estado === 'VENCIDO' ? 'El código venció. Pide uno nuevo.' : 'El código no es válido. Pide uno nuevo.' });
    }
    if (!(await bcrypt.compare(String(Codigo).trim(), fila.CodigoHash))) {
      await req().query(`UPDATE VIDA_CLIENTE_RECUPERACION SET Intentos=Intentos+1 WHERE idBranch=@b AND idCuenta=@c AND idCliente=@id`);
      await tx.commit(); enTx = false;
      const quedan = MAX_INTENTOS - Number(fila.Intentos) - 1;
      return reply.code(400).send({ error: quedan > 0 ? `Código incorrecto. Te queda${quedan === 1 ? '' : 'n'} ${quedan} intento${quedan === 1 ? '' : 's'}.` : 'Código incorrecto. Pide uno nuevo.' });
    }
    const hash = await bcrypt.hash(String(Nueva), 10);
    // Recibió el código en su correo: el correo queda confirmado. Las sesiones
    // abiertas en otros teléfonos se cierran (pudo ser una cuenta robada).
    await req().input('h', sql.VarChar(200), hash).input('desde', sql.DateTime2, instanteCorte())
      .query(`UPDATE VIDA_APP_CLIENTES SET Contrasena=@h, EmailConfirmado=1, TokenConfirmacion=NULL, TokenExpira=NULL, SesionesDesde=@desde
              WHERE idBranch=@b AND idCuenta=@c AND idCliente=@id;
              UPDATE VIDA_CLIENTE_RECUPERACION SET Usado=1 WHERE idBranch=@b AND idCuenta=@c AND idCliente=@id;`);
    await tx.commit(); enTx = false;
    olvidarSesion('CLIENTE', { idBranch, idCuenta, idCliente: cli.idCliente });
    const token = request.server.jwt.sign({ idBranch, idCuenta, idCliente: cli.idCliente, rol: 'CLIENTE' }, { expiresIn: '180d' });
    return reply.send({ idCliente: cli.idCliente, Nombre: cli.Nombre, Apellidos: cli.Apellidos, Email: cli.Email, token, emailConfirmado: true });
  } catch (err) {
    if (enTx) { try { await tx.rollback(); } catch { } }
    request.log.error(err);
    return reply.code(500).send({ error: 'No se pudo cambiar la contraseña' });
  }
}
