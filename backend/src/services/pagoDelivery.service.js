import {PCT_IGTF} from '../domain/pagoPos.mjs';
const red2=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
const err=(m,c=422)=>Object.assign(new Error(m),{statusCode:c});
const importe=(v,nombre)=>{
 const n=Number(v);
 if(!Number.isFinite(n)||n<0||n>=1e10||Math.abs(n*100-Math.round(n*100))>1e-5) throw err(`${nombre} inválido`);
 return red2(n);
};
// Billete con el que paga el cliente (para que el repartidor lleve cambio):
// opcional y nunca menor que lo que debe entregar en esa moneda.
function pagaCon(v,monto,moneda){
 if(v==null||v==='') return {PagaCon:null,Cambio:0};
 const p=importe(v,`Pago con (${moneda})`);
 if(p<monto) throw err(`El billete en ${moneda==='USD'?'dólares':'bolívares'} no alcanza para el monto a pagar`);
 return {PagaCon:p,Cambio:red2(p-monto)};
}

// `igtf`: la tienda es contribuyente especial. Pagando en dólares se suma el
// IGTF (3%) sobre esa parte; TotalUSD sigue siendo la venta (sin el impuesto).
// Monedas: USD, VES o MIXTA (efectivo: una parte en dólares y el resto en
// bolívares a la tasa del pedido).
export function calcularPagoDelivery(totalUSD,pago,tasa,modo,igtf=false) {
 const total=red2(totalUSD),tc=Number(tasa?.VESporUSD),moneda=pago?.Moneda;
 if(!Number.isFinite(total)||total<0||!Number.isFinite(tc)||tc<=0) throw err('Total o tasa inválidos');
 const base={TotalUSD:total,TotalVES:red2(total*tc),TasaVESporUSD:tc,idTasa:tasa.idTasa,FechaTasa:tasa.FechaValor,Fuente:tasa.Fuente,Status:'PENDIENTE_REVISION'};
 const efectivo=pago.Metodo==='EFECTIVO';

 if(moneda==='MIXTA') {
  if(modo!=='AMBAS') throw err('El pago combinado requiere dólares y bolívares habilitados');
  if(!efectivo) throw err('El pago combinado es solo en efectivo');
  const usd=importe(pago.MontoUSD,'Monto en dólares');
  if(usd<=0||usd>=total) throw err('La parte en dólares debe ser mayor a 0 y menor al total');
  const igtfUSD=igtf?red2(usd*PCT_IGTF/100):0;
  const ves=red2((total-usd)*tc);
  if(importe(pago.MontoVES,'Monto en bolívares')!==ves) throw err('El total o la tasa cambió. Actualiza el pago antes de confirmar.',409);
  const cU=pagaCon(pago.PagaConUSD,red2(usd+igtfUSD),'USD'), cV=pagaCon(pago.PagaConVES,ves,'VES');
  return {Moneda:'MIXTA',Metodo:pago.Metodo,...base,
   Desglose:{
    USD:{Monto:red2(usd+igtfUSD),Efectivo:cU.PagaCon??red2(usd+igtfUSD),Tarjeta:0,Cambio:cU.Cambio},
    VES:{Monto:ves,Efectivo:cV.PagaCon??ves,Tarjeta:0,Cambio:cV.Cambio},
   },
   ...(igtf?{IGTFUSD:igtfUSD,IGTFBaseUSD:usd,TotalCobradoUSD:red2(total+igtfUSD)}:{})};
 }

 if(!['USD','VES'].includes(moneda)||(modo!=='AMBAS'&&modo!==moneda)) throw err('Moneda no habilitada');
 const original=importe(pago.MontoOriginal,'Monto de pago');
 const igtfUSD=igtf&&moneda==='USD'?red2(total*PCT_IGTF/100):0;
 const esperado=red2(moneda==='VES'?total*tc:total+igtfUSD);
 if(original!==esperado) throw err('El total o la tasa cambió. Actualiza el pago antes de confirmar.',409);
 const c=efectivo?pagaCon(moneda==='USD'?pago.PagaConUSD:pago.PagaConVES,original,moneda):{PagaCon:null,Cambio:0};
 return {Moneda:moneda,Metodo:pago.Metodo,TotalOriginal:original,...base,
  ...(c.PagaCon!=null?{PagaCon:c.PagaCon,Cambio:c.Cambio}:{}),
  ...(igtf?{IGTFUSD:igtfUSD,IGTFBaseUSD:igtfUSD?total:0,TotalCobradoUSD:red2(total+igtfUSD)}:{})};
}
