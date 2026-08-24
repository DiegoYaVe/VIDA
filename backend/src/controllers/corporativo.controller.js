// src/controllers/corporativo.controller.js
// Portal Corporativo (T-0050/51/52): tablero de expansión de la red,
// listado de tiendas con su estado de onboarding, alta de tienda para
// onboarding y cambio de estado. El empresario (usuario dueño) se crea
// reutilizando el endpoint de usuarios existente.
import { getPool, sql } from '../db/sqlserver.js';

// Meta de expansión de la red hacia 2035 (ajustable)
export const META_TIENDAS = 16291;

const ESTADOS = ['PROSPECTO', 'EN_PROCESO', 'ACTIVA', 'SUSPENDIDA'];

async function nextId(pool, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT ISNULL(MAX(idPuntoVenta),0)+1 AS n FROM VIDA_CUENTA_PUNTOS_VENTA
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);
  return r.recordset[0].n;
}

// ══════════════════════════════════════════════════════════════════════════
// GET /corporativo/tablero — métricas de expansión de la red
// ══════════════════════════════════════════════════════════════════════════
export async function tableroExpansion(request, reply) {
  const { idBranch, idCuenta } = request.user;
  try {
    const pool = await getPool();

    // Por estado de onboarding (NULL histórico se cuenta como ACTIVA)
    const porEstado = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT ISNULL(EstadoOnboarding,'ACTIVA') AS Estado, COUNT(*) AS Total
              FROM VIDA_CUENTA_PUNTOS_VENTA
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO'
              GROUP BY ISNULL(EstadoOnboarding,'ACTIVA')`);

    // Distribución geográfica (por estado geográfico y ciudad)
    const porGeografia = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT ISNULL(Pais,'—') AS Pais, ISNULL(Estado,'—') AS Estado,
                     COUNT(*) AS Total
              FROM VIDA_CUENTA_PUNTOS_VENTA
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO'
              GROUP BY ISNULL(Pais,'—'), ISNULL(Estado,'—')
              ORDER BY Total DESC`);

    // Crecimiento por mes (altas de los últimos 12 meses)
    const crecimiento = await pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta)
      .query(`SELECT FORMAT(ISNULL(FechaActivacion, FechaAlta), 'yyyy-MM') AS Mes,
                     COUNT(*) AS Total
              FROM VIDA_CUENTA_PUNTOS_VENTA
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Status='ACTIVO'
                AND ISNULL(FechaActivacion, FechaAlta) >= DATEADD(MONTH, -11, CAST(GETDATE() AS DATE))
              GROUP BY FORMAT(ISNULL(FechaActivacion, FechaAlta), 'yyyy-MM')
              ORDER BY Mes`);

    const estados = {};
    porEstado.recordset.forEach(r => { estados[r.Estado] = r.Total; });
    const activas = estados.ACTIVA || 0;

    return reply.send({
      meta: META_TIENDAS,
      activas,
      porcentajeMeta: +((activas / META_TIENDAS) * 100).toFixed(2),
      totalTiendas: porEstado.recordset.reduce((s, r) => s + r.Total, 0),
      porEstado: estados,
      porGeografia: porGeografia.recordset,
      crecimientoMensual: crecimiento.recordset,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al cargar el tablero de expansión' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// GET /corporativo/tiendas — tiendas de la red con su estado de onboarding
// ══════════════════════════════════════════════════════════════════════════
export async function listarTiendasRed(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { estado } = request.query;
  try {
    const pool = await getPool();
    const req = pool.request()
      .input('idBranch', sql.BigInt, idBranch)
      .input('idCuenta', sql.BigInt, idCuenta);
    let filtro = '';
    if (estado && ESTADOS.includes(estado)) { req.input('est', sql.VarChar(20), estado); filtro = " AND ISNULL(pv.EstadoOnboarding,'ACTIVA')=@est"; }

    const r = await req.query(`
      SELECT pv.idPuntoVenta, pv.NomComercial, pv.Encargado, pv.Ciudad, pv.Estado, pv.Pais,
             pv.Telefono, pv.Correo, ISNULL(pv.EstadoOnboarding,'ACTIVA') AS EstadoOnboarding,
             pv.FechaAlta, pv.FechaActivacion, pv.EsMatriz,
             -- empresario (usuario ADMIN dueño de la tienda)
             (SELECT TOP 1 u.Nombre + ' ' + ISNULL(u.Apellidos,'')
              FROM VIDA_CUENTA_USUARIOS u
              WHERE u.idBranch=pv.idBranch AND u.idCuenta=pv.idCuenta
                AND u.idPuntoVenta=pv.idPuntoVenta AND u.TipoUsuario='ADMIN' AND u.Status='ACTIVO'
              ORDER BY u.idUsuario) AS Empresario
      FROM VIDA_CUENTA_PUNTOS_VENTA pv
      WHERE pv.idBranch=@idBranch AND pv.idCuenta=@idCuenta AND pv.Status='ACTIVO' ${filtro}
      ORDER BY pv.NomComercial`);
    return reply.send(r.recordset);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al listar las tiendas de la red' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// POST /corporativo/tiendas — alta de tienda para onboarding (EN_PROCESO)
// El empresario se crea aparte con el endpoint de usuarios.
// ══════════════════════════════════════════════════════════════════════════
export async function crearTiendaRed(request, reply) {
  const { idBranch, idCuenta, idUsuario } = request.user;
  const { NomComercial, Nombre, Encargado, Correo, Telefono,
          Calle, Ciudad, idCiudad, idEstado, idPais, EstadoOnboarding } = request.body || {};
  if (!NomComercial?.trim() && !Nombre?.trim())
    return reply.code(400).send({ error: 'El nombre comercial es obligatorio' });

  const estadoInicial = ESTADOS.includes(EstadoOnboarding) ? EstadoOnboarding : 'EN_PROCESO';

  try {
    const pool = await getPool();
    const idPuntoVenta = await nextId(pool, idBranch, idCuenta);
    await pool.request()
      .input('idBranch',        sql.BigInt,       idBranch)
      .input('idCuenta',        sql.BigInt,       idCuenta)
      .input('idPuntoVenta',    sql.BigInt,       idPuntoVenta)
      .input('Nombre',          sql.VarChar(200), (Nombre || NomComercial).trim())
      .input('NomComercial',    sql.VarChar(200), (NomComercial || Nombre).trim())
      .input('Encargado',       sql.VarChar(200), Encargado?.trim() || null)
      .input('Correo',          sql.VarChar(100), Correo?.trim() || null)
      .input('Telefono',        sql.VarChar(50),  Telefono?.trim() || null)
      .input('Calle',           sql.VarChar(200), Calle?.trim() || null)
      .input('Ciudad',          sql.VarChar(200), Ciudad?.trim() || null)
      .input('idCiudad',        sql.BigInt,       idCiudad || null)
      .input('idEstado',        sql.BigInt,       idEstado || null)
      .input('idPais',          sql.BigInt,       idPais || null)
      .input('EstadoOnboarding',sql.VarChar(20),  estadoInicial)
      .input('FechaActivacion', sql.DateTime,     estadoInicial === 'ACTIVA' ? new Date() : null)
      .input('UsuAlta',         sql.VarChar(20),  String(idUsuario))
      .query(`INSERT INTO VIDA_CUENTA_PUNTOS_VENTA
                (idBranch,idCuenta,idPuntoVenta,Nombre,NomComercial,TipoPuntoVenta,
                 Encargado,Correo,Telefono,Calle,Ciudad,idCiudad,idEstado,idPais,
                 EstadoOnboarding,FechaActivacion,StatusPuntoVenta,Status,UsuAlta)
              VALUES
                (@idBranch,@idCuenta,@idPuntoVenta,@Nombre,@NomComercial,'TIENDA',
                 @Encargado,@Correo,@Telefono,@Calle,@Ciudad,@idCiudad,@idEstado,@idPais,
                 @EstadoOnboarding,@FechaActivacion,'ACTIVO','ACTIVO',@UsuAlta)`);
    return reply.code(201).send({ idPuntoVenta, EstadoOnboarding: estadoInicial });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al crear la tienda' });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// PATCH /corporativo/tiendas/:idPuntoVenta/onboarding { EstadoOnboarding }
// ══════════════════════════════════════════════════════════════════════════
export async function cambiarEstadoOnboarding(request, reply) {
  const { idBranch, idCuenta } = request.user;
  const { idPuntoVenta } = request.params;
  const { EstadoOnboarding } = request.body || {};
  if (!ESTADOS.includes(EstadoOnboarding))
    return reply.code(400).send({ error: 'Estado de onboarding inválido', estados: ESTADOS });

  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch',        sql.BigInt,       idBranch)
      .input('idCuenta',        sql.BigInt,       idCuenta)
      .input('idPuntoVenta',    sql.BigInt,       idPuntoVenta)
      .input('EstadoOnboarding',sql.VarChar(20),  EstadoOnboarding)
      // Al activar por primera vez se sella la fecha de activación
      .query(`UPDATE VIDA_CUENTA_PUNTOS_VENTA
              SET EstadoOnboarding=@EstadoOnboarding,
                  FechaActivacion = CASE WHEN @EstadoOnboarding='ACTIVA' AND FechaActivacion IS NULL
                                         THEN GETDATE() ELSE FechaActivacion END,
                  FechaMod = GETDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@idPuntoVenta`);
    return reply.send({ ok: true, EstadoOnboarding });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al cambiar el estado de onboarding' });
  }
}
