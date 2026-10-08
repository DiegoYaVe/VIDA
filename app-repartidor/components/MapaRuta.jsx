// Mapa de ruta con el estilo del diseño "Agua VIDA": terreno celeste, calles
// claras, ruta marina, repartidor = punto marino, tienda = cuadro celeste y
// entrega = cuadro marino numerado. Google Maps con el estilo VIDA en la APK
// (producción); Leaflet en Expo Go. La ruta por calles la traza el backend.
import { useRef, useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';
import { htmlLeaflet, ESTILO_GOOGLE, buildPuntos, SCRIPT_RUTA as SCRIPT, CENTRO_DEFECTO, depurarParadas } from './estiloMapa';
import { useTrazado } from '../services/trazado';

const ES_EXPO_GO = Constants.executionEnvironment === 'storeClient';
let Maps = null;
if (!ES_EXPO_GO) {
  try { Maps = require('react-native-maps'); } catch (_) { Maps = null; }
}

function MapaGoogle({ yo, stops, margenAbajo, interactivo, trazo }) {
  const mapRef = useRef(null);
  const MapView = Maps.default;
  const seq = [
    ...(yo ? [{ latitude: yo.lat, longitude: yo.lon }] : []),
    ...stops.map((s) => ({ latitude: s.lat, longitude: s.lon })),
  ];
  useEffect(() => {
    if (!mapRef.current || !seq.length) return;
    if (seq.length >= 2) mapRef.current.fitToCoordinates(seq, { edgePadding: { top: 40, right: 40, bottom: margenAbajo || 40, left: 40 }, animated: true });
    else mapRef.current.animateToRegion({ ...seq[0], latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400);
  }, [JSON.stringify(seq), margenAbajo]);
  // Ruta por las calles; mientras llega, o si no hay, línea recta
  const linea = useMemo(() => (trazo ? trazo.map(([latitude, longitude]) => ({ latitude, longitude })) : null), [trazo]);
  const centro = seq[0] ?? { latitude: CENTRO_DEFECTO.lat, longitude: CENTRO_DEFECTO.lon };
  return (
    <MapView ref={mapRef} provider={Maps.PROVIDER_GOOGLE} style={{ flex: 1 }} customMapStyle={ESTILO_GOOGLE}
      initialRegion={{ ...centro, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
      showsCompass={false} toolbarEnabled={false} showsPointsOfInterest={false} showsBuildings={false}
      scrollEnabled={interactivo} zoomEnabled={interactivo} rotateEnabled={false} pitchEnabled={false}>
      {seq.length >= 2 && <Maps.Polyline coordinates={linea || seq} strokeColor="#001034" strokeWidth={5} lineCap="round" lineJoin="round" />}
      {stops.map((s, i) => (
        <Maps.Marker key={`${s.tipo}-${i}`} coordinate={{ latitude: s.lat, longitude: s.lon }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={s.tipo === 'ENTREGA' ? styles.entrega : styles.tienda} />
        </Maps.Marker>
      ))}
      {yo && (
        <Maps.Marker coordinate={{ latitude: yo.lat, longitude: yo.lon }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={styles.halo}><View style={styles.yo} /></View>
        </Maps.Marker>
      )}
    </MapView>
  );
}

// paradas: [{ tipo: 'PICKUP'|'ENTREGA', lat, lon }]; margenAbajo deja libre
// la parte tapada por una hoja (p. ej. la oferta de pedido nuevo).
export default function MapaRuta({ ubicacion, paradas, numerar = true, margenAbajo = 40, interactivo = true }) {
  const webRef = useRef(null);
  const { yo, stops } = useMemo(() => buildPuntos(ubicacion, paradas), [ubicacion, paradas]);
  // Lo que se dibuja (sin paradas encimadas) es lo que se manda a trazar
  const visibles = useMemo(() => depurarParadas(yo, stops), [yo, stops]);
  const ruta = useTrazado([yo, ...visibles], yo ? 0 : -1);
  const trazo = ruta?.coords || null;
  const datos = JSON.stringify({ yo, stops, numerar: numerar && stops.filter((s) => s.tipo === 'ENTREGA').length > 1, margenAbajo, trazo });

  useEffect(() => {
    if (Maps || !webRef.current) return;
    webRef.current.injectJavaScript(`window.update(${datos}); true;`);
  }, [datos]);

  const centro = yo ?? stops[0] ?? CENTRO_DEFECTO;
  return (
    <View style={styles.contenedor} pointerEvents={interactivo ? 'auto' : 'none'}>
      {Maps ? (
        <MapaGoogle yo={yo} stops={visibles} margenAbajo={margenAbajo} interactivo={interactivo} trazo={trazo} />
      ) : (
        <WebView
          ref={webRef}
          style={{ flex: 1, backgroundColor: '#DDEFF5' }}
          source={{ html: htmlLeaflet(centro, SCRIPT) }}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
          scrollEnabled={false}
          nestedScrollEnabled
          onLoadEnd={() => webRef.current?.injectJavaScript(`window.update(${datos}); true;`)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: '#DDEFF5' },
  halo: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,16,52,0.12)', alignItems: 'center', justifyContent: 'center' },
  yo: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#001034', borderWidth: 4, borderColor: '#FFFFFF' },
  tienda: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#62C6DE', borderWidth: 4, borderColor: '#001034' },
  entrega: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#001034', borderWidth: 3, borderColor: '#FFFFFF' },
});
