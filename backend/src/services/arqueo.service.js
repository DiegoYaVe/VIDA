import {centavos,importeCaja} from './pagoPos.service.js';

// Nunca convertir al tipo de cambio del cierre: contamos billetes de cada moneda.
export function efectivoPorMoneda(ventas) {
  const neto={USD:0,VES:0};
  for(const v of ventas) {
    if(!['EFECTIVO','MIXTO'].includes(v.MetodoPago)) continue;
    if(!v.PagoMonedaJSON) {
      neto.USD+=Number(v.MontoEfectivo??v.TotalUSD??0)-Number(v.MontoCambio||0);
      continue;
    }
    const p=typeof v.PagoMonedaJSON==='string'?JSON.parse(v.PagoMonedaJSON):v.PagoMonedaJSON;
    const partes=p.Moneda==='MIXTA'?p.Desglose:{[p.Moneda]:p};
    if(!partes||!['USD','VES','MIXTA'].includes(p.Moneda)) throw new Error('Desglose monetario de venta inválido');
    if(p.Moneda==='MIXTA'&&(!partes.USD||!partes.VES)) throw new Error('Desglose combinado incompleto');
    for(const [moneda,d] of Object.entries(partes)) {
      if(!['USD','VES'].includes(moneda)) throw new Error('Moneda desconocida');
      neto[moneda]+=importeCaja(d.Efectivo)-importeCaja(d.Cambio);
    }
  }
  return {USD:centavos(neto.USD),VES:centavos(neto.VES)};
}

export function calcularArqueo(turno,totales,contado) {
  const resultado={Version:2};
  for(const m of ['USD','VES']) {
    const apertura=Number(m==='USD'?turno.MontoApertura:turno.MontoAperturaVES)||0;
    const ventas=Number(totales[`EfectivoOriginal${m}`])||0;
    const esperado=centavos(apertura+ventas);
    const cuenta=importeCaja(contado[m]);
    resultado[m]={Apertura:apertura,VentasNetas:ventas,Esperado:esperado,Contado:cuenta,Diferencia:centavos(cuenta-esperado)};
  }
  return resultado;
}
