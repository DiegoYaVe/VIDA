import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Animated,
  Linking,
  ActivityIndicator,
  Easing,
  Image,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import { WS_URL } from '../../constants/config';
import MapaTracking from '../../components/MapaTracking';

const PASOS = [
  { key: 'BUSCANDO', label: 'Buscando\nrepartidor', icon: 'search-outline' },
  { key: 'ASIGNADO', label: 'Asignado', icon: 'bicycle-outline' },
  { key: 'EN_CAMINO_TIENDA', label: 'En camino\na tienda', icon: 'navigate-outline' },
  { key: 'EN_TIENDA', label: 'En tienda', icon: 'storefront-outline' },
  { key: 'EN_CAMINO', label: 'En camino', icon: 'car-outline' },
  { key: 'ENTREGADO', label: 'Entregado', icon: 'checkmark-circle-outline' },
];

// Map backend status values to our step keys
function normalizeStatus(raw) {
  if (!raw) return 'BUSCANDO';
  const s = String(raw).toUpperCase();
  if (s === 'BUSCANDO_REPARTIDOR' || s.includes('BUSCAN') || s === 'PENDIENTE' || s === 'NUEVO') return 'BUSCANDO';
  if (s === 'REPARTIDOR_ASIGNADO' || s.includes('ASIGNA')) return 'ASIGNADO';
  if (s === 'IR_A_SUCURSAL') return 'EN_CAMINO_TIENDA';
  if (s === 'EN_SUCURSAL') return 'EN_TIENDA';
  if (s === 'EN_CAMINO') return 'EN_CAMINO';
  if (s === 'ENTREGADO' || s.includes('ENTREGA') || s === 'COMPLETADO') return 'ENTREGADO';
  return 'BUSCANDO';
}

export default function SeguimientoScreen() {
  const { idPedido } = useLocalSearchParams();
  const router = useRouter();
  const { token, setPostLoginRedirect } = useAuthStore();

  // El tracking requiere sesión (el pedido pertenece a un cliente)
  useEffect(() => {
    if (!token) {
      setPostLoginRedirect(`/pedido/${idPedido}`);
      router.replace('/(auth)/login');
    }
  }, [token]);

  const [estado, setEstado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [calificacion, setCalificacion] = useState(0);
  const [calificado, setCalificado] = useState(false);
  const [enviandoCalif, setEnviandoCalif] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const wsRef = useRef(null);
  const pollingRef = useRef(null);
  const confettiAnim = useRef(new Animated.Value(0)).current;

  const stepIndex = estado ? PASOS.findIndex((p) => p.key === normalizeStatus(estado.Status ?? estado.EstadoPedido ?? estado.estado)) : 0;
  const isDelivered = stepIndex === PASOS.length - 1;
  const isBuscando = stepIndex === 0;

  // Pulse animation for "buscando"
  useEffect(() => {
    if (!isBuscando || isDelivered) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 700, easing: Easing.ease, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, easing: Easing.ease, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isBuscando, isDelivered]);

  // Confetti when delivered
  useEffect(() => {
    if (!isDelivered) return;
    Animated.spring(confettiAnim, { toValue: 1, useNativeDriver: true }).start();
  }, [isDelivered]);

  const fetchEstado = useCallback(async () => {
    try {
      const res = await api.get(`/delivery/pedido/${idPedido}/estado`);
      const data = res.data?.pedido ?? res.data;
      setEstado(data);
      if (data?.YaCalificado) setCalificado(true);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [idPedido]);

  // Polling every 10s
  useEffect(() => {
    fetchEstado();
    pollingRef.current = setInterval(() => {
      if (!isDelivered) fetchEstado();
    }, 10000);
    return () => clearInterval(pollingRef.current);
  }, [fetchEstado, isDelivered]);

  // WebSocket
  useEffect(() => {
    if (!token) return;
    try {
      const ws = new WebSocket(`${WS_URL}?token=${token}`);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.tipo === 'status_pedido' && String(msg.idPedido) === String(idPedido)) {
            setEstado((prev) => ({ ...prev, Status: msg.estado, EstadoPedido: msg.estado }));
          }
          if (msg.tipo === 'pedido_asignado' && String(msg.idPedido) === String(idPedido)) {
            fetchEstado();
          }
        } catch {}
      };

      ws.onerror = () => {};
    } catch {}

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [token, idPedido]);

  const repartidor = estado?.repartidor ?? estado?.Repartidor ?? (
    estado?.NombreRepartidor ? {
      Nombre: estado.NombreRepartidor,
      Telefono: estado.TelefonoRepartidor,
      FotoURL: estado.FotoRepartidor,
      Vehiculo: estado.VehiculoRepartidor,
      PlacaVehiculo: estado.PlacaRepartidor,
      Calificacion: estado.CalificacionRepartidor,
      TotalCalificaciones: estado.TotalCalificacionesRepartidor,
    } : null
  );

  const BASE_URL_IMG = process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') ?? '';

  const enviarCalificacion = async (estrellas) => {
    if (enviandoCalif || calificado) return;
    setCalificacion(estrellas);
    setEnviandoCalif(true);
    try {
      await api.post(`/delivery/pedido/${idPedido}/calificar`, { Estrellas: estrellas });
      setCalificado(true);
      Alert.alert('¡Gracias!', 'Tu calificación fue enviada.');
    } catch {
      Alert.alert('Error', 'No se pudo enviar la calificación. Intenta de nuevo.');
    } finally {
      setEnviandoCalif(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: `Pedido #${idPedido}`,
          headerStyle: { backgroundColor: '#fff' },
          headerTitleStyle: { fontWeight: '800', color: '#1A202C' },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={{ marginLeft: 4 }}>
              <Ionicons name="close" size={24} color="#718096" />
            </TouchableOpacity>
          ),
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A6A9A" />
          <Text style={styles.loadingText}>Cargando tu pedido...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchEstado}>
            <Text style={styles.retryBtnText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Delivered celebration */}
          {isDelivered && (
            <Animated.View style={[styles.celebrationBanner, { transform: [{ scale: confettiAnim }] }]}>
              <Text style={styles.celebrationEmoji}>🎉</Text>
              <Text style={styles.celebrationTitle}>¡Tu pedido llegó!</Text>
              <Text style={styles.celebrationSub}>Gracias por usar VIDA</Text>
            </Animated.View>
          )}

          {/* Progress bar */}
          <View style={styles.progressContainer}>
            {PASOS.map((paso, idx) => {
              const done = idx <= stepIndex;
              const active = idx === stepIndex;
              return (
                <View key={paso.key} style={styles.stepWrapper}>
                  <Animated.View
                    style={[
                      styles.stepCircle,
                      done && styles.stepCircleDone,
                      active && { transform: [{ scale: active && isBuscando ? pulseAnim : 1 }] },
                    ]}
                  >
                    <Ionicons name={paso.icon} size={16} color={done ? '#fff' : '#CBD5E0'} />
                  </Animated.View>
                  <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>{paso.label}</Text>
                  {idx < PASOS.length - 1 && (
                    <View style={[styles.stepLine, idx < stepIndex && styles.stepLineDone]} />
                  )}
                </View>
              );
            })}
          </View>

          {/* Status card */}
          <View style={styles.statusCard}>
            <View style={styles.statusIconWrap}>
              <Ionicons
                name={PASOS[Math.max(0, stepIndex)].icon}
                size={32}
                color="#1A6A9A"
              />
            </View>
            <View style={styles.statusInfo}>
              <Text style={styles.statusTitle}>
                {PASOS[Math.max(0, stepIndex)].label.replace('\n', ' ')}
              </Text>
              <Text style={styles.statusSub}>
                {isDelivered
                  ? 'Tu pedido fue entregado exitosamente'
                  : isBuscando
                  ? 'Estamos asignando un repartidor para tu pedido...'
                  : 'Tu pedido está en camino'}
              </Text>
            </View>
          </View>

          {/* Repartidor info */}
          {repartidor && (
            <View style={styles.repartidorCard}>
              <View style={styles.repartidorTop}>
                {repartidor.FotoURL ? (
                  <Image
                    source={{ uri: BASE_URL_IMG + repartidor.FotoURL }}
                    style={styles.repartidorFoto}
                  />
                ) : (
                  <View style={styles.repartidorAvatar}>
                    <Text style={styles.repartidorInitial}>
                      {(repartidor.Nombre ?? 'R')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.repartidorInfo}>
                  <Text style={styles.repartidorNombre}>{repartidor.Nombre}</Text>
                  <Text style={styles.repartidorLabel}>Tu repartidor</Text>
                  {repartidor.Calificacion != null && (
                    <View style={styles.ratingRow}>
                      <Ionicons name="star" size={13} color="#F6AD55" />
                      <Text style={styles.ratingText}>
                        {parseFloat(repartidor.Calificacion).toFixed(1)}
                        <Text style={styles.ratingTotal}> ({repartidor.TotalCalificaciones ?? 0})</Text>
                      </Text>
                    </View>
                  )}
                </View>
                {repartidor.Telefono && (
                  <TouchableOpacity
                    style={styles.callBtn}
                    onPress={() => Linking.openURL(`tel:${repartidor.Telefono}`)}
                  >
                    <Ionicons name="call" size={18} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>

              {(repartidor.Vehiculo || repartidor.PlacaVehiculo) && (
                <View style={styles.repartidorVehiculo}>
                  <Ionicons name="bicycle-outline" size={15} color="#718096" />
                  <Text style={styles.repartidorVehiculoText}>
                    {[repartidor.Vehiculo, repartidor.PlacaVehiculo].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              )}

              {/* Widget de calificación — solo cuando está entregado */}
              {isDelivered && !calificado && (
                <View style={styles.califSection}>
                  <Text style={styles.califTitle}>¿Cómo fue tu repartidor?</Text>
                  <View style={styles.starsRow}>
                    {[1,2,3,4,5].map(n => (
                      <TouchableOpacity
                        key={n}
                        onPress={() => enviarCalificacion(n)}
                        disabled={enviandoCalif}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={n <= calificacion ? 'star' : 'star-outline'}
                          size={34}
                          color="#F6AD55"
                          style={{ marginHorizontal: 4 }}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                  {enviandoCalif && <ActivityIndicator size="small" color="#1A6A9A" style={{ marginTop: 8 }} />}
                </View>
              )}

              {isDelivered && calificado && (
                <View style={styles.califDone}>
                  <Ionicons name="checkmark-circle" size={18} color="#27AE60" />
                  <Text style={styles.califDoneText}>Calificación enviada. ¡Gracias!</Text>
                </View>
              )}
            </View>
          )}

          {/* Mapa de seguimiento: repartidor en movimiento + destino */}
          {!isDelivered && (
            <MapaTracking
              estado={estado}
              enCamino={normalizeStatus(estado?.EstadoPedido ?? estado?.estado ?? estado?.Status) === 'EN_CAMINO'}
            />
          )}

          {/* Order summary */}
          {estado?.items && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Resumen del pedido</Text>
              {estado.items.map((item, i) => (
                <View key={i} style={styles.orderItem}>
                  <Text style={styles.orderItemQty}>{item.Cantidad}x</Text>
                  <Text style={styles.orderItemName}>{item.Nombre ?? item.nombre}</Text>
                  <Text style={styles.orderItemPrice}>
                    ${(item.PrecioUSD * item.Cantidad).toFixed(2)}
                  </Text>
                </View>
              ))}
              <View style={styles.divider} />
              <View style={styles.orderTotal}>
                <Text style={styles.orderTotalLabel}>Total</Text>
                <Text style={styles.orderTotalValue}>
                  ${estado.TotalUSD ?? estado.total ?? '—'}
                </Text>
              </View>
            </View>
          )}

          {estado?.DireccionEntrega && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Dirección de entrega</Text>
              <View style={styles.addressRow}>
                <Ionicons name="location-outline" size={18} color="#1A6A9A" />
                <Text style={styles.addressText}>{estado.DireccionEntrega}</Text>
              </View>
            </View>
          )}

          {isDelivered && (
            <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/(tabs)')}>
              <Text style={styles.homeBtnText}>Volver al inicio</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  loadingText: { marginTop: 12, color: '#718096' },
  errorText: { color: '#E53E3E', textAlign: 'center' },
  retryBtn: { marginTop: 12, backgroundColor: '#1A6A9A', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 9 },
  retryBtnText: { color: '#fff', fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 40 },

  celebrationBanner: {
    backgroundColor: '#F0FFF4',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#27AE60',
  },
  celebrationEmoji: { fontSize: 40 },
  celebrationTitle: { fontSize: 22, fontWeight: '900', color: '#27AE60', marginTop: 8 },
  celebrationSub: { color: '#48BB78', marginTop: 4 },

  progressContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 4,
  },
  stepWrapper: { alignItems: 'center', flex: 1, minWidth: 50 },
  stepCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EDF2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleDone: { backgroundColor: '#1A6A9A' },
  stepLabel: { fontSize: 10, color: '#A0AEC0', textAlign: 'center', marginTop: 4, fontWeight: '500' },
  stepLabelDone: { color: '#1A6A9A', fontWeight: '700' },
  stepLine: {
    position: 'absolute',
    top: 17,
    right: -20,
    width: 40,
    height: 2,
    backgroundColor: '#EDF2F7',
    zIndex: -1,
  },
  stepLineDone: { backgroundColor: '#1A6A9A' },

  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statusIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#EBF8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  statusInfo: { flex: 1 },
  statusTitle: { fontSize: 16, fontWeight: '800', color: '#1A202C' },
  statusSub: { fontSize: 13, color: '#718096', marginTop: 3 },

  repartidorCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  repartidorTop: { flexDirection: 'row', alignItems: 'center' },
  repartidorFoto: {
    width: 52, height: 52, borderRadius: 26,
    marginRight: 12, backgroundColor: '#EDF2F7',
  },
  repartidorAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#1A6A9A',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  repartidorInitial: { color: '#fff', fontSize: 20, fontWeight: '800' },
  repartidorInfo: { flex: 1 },
  repartidorNombre: { fontSize: 15, fontWeight: '700', color: '#1A202C' },
  repartidorLabel: { fontSize: 12, color: '#718096' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  ratingText: { fontSize: 13, fontWeight: '700', color: '#F6AD55' },
  ratingTotal: { fontSize: 11, color: '#A0AEC0', fontWeight: '400' },
  repartidorVehiculo: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#EDF2F7',
  },
  repartidorVehiculoText: { fontSize: 13, color: '#718096' },
  callBtn: {
    backgroundColor: '#27AE60',
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  califSection: {
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#EDF2F7',
    alignItems: 'center',
  },
  califTitle: { fontSize: 14, fontWeight: '700', color: '#4A5568', marginBottom: 10 },
  starsRow: { flexDirection: 'row', alignItems: 'center' },
  califDone: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#EDF2F7',
    justifyContent: 'center',
  },
  califDoneText: { fontSize: 13, color: '#27AE60', fontWeight: '600' },

  mapPlaceholder: {
    height: 160,
    backgroundColor: '#E2E8F0',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  mapPlaceholderText: { color: '#A0AEC0', marginTop: 8, fontSize: 13 },

  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1A202C', marginBottom: 10 },
  orderItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  orderItemQty: { fontSize: 14, fontWeight: '700', color: '#1A6A9A', width: 28 },
  orderItemName: { flex: 1, fontSize: 14, color: '#1A202C' },
  orderItemPrice: { fontSize: 14, fontWeight: '700', color: '#1A202C' },
  divider: { height: 1, backgroundColor: '#EDF2F7', marginVertical: 8 },
  orderTotal: { flexDirection: 'row', justifyContent: 'space-between' },
  orderTotalLabel: { fontSize: 15, fontWeight: '800', color: '#1A202C' },
  orderTotalValue: { fontSize: 16, fontWeight: '900', color: '#1A6A9A' },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  addressText: { flex: 1, color: '#4A5568', fontSize: 14, lineHeight: 20 },

  homeBtn: {
    backgroundColor: '#1A6A9A',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  homeBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
