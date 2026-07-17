// Mapa de ruta multi-pedido: dibuja al repartidor, las paradas ordenadas
// (sucursales 🏪 y entregas numeradas) y la polilínea de la ruta completa.
// Usa Leaflet + OpenStreetMap en un WebView (sin API key, igual que MapaPedido).
import { useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';

// Google Maps nativo en la APK; Leaflet en Expo Go
const ES_EXPO_GO = Constants.executionEnvironment === 'storeClient';
let Maps = null;
if (!ES_EXPO_GO) {
  try { Maps = require('react-native-maps'); } catch (_) { Maps = null; }
}

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

// Versión nativa con Google Maps
function MapaRutaGoogle({ yo, stops }) {
  const mapRef = useRef(null);
  const MapView = Maps.default;

  const seq = [
    ...(yo ? [{ latitude: yo.lat, longitude: yo.lon }] : []),
    ...stops.map(s => ({ latitude: s.lat, longitude: s.lon })),
  ];

  useEffect(() => {
    if (!mapRef.current || !seq.length) return;
    if (seq.length >= 2) {
      mapRef.current.fitToCoordinates(seq, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    } else {
      mapRef.current.animateToRegion({ ...seq[0], latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500);
    }
  }, [JSON.stringify(seq)]);

  const centro = seq[0] ?? { latitude: 10.4806, longitude: -66.9036 };

  return (
    <MapView
      ref={mapRef}
      provider={Maps.PROVIDER_GOOGLE}
      style={{ flex: 1 }}
      initialRegion={{ ...centro, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
      showsCompass={false}
      toolbarEnabled={false}
    >
      {yo && (
        <Maps.Marker coordinate={{ latitude: yo.lat, longitude: yo.lon }} title="Tú" anchor={{ x: 0.5, y: 0.5 }}>
          <View style={[styles.pinNativo, { backgroundColor: '#4A5568' }]}>
            <Text style={styles.pinNativoEmoji}>🛵</Text>
          </View>
        </Maps.Marker>
      )}
      {stops.map((s, i) => (
        <Maps.Marker
          key={`${s.tipo}-${s.idPedido ?? s.lat}-${i}`}
          coordinate={{ latitude: s.lat, longitude: s.lon }}
          title={s.label}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          {s.tipo === 'PICKUP' ? (
            <View style={[styles.pinNativo, { backgroundColor: '#1A6A9A' }]}>
              <Text style={styles.pinNativoEmoji}>🏪</Text>
            </View>
          ) : (
            <View style={[styles.pinNativo, { backgroundColor: '#27AE60' }]}>
              <Text style={styles.pinNativoNum}>{s.num}</Text>
            </View>
          )}
        </Maps.Marker>
      ))}
      {seq.length >= 2 && (
        <Maps.Polyline coordinates={seq} strokeColor="#1A6A9A" strokeWidth={3} lineDashPattern={[8, 6]} />
      )}
    </MapView>
  );
}

export default function MapaRuta({ ubicacion, paradas }) {
  const webRef = useRef(null);
  const { yo, stops } = useMemo(() => buildPuntos(ubicacion, paradas), [ubicacion, paradas]);

  useEffect(() => {
    if (Maps || !webRef.current) return;
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
      {Maps ? (
        <MapaRutaGoogle yo={yo} stops={stops} />
      ) : (
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
      )}
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
  pinNativo: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pinNativoEmoji: { fontSize: 15 },
  pinNativoNum: { color: '#fff', fontSize: 14, fontWeight: '800' },
  navBtn: {
    position: 'absolute', top: 12, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1A6A9A', paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 22, elevation: 5,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  navBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
