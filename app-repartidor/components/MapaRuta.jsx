// Mapa de ruta multi-pedido: dibuja al repartidor, las paradas ordenadas
// (sucursales 🏪 y entregas numeradas) y la polilínea de la ruta completa.
// Usa Leaflet + OpenStreetMap en un WebView (sin API key, igual que MapaPedido).
import { useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

// Normaliza paradas del backend → [{lat, lon, tipo, num, label}]
function buildPuntos(ubicacion, paradas) {
  const yoLat = num(ubicacion?.Latitud);
  const yoLon = num(ubicacion?.Longitud);
  const yo = yoLat != null ? { lat: yoLat, lon: yoLon } : null;

  let numEntrega = 0;
  const stops = (paradas || [])
    .filter((p) => num(p.lat) != null && num(p.lon) != null)
    .map((p) => {
      if (p.tipo === 'ENTREGA') numEntrega += 1;
      return {
        lat: num(p.lat), lon: num(p.lon), tipo: p.tipo,
        num: p.tipo === 'ENTREGA' ? numEntrega : null,
        label: p.tipo === 'PICKUP'
          ? `Recoger: ${p.NombreSucursal || 'sucursal'}`
          : `Entrega #${numEntrega} · Pedido ${p.idPedido}`,
      };
    });
  return { yo, stops };
}

function buildHTML(yo, stops) {
  const center = yo ?? stops[0] ?? { lat: 10.4806, lon: -66.9036 };
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%;}</style>
</head><body><div id="map"></div>
<script>
var map=L.map('map',{zoomControl:false,attributionControl:false}).setView([${center.lat},${center.lon}],14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
var capas=[];

function mkIcon(html){
  return L.divIcon({html:html,className:'',iconAnchor:[16,16]});
}
function iconYo(){
  return mkIcon('<div style="background:#4A5568;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)">🛵</div>');
}
function iconStop(s){
  if(s.tipo==='PICKUP')
    return mkIcon('<div style="background:#1A6A9A;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)">🏪</div>');
  return mkIcon('<div style="background:#27AE60;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)">'+s.num+'</div>');
}

window.update=function(data){
  capas.forEach(function(c){map.removeLayer(c);}); capas=[];
  var seq=[];
  if(data.yo){ capas.push(L.marker([data.yo.lat,data.yo.lon],{icon:iconYo()}).addTo(map)); seq.push([data.yo.lat,data.yo.lon]); }
  data.stops.forEach(function(s){
    capas.push(L.marker([s.lat,s.lon],{icon:iconStop(s)}).bindPopup(s.label).addTo(map));
    seq.push([s.lat,s.lon]);
  });
  if(seq.length>=2) capas.push(L.polyline(seq,{color:'#1A6A9A',weight:3,dashArray:'8,6'}).addTo(map));
  if(seq.length>=2){ map.fitBounds(L.latLngBounds(seq).pad(0.25)); }
  else if(seq.length===1){ map.setView(seq[0],15); }
};
window.update(${JSON.stringify({ yo, stops: [] })});
</script></body></html>`;
}

export default function MapaRuta({ ubicacion, paradas }) {
  const webRef = useRef(null);
  const { yo, stops } = useMemo(() => buildPuntos(ubicacion, paradas), [ubicacion, paradas]);

  useEffect(() => {
    if (!webRef.current) return;
    webRef.current.injectJavaScript(`window.update(${JSON.stringify({ yo, stops })}); true;`);
  }, [yo?.lat, yo?.lon, JSON.stringify(stops)]);

  // Navegar en Google Maps hacia la siguiente parada
  const siguiente = stops[0];

  if (!yo && !stops.length) {
    return (
      <View style={styles.placeholder}>
        <Ionicons name="map-outline" size={48} color="#CBD5E0" />
        <Text style={styles.placeholderText}>Esperando ubicación GPS...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        style={{ flex: 1 }}
        source={{ html: buildHTML(yo, stops) }}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        scrollEnabled={false}
        onLoadEnd={() => {
          webRef.current?.injectJavaScript(`window.update(${JSON.stringify({ yo, stops })}); true;`);
        }}
      />
      {siguiente && (
        <TouchableOpacity style={styles.navBtn} onPress={() => {
          const url = `https://www.google.com/maps/dir/?api=1&destination=${siguiente.lat},${siguiente.lon}&travelmode=driving`;
          Linking.openURL(url).catch(() => {});
        }}>
          <Ionicons name="navigate" size={18} color="#fff" />
          <Text style={styles.navBtnText}>
            {siguiente.tipo === 'PICKUP' ? 'Ir a la sucursal' : `Ir a entrega #${siguiente.num}`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EDF2F7' },
  placeholderText: { color: '#A0AEC0', marginTop: 8, fontSize: 13 },
  navBtn: {
    position: 'absolute', top: 12, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1A6A9A', paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 22, elevation: 5,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  navBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
