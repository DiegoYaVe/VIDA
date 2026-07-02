// src/controllers/estados.controller.js
import { getPool, sql } from '../db/sqlserver.js';

async function nextId(pool, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(idEstado), 0) + 1 AS nextId
            FROM VIDA_CUENTA_ESTADOS
            WHERE idBranch = @idBranch AND idCuenta = @idCuenta`);
  return r.recordset[0].nextId;
}

// GET /estados?idPais=X
export async function listarEstados(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idPais } = request.query;

  try {
    const pool = await getPool();
    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta);

    let whereExtra = '';
    if (idPais) {
      req.input('idPais', sql.BigInt, idPais);
      whereExtra = 'AND e.idPais = @idPais';
    }

    const r = await req.query(`
      SELECT e.idEstado, e.idPais, e.NombreEstado, e.Status,
             p.NombrePais,
             COUNT(pv.idPuntoVenta) AS totalSucursales
      FROM VIDA_CUENTA_ESTADOS e
      INNER JOIN VIDA_CUENTA_PAISES p
        ON p.idBranch = e.idBranch AND p.idCuenta = e.idCuenta AND p.idPais = e.idPais
      LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv
        ON pv.idBranch = e.idBranch AND pv.idCuenta = e.idCuenta
        AND pv.idEstado = e.idEstado AND pv.Status = 'ACTIVO'
      WHERE e.idBranch = @idBranch AND e.idCuenta = @idCuenta
        AND e.Status = 'ACTIVO'
        ${whereExtra}
      GROUP BY e.idEstado, e.idPais, e.NombreEstado, e.Status, p.NombrePais
      ORDER BY p.NombrePais, e.NombreEstado
    `);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener estados' });
  }
}

// POST /estados
export async function crearEstado(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idPais, NombreEstado } = request.body;

  if (!idPais || !NombreEstado?.trim())
    return reply.code(400).send({ error: 'País y nombre del estado son requeridos' });

  try {
    const pool = await getPool();

    // Validar que el país existe
    const paisExiste = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idPais',   sql.BigInt, idPais)
      .query(`SELECT 1 FROM VIDA_CUENTA_PAISES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPais=@idPais AND Status='ACTIVO'`);

    if (!paisExiste.recordset.length)
      return reply.code(404).send({ error: 'País no encontrado' });

    const nuevoId = await nextId(pool, idBranch, idCuenta);

    await pool.request()
      .input('idBranch',     sql.BigInt,     idBranch)
      .input('idCuenta',     sql.BigInt,     idCuenta)
      .input('idEstado',     sql.BigInt,     nuevoId)
      .input('idPais',       sql.BigInt,     idPais)
      .input('NombreEstado', sql.VarChar(100), NombreEstado.trim())
      .input('UsuAlta',      sql.VarChar(20), String(idUsuario))
      .query(`INSERT INTO VIDA_CUENTA_ESTADOS
                (idBranch, idCuenta, idEstado, idPais, NombreEstado, UsuAlta)
              VALUES
                (@idBranch, @idCuenta, @idEstado, @idPais, @NombreEstado, @UsuAlta)`);

    return reply.code(201).send({ message: 'Estado creado', idEstado: nuevoId });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al crear estado' });
  }
}

// PUT /estados/:idEstado
export async function editarEstado(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idEstado } = request.params;
  const { idPais, NombreEstado } = request.body;

  if (!idPais || !NombreEstado?.trim())
    return reply.code(400).send({ error: 'País y nombre del estado son requeridos' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',     sql.BigInt,     idBranch)
      .input('idCuenta',     sql.BigInt,     idCuenta)
      .input('idEstado',     sql.BigInt,     idEstado)
      .input('idPais',       sql.BigInt,     idPais)
      .input('NombreEstado', sql.VarChar(100), NombreEstado.trim())
      .input('UsuMod',       sql.VarChar(20), String(idUsuario))
      .query(`UPDATE VIDA_CUENTA_ESTADOS SET
                idPais = @idPais, NombreEstado = @NombreEstado,
                FechaMod = GETDATE(), UsuMod = @UsuMod
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=@idEstado`);

    return reply.send({ message: 'Estado actualizado' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al editar estado' });
  }
}

// PATCH /estados/:idEstado/toggle
export async function toggleEstado(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idEstado } = request.params;
  const { status } = request.body;

  if (!['ACTIVO', 'INACTIVO'].includes(status))
    return reply.code(400).send({ error: 'Status debe ser ACTIVO o INACTIVO' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch', sql.BigInt,     idBranch)
      .input('idCuenta', sql.BigInt,     idCuenta)
      .input('idEstado', sql.BigInt,     idEstado)
      .input('Status',   sql.VarChar(20), status)
      .input('UsuMod',   sql.VarChar(20), String(idUsuario))
      .query(`UPDATE VIDA_CUENTA_ESTADOS SET
                Status = @Status, FechaMod = GETDATE(), UsuMod = @UsuMod
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=@idEstado`);

    return reply.send({ message: `Estado ${status === 'ACTIVO' ? 'activado' : 'desactivado'}` });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al cambiar status' });
  }
}
