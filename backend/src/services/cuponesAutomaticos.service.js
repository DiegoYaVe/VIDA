// Cupón por inactividad: al cliente que lleva N días sin recibir un pedido se
// le emite un cupón personal (solo vale en su cuenta, un uso, canal delivery)
// y se le avisa por push y por correo. Lo corre un job diario en app.js; se
// configura por cuenta en VIDA_CONFIG_DELIVERY (CuponInactivo*, migración 55)
// y nace apagado.
import crypto from 'crypto';
import { sql } from '../db/sqlserver.js';
import { fechaCaracas, sumarDias } from './fechas.service.js';
import { enviarPush } from './push.service.js';
import { enviarCorreo, plantillaCorreo, correoConfigurado } from './correo.service.js';

export const ORIGEN_INACTIVIDAD = 'INACTIVIDAD';
const LOTE = 200; // clientes por corrida y cuenta (el resto entra al día siguiente)

const num = (v, def, min = 0) => { const n = Number(v); return Number.isFinite(n) && n >= min ? n : def; };

// Config de la cuenta { Clave: Valor } → parámetros validados
export function configCuponInactivo(c = {}) {
  return {
    activo: String(c.CuponInactivoActivo ?? '0').trim() === '1',
    dias: Math.round(num(c.CuponInactivoDias, 30, 1)),
    pct: Math.min(100, num(c.CuponInactivoPct, 10, 0)),
    maxUSD: num(c.CuponInactivoMaxUSD, 5, 0),
    minCompraUSD: num(c.CuponInactivoMinCompraUSD, 0, 0),
    vigenciaDias: Math.round(num(c.CuponInactivoVigenciaDias, 7, 1)),
    repetirDias: Math.round(num(c.CuponInactivoRepetirDias, 60, 1)),
  };
}

export function textoBeneficio(cfg) {
  return `${cfg.pct}% de descuento${cfg.maxUSD > 0 ? ` (hasta $${cfg.maxUSD.toFixed(2)})` : ''}`
    + (cfg.minCompraUSD > 0 ? ` en compras desde $${cfg.minCompraUSD.toFixed(2)}` : '');
}

// VUELVE-7KQ2XM (sin 0/O/1/I para dictarlo sin confusiones)
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const codigoPersonal = () => 'VUELVE-' + Array.from({ length: 6 }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join('');

async function leerConfig(pool, idBranch, idCuenta) {
  const r = await pool.request().input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
    .query(`SELECT Clave, Valor FROM VIDA_CONFIG_DELIVERY WHERE idBranch=@b AND idCuenta=@c AND Clave LIKE 'CuponInactivo%'`);
  return configCuponInactivo(Object.fromEntries(r.recordset.map((x) => [x.Clave, x.Valor])));
}

// Clientes activos con al menos un pedido entregado, cuyo último pedido tiene
// más de `dias`, sin un cupón de inactividad en los últimos `repetirDias` y
// sin otro cupón personal vigente sin usar.
export async function clientesInactivos(pool, idBranch, idCuenta, cfg) {
  const r = await pool.request()
    .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta)
    .input('dias', sql.Int, cfg.dias).input('rep', sql.Int, cfg.repetirDias).input('lote', sql.Int, LOTE)
    .query(`SELECT TOP (@lote) c.idCliente, c.Nombre, c.Email, c.FcmToken, u.Ultimo
            FROM VIDA_APP_CLIENTES c
            JOIN (SELECT idCliente, MAX(FechaAlta) Ultimo FROM VIDA_PEDIDOS
                  WHERE idBranch=@b AND idCuenta=@c AND Canal='APP' AND Status='ENTREGADO' AND idCliente IS NOT NULL
                  GROUP BY idCliente) u ON u.idCliente=c.idCliente
            WHERE c.idBranch=@b AND c.idCuenta=@c AND c.Status='ACTIVO'
              AND u.Ultimo < DATEADD(DAY, -@dias, GETUTCDATE())
              AND NOT EXISTS (SELECT 1 FROM VIDA_PEDIDOS p WHERE p.idBranch=@b AND p.idCuenta=@c AND p.idCliente=c.idCliente
                              AND p.Status NOT IN ('ENTREGADO','CANCELADO'))
              AND NOT EXISTS (SELECT 1 FROM VIDA_CUPONES k WHERE k.idBranch=@b AND k.idCuenta=@c AND k.idClienteExclusivo=c.idCliente
                              AND (k.Origen='${ORIGEN_INACTIVIDAD}' AND k.FechaAlta > DATEADD(DAY, -@rep, GETUTCDATE())
                                   OR k.Status='ACTIVO' AND k.UsosActuales=0 AND (k.FechaFin IS NULL OR k.FechaFin >= CAST(DATEADD(HOUR,-4,GETUTCDATE()) AS DATE))))
            ORDER BY u.Ultimo`);
  return r.recordset;
}

