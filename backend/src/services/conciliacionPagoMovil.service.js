// Conciliación de pagos Pago Móvil: clasifica cada pedido según su pago y
// señala lo que exige acción (cobros sin confirmar, devoluciones, referencias
// repetidas). Usa el snapshot VES congelado al crear el pedido; nunca recalcula
// con una tasa nueva.
const red2=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;

export const ESTADOS_CONCILIACION={
 POR_REVISAR:'Comprobante por revisar',
 SIN_COMPROBANTE:'Esperando comprobante',
 APROBADO:'Pago aprobado',
 DEVOLUCION:'Pagado y cancelado: devolver dinero',
 ENTREGADO_SIN_PAGO:'Entregado sin pago confirmado',
 CANCELADO:'Cancelado sin pago',
};

export function estadoConciliacion(p,pendientes) {
 if(p.StatusPago==='PAGADO') return p.Status==='CANCELADO'?'DEVOLUCION':'APROBADO';
 if(p.Status==='ESPERANDO_PAGO') return pendientes>0?'POR_REVISAR':'SIN_COMPROBANTE';
 if(p.Status==='CANCELADO') return 'CANCELADO';
 // Flujo anterior a la aprobación previa: el pedido avanzó sin pago validado.
 return 'ENTREGADO_SIN_PAGO';
}

const normRef=r=>String(r||'').replace(/\D/g,'')||String(r||'').trim().toUpperCase();

export function construirConciliacionPagoMovil(pedidos,comprobantes=[]) {
 const porPedido=new Map();
 for(const c of comprobantes) {
  const k=String(c.idPedido);
  if(!porPedido.has(k)) porPedido.set(k,[]);
  porPedido.get(k).push(c);
 }
 const totales=Object.fromEntries(Object.keys(ESTADOS_CONCILIACION).map(e=>[e,{Pedidos:0,VES:0,USD:0}]));
 const filas=[],ids=new Set();
 let sinTasa=0;
 for(const p of pedidos) {
  ids.add(String(p.idPedido));
  const comps=(porPedido.get(String(p.idPedido))||[]).sort((a,b)=>Number(a.idComprobante)-Number(b.idComprobante));
  const pendientes=comps.filter(c=>c.StatusRevision==='PENDIENTE').length;
  const estado=estadoConciliacion(p,pendientes);
  let snap=null;
  if(p.PagoMonedaJSON) {
   try {snap=JSON.parse(p.PagoMonedaJSON);} catch {throw new Error(`Snapshot de pago del pedido ${p.idPedido} ilegible`);}
  }
  const montoVES=snap?.Moneda==='VES'&&Number.isFinite(Number(snap.TotalOriginal))?red2(snap.TotalOriginal):null;
  if(montoVES==null) sinTasa++;
  const usd=red2(p.TotalUSD);
  totales[estado].Pedidos++;totales[estado].USD+=usd;
  if(montoVES!=null) totales[estado].VES+=montoVES;
  const aprobado=comps.find(c=>c.StatusRevision==='APROBADO');
  const ultimo=comps[comps.length-1];
  filas.push({idPedido:p.idPedido,Fecha:p.FechaAlta,Tienda:p.NombrePuntoVenta,idPuntoVenta:p.idPuntoVenta,
   Cliente:[p.ClienteNombre,p.ClienteApellidos].filter(Boolean).join(' ')||null,Telefono:p.ClienteTelefono||null,
   Status:p.Status,StatusPago:p.StatusPago,Estado:estado,EstadoLabel:ESTADOS_CONCILIACION[estado],
   TotalUSD:usd,MontoVES:montoVES,Tasa:snap?.TasaVESporUSD??null,FechaTasa:snap?.FechaTasa??null,
   Referencia:(aprobado||ultimo)?.Referencia||null,Comprobantes:comps.length,ComprobantesPendientes:pendientes,
   ComprobantePendiente:comps.filter(c=>c.StatusRevision==='PENDIENTE').pop()||null,
   comprobantes:comps.map(c=>({idComprobante:c.idComprobante,Referencia:c.Referencia,ImagenURL:c.ImagenURL,StatusRevision:c.StatusRevision,
    Notas:c.Notas,FechaAlta:c.FechaAlta,UsuRevision:c.UsuRevision}))});
 }
 // Misma referencia bancaria presentada en pedidos distintos (sin contar las
 // rechazadas): posible pago reutilizado. Comparación por dígitos.
 const usos=new Map();
 for(const c of comprobantes) {
  if(!ids.has(String(c.idPedido))||c.StatusRevision==='RECHAZADO'||!c.Referencia) continue;
  const k=normRef(c.Referencia);
  if(!usos.has(k)) usos.set(k,{Referencia:c.Referencia,pedidos:new Set()});
  usos.get(k).pedidos.add(Number(c.idPedido));
 }
 const referenciasRepetidas=[...usos.values()].filter(u=>u.pedidos.size>1)
  .map(u=>({Referencia:u.Referencia,Pedidos:[...u.pedidos].sort((a,b)=>a-b)}));
 for(const t of Object.values(totales)) {t.VES=red2(t.VES);t.USD=red2(t.USD);}
 filas.sort((a,b)=>new Date(b.Fecha)-new Date(a.Fecha)||Number(b.idPedido)-Number(a.idPedido));
 return {totales,filas,referenciasRepetidas,sinTasa,
  atencion:totales.POR_REVISAR.Pedidos+totales.DEVOLUCION.Pedidos+totales.ENTREGADO_SIN_PAGO.Pedidos+referenciasRepetidas.length};
}
