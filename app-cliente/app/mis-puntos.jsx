import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  ActivityIndicator, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import api from '../services/api';

function fecha(f) {
  try { return new Date(f).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return ''; }
}

export default function MisPuntosScreen() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await api.get('/delivery/cliente/puntos');
      setData(r.data);
    } catch { setData({ saldo: 0, puntosPorDolar: 10, movimientos: [] }); }
    finally { setCargando(false); setRefrescando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const renderMov = ({ item }) => {
    const gana = item.Puntos >= 0;
    return (
      <View style={styles.movRow}>
        <View style={[styles.movIcon, { backgroundColor: gana ? '#DCFCE7' : '#FEE2E2' }]}>
          <Ionicons name={gana ? 'add' : 'remove'} size={18} color={gana ? '#16A34A' : '#DC2626'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.movDesc}>{item.Descripcion || (gana ? 'Puntos ganados' : 'Puntos canjeados')}</Text>
          <Text style={styles.movFecha}>{fecha(item.FechaAlta)}</Text>
        </View>
        <Text style={[styles.movPts, { color: gana ? '#16A34A' : '#DC2626' }]}>
          {gana ? '+' : ''}{item.Puntos.toLocaleString('es-VE')}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mis Puntos VIDA</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Billetera */}
      <View style={styles.wallet}>
        <Ionicons name="star" size={26} color="#fff" />
        <Text style={styles.walletSaldo}>{(data?.saldo ?? 0).toLocaleString('es-VE')}</Text>
        <Text style={styles.walletLabel}>puntos disponibles</Text>
        {data?.puntosPorDolar ? (
          <Text style={styles.walletHint}>Ganas {data.puntosPorDolar} puntos por cada $1 en compras</Text>
        ) : null}
      </View>

      <Text style={styles.histTitle}>Historial</Text>
      {cargando ? (
        <ActivityIndicator style={{ marginTop: 30 }} color="#F59E0B" />
      ) : (
        <FlatList
          data={data?.movimientos || []}
          keyExtractor={(m) => String(m.idMovimiento)}
          renderItem={renderMov}
          contentContainerStyle={{ padding: 16, paddingTop: 4 }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="star-outline" size={40} color="#CBD5E0" />
              <Text style={styles.emptyText}>Aún no tienes movimientos.</Text>
              <Text style={styles.emptySub}>Haz tu primer pedido y empieza a ganar puntos.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  header: {
    backgroundColor: '#F59E0B', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn: { padding: 2 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  wallet: { backgroundColor: '#F59E0B', alignItems: 'center', paddingBottom: 24, paddingTop: 4 },
  walletSaldo: { color: '#fff', fontSize: 40, fontWeight: '900', marginTop: 4 },
  walletLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600' },
  walletHint: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 8 },
  histTitle: { fontSize: 13, fontWeight: '800', color: '#4A5568', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  movRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#EDF2F7',
  },
  movIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  movDesc: { fontSize: 14, fontWeight: '700', color: '#1A202C' },
  movFecha: { fontSize: 12, color: '#A0AEC0', marginTop: 2 },
  movPts: { fontSize: 16, fontWeight: '900' },
  empty: { alignItems: 'center', paddingVertical: 50, gap: 6 },
  emptyText: { fontSize: 14, fontWeight: '700', color: '#718096' },
  emptySub: { fontSize: 12, color: '#A0AEC0' },
});