export async function crearCuponPersonal(pool, idBranch, idCuenta, cli, cfg) {
  const fin = sumarDias(fechaCaracas(), cfg.vigenciaDias);
  for (let i = 0; i < 6; i++) {
    const codigo = codigoPersonal();
    try {
      const r = await pool.request()
        .input('b', sql.BigInt, idBranch).input('c', sql.BigInt, idCuenta).input('cli', sql.BigInt, cli.idCliente)
        .input('cod', sql.VarChar(40), codigo).input('nom', sql.VarChar(150), `Te extrañamos · ${cli.Nombre || 'cliente'}`.slice(0, 150))
        .input('val', sql.Decimal(18, 4), cfg.pct).input('max', sql.Decimal(18, 4), cfg.maxUSD > 0 ? cfg.maxUSD : null)
        .input('min', sql.Decimal(18, 4), cfg.minCompraUSD > 0 ? cfg.minCompraUSD : null).input('fin', sql.Date, fin)
        .query(`INSERT INTO VIDA_CUPONES (idBranch,idCuenta,idCupon,Codigo,Nombre,Tipo,Valor,MinCompra,MaxDescuento,Alcance,Canal,
                  FechaInicio,FechaFin,UsosMax,UsosPorCliente,UsosActuales,Descripcion,Status,FechaAlta,UsuAlta,idClienteExclusivo,Origen)
                OUTPUT inserted.idCupon
                SELECT @b,@c,ISNULL(MAX(idCupon),0)+1,@cod,@nom,'DESCUENTO_PCT',@val,@min,@max,'TODO','DELIVERY',
                  CAST(DATEADD(HOUR,-4,GETUTCDATE()) AS DATE),@fin,1,1,0,'Cupón automático por inactividad','ACTIVO',GETUTCDATE(),'SISTEMA',@cli,'${ORIGEN_INACTIVIDAD}'
                FROM VIDA_CUPONES WITH (UPDLOCK, HOLDLOCK) WHERE idBranch=@b AND idCuenta=@c`);
      return { idCupon: r.recordset[0].idCupon, codigo, fin };
    } catch (e) {
      if (![2627, 2601].includes(e?.number)) throw e; // código o id repetido: otro intento
    }
  }
  throw new Error('No se pudo generar un código de cupón único');
}

async function avisar(cli, cupon, cfg, log) {
  const beneficio = textoBeneficio(cfg);
  if (cli.FcmToken) {
    await enviarPush(cli.FcmToken, { title: 'Te extrañamos 💧', body: `Tienes ${beneficio} en tu próximo pedido. Usa ${cupon.codigo} antes del ${cupon.fin}.`,
      data: { tipo: 'CUPON', codigo: cupon.codigo } }, log);
  }
  if (cli.Email && correoConfigurado()) {
    try {
      await enviarCorreo({ to: cli.Email, subject: 'Un regalo para tu próximo pedido VIDA',
        html: plantillaCorreo({ saludo: `Hola, ${cli.Nombre || 'cliente VIDA'}`,
          parrafos: [`Hace tiempo que no pides y queremos verte de vuelta. Tienes ${beneficio} en tu próximo pedido a domicilio.`,
            'Escribe este código en tu carrito (o tócalo en "Tus cupones"):'],
          destacado: cupon.codigo, pie: `Válido hasta el ${cupon.fin}, un solo uso y solo en tu cuenta.` }) });
    } catch (e) { log?.warn?.({ err: e.message }, 'cupón por inactividad: correo no enviado'); }
  }
}

// Una cuenta (también lo usa el botón "Enviar ahora" del panel)
export async function emitirParaCuenta(pool, idBranch, idCuenta, log) {
  const cfg = await leerConfig(pool, idBranch, idCuenta);
  if (!cfg.activo || cfg.pct <= 0) return { activo: false, emitidos: 0 };
  let emitidos = 0;
  for (const cli of await clientesInactivos(pool, idBranch, idCuenta, cfg)) {
    try {
      const cupon = await crearCuponPersonal(pool, idBranch, idCuenta, cli, cfg);
      emitidos++;
      await avisar(cli, cupon, cfg, log);
    } catch (e) { log?.error?.({ err: e.message, idCliente: cli.idCliente }, 'cupón por inactividad'); }
  }
  return { activo: true, emitidos };
}

// Job: todas las cuentas que lo tengan activo
export async function emitirCuponesInactividad(pool, log) {
  const cuentas = (await pool.request().query(`SELECT idBranch, idCuenta FROM VIDA_CONFIG_DELIVERY
    WHERE Clave='CuponInactivoActivo' AND LTRIM(RTRIM(Valor))='1'`)).recordset;
  let emitidos = 0;
  for (const { idBranch, idCuenta } of cuentas) emitidos += (await emitirParaCuenta(pool, idBranch, idCuenta, log)).emitidos;
  if (emitidos) log?.info?.({ emitidos }, 'cupones por inactividad emitidos');
  return emitidos;
}
