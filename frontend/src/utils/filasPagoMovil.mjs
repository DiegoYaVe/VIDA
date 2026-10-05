const ESTADOS=['POR_REVISAR','SIN_COMPROBANTE','APROBADO','DEVOLUCION','ENTREGADO_SIN_PAGO','CANCELADO'];
const LABEL={POR_REVISAR:'Comprobante por revisar',SIN_COMPROBANTE:'Esperando comprobante',APROBADO:'Pago aprobado',
 DEVOLUCION:'Pagado y cancelado: devolver dinero',ENTREGADO_SIN_PAGO:'Entregado sin pago confirmado',CANCELADO:'Cancelado sin pago'};
const fecha=f=>f?new Date(f).toLocaleString('es-VE',{dateStyle:'short',timeStyle:'short'}):'';

// Tablas de la conciliación de Pago Móvil, compartidas por Excel y PDF.
// `conteos` marca las columnas que son cantidades (no importes).
export function tablasPagoMovil({totales,filas=[],referenciasRepetidas=[],sinTasa=0}) {
 if(!totales) return [];
 return [
  {nombre:'Resumen',
   nota:`Montos VES del snapshot congelado al crear cada pedido (no se recalculan con la tasa de hoy). Pedidos sin tasa registrada (flujo anterior): ${sinTasa}.`,
   encabezado:['Estado','Pedidos','Monto VES','Total USD'],conteos:[1],
   filas:ESTADOS.map(e=>[LABEL[e],totales[e].Pedidos,totales[e].VES,totales[e].USD])},
  {nombre:'Pedidos',
   encabezado:['Pedido','Fecha','Sucursal','Cliente','Teléfono','Estado','Monto VES','TC VES/USD','Total USD','Referencia','Comprobantes'],conteos:[10],
   filas:filas.map(f=>[String(f.idPedido),fecha(f.Fecha),f.Tienda,f.Cliente||'',f.Telefono||'',f.EstadoLabel,f.MontoVES,f.Tasa,f.TotalUSD,f.Referencia||'',f.Comprobantes])},
  {nombre:'Comprobantes',
   encabezado:['Pedido','Comprobante','Subido','Referencia','Revisión','Notas','Revisó'],conteos:[],
   filas:filas.flatMap(f=>f.comprobantes.map(c=>[String(f.idPedido),String(c.idComprobante),fecha(c.FechaAlta),c.Referencia||'',c.StatusRevision,c.Notas||'',c.UsuRevision||'']))},
  {nombre:'Referencias repetidas',
   nota:'Una misma referencia bancaria presentada en pedidos distintos (sin contar comprobantes rechazados): revisar si es un pago reutilizado.',
   encabezado:['Referencia','Pedidos'],conteos:[],
   filas:referenciasRepetidas.map(r=>[r.Referencia,r.Pedidos.join(', ')])},
 ];
}
