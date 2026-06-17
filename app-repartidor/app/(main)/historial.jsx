import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';

const COLORS = {
  primary: '#1A6A9A',
  green: '#27AE60',
  fondo: '#F5F7FA',
  texto: '#1A202C',
  texto2: '#718096',
  card: '#FFFFFF',
};

function BadgeMetodo({ metodo }) {
  const cfg = metodo === 'EFECTIVO'
    ? { color: '#27AE60', bg: '#F0FFF4', label: 'Efectivo' }
    : { color: '#1A6A9A', bg: '#EBF8FF', label: 'Tarjeta' };
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function ItemPedido({ item }) {
  const fecha = new Date(item.FechaAlta).toLocaleDateString('es-VE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const comision = item.ComisionRepartidor ? Number(item.ComisionRepartidor) : 0;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.pedidoId}>Pedido #{item.idPedido}</Text>
        <BadgeMetodo metodo={item.MetodoPago} />
      </View>
      <Text style={styles.fecha}>{fecha}</Text>
      {item.DireccionEntrega ? (
        <View style={styles.direccionRow}>
          <Ionicons name="location-outline" size={14} color={COLORS.texto2} />
          <Text style={styles.direccion} numberOfLines={1}>{item.DireccionEntrega}</Text>
        </View>
      ) : null}
      <View style={styles.cardFooter}>
        <View>
          <Text style={styles.labelSmall}>Total pedido</Text>
          <Text style={styles.total}>${Number(item.TotalUSD).toFixed(2)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.labelSmall}>Tu comisión</Text>
          <Text style={[styles.comision, { color: COLORS.green }]}>
            +${comision.toFixed(2)}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function Historial() {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalHoy, setTotalHoy] = useState(0);

  const cargar = useCallback(async (p = 1, reset = false) => {
    try {
      const r = await api.get(`/delivery/repartidor/historial?page=${p}&limit=20`);
      const data = r.data.data || [];
      setPedidos(prev => reset ? data : [...prev, ...data]);
      setHasMore(data.length === 20);
      setPage(p);

      if (reset || p === 1) {
        const hoy = new Date().toDateString();
        const comisionHoy = data
          .filter(d => new Date(d.FechaAlta).toDateString() === hoy)
          .reduce((acc, d) => acc + Number(d.ComisionRepartidor || 0), 0);
        setTotalHoy(comisionHoy);
      }
    } catch {
      // silencioso
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { cargar(1, true); }, [cargar]);

  const onRefresh = () => {
    setRefreshing(true);
    cargar(1, true);
  };

  const onEndReached = () => {
    if (hasMore && !loading) cargar(page + 1);
  };

  if (loading && pedidos.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Resumen del día */}
      <View style={styles.resumenCard}>
        <Text style={styles.resumenLabel}>Ganado hoy</Text>
        <Text style={styles.resumenMonto}>${totalHoy.toFixed(2)}</Text>
        <Text style={styles.resumenSub}>{pedidos.length} entregas en historial</Text>
      </View>

      <FlatList
        data={pedidos}
        keyExtractor={item => String(item.idPedido)}
        renderItem={({ item }) => <ItemPedido item={item} />}
        contentContainerStyle={styles.lista}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          hasMore ? <ActivityIndicator style={{ margin: 16 }} color={COLORS.primary} /> : null
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="bag-check-outline" size={56} color={COLORS.texto2} />
            <Text style={styles.emptyText}>No tienes entregas aún</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.fondo },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  resumenCard: {
    margin: 16, padding: 20, backgroundColor: COLORS.primary,
    borderRadius: 16, alignItems: 'center',
  },
  resumenLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  resumenMonto: { color: '#fff', fontSize: 36, fontWeight: 'bold', marginVertical: 4 },
  resumenSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  lista: { paddingHorizontal: 16, paddingBottom: 32 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 12, padding: 16,
    marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  pedidoId: { fontSize: 15, fontWeight: '700', color: COLORS.texto },
  fecha: { fontSize: 12, color: COLORS.texto2, marginBottom: 6 },
  direccionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  direccion: { flex: 1, fontSize: 13, color: COLORS.texto2 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 10 },
  labelSmall: { fontSize: 11, color: COLORS.texto2, marginBottom: 2 },
  total: { fontSize: 18, fontWeight: '700', color: COLORS.texto },
  comision: { fontSize: 18, fontWeight: '700' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  emptyText: { marginTop: 12, color: COLORS.texto2, fontSize: 15 },
});
