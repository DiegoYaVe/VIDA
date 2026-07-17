// Mapa de seguimiento del pedido (repartidor en vivo + destino).
// En la APK usa Google Maps nativo (react-native-maps, PROVIDER_GOOGLE);
// en Expo Go cae a Leaflet + OpenStreetMap en WebView (react-native-maps
// requiere build nativo con la API key de app.json).
import { useRef, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';

const ES_EXPO_GO = Constants.executionEnvironment === 'storeClient';
let Maps = null;
if (!ES_EXPO_GO) {
  try { Maps = require('react-native-maps'); } catch (_) { Maps = null; }
}

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

// ── Versión nativa: Google Maps ──────────────────────────────────────────
function Pin({ color, children }) {
  return (
    <View style={[styles.pin, { backgroundColor: color }]}>
      <Text style={styles.pinEmoji}>{children}</Text>
    </View>
  );
}

function MapaGoogle({ repartidor, destino, enCamino }) {
  const mapRef = useRef(null);
  const MapView = Maps.default;

  const coords = [];
  if (repartidor) coords.push({ latitude: repartidor.lat, longitude: repartidor.lon });
  if (destino)    coords.push({ latitude: destino.lat,    longitude: destino.lon });

  useEffect(() => {
    if (!mapRef.current || !coords.length) return;
    if (coords.length >= 2) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    } else {
      mapRef.current.animateToRegion({
        ...coords[0], latitudeDelta: 0.01, longitudeDelta: 0.01,
      }, 500);
    }
  }, [repartidor?.lat, repartidor?.lon, destino?.lat, destino?.lon]);

  const centro = coords[0] ?? { latitude: 10.4806, longitude: -66.9036 };

  return (
    <MapView
      ref={mapRef}
      provider={Maps.PROVIDER_GOOGLE}
      style={{ flex: 1 }}
      initialRegion={{ ...centro, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
      showsCompass={false}
      toolbarEnabled={false}
    >
      {repartidor && (
        <Maps.Marker
          coordinate={{ latitude: repartidor.lat, longitude: repartidor.lon }}
          title="Repartidor"
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <Pin color="#1A6A9A">🛵</Pin>
        </Maps.Marker>
      )}
      {destino && (
        <Maps.Marker
          coordinate={{ latitude: destino.lat, longitude: destino.lon }}
          title="Tu dirección"
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <Pin color="#27AE60">🏠</Pin>
        </Maps.Marker>
      )}
      {repartidor && destino && (
        <Maps.Polyline
          coordinates={coords}
          strokeColor={enCamino ? '#27AE60' : '#A0AEC0'}
          strokeWidth={3}
          lineDashPattern={[8, 6]}
        />
      )}
    </MapView>
  );
}

// ── Versión Expo Go: Leaflet en WebView ──────────────────────────────────
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

function MapaLeaflet({ repartidor, destino, enCamino }) {
  const webRef = useRef(null);

  useEffect(() => {
    if (!webRef.current) return;
    const r = repartidor ? JSON.stringify(repartidor) : 'null';
    const d = destino    ? JSON.stringify(destino)    : 'null';
    const c = `'${enCamino ? '#27AE60' : '#A0AEC0'}'`;
    webRef.current.injectJavaScript(`window.updatePositions(${r},${d},${c}); true;`);
  }, [repartidor?.lat, repartidor?.lon, destino?.lat, destino?.lon, enCamino]);

  return (
    <WebView
      ref={webRef}
      style={{ flex: 1 }}
      source={{ html: buildHTML(repartidor, destino, enCamino) }}
      javaScriptEnabled
      domStorageEnabled
      originWhitelist={['*']}
      scrollEnabled={false}
    />
  );
}

// ── Componente público ───────────────────────────────────────────────────
export default function MapaTracking({ estado, enCamino }) {
  const rLat = num(estado?.LatRepartidor);
  const rLon = num(estado?.LonRepartidor);
  const dLat = num(estado?.UbicacionEntregaLat);
  const dLon = num(estado?.UbicacionEntregaLon);

  const repartidor = rLat != null ? { lat: rLat, lon: rLon } : null;
  const destino    = dLat != null ? { lat: dLat, lon: dLon } : null;

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
      {Maps
        ? <MapaGoogle  repartidor={repartidor} destino={destino} enCamino={enCamino} />
        : <MapaLeaflet repartidor={repartidor} destino={destino} enCamino={enCamino} />}
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
  pin: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pinEmoji: { fontSize: 16 },
});
