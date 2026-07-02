import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';

function getInitials(cliente) {
  if (!cliente) return '?';
  const n = (cliente.Nombre ?? cliente.nombre ?? '')[0] ?? '';
  const a = (cliente.Apellidos ?? cliente.apellidos ?? '')[0] ?? '';
  return (n + a).toUpperCase() || '?';
}

function formatFecha(fecha) {
  if (!fecha) return '';
  try {
    return new Date(fecha).toLocaleDateString('es-VE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return fecha;
  }
}

const STATUS_COLORS = {
  ENTREGADO: '#27AE60',
  EN_CAMINO: '#1A6A9A',
  PENDIENTE: '#F6AD55',
  CANCELADO: '#E53E3E',
};

export default function PerfilScreen() {
  const router = useRouter();
  const { cliente, token, logout } = useAuthStore();
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    const fetchPedidos = async () => {
      try {
        const res = await api.get('/delivery/cliente/pedidos');
        setPedidos((res.data?.pedidos ?? res.data ?? []).slice(0, 5));
      } catch {
        // Silently fail — endpoint may not exist yet
        setPedidos([]);
      } finally {
        setLoading(false);
      }
    };
    fetchPedidos();
  }, [token]);

  // Invitado: CTA para iniciar sesión o crear cuenta
  if (!token) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={guestStyles.wrap}>
          <View style={guestStyles.iconCircle}>
            <Ionicons name="person-outline" size={44} color="#1A6A9A" />
          </View>
          <Text style={guestStyles.title}>Aún no tienes sesión</Text>
          <Text style={guestStyles.sub}>
            Crea tu cuenta o inicia sesión para hacer pedidos y ver tu historial.
            Lo que tengas en el carrito no se pierde.
          </Text>
          <TouchableOpacity
            style={guestStyles.btn}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={guestStyles.btnText}>Iniciar sesión / Registrarme</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro de que deseas salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('vida_cliente_token');
          logout();
          router.replace('/(tabs)');
        },
      },
    ]);
  };

  const nombre = cliente?.Nombre ?? cliente?.nombre ?? 'Usuario';
  const apellido = cliente?.Apellidos ?? cliente?.apellidos ?? '';
  const telefono = cliente?.Telefono ?? cliente?.telefono ?? '';
  const email = cliente?.Email ?? cliente?.email ?? '';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <FlatList
        data={pedidos}
        keyExtractor={(item) => String(item.idPedido ?? item.id ?? Math.random())}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Profile header */}
            <View style={styles.profileHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{getInitials(cliente)}</Text>
              </View>
              <Text style={styles.profileName}>
                {nombre} {apellido}
              </Text>
              <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={14} color="#718096" />
                <Text style={styles.infoText}>{telefono || '—'}</Text>
              </View>
              {email ? (
                <View style={styles.infoRow}>
                  <Ionicons name="mail-outline" size={14} color="#718096" />
                  <Text style={styles.infoText}>{email}</Text>
                </View>
              ) : null}
            </View>

            {/* Pedidos recientes title */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Mis pedidos recientes</Text>
            </View>

            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator size="small" color="#1A6A9A" />
              </View>
            ) : pedidos.length === 0 ? (
              <View style={styles.emptyPedidos}>
                <Ionicons name="receipt-outline" size={40} color="#CBD5E0" />
                <Text style={styles.emptyText}>Sin pedidos aún</Text>
              </View>
            ) : null}
          </>
        }
        renderItem={({ item }) => {
          const estado = item.EstadoPedido ?? item.estado ?? 'PENDIENTE';
          const color = STATUS_COLORS[estado] ?? '#718096';
          const total = item.TotalUSD ?? item.total;
          return (
            <TouchableOpacity
              style={styles.pedidoCard}
              onPress={() => router.push(`/pedido/${item.idPedido ?? item.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.pedidoLeft}>
                <Text style={styles.pedidoId}>Pedido #{item.idPedido ?? item.id}</Text>
                <Text style={styles.pedidoFecha}>{formatFecha(item.FechaCreacion ?? item.fecha)}</Text>
              </View>
              <View style={styles.pedidoRight}>
                {total ? (
                  <Text style={styles.pedidoTotal}>${parseFloat(total).toFixed(2)}</Text>
                ) : null}
                <View style={[styles.estadoBadge, { backgroundColor: color + '20' }]}>
                  <Text style={[styles.estadoText, { color }]}>{estado}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#CBD5E0" />
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#E53E3E" />
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </TouchableOpacity>
        }
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  list: { paddingBottom: 40 },
  profileHeader: {
    backgroundColor: '#1A6A9A',
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 3,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: '#fff' },
  profileName: { fontSize: 22, fontWeight: '800', color: '#fff', textAlign: 'center' },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
  },
  infoText: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1A202C' },
  center: { paddingVertical: 24, alignItems: 'center' },
  emptyPedidos: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { color: '#A0AEC0', marginTop: 8, fontSize: 14 },
  pedidoCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  pedidoLeft: { flex: 1 },
  pedidoId: { fontSize: 14, fontWeight: '700', color: '#1A202C' },
  pedidoFecha: { fontSize: 12, color: '#718096', marginTop: 2 },
  pedidoRight: { alignItems: 'flex-end', marginRight: 8 },
  pedidoTotal: { fontSize: 14, fontWeight: '800', color: '#1A6A9A' },
  estadoBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  estadoText: { fontSize: 11, fontWeight: '700' },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: '#FFF5F5',
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: '#FEB2B2',
  },
  logoutText: { color: '#E53E3E', fontWeight: '700', fontSize: 15 },
});

const guestStyles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  iconCircle: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: '#EBF8FF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#1A202C', marginBottom: 8 },
  sub: { fontSize: 14, color: '#718096', textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  btn: {
    backgroundColor: '#27AE60', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 28, width: '100%', alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
