import { authenticate } from '../middlewares/auth.js';
import { requireMatriz } from '../services/alcance.service.js';
import { getPool,sql } from '../db/sqlserver.js';
import { leerMoneda } from '../services/moneda.service.js';
export async function monedaRoutes(app) {
 app.get('/cuentas/config-moneda',{preHandler:[authenticate,requireMatriz]}, async req => leerMoneda(await getPool(),req.user.idBranch,req.user.idCuenta));
 app.put('/cuentas/config-moneda',{preHandler:[authenticate,requireMatriz]},async(req,reply)=>{
  const {Modo}=req.body || {};
  if (!['USD','VES','AMBAS'].includes(Modo)) return reply.code(400).send({error:'Modo inválido'});
  const pool=await getPool(); const {idBranch,idCuenta}=req.user;
  const cfg=await leerMoneda(pool,idBranch,idCuenta);
  if(Modo!=='USD' && !cfg.tasa?.Vigente) return reply.code(400).send({error:'Registra primero una tasa vigente'});
  await pool.request().input('b',sql.BigInt,idBranch).input('c',sql.BigInt,idCuenta).input('m',sql.VarChar(5),Modo)
   .query(`MERGE VIDA_FINANZAS_MONEDA WITH (HOLDLOCK) AS t USING (SELECT @b b,@c c) s ON t.idBranch=s.b AND t.idCuenta=s.c
    WHEN MATCHED THEN UPDATE SET Modo=@m WHEN NOT MATCHED THEN INSERT(idBranch,idCuenta,Modo) VALUES(@b,@c,@m);`);
  return {ok:true};
 });
 app.post('/cuentas/tasas',{preHandler:[authenticate,requireMatriz]},async(req,reply)=>{
  const {VESporUSD,FechaValor,Fuente}=req.body || {};
  const t=Number(VESporUSD); const d=new Date(FechaValor+'T00:00:00Z');
  if(!Number.isFinite(t)||t<=0||t>=1e10||!/^\d{4}-\d{2}-\d{2}$/.test(FechaValor||'')||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==FechaValor||d>new Date()||typeof Fuente!=='string'||Fuente.trim().length<3||Fuente.length>200)
    return reply.code(400).send({error:'Indica tasa positiva, fecha válida no futura y fuente (3–200 caracteres)'});
  const {idBranch,idCuenta,idUsuario}=req.user;
  await (await getPool()).request().input('b',sql.BigInt,idBranch).input('c',sql.BigInt,idCuenta)
   .input('t',sql.Decimal(18,8),t).input('d',sql.Date,FechaValor).input('f',sql.NVarChar(200),Fuente.trim()).input('u',sql.BigInt,idUsuario)
   .query(`INSERT INTO VIDA_TASAS_CAMBIO(idBranch,idCuenta,VESporUSD,FechaValor,Fuente,UsuAlta) VALUES(@b,@c,@t,@d,@f,@u)`);
  return reply.code(201).send({ok:true});
 });
}
