import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import api from '../services/api';

const AZUL = '#2CA6C4';

function diaCorto(fecha) {
  try { return new Date(fecha + 'T00:00:00Z').toLocaleDateString('es-VE', { weekday: 'short', timeZone: 'UTC' }).slice(0, 2); }
  catch { return ''; }
}

export default function MiConsumoScreen() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await api.get('/delivery/cliente/hidratacion');
      setData(r.data);
    } catch { setData(null); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (cambios) => {
    const nuevo = { activa: data.activa, meta: data.meta, mlVaso: data.mlVaso, ...cambios };
    setData(d => ({ ...d, ...cambios }));
    try { await api.put('/delivery/cliente/hidratacion', nuevo); await cargar(); } catch {}
  };

  const tomarVaso = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.post('/delivery/cliente/hidratacion/vaso');
      setData(d => ({ ...d, vasosHoy: r.data.vasosHoy, mlHoy: r.data.mlHoy, racha: r.data.racha }));
      if (r.data.bonus > 0) {
        Alert.alert('¡Racha completada! 🔥', `Llevas ${r.data.racha} días cumpliendo tu meta.\nGanaste ${r.data.bonus} puntos VIDA. 💧`);
      }
      cargar();
    } catch {} finally { setBusy(false); }
  };

  const quitarVaso = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.post('/delivery/cliente/hidratacion/quitar');
      setData(d => ({ ...d, vasosHoy: r.data.vasosHoy, mlHoy: r.data.mlHoy }));
    } catch {} finally { setBusy(false); }
  };

  if (cargando) {
    return <SafeAreaView style={styles.container}><ActivityIndicator style={{ marginTop: 60 }} color={AZUL} /></SafeAreaView>;
  }

  const meta = data?.meta ?? 8;
  const vasos = data?.vasosHoy ?? 0;
  const pct = meta > 0 ? Math.min(100, Math.round((vasos / meta) * 100)) : 0;
  const cumplida = vasos >= meta;
  const maxHist = Math.max(meta, ...(data?.historial || []).map(h => h.vasos), 1);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Mi Consumo Vida</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Activar programa */}
        <View style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Programa de hidratación 💧</Text>
            <Text style={styles.cardSub}>Cumple tu meta y gana puntos por rachas.</Text>
          </View>
          <Switch value={!!data?.activa} onValueChange={(v) => guardar({ activa: v })}
            trackColor={{ true: AZUL }} />
        </View>

        {data?.activa && (
          <>
            {/* Progreso de hoy */}
            <View style={styles.progressCard}>
              <Text style={styles.progressPct}>{pct}%</Text>
              <Text style={styles.progressLabel}>{vasos} de {meta} vasos · {data?.mlHoy || 0} ml</Text>
              <View style={styles.barBg}><View style={[styles.barFill, { width: `${pct}%`, backgroundColor: cumplida ? '#5BBE6A' : '#fff' }]} /></View>
              {cumplida && <Text style={styles.metaOk}>¡Meta de hoy cumplida! 🎉</Text>}
              {data?.racha > 0 && <Text style={styles.racha}>🔥 {data.racha} día{data.racha !== 1 ? 's' : ''} seguidos</Text>}
            </View>

            {/* Botón grande */}
            <TouchableOpacity style={styles.tomarBtn} onPress={tomarVaso} disabled={busy} activeOpacity={0.85}>
              <Ionicons name="water" size={26} color="#fff" />
              <Text style={styles.tomarBtnText}>Tomé 1 vaso ({data?.mlVaso || 250} ml)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quitarBtn} onPress={quitarVaso} disabled={busy || vasos === 0}>
              <Text style={[styles.quitarText, (vasos === 0) && { opacity: 0.4 }]}>Quitar un vaso</Text>
            </TouchableOpacity>

            {/* Gráfica últimos días */}
            <Text style={styles.histTitle}>Últimos 14 días</Text>
            <View style={styles.chart}>
              {(data?.historial || []).map((h, i) => {
                const alto = Math.max(4, Math.round((h.vasos / maxHist) * 90));
                const ok = h.vasos >= meta;
                return (
                  <View key={i} style={styles.chartCol}>
                    <View style={[styles.bar, { height: alto, backgroundColor: ok ? '#5BBE6A' : '#BEE3F8' }]} />
                    <Text style={styles.chartDia}>{diaCorto(h.fecha)}</Text>
                  </View>
                );
              })}
            </View>

            {/* Config meta */}
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Meta diaria</Text>
              <View style={styles.stepper}>
                <TouchableOpacity style={styles.stepBtn} onPress={() => guardar({ meta: Math.max(1, meta - 1) })}><Ionicons name="remove" size={20} color={AZUL} /></TouchableOpacity>
                <Text style={styles.stepVal}>{meta} vasos</Text>
                <TouchableOpacity style={styles.stepBtn} onPress={() => guardar({ meta: Math.min(20, meta + 1) })}><Ionicons name="add" size={20} color={AZUL} /></TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {!data?.activa && (
          <View style={styles.empty}>
            <Ionicons name="water-outline" size={54} color="#BEE3F8" />
            <Text style={styles.emptyText}>Activa el programa para empezar a registrar tu hidratación y ganar puntos.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F9FF' },
  header: { backgroundColor: AZUL, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#1A202C' },
  cardSub: { fontSize: 12, color: '#718096', marginTop: 2 },
  progressCard: { backgroundColor: AZUL, borderRadius: 20, padding: 20, alignItems: 'center', marginTop: 12 },
  progressPct: { color: '#fff', fontSize: 46, fontWeight: '900' },
  progressLabel: { color: 'rgba(255,255,255,0.95)', fontSize: 14, fontWeight: '600', marginBottom: 10 },
  barBg: { width: '100%', height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  barFill: { height: 12, borderRadius: 6 },
  metaOk: { color: '#fff', fontWeight: '800', marginTop: 10 },
  racha: { color: '#FEF3C7', fontWeight: '800', marginTop: 6 },
  tomarBtn: { backgroundColor: AZUL, borderRadius: 16, paddingVertical: 18, marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  tomarBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  quitarBtn: { alignItems: 'center', paddingVertical: 10 },
  quitarText: { color: '#718096', fontSize: 13, fontWeight: '600' },
  histTitle: { fontSize: 13, fontWeight: '800', color: '#4A5568', marginTop: 16, marginBottom: 8 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 16, padding: 12, height: 130, borderWidth: 1, borderColor: '#E2E8F0' },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: 10, borderRadius: 5 },
  chartDia: { fontSize: 9, color: '#A0AEC0' },
  metaCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#E2E8F0' },
  metaLabel: { fontSize: 14, fontWeight: '700', color: '#1A202C' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EBF8FF', alignItems: 'center', justifyContent: 'center' },
  stepVal: { fontSize: 15, fontWeight: '800', color: '#1A202C', minWidth: 70, textAlign: 'center' },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { color: '#718096', textAlign: 'center', fontSize: 14, paddingHorizontal: 30 },
});
