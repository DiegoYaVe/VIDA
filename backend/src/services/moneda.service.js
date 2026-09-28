import { consultarTasaBcv, guardarTasaBcv } from './tasaBcv.service.js';
import { sql } from '../db/sqlserver.js';
export function convertirImporte(monto, moneda, tasa) {
  const n = Number(monto), t = tasa == null ? null : Number(tasa);
  if (!['number','string'].includes(typeof monto) || !['USD','VES'].includes(moneda) || !Number.isFinite(n) || n <= 0 || Math.abs(n*10000-Math.round(n*10000)) > 1e-6)
    throw Object.assign(new Error('Importe o moneda inválidos (máximo cuatro decimales)'), {statusCode:400});
  if ((t !== null && (!Number.isFinite(t) || t <= 0)) || (moneda === 'VES' && t === null))
    throw Object.assign(new Error('Se requiere una tasa válida'), {statusCode:400});
  const red = x => Math.round(x*10000)/10000;
  if (n >= 1e10 || (t !== null && (n*t >= 1e14 || n/t >= 1e14))) throw Object.assign(new Error('Importe fuera de rango'), {statusCode:400});
  return { MonedaOriginal: moneda, MontoOriginal: red(n), MontoUSD: moneda === 'USD' ? red(n) : red(n/t), MontoVES: t === null ? null : moneda === 'VES' ? red(n) : red(n*t), TasaVESporUSD: t };
}
export async function leerMoneda(ejecutor, idBranch, idCuenta) {
  const req = () => ejecutor.request ? ejecutor.request() : new sql.Request(ejecutor);
  const r = await req().input('b',sql.BigInt,idBranch).input('c',sql.BigInt,idCuenta)
    .query(`SELECT Modo,FuenteTasa FROM VIDA_FINANZAS_MONEDA WHERE idBranch=@b AND idCuenta=@c;
      SELECT TOP 1 idTasa,VESporUSD,FechaValor,Fuente,FechaAlta,Origen,PublicadaEn,
        CASE WHEN FechaValor >= DATEADD(day,-4,CAST(DATEADD(hour,-4,SYSUTCDATETIME()) AS DATE)) THEN 1 ELSE 0 END AS Vigente
      FROM VIDA_TASAS_CAMBIO WHERE idBranch=@b AND idCuenta=@c AND FechaValor<=CAST(DATEADD(hour,-4,SYSUTCDATETIME()) AS DATE)
      AND Origen=COALESCE((SELECT FuenteTasa FROM VIDA_FINANZAS_MONEDA WHERE idBranch=@b AND idCuenta=@c),'BCV_TODAY')
      ORDER BY FechaValor DESC,PublicadaEn DESC,idTasa DESC;`);
  return { Modo:r.recordsets[0][0]?.Modo || 'USD', FuenteTasa:r.recordsets[0][0]?.FuenteTasa || 'BCV_TODAY', tasa:r.recordsets[1][0] || null };
}

// Consulta externa ANTES de abrir la transacción financiera; nunca bajo locks.
export async function prepararMoneda(pool, actor, {leer=leerMoneda, consultar=consultarTasaBcv, guardar=guardarTasaBcv}={}) {
  let cfg=await leer(pool,actor.idBranch,actor.idCuenta);
  if (cfg.FuenteTasa==='BCV_TODAY') {
    const tasa=await consultar();
    const id=await guardar(pool,actor,tasa);
    cfg=await leer(pool,actor.idBranch,actor.idCuenta);
    if (cfg.FuenteTasa!=='BCV_TODAY' || String(cfg.tasa?.idTasa)!==String(id))
      throw Object.assign(new Error('La configuración o la tasa cambió durante la consulta. Vuelve a intentar'),{statusCode:409});
  }
  return cfg;
}
