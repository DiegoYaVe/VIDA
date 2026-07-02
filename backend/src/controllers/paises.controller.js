// src/controllers/paises.controller.js
import { getPool, sql } from '../db/sqlserver.js';

async function nextId(pool, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(idPais), 0) + 1 AS nextId
            FROM VIDA_CUENTA_PAISES
            WHERE idBranch = @idBranch AND idCuenta = @idCuenta`);
  return r.recordset[0].nextId;
}

// GET /paises
export async function listarPaises(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`
        SELECT p.idPais, p.NombrePais, p.CodigoISO, p.Status,
               COUNT(e.idEstado) AS totalEstados
        FROM VIDA_CUENTA_PAISES p
        LEFT JOIN VIDA_CUENTA_ESTADOS e
          ON e.idBranch = p.idBranch AND e.idCuenta = p.idCuenta
          AND e.idPais = p.idPais AND e.Status = 'ACTIVO'
        WHERE p.idBranch = @idBranch AND p.idCuenta = @idCuenta
          AND p.Status = 'ACTIVO'
        GROUP BY p.idPais, p.NombrePais, p.CodigoISO, p.Status
        ORDER BY p.NombrePais
      `);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener países' });
  }
}

// POST /paises
export async function crearPais(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { NombrePais, CodigoISO } = request.body;

  if (!NombrePais?.trim())
    return reply.code(400).send({ error: 'El nombre del país es requerido' });

  try {
    const pool = await getPool();
    const nuevoId = await nextId(pool, idBranch, idCuenta);

    await pool.request()
      .input('idBranch',  sql.BigInt,     idBranch)
      .input('idCuenta',  sql.BigInt,     idCuenta)
      .input('idPais',    sql.BigInt,     nuevoId)
      .input('NombrePais', sql.VarChar(100), NombrePais.trim())
      .input('CodigoISO', sql.VarChar(3),  CodigoISO?.trim() || null)
      .input('UsuAlta',   sql.VarChar(20), String(idUsuario))
      .query(`INSERT INTO VIDA_CUENTA_PAISES
                (idBranch, idCuenta, idPais, NombrePais, CodigoISO, UsuAlta)
              VALUES
                (@idBranch, @idCuenta, @idPais, @NombrePais, @CodigoISO, @UsuAlta)`);

    return reply.code(201).send({ message: 'País creado', idPais: nuevoId });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al crear país' });
  }
}

// PUT /paises/:idPais
export async function editarPais(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idPais } = request.params;
  const { NombrePais, CodigoISO } = request.body;

  if (!NombrePais?.trim())
    return reply.code(400).send({ error: 'El nombre del país es requerido' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',   sql.BigInt,     idBranch)
      .input('idCuenta',   sql.BigInt,     idCuenta)
      .input('idPais',     sql.BigInt,     idPais)
      .input('NombrePais', sql.VarChar(100), NombrePais.trim())
      .input('CodigoISO',  sql.VarChar(3),  CodigoISO?.trim() || null)
      .input('UsuMod',     sql.VarChar(20), String(idUsuario))
      .query(`UPDATE VIDA_CUENTA_PAISES SET
                NombrePais = @NombrePais, CodigoISO = @CodigoISO,
                FechaMod = GETDATE(), UsuMod = @UsuMod
              WHERE idBranch = @idBranch AND idCuenta = @idCuenta AND idPais = @idPais`);

    return reply.send({ message: 'País actualizado' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al editar país' });
  }
}

// PATCH /paises/:idPais/toggle
export async function togglePais(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idPais } = request.params;
  const { status } = request.body;

  if (!['ACTIVO', 'INACTIVO'].includes(status))
    return reply.code(400).send({ error: 'Status debe ser ACTIVO o INACTIVO' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch', sql.BigInt,     idBranch)
      .input('idCuenta', sql.BigInt,     idCuenta)
      .input('idPais',   sql.BigInt,     idPais)
      .input('Status',   sql.VarChar(20), status)
      .input('UsuMod',   sql.VarChar(20), String(idUsuario))
      .query(`UPDATE VIDA_CUENTA_PAISES SET
                Status = @Status, FechaMod = GETDATE(), UsuMod = @UsuMod
              WHERE idBranch = @idBranch AND idCuenta = @idCuenta AND idPais = @idPais`);

    return reply.send({ message: `País ${status === 'ACTIVO' ? 'activado' : 'desactivado'}` });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al cambiar status' });
  }
}
