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

// Signo del efecto de cada movimiento sobre el EFECTIVO físico de la caja.
// INGRESO mete billetes; EGRESO/RETIRO/DEVOLUCION los saca.
export const SIGNO_MOVIMIENTO={INGRESO:1,EGRESO:-1,RETIRO:-1,DEVOLUCION:-1};

// Efecto neto de los movimientos sobre el efectivo, por moneda y SIN netear
// entre monedas (los dólares de un egreso no tapan un faltante en bolívares).
// Solo cuenta los ACTIVOS; ignora los ANULADOS.
export function efectoMovimientos(movimientos) {
  const neto={USD:0,VES:0};
  for(const mv of movimientos||[]) {
    if(mv.Status&&mv.Status!=='ACTIVO') continue;
    const signo=SIGNO_MOVIMIENTO[mv.Tipo];
    if(signo===undefined) throw new Error('Tipo de movimiento de caja inválido');
    if(!['USD','VES'].includes(mv.Moneda)) throw new Error('Moneda de movimiento inválida');
    neto[mv.Moneda]+=signo*importeCaja(Number(mv.Monto));
  }
  return {USD:centavos(neto.USD),VES:centavos(neto.VES)};
}

export function calcularArqueo(turno,totales,contado,movimientos) {
  const efecto=efectoMovimientos(movimientos);
  const resultado={Version:2};
  for(const m of ['USD','VES']) {
    const apertura=Number(m==='USD'?turno.MontoApertura:turno.MontoAperturaVES)||0;
    const ventas=Number(totales[`EfectivoOriginal${m}`])||0;
    const mov=efecto[m];
    const esperado=centavos(apertura+ventas+mov);
    const cuenta=importeCaja(contado[m]);
    resultado[m]={Apertura:apertura,VentasNetas:ventas,Movimientos:mov,Esperado:esperado,Contado:cuenta,Diferencia:centavos(cuenta-esperado)};
  }
  return resultado;
}

// Ventas offline que se sincronizaron cuando su turno YA estaba cerrado. No
// cambian el cierre guardado; explican la diferencia: su efectivo estaba en la
// caja al contarla (sobrante), así que la diferencia conciliada lo descuenta.
export function conciliarTardias(arqueoGuardado, ventasTardias) {
  const efectivo = efectivoPorMoneda(ventasTardias || []);
  const res = {
    NumTransacciones: (ventasTardias || []).length,
    TotalUSD: centavos((ventasTardias || []).reduce((s, v) => s + Number(v.TotalUSD || 0), 0)),
    EfectivoUSD: efectivo.USD, EfectivoVES: efectivo.VES,
    DiferenciaConciliadaUSD: null, DiferenciaConciliadaVES: null,
  };
  if (arqueoGuardado?.USD) res.DiferenciaConciliadaUSD = centavos(Number(arqueoGuardado.USD.Diferencia) - efectivo.USD);
  if (arqueoGuardado?.VES) res.DiferenciaConciliadaVES = centavos(Number(arqueoGuardado.VES.Diferencia) - efectivo.VES);
  return res;
}
