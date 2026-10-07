export default function ResumenMoneda({datos}) {
 let p=datos;try {if(typeof p==='string') p=JSON.parse(p);}catch{return null;}
 if(!p) return null;
 return <div className="text-xs border-t border-dashed py-2 my-2 space-y-1">
 <p className="font-bold">{p.Moneda==='MIXTA'?'Cobro combinado USD + bolívares':p.TotalOriginal != null ? `Cobrado: ${Number(p.TotalOriginal).toFixed(2)} ${p.Moneda}` : 'Equivalencia al emitir documento'}</p>
 {p.Desglose&&['USD','VES'].map(m=><p key={m}>{m}: efectivo {Number(p.Desglose[m].Efectivo).toFixed(2)} + tarjeta {Number(p.Desglose[m].Tarjeta).toFixed(2)} · cambio {Number(p.Desglose[m].Cambio).toFixed(2)}</p>)}
 {p.IGTFUSD>0&&<p>IGTF 3% s/ {Number(p.IGTFBaseUSD).toFixed(2)} USD pagados en divisas: {Number(p.IGTFUSD).toFixed(2)} USD</p>}
 {!!p.AjusteRedondeoUSD&&<p>Ajuste de redondeo: {Number(p.AjusteRedondeoUSD).toFixed(4)} USD</p>}
 <p>USD {Number(p.TotalUSD).toFixed(2)} · VES {Number(p.TotalVES).toFixed(2)}</p>
 {p.Efectivo!=null && <p>Recibido: {Number(p.Efectivo).toFixed(2)} efectivo + {Number(p.Tarjeta).toFixed(2)} tarjeta ({p.Moneda})</p>}
 {p.Cambio>0 && <p>Cambio: {Number(p.Cambio).toFixed(2)} {p.Moneda}</p>}
 <p>1 USD = {p.TasaVESporUSD} VES · {String(p.FechaTasa).slice(0,10)}</p><p className="break-all">Fuente: {p.Fuente}</p>
 </div>;
}
