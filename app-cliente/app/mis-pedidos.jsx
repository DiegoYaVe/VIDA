import { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, FlatList, SafeAreaView, ActivityIndicator } from 'react-native';
import { Text } from '../components/Texto';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import api from '../services/api';
import { colores, fuentes, radios } from '../constants/tema';
import useAuthStore from '../store/authStore';
import { montoVESDelPedido } from '../services/moneda';

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
  REPARTIDOR_ASIGNADO: '#62C6DE',
  IR_A_SUCURSAL:       '#9F7AEA',
  EN_SUCURSAL:         '#667EEA',
  EN_CAMINO:           '#001034',
  ENTREGADO:           '#4DAD66',
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Volver">
          <Ionicons name="chevron-back" size={22} color={colores.marino} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mis pedidos</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#001034" />
        </View>
      ) : pedidos.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="receipt-outline" size={56} color="#CFE4EB" />
          <Text style={styles.emptyText}>No tienes pedidos aún</Text>
          <TouchableOpacity style={styles.shopBtn} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.shopBtnText}>Ir a comprar</Text>
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
            const color = STATUS_COLORS[rawStatus] ?? '#4B5B73';
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
                  {montoVESDelPedido(item) ? <Text style={{fontSize: 11, color: '#4B5B73', marginTop: 1}}>{montoVESDelPedido(item)}</Text> : null}
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
  container: { flex: 1, backgroundColor: colores.fondo },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colores.marino },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyText: { color: colores.textoSuave, fontSize: 15, marginTop: 12, marginBottom: 20 },
  shopBtn: { backgroundColor: colores.marino, borderRadius: radios.medio, paddingHorizontal: 28, minHeight: 50, justifyContent: 'center' },
  shopBtnText: { color: colores.blanco, fontWeight: '800', fontSize: 15 },
  list: { padding: 16, gap: 10 },
  card: {
    backgroundColor: colores.blanco, borderRadius: radios.grande, padding: 14,
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colores.borde,
  },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIconWrap: { width: 46, height: 46, borderRadius: 14, backgroundColor: colores.celesteClaro, alignItems: 'center', justifyContent: 'center' },
  cardId: { fontSize: 15, fontWeight: '800', color: colores.marino },
  cardFecha: { fontSize: 12, color: colores.textoSuave, marginTop: 2 },
  cardItems: { fontSize: 12, color: colores.textoSuave, marginTop: 1 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  cardTotal: { fontSize: 16, color: colores.marino, fontFamily: fuentes.titulo },
  badge: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  activeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colores.celeste, alignSelf: 'flex-end' },
});
