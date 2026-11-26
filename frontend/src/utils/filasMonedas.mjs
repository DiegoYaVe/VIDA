export function tablasMonedas({monedas,detalleMonedas=[],sinTasa=0}) {
 if(!monedas) return [];
 return [
  {nombre:'Por moneda',datos:[['Importes originales; no suman equivalentes en dólares y bolívares entre sí.'],['Ventas históricas sin tasa',sinTasa],[],['Moneda','Efectivo recibido','Tarjeta','Pago electrónico','Cambio entregado','Efectivo neto'],...['USD','VES'].map(m=>[m==='VES'?'Bs':m,monedas[m].Efectivo,monedas[m].Tarjeta,monedas[m].Electronico??0,monedas[m].Cambio,monedas[m].NetoEfectivo])]},
  {nombre:'Tasas por venta',datos:[['Pedido','Fecha','Tienda','Moneda','Efectivo','Tarjeta','Pago electrónico','Forma','Referencia','Cambio','Efectivo neto','TC Bs/USD','Fecha TC','Fuente'],...detalleMonedas.map(d=>[String(d.idPedido),d.Fecha,d.Tienda,d.Moneda==='VES'?'Bs':d.Moneda,d.Efectivo,d.Tarjeta,d.Electronico??0,d.Forma??'',d.Referencia??'',d.Cambio,d.NetoEfectivo,d.Tasa,d.FechaTasa?String(d.FechaTasa).slice(0,10):'',d.Fuente])]},
 ];
}
