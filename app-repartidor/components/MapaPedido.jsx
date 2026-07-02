// Mapa del pedido activo: posición propia, sucursal y destino de entrega.
// Requiere build con Google Maps API key (app.json → android.config.googleMaps).
import { useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

export default function MapaPedido({ ubicacion, pedido }) {
  const mapRef = useRef(null);

  const yo = ubicacion && num(ubicacion.Latitud) != null
    ? { latitude: num(ubicacion.Latitud), longitude: num(ubicacion.Longitud) }
    : null;

  const sucursal = pedido && num(pedido.LatSucursal) != null
    ? { latitude: num(pedido.LatSucursal), longitude: num(pedido.LonSucursal) }
    : null;

  const destino = pedido && num(pedido.UbicacionEntregaLat) != null
    ? { latitude: num(pedido.UbicacionEntregaLat), longitude: num(pedido.UbicacionEntregaLon) }
    : null;

  const puntos = useMemo(
    () => [yo, sucursal, destino].filter(Boolean),
    [yo?.latitude, yo?.longitude, sucursal?.latitude, destino?.latitude],
  );

  // Antes de EN_CAMINO el objetivo es la sucursal; después, el destino
  const enCamino = pedido?.Status === 'EN_CAMINO';
  const objetivo = enCamino ? destino : (sucursal || destino);

  // Encuadrar todos los puntos visibles cuando cambian
  useEffect(() => {
    if (puntos.length >= 2 && mapRef.current) {
      mapRef.current.fitToCoordinates(puntos, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    }
  }, [puntos.length, pedido?.Status]);

  function abrirNavegacion() {
    if (!objetivo) return;
    const q = `${objetivo.latitude},${objetivo.longitude}`;
    const url = Platform.select({
      ios: `maps://app?daddr=${q}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`,
    });
    Linking.openURL(url).catch(() => {});
  }

  // Sin ninguna coordenada: estado vacío (ej. permisos de ubicación negados)
  if (puntos.length === 0) {
    return (
      <View style={styles.placeholder}>
        <Ionicons name="map-outline" size={48} color="#CBD5E0" />
        <Text style={styles.placeholderText}>Esperando ubicación GPS...</Text>
      </View>
    );
  }

  const centro = yo || objetivo || puntos[0];

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={{
          ...centro,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {sucursal && (
          <Marker coordinate={sucursal} title={pedido?.NombreSucursal || 'Sucursal'}
            description={pedido?.DireccionSucursal || ''} pinColor="#1A6A9A">
            <View style={[styles.pin, { backgroundColor: '#1A6A9A' }]}>
              <Ionicons name="storefront" size={16} color="#fff" />
            </View>
          </Marker>
        )}
        {destino && (
          <Marker coordinate={destino} title="Entrega"
            description={pedido?.DireccionEntrega || ''}>
            <View style={[styles.pin, { backgroundColor: '#27AE60' }]}>
              <Ionicons name="home" size={16} color="#fff" />
            </View>
          </Marker>
        )}
        {yo && objetivo && (
          <Polyline
            coordinates={[yo, objetivo]}
            strokeColor={enCamino ? '#27AE60' : '#1A6A9A'}
            strokeWidth={3}
            lineDashPattern={[8, 6]}
          />
        )}
        {sucursal && destino && (
          <Polyline
            coordinates={[sucursal, destino]}
            strokeColor="#A0AEC0"
            strokeWidth={2}
            lineDashPattern={[4, 6]}
          />
        )}
      </MapView>

      {objetivo && pedido && (
        <TouchableOpacity style={styles.navBtn} onPress={abrirNavegacion}>
          <Ionicons name="navigate" size={18} color="#fff" />
          <Text style={styles.navBtnText}>
            {enCamino ? 'Ir a la entrega' : 'Ir a la sucursal'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDF2F7',
  },
  placeholderText: { color: '#A0AEC0', marginTop: 8, fontSize: 13 },
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
  navBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1A6A9A',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  navBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
