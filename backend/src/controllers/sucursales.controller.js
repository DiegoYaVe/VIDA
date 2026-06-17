// src/controllers/sucursales.controller.js
import { getPool, sql } from '../db/sqlserver.js';

async function nextId(pool, tabla, campo, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(${campo}), 0) + 1 AS nextId
            FROM ${tabla}
            WHERE idBranch = @idBranch AND idCuenta = @idCuenta`);
  return r.recordset[0].nextId;
}

export async function listarPuntosVenta(request, reply) {
  const { idBranch, idCuenta, TipoUsuario, idPuntoVenta } = request.user;
  const ROLES_ADMIN = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN'];
  const esAdmin = ROLES_ADMIN.includes(TipoUsuario);

  try {
    const pool = await getPool();
    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta);

    let whereExtra = '';
    if (!esAdmin) {
      req.input('idPuntoVenta', sql.BigInt, idPuntoVenta);
      whereExtra = 'AND idPuntoVenta = @idPuntoVenta';
    }

    const r = await req.query(`
      SELECT idPuntoVenta, Nombre, NomComercial, TipoPuntoVenta,
             Correo, Telefono, Encargado,
             Calle, NumExt, NumInt, Colonia, CP, Ciudad, Estado, Pais,
             Latitud, Longitud, StatusPuntoVenta, Status, FechaAlta
      FROM VIDA_CUENTA_PUNTOS_VENTA
      WHERE idBranch = @idBranch AND idCuenta = @idCuenta
      ${whereExtra}
      ORDER BY NomComercial
    `);

    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener puntos de venta' });
  }
}

export async function crearPuntoVenta(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const {
    Nombre, NomComercial, TipoPuntoVenta,
    Correo, Telefono, Encargado,
    Calle, NumExt, NumInt, Colonia, CP, Ciudad, Estado, Pais,
  } = request.body;

  if (!Nombre) return reply.code(400).send({ error: 'El nombre es requerido' });

  try {
    const pool = await getPool();
    const nuevoId = await nextId(pool, 'VIDA_CUENTA_PUNTOS_VENTA', 'idPuntoVenta', idBranch, idCuenta);

    await pool.request()
      .input('idBranch',      sql.BigInt,      idBranch)
      .input('idCuenta',      sql.BigInt,      idCuenta)
      .input('idPuntoVenta',  sql.BigInt,      nuevoId)
      .input('Nombre',        sql.VarChar(200), Nombre)
      .input('NomComercial',  sql.VarChar(200), NomComercial || Nombre)
      .input('TipoPuntoVenta',sql.VarChar(50),  TipoPuntoVenta || 'TIENDA')
      .input('Correo',        sql.VarChar(100), Correo || null)
      .input('Telefono',      sql.VarChar(50),  Telefono || null)
      .input('Encargado',     sql.VarChar(200), Encargado || null)
      .input('Calle',         sql.VarChar(200), Calle || null)
      .input('NumExt',        sql.VarChar(20),  NumExt || null)
      .input('NumInt',        sql.VarChar(20),  NumInt || null)
      .input('Colonia',       sql.VarChar(100), Colonia || null)
      .input('CP',            sql.VarChar(10),  CP || null)
      .input('Ciudad',        sql.VarChar(100), Ciudad || null)
      .input('Estado',        sql.VarChar(100), Estado || null)
      .input('Pais',          sql.VarChar(100), Pais || null)
      .input('UsuAlta',       sql.VarChar(20),  String(idUsuario))
      .query(`INSERT INTO VIDA_CUENTA_PUNTOS_VENTA
                (idBranch, idCuenta, idPuntoVenta, Nombre, NomComercial, TipoPuntoVenta,
                 Correo, Telefono, Encargado, Calle, NumExt, NumInt, Colonia, CP,
                 Ciudad, Estado, Pais, UsuAlta)
              VALUES
                (@idBranch, @idCuenta, @idPuntoVenta, @Nombre, @NomComercial, @TipoPuntoVenta,
                 @Correo, @Telefono, @Encargado, @Calle, @NumExt, @NumInt, @Colonia, @CP,
                 @Ciudad, @Estado, @Pais, @UsuAlta)`);

    return reply.code(201).send({ message: 'Punto de venta creado', idPuntoVenta: nuevoId });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al crear: ' + err.message });
  }
}

export async function editarPuntoVenta(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idPuntoVenta } = request.params;
  const {
    Nombre, NomComercial, TipoPuntoVenta,
    Correo, Telefono, Encargado,
    Calle, NumExt, NumInt, Colonia, CP, Ciudad, Estado, Pais,
  } = request.body;

  if (!Nombre) return reply.code(400).send({ error: 'El nombre es requerido' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',      sql.BigInt,      idBranch)
      .input('idCuenta',      sql.BigInt,      idCuenta)
      .input('idPuntoVenta',  sql.BigInt,      idPuntoVenta)
      .input('Nombre',        sql.VarChar(200), Nombre)
      .input('NomComercial',  sql.VarChar(200), NomComercial || Nombre)
      .input('TipoPuntoVenta',sql.VarChar(50),  TipoPuntoVenta || 'TIENDA')
      .input('Correo',        sql.VarChar(100), Correo || null)
      .input('Telefono',      sql.VarChar(50),  Telefono || null)
      .input('Encargado',     sql.VarChar(200), Encargado || null)
      .input('Calle',         sql.VarChar(200), Calle || null)
      .input('NumExt',        sql.VarChar(20),  NumExt || null)
      .input('NumInt',        sql.VarChar(20),  NumInt || null)
      .input('Colonia',       sql.VarChar(100), Colonia || null)
      .input('CP',            sql.VarChar(10),  CP || null)
      .input('Ciudad',        sql.VarChar(100), Ciudad || null)
      .input('Estado',        sql.VarChar(100), Estado || null)
      .input('Pais',          sql.VarChar(100), Pais || null)
      .input('UsuMod',        sql.VarChar(20),  String(idUsuario))
      .query(`UPDATE VIDA_CUENTA_PUNTOS_VENTA SET
                Nombre=@Nombre, NomComercial=@NomComercial, TipoPuntoVenta=@TipoPuntoVenta,
                Correo=@Correo, Telefono=@Telefono, Encargado=@Encargado,
                Calle=@Calle, NumExt=@NumExt, NumInt=@NumInt, Colonia=@Colonia,
                CP=@CP, Ciudad=@Ciudad, Estado=@Estado, Pais=@Pais,
                FechaMod=GETDATE(), UsuMod=@UsuMod
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@idPuntoVenta`);

    return reply.send({ message: 'Punto de venta actualizado' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al editar: ' + err.message });
  }
}

export async function togglePuntoVenta(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idPuntoVenta } = request.params;
  const { status } = request.body;

  if (!['ACTIVO', 'INACTIVO'].includes(status))
    return reply.code(400).send({ error: 'Status debe ser ACTIVO o INACTIVO' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',     sql.BigInt,     idBranch)
      .input('idCuenta',     sql.BigInt,     idCuenta)
      .input('idPuntoVenta', sql.BigInt,     idPuntoVenta)
      .input('Status',       sql.VarChar(20), status)
      .input('UsuMod',       sql.VarChar(20), String(idUsuario))
      .query(`UPDATE VIDA_CUENTA_PUNTOS_VENTA SET
                StatusPuntoVenta=@Status,
                FechaMod=GETDATE(), UsuMod=@UsuMod
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@idPuntoVenta`);

    return reply.send({ message: `Punto de venta ${status === 'ACTIVO' ? 'activado' : 'desactivado'}` });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al cambiar status' });
  }
}
