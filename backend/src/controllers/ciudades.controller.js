// src/controllers/ciudades.controller.js
import { getPool, sql } from '../db/sqlserver.js';

async function nextId(pool, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(idCiudad), 0) + 1 AS nextId
            FROM VIDA_CUENTA_CIUDADES
            WHERE idBranch = @idBranch AND idCuenta = @idCuenta`);
  return r.recordset[0].nextId;
}

// GET /ciudades?idEstado=X   (opcional idPais para filtrar por país completo)
export async function listarCiudades(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idEstado, idPais } = request.query;

  try {
    const pool = await getPool();
    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta);

    let whereExtra = '';
    if (idEstado) {
      req.input('idEstado', sql.BigInt, idEstado);
      whereExtra += ' AND c.idEstado = @idEstado';
    }
    if (idPais) {
      req.input('idPais', sql.BigInt, idPais);
      whereExtra += ' AND c.idPais = @idPais';
    }

    const r = await req.query(`
      SELECT c.idCiudad, c.idEstado, c.idPais, c.NombreCiudad, c.Status
      FROM VIDA_CUENTA_CIUDADES c
      WHERE c.idBranch = @idBranch AND c.idCuenta = @idCuenta
        AND c.Status = 'ACTIVO'
        ${whereExtra}
      ORDER BY c.NombreCiudad
    `);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener ciudades' });
  }
}

// POST /ciudades   { idEstado, NombreCiudad }
// Permite agregar una ciudad que no esté en el catálogo base.
export async function crearCiudad(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { idEstado, NombreCiudad } = request.body;

  if (!idEstado || !NombreCiudad?.trim())
    return reply.code(400).send({ error: 'Estado y nombre de la ciudad son requeridos' });

  try {
    const pool = await getPool();

    // El estado debe existir y de él tomamos el idPais
    const estado = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idEstado', sql.BigInt, idEstado)
      .query(`SELECT idPais FROM VIDA_CUENTA_ESTADOS
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=@idEstado AND Status='ACTIVO'`);

    if (!estado.recordset.length)
      return reply.code(404).send({ error: 'Estado no encontrado' });

    const idPais = estado.recordset[0].idPais;

    // Evitar duplicados por (estado, nombre)
    const dup = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .input('idEstado', sql.BigInt, idEstado)
      .input('Nombre',   sql.VarChar(120), NombreCiudad.trim())
      .query(`SELECT TOP 1 idCiudad FROM VIDA_CUENTA_CIUDADES
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idEstado=@idEstado
                AND NombreCiudad=@Nombre`);
    if (dup.recordset.length)
      return reply.code(409).send({ error: 'Esa ciudad ya existe en el estado', idCiudad: dup.recordset[0].idCiudad });

    const nuevoId = await nextId(pool, idBranch, idCuenta);

    await pool.request()
      .input('idBranch',     sql.BigInt,      idBranch)
      .input('idCuenta',     sql.BigInt,      idCuenta)
      .input('idCiudad',     sql.BigInt,      nuevoId)
      .input('idEstado',     sql.BigInt,      idEstado)
      .input('idPais',       sql.BigInt,      idPais)
      .input('NombreCiudad', sql.VarChar(120), NombreCiudad.trim())
      .input('UsuAlta',      sql.VarChar(20),  String(idUsuario))
      .query(`INSERT INTO VIDA_CUENTA_CIUDADES
                (idBranch, idCuenta, idCiudad, idEstado, idPais, NombreCiudad, UsuAlta)
              VALUES
                (@idBranch, @idCuenta, @idCiudad, @idEstado, @idPais, @NombreCiudad, @UsuAlta)`);

    return reply.code(201).send({ message: 'Ciudad creada', idCiudad: nuevoId });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al crear ciudad' });
  }
}
