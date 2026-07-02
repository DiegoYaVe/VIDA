// src/controllers/sucursales.controller.js
import { getPool, sql } from '../db/sqlserver.js';

async function nextId(pool, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(idPuntoVenta), 0) + 1 AS nextId
            FROM VIDA_CUENTA_PUNTOS_VENTA
            WHERE idBranch = @idBranch AND idCuenta = @idCuenta`);
  return r.recordset[0].nextId;
}

// GET /sucursales/puntos-venta
export async function listarPuntosVenta(request, reply) {
  const { idBranch, idCuenta, TipoUsuario, idPuntoVenta, idPais, idEstado } = request.user;

  try {
    const pool = await getPool();
    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta);

    let whereExtra = '';

    if (TipoUsuario === 'ADMIN_PAIS' && idPais) {
      req.input('idPais', sql.BigInt, idPais);
      whereExtra = 'AND pv.idPais = @idPais';
    } else if (TipoUsuario === 'ADMIN_ESTADO' && idEstado) {
      req.input('idEstado', sql.BigInt, idEstado);
      whereExtra = 'AND pv.idEstado = @idEstado';
    } else if (['ADMIN', 'SUPERVISOR', 'CAJERO', 'CASHIER'].includes(TipoUsuario) && idPuntoVenta) {
      req.input('idPuntoVenta', sql.BigInt, idPuntoVenta);
      whereExtra = 'AND pv.idPuntoVenta = @idPuntoVenta';
    }
    // SUPER_ADMIN: sin filtro, ve todo

    const r = await req.query(`
      SELECT pv.idPuntoVenta, pv.Nombre, pv.NomComercial, pv.TipoPuntoVenta,
             pv.Correo, pv.Telefono, pv.Encargado,
             pv.Calle, pv.NumExt, pv.NumInt, pv.Colonia, pv.CP,
             pv.Ciudad, pv.idEstado, pv.idPais,
             pv.Latitud, pv.Longitud, pv.StatusPuntoVenta, pv.Status, pv.FechaAlta,
             e.NombreEstado, p.NombrePais
      FROM VIDA_CUENTA_PUNTOS_VENTA pv
      LEFT JOIN VIDA_CUENTA_ESTADOS e
        ON e.idBranch = pv.idBranch AND e.idCuenta = pv.idCuenta AND e.idEstado = pv.idEstado
      LEFT JOIN VIDA_CUENTA_PAISES p
        ON p.idBranch = pv.idBranch AND p.idCuenta = pv.idCuenta AND p.idPais = pv.idPais
      WHERE pv.idBranch = @idBranch AND pv.idCuenta = @idCuenta
        AND pv.Status = 'ACTIVO'
        ${whereExtra}
      ORDER BY p.NombrePais, e.NombreEstado, pv.NomComercial
    `);

    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener puntos de venta' });
  }
}

// POST /sucursales/puntos-venta
export async function crearPuntoVenta(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const {
    Nombre, NomComercial, TipoPuntoVenta,
    Correo, Telefono, Encargado,
    Calle, NumExt, NumInt, Colonia, CP, Ciudad,
    idEstado, idPais,
  } = request.body;

  if (!Nombre) return reply.code(400).send({ error: 'El nombre es requerido' });
  if (!idPais)   return reply.code(400).send({ error: 'El país es requerido' });
  if (!idEstado) return reply.code(400).send({ error: 'El estado es requerido' });

  try {
    const pool = await getPool();
    const nuevoId = await nextId(pool, idBranch, idCuenta);

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
      .input('idEstado',      sql.BigInt,       idEstado)
      .input('idPais',        sql.BigInt,       idPais)
      .input('UsuAlta',       sql.VarChar(20),  String(idUsuario))
      .query(`INSERT INTO VIDA_CUENTA_PUNTOS_VENTA
                (idBranch, idCuenta, idPuntoVenta, Nombre, NomComercial, TipoPuntoVenta,
                 Correo, Telefono, Encargado, Calle, NumExt, NumInt, Colonia, CP,
                 Ciudad, idEstado, idPais, UsuAlta)
              VALUES
                (@idBranch, @idCuenta, @idPuntoVenta, @Nombre, @NomComercial, @TipoPuntoVenta,
                 @Correo, @Telefono, @Encargado, @Calle, @NumExt, @NumInt, @Colonia, @CP,
                 @Ciudad, @idEstado, @idPais, @UsuAlta)`);

    return reply.code(201).send({ message: 'Punto de venta creado', idPuntoVenta: nuevoId });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al crear: ' + err.message });
  }
}

// PUT /sucursales/puntos-venta/:idPuntoVenta
export async function editarPuntoVenta(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idPuntoVenta } = request.params;
  const {
    Nombre, NomComercial, TipoPuntoVenta,
    Correo, Telefono, Encargado,
    Calle, NumExt, NumInt, Colonia, CP, Ciudad,
    idEstado, idPais,
  } = request.body;

  if (!Nombre)   return reply.code(400).send({ error: 'El nombre es requerido' });
  if (!idPais)   return reply.code(400).send({ error: 'El país es requerido' });
  if (!idEstado) return reply.code(400).send({ error: 'El estado es requerido' });

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
      .input('idEstado',      sql.BigInt,       idEstado)
      .input('idPais',        sql.BigInt,       idPais)
      .input('UsuMod',        sql.VarChar(20),  String(idUsuario))
      .query(`UPDATE VIDA_CUENTA_PUNTOS_VENTA SET
                Nombre=@Nombre, NomComercial=@NomComercial, TipoPuntoVenta=@TipoPuntoVenta,
                Correo=@Correo, Telefono=@Telefono, Encargado=@Encargado,
                Calle=@Calle, NumExt=@NumExt, NumInt=@NumInt, Colonia=@Colonia,
                CP=@CP, Ciudad=@Ciudad, idEstado=@idEstado, idPais=@idPais,
                FechaMod=GETDATE(), UsuMod=@UsuMod
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@idPuntoVenta`);

    return reply.send({ message: 'Punto de venta actualizado' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al editar: ' + err.message });
  }
}

// PATCH /sucursales/puntos-venta/:idPuntoVenta/toggle
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
