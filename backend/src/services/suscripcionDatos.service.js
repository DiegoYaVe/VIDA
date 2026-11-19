// src/services/suscripcionDatos.service.js
// Lado BD de la afiliación y mensualidad de las tiendas (sql/63). Las reglas
// están en suscripcion.service.js; aquí se leen los cargos, se emiten las
// mensualidades y multas (job diario) y se responde si una tienda está
// suspendida (con caché corto, porque se consulta en cada petición).
import { getPool, sql } from '../db/sqlserver.js';
import { emitirCuenta } from './cuentas.service.js';
import { prepararMoneda } from './moneda.service.js';
import { idPuntoVentaMatriz } from './alcance.service.js';
import {
  ORIGEN, periodoDe, nombrePeriodo, fechaVencimiento, origenPeriodo, diasEntre, hoyVenezuela,
  periodosACobrar, estadoSuscripcion, mensualidadesParaMulta,
} from './suscripcion.service.js';

// Configuración (VIDA_CONFIG_DELIVERY, clave/valor). El corte nace APAGADO:
// hasta que VIDA lo encienda, nadie queda suspendido aunque deba.
export const CONFIG_DEF = {
  SuscripcionDiaVencimiento: '5',
  SuscripcionDiasTolerancia: '5',
  SuscripcionMultaUSD: '0',
  SuscripcionCorteActivo: '0',
};

export async function leerConfigSuscripcion(pool, idBranch, idCuenta) {
  const r = await pool.request()
    .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
    .query(`SELECT Clave, Valor FROM VIDA_CONFIG_DELIVERY
            WHERE idBranch=@idBranch AND idCuenta=@idCuenta
              AND Clave IN (${Object.keys(CONFIG_DEF).map(k => `'${k}'`).join(',')}, 'DatosPagoVida')`);
  const m = { ...CONFIG_DEF, DatosPagoVida: null };
  for (const row of r.recordset) m[row.Clave] = row.Valor;
  return {
    DiaVencimiento: parseInt(m.SuscripcionDiaVencimiento) || 5,
    DiasTolerancia: Math.max(0, parseInt(m.SuscripcionDiasTolerancia) || 0),
    MultaUSD: Math.max(0, Number(m.SuscripcionMultaUSD) || 0),
    CorteActivo: m.SuscripcionCorteActivo === '1',
    DatosPagoVida: m.DatosPagoVida,
  };
}

export async function guardarConfigSuscripcion(pool, idBranch, idCuenta, valores) {
  for (const [Clave, Valor] of Object.entries(valores)) {
    await pool.request()
      .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
      .input('Clave', sql.VarChar(100), Clave).input('Valor', sql.VarChar(500), Valor == null ? '' : String(Valor).slice(0, 500))
      .query(`MERGE VIDA_CONFIG_DELIVERY AS t
              USING (SELECT @idBranch AS idBranch, @idCuenta AS idCuenta, @Clave AS Clave) AS s
                ON t.idBranch=s.idBranch AND t.idCuenta=s.idCuenta AND t.Clave=s.Clave
              WHEN MATCHED THEN UPDATE SET Valor=@Valor
              WHEN NOT MATCHED THEN INSERT (idBranch, idCuenta, Clave, Valor) VALUES (@idBranch, @idCuenta, @Clave, @Valor);`);
  }
  limpiarCache();
}

