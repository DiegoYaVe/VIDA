// Puntos y script Leaflet del mapa de seguimiento (nativo y web)
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const RECOGIDA = ['REPARTIDOR_ASIGNADO', 'IR_A_SUCURSAL', 'EN_SUCURSAL'];

// Puntos del pedido: tienda, repartidor (si ya tiene) y destino
export function puntosSeguimiento(estado) {
  const p = (lat, lon) => (num(lat) != null && num(lon) != null ? { lat: num(lat), lon: num(lon) } : null);
  const min = num(estado?.MinutosRestantes);
  return {
    tienda: p(estado?.LatSucursal, estado?.LonSucursal),
    repartidor: p(estado?.LatRepartidor, estado?.LonRepartidor),
    destino: p(estado?.UbicacionEntregaLat, estado?.UbicacionEntregaLon),
    status: String(estado?.Status || '').toUpperCase(),
    nombreTienda: String(estado?.NombreSucursal || '').trim(),
    minutos: min != null && min >= 0 ? Math.round(min) : null,
  };
}

function metros(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// Lo que se dibuja según la fase del pedido (seq = puntos de la ruta):
//   sin repartidor → tienda → casa
//   va por el pedido → repartidor → tienda → casa
//   en camino → repartidor → casa (la tienda ya no importa)
//   entregado / cancelado → solo la casa, sin ruta ni repartidor
// Un punto a < 40 m del anterior se omite (quedan encimados).
export function depurarSeguimiento({ tienda, repartidor, destino, status }) {
  const fin = status === 'ENTREGADO' || status === 'CANCELADO';
  const rep = fin ? null : repartidor;
  let t = tienda;
  if (fin || (rep && !RECOGIDA.includes(status))) t = null;
  const cerca = (a, b) => a && b && metros(a, b) < 40;
  if (cerca(t, rep)) t = null;
  const dst = cerca(destino, rep) || cerca(destino, t) ? null : destino;
  const seq = fin ? [] : (rep ? [rep, t, dst] : [t, dst]).filter(Boolean);
  const encuadre = [t, rep, fin ? destino : dst].filter(Boolean);
  return { tienda: t, repartidor: rep, destino: fin ? destino : dst, seq, encuadre, movil: rep ? 0 : -1 };
}

// Etiquetas tipo Uber: la casa lleva el tiempo de llegada (si hay repartidor)
export function etiquetasSeguimiento(puntos, vis, ruta) {
  const min = vis.repartidor ? (puntos.minutos ?? ruta?.min ?? null) : null;
  const nombre = puntos.nombreTienda.length > 22 ? `${puntos.nombreTienda.slice(0, 21)}…` : puntos.nombreTienda;
  return { casa: { texto: 'Tu casa', min }, tienda: { texto: nombre || 'Tienda' } };
}

export const SCRIPT_SEGUIMIENTO = `
var capas = [];
function esc(s){ return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function iconoRep(){ return icono('<div style="width:26px;height:26px;border-radius:13px;background:#001034;border:4px solid #fff;box-sizing:border-box;box-shadow:0 0 0 9px rgba(98,198,222,0.35),0 2px 6px rgba(0,16,52,0.35)"></div>', 26); }
function iconoTiendaS(){ return icono('<div style="width:20px;height:20px;border-radius:5px;background:#62C6DE;border:3px solid #001034;box-sizing:border-box;box-shadow:0 1px 4px rgba(0,16,52,0.3)"></div>', 20); }
function iconoCasa(){ return icono('<div style="width:20px;height:20px;background:#001034;box-sizing:border-box;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,16,52,0.3)"><div style="width:6px;height:6px;background:#fff"></div></div>', 20); }
// Cuadro blanco con sombra sobre el punto; con minutos lleva el bloque marino
function etiqueta(e){
  var min = e.min != null ? '<div style="background:#001034;color:#fff;padding:5px 9px;text-align:center;line-height:1"><div style="font:800 17px sans-serif">'+e.min+'</div><div style="font:700 9px sans-serif;letter-spacing:.5px;margin-top:2px">MIN</div></div>' : '';
  var html = '<div style="position:absolute;left:0;bottom:16px;transform:translateX(-50%);display:flex;align-items:stretch;white-space:nowrap;background:#fff;border-radius:4px;overflow:hidden;box-shadow:0 2px 10px rgba(0,16,52,0.22)">'
    + min + '<div style="display:flex;align-items:center;padding:0 12px;min-height:36px;color:#001034;font:700 15px sans-serif">'+esc(e.texto)+'</div></div>';
  return L.divIcon({ html: html, className: '', iconSize: [0, 0], iconAnchor: [0, 0] });
}
window.update = function (d) {
  capas.forEach(function (c) { map.removeLayer(c); }); capas = [];
  // Ruta por las calles (la traza el backend); sin ella, línea recta. Con
  // borde blanco para que resalte sobre el mapa.
  var seq = d.seq.map(function (p) { return [p.lat, p.lon]; });
  var linea = d.trazo && d.trazo.length > 1 ? d.trazo : seq;
  if (seq.length >= 2) {
    capas.push(L.polyline(linea, { color: '#FFFFFF', weight: 10, lineCap: 'round', lineJoin: 'round' }).addTo(map));
    capas.push(L.polyline(linea, { color: '#001034', weight: 5, lineCap: 'round', lineJoin: 'round' }).addTo(map));
  }
  if (d.tienda) {
    capas.push(L.marker([d.tienda.lat, d.tienda.lon], { icon: iconoTiendaS() }).addTo(map));
    capas.push(L.marker([d.tienda.lat, d.tienda.lon], { icon: etiqueta(d.etiquetas.tienda), interactive: false, zIndexOffset: 500 }).addTo(map));
  }
  if (d.destino) {
    capas.push(L.marker([d.destino.lat, d.destino.lon], { icon: iconoCasa() }).addTo(map));
    capas.push(L.marker([d.destino.lat, d.destino.lon], { icon: etiqueta(d.etiquetas.casa), interactive: false, zIndexOffset: 600 }).addTo(map));
  }
  if (d.repartidor) capas.push(L.marker([d.repartidor.lat, d.repartidor.lon], { icon: iconoRep(), zIndexOffset: 1000 }).addTo(map));
  // Encuadre con la ruta completa y espacio arriba para las etiquetas
  var caja = d.encuadre.map(function (p) { return [p.lat, p.lon]; });
  if (linea.length >= 2) caja = caja.concat(linea);
  if (caja.length >= 2) map.fitBounds(L.latLngBounds(caja), { paddingTopLeft: [70, 110], paddingBottomRight: [70, 50], maxZoom: 17 });
  else if (caja.length === 1) map.setView(caja[0], 16);
};`;
