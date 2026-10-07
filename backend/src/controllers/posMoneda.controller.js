import {randomUUID} from 'node:crypto';
import {getPool,sql} from '../db/sqlserver.js';
import {prepararMoneda} from '../services/moneda.service.js';
import {fechaCaracas} from '../services/tasaBcv.service.js';
import {tiendaEnAlcance} from '../services/alcance.service.js';
export async function cotizarMonedaPOS(req,reply) {
 const u=req.user;const pv=Number(req.body?.idPuntoVenta);
 if(!Number.isSafeInteger(pv)||pv<=0) return reply.code(403).send({error:'Tienda no autorizada'});
 try {
  const pool=await getPool();
  // Cada rol cotiza solo para tiendas de su alcance (ADMIN_ESTADO: su estado).
  if(!(await tiendaEnAlcance(u,pv,pool))) return reply.code(403).send({error:'Tienda no autorizada'});
  const tienda=await pool.request().input('b',sql.BigInt,u.idBranch).input('c',sql.BigInt,u.idCuenta).input('p',sql.BigInt,pv)
   .query(`SELECT idPuntoVenta FROM VIDA_CUENTA_PUNTOS_VENTA WHERE idBranch=@b AND idCuenta=@c AND idPuntoVenta=@p AND Status='ACTIVO'`);
  if(!tienda.recordset.length) return reply.code(404).send({error:'Tienda no disponible'});
  const cfg=await prepararMoneda(pool,u);
  if(!cfg.tasa?.Vigente) return reply.code(409).send({error:'No hay tasa vigente para cobrar'});
  const emitida=new Date();
  // Autorización offline hasta el final del día venezolano, máximo 24 horas.
  const expira=new Date(Date.parse(fechaCaracas(emitida)+'T04:00:00Z')+86400000-1);
  const id=randomUUID();
  await pool.request().input('id',sql.UniqueIdentifier,id).input('b',sql.BigInt,u.idBranch).input('c',sql.BigInt,u.idCuenta)
   .input('u',sql.BigInt,u.idUsuario).input('p',sql.BigInt,pv).input('t',sql.BigInt,cfg.tasa.idTasa).input('m',sql.VarChar(5),cfg.Modo)
   .input('e',sql.DateTime2,emitida).input('x',sql.DateTime2,expira)
   .query(`INSERT INTO VIDA_POS_COTIZACIONES VALUES(@id,@b,@c,@u,@p,@t,@m,@e,@x)`);
  return {idCotizacion:id,Modo:cfg.Modo,tasa:cfg.tasa,EmitidaEn:emitida,ExpiraEn:expira};
 } catch(e) {req.log.error(e);return reply.code(e.statusCode||500).send({error:e.statusCode?e.message:'No se pudo preparar la tasa del POS'});}
}
