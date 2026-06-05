// src/controllers/perfil.controller.js
import bcrypt from 'bcrypt';
import path from 'path';
import fs from 'fs';
import { getPool, sql } from '../db/sqlserver.js';

// ── GET /api/perfil ────────────────────────────────────────────────────────
export async function getPerfil(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idUsuario', sql.BigInt, idUsuario)
      .query(`
        SELECT
          u.idUsuario, u.Nombre, u.Apellidos, u.NomComercial,
          u.Correo, u.Telefono, u.Puesto, u.TipoUsuario,
          u.NivelAcceso, u.FechaNacimiento, u.ImagenUsuario,
          u.FechaAlta, u.CambiarPass,
          p.NomComercial AS NombreSucursal,
          b.NomComercial AS NombreEstado,
          br.NomComercial AS NombrePais
        FROM VIDA_CUENTA_USUARIOS u
        LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA p
          ON p.idBranch=u.idBranch AND p.idCuenta=u.idCuenta AND p.idPuntoVenta=u.idPuntoVenta
        LEFT JOIN HW_BRANCH_CUENTA b
          ON b.idBranch=u.idBranch AND b.idCuenta=u.idCuenta
        LEFT JOIN HW_BRANCH br
          ON br.idBranch=u.idBranch
        WHERE u.idBranch=@idBranch AND u.idCuenta=@idCuenta AND u.idUsuario=@idUsuario
      `);

    const usuario = result.recordset[0];
    if (!usuario) return reply.code(404).send({ error: 'Usuario no encontrado' });

    // Obtener pantallas del usuario
    const pantallas = await pool.request()
      .input('idBranch',  sql.BigInt, idBranch)
      .input('idCuenta',  sql.BigInt, idCuenta)
      .input('idUsuario', sql.BigInt, idUsuario)
      .query(`
        SELECT p.idPantalla, p.Nombre, p.Modulo, p.Icono
        FROM VIDA_CUENTA_PANTALLAS_ACCESOS_USUARIO a
        INNER JOIN VIDA_CUENTA_PANTALLAS p
          ON p.idBranch=a.idBranch AND p.idCuenta=a.idCuenta AND p.idPantalla=a.idPantalla
        WHERE a.idBranch=@idBranch AND a.idCuenta=@idCuenta
          AND a.idUsuario=@idUsuario AND a.StatusAcceso='ACTIVO'
          AND p.Status='ACTIVO'
        ORDER BY p.OrdenPantalla
      `);

    return reply.send({
      ...usuario,
      pantallas: pantallas.recordset,
    });

  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener perfil' });
  }
}

// ── PUT /api/perfil ────────────────────────────────────────────────────────
export async function updatePerfil(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { Nombre, Apellidos, NomComercial, Telefono, Puesto, FechaNacimiento } = request.body;

  if (!Nombre) return reply.code(400).send({ error: 'El nombre es requerido' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',       sql.BigInt,       idBranch)
      .input('idCuenta',       sql.BigInt,       idCuenta)
      .input('idUsuario',      sql.BigInt,       idUsuario)
      .input('Nombre',         sql.VarChar(200), Nombre)
      .input('Apellidos',      sql.VarChar(200), Apellidos || null)
      .input('NomComercial',   sql.VarChar(200), NomComercial || null)
      .input('Telefono',       sql.VarChar(50),  Telefono || null)
      .input('Puesto',         sql.VarChar(200), Puesto || null)
      .input('FechaNacimiento',sql.Date,         FechaNacimiento || null)
      .input('UsuMod',         sql.VarChar(50),  String(idUsuario))
      .query(`UPDATE VIDA_CUENTA_USUARIOS SET
                Nombre=@Nombre, Apellidos=@Apellidos, NomComercial=@NomComercial,
                Telefono=@Telefono, Puesto=@Puesto, FechaNacimiento=@FechaNacimiento,
                FechaMod=GETDATE(), UsuMod=@UsuMod
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idUsuario=@idUsuario`);

    return reply.send({ message: 'Perfil actualizado correctamente' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al actualizar perfil' });
  }
}

// ── POST /api/perfil/foto ──────────────────────────────────────────────────
export async function uploadFoto(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;

  try {
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No se recibió ningún archivo' });

    // Validar tipo
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(data.mimetype)) {
      return reply.code(400).send({ error: 'Solo se permiten imágenes JPG, PNG o WebP' });
    }

    // Crear carpeta si no existe
    const uploadDir = path.join(process.cwd(), 'uploads', 'avatars');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Nombre único del archivo
    const ext = data.filename.split('.').pop();
    const filename = `avatar_${idBranch}_${idCuenta}_${idUsuario}_${Date.now()}.${ext}`;
    const filepath = path.join(uploadDir, filename);

    // Guardar archivo
    const buffer = await data.toBuffer();
    fs.writeFileSync(filepath, buffer);

    // URL pública
    const urlFoto = `/uploads/avatars/${filename}`;

    // Actualizar BD
    const pool = await getPool();
    await pool.request()
      .input('idBranch',     sql.BigInt,       idBranch)
      .input('idCuenta',     sql.BigInt,       idCuenta)
      .input('idUsuario',    sql.BigInt,       idUsuario)
      .input('ImagenUsuario',sql.VarChar(300), urlFoto)
      .input('UsuMod',       sql.VarChar(50),  String(idUsuario))
      .query(`UPDATE VIDA_CUENTA_USUARIOS SET
                ImagenUsuario=@ImagenUsuario, FechaMod=GETDATE(), UsuMod=@UsuMod
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idUsuario=@idUsuario`);

    return reply.send({ message: 'Foto actualizada correctamente', url: urlFoto });

  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al subir foto: ' + err.message });
  }
}

// ── POST /api/perfil/cambiar-pass ─────────────────────────────────────────
export async function cambiarPassPerfil(request, reply) {
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
      .query(`SELECT Pass FROM VIDA_CUENTA_USUARIOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idUsuario=@idUsuario`);

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
      .input('UsuMod',    sql.VarChar(50),  String(idUsuario))
      .query(`UPDATE VIDA_CUENTA_USUARIOS SET
                Pass=@Pass, CambiarPass=0, FechaMod=GETDATE(), UsuMod=@UsuMod
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idUsuario=@idUsuario`);

    return reply.send({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al cambiar contraseña' });
  }
}