export const centavos = v => Math.round((Number(v)+Number.EPSILON)*100)/100;
const error = mensaje => {throw Object.assign(new Error(mensaje),{statusCode:422});};
export function validarVigenciaCotizacion(c,actor,fechaVenta,ahora=new Date()) {
  if(!c || ['idBranch','idCuenta','idUsuario','idPuntoVenta'].some(k=>String(c[k])!==String(actor[k]))) error('Cotización no autorizada para esta tienda y usuario');
  const fecha=new Date(fechaVenta).getTime();
  if(!Number.isFinite(fecha)||fecha<new Date(c.EmitidaEn).getTime()||fecha>new Date(c.ExpiraEn).getTime()||fecha>ahora.getTime()+300000)
    error('La tasa no era válida al realizar la venta; revisa fecha y cotización');
}
export function calcularPagoPos(totalUSD,pago,tasa,modo) {
  const tc=Number(tasa.VESporUSD);
  if(!Number.isFinite(tc)||tc<=0||!Number.isFinite(totalUSD)||totalUSD<0) error('Tasa o total inválidos');
  const moneda=pago?.Moneda;
  if(!['USD','VES'].includes(moneda)||(modo!=='AMBAS'&&modo!==moneda)) error('Moneda no habilitada');
  const metodo=pago.Metodo;
  if(!['EFECTIVO','TARJETA','MIXTO'].includes(metodo)) error('Método inválido');
  const monto = x => {
    if(typeof x!=='number'||!Number.isFinite(x)||x<0||x>=1e10||Math.abs(x*100-Math.round(x*100))>1e-5) error('Importes de cobro deben ser positivos con máximo dos decimales');
    return x;
  };
  const efectivo=monto(pago.Efectivo),tarjeta=monto(pago.Tarjeta);
  const original=centavos(totalUSD*(moneda==='VES'?tc:1));
  if(metodo==='EFECTIVO'&&tarjeta!==0||metodo==='TARJETA'&&efectivo!==0) error('El desglose no coincide con el método');
  const cambio=centavos(efectivo+tarjeta-original);
  if(cambio<0||tarjeta>original||cambio>efectivo) error('El pago no cubre el total o el cambio excede el efectivo');
  const usd = v => Math.round(v/(moneda==='VES'?tc:1)*10000)/10000;
  return {Moneda:moneda,Metodo:metodo,TotalOriginal:original,TotalUSD:centavos(totalUSD),TotalVES:centavos(totalUSD*tc),
    Efectivo:efectivo,Tarjeta:tarjeta,Cambio:cambio,
    EfectivoUSD:usd(efectivo),TarjetaUSD:usd(tarjeta),CambioUSD:usd(cambio),
    TasaVESporUSD:tc,idTasa:tasa.idTasa,FechaTasa:tasa.FechaValor,Fuente:tasa.Fuente};
}
