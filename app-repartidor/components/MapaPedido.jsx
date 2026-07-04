import { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

function buildHTML(yo, sucursal, destino, enCamino) {
  const pts = [];
  if (yo)       pts.push({ lat: yo.lat,       lon: yo.lon,       color: '#4A5568', icon: '🛵', label: 'Tú' });
  if (sucursal) pts.push({ lat: sucursal.lat,  lon: sucursal.lon, color: '#1A6A9A', icon: '🏪', label: 'Sucursal' });
  if (destino)  pts.push({ lat: destino.lat,   lon: destino.lon,  color: '#27AE60', icon: '🏠', label: 'Entrega' });

  const center = pts[0] ?? { lat: 10.4806, lon: -66.9036 };
  const objetivo = enCamino ? destino : (sucursal || destino);
  const lineColor = enCamino ? '#27AE60' : '#1A6A9A';

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%;}</style>
</head><body><div id="map"></div>
<script>
var map=L.map('map',{zoomControl:false,attributionControl:false}).setView([${center.lat},${center.lon}],15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
var markers=[], lines=[];
var pts=${JSON.stringify(pts)};
var yo=${yo ? JSON.stringify(yo) : 'null'};
var obj=${objetivo ? JSON.stringify(objetivo) : 'null'};
var suc=${sucursal ? JSON.stringify(sucursal) : 'null'};
var dst=${destino ? JSON.stringify(destino) : 'null'};

function mkIcon(color,icon){
  return L.divIcon({html:'<div style="background:'+color+';width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)">'+icon+'</div>',className:'',iconAnchor:[16,16]});
}
pts.forEach(function(p){ markers.push(L.marker([p.lat,p.lon],{icon:mkIcon(p.color,p.icon)}).bindPopup(p.label).addTo(map)); });
if(yo&&obj) lines.push(L.polyline([[yo.lat,yo.lon],[obj.lat,obj.lon]],{color:'${lineColor}',weight:3,dashArray:'8,6'}).addTo(map));
if(suc&&dst) lines.push(L.polyline([[suc.lat,suc.lon],[dst.lat,dst.lon]],{color:'#A0AEC0',weight:2,dashArray:'4,6'}).addTo(map));

if(markers.length>=2){ var g=L.featureGroup(markers); map.fitBounds(g.getBounds().pad(0.3)); }

window.update=function(data){
  markers.forEach(function(m){map.removeLayer(m);}); markers=[];
  lines.forEach(function(l){map.removeLayer(l);}); lines=[];
  yo=data.yo; obj=data.obj; suc=data.suc; dst=data.dst;
  data.pts.forEach(function(p){ markers.push(L.marker([p.lat,p.lon],{icon:mkIcon(p.color,p.icon)}).addTo(map)); });
  if(yo&&obj) lines.push(L.polyline([[yo.lat,yo.lon],[obj.lat,obj.lon]],{color:data.lineColor,weight:3,dashArray:'8,6'}).addTo(map));
  if(suc&&dst) lines.push(L.polyline([[suc.lat,suc.lon],[dst.lat,dst.lon]],{color:'#A0AEC0',weight:2,dashArray:'4,6'}).addTo(map));
  if(markers.length>=2){ var g=L.featureGroup(markers); map.fitBounds(g.getBounds().pad(0.3)); }
  else if(markers.length===1){ map.setView([markers[0].getLatLng().lat,markers[0].getLatLng().lng],16); }
};
</script></body></html>`;
}

export default function MapaPedido({ ubicacion, pedido }) {
  const webRef = useRef(null);

  const yoLat = num(ubicacion?.Latitud);
  const yoLon = num(ubicacion?.Longitud);
  const sLat  = num(pedido?.LatSucursal);
  const sLon  = num(pedido?.LonSucursal);
  const dLat  = num(pedido?.UbicacionEntregaLat);
  const dLon  = num(pedido?.UbicacionEntregaLon);

  const yo       = yoLat != null ? { lat: yoLat, lon: yoLon } : null;
  const sucursal = sLat  != null ? { lat: sLat,  lon: sLon  } : null;
  const destino  = dLat  != null ? { lat: dLat,  lon: dLon  } : null;
  const enCamino = pedido?.Status === 'EN_CAMINO';
  const objetivo = enCamino ? destino : (sucursal || destino);

  useEffect(() => {
    if (!webRef.current) return;
    const pts = [];
    if (yo)       pts.push({ lat: yo.lat,       lon: yo.lon,       color: '#4A5568', icon: '🛵' });
    if (sucursal) pts.push({ lat: sucursal.lat,  lon: sucursal.lon, color: '#1A6A9A', icon: '🏪' });
    if (destino)  pts.push({ lat: destino.lat,   lon: destino.lon,  color: '#27AE60', icon: '🏠' });
    const data = JSON.stringify({ pts, yo, obj: objetivo, suc: sucursal, dst: destino, lineColor: enCamino ? '#27AE60' : '#1A6A9A' });
    webRef.current.injectJavaScript(`window.update(${data}); true;`);
  }, [yoLat, yoLon, sLat, dLat, enCamino]);

  if (!yo && !sucursal && !destino) {
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
        source={{ html: buildHTML(yo, sucursal, destino, enCamino) }}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        scrollEnabled={false}
      />
      {objetivo && pedido && (
        <TouchableOpacity style={styles.navBtn} onPress={() => {
          const url = `https://www.google.com/maps/dir/?api=1&destination=${objetivo.lat},${objetivo.lon}&travelmode=driving`;
          Linking.openURL(url).catch(() => {});
        }}>
          <Ionicons name="navigate" size={18} color="#fff" />
          <Text style={styles.navBtnText}>{enCamino ? 'Ir a la entrega' : 'Ir a la sucursal'}</Text>
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
