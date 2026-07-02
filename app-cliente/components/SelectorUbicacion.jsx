// Selector de ubicación de entrega estilo Uber: pin fijo al centro y el mapa
// se mueve debajo. Devuelve las coordenadas confirmadas y permite guardar la
// dirección con alias (solo con sesión iniciada).
import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
  ActivityIndicator, Platform, Switch,
} from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

// Centro por defecto si no hay GPS (Caracas)
const DEFAULT_REGION = {
  latitude: 10.4806,
  longitude: -66.9036,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function SelectorUbicacion({ visible, onClose, onConfirmar, puedeGuardar }) {
  const mapRef = useRef(null);
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [centro, setCentro] = useState(DEFAULT_REGION);
  const [buscandoGPS, setBuscandoGPS] = useState(false);
  const [guardar, setGuardar] = useState(false);
  const [alias, setAlias] = useState('');

  // Al abrir: intentar centrar en la ubicación actual
  useEffect(() => {
    if (visible) usarMiUbicacion();
  }, [visible]);

  async function usarMiUbicacion() {
    setBuscandoGPS(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const nueva = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      };
      setCentro(nueva);
      mapRef.current?.animateToRegion(nueva, 500);
    } catch {
      // sin GPS: se queda en el centro por defecto, el usuario arrastra
    } finally {
      setBuscandoGPS(false);
    }
  }

  function confirmar() {
    onConfirmar({
      Latitud: centro.latitude,
      Longitud: centro.longitude,
      guardar: puedeGuardar && guardar,
      alias: alias.trim(),
    });
    setGuardar(false);
    setAlias('');
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={region}
          onRegionChangeComplete={(r) => setCentro(r)}
          showsUserLocation
          showsMyLocationButton={false}
        />

        {/* Pin fijo al centro */}
        <View pointerEvents="none" style={styles.pinWrap}>
          <Ionicons name="location" size={44} color="#E53E3E" style={styles.pinSombra} />
        </View>

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
          {/* Feedback de coordenadas (útil si los tiles no cargan en Expo Go:
              el botón de GPS sí toma tu ubicación real) */}
          <Text style={styles.coordsText}>
            📍 {centro.latitude.toFixed(5)}, {centro.longitude.toFixed(5)}
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
  pinWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 44, // la punta del pin cae exactamente en el centro
  },
  pinSombra: {
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  header: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 40,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
