// Búsqueda de repartidor con radio escalonado + aviso al cliente +
// cancelación automática. Corre como job cada 60s (registrado en app.js).
//
// Ciclo de vida de un pedido BUSCANDO_REPARTIDOR:
//   min 0    → despacho inicial (RadioBusquedaKm, hecho en crearPedidoApp)
//   cada IntervaloEscaladaMin → el radio crece IncrementoRadioKm (tope RadioMaxKm)
//                y se notifica SOLO a los repartidores nuevos en el anillo
//   TiempoAvisoClienteMin     → push + WS al cliente: "aún no hay repartidor",
//                la app le ofrece seguir esperando o cancelar
//   FechaLimiteBusqueda       → cancelación automática (el cliente pudo extenderla)
import { getPool, sql } from '../db/sqlserver.js';
import { broadcast } from '../ws/ws.manager.js';
import { enviarPush } from './push.service.js';
import { STATUS_ACTIVOS_REPARTIDOR } from './rutas.service.js';

// Memoria por pedido: a quién ya se le ofreció y el último radio usado.
// Si el backend se reinicia solo se re-notifica una vez — sin consecuencias.
const memoria = new Map(); // idPedido → { radio, notificados:Set<string> }

async function getCfgNum(pool, idBranch, idCuenta, clave, def) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch)
    .input('idCuenta', sql.BigInt, idCuenta)
    .input('clave', sql.VarChar(100), clave)
    .query(`SELECT Valor FROM VIDA_CONFIG_DELIVERY
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND Clave=@clave`);
  const v = r.recordset.length ? parseFloat(r.recordset[0].Valor) : NaN;
  return Number.isFinite(v) && v > 0 ? v : def;
}

// Repartidores candidatos dentro del radio con cupo para otro pedido
async function candidatos(pool, p, radioKm, maxPedidos) {
  const conUbicacion = p.LatSucursal != null && p.LonSucursal != null;
  const req = pool.request()
    .input('idBranch', sql.BigInt, p.idBranch)
    .input('idCuenta', sql.BigInt, p.idCuenta)
    .input('maxPedidos', sql.Int, maxPedidos);
  if (conUbicacion) {
    req.input('lat', sql.Float, parseFloat(p.LatSucursal))
       .input('lon', sql.Float, parseFloat(p.LonSucursal))
       .input('radioKm', sql.Float, radioKm);
  }
  const r = await req.query(`
    SELECT r.idRepartidor, r.FcmToken
    FROM VIDA_REPARTIDORES r
    WHERE r.idBranch=@idBranch AND r.idCuenta=@idCuenta AND r.Status='ACTIVO'
      AND ISNULL(r.StatusAprobacion,'APROBADO') NOT IN ('PENDIENTE','RECHAZADO')
      AND r.StatusRepartidor IN ('DISPONIBLE','OCUPADO')
      AND (SELECT COUNT(*) FROM VIDA_PEDIDOS pa
           WHERE pa.idBranch=r.idBranch AND pa.idCuenta=r.idCuenta
             AND pa.idRepartidor=r.idRepartidor
             AND pa.Status IN ('${STATUS_ACTIVOS_REPARTIDOR.join("','")}')) < @maxPedidos
      ${conUbicacion ? `
      AND (
        r.UltimaLatitud IS NULL OR r.UltimaLongitud IS NULL
        OR (6371 * ACOS(
          COS(RADIANS(@lat)) * COS(RADIANS(r.UltimaLatitud)) *
          COS(RADIANS(r.UltimaLongitud) - RADIANS(@lon)) +
          SIN(RADIANS(@lat)) * SIN(RADIANS(r.UltimaLatitud))
        )) <= @radioKm
      )` : ''}
  `);
  return r.recordset;
}