// Cargos de suscripción de una o todas las tiendas, con su saldo.
export async function cargosSuscripcion(pool, idBranch, idCuenta, idPuntoVenta = null, soloConSaldo = true) {
  const req = pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta);
  if (idPuntoVenta != null) req.input('pv', sql.BigInt, idPuntoVenta);
  const r = await req.query(`
    SELECT c.idDocumento, c.idPuntoVenta, c.OrigenTipo, c.idOrigen, c.TotalUSD, c.Notas,
           CONVERT(char(10), c.FechaVencimiento, 23) AS FechaVencimiento, c.Status,
           c.TotalUSD - ISNULL(ab.Abonado,0) - ISNULL(nc.Acreditado,0) AS Saldo
    FROM VIDA_CUENTAS c
    OUTER APPLY (SELECT SUM(a.MontoUSD) AS Abonado FROM VIDA_CUENTAS_ABONOS a
                 WHERE a.idBranch=c.idBranch AND a.idCuenta=c.idCuenta AND a.idDocumento=c.idDocumento) ab
    OUTER APPLY (SELECT SUM(n.MontoUSD) AS Acreditado FROM VIDA_CUENTAS_NOTAS_CREDITO n
                 WHERE n.idBranch=c.idBranch AND n.idCuenta=c.idCuenta AND n.idDocumento=c.idDocumento) nc
    WHERE c.idBranch=@idBranch AND c.idCuenta=@idCuenta AND c.Tipo='CXC'
      AND c.OrigenTipo IN ('${ORIGEN.INSCRIPCION}','${ORIGEN.MENSUALIDAD}','${ORIGEN.MULTA}')
      ${idPuntoVenta != null ? 'AND c.idPuntoVenta=@pv' : ''}
      ${soloConSaldo ? "AND c.Status IN ('ABIERTA','PARCIAL')" : ''}
    ORDER BY c.FechaVencimiento`);
  return r.recordset.map(x => ({ ...x, Saldo: Number(x.Saldo), TotalUSD: Number(x.TotalUSD) }));
}

// ── ¿Está suspendida? (caché de 60 s por tienda) ──
const cache = new Map();
const TTL = 60_000;
export function limpiarCache() { cache.clear(); }

export async function estadoDeTienda(pool, idBranch, idCuenta, idPuntoVenta) {
  const k = `${idBranch}:${idCuenta}:${idPuntoVenta}`;
  const c = cache.get(k);
  if (c && Date.now() - c.t < TTL) return c.v;
  const [cfg, pvR, deudas] = await Promise.all([
    leerConfigSuscripcion(pool, idBranch, idCuenta),
    pool.request().input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta).input('pv', sql.BigInt, idPuntoVenta)
      .query(`SELECT idNivel, EsMatriz FROM VIDA_CUENTA_PUNTOS_VENTA WHERE idBranch=@idBranch AND idCuenta=@idCuenta AND idPuntoVenta=@pv`),
    cargosSuscripcion(pool, idBranch, idCuenta, idPuntoVenta),
  ]);
  const pv = pvR.recordset[0];
  // La Matriz es VIDA: no paga mensualidad
  const v = pv?.EsMatriz
    ? { estado: 'SIN_PLAN', deudaUSD: 0, vencimiento: null, diasParaCorte: null }
    : estadoSuscripcion({ tieneNivel: pv?.idNivel != null, deudas, hoy: hoyVenezuela(), toleranciaDias: cfg.DiasTolerancia, corteActivo: cfg.CorteActivo });
  cache.set(k, { t: Date.now(), v });
  return v;
}

