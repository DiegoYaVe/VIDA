import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import api from '../services/api';

const AMBAR = '#F59E0B';
const ESTADO_COLOR = { PENDIENTE: '#F59E0B', ENTREGADO: '#16A34A', CANCELADO: '#DC2626' };

export default function PremiosScreen() {
  const router = useRouter();
  const [saldo, setSaldo] = useState(0);
  const [mesesVence, setMesesVence] = useState(0);
  const [premios, setPremios] = useState([]);
  const [canjes, setCanjes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [proc, setProc] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        api.get('/delivery/cliente/premios'),
        api.get('/delivery/cliente/premios/canjes'),
      ]);
      setSaldo(p.data?.saldo ?? 0);
      setMesesVence(p.data?.mesesVence ?? 0);
      setPremios(p.data?.premios ?? []);
      setCanjes(c.data ?? []);
    } catch {} finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const canjear = (premio) => {
    Alert.alert('Canjear premio', `${premio.Nombre}\nCuesta ${premio.CostoPuntos.toLocaleString('es-VE')} puntos.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Canjear', onPress: async () => {
        setProc(premio.idPremio);
        try {
          const r = await api.post(`/delivery/cliente/premios/${premio.idPremio}/canjear`);
          Alert.alert('¡Canje exitoso! 🎁', `${premio.Nombre}\nCódigo: ${r.data.codigo}\n\nMuéstralo en tu tienda VIDA para reclamarlo.`);
          cargar();
        } catch (e) {
          Alert.alert('No se pudo canjear', e.response?.data?.error || 'Intenta de nuevo.');
        } finally { setProc(null); }
      } },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Premios</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.saldoBar}>
        <Ionicons name="star" size={18} color="#fff" />
        <Text style={styles.saldoText}>{saldo.toLocaleString('es-VE')} puntos disponibles</Text>
      </View>

      {cargando ? <ActivityIndicator style={{ marginTop: 40 }} color={AMBAR} /> : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {premios.map(p => {
            const alcanza = saldo >= p.CostoPuntos;
            const agotado = p.Stock === 0;
            return (
              <View key={p.idPremio} style={styles.card}>
                <View style={styles.cardIco}><Ionicons name="gift" size={24} color={AMBAR} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{p.Nombre}</Text>
                  {p.Descripcion ? <Text style={styles.cardDesc}>{p.Descripcion}</Text> : null}
                  <Text style={styles.cardCosto}>{p.CostoPuntos.toLocaleString('es-VE')} pts{p.Stock > 0 ? ` · ${p.Stock} disp.` : ''}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.btn, (!alcanza || agotado || proc === p.idPremio) && styles.btnOff]}
                  disabled={!alcanza || agotado || proc === p.idPremio}
                  onPress={() => canjear(p)}>
                  <Text style={styles.btnText}>{agotado ? 'Agotado' : !alcanza ? 'Faltan pts' : proc === p.idPremio ? '...' : 'Canjear'}</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {mesesVence > 0 && (
            <Text style={styles.vence}>💡 Tus puntos vencen tras {mesesVence} meses sin actividad.</Text>
          )}

          {canjes.length > 0 && (
            <>
              <Text style={styles.histTitle}>Mis canjes</Text>
              {canjes.map(c => (
                <View key={c.idCanje} style={styles.canjeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.canjeName}>{c.NombrePremio}</Text>
                    <Text style={styles.canjeCod}>{c.Codigo} · {c.CostoPuntos} pts</Text>
                  </View>
                  <Text style={[styles.canjeEstado, { color: ESTADO_COLOR[c.Status] || '#718096' }]}>{c.Status}</Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  header: { backgroundColor: AMBAR, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  saldoBar: { backgroundColor: AMBAR, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 14 },
  saldoText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#EDF2F7' },
  cardIco: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  cardName: { fontSize: 14, fontWeight: '800', color: '#1A202C' },
  cardDesc: { fontSize: 12, color: '#718096', marginTop: 1 },
  cardCosto: { fontSize: 12, fontWeight: '700', color: AMBAR, marginTop: 3 },
  btn: { backgroundColor: AMBAR, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  btnOff: { backgroundColor: '#CBD5E0' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  vence: { fontSize: 12, color: '#718096', textAlign: 'center', marginTop: 8, marginBottom: 4 },
  histTitle: { fontSize: 13, fontWeight: '800', color: '#4A5568', marginTop: 16, marginBottom: 8 },
  canjeRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#EDF2F7' },
  canjeName: { fontSize: 13, fontWeight: '700', color: '#1A202C' },
  canjeCod: { fontSize: 11, color: '#A0AEC0', marginTop: 2 },
  canjeEstado: { fontSize: 11, fontWeight: '800' },
});
