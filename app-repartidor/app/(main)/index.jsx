import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Vibration,
  Alert,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import api from '../../services/api';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useLocation } from '../../hooks/useLocation';
import MapaPedido from '../../components/MapaPedido';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

const STATUSES = ['IR_A_SUCURSAL', 'EN_SUCURSAL', 'EN_CAMINO', 'ENTREGADO'];
const STATUS_LABELS = {
  IR_A_SUCURSAL: 'Ir a sucursal',
  EN_SUCURSAL: 'En sucursal',
  EN_CAMINO: 'En camino',
  ENTREGADO: 'Entregado',
};
const STATUS_ICONS = {
  IR_A_SUCURSAL: 'navigate-outline',
  EN_SUCURSAL: 'storefront-outline',
  EN_CAMINO: 'bicycle-outline',
  ENTREGADO: 'checkmark-circle-outline',
};

const ACTION_BUTTONS = [
  { fromStatus: null, label: 'Voy a la sucursal', nextStatus: 'IR_A_SUCURSAL', color: '#1A6A9A' },
  { fromStatus: 'IR_A_SUCURSAL', label: 'Llegué a la sucursal', nextStatus: 'EN_SUCURSAL', color: '#7B3FBE' },
  { fromStatus: 'EN_SUCURSAL', label: 'Tomé el pedido, voy al cliente', nextStatus: 'EN_CAMINO', color: '#E67E22' },
  { fromStatus: 'EN_CAMINO', label: 'Marcar como entregado', nextStatus: 'ENTREGADO', color: '#27AE60' },
];

// ---------- PulseView ----------
function PulseView({ style }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.15, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[style, { transform: [{ scale: anim }] }]} />;
}

