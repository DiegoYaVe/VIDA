export const centavos = v => Math.round((Number(v)+Number.EPSILON)*100)/100;
const error = mensaje => {throw Object.assign(new Error(mensaje),{statusCode:422});};
// IGTF: 3% sobre lo pagado en divisas; lo cobran los contribuyentes especiales.
export const PCT_IGTF = 3;
export function validarVigenciaCotizacion(c,actor,fechaVenta,ahora=new Date()) {
  if(!c || ['idBranch','idCuenta','idUsuario','idPuntoVenta'].some(k=>String(c[k])!==String(actor[k]))) error('Cotización no autorizada para esta tienda y usuario');
  const fecha=new Date(fechaVenta).getTime();
  if(!Number.isFinite(fecha)||fecha<new Date(c.EmitidaEn).getTime()||fecha>new Date(c.ExpiraEn).getTime()||fecha>ahora.getTime()+300000)
    error('La tasa no era válida al realizar la venta; revisa fecha y cotización');
}
// `igtf`: la tienda es contribuyente especial (lo dice la cotización). El IGTF
// se suma al cobro; TotalUSD sigue siendo la venta (sin el impuesto).
export function calcularPagoPos(totalUSD,pago,tasa,modo,igtf=false) {
  const tc=Number(tasa.VESporUSD);
  if(!Number.isFinite(tc)||tc<=0||!Number.isFinite(totalUSD)||totalUSD<0) error('Tasa o total inválidos');
  const moneda=pago?.Moneda;
  if(moneda==='MIXTA') return calcularCombinado(totalUSD,pago,tasa,modo,igtf);
  if(!['USD','VES'].includes(moneda)||(modo!=='AMBAS'&&modo!==moneda)) error('Moneda no habilitada');
  const metodo=pago.Metodo;
  if(!['EFECTIVO','TARJETA','MIXTO'].includes(metodo)) error('Método inválido');
  const monto = x => {
    if(typeof x!=='number'||!Number.isFinite(x)||x<0||x>=1e10||Math.abs(x*100-Math.round(x*100))>1e-5) error('Importes de cobro deben ser positivos con máximo dos decimales');
    return x;
  };
  const efectivo=monto(pago.Efectivo),tarjeta=monto(pago.Tarjeta);
  // Pagando en dólares, el IGTF se suma sobre toda la venta
  const igtfUSD=igtf&&moneda==='USD'?centavos(totalUSD*PCT_IGTF/100):0;
  const original=centavos((totalUSD+igtfUSD)*(moneda==='VES'?tc:1));
  if(metodo==='EFECTIVO'&&tarjeta!==0||metodo==='TARJETA'&&efectivo!==0) error('El desglose no coincide con el método');
  const cambio=centavos(efectivo+tarjeta-original);
  if(cambio<0||tarjeta>original||cambio>efectivo) error('El pago no cubre el total o el cambio excede el efectivo');
  const usd = v => Math.round(v/(moneda==='VES'?tc:1)*10000)/10000;
  return {Moneda:moneda,Metodo:metodo,TotalOriginal:original,TotalUSD:centavos(totalUSD),TotalVES:centavos(totalUSD*tc),
    Efectivo:efectivo,Tarjeta:tarjeta,Cambio:cambio,
    EfectivoUSD:usd(efectivo),TarjetaUSD:usd(tarjeta),CambioUSD:usd(cambio),
    ...(igtf?{IGTFUSD:igtfUSD,IGTFBaseUSD:igtfUSD?centavos(totalUSD):0,TotalCobradoUSD:centavos(totalUSD+igtfUSD)}:{}),
    TasaVESporUSD:tc,idTasa:tasa.idTasa,FechaTasa:tasa.FechaValor,Fuente:tasa.Fuente};
}

export function importeCaja(x) {
  if(typeof x!=='number'||!Number.isFinite(x)||x<0||x>=1e10||Math.abs(x*100-Math.round(x*100))>1e-5)
    error('Ingresa importes no negativos con máximo dos decimales');
  return centavos(x);
}

function calcularCombinado(total,pago,tasa,modo,igtf=false) {
  if(modo!=='AMBAS') error('El cobro combinado requiere ambas monedas habilitadas');
  const tc=Number(tasa.VESporUSD), usd=v=>Math.round(v*10000)/10000;
  const desglose={};
  for(const m of ['USD','VES']) {
    const d=pago.Desglose?.[m];
    desglose[m]={Efectivo:importeCaja(d?.Efectivo),Tarjeta:importeCaja(d?.Tarjeta),Cambio:0};
  }
  const efectivo=desglose.USD.Efectivo+desglose.VES.Efectivo/tc;
  const tarjeta=desglose.USD.Tarjeta+desglose.VES.Tarjeta/tc;
  const recibido=efectivo+tarjeta;
  const m=pago.MonedaCambio;
  if(!['USD','VES'].includes(m)) error('Selecciona la moneda del cambio');
  // Parte de la venta que se paga en dólares (base del IGTF). Si el cambio se
  // devuelve en dólares, se descuenta: lo pagado en divisas es lo neto.
  let baseIGTF=0;
  if(igtf) {
    const usdRecibido=desglose.USD.Efectivo+desglose.USD.Tarjeta;
    const vesEnUSD=(desglose.VES.Efectivo+desglose.VES.Tarjeta)/tc;
    baseIGTF=m==='USD'?Math.max(0,total-vesEnUSD):Math.min(total,usdRecibido/(1+PCT_IGTF/100));
    baseIGTF=centavos(Math.min(baseIGTF,usdRecibido));
  }
  const igtfUSD=centavos(baseIGTF*PCT_IGTF/100);
  const exigido=centavos(total+igtfUSD);
  // Comparación en centavos USD, moneda de la deuda; se conserva el redondeo.
  if(centavos(recibido)<exigido) error('El pago no cubre el total');
  if(centavos(tarjeta)>exigido) error('La tarjeta excede el total de la venta');
  const cambio=centavos(Math.max(0,recibido-exigido)*(m==='VES'?tc:1));
  if(cambio>desglose[m].Efectivo) error('El cambio excede el efectivo recibido en esa moneda');
  desglose[m].Cambio=cambio;
  const cambioUSD=cambio/(m==='VES'?tc:1);
  const metodo=efectivo>0?(tarjeta>0?'MIXTO':'EFECTIVO'):'TARJETA';
  return {Moneda:'MIXTA',Metodo:metodo,Desglose:desglose,MonedaCambio:m,
    TotalUSD:centavos(total),TotalVES:centavos(total*tc),EfectivoUSD:usd(efectivo),
    TarjetaUSD:usd(tarjeta),CambioUSD:usd(cambioUSD),
    AjusteRedondeoUSD:usd(recibido-cambioUSD-exigido),
    ...(igtf?{IGTFUSD:igtfUSD,IGTFBaseUSD:baseIGTF,TotalCobradoUSD:exigido}:{}),
    TasaVESporUSD:tc,idTasa:tasa.idTasa,FechaTasa:tasa.FechaValor,Fuente:tasa.Fuente};
}
