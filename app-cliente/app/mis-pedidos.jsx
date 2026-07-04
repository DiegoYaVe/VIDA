import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import api from '../services/api';
import useAuthStore from '../store/authStore';

const STATUS_LABELS = {
  BUSCANDO_REPARTIDOR: 'Buscando repartidor',
  REPARTIDOR_ASIGNADO: 'Asignado',
  IR_A_SUCURSAL:       'En camino a tienda',
  EN_SUCURSAL:         'En tienda',
  EN_CAMINO:           'En camino',
  ENTREGADO:           'Entregado',
  CANCELADO:           'Cancelado',
};

const STATUS_COLORS = {
  BUSCANDO_REPARTIDOR: '#F6AD55',
  REPARTIDOR_ASIGNADO: '#4299E1',
  IR_A_SUCURSAL:       '#9F7AEA',
  EN_SUCURSAL:         '#667EEA',
  EN_CAMINO:           '#1A6A9A',
  ENTREGADO:           '#27AE60',
  CANCELADO:           '#E53E3E',
};

function formatFecha(fecha) {
  if (!fecha) return '';
  try {
    return new Date(fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return fecha; }
}

export default function MisPedidosScreen() {
  const router = useRouter();
  const { token } = useAuthStore();
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    api.get('/delivery/cliente/pedidos')
      .then(r => setPedidos(r.data?.pedidos ?? r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1A202C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mis pedidos</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A6A9A" />
        </View>
      ) : pedidos.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="receipt-outline" size={56} color="#CBD5E0" />
          <Text style={styles.emptyText}>No tienes pedidos aún</Text>
          <TouchableOpacity style={styles.shopBtn} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.shopBtnText}>Ver tiendas</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={pedidos}
          keyExtractor={item => String(item.idPedido ?? item.id)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const rawStatus = item.Status ?? item.EstadoPedido ?? item.estado ?? 'BUSCANDO_REPARTIDOR';
            const label = STATUS_LABELS[rawStatus] ?? rawStatus;
            const color = STATUS_COLORS[rawStatus] ?? '#718096';
            const total = item.TotalUSD ?? item.total;
            const isActive = rawStatus !== 'ENTREGADO' && rawStatus !== 'CANCELADO';
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/pedido/${item.idPedido ?? item.id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.cardLeft}>
                  <View style={styles.cardIconWrap}>
                    <Ionicons
                      name={rawStatus === 'ENTREGADO' ? 'checkmark-circle' : 'bicycle-outline'}
                      size={22}
                      color={color}
                    />
                  </View>
                  <View>
                    <Text style={styles.cardId}>Pedido #{item.idPedido ?? item.id}</Text>
                    <Text style={styles.cardFecha}>{formatFecha(item.FechaCreacion ?? item.fecha)}</Text>
                    {item.TotalItems > 0 && (
                      <Text style={styles.cardItems}>{item.TotalItems} producto{item.TotalItems !== 1 ? 's' : ''}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.cardRight}>
                  {total ? <Text style={styles.cardTotal}>${parseFloat(total).toFixed(2)}</Text> : null}
                  <View style={[styles.badge, { backgroundColor: color + '20' }]}>
                    <Text style={[styles.badgeText, { color }]}>{label}</Text>
                  </View>
                  {isActive && (
                    <View style={styles.activeDot} />
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#EDF2F7',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#1A202C' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyText: { color: '#A0AEC0', fontSize: 15, marginTop: 12, marginBottom: 20 },
  shopBtn: { backgroundColor: '#1A6A9A', borderRadius: 14, paddingHorizontal: 28, paddingVertical: 12 },
  shopBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  list: { padding: 16, gap: 10 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#F5F7FA', alignItems: 'center', justifyContent: 'center',
  },
  cardId: { fontSize: 14, fontWeight: '700', color: '#1A202C' },
  cardFecha: { fontSize: 12, color: '#718096', marginTop: 2 },
  cardItems: { fontSize: 11, color: '#A0AEC0', marginTop: 1 },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  cardTotal: { fontSize: 15, fontWeight: '800', color: '#1A6A9A' },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#27AE60', alignSelf: 'flex-end' },
});
