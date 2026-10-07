// src/controllers/delivery/hidratacion.js
// Seguimiento de hidratación del cliente (vasos, meta, racha y bono).
// (Separado de delivery.controller.js, que reexporta todo.)
import { getPool, sql } from '../../db/sqlserver.js';
import { getConfigVal } from './comun.js';
import { acreditarPuntosCliente } from './puntos.js';

// Cuenta días consecutivos (terminando en hoy) que cumplieron la meta.
function contarRachaHidratacion(mapaFechaVasos, hoyStr, meta) {
  let count = 0;
  const d = new Date(hoyStr + 'T00:00:00Z');
  while ((mapaFechaVasos.get(d.toISOString().slice(0, 10)) || 0) >= meta && meta > 0) {
    count++; d.setUTCDate(d.getUTCDate() - 1);
  }
  return count;
}

async function leerCfgHidratacion(pool, idBranch, idCuenta, idCliente) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idCliente', sql.BigInt, idCliente)
    .query(`SELECT ISNULL(HidratacionActiva,0) AS Activa, ISNULL(HidratacionMetaVasos,8) AS Meta, ISNULL(HidratacionMlVaso,250) AS MlVaso,
                   ISNULL(HidratacionRachaPremiada,0) AS RachaPremiada
            FROM VIDA_APP_CLIENTES WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
  const c = r.recordset[0] || {};
  return { activa: !!c.Activa, meta: c.Meta ?? 8, mlVaso: c.MlVaso ?? 250, rachaPremiada: c.RachaPremiada ?? 0 };
}

// GET /delivery/cliente/hidratacion
export async function obtenerHidratacion(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  try {
    const pool = await getPool();
    const cfg = await leerCfgHidratacion(pool, idBranch, idCuenta, idCliente);
    const logR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT CONVERT(varchar(10),Fecha,23) AS F, Vasos FROM VIDA_CLIENTE_HIDRATACION_DIA
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente
                AND Fecha >= DATEADD(DAY,-40, CAST(DATEADD(HOUR,-4,GETUTCDATE()) AS DATE))
              ORDER BY Fecha`);
    const tR = await pool.request().query(`SELECT CONVERT(varchar(10),CAST(DATEADD(HOUR,-4,GETUTCDATE()) AS DATE),23) AS T`);
    const hoyStr = tR.recordset[0].T;
    const mapa = new Map(logR.recordset.map(r => [r.F, r.Vasos]));
    const vasosHoy = mapa.get(hoyStr) || 0;
    const racha = contarRachaHidratacion(mapa, hoyStr, cfg.meta);
    // historial últimos 14 días para la gráfica
    const historial = [];
    const d = new Date(hoyStr + 'T00:00:00Z');
    for (let i = 13; i >= 0; i--) {
      const dd = new Date(d); dd.setUTCDate(d.getUTCDate() - i);
      const k = dd.toISOString().slice(0, 10);
      historial.push({ fecha: k, vasos: mapa.get(k) || 0 });
    }
    return reply.send({
      ...cfg, hoy: hoyStr, vasosHoy, racha,
      mlHoy: vasosHoy * cfg.mlVaso, metaMl: cfg.meta * cfg.mlVaso,
      historial,
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al obtener hidratación' });
  }
}

