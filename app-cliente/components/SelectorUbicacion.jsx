import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
  ActivityIndicator, Platform, Switch,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

const DEFAULT_LAT = 10.4806;
const DEFAULT_LON = -66.9036;

function buildMapHTML(lat, lon) {
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
html,body,#map{margin:0;padding:0;width:100%;height:100%;}
#pin{position:fixed;left:50%;top:50%;transform:translate(-50%,-100%);
  font-size:40px;line-height:1;pointer-events:none;z-index:9999;
  filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));}
</style>
</head><body>
<div id="map"></div>
<div id="pin">📍</div>
<script>
  var map = L.map('map', { zoomControl: true, attributionControl: false })
    .setView([${lat}, ${lon}], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

  function sendCenter() {
    var c = map.getCenter();
    window.ReactNativeWebView.postMessage(JSON.stringify({ lat: c.lat, lon: c.lng }));
  }
  map.on('moveend', sendCenter);
  sendCenter();

  window.moveTo = function(lat, lon) { map.setView([lat, lon], 16); };
</script>
</body></html>`;
}

export default function SelectorUbicacion({ visible, onClose, onConfirmar, puedeGuardar }) {
  const webRef = useRef(null);
  const [lat, setLat] = useState(DEFAULT_LAT);
  const [lon, setLon] = useState(DEFAULT_LON);
  const [buscandoGPS, setBuscandoGPS] = useState(false);
  const [guardar, setGuardar] = useState(false);
  const [alias, setAlias] = useState('');
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (visible) usarMiUbicacion();
  }, [visible]);

  async function usarMiUbicacion() {
    setBuscandoGPS(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const newLat = loc.coords.latitude;
      const newLon = loc.coords.longitude;
      setLat(newLat);
      setLon(newLon);
      webRef.current?.injectJavaScript(`window.moveTo(${newLat}, ${newLon}); true;`);
    } catch {
      // sin GPS: queda en default
    } finally {
      setBuscandoGPS(false);
    }
  }

  function onMessage(e) {
    try {
      const { lat: newLat, lon: newLon } = JSON.parse(e.nativeEvent.data);
      setLat(newLat);
      setLon(newLon);
    } catch (_) {}
  }

  function confirmar() {
    onConfirmar({
      Latitud: lat,
      Longitud: lon,
      guardar: puedeGuardar && guardar,
      alias: alias.trim(),
    });
    setGuardar(false);
    setAlias('');
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Mapa OpenStreetMap via WebView */}
        <WebView
          ref={webRef}
          style={StyleSheet.absoluteFill}
          source={{ html: buildMapHTML(lat, lon) }}
          onMessage={onMessage}
          onLoad={() => setMapReady(true)}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
        />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={onClose}>
            <Ionicons name="close" size={22} color="#1A202C" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>¿Dónde entregamos?</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Botón mi ubicación */}
        <TouchableOpacity style={styles.gpsBtn} onPress={usarMiUbicacion}>
          {buscandoGPS
            ? <ActivityIndicator size="small" color="#1A6A9A" />
            : <Ionicons name="locate" size={22} color="#1A6A9A" />}
        </TouchableOpacity>

        {/* Panel inferior */}
        <View style={styles.panel}>
          <Text style={styles.panelHint}>
            Mueve el mapa hasta que el pin quede sobre tu puerta
          </Text>
          <Text style={styles.coordsText}>
            📍 {lat.toFixed(5)}, {lon.toFixed(5)}
          </Text>

          {puedeGuardar && (
            <View style={styles.guardarRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.guardarLabel}>Guardar esta dirección</Text>
                {guardar && (
                  <TextInput
                    style={styles.aliasInput}
                    placeholder='Alias (ej. "Casa", "Trabajo")'
                    placeholderTextColor="#A0AEC0"
                    value={alias}
                    onChangeText={setAlias}
                  />
                )}
              </View>
              <Switch
                value={guardar}
                onValueChange={setGuardar}
                trackColor={{ false: '#E2E8F0', true: '#27AE60' }}
                thumbColor="#fff"
              />
            </View>
          )}

          <TouchableOpacity style={styles.confirmBtn} onPress={confirmar}>
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.confirmBtnText}>Confirmar ubicación</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 40,
    left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  headerTitle: {
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 20, fontSize: 14, fontWeight: '800', color: '#1A202C',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 4,
    overflow: 'hidden',
  },
  gpsBtn: {
    position: 'absolute', right: 16, bottom: 230,
    width: 46, height: 46, borderRadius: 23, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 22,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 }, elevation: 12,
  },
  panelHint: { fontSize: 13, color: '#718096', textAlign: 'center', marginBottom: 4 },
  coordsText: { fontSize: 11.5, color: '#A0AEC0', textAlign: 'center', marginBottom: 12, fontVariant: ['tabular-nums'] },
  guardarRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F7FAFC', borderRadius: 14, padding: 12, marginBottom: 14,
  },
  guardarLabel: { fontSize: 14, fontWeight: '700', color: '#1A202C' },
  aliasInput: {
    marginTop: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#1A202C',
  },
  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#27AE60', borderRadius: 14, paddingVertical: 15,
  },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
