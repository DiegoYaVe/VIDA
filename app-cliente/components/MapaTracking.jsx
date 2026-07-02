// Mapa de seguimiento del pedido: repartidor en movimiento + destino de entrega.
// La posición del repartidor viene del polling de /delivery/pedido/:id/estado
// (el repartidor la actualiza por GPS cada ~10s).
import { useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

export default function MapaTracking({ estado, enCamino }) {
  const mapRef = useRef(null);

  const repartidor = num(estado?.LatRepartidor) != null
    ? { latitude: num(estado.LatRepartidor), longitude: num(estado.LonRepartidor) }
    : null;

  const destino = num(estado?.UbicacionEntregaLat) != null
    ? { latitude: num(estado.UbicacionEntregaLat), longitude: num(estado.UbicacionEntregaLon) }
    : null;

  const puntos = useMemo(
    () => [repartidor, destino].filter(Boolean),
    [repartidor?.latitude, repartidor?.longitude, destino?.latitude],
  );

  // Re-encuadrar suavemente cuando el repartidor se mueve
  useEffect(() => {
    if (!mapRef.current || puntos.length === 0) return;
    if (puntos.length >= 2) {
      mapRef.current.fitToCoordinates(puntos, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    } else {
      mapRef.current.animateToRegion({ ...puntos[0], latitudeDelta: 0.015, longitudeDelta: 0.015 }, 600);
    }
  }, [repartidor?.latitude, repartidor?.longitude, puntos.length]);

  if (puntos.length === 0) {
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
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={{ ...puntos[0], latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        toolbarEnabled={false}
        scrollEnabled
        zoomEnabled
      >
        {repartidor && (
          <Marker coordinate={repartidor} title={estado?.NombreRepartidor || 'Repartidor'} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[styles.pin, { backgroundColor: '#1A6A9A' }]}>
              <Ionicons name="bicycle" size={16} color="#fff" />
            </View>
          </Marker>
        )}
        {destino && (
          <Marker coordinate={destino} title="Tu dirección" description={estado?.DireccionEntrega || ''}>
            <View style={[styles.pin, { backgroundColor: '#27AE60' }]}>
              <Ionicons name="home" size={16} color="#fff" />
            </View>
          </Marker>
        )}
        {repartidor && destino && (
          <Polyline
            coordinates={[repartidor, destino]}
            strokeColor={enCamino ? '#27AE60' : '#A0AEC0'}
            strokeWidth={3}
            lineDashPattern={[8, 6]}
          />
        )}
      </MapView>
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
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