async function cancelarPorTimeout(pool, p, log) {
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    const upd = await new sql.Request(transaction)
      .input('idBranch', sql.BigInt, p.idBranch)
      .input('idCuenta', sql.BigInt, p.idCuenta)
      .input('idPedido', sql.BigInt, p.idPedido)
      .query(`UPDATE VIDA_PEDIDOS SET Status='CANCELADO', FechaMod=GETDATE()
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido
                AND Status='BUSCANDO_REPARTIDOR'`);
    if (upd.rowsAffected[0] === 0) { await transaction.rollback(); return false; }

    const histR = await new sql.Request(transaction)
      .input('idBranch', sql.BigInt, p.idBranch)
      .input('idCuenta', sql.BigInt, p.idCuenta)
      .query(`SELECT ISNULL(MAX(idHistorial),0)+1 AS next
              FROM VIDA_PEDIDOS_HISTORIAL WITH (UPDLOCK, HOLDLOCK)
              WHERE idBranch=@idBranch AND idCuenta=@idCuenta`);

    await new sql.Request(transaction)
      .input('idBranch',      sql.BigInt,      p.idBranch)
      .input('idCuenta',      sql.BigInt,      p.idCuenta)
      .input('idHistorial',   sql.BigInt,      histR.recordset[0].next)
      .input('idPedido',      sql.BigInt,      p.idPedido)
      .input('StatusAnterior',sql.VarChar(40), 'BUSCANDO_REPARTIDOR')
      .input('StatusNuevo',   sql.VarChar(40), 'CANCELADO')
      .input('UsuAlta',       sql.VarChar(20), 'SISTEMA')
      .query(`INSERT INTO VIDA_PEDIDOS_HISTORIAL
                (idBranch, idCuenta, idHistorial, idPedido, StatusAnterior, StatusNuevo, UsuAlta)
              VALUES (@idBranch, @idCuenta, @idHistorial, @idPedido, @StatusAnterior, @StatusNuevo, @UsuAlta)`);

    await transaction.commit();
    return true;
  } catch (err) {
    try { await transaction.rollback(); } catch {}
    log?.error?.('cancelarPorTimeout falló: ' + err.message);
    return false;
  }
}

