import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import useCarritoStore from '../../store/carritoStore';

export default function SucursalesScreen() {
  const [sucursales, setSucursales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const router = useRouter();
  const { cliente, idBranch, idCuenta } = useAuthStore();
  const setSucursal = useCarritoStore((s) => s.setSucursal);

  const fetchSucursales = useCallback(async () => {
    try {
      setError('');
      const res = await api.get('/delivery/sucursales', {
        params: { idBranch, idCuenta },
      });
      setSucursales(res.data?.sucursales ?? res.data ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [idBranch, idCuenta]);

  useEffect(() => {
    fetchSucursales();
  }, [fetchSucursales]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSucursales();
  };

  const handleSucursal = (item) => {
    setSucursal(item.idPuntoVenta ?? item.id, item.Nombre ?? item.nombre);
    router.push(`/sucursal/${item.idPuntoVenta ?? item.id}`);
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => handleSucursal(item)} activeOpacity={0.7}>
      <View style={styles.cardLeft}>
        <View style={styles.iconCircle}>
          <Ionicons name="storefront" size={28} color="#1A6A9A" />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{item.Nombre ?? item.nombre}</Text>
          <Text style={styles.cardAddress} numberOfLines={1}>
            {item.Direccion ?? item.Ciudad ?? item.direccion ?? 'Venezuela'}
          </Text>
          <View style={styles.statusRow}>
            <View style={styles.dot} />
            <Text style={styles.statusText}>Abierto</Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#CBD5E0" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>¿Dónde compramos hoy?</Text>
          {cliente && (
            <Text style={styles.headerSub}>Hola, {cliente.Nombre ?? 'amigo'} 👋</Text>
          )}
        </View>
        <View style={styles.logoSmall}>
          <Text style={styles.logoSmallText}>VIDA</Text>
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A6A9A" />
          <Text style={styles.loadingText}>Cargando tiendas...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={56} color="#CBD5E0" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchSucursales}>
            <Text style={styles.retryBtnText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sucursales}
          keyExtractor={(item) => String(item.idPuntoVenta ?? item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#1A6A9A"
              colors={['#1A6A9A']}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="storefront-outline" size={56} color="#CBD5E0" />
              <Text style={styles.emptyText}>No hay tiendas disponibles</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#1A202C' },
  headerSub: { fontSize: 13, color: '#718096', marginTop: 2 },
  logoSmall: {
    backgroundColor: '#1A6A9A',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  logoSmallText: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 3 },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 4,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#EBF8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: '#1A202C' },
  cardAddress: { fontSize: 13, color: '#718096', marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#27AE60', marginRight: 5 },
  statusText: { fontSize: 12, color: '#27AE60', fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingTop: 80 },
  loadingText: { marginTop: 12, color: '#718096', fontSize: 14 },
  errorText: { color: '#E53E3E', textAlign: 'center', marginTop: 12, fontSize: 14 },
  emptyText: { color: '#A0AEC0', marginTop: 12, fontSize: 15 },
  retryBtn: {
    marginTop: 16,
    backgroundColor: '#1A6A9A',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryBtnText: { color: '#fff', fontWeight: '700' },
});
