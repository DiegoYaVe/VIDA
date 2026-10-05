const MONEDAS=['USD','VES'];
const TIPO_LABEL={INGRESO:'Ingreso',EGRESO:'Egreso',RETIRO:'Retiro',DEVOLUCION:'Devolución'};
const fecha=f=>f?new Date(f).toLocaleString('es-VE',{dateStyle:'short',timeStyle:'short'}):'';

// Tablas del reporte de arqueos de caja, compartidas por Excel y PDF.
// USD y VES siempre en columnas separadas: nunca se convierten ni se suman.
// `conteos` marca las columnas que son cantidades (no importes).
export function tablasCaja({totales,monedas,movimientosPorTipo={},filas=[],turnos=[],turnosAbiertos=0}) {
 if(!monedas) return [];
 return [
  {nombre:'Por moneda',
   nota:`Importes originales; USD y VES no se convierten ni se suman. Turnos cerrados: ${totales.NumTurnos} · con diferencia: ${totales.TurnosConDiferencia} · legado sin desglose: ${totales.TurnosLegado} · abiertos sin cerrar: ${turnosAbiertos}.`,
   encabezado:['Moneda','Apertura','Ventas efectivo neto','Movimientos','Esperado','Contado','Diferencia neta','Faltantes','Sobrantes'],
   conteos:[],
   filas:MONEDAS.map(m=>{const x=monedas[m];return [m,x.Apertura,x.VentasNetas,x.Movimientos,x.Esperado,x.Contado,x.Diferencia,x.Faltantes,x.Sobrantes];})},
  {nombre:'Movimientos por tipo',
   nota:'Importes brutos de movimientos activos. Egresos, retiros y devoluciones restan del efectivo esperado; los ingresos suman.',
   encabezado:['Tipo','Cantidad','USD','VES'],
   conteos:[1],
   filas:Object.entries(movimientosPorTipo).map(([t,x])=>[TIPO_LABEL[t]||t,x.Cantidad,x.USD,x.VES])},
  {nombre:'Por sucursal',
   encabezado:['Sucursal','Turnos','Con diferencia','Legado','Esperado USD','Contado USD','Diferencia USD','Faltantes USD','Esperado VES','Contado VES','Diferencia VES','Faltantes VES'],
   conteos:[1,2,3],
   filas:filas.map(f=>[f.NombrePuntoVenta,f.NumTurnos,f.TurnosConDiferencia,f.TurnosLegado,
     f.USD.Esperado,f.USD.Contado,f.USD.Diferencia,f.USD.Faltantes,f.VES.Esperado,f.VES.Contado,f.VES.Diferencia,f.VES.Faltantes])},
  {nombre:'Por turno',
   nota:'Legado: cierre anterior al arqueo por moneda; su diferencia es un equivalente USD y no se reparte entre monedas.',
   encabezado:['Turno','Cierre','Sucursal','Cajero','Esperado USD','Contado USD','Diferencia USD','Esperado VES','Contado VES','Diferencia VES','Diferencia legado (equiv. USD)'],
   conteos:[],
   filas:turnos.map(t=>t.Legado
     ?[String(t.idTurno),fecha(t.FechaCierre),t.Tienda,t.Cajero||'',null,null,null,null,null,null,t.DiferenciaEquivUSD]
     :[String(t.idTurno),fecha(t.FechaCierre),t.Tienda,t.Cajero||'',t.USD.Esperado,t.USD.Contado,t.USD.Diferencia,t.VES.Esperado,t.VES.Contado,t.VES.Diferencia,null])},
 ];
}
