import { sql } from '../db/sqlserver.js';
export const URL_TASA = 'https://bcv.today/api/v1/rate.json';
const fallo = mensaje => Object.assign(new Error(mensaje), {statusCode:503, codigo:'TC_NO_DISPONIBLE'});
export function fechaCaracas(ahora = new Date()) {
  return new Date(ahora.getTime() - 4*60*60*1000).toISOString().slice(0,10);
}
export function validarTasaBcv(data, ahora = new Date()) {
  if (!data || typeof data.USD !== 'number' || !Number.isFinite(data.USD) || data.USD <= 0 || data.USD >= 1e10)
    throw fallo('La API devolvió una tasa USD inválida');
  const fecha=data.effective_date;
  const valor=new Date(`${fecha}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha||'') || !Number.isFinite(valor.getTime()) || valor.toISOString().slice(0,10)!==fecha)
    throw fallo('La API no incluyó una fecha efectiva válida');
  const hoy=fechaCaracas(ahora);
  const antiguedad=(Date.parse(hoy)-valor.getTime())/86400000;
  if (antiguedad<0) throw fallo('La tasa publicada todavía no entra en vigor en Venezuela');
  if (antiguedad>4) throw fallo('La tasa publicada tiene más de cuatro días de antigüedad');
  const publicada=new Date(data.updated_at);
  if (typeof data.updated_at !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(data.updated_at) || !Number.isFinite(publicada.getTime()) || publicada.getTime()>ahora.getTime()+60000)
    throw fallo('La API no incluyó una fecha de publicación válida');
  return {VESporUSD:Math.round(data.USD*1e8)/1e8, FechaValor:fecha, PublicadaEn:publicada, Fuente:URL_TASA, Origen:'BCV_TODAY'};
}
export async function consultarTasaBcv({fetchFn=globalThis.fetch, ahora=new Date(), timeoutMs=5000}={}) {
  try {
    const res=await fetchFn(URL_TASA,{headers:{Accept:'application/json','Cache-Control':'no-cache'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
    if (!res.ok) throw fallo(`No se pudo consultar bcv.today (HTTP ${res.status})`);
    const texto=await res.text();
    if (texto.length>16384) throw fallo('Respuesta de tasa demasiado grande');
    return validarTasaBcv(JSON.parse(texto),ahora);
  } catch (err) {
    if (err.codigo) throw err;
    throw fallo('No fue posible verificar la tasa con bcv.today. Reintenta o solicita una tasa manual a la Matriz');
  }
}
// Inserta snapshots inmutables. Consultas repetidas no crean IDs distintos.
export async function guardarTasaBcv(pool, {idBranch,idCuenta,idUsuario}, tasa) {
  const tx=new sql.Transaction(pool);
  await tx.begin();
  try {
    const req=()=>new sql.Request(tx).input('b',sql.BigInt,idBranch).input('c',sql.BigInt,idCuenta)
      .input('v',sql.Decimal(18,8),tasa.VESporUSD).input('d',sql.Date,tasa.FechaValor)
      .input('p',sql.DateTime2,tasa.PublicadaEn);
    const existente=await req().query(`SELECT idTasa FROM VIDA_TASAS_CAMBIO WITH (UPDLOCK,HOLDLOCK)
      WHERE idBranch=@b AND idCuenta=@c AND Origen='BCV_TODAY' AND FechaValor=@d AND VESporUSD=@v AND PublicadaEn=@p`);
    let id=existente.recordset[0]?.idTasa;
    if (!id) {
      const r=await req().input('f',sql.NVarChar(200),URL_TASA).input('u',sql.BigInt,idUsuario)
        .query(`INSERT INTO VIDA_TASAS_CAMBIO(idBranch,idCuenta,VESporUSD,FechaValor,Fuente,UsuAlta,Origen,PublicadaEn)
          OUTPUT INSERTED.idTasa VALUES(@b,@c,@v,@d,@f,@u,'BCV_TODAY',@p)`);
      id=r.recordset[0].idTasa;
    }
    await tx.commit();return id;
  } catch(err) {try {await tx.rollback();} catch {} throw err;}
}