// ── Job diario: mensualidades del mes y multas de reconexión ──
// Idempotente: el índice único de VIDA_CUENTAS (Tipo, OrigenTipo, idOrigen)
// evita duplicar si corre dos veces o en dos servidores.
export async function generarCargosSuscripcion(pool, log, soloCuenta = null) {
  const resumen = { mensualidades: 0, multas: 0, errores: 0 };
  const cuentasR = await pool.request().query(`
    SELECT DISTINCT idBranch, idCuenta FROM VIDA_CUENTA_PUNTOS_VENTA WHERE idNivel IS NOT NULL`);
  for (const { idBranch, idCuenta } of cuentasR.recordset) {
    if (soloCuenta && (String(soloCuenta.idBranch) !== String(idBranch) || String(soloCuenta.idCuenta) !== String(idCuenta))) continue;
    try {
      const cfg = await leerConfigSuscripcion(pool, idBranch, idCuenta);
      const matriz = await idPuntoVentaMatriz(pool, idBranch, idCuenta);
      try { await prepararMoneda(pool, { idBranch, idCuenta, idUsuario: null }); } catch (e) { log?.warn?.(e, 'suscripción: no se pudo actualizar la tasa'); }
      const tiendas = (await pool.request()
        .input('idBranch', sql.BigInt, idBranch).input('idCuenta', sql.BigInt, idCuenta)
        .query(`SELECT pv.idPuntoVenta, pv.NomComercial, CONVERT(char(10), pv.FechaAfiliacion, 23) AS FechaAfiliacion,
                       n.MensualidadUSD, n.Nombre AS NombreNivel
                FROM VIDA_CUENTA_PUNTOS_VENTA pv
                JOIN VIDA_NIVELES_TIENDA n ON n.idBranch=pv.idBranch AND n.idCuenta=pv.idCuenta AND n.idNivel=pv.idNivel
                WHERE pv.idBranch=@idBranch AND pv.idCuenta=@idCuenta AND pv.Status='ACTIVO' AND ISNULL(pv.EsMatriz,0)=0`)).recordset;
      const hoy = hoyVenezuela();
      for (const t of tiendas) {
        // 1. Mensualidades pendientes de emitir (desde el mes siguiente a la afiliación)
        for (const periodo of periodosACobrar(t.FechaAfiliacion)) {
          if (!(Number(t.MensualidadUSD) > 0)) break;
          const vence = fechaVencimiento(periodo, cfg.DiaVencimiento);
          const r = await emitirEnTx(pool, {
            idBranch, idCuenta, Tipo: 'CXC', OrigenTipo: ORIGEN.MENSUALIDAD, idOrigen: origenPeriodo(t.idPuntoVenta, periodo),
            idPuntoVenta: t.idPuntoVenta, idPuntoVentaEmisor: matriz, TotalUSD: Number(t.MensualidadUSD),
            DiasPlazo: Math.max(0, diasEntre(hoy, vence)),
            Notas: `Mensualidad ${nombrePeriodo(periodo)} · ${t.NombreNivel}`, UsuAlta: 'SISTEMA',
          });
          if (r && !r.yaExistia) resumen.mensualidades++;
        }
        // 2. Multa de reconexión por cada mensualidad que pasó la tolerancia
        if (cfg.CorteActivo && cfg.MultaUSD > 0) {
          const deudas = await cargosSuscripcion(pool, idBranch, idCuenta, t.idPuntoVenta);
          for (const m of mensualidadesParaMulta(deudas, hoy, cfg.DiasTolerancia)) {
            const r = await emitirEnTx(pool, {
              idBranch, idCuenta, Tipo: 'CXC', OrigenTipo: ORIGEN.MULTA, idOrigen: Number(m.idOrigen),
              idPuntoVenta: t.idPuntoVenta, idPuntoVentaEmisor: matriz, TotalUSD: cfg.MultaUSD, DiasPlazo: 0,
              Notas: `Multa de reconexión · ${m.Notas || 'mensualidad vencida'}`, UsuAlta: 'SISTEMA',
            });
            if (r && !r.yaExistia) resumen.multas++;
          }
        }
      }
    } catch (e) {
      resumen.errores++;
      log?.error?.(e, `suscripción: fallo al generar cargos de la cuenta ${idBranch}/${idCuenta}`);
    }
  }
  limpiarCache();
  if (resumen.mensualidades || resumen.multas) log?.info?.(resumen, 'suscripción: cargos generados');
  return resumen;
}

// emitirCuenta trabaja dentro de una transacción: una corta por cargo.
export async function emitirEnTx(pool, datos) {
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const r = await emitirCuenta(tx, datos);
    await tx.commit();
    return r;
  } catch (e) {
    try { await tx.rollback(); } catch {}
    throw e;
  }
}
