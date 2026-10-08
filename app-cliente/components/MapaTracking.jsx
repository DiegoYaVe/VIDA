// Mapa del seguimiento (diseño "Agua VIDA"): tienda = cuadro celeste,
// repartidor = punto marino con halo, tu casa = pin verde; ruta marina por
// las calles (la traza el backend). Google Maps con el estilo VIDA en la APK
// (producción); Leaflet en Expo Go.
import { useRef, useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';
import { htmlLeaflet, ESTILO_GOOGLE, CENTRO_DEFECTO } from './estiloMapa';
import { puntosSeguimiento, depurarSeguimiento, SCRIPT_SEGUIMIENTO } from './seguimientoMapa';
import { useTrazado } from '../services/trazado';

const ES_EXPO_GO = Constants.executionEnvironment === 'storeClient';
let Maps = null;
if (!ES_EXPO_GO) {
  try { Maps = require('react-native-maps'); } catch (_) { Maps = null; }
}
function MapaGoogle({ tienda, repartidor, destino, seq: pts, trazo }) {
  const ref = useRef(null);
  const MapView = Maps.default;
  const seq = pts.map((p) => ({ latitude: p.lat, longitude: p.lon }));
  useEffect(() => {
    if (ref.current && seq.length >= 2) ref.current.fitToCoordinates(seq, { edgePadding: { top: 70, right: 50, bottom: 60, left: 50 }, animated: true });
  }, [JSON.stringify(seq)]);
  // Ruta por las calles; mientras llega, o si no hay, línea recta
  const linea = useMemo(() => (trazo ? trazo.map(([latitude, longitude]) => ({ latitude, longitude })) : null), [trazo]);
  const centro = seq[0] ?? { latitude: CENTRO_DEFECTO.lat, longitude: CENTRO_DEFECTO.lon };
  return (
    <MapView ref={ref} provider={Maps.PROVIDER_GOOGLE} style={{ flex: 1 }} customMapStyle={ESTILO_GOOGLE}
      initialRegion={{ ...centro, latitudeDelta: 0.02, longitudeDelta: 0.02 }} showsCompass={false} toolbarEnabled={false}
      showsPointsOfInterest={false} showsBuildings={false} rotateEnabled={false} pitchEnabled={false}>
      {seq.length >= 2 && <Maps.Polyline coordinates={linea || seq} strokeColor="#001034" strokeWidth={5} lineCap="round" lineJoin="round" />}
      {tienda && <Maps.Marker coordinate={{ latitude: tienda.lat, longitude: tienda.lon }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}><View style={styles.tienda} /></Maps.Marker>}
      {destino && <Maps.Marker coordinate={{ latitude: destino.lat, longitude: destino.lon }} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}><View style={styles.casa} /></Maps.Marker>}
      {repartidor && (
        <Maps.Marker coordinate={{ latitude: repartidor.lat, longitude: repartidor.lon }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={styles.halo}><View style={styles.rep} /></View>
        </Maps.Marker>
      )}
    </MapView>
  );
}

export default function MapaTracking({ estado }) {
  const webRef = useRef(null);
  const puntos = useMemo(() => puntosSeguimiento(estado), [estado?.LatSucursal, estado?.LatRepartidor, estado?.LonRepartidor, estado?.UbicacionEntregaLat]);
  // Sin puntos encimados; lo que se dibuja es lo que se manda a trazar
  const vis = useMemo(() => depurarSeguimiento(puntos), [puntos]);
  const ruta = useTrazado(vis.seq, vis.movil);
  const trazo = ruta?.coords || null;
  const datos = JSON.stringify({ ...puntos, trazo });
  useEffect(() => {
    if (Maps || !webRef.current) return;
    webRef.current.injectJavaScript(`window.update(${datos}); true;`);
  }, [datos]);
  const centro = puntos.repartidor ?? puntos.destino ?? puntos.tienda ?? CENTRO_DEFECTO;
  return (
    <View style={styles.contenedor}>
      {Maps ? <MapaGoogle {...vis} trazo={trazo} /> : (
        <WebView ref={webRef} style={{ flex: 1, backgroundColor: '#DDEFF5' }} source={{ html: htmlLeaflet(centro, SCRIPT_SEGUIMIENTO) }}
          javaScriptEnabled domStorageEnabled originWhitelist={['*']} scrollEnabled={false}
          onLoadEnd={() => webRef.current?.injectJavaScript(`window.update(${datos}); true;`)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: '#DDEFF5' },
  tienda: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#62C6DE', borderWidth: 4, borderColor: '#001034' },
  halo: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,16,52,0.15)', alignItems: 'center', justifyContent: 'center' },
  rep: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#001034', borderWidth: 5, borderColor: '#FFFFFF' },
  casa: { width: 36, height: 36, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 4, transform: [{ rotate: '-45deg' }], backgroundColor: '#4DAD66', borderWidth: 4, borderColor: '#FFFFFF' },
});
