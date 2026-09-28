export function tablasMonedas({monedas,detalleMonedas=[],sinTasa=0}) {
 if(!monedas) return [];
 return [
  {nombre:'Por moneda',datos:[['Importes originales; no suman equivalentes USD y VES entre sí.'],['Ventas históricas sin tasa',sinTasa],[],['Moneda','Efectivo recibido','Tarjeta','Cambio entregado','Efectivo neto'],...['USD','VES'].map(m=>[m,monedas[m].Efectivo,monedas[m].Tarjeta,monedas[m].Cambio,monedas[m].NetoEfectivo])]},
  {nombre:'Tasas por venta',datos:[['Pedido','Fecha','Tienda','Moneda','Efectivo','Tarjeta','Cambio','Efectivo neto','TC VES/USD','Fecha TC','Fuente'],...detalleMonedas.map(d=>[String(d.idPedido),d.Fecha,d.Tienda,d.Moneda,d.Efectivo,d.Tarjeta,d.Cambio,d.NetoEfectivo,d.Tasa,d.FechaTasa?String(d.FechaTasa).slice(0,10):'',d.Fuente])]},
 ];
}
