import { useState, useCallback, useEffect } from 'react';
import { Stack, useRouter, usePathname } from 'expo-router';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import useAuthStore from '../../store/authStore';
import api from '../../services/api';
import { registrarPushToken, escucharTapsNotificacion } from '../../services/push';
import { iniciarUbicacionBackground, detenerUbicacionBackground } from '../../services/backgroundLocation';

export default function MainLayout() {
  const repartidor = useAuthStore((s) => s.repartidor);
  const [disponible, setDisponible] = useState(false);
  const [toggling, setToggling] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Push: registrar token al entrar (ya autenticado) y navegar al home
  // cuando el repartidor toca una notificación de pedido
  useEffect(() => {
    registrarPushToken();
    return escucharTapsNotificacion((data) => {
      if (data?.tipo === 'nuevo_pedido_disponible' || data?.tipo === 'pedido_asignado') {
        router.push('/(main)');
      }
    });
  }, []);

  const handleToggle = useCallback(async (value) => {
    setToggling(true);
    try {
      if (value) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setToggling(false);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        await api.post('/delivery/repartidor/disponible', {
          disponible: true,
          Latitud: loc.coords.latitude,
          Longitud: loc.coords.longitude,
        });
        iniciarUbicacionBackground();
      } else {
        await api.post('/delivery/repartidor/disponible', { disponible: false });
        detenerUbicacionBackground();
      }
      setDisponible(value);
    } catch (e) {
      // could show an alert here
    } finally {
      setToggling(false);
    }
  }, []);

  const isHistorial = pathname === '/(main)/historial';
  const isPerfil = pathname === '/(main)/perfil';

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      {/* Custom header */}
      <SafeAreaView edges={['top']} style={[styles.header, disponible ? styles.headerOnline : styles.headerOffline]}>
        <View style={styles.headerContent}>
          {/* Left: back or title */}
          <View style={styles.headerLeft}>
            {(isHistorial || isPerfil) ? (
              <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                <Ionicons name="chevron-back" size={22} color="#fff" />
              </TouchableOpacity>
            ) : null}
            <View>
              <Text style={styles.headerGreeting}>Hola, {repartidor?.Nombre || 'Repartidor'}</Text>
              <Text style={styles.headerStatus}>
                {disponible ? '● En línea' : '● Desconectado'}
              </Text>
            </View>
          </View>

          {/* Right: toggle + nav icons */}
          <View style={styles.headerRight}>
            {toggling ? (
              <ActivityIndicator color="#fff" size="small" style={{ marginRight: 12 }} />
            ) : (
              <Switch
                value={disponible}
                onValueChange={handleToggle}
                trackColor={{ false: 'rgba(255,255,255,0.3)', true: '#27AE60' }}
                thumbColor="#fff"
                ios_backgroundColor="rgba(255,255,255,0.3)"
                style={{ marginRight: 8 }}
              />
            )}
            {!isHistorial && (
              <TouchableOpacity onPress={() => router.push('/(main)/historial')} style={styles.navBtn}>
                <Ionicons name="time-outline" size={22} color="#fff" />
              </TouchableOpacity>
            )}
            {!isPerfil && (
              <TouchableOpacity onPress={() => router.push('/(main)/perfil')} style={styles.navBtn}>
                <Ionicons name="person-circle-outline" size={24} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>

      {/* Screens pass disponible via context/prop — we use a global store instead */}
      <Stack
        screenOptions={{ headerShown: false }}
        // Pass disponible state down via initial params
      >
        <Stack.Screen name="index" initialParams={{ disponible }} />
        <Stack.Screen name="historial" />
        <Stack.Screen name="perfil" />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  headerOffline: { backgroundColor: '#2D3748' },
  headerOnline: { backgroundColor: '#1A6A9A' },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'android' ? 14 : 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  backBtn: { marginRight: 8, padding: 2 },
  headerGreeting: { color: '#fff', fontSize: 15, fontWeight: '700' },
  headerStatus: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  navBtn: { padding: 4, marginLeft: 4 },
});
