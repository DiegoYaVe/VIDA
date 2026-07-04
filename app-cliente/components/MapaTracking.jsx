import { useRef, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

function buildHTML(repartidor, destino, enCamino) {
  const points = [];
  if (repartidor) points.push({ lat: repartidor.lat, lon: repartidor.lon, color: '#1A6A9A', icon: '🛵', label: 'Repartidor' });
  if (destino)    points.push({ lat: destino.lat,    lon: destino.lon,    color: '#27AE60', icon: '🏠', label: 'Destino' });

  const centerLat = points[0]?.lat ?? 10.4806;
  const centerLon = points[0]?.lon ?? -66.9036;
  const lineColor = enCamino ? '#27AE60' : '#A0AEC0';

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%;}</style>
</head><body>
<div id="map"></div>
<script>
var map = L.map('map',{zoomControl:false,attributionControl:false}).setView([${centerLat},${centerLon}],15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

var markers = [];
var polyline = null;
var pts = ${JSON.stringify(points)};

pts.forEach(function(p){
  var icon = L.divIcon({
    html: '<div style="background:'+p.color+';width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)">'+p.icon+'</div>',
    className:'', iconAnchor:[16,16]
  });
  markers.push(L.marker([p.lat,p.lon],{icon:icon}).bindPopup(p.label).addTo(map));
});

if(pts.length>=2){
  polyline = L.polyline([[pts[0].lat,pts[0].lon],[pts[1].lat,pts[1].lon]],
    {color:'${lineColor}',weight:3,dashArray:'8,6'}).addTo(map);
  var group = L.featureGroup(markers);
  map.fitBounds(group.getBounds().pad(0.3));
} else if(pts.length===1){
  map.setView([pts[0].lat,pts[0].lon],16);
}

window.updatePositions = function(rep, dst, lineClr) {
  markers.forEach(function(m){ map.removeLayer(m); });
  markers = [];
  if(polyline){ map.removeLayer(polyline); polyline=null; }
  var newPts = [];
  if(rep) newPts.push({lat:rep.lat,lon:rep.lon,color:'#1A6A9A',icon:'🛵'});
  if(dst) newPts.push({lat:dst.lat,lon:dst.lon,color:'#27AE60',icon:'🏠'});
  newPts.forEach(function(p){
    var icon = L.divIcon({
      html:'<div style="background:'+p.color+';width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)">'+p.icon+'</div>',
      className:'',iconAnchor:[16,16]
    });
    markers.push(L.marker([p.lat,p.lon],{icon:icon}).addTo(map));
  });
  if(newPts.length>=2){
    polyline=L.polyline([[newPts[0].lat,newPts[0].lon],[newPts[1].lat,newPts[1].lon]],
      {color:lineClr,weight:3,dashArray:'8,6'}).addTo(map);
    var g=L.featureGroup(markers); map.fitBounds(g.getBounds().pad(0.3));
  } else if(newPts.length===1){ map.setView([newPts[0].lat,newPts[0].lon],16); }
};
</script></body></html>`;
}

export default function MapaTracking({ estado, enCamino }) {
  const webRef = useRef(null);

  const rLat = num(estado?.LatRepartidor);
  const rLon = num(estado?.LonRepartidor);
  const dLat = num(estado?.UbicacionEntregaLat);
  const dLon = num(estado?.UbicacionEntregaLon);

  const repartidor = rLat != null ? { lat: rLat, lon: rLon } : null;
  const destino    = dLat != null ? { lat: dLat, lon: dLon } : null;

  // Actualizar marcadores cuando cambia la posición del repartidor
  useEffect(() => {
    if (!webRef.current) return;
    const r = repartidor ? JSON.stringify(repartidor) : 'null';
    const d = destino    ? JSON.stringify(destino)    : 'null';
    const c = `'${enCamino ? '#27AE60' : '#A0AEC0'}'`;
    webRef.current.injectJavaScript(`window.updatePositions(${r},${d},${c}); true;`);
  }, [rLat, rLon, dLat, dLon, enCamino]);

  if (!repartidor && !destino) {
    return (
      <View style={styles.placeholder}>
        <Ionicons name="map-outline" size={40} color="#CBD5E0" />
        <Text style={styles.placeholderText}>
          El mapa se activará cuando el repartidor comparta su ubicación
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        style={{ flex: 1 }}
        source={{ html: buildHTML(repartidor, destino, enCamino) }}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  placeholder: {
    height: 140,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#EDF2F7',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  placeholderText: { color: '#A0AEC0', fontSize: 12, marginTop: 6, textAlign: 'center' },
});
