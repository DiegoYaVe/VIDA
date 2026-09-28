// Solo proyecta importes históricos. Nunca consulta ni aplica la tasa vigente.
const numero=v=>v==null||v===''?null:Number(v);
const fecha=v=>v?String(v).slice(0,10):'';
export function prepararDocumentoCuenta(data) {
 const c=data.cuenta;
 if(!c?.idDocumento) throw new Error('Documento incompleto');
 let emision=null;
 if(c.TasaEmisionJSON) {
  try {emision=typeof c.TasaEmisionJSON==='string'?JSON.parse(c.TasaEmisionJSON):c.TasaEmisionJSON;}
  catch {throw new Error('La tasa histórica del documento no se puede leer');}
 }
 const cabecera=[
  ['Documento',String(c.idDocumento)],['Tipo',c.Tipo==='CXP'?'Cuenta por pagar':'Cuenta por cobrar'],
  ['Contraparte',c.Tipo==='CXP'?c.NombreProveedor||'':c.NombreSucursal||''],
  ['Folio',c.Folio||''],['Origen',`${c.OrigenTipo||''} #${c.idOrigen??''}`],
  ['Emisión',fecha(c.FechaEmision)],['Plazo (días)',numero(c.DiasPlazo)],['Vencimiento',fecha(c.FechaVencimiento)],
  ['Estado',c.Status||''],['Total USD',numero(c.TotalUSD)],['Abonos netos USD',numero(c.Abonado)],
  ['Notas de crédito USD',numero(c.Acreditado)],['Saldo USD',numero(c.Saldo)],
  ['Equivalente VES al emitir',numero(emision?.TotalVES)],['Tasa de emisión VES/USD',numero(emision?.TasaVESporUSD)],
  ['Fecha de tasa de emisión',fecha(emision?.FechaTasa)],['Fuente de emisión',emision?.Fuente||'No registrada'],
 ];
 const pagos=(data.abonos||[]).map(a=>[
  String(a.idAbono),fecha(a.FechaAbono),a.ReversoDe!=null?'Reverso':Number(a.MontoUSD)<0?'Reintegro histórico':'Abono',
  a.MonedaOriginal||'USD (histórico)',numero(a.MontoOriginal),numero(a.MontoUSD),numero(a.MontoVES),
  numero(a.TasaVESporUSD),fecha(a.FechaTasa),a.FuenteTasa||'No registrada',
  a.MetodoPago||'',a.Referencia||'',a.ReversoDe==null?'':String(a.ReversoDe),a.Notas||'',
 ]);
 const notas=(data.notasCredito||[]).map(n=>[String(n.idNota),fecha(n.FechaNota),numero(n.MontoUSD),n.Motivo||'',n.CancelaCuenta?'Sí':'No']);
 return {id:String(c.idDocumento),cabecera,pagos,notas,
  columnasPagos:['ID','Fecha','Movimiento','Moneda','Importe original','USD','VES','TC VES/USD','Fecha TC','Fuente TC','Método','Referencia','Reverso de','Notas'],
  columnasNotas:['ID','Fecha','Crédito USD','Motivo','Cierra cuenta'],
  aviso:'Estado de cuenta informativo. No sustituye factura fiscal. Equivalencias históricas; datos sin tasa permanecen sin equivalente. El saldo está denominado en USD. Las notas de crédito no son pagos.',
 };
}
