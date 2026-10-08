// Estilo de mapa del diseño "Agua VIDA": terreno celeste (#DDEFF5), calles
// casi blancas y nombres de calles en gris azulado.
// - Leaflet (Expo Go): OpenStreetMap recoloreado con un filtro SVG continuo
//   por luminancia (texto oscuro → gris azulado, terreno → celeste, calles →
//   casi blanco). Para producción con mucho tráfico conviene un proveedor de
//   teselas propio (la política de tile.openstreetmap.org limita el uso).
// - Google Maps (APK): estilo JSON equivalente.

import { pedirTrazado } from '../services/trazado';

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
// Tramos de la rampa de color según la luminancia del mapa base (en gris)
const RAMPA = [[0, hex('#3A4A62')], [0.55, hex('#6E8299')], [0.8, hex('#C4E2EC')], [0.93, hex('#DDEFF5')], [1, hex('#F7FBFD')]];
function tabla(c) {
  const v = [];
  for (let i = 0; i <= 100; i++) {
    const x = i / 100;
    let k = 0;
    while (k < RAMPA.length - 2 && x > RAMPA[k + 1][0]) k++;
    const [a, ca] = RAMPA[k], [b, cb] = RAMPA[k + 1];
    v.push((ca[c] + (cb[c] - ca[c]) * ((x - a) / (b - a))).toFixed(3));
  }
  return v.join(' ');
}

export const FILTRO_SVG = `<svg width="0" height="0" style="position:absolute"><filter id="vida" color-interpolation-filters="sRGB">`
  + `<feColorMatrix type="saturate" values="0"/><feComponentTransfer>`
  + `<feFuncR type="table" tableValues="${tabla(0)}"/><feFuncG type="table" tableValues="${tabla(1)}"/><feFuncB type="table" tableValues="${tabla(2)}"/>`
  + `</feComponentTransfer></filter></svg>`;

export const CSS_MAPA = 'html,body,#map{margin:0;padding:0;width:100%;height:100%;background:#DDEFF5}'
  + '.leaflet-tile-pane{filter:url(#vida)}.leaflet-div-icon{background:none;border:none}';

// Marcadores (HTML para Leaflet): repartidor = punto marino con borde blanco;
// tienda = cuadro celeste con borde marino; entrega = cuadro marino con borde
// blanco (como las paradas A y B de la app).
export const ICONOS_JS = `
function icono(html, t){ return L.divIcon({ html: html, className: '', iconSize: [t, t], iconAnchor: [t/2, t/2] }); }
function iconoYo(){ return icono('<div style="width:28px;height:28px;border-radius:14px;background:#001034;border:4px solid #fff;box-sizing:border-box;box-shadow:0 0 0 8px rgba(0,16,52,0.12)"></div>', 28); }
function iconoTienda(){ return icono('<div style="width:30px;height:30px;border-radius:10px;background:#62C6DE;border:4px solid #001034;box-sizing:border-box"></div>', 30); }
function iconoEntrega(n){ return icono('<div style="width:30px;height:30px;border-radius:10px;background:#001034;border:3px solid #fff;box-sizing:border-box;color:#fff;font:800 12px sans-serif;display:flex;align-items:center;justify-content:center">'+(n||'')+'</div>', 30); }
function ruta(puntos){ return L.polyline(puntos, { color: '#001034', weight: 5, lineCap: 'round', lineJoin: 'round' }); }
`;