// ---------- NuevoPedidoModal ----------
function NuevoPedidoModal({ pedido, onAceptar, onRechazar }) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const timerRef = useRef(null);
  const [segundos, setSegundos] = useState(60);
  const progressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      tension: 65,
      friction: 10,
      useNativeDriver: true,
    }).start();

    Animated.timing(progressAnim, {
      toValue: 0,
      duration: 60000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    const interval = setInterval(() => {
      setSegundos((s) => {
        if (s <= 1) {
          clearInterval(interval);
          onRechazar();
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const colorProgress = progressAnim.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: ['#E53E3E', '#E67E22', '#27AE60'],
  });

  return (
    <View style={modalStyles.overlay}>
      <Animated.View style={[modalStyles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Header urgente */}
        <View style={modalStyles.urgentHeader}>
          <Ionicons name="flash" size={28} color="#fff" />
          <Text style={modalStyles.urgentTitle}>¡Nuevo pedido!</Text>
          <Text style={modalStyles.timerText}>{segundos}s</Text>
        </View>

        {/* Progress bar */}
        <View style={modalStyles.progressBg}>
          <Animated.View style={[modalStyles.progressFill, { width: progressWidth, backgroundColor: colorProgress }]} />
        </View>

        {/* Detalles */}
        <View style={modalStyles.body}>
          {pedido.sucursal && (
            <View style={modalStyles.infoRow}>
              <Ionicons name="storefront-outline" size={20} color="#718096" />
              <Text style={modalStyles.infoLabel}>Recoger en:</Text>
              <Text style={modalStyles.infoValue}>{pedido.sucursal}</Text>
            </View>
          )}
          <View style={modalStyles.infoRow}>
            <Ionicons name="location-outline" size={20} color="#718096" />
            <Text style={modalStyles.infoLabel}>Entregar en:</Text>
            <Text style={modalStyles.infoValue} numberOfLines={2}>{pedido.direccion || pedido.DireccionEntrega || 'Sin dirección'}</Text>
          </View>

          <View style={modalStyles.totalRow}>
            <Text style={modalStyles.totalLabel}>Total del pedido</Text>
            <Text style={modalStyles.totalValue}>${(pedido.total || pedido.Total || 0).toFixed(2)}</Text>
          </View>

          {/* Método de pago */}
          <View style={modalStyles.pagoRow}>
            {(pedido.metodoPago || pedido.MetodoPago || '').toLowerCase().includes('efectivo') ? (
              <>
                <Ionicons name="cash-outline" size={22} color="#27AE60" />
                <Text style={[modalStyles.pagoText, { color: '#27AE60' }]}>Efectivo</Text>
              </>
            ) : (
              <>
                <Ionicons name="card-outline" size={22} color="#1A6A9A" />
                <Text style={[modalStyles.pagoText, { color: '#1A6A9A' }]}>Tarjeta / Transferencia</Text>
              </>
            )}
          </View>
        </View>

        {/* Botones */}
        <View style={modalStyles.actions}>
          <TouchableOpacity style={modalStyles.btnRechazar} onPress={onRechazar}>
            <Ionicons name="close" size={22} color="#718096" />
            <Text style={modalStyles.btnRechazarText}>Rechazar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={modalStyles.btnAceptar} onPress={onAceptar}>
            <Ionicons name="checkmark" size={24} color="#fff" />
            <Text style={modalStyles.btnAceptarText}>Aceptar</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

// ---------- StatusBar del pedido ----------
function PedidoStatusBar({ currentStatus }) {
  return (
    <View style={pedidoStyles.statusBar}>
      {STATUSES.map((s, i) => {
        const idx = STATUSES.indexOf(currentStatus);
        const done = i < idx;
        const active = s === currentStatus;
        return (
          <View key={s} style={pedidoStyles.stepContainer}>
            <View style={[pedidoStyles.stepDot, done && pedidoStyles.stepDone, active && pedidoStyles.stepActive]}>
              {done ? (
                <Ionicons name="checkmark" size={12} color="#fff" />
              ) : (
                <Ionicons name={STATUS_ICONS[s]} size={active ? 14 : 12} color={active ? '#fff' : '#A0AEC0'} />
              )}
            </View>
            <Text style={[pedidoStyles.stepLabel, active && pedidoStyles.stepLabelActive, done && pedidoStyles.stepLabelDone]}>
              {STATUS_LABELS[s]}
            </Text>
            {i < STATUSES.length - 1 && (
              <View style={[pedidoStyles.connector, (done || active) && pedidoStyles.connectorActive]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

// ---------- PantallaPrincipal ----------
export default function IndexScreen() {
  const [disponible, setDisponible] = useState(false);
  const [pedidoActivo, setPedidoActivo] = useState(null);
  const [nuevoPedido, setNuevoPedido] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const { ubicacion } = useLocation(disponible);

  // Cargar pedidos activos al inicio
  useEffect(() => {
    fetchPedidosActivos();
  }, []);

  const fetchPedidosActivos = async () => {
    try {
      const res = await api.get('/delivery/repartidor/pedidos-activos');
      const pedidos = res.data?.pedidos || res.data || [];
      if (Array.isArray(pedidos) && pedidos.length > 0) {
        setPedidoActivo(pedidos[0]);
        setDisponible(true);
      }
    } catch (_) {}
  };

  // WebSocket
  useWebSocket((msg) => {
    if (msg.tipo === 'nuevo_pedido_disponible' || msg.type === 'nuevo_pedido_disponible') {
      const pedido = msg.pedido || msg.data || msg;
      Vibration.vibrate([0, 400, 200, 400, 200, 400]);
      setNuevoPedido(pedido);
    }
  });

  const handleConectarme = async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a tu ubicación para mostrarte pedidos cercanos.');
        setLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await api.post('/delivery/repartidor/disponible', {
        disponible: true,
        Latitud: loc.coords.latitude,
        Longitud: loc.coords.longitude,
      });
      setDisponible(true);
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo conectar');
    } finally {
      setLoading(false);
    }
  };

  const handleAceptarPedido = async () => {
    if (!nuevoPedido) return;
    setActionLoading(true);
    try {
      await api.post('/delivery/repartidor/aceptar', { idPedido: nuevoPedido.idPedido || nuevoPedido.id });
      setPedidoActivo({ ...nuevoPedido, Status: null });
      setNuevoPedido(null);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRechazarPedido = () => {
    setNuevoPedido(null);
  };

  const handleCambiarStatus = async (nuevoStatus) => {
    if (!pedidoActivo) return;

    if (nuevoStatus === 'ENTREGADO') {
      Alert.alert(
        'Confirmar entrega',
        '¿Confirmas que el pedido fue entregado al cliente?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Confirmar', onPress: () => doCambiarStatus(nuevoStatus) },
        ]
      );
      return;
    }
    doCambiarStatus(nuevoStatus);
  };

  const doCambiarStatus = async (nuevoStatus) => {
    setActionLoading(true);
    try {
      await api.post('/delivery/repartidor/status-pedido', {
        idPedido: pedidoActivo.idPedido || pedidoActivo.id,
        nuevoStatus,
      });
      if (nuevoStatus === 'ENTREGADO') {
        setPedidoActivo(null);
      } else {
        setPedidoActivo((prev) => ({ ...prev, Status: nuevoStatus }));
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelar = () => {
    Alert.alert(
      'Cancelar pedido',
      '¿Seguro que quieres cancelar este pedido?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: () => doCambiarStatus('CANCELADO'),
        },
      ]
    );
  };

  // Determinar botón de acción
  const currentStatus = pedidoActivo?.Status || null;
  const actionBtn = ACTION_BUTTONS.find((b) => b.fromStatus === currentStatus);

  // -------- RENDER INACTIVO --------
  if (!disponible && !pedidoActivo) {
    return (
      <View style={styles.inactivoContainer}>
        <View style={styles.inactivoContent}>
          <PulseView style={styles.pulseBg} />
          <View style={styles.pulseCenter}>
            <Ionicons name="bicycle" size={52} color="#fff" />
          </View>
          <Text style={styles.inactivoTitle}>Estás desconectado</Text>
          <Text style={styles.inactivoSub}>Actívate para recibir pedidos cercanos</Text>
          <TouchableOpacity
            style={[styles.conectarBtn, loading && styles.btnDisabled]}
            onPress={handleConectarme}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="power" size={22} color="#fff" />
                <Text style={styles.conectarBtnText}>CONECTARME</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // -------- RENDER DISPONIBLE / CON PEDIDO --------
  return (
    <View style={styles.onlineContainer}>
      {/* Mapa: posición propia, sucursal y destino del pedido activo */}
      <View style={styles.mapPlaceholder}>
        <MapaPedido ubicacion={ubicacion} pedido={pedidoActivo} />
      </View>

      {/* Panel inferior */}
      <View style={styles.bottomPanel}>
        {pedidoActivo ? (
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Status bar */}
            <PedidoStatusBar currentStatus={pedidoActivo.Status} />

            {/* Info del pedido */}
            <View style={styles.pedidoCard}>
              <View style={styles.pedidoHeader}>
                <Text style={styles.pedidoTitle}>Pedido #{pedidoActivo.idPedido || pedidoActivo.id}</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(pedidoActivo.Status) }]}>
                  <Text style={styles.statusBadgeText}>{STATUS_LABELS[pedidoActivo.Status] || 'Nuevo'}</Text>
                </View>
              </View>

              {pedidoActivo.cliente && (
                <View style={styles.infoRow}>
                  <Ionicons name="person-outline" size={18} color="#718096" />
                  <Text style={styles.infoText}>{pedidoActivo.cliente}</Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <Ionicons name="location-outline" size={18} color="#718096" />
                <Text style={styles.infoText} numberOfLines={2}>
                  {pedidoActivo.direccion || pedidoActivo.DireccionEntrega || 'Sin dirección'}
                </Text>
              </View>
              {pedidoActivo.sucursal && (
                <View style={styles.infoRow}>
                  <Ionicons name="storefront-outline" size={18} color="#718096" />
                  <Text style={styles.infoText}>{pedidoActivo.sucursal}</Text>
                </View>
              )}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>${(pedidoActivo.total || pedidoActivo.Total || 0).toFixed(2)}</Text>
              </View>
            </View>

            {/* Botón acción principal */}
            {actionBtn && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: actionBtn.color }, actionLoading && styles.btnDisabled]}
                onPress={() => handleCambiarStatus(actionBtn.nextStatus)}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name={STATUS_ICONS[actionBtn.nextStatus]} size={22} color="#fff" />
                    <Text style={styles.actionBtnText}>{actionBtn.label}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Cancelar */}
            {pedidoActivo.Status !== 'ENTREGADO' && (
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelar}>
                <Text style={styles.cancelBtnText}>Cancelar pedido</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        ) : (
          <View style={styles.esperandoContainer}>
            <Ionicons name="radio-outline" size={40} color="#27AE60" />
            <Text style={styles.esperandoTitle}>Esperando pedidos...</Text>
            <Text style={styles.esperandoSub}>Estás en línea y visible para clientes cercanos</Text>
          </View>
        )}
      </View>

      {/* Modal nuevo pedido */}
      {nuevoPedido && (
        <NuevoPedidoModal
          pedido={nuevoPedido}
          onAceptar={handleAceptarPedido}
          onRechazar={handleRechazarPedido}
        />
      )}
    </View>
  );
}

function getStatusColor(status) {
  const map = {
    IR_A_SUCURSAL: '#1A6A9A',
    EN_SUCURSAL: '#7B3FBE',
    EN_CAMINO: '#E67E22',
    ENTREGADO: '#27AE60',
    CANCELADO: '#E53E3E',
  };
  return map[status] || '#718096';
}

// ---- Styles ----

const styles = StyleSheet.create({
  // Inactivo
  inactivoContainer: {
    flex: 1,
    backgroundColor: '#1A202C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inactivoContent: { alignItems: 'center', paddingHorizontal: 32 },
  pulseBg: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(39,174,96,0.2)',
    position: 'absolute',
  },
  pulseCenter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#27AE60',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  inactivoTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  inactivoSub: { color: '#A0AEC0', fontSize: 15, textAlign: 'center', marginBottom: 40 },
  conectarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#27AE60',
    paddingHorizontal: 40,
    paddingVertical: 18,
    borderRadius: 50,
    shadowColor: '#27AE60',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
    gap: 10,
  },
  conectarBtnText: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1.5 },
  btnDisabled: { opacity: 0.6 },

  // Online
  onlineContainer: { flex: 1, backgroundColor: '#F5F7FA' },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: '#E8EDF2',
    minHeight: SCREEN_HEIGHT * 0.3,
    overflow: 'hidden',
  },
  mapText: { color: '#A0AEC0', fontSize: 13, marginTop: 8, textAlign: 'center', paddingHorizontal: 20 },
  coordsText: { color: '#718096', fontSize: 11, marginTop: 4 },

  // Bottom panel
  bottomPanel: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: SCREEN_HEIGHT * 0.6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  esperandoContainer: { alignItems: 'center', paddingVertical: 32 },
  esperandoTitle: { fontSize: 20, fontWeight: '700', color: '#1A202C', marginTop: 12 },
  esperandoSub: { color: '#718096', fontSize: 14, textAlign: 'center', marginTop: 6 },

  // Pedido card
  pedidoCard: {
    backgroundColor: '#F7FAFC',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pedidoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  pedidoTitle: { fontSize: 16, fontWeight: '700', color: '#1A202C' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  infoText: { color: '#4A5568', fontSize: 14, flex: 1 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 10 },
  totalLabel: { color: '#718096', fontSize: 14 },
  totalValue: { color: '#1A202C', fontSize: 20, fontWeight: '800' },

  // Action button
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: 12, marginBottom: 8 },
  cancelBtnText: { color: '#E53E3E', fontSize: 14, fontWeight: '600' },
});

const pedidoStyles = StyleSheet.create({
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  stepContainer: {
    alignItems: 'center',
    flex: 1,
    position: 'relative',
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  stepDone: { backgroundColor: '#27AE60' },
  stepActive: { backgroundColor: '#1A6A9A', width: 36, height: 36, borderRadius: 18 },
  stepLabel: { fontSize: 9, color: '#A0AEC0', textAlign: 'center', marginTop: 4, fontWeight: '500' },
  stepLabelActive: { color: '#1A6A9A', fontWeight: '700' },
  stepLabelDone: { color: '#27AE60' },
  connector: {
    position: 'absolute',
    top: 16,
    right: -SCREEN_WIDTH * 0.12,
    width: SCREEN_WIDTH * 0.22,
    height: 2,
    backgroundColor: '#E2E8F0',
    zIndex: 0,
  },
  connectorActive: { backgroundColor: '#27AE60' },
});

const modalStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
  },
  urgentHeader: {
    backgroundColor: '#E67E22',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  urgentTitle: { color: '#fff', fontSize: 22, fontWeight: '800', flex: 1, textAlign: 'center' },
  timerText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    minWidth: 44,
    textAlign: 'center',
  },
  progressBg: { height: 5, backgroundColor: '#E2E8F0' },
  progressFill: { height: 5 },
  body: { padding: 20 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 8 },
  infoLabel: { color: '#718096', fontSize: 13, fontWeight: '600', width: 80 },
  infoValue: { color: '#1A202C', fontSize: 14, flex: 1, fontWeight: '500' },
  totalRow: {
    backgroundColor: '#F7FAFC',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
  },
  totalLabel: { color: '#718096', fontSize: 15 },
  totalValue: { color: '#1A202C', fontSize: 28, fontWeight: '900' },
  pagoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  pagoText: { fontSize: 15, fontWeight: '700' },
  actions: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  btnRechazar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F7FA',
    borderRadius: 16,
    paddingVertical: 15,
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  btnRechazarText: { color: '#718096', fontSize: 15, fontWeight: '700' },
  btnAceptar: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#27AE60',
    borderRadius: 16,
    paddingVertical: 15,
    gap: 6,
    shadowColor: '#27AE60',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  btnAceptarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
