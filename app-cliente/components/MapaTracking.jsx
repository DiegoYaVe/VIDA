// Mapa del seguimiento (diseño "Agua VIDA", al estilo de Uber): ruta marina
// con borde blanco por las calles (la traza el backend), tienda = cuadro
// celeste, tu casa = cuadro marino, repartidor = punto marino con halo, y
// etiquetas blancas ("12 MIN | Tu casa"). Google Maps con el estilo VIDA en la
// APK (producción); Leaflet en Expo Go.
import { useRef, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';
import { htmlLeaflet, ESTILO_GOOGLE, CENTRO_DEFECTO } from './estiloMapa';
import { puntosSeguimiento, depurarSeguimiento, etiquetasSeguimiento, SCRIPT_SEGUIMIENTO } from './seguimientoMapa';
import { useTrazado } from '../services/trazado';

const ES_EXPO_GO = Constants.executionEnvironment === 'storeClient';
// Google solo si el build trae la llave de Android (app.config.js); si no, Leaflet
const MAPAS_GOOGLE = !ES_EXPO_GO && !!Constants.expoConfig?.extra?.mapasGoogle;
let Maps = null;
if (MAPAS_GOOGLE) {
  try { Maps = require('react-native-maps'); } catch (_) { Maps = null; }
}

function Etiqueta({ texto, min }) {
  return (
    <View style={styles.etiqueta}>
      {min != null && (
        <View style={styles.etqMin}><Text style={styles.etqNum}>{min}</Text><Text style={styles.etqUnidad}>MIN</Text></View>
      )}
      <Text style={styles.etqTexto} numberOfLines={1}>{texto}</Text>
    </View>
  );
}

function MapaGoogle({ tienda, repartidor, destino, seq: pts, encuadre, trazo, etiquetas }) {
  const ref = useRef(null);
  const MapView = Maps.default;
  const ll = (p) => ({ latitude: p.lat, longitude: p.lon });
  const seq = pts.map(ll);
  // Ruta por las calles; mientras llega, o si no hay, línea recta
  const linea = useMemo(() => (trazo ? trazo.map(([latitude, longitude]) => ({ latitude, longitude })) : null), [trazo]);
  const caja = [...encuadre.map(ll), ...(linea || [])];
  useEffect(() => {
    if (ref.current && caja.length >= 2) ref.current.fitToCoordinates(caja, { edgePadding: { top: 120, right: 70, bottom: 50, left: 70 }, animated: true });
  }, [JSON.stringify(encuadre), linea]);
  // Las etiquetas llevan texto: se redibujan un momento cuando cambian
  const claveEtq = JSON.stringify(etiquetas);
  const [redibujar, setRedibujar] = useState(true);
  useEffect(() => { setRedibujar(true); const t = setTimeout(() => setRedibujar(false), 800); return () => clearTimeout(t); }, [claveEtq]);
  const centro = caja[0] ?? { latitude: CENTRO_DEFECTO.lat, longitude: CENTRO_DEFECTO.lon };
  return (
    <MapView ref={ref} provider={Maps.PROVIDER_GOOGLE} style={{ flex: 1 }} customMapStyle={ESTILO_GOOGLE}
      initialRegion={{ ...centro, latitudeDelta: 0.02, longitudeDelta: 0.02 }} showsCompass={false} toolbarEnabled={false}
      showsPointsOfInterest={false} showsBuildings={false} rotateEnabled={false} pitchEnabled={false}>
      {seq.length >= 2 && <Maps.Polyline coordinates={linea || seq} strokeColor="#FFFFFF" strokeWidth={10} lineCap="round" lineJoin="round" zIndex={1} />}
      {seq.length >= 2 && <Maps.Polyline coordinates={linea || seq} strokeColor="#001034" strokeWidth={5} lineCap="round" lineJoin="round" zIndex={2} />}
      {tienda && <Maps.Marker coordinate={ll(tienda)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}><View style={styles.tienda} /></Maps.Marker>}
      {tienda && (
        <Maps.Marker coordinate={ll(tienda)} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={redibujar} zIndex={5}>
          <View style={styles.etqCaja}><Etiqueta {...etiquetas.tienda} /></View>
        </Maps.Marker>
      )}
      {destino && <Maps.Marker coordinate={ll(destino)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}><View style={styles.casa}><View style={styles.casaCentro} /></View></Maps.Marker>}
      {destino && (
        <Maps.Marker coordinate={ll(destino)} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={redibujar} zIndex={6}>
          <View style={styles.etqCaja}><Etiqueta {...etiquetas.casa} /></View>
        </Maps.Marker>
      )}
      {repartidor && (
        <Maps.Marker coordinate={ll(repartidor)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={10}>
          <View style={styles.halo}><View style={styles.rep} /></View>
        </Maps.Marker>
      )}
    </MapView>
  );
}

export default function MapaTracking({ estado }) {
  const webRef = useRef(null);
  const puntos = useMemo(() => puntosSeguimiento(estado), [estado?.LatSucursal, estado?.LatRepartidor, estado?.LonRepartidor,
    estado?.UbicacionEntregaLat, estado?.Status, estado?.MinutosRestantes, estado?.NombreSucursal]);
  // Lo que se dibuja según la fase del pedido; es lo que se manda a trazar
  const vis = useMemo(() => depurarSeguimiento(puntos), [puntos]);
  const ruta = useTrazado(vis.seq, vis.movil);
  const trazo = ruta?.coords || null;
  const etiquetas = etiquetasSeguimiento(puntos, vis, ruta);
  const datos = JSON.stringify({ ...vis, trazo, etiquetas });
  useEffect(() => {
    if (Maps || !webRef.current) return;
    webRef.current.injectJavaScript(`window.update(${datos}); true;`);
  }, [datos]);
  const centro = vis.encuadre[0] ?? CENTRO_DEFECTO;
  return (
    <View style={styles.contenedor}>
      {Maps ? <MapaGoogle {...vis} trazo={trazo} etiquetas={etiquetas} /> : (
        <WebView ref={webRef} style={{ flex: 1, backgroundColor: '#E6F3F7' }} source={{ html: htmlLeaflet(centro, SCRIPT_SEGUIMIENTO) }}
          javaScriptEnabled domStorageEnabled originWhitelist={['*']} scrollEnabled={false}
          onLoadEnd={() => webRef.current?.injectJavaScript(`window.update(${datos}); true;`)} />
      )}
    </View>
  );
}

const sombra = { shadowColor: '#001034', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 };
const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: '#E6F3F7' },
  tienda: { width: 20, height: 20, borderRadius: 5, backgroundColor: '#62C6DE', borderWidth: 3, borderColor: '#001034' },
  casa: { width: 20, height: 20, backgroundColor: '#001034', alignItems: 'center', justifyContent: 'center' },
  casaCentro: { width: 6, height: 6, backgroundColor: '#FFFFFF' },
  halo: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(98,198,222,0.35)', alignItems: 'center', justifyContent: 'center' },
  rep: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#001034', borderWidth: 4, borderColor: '#FFFFFF' },
  // Espacio para la sombra y para quedar encima del cuadro del punto
  etqCaja: { paddingHorizontal: 6, paddingTop: 4, paddingBottom: 18 },
  etiqueta: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: '#FFFFFF', borderRadius: 4, overflow: 'hidden', ...sombra },
  etqMin: { backgroundColor: '#001034', paddingHorizontal: 9, paddingVertical: 5, alignItems: 'center', justifyContent: 'center' },
  etqNum: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', lineHeight: 19 },
  etqUnidad: { color: '#FFFFFF', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  etqTexto: { color: '#001034', fontSize: 15, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'center', maxWidth: 200 },
});
