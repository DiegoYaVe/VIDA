import {PCT_IGTF} from '../domain/pagoPos.mjs';
const red2=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
// `igtf`: la tienda es contribuyente especial. Pagando en dólares se suma el
// IGTF (3%) al cobro; TotalUSD sigue siendo la venta (sin el impuesto).
export function calcularPagoDelivery(totalUSD,pago,tasa,modo,igtf=false) {
 const total=red2(totalUSD),tc=Number(tasa?.VESporUSD),moneda=pago?.Moneda;
 if(!Number.isFinite(total)||total<0||!Number.isFinite(tc)||tc<=0) throw Object.assign(new Error('Total o tasa inválidos'),{statusCode:422});
 if(!['USD','VES'].includes(moneda)||(modo!=='AMBAS'&&modo!==moneda)) throw Object.assign(new Error('Moneda no habilitada'),{statusCode:422});
 const original=red2(pago.MontoOriginal);
 if(!Number.isFinite(Number(pago.MontoOriginal))||Number(pago.MontoOriginal)<0||Math.abs(Number(pago.MontoOriginal)*100-Math.round(Number(pago.MontoOriginal)*100))>1e-5)
   throw Object.assign(new Error('Monto de pago inválido'),{statusCode:422});
 const igtfUSD=igtf&&moneda==='USD'?red2(total*PCT_IGTF/100):0;
 const esperado=red2(moneda==='VES'?total*tc:total+igtfUSD);
 if(original!==esperado) throw Object.assign(new Error('El total o la tasa cambió. Actualiza el pago antes de confirmar.'),{statusCode:409});
 return {Moneda:moneda,Metodo:pago.Metodo,TotalOriginal:original,TotalUSD:total,TotalVES:red2(total*tc),
  ...(igtf?{IGTFUSD:igtfUSD,IGTFBaseUSD:igtfUSD?total:0,TotalCobradoUSD:red2(total+igtfUSD)}:{}),
  TasaVESporUSD:tc,idTasa:tasa.idTasa,FechaTasa:tasa.FechaValor,Fuente:tasa.Fuente,Status:'PENDIENTE_REVISION'};
}