export async function procesarBusquedas(log) {
  const pool = await getPool();

  const r = await pool.request().query(`
    SELECT p.idBranch, p.idCuenta, p.idPedido, p.idCliente, p.idPuntoVenta,
           p.FechaAlta, p.FechaLimiteBusqueda, p.AvisoSinRepartidor,
           p.TotalUSD, p.DireccionEntrega,
           DATEDIFF(SECOND, p.FechaAlta, GETDATE()) / 60.0 AS MinutosBuscando,
           CASE WHEN p.FechaLimiteBusqueda IS NOT NULL AND GETDATE() > p.FechaLimiteBusqueda
                THEN 1 ELSE 0 END AS Vencido,
           pv.NomComercial AS NombreSucursal,
           pv.Latitud AS LatSucursal, pv.Longitud AS LonSucursal,
           c.FcmToken AS FcmCliente
    FROM VIDA_PEDIDOS p
    LEFT JOIN VIDA_CUENTA_PUNTOS_VENTA pv
      ON pv.idBranch=p.idBranch AND pv.idCuenta=p.idCuenta AND pv.idPuntoVenta=p.idPuntoVenta
    LEFT JOIN VIDA_APP_CLIENTES c
      ON c.idBranch=p.idBranch AND c.idCuenta=p.idCuenta AND c.idCliente=p.idCliente
    WHERE p.Status='BUSCANDO_REPARTIDOR'`);

  const activos = new Set();

  for (const p of r.recordset) {
    activos.add(String(p.idPedido));
    try {
      const [radioBase, radioMax, incRadio, intervaloMin, avisoMin, cancelMin, maxPedidos] = await Promise.all([
        getCfgNum(pool, p.idBranch, p.idCuenta, 'RadioBusquedaKm', 3),
        getCfgNum(pool, p.idBranch, p.idCuenta, 'RadioMaxKm', 10),
        getCfgNum(pool, p.idBranch, p.idCuenta, 'IncrementoRadioKm', 2),
        getCfgNum(pool, p.idBranch, p.idCuenta, 'IntervaloEscaladaMin', 2),
        getCfgNum(pool, p.idBranch, p.idCuenta, 'TiempoAvisoClienteMin', 10),
        getCfgNum(pool, p.idBranch, p.idCuenta, 'TiempoCancelacionBusquedaMin', 25),
        getCfgNum(pool, p.idBranch, p.idCuenta, 'MaxPedidosPorRepartidor', 3),
      ]);

      // Pedidos viejos sin deadline (creados antes de esta feature): fijarlo
      if (!p.FechaLimiteBusqueda) {
        await pool.request()
          .input('idBranch', sql.BigInt, p.idBranch)
          .input('idCuenta', sql.BigInt, p.idCuenta)
          .input('idPedido', sql.BigInt, p.idPedido)
          .input('min', sql.Int, Math.round(cancelMin))
          .query(`UPDATE VIDA_PEDIDOS SET FechaLimiteBusqueda = DATEADD(MINUTE, @min, FechaAlta)
                  WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido
                    AND FechaLimiteBusqueda IS NULL`);
      }

      // ── 1. ¿Se venció la búsqueda? → cancelar y avisar ──────────────────
      if (p.Vencido) {
        const cancelado = await cancelarPorTimeout(pool, p, log);
        if (cancelado) {
          memoria.delete(String(p.idPedido));
          if (p.FcmCliente) {
            enviarPush(p.FcmCliente, {
              title: '😞 No encontramos repartidor',
              body: `Tu pedido #${p.idPedido} fue cancelado porque ningún repartidor pudo tomarlo. No se realizó ningún cobro.`,
              data: { tipo: 'status_pedido', idPedido: p.idPedido, status: 'CANCELADO' },
            }, log);
          }
          broadcast(p.idBranch, p.idCuenta, {
            tipo: 'status_pedido', idPedido: p.idPedido, idCliente: p.idCliente, estado: 'CANCELADO',
          });
          broadcast(p.idBranch, p.idCuenta, {
            tipo: 'pedido:actualizado', idPedido: p.idPedido, StatusNuevo: 'CANCELADO',
          });
        }
        continue;
      }

      // ── 2. Aviso al cliente si ya pasó el umbral y no se le ha avisado ──
      if (!p.AvisoSinRepartidor && p.MinutosBuscando >= avisoMin) {
        await pool.request()
          .input('idBranch', sql.BigInt, p.idBranch)
          .input('idCuenta', sql.BigInt, p.idCuenta)
          .input('idPedido', sql.BigInt, p.idPedido)
          .query(`UPDATE VIDA_PEDIDOS SET AvisoSinRepartidor=1
                  WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPedido=@idPedido`);
        if (p.FcmCliente) {
          enviarPush(p.FcmCliente, {
            title: '⏳ Seguimos buscando repartidor',
            body: `Aún nadie toma tu pedido #${p.idPedido}. Abre la app para seguir esperando o cancelarlo.`,
            data: { tipo: 'busqueda_sin_repartidor', idPedido: p.idPedido },
          }, log);
        }
        broadcast(p.idBranch, p.idCuenta, {
          tipo: 'busqueda_sin_repartidor',
          idPedido: p.idPedido,
          idCliente: p.idCliente,
          FechaLimiteBusqueda: p.FechaLimiteBusqueda,
        });
      }

      // ── 3. Escalada del radio: notificar solo a repartidores nuevos ─────
      const radio = Math.min(
        radioBase + Math.floor(p.MinutosBuscando / intervaloMin) * incRadio,
        radioMax,
      );
      const mem = memoria.get(String(p.idPedido)) ?? { radio: 0, notificados: new Set() };
      if (radio > mem.radio) {
        const reps = await candidatos(pool, p, radio, maxPedidos);
        const nuevos = reps.filter(rep => !mem.notificados.has(String(rep.idRepartidor)));
        if (nuevos.length) {
          broadcast(p.idBranch, p.idCuenta, {
            tipo: 'nuevo_pedido_disponible',
            idPedido: p.idPedido,
            idPuntoVenta: p.idPuntoVenta,
            NombreSucursal: p.NombreSucursal ?? '',
            TotalUSD: parseFloat(p.TotalUSD),
            DireccionEntrega: p.DireccionEntrega,
            repartidores: nuevos.map(x => x.idRepartidor),
          });
          enviarPush(
            nuevos.map(x => x.FcmToken).filter(Boolean),
            {
              title: '🛵 Pedido disponible cerca de ti',
              body: `${p.NombreSucursal ?? 'Sucursal'} — $${parseFloat(p.TotalUSD).toFixed(2)}`,
              data: { tipo: 'nuevo_pedido_disponible', idPedido: p.idPedido },
            },
            log,
          );
          nuevos.forEach(x => mem.notificados.add(String(x.idRepartidor)));
        }
        mem.radio = radio;
        memoria.set(String(p.idPedido), mem);
      }
    } catch (err) {
      log?.error?.(`procesarBusquedas pedido ${p.idPedido}: ${err.message}`);
    }
  }

  // Limpiar memoria de pedidos que ya no están en búsqueda
  for (const key of memoria.keys()) {
    if (!activos.has(key)) memoria.delete(key);
  }
}