export function htmlLeaflet(centro, script) {
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>${CSS_MAPA}</style>
</head><body>${FILTRO_SVG}<div id="map"></div>
<script>
var map = L.map('map', { zoomControl: false, attributionControl: false, maxZoom: 18 }).setView([${centro.lat}, ${centro.lon}], 14);
L.tileLayer('${TILE_URL}', { maxZoom: 19 }).addTo(map);
${ICONOS_JS}
${script}
</script></body></html>`;
}

// Google Maps (react-native-maps con PROVIDER_GOOGLE)
export const ESTILO_GOOGLE = [
  { elementType: 'geometry', stylers: [{ color: '#DDEFF5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4B5B73' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F2F9FB' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#F4FAFC' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#C4E2EC' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#D6ECF3' }] },
];

// ── Ruta (compartido por la versión nativa y la web) ──
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
export const CENTRO_DEFECTO = { lat: 9.7457, lon: -63.1832 }; // Maturín

// Paradas del backend → [{lat, lon, tipo, num}]
export function buildPuntos(ubicacion, paradas) {
  const yoLat = num(ubicacion?.Latitud);
  const yo = yoLat != null ? { lat: yoLat, lon: num(ubicacion?.Longitud) } : null;
  let n = 0;
  const stops = (paradas || [])
    .filter((p) => num(p.lat) != null && num(p.lon) != null)
    .map((p) => ({ lat: num(p.lat), lon: num(p.lon), tipo: p.tipo, num: p.tipo === 'ENTREGA' ? ++n : null }));
  return { yo, stops };
}

export const SCRIPT_RUTA = `
var capas = [];
window.update = function (d) {
  capas.forEach(function (c) { map.removeLayer(c); }); capas = [];
  // Sin paradas encimadas: se quita la que queda a < 40 m de tu posición o
  // de la parada anterior (misma tienda en dos pedidos, entrega donde estás)
  var ultimo = d.yo ? [d.yo.lat, d.yo.lon] : null, stops = [];
  d.stops.forEach(function (s) {
    if (ultimo && map.distance(ultimo, [s.lat, s.lon]) < 40) return;
    stops.push(s); ultimo = [s.lat, s.lon];
  });
  var seq = [];
  if (d.yo) seq.push([d.yo.lat, d.yo.lon]);
  stops.forEach(function (s) { seq.push([s.lat, s.lon]); });
  if (seq.length >= 2) {
    // Trazado por las calles (lo calcula el backend); sin él, línea recta
    capas.push(ruta(d.trazo && d.trazo.length > 1 ? d.trazo : seq).addTo(map));
  }
  stops.forEach(function (s) {
    capas.push(L.marker([s.lat, s.lon], { icon: s.tipo === 'ENTREGA' ? iconoEntrega(d.numerar ? s.num : '') : iconoTienda() }).addTo(map));
  });
  if (d.yo) capas.push(L.marker([d.yo.lat, d.yo.lon], { icon: iconoYo() }).addTo(map));
  if (seq.length >= 2) map.fitBounds(L.latLngBounds(seq), { paddingTopLeft: [40, 40], paddingBottomRight: [40, d.margenAbajo || 40], maxZoom: 17 });
  else if (seq.length === 1) map.setView(seq[0], 15);
};`;

// Distancia (km) y tiempo (min) de una ruta [{lat, lon}, ...], total y por
// tramo, por las calles (backend); sin respuesta, línea recta × 1,3 a ~20 km/h.
function kmRecto(a, b) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export async function metricasRuta(puntos) {
  const pts = (puntos || []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (pts.length < 2) return null;
  const ruta = await pedirTrazado(pts);
  if (ruta?.tramos?.length === pts.length - 1) return { km: ruta.km, min: ruta.min, tramos: ruta.tramos };
  const tramos = pts.slice(1).map((p, i) => { const km = kmRecto(pts[i], p) * 1.3; return { km, min: Math.max(1, Math.round(km * 3)) }; });
  return { km: tramos.reduce((a, t) => a + t.km, 0), min: tramos.reduce((a, t) => a + t.min, 0), tramos };
}

// ¿La parada está encima del repartidor? (para no dibujar dos marcadores)
export function cercaDe(a, b, metros = 40) {
  if (!a || !b) return false;
  return kmRecto(a, b) * 1000 < metros;
}

// Misma depuración para la versión nativa (Google Maps)
export function depurarParadas(yo, stops, metros = 40) {
  let ultimo = yo || null;
  const r = [];
  for (const s of stops || []) {
    if (ultimo && kmRecto(ultimo, s) * 1000 < metros) continue;
    r.push(s); ultimo = s;
  }
  return r;
}
