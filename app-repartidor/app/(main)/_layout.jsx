import { useEffect } from 'react';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import usePedidoStore from '../../store/pedidoStore';
import { registrarPushToken, escucharTapsNotificacion } from '../../services/push';

const STATUS_LABELS = {
  IR_A_SUCURSAL: 'Yendo a sucursal',
  EN_SUCURSAL: 'En sucursal',
  EN_CAMINO: 'En camino al cliente',
  ENTREGADO: 'Entregado',
};

const STATUS_COLORS = {
  IR_A_SUCURSAL: '#1A6A9A',
  EN_SUCURSAL: '#7B3FBE',
  EN_CAMINO: '#E67E22',
  ENTREGADO: '#27AE60',
};

export default function MainLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const pedidosActivos = usePedidoStore((s) => s.pedidosActivos);
  // El banner resume la parada más próxima de la ruta
  const pedidoActivo = pedidosActivos.length > 0 ? pedidosActivos[0] : null;

  useEffect(() => {
    registrarPushToken();
    return escucharTapsNotificacion((data) => {
      if (data?.tipo === 'nuevo_pedido_disponible' || data?.tipo === 'pedido_asignado') {
        router.push('/(main)');
      }
    });
  }, []);

  // Banner visible en todas las tabs excepto Inicio cuando hay pedido activo
  const isInicio = pathname === '/(main)' || pathname === '/(main)/index';
  const showBanner = !!pedidoActivo && !isInicio;
  const bannerColor = STATUS_COLORS[pedidoActivo?.Status] || '#1A6A9A';

  return (
    <View style={{ flex: 1 }}>
      {showBanner && (
        <SafeAreaView edges={['top']} style={[styles.bannerSafe, { backgroundColor: bannerColor }]}>
          <TouchableOpacity style={styles.banner} onPress={() => router.push('/(main)')} activeOpacity={0.85}>
            <View style={styles.bannerPulse} />
            <View style={styles.bannerInfo}>
              <Text style={styles.bannerTitle}>
                {pedidosActivos.length > 1
                  ? `${pedidosActivos.length} pedidos en ruta · próximo #${pedidoActivo?.idPedido || pedidoActivo?.id}`
                  : `Pedido #${pedidoActivo?.idPedido || pedidoActivo?.id} · activo`}
              </Text>
              <Text style={styles.bannerSub}>
                {STATUS_LABELS[pedidoActivo?.Status] || 'En proceso'} — toca para ver
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </SafeAreaView>
      )}

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#1A6A9A',
          tabBarInactiveTintColor: '#A0AEC0',
          tabBarStyle: styles.tabBar,
          tabBarLabelStyle: styles.tabLabel,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Inicio',
            tabBarIcon: ({ color, focused }) => (
              <View style={styles.tabIconWrap}>
                <Ionicons name={focused ? 'map' : 'map-outline'} size={24} color={color} />
                {/* Badge si hay pedido activo */}
                {!!pedidoActivo && (
                  <View style={styles.badge} />
                )}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="ganancias"
          options={{
            title: 'Ganancias',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'cash' : 'cash-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="historial"
          options={{
            title: 'Historial',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'time' : 'time-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="perfil"
          options={{
            title: 'Perfil',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerSafe: {},
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  bannerPulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
    opacity: 0.9,
  },
  bannerInfo: { flex: 1 },
  bannerTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  bannerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 1 },

  tabBar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#EDF2F7',
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    paddingTop: 8,
    height: Platform.OS === 'ios' ? 82 : 64,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  tabLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  tabIconWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -2,
    right: -6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E67E22',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
});
