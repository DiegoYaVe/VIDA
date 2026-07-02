// src/controllers/auth.controller.js
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { getPool, sql } from '../db/sqlserver.js';

export async function login(request, reply) {
  const { cve, pass } = request.body;

  if (!cve || !pass) {
    return reply.code(400).send({ error: 'Usuario y contraseña requeridos' });
  }

  try {
    const pool = await getPool();

    const result = await pool.request()
      .input('Cve', sql.VarChar(50), cve)
      .query(`
        SELECT
          u.idBranch, u.idCuenta, u.idUsuario,
          u.Nombre, u.Apellidos, u.Correo,
          u.TipoUsuario, u.NivelAcceso,
          u.Cve, u.Pass,
          u.idPuntoVenta, u.idEstado, u.idPais, u.Status,
          u.CambiarPass,
          c.NomComercial AS NombreCuenta,
          c.logoCuenta
        FROM VIDA_CUENTA_USUARIOS u
        INNER JOIN HW_BRANCH_CUENTA c
          ON c.idBranch = u.idBranch AND c.idCuenta = u.idCuenta
        WHERE u.Cve = @Cve
          AND u.Status = 'ACTIVO'
      `);

    const usuario = result.recordset[0];

    if (!usuario) {
      return reply.code(401).send({ error: 'Credenciales incorrectas' });
    }

    const passwordValido = await bcrypt.compare(pass, usuario.Pass);
    if (!passwordValido) {
      return reply.code(401).send({ error: 'Credenciales incorrectas' });
    }

    const pantallasResult = await pool.request()
      .input('idBranch',  sql.BigInt, usuario.idBranch)
      .input('idCuenta',  sql.BigInt, usuario.idCuenta)
      .input('idUsuario', sql.BigInt, usuario.idUsuario)
      .query(`
        SELECT p.idPantalla, p.Nombre, p.Descripcion,
          p.Modulo, p.Link, p.Icono, p.OrdenPantalla
        FROM VIDA_CUENTA_PANTALLAS_ACCESOS_USUARIO a
        INNER JOIN VIDA_CUENTA_PANTALLAS p
          ON p.idBranch = a.idBranch
         AND p.idCuenta = a.idCuenta
         AND p.idPantalla = a.idPantalla
        WHERE a.idBranch = @idBranch
          AND a.idCuenta = @idCuenta
          AND a.idUsuario = @idUsuario
          AND a.StatusAcceso = 'ACTIVO'
          AND p.Status = 'ACTIVO'
        ORDER BY p.OrdenPantalla
      `);

    const payload = {
      idBranch:    usuario.idBranch,
      idCuenta:    usuario.idCuenta,
      idUsuario:   usuario.idUsuario,
      Nombre:      usuario.Nombre,
      Apellidos:   usuario.Apellidos,
      TipoUsuario: usuario.TipoUsuario,
      NivelAcceso: usuario.NivelAcceso,
      idPuntoVenta:usuario.idPuntoVenta,
      idEstado:    usuario.idEstado,
      idPais:      usuario.idPais,
      CambiarPass: usuario.CambiarPass,
    };

    const accessToken  = await reply.jwtSign(payload, { expiresIn: '15m' });
    const refreshToken = uuidv4();
    const expiraEn     = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.request()
      .input('idBranch',     sql.BigInt,      usuario.idBranch)
      .input('idCuenta',     sql.BigInt,      usuario.idCuenta)
      .input('idUsuario',    sql.BigInt,      usuario.idUsuario)
      .input('RefreshToken', sql.VarChar(500), refreshToken)
      .input('FechaExpira',  sql.DateTime,    expiraEn)
      .input('IpOrigen',     sql.VarChar(50), request.ip)
      .query(`
        INSERT INTO VIDA_SESIONES
          (idBranch, idCuenta, idUsuario, RefreshToken, FechaExpira, IpOrigen, Status)
        VALUES
          (@idBranch, @idCuenta, @idUsuario, @RefreshToken, @FechaExpira, @IpOrigen, 'ACTIVO')
      `);

    return reply.send({
      accessToken,
      refreshToken,
      usuario: {
        idUsuario:    usuario.idUsuario,
        Nombre:       usuario.Nombre,
        Apellidos:    usuario.Apellidos,
        Correo:       usuario.Correo,
        TipoUsuario:  usuario.TipoUsuario,
        NivelAcceso:  usuario.NivelAcceso,
        NombreCuenta: usuario.NombreCuenta,
        logoCuenta:   usuario.logoCuenta,
        CambiarPass:  usuario.CambiarPass,
        idPuntoVenta: usuario.idPuntoVenta,
        idEstado:     usuario.idEstado,
        idPais:       usuario.idPais,
      },
      pantallas: pantallasResult.recordset,
    });

  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error interno del servidor' });
  }
}

export async function refresh(request, reply) {
  const { refreshToken } = request.body;
  if (!refreshToken) return reply.code(400).send({ error: 'Token requerido' });

  try {
    const pool = await getPool();

    const result = await pool.request()
      .input('RefreshToken', sql.VarChar(500), refreshToken)
      .query(`
        SELECT s.*, u.Nombre, u.Apellidos, u.TipoUsuario,
               u.NivelAcceso, u.idPuntoVenta, u.idEstado, u.idPais, u.CambiarPass
        FROM VIDA_SESIONES s
        INNER JOIN VIDA_CUENTA_USUARIOS u
          ON u.idBranch = s.idBranch AND u.idCuenta = s.idCuenta AND u.idUsuario = s.idUsuario
        WHERE s.RefreshToken = @RefreshToken
          AND s.Status = 'ACTIVO'
          AND s.FechaExpira > GETDATE()
      `);

    const sesion = result.recordset[0];
    if (!sesion) return reply.code(401).send({ error: 'Refresh token inválido o expirado' });

    const payload = {
      idBranch:    sesion.idBranch,
      idCuenta:    sesion.idCuenta,
      idUsuario:   sesion.idUsuario,
      Nombre:      sesion.Nombre,
      Apellidos:   sesion.Apellidos,
      TipoUsuario: sesion.TipoUsuario,
      NivelAcceso: sesion.NivelAcceso,
      idPuntoVenta:sesion.idPuntoVenta,
      idEstado:    sesion.idEstado,
      idPais:      sesion.idPais,
      CambiarPass: sesion.CambiarPass,
    };

    const accessToken = await reply.jwtSign(payload, { expiresIn: '15m' });
    return reply.send({ accessToken });

  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error interno' });
  }
}

export async function logout(request, reply) {
  const { refreshToken } = request.body;
  if (!refreshToken) return reply.code(400).send({ error: 'Token requerido' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('RefreshToken', sql.VarChar(500), refreshToken)
      .query(`UPDATE VIDA_SESIONES SET Status = 'INACTIVO' WHERE RefreshToken = @RefreshToken`);

    return reply.send({ message: 'Sesión cerrada correctamente' });
  } catch (err) {
    return reply.code(500).send({ error: 'Error al cerrar sesión' });
  }
}