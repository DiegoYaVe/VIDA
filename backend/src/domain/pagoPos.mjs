export const centavos = v => Math.round((Number(v)+Number.EPSILON)*100)/100;
const error = mensaje => {throw Object.assign(new Error(mensaje),{statusCode:422});};
// IGTF: 3% sobre lo pagado en divisas; lo cobran los contribuyentes especiales.
export const PCT_IGTF = 3;
// Pagos electrónicos en la caja (tarea 22 y Biopago): no son efectivo, no dan
// cambio y llevan la referencia de la operación. Cada uno en su moneda.
export const FORMAS_ELECTRONICAS = {
  PAGO_MOVIL:    { Moneda: 'VES', Nombre: 'Pago Móvil' },
  TRANSFERENCIA: { Moneda: 'VES', Nombre: 'Transferencia' },
  BIOPAGO:       { Moneda: 'VES', Nombre: 'Biopago' },
  ZELLE:         { Moneda: 'USD', Nombre: 'Zelle' },
};
export const formasDeMoneda = m => Object.keys(FORMAS_ELECTRONICAS).filter(f => FORMAS_ELECTRONICAS[f].Moneda === m);
function referencia(ref) {
  const r = typeof ref === 'string' ? ref.trim() : '';
  if (r.length < 4 || r.length > 40) error('Escribe la referencia del pago electrónico (4 a 40 caracteres)');
  return r;
}
function formaValida(forma, moneda) {
  if (!FORMAS_ELECTRONICAS[forma]) error('Forma de pago electrónica inválida');
  if (FORMAS_ELECTRONICAS[forma].Moneda !== moneda)
    error(`${FORMAS_ELECTRONICAS[forma].Nombre} se cobra en ${moneda === 'USD' ? 'bolívares' : 'dólares'}`);
  return forma;
}
// Método que se guarda en la venta: el único usado o MIXTO si hubo varios.
function metodoDe(usados) {
  const u = [...new Set(usados)];
  return u.length === 1 ? u[0] : 'MIXTO';
}
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
  if(!['EFECTIVO','TARJETA','MIXTO'].includes(metodo)&&!FORMAS_ELECTRONICAS[metodo]) error('Método inválido');
  const monto = x => {
    if(typeof x!=='number'||!Number.isFinite(x)||x<0||x>=1e10||Math.abs(x*100-Math.round(x*100))>1e-5) error('Importes de cobro deben ser positivos con máximo dos decimales');
    return x;
  };
  const efectivo=monto(pago.Efectivo),tarjeta=monto(pago.Tarjeta);
  // Pagando en dólares, el IGTF se suma sobre toda la venta
  const igtfUSD=igtf&&moneda==='USD'?centavos(totalUSD*PCT_IGTF/100):0;
  const original=centavos((totalUSD+igtfUSD)*(moneda==='VES'?tc:1));
  const usd = v => Math.round(v/(moneda==='VES'?tc:1)*10000)/10000;
  const tasaInfo={TasaVESporUSD:tc,idTasa:tasa.idTasa,FechaTasa:tasa.FechaValor,Fuente:tasa.Fuente};
  const igtfInfo=igtf?{IGTFUSD:igtfUSD,IGTFBaseUSD:igtfUSD?centavos(totalUSD):0,TotalCobradoUSD:centavos(totalUSD+igtfUSD)}:{};
  if(FORMAS_ELECTRONICAS[metodo]) {
    // Pago electrónico: el importe exacto, sin efectivo ni tarjeta ni cambio
    formaValida(metodo,moneda);
    if(efectivo!==0||tarjeta!==0) error('El desglose no coincide con el método');
    return {Moneda:moneda,Metodo:metodo,TotalOriginal:original,TotalUSD:centavos(totalUSD),TotalVES:centavos(totalUSD*tc),
      Efectivo:0,Tarjeta:0,Cambio:0,Electronico:original,Forma:metodo,Referencia:referencia(pago.Referencia),
      EfectivoUSD:0,TarjetaUSD:0,CambioUSD:0,ElectronicoUSD:usd(original),...igtfInfo,...tasaInfo};
  }
  if(metodo==='EFECTIVO'&&tarjeta!==0||metodo==='TARJETA'&&efectivo!==0) error('El desglose no coincide con el método');
  const cambio=centavos(efectivo+tarjeta-original);
  if(cambio<0||tarjeta>original||cambio>efectivo) error('El pago no cubre el total o el cambio excede el efectivo');
  return {Moneda:moneda,Metodo:metodo,TotalOriginal:original,TotalUSD:centavos(totalUSD),TotalVES:centavos(totalUSD*tc),
    Efectivo:efectivo,Tarjeta:tarjeta,Cambio:cambio,
    EfectivoUSD:usd(efectivo),TarjetaUSD:usd(tarjeta),CambioUSD:usd(cambio),
    ...igtfInfo,...tasaInfo};
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
  const usados=[];
  for(const m of ['USD','VES']) {
    const d=pago.Desglose?.[m];
    desglose[m]={Efectivo:importeCaja(d?.Efectivo),Tarjeta:importeCaja(d?.Tarjeta),Cambio:0};
    // Opcional: un pago electrónico en esta moneda (Pago Móvil, Zelle…)
    const electronico=d?.Electronico==null||d.Electronico===''?0:importeCaja(d.Electronico);
    if(electronico>0) {
      desglose[m].Electronico=electronico;
      desglose[m].Forma=formaValida(d.Forma,m);
      desglose[m].Referencia=referencia(d.Referencia);
      usados.push(d.Forma);
    }
    if(desglose[m].Efectivo>0) usados.push('EFECTIVO');
    if(desglose[m].Tarjeta>0) usados.push('TARJETA');
  }
  const el=m=>desglose[m].Electronico||0;
  const efectivo=desglose.USD.Efectivo+desglose.VES.Efectivo/tc;
  const tarjeta=desglose.USD.Tarjeta+desglose.VES.Tarjeta/tc;
  const electronicoUSD=el('USD')+el('VES')/tc;
  // Lo que no es efectivo (tarjeta y electrónico) nunca da cambio
  const noEfectivo=tarjeta+electronicoUSD;
  const recibido=efectivo+noEfectivo;
  const m=pago.MonedaCambio;
  if(!['USD','VES'].includes(m)) error('Selecciona la moneda del cambio');
  // Parte de la venta que se paga en dólares (base del IGTF). Si el cambio se
  // devuelve en dólares, se descuenta: lo pagado en divisas es lo neto.
  let baseIGTF=0;
  if(igtf) {
    const usdRecibido=desglose.USD.Efectivo+desglose.USD.Tarjeta+el('USD');
    const vesEnUSD=(desglose.VES.Efectivo+desglose.VES.Tarjeta+el('VES'))/tc;
    baseIGTF=m==='USD'?Math.max(0,total-vesEnUSD):Math.min(total,usdRecibido/(1+PCT_IGTF/100));
    baseIGTF=centavos(Math.min(baseIGTF,usdRecibido));
  }
  const igtfUSD=centavos(baseIGTF*PCT_IGTF/100);
  const exigido=centavos(total+igtfUSD);
  // Comparación en centavos USD, moneda de la deuda; se conserva el redondeo.
  if(centavos(recibido)<exigido) error('El pago no cubre el total');
  if(centavos(noEfectivo)>exigido) error('La tarjeta y los pagos electrónicos exceden el total de la venta');
  const cambio=centavos(Math.max(0,recibido-exigido)*(m==='VES'?tc:1));
  if(cambio>desglose[m].Efectivo) error('El cambio excede el efectivo recibido en esa moneda');
  desglose[m].Cambio=cambio;
  const cambioUSD=cambio/(m==='VES'?tc:1);
  const metodo=usados.length?metodoDe(usados):'EFECTIVO';
  return {Moneda:'MIXTA',Metodo:metodo,Desglose:desglose,MonedaCambio:m,
    TotalUSD:centavos(total),TotalVES:centavos(total*tc),EfectivoUSD:usd(efectivo),
    TarjetaUSD:usd(tarjeta),CambioUSD:usd(cambioUSD),
    ...(electronicoUSD>0?{ElectronicoUSD:usd(electronicoUSD)}:{}),
    AjusteRedondeoUSD:usd(recibido-cambioUSD-exigido),
    ...(igtf?{IGTFUSD:igtfUSD,IGTFBaseUSD:baseIGTF,TotalCobradoUSD:exigido}:{}),
    TasaVESporUSD:tc,idTasa:tasa.idTasa,FechaTasa:tasa.FechaValor,Fuente:tasa.Fuente};
}

// Pagos electrónicos de un conjunto de ventas, por forma y moneda, con cuántas
// operaciones. Lee el desglose guardado en la venta (PagoMonedaJSON).
export function electronicosPorForma(ventas) {
  const res = {};
  const sumar = (forma, moneda, monto) => {
    const k = res[forma] ||= { Forma: forma, Nombre: FORMAS_ELECTRONICAS[forma]?.Nombre || forma, Moneda: moneda, Monto: 0, Operaciones: 0 };
    k.Monto = centavos(k.Monto + Number(monto)); k.Operaciones++;
  };
  for (const v of ventas || []) {
    if (!v.PagoMonedaJSON) continue;
    const p = typeof v.PagoMonedaJSON === 'string' ? JSON.parse(v.PagoMonedaJSON) : v.PagoMonedaJSON;
    if (p.Moneda === 'MIXTA') {
      for (const [m, d] of Object.entries(p.Desglose || {})) if (Number(d.Electronico) > 0) sumar(d.Forma, m, d.Electronico);
    } else if (Number(p.Electronico) > 0) sumar(p.Forma, p.Moneda, p.Electronico);
  }
  return Object.values(res);
}
