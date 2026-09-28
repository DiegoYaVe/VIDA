// Agrega snapshots históricos, sin consultar tipos de cambio nuevos.
export function construirReporteVentas(ventas) {
 const tiendas=new Map(),dias=new Map(),detalleMonedas=[];
 const monedas={USD:{Efectivo:0,Tarjeta:0,Cambio:0,NetoEfectivo:0},VES:{Efectivo:0,Tarjeta:0,Cambio:0,NetoEfectivo:0}};
 let sinTasa=0;
 for(const v of ventas) {
  const key=String(v.idPuntoVenta),fecha=new Date(v.FechaAlta).toISOString().slice(0,10);
  if(!tiendas.has(key)) tiendas.set(key,{idPuntoVenta:v.idPuntoVenta,NombrePuntoVenta:v.NombrePuntoVenta,Pais:v.Pais,Estado:v.Estado,Ciudad:v.Ciudad,NumVentas:0,TotalUSD:0,TotalEfectivo:0,TotalTarjeta:0,TotalCambio:0});
  const t=tiendas.get(key);t.NumVentas++;t.TotalUSD+=Number(v.TotalUSD);
  t.TotalEfectivo+=Number(v.MontoEfectivo||0);t.TotalTarjeta+=Number(v.MontoTarjeta||0);t.TotalCambio+=Number(v.MontoCambio||0);
  const d=dias.get(fecha)||{Fecha:fecha,NumVentas:0,TotalUSD:0};d.NumVentas++;d.TotalUSD+=Number(v.TotalUSD);dias.set(fecha,d);
  const p=v.PagoMonedaJSON?JSON.parse(v.PagoMonedaJSON):null;
  if(!p) sinTasa++;
  const partes=p?.Moneda==='MIXTA'?p.Desglose:p?{[p.Moneda]:p}:{USD:{Efectivo:Number(v.MontoEfectivo||0),Tarjeta:Number(v.MontoTarjeta||0),Cambio:Number(v.MontoCambio||0)}};
  if(!partes||p?.Moneda==='MIXTA'&&(!partes.USD||!partes.VES)) throw new Error('Desglose histórico incompleto');
  for(const [moneda,m] of Object.entries(partes)) {
   if(!monedas[moneda]) throw new Error('Moneda histórica desconocida');
   const ef=Number(m.Efectivo),tar=Number(m.Tarjeta),cambio=Number(m.Cambio);
   if(![ef,tar,cambio].every(Number.isFinite)) throw new Error('Importe histórico inválido');
   monedas[moneda].Efectivo+=ef;monedas[moneda].Tarjeta+=tar;monedas[moneda].Cambio+=cambio;monedas[moneda].NetoEfectivo+=ef-cambio;
   detalleMonedas.push({idPedido:v.idPedido,Fecha:fecha,Tienda:v.NombrePuntoVenta,Moneda:moneda,Efectivo:ef,Tarjeta:tar,Cambio:cambio,NetoEfectivo:ef-cambio,Tasa:p?.TasaVESporUSD??null,FechaTasa:p?.FechaTasa??null,Fuente:p?.Fuente??'Histórico USD sin tasa'});
  }
 }
 const filas=[...tiendas.values()],totales={NumVentas:0,TotalUSD:0,TotalEfectivo:0,TotalTarjeta:0,TotalCambio:0};
 for(const r of filas) for(const k of Object.keys(totales)) totales[k]+=r[k];
 for(const m of Object.values(monedas)) for(const k of Object.keys(m)) m[k]=+m[k].toFixed(4);
 return {filas,totales,graficaDiaria:[...dias.values()].sort((a,b)=>a.Fecha.localeCompare(b.Fecha)),monedas,detalleMonedas,sinTasa};
}
