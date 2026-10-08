import { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Switch } from 'react-native';
import { Text } from '../components/Texto';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import api from '../services/api';
import { colores, fuentes, radios } from '../constants/tema';

const AZUL = colores.marino;

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
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} accessibilityLabel="Volver"><Ionicons name="chevron-back" size={22} color={colores.blanco} /></TouchableOpacity>
        <Text style={styles.headerTitle}>Mi hidratación</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Activar programa */}
        <View style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Programa de hidratación</Text>
            <Text style={styles.cardSub}>Cumple tu meta y gana puntos por rachas.</Text>
          </View>
          <Switch value={!!data?.activa} onValueChange={(v) => guardar({ activa: v })}
            trackColor={{ true: colores.celeste, false: colores.bordeFuerte }} thumbColor={colores.blanco} />
        </View>

        {data?.activa && (
          <>
            {/* Progreso de hoy */}
            <View style={styles.progressCard}>
              <View style={styles.anillo}>
                <Text style={styles.anilloNum}>{vasos}<Text style={styles.anilloMeta}>/{meta}</Text></Text>
                <Text style={styles.anilloLabel}>vasos · {data?.mlHoy || 0} ml</Text>
              </View>
              <View style={styles.barBg}><View style={[styles.barFill, { width: `${pct}%`, backgroundColor: cumplida ? colores.verde : colores.celeste }]} /></View>
              {cumplida && <Text style={styles.metaOk}>¡Meta de hoy cumplida!</Text>}
              {data?.racha > 0 && <Text style={styles.racha}>Racha de {data.racha} día{data.racha !== 1 ? 's' : ''} seguidos</Text>}
            </View>

            {/* Botón grande */}
            <TouchableOpacity style={styles.tomarBtn} onPress={tomarVaso} disabled={busy} activeOpacity={0.85}>
              <Ionicons name="water" size={24} color={colores.marino} />
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
                    <View style={[styles.bar, { height: alto, backgroundColor: ok ? colores.marino : colores.celeste }]} />
                    <Text style={styles.chartDia}>{diaCorto(h.fecha)}</Text>
                  </View>
                );
              })}
            </View>

            {/* Config meta */}
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Meta diaria</Text>
              <View style={styles.stepper}>
                <TouchableOpacity style={styles.stepBtn} onPress={() => guardar({ meta: Math.max(1, meta - 1) })} accessibilityLabel="Bajar meta"><Ionicons name="remove" size={20} color={AZUL} /></TouchableOpacity>
                <Text style={styles.stepVal}>{meta} vasos</Text>
                <TouchableOpacity style={styles.stepBtn} onPress={() => guardar({ meta: Math.min(20, meta + 1) })} accessibilityLabel="Subir meta"><Ionicons name="add" size={20} color={AZUL} /></TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {!data?.activa && (
          <View style={styles.empty}>
            <Ionicons name="water-outline" size={54} color={colores.celeste} />
            <Text style={styles.emptyText}>Activa el programa para empezar a registrar tu hidratación y ganar puntos.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },
  header: { backgroundColor: colores.marino, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  headerBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colores.blanco, fontSize: 18, fontWeight: '700' },
  card: { backgroundColor: colores.blanco, borderRadius: radios.grande, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colores.borde },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colores.marino },
  cardSub: { fontSize: 12, color: colores.textoSuave, marginTop: 2 },
  progressCard: { backgroundColor: colores.marino, borderRadius: radios.enorme, padding: 22, alignItems: 'center', marginTop: 12, gap: 14 },
  anillo: { width: 190, height: 190, borderRadius: 95, borderWidth: 16, borderColor: colores.celeste, alignItems: 'center', justifyContent: 'center' },
  anilloNum: { color: colores.blanco, fontSize: 48, fontFamily: fuentes.tituloFuerte },
  anilloMeta: { color: colores.sobreMarino, fontSize: 24, fontFamily: fuentes.titulo },
  anilloLabel: { color: colores.sobreMarino, fontSize: 13 },
  barBg: { width: '100%', height: 10, borderRadius: 5, backgroundColor: colores.marinoSuave, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5 },
  metaOk: { color: colores.verde, fontWeight: '800', fontSize: 15 },
  racha: { color: colores.blanco, fontWeight: '800' },
  tomarBtn: { backgroundColor: colores.celeste, borderRadius: 18, minHeight: 60, marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  tomarBtnText: { color: colores.marino, fontSize: 17, fontWeight: '800' },
  quitarBtn: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  quitarText: { color: colores.textoSuave, fontSize: 14, fontWeight: '700' },
  histTitle: { fontSize: 16, fontWeight: '800', color: colores.marino, marginTop: 14, marginBottom: 8 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', backgroundColor: colores.blanco, borderRadius: radios.grande, padding: 12, height: 140, borderWidth: 1, borderColor: colores.borde },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: 12, borderRadius: 6 },
  chartDia: { fontSize: 10, color: colores.textoSuave, fontWeight: '700' },
  metaCard: { backgroundColor: colores.blanco, borderRadius: radios.grande, padding: 16, marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colores.borde },
  metaLabel: { fontSize: 15, fontWeight: '800', color: colores.marino },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: colores.celesteClaro, alignItems: 'center', justifyContent: 'center' },
  stepVal: { fontSize: 16, fontWeight: '800', color: colores.marino, minWidth: 70, textAlign: 'center' },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { color: colores.textoSuave, textAlign: 'center', fontSize: 14, paddingHorizontal: 30 },
});
