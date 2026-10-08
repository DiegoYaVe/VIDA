// Puntos y script Leaflet del mapa de seguimiento (nativo y web)
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

// Puntos del pedido: tienda, repartidor (si ya tiene) y destino
export function puntosSeguimiento(estado) {
  const p = (lat, lon) => (num(lat) != null && num(lon) != null ? { lat: num(lat), lon: num(lon) } : null);
  return {
    tienda: p(estado?.LatSucursal, estado?.LonSucursal),
    repartidor: p(estado?.LatRepartidor, estado?.LonRepartidor),
    destino: p(estado?.UbicacionEntregaLat, estado?.UbicacionEntregaLon),
  };
}

// Lo que se dibuja: un punto a < 40 m del repartidor (o la casa a < 40 m de
// la tienda) se omite. Igual que el script, para pedir el mismo trazado.
function metros(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
export function depurarSeguimiento({ tienda, repartidor, destino }) {
  const cerca = (a, b) => a && b && metros(a, b) < 40;
  const t = cerca(tienda, repartidor) ? null : tienda;
  const dst = cerca(destino, repartidor) || cerca(destino, t) ? null : destino;
  const seq = [t, repartidor, dst].filter(Boolean);
  return { tienda: t, repartidor, destino: dst, seq, movil: repartidor ? seq.indexOf(repartidor) : -1 };
}

export const SCRIPT_SEGUIMIENTO = `
var capas = [];
function iconoRep(){ return icono('<div style="width:44px;height:44px;border-radius:22px;background:#001034;border:5px solid #fff;box-sizing:border-box;box-shadow:0 0 0 10px rgba(0,16,52,0.15)"></div>', 44); }
function iconoCasa(){ return L.divIcon({ className: '', iconSize: [36, 36], iconAnchor: [18, 36], html: '<div style="width:36px;height:36px;border-radius:18px 18px 18px 4px;transform:rotate(-45deg);background:#4DAD66;border:4px solid #fff;box-sizing:border-box"></div>' }); }
window.update = function (d) {
  capas.forEach(function (c) { map.removeLayer(c); }); capas = [];
  // Un punto a < 40 m del repartidor no se dibuja (queda solo el repartidor)
  function cerca(a, b) { return a && b && map.distance([a.lat, a.lon], [b.lat, b.lon]) < 40; }
  if (cerca(d.tienda, d.repartidor)) d.tienda = null;
  if (cerca(d.destino, d.repartidor) || cerca(d.destino, d.tienda)) d.destino = null;
  var seq = [d.tienda, d.repartidor, d.destino].filter(Boolean).map(function (p) { return [p.lat, p.lon]; });
  // Trazado por las calles (lo calcula el backend); sin él, línea recta
  if (seq.length >= 2) capas.push(ruta(d.trazo && d.trazo.length > 1 ? d.trazo : seq).addTo(map));
  if (d.tienda) capas.push(L.marker([d.tienda.lat, d.tienda.lon], { icon: iconoTienda() }).addTo(map));
  if (d.destino) capas.push(L.marker([d.destino.lat, d.destino.lon], { icon: iconoCasa() }).addTo(map));
  if (d.repartidor) capas.push(L.marker([d.repartidor.lat, d.repartidor.lon], { icon: iconoRep() }).addTo(map));
  if (seq.length >= 2) map.fitBounds(L.latLngBounds(seq), { paddingTopLeft: [50, 70], paddingBottomRight: [50, 60], maxZoom: 17 });
  else if (seq.length === 1) map.setView(seq[0], 15);
};`;

