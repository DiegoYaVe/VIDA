import {centavos} from './pagoPos.service.js';
import {SIGNO_MOVIMIENTO} from './arqueo.service.js';

const MONEDAS=['USD','VES'];
const TIPOS=Object.keys(SIGNO_MOVIMIENTO);
const campos=()=>({Apertura:0,VentasNetas:0,Movimientos:0,Esperado:0,Contado:0,Diferencia:0,Faltantes:0,Sobrantes:0});

// Consolida arqueos de turnos CERRADOS por moneda a partir del snapshot que se
// congeló al cierre (ArqueoMonedasJSON). Nunca convierte ni suma USD con VES.
// Faltantes y sobrantes se acumulan aparte para que un sobrante de un turno no
// tape el faltante de otro. Los cierres anteriores al arqueo por moneda (sin
// JSON) quedan como "legado": su diferencia era equivalente USD y no se reparte.
export function construirReporteCaja(turnos,movimientos=[]) {
  const monedas={USD:campos(),VES:campos()};
  const tiendas=new Map(),detalle=[],ids=new Set();
  const totales={NumTurnos:0,TurnosConDiferencia:0,TurnosLegado:0,TotalVentasUSD:0,DiferenciaLegadoUSD:0};

  for(const t of turnos) {
    ids.add(String(t.idTurno));
    const key=String(t.idPuntoVenta);
    if(!tiendas.has(key)) tiendas.set(key,{idPuntoVenta:t.idPuntoVenta,NombrePuntoVenta:t.NombrePuntoVenta,Pais:t.Pais,Estado:t.Estado,Ciudad:t.Ciudad,
      NumTurnos:0,TurnosConDiferencia:0,TurnosLegado:0,TotalVentasUSD:0,USD:campos(),VES:campos()});
    const tienda=tiendas.get(key);
    const ventasUSD=Number(t.TotalVentas||0);
    totales.NumTurnos++;tienda.NumTurnos++;
    totales.TotalVentasUSD+=ventasUSD;tienda.TotalVentasUSD+=ventasUSD;
    const fila={idTurno:t.idTurno,idPuntoVenta:t.idPuntoVenta,Tienda:t.NombrePuntoVenta,Cajero:t.NombreUsuario||null,
      FechaApertura:t.FechaApertura,FechaCierre:t.FechaCierre,TotalVentasUSD:centavos(ventasUSD),NumTransacciones:Number(t.NumTransacciones||0)};

    if(!t.ArqueoMonedasJSON) {
      const dif=Number(t.Diferencia||0);
      totales.TurnosLegado++;tienda.TurnosLegado++;totales.DiferenciaLegadoUSD+=dif;
      if(dif!==0) {totales.TurnosConDiferencia++;tienda.TurnosConDiferencia++;}
      detalle.push({...fila,Legado:true,DiferenciaEquivUSD:centavos(dif)});
      continue;
    }

    let a;
    try {a=JSON.parse(t.ArqueoMonedasJSON);} catch {throw new Error(`Arqueo del turno ${t.idTurno} ilegible`);}
    if(!a||!a.USD||!a.VES) throw new Error(`Arqueo del turno ${t.idTurno} incompleto`);
    let conDiferencia=false;
    for(const m of MONEDAS) {
      const x=a[m];
      // Movimientos no existe en arqueos cerrados antes de movimientos de caja.
      const v={Apertura:Number(x.Apertura||0),VentasNetas:Number(x.VentasNetas||0),Movimientos:Number(x.Movimientos||0),
        Esperado:Number(x.Esperado),Contado:Number(x.Contado),Diferencia:Number(x.Diferencia)};
      if(!Object.values(v).every(Number.isFinite)) throw new Error(`Arqueo del turno ${t.idTurno} con importes inválidos`);
      for(const dest of [monedas[m],tienda[m]]) {
        for(const k of Object.keys(v)) dest[k]+=v[k];
        if(v.Diferencia<0) dest.Faltantes-=v.Diferencia; else dest.Sobrantes+=v.Diferencia;
      }
      if(v.Diferencia!==0) conDiferencia=true;
      fila[m]=v;
    }
    if(conDiferencia) {totales.TurnosConDiferencia++;tienda.TurnosConDiferencia++;}
    detalle.push({...fila,Legado:false});
  }

  // Movimientos por tipo y moneda (importes brutos), solo ACTIVOS y solo de
  // los turnos incluidos en el reporte.
  const movimientosPorTipo={};
  for(const tipo of TIPOS) movimientosPorTipo[tipo]={USD:0,VES:0,Cantidad:0};
  for(const mv of movimientos) {
    if(!ids.has(String(mv.idTurno))) continue;
    if(mv.Status&&mv.Status!=='ACTIVO') continue;
    if(!movimientosPorTipo[mv.Tipo]) throw new Error('Tipo de movimiento de caja inválido');
    if(!MONEDAS.includes(mv.Moneda)) throw new Error('Moneda de movimiento inválida');
    const monto=Number(mv.Monto);
    if(!Number.isFinite(monto)||monto<0) throw new Error('Monto de movimiento inválido');
    movimientosPorTipo[mv.Tipo][mv.Moneda]+=monto;
    movimientosPorTipo[mv.Tipo].Cantidad++;
  }

  const redondear=o=>{for(const k of Object.keys(o)) if(typeof o[k]==='number') o[k]=centavos(o[k]);};
  for(const m of MONEDAS) redondear(monedas[m]);
  const filas=[...tiendas.values()];
  for(const f of filas) {redondear(f.USD);redondear(f.VES);f.TotalVentasUSD=centavos(f.TotalVentasUSD);}
  for(const tipo of TIPOS) {const x=movimientosPorTipo[tipo];x.USD=centavos(x.USD);x.VES=centavos(x.VES);}
  totales.TotalVentasUSD=centavos(totales.TotalVentasUSD);
  totales.DiferenciaLegadoUSD=centavos(totales.DiferenciaLegadoUSD);
  filas.sort((a,b)=>String(a.NombrePuntoVenta||'').localeCompare(String(b.NombrePuntoVenta||''),'es'));
  return {totales,monedas,movimientosPorTipo,filas,turnos:detalle};
}