// PUT /delivery/cliente/hidratacion  { activa, meta, mlVaso }
export async function guardarHidratacion(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  const b = request.body || {};
  const meta = Math.max(1, Math.min(30, parseInt(b.meta) || 8));
  const mlVaso = Math.max(50, Math.min(1000, parseInt(b.mlVaso) || 250));
  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idCliente', sql.BigInt, idCliente)
      .input('Activa', sql.Bit, b.activa ? 1 : 0).input('Meta', sql.Int, meta).input('MlVaso', sql.Int, mlVaso)
      .query(`UPDATE VIDA_APP_CLIENTES
              SET HidratacionActiva=@Activa, HidratacionMetaVasos=@Meta, HidratacionMlVaso=@MlVaso
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
    return reply.send({ message: 'Programa actualizado', activa: !!b.activa, meta, mlVaso });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al guardar' });
  }
}

// POST /delivery/cliente/hidratacion/vaso   (+1 vaso)
export async function registrarVaso(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  try {
    const pool = await getPool();
    const cfg = await leerCfgHidratacion(pool, idBranch, idCuenta, idCliente);

    await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idCliente', sql.BigInt, idCliente)
      .query(`MERGE VIDA_CLIENTE_HIDRATACION_DIA AS t
              USING (SELECT @idBranch AS idBranch, @idCuenta AS idCuenta, @idCliente AS idCliente, CAST(DATEADD(HOUR,-4,GETUTCDATE()) AS DATE) AS Fecha) AS s
                ON (t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.idCliente=s.idCliente AND t.Fecha=s.Fecha)
              WHEN MATCHED THEN UPDATE SET Vasos = t.Vasos + 1, FechaMod=GETUTCDATE()
              WHEN NOT MATCHED THEN INSERT (idBranch,idCuenta,idCliente,Fecha,Vasos) VALUES (@idBranch,@idCuenta,@idCliente,CAST(DATEADD(HOUR,-4,GETUTCDATE()) AS DATE),1);`);

    // Releer estado + racha
    const logR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT CONVERT(varchar(10),Fecha,23) AS F, Vasos FROM VIDA_CLIENTE_HIDRATACION_DIA
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente
                AND Fecha >= DATEADD(DAY,-40, CAST(DATEADD(HOUR,-4,GETUTCDATE()) AS DATE))`);
    const tR = await pool.request().query(`SELECT CONVERT(varchar(10),CAST(DATEADD(HOUR,-4,GETUTCDATE()) AS DATE),23) AS T`);
    const hoyStr = tR.recordset[0].T;
    const mapa = new Map(logR.recordset.map(r => [r.F, r.Vasos]));
    const vasosHoy = mapa.get(hoyStr) || 0;
    const racha = contarRachaHidratacion(mapa, hoyStr, cfg.meta);

    // ── Gamificación: bono al completar un múltiplo de 7 días de racha ──────
    // Dos candados para que el bono NO se pueda farmear alternando
    // "quitar vaso" / "tomar vaso" (que vuelve a poner vasosHoy en la meta):
    //   1) Por día: se reclama con un UPDATE condicional sobre BonusPuntos, que
    //      es atómico — solo la primera llamada del día ve @@ROWCOUNT=1, aunque
    //      lleguen varias en paralelo.
    //   2) Por hito: HidratacionRachaPremiada guarda el último múltiplo de 7 ya
    //      pagado, así el mismo hito no se cobra dos veces. Si la racha se rompe
    //      y vuelve a arrancar más corta, el contador se reinicia solo.
    let bonus = 0;
    if (vasosHoy >= cfg.meta && racha > 0 && racha % 7 === 0) {
      let premiada = cfg.rachaPremiada;
      if (racha < premiada) {
        // La racha se rompió y empezó de nuevo: el historial de hitos ya no aplica
        await pool.request()
          .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idCliente', sql.BigInt, idCliente)
          .query(`UPDATE VIDA_APP_CLIENTES SET HidratacionRachaPremiada=0
                  WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
        premiada = 0;
      }
      if (racha > premiada) {
        const pts = parseInt(await getConfigVal(pool, idBranch, idCuenta, 'PuntosRachaHidratacion', '50')) || 50;
        // Reclamo del día: si otra llamada ya lo tomó, Filas=0 y no se paga.
        // Se marca ANTES de acreditar a propósito: ante un fallo posterior se
        // pierde un bono, que es preferible a pagarlo dos veces.
        const claim = await pool.request()
          .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
          .input('idCliente', sql.BigInt, idCliente).input('Pts', sql.Int, pts)
          .query(`UPDATE VIDA_CLIENTE_HIDRATACION_DIA SET BonusPuntos=@Pts
                  WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente
                    AND Fecha=CAST(DATEADD(HOUR,-4,GETUTCDATE()) AS DATE) AND ISNULL(BonusPuntos,0)=0;
                  SELECT @@ROWCOUNT AS Filas;`);
        if ((claim.recordset[0]?.Filas ?? 0) === 1) {
          await acreditarPuntosCliente(pool, idBranch, idCuenta, idCliente, pts, `Racha de ${racha} días de hidratación 💧`);
          await pool.request()
            .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
            .input('idCliente', sql.BigInt, idCliente).input('Racha', sql.Int, racha)
            .query(`UPDATE VIDA_APP_CLIENTES SET HidratacionRachaPremiada=@Racha
                    WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente`);
          bonus = pts;
        }
      }
    }
    return reply.send({ vasosHoy, meta: cfg.meta, mlHoy: vasosHoy * cfg.mlVaso, racha, bonus });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al registrar vaso' });
  }
}

// POST /delivery/cliente/hidratacion/quitar   (-1 vaso, mínimo 0)
export async function quitarVaso(request, reply) {
  const { idBranch, idCuenta, idCliente } = request.cliente;
  try {
    const pool = await getPool();
    await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idCliente', sql.BigInt, idCliente)
      .query(`UPDATE VIDA_CLIENTE_HIDRATACION_DIA SET Vasos = CASE WHEN Vasos > 0 THEN Vasos - 1 ELSE 0 END, FechaMod=GETUTCDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente AND Fecha=CAST(DATEADD(HOUR,-4,GETUTCDATE()) AS DATE)`);
    const cfg = await leerCfgHidratacion(pool, idBranch, idCuenta, idCliente);
    const hoyR = await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('idCliente', sql.BigInt, idCliente)
      .query(`SELECT ISNULL(Vasos,0) AS Vasos FROM VIDA_CLIENTE_HIDRATACION_DIA
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idCliente=@idCliente AND Fecha=CAST(DATEADD(HOUR,-4,GETUTCDATE()) AS DATE)`);
    const vasosHoy = hoyR.recordset[0]?.Vasos ?? 0;
    return reply.send({ vasosHoy, meta: cfg.meta, mlHoy: vasosHoy * cfg.mlVaso });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Error al quitar vaso' });
  }
}
