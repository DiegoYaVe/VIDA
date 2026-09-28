export default function ResumenMoneda({datos}) {
 let p=datos;try {if(typeof p==='string') p=JSON.parse(p);}catch{return null;}
 if(!p) return null;
 return <div className="text-xs border-t border-dashed py-2 my-2 space-y-1">
 <p className="font-bold">{p.TotalOriginal != null ? `Cobrado: ${Number(p.TotalOriginal).toFixed(2)} ${p.Moneda}` : 'Equivalencia al emitir documento'}</p>
 <p>USD {Number(p.TotalUSD).toFixed(2)} · VES {Number(p.TotalVES).toFixed(2)}</p>
 {p.Efectivo!=null && <p>Recibido: {Number(p.Efectivo).toFixed(2)} efectivo + {Number(p.Tarjeta).toFixed(2)} tarjeta ({p.Moneda})</p>}
 {p.Cambio>0 && <p>Cambio: {Number(p.Cambio).toFixed(2)} {p.Moneda}</p>}
 <p>1 USD = {p.TasaVESporUSD} VES · {String(p.FechaTasa).slice(0,10)}</p><p className="break-all">Fuente: {p.Fuente}</p>
 </div>;
}
