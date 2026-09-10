import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  Image, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';

export default function MiClubScreen() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const r = await api.get('/delivery/cliente/membresia');
      setData(r.data);
    } catch { setData(null); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) {
    return <SafeAreaView style={styles.container}><ActivityIndicator style={{ marginTop: 60 }} color="#0A1E3F" /></SafeAreaView>;
  }

  const color = data?.color || '#0A1E3F';
  const sig = data?.siguiente;
  const ganados = data?.puntosGanados || 0;
  // progreso hacia el siguiente nivel
  let pct = 100;
  if (sig) {
    const base = data.niveles?.find(n => n.nivel === data.nivel)?.minPuntos || 0;
    const span = Math.max(1, sig.minPuntos - base);
    pct = Math.min(100, Math.round(((ganados - base) / span) * 100));
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={[styles.header, { backgroundColor: color }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Club Vida</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Tarjeta digital */}
        <LinearGradient colors={[color, '#0A1E3F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
          <View style={styles.cardTop}>
            <View>
              <Text style={styles.brand}>VIDA</Text>
              <Text style={styles.cardKind}>CLUB DIGITAL</Text>
            </View>
            <View style={styles.nivelBadge}><Text style={styles.nivelBadgeText}>Nivel {data?.nivel}</Text></View>
          </View>

          <View style={styles.cardBody}>
            {data?.qrDataUrl ? (
              <Image source={{ uri: data.qrDataUrl }} style={styles.qr} />
            ) : (
              <View style={[styles.qr, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
            )}
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.nombre} numberOfLines={2}>{data?.nombre || 'Miembro VIDA'}</Text>
              <Text style={styles.nivelNombre}>{data?.nombreNivel}</Text>
              <Text style={styles.codigo}>{data?.codigoMembresia}</Text>
            </View>
          </View>
          <Text style={styles.cardHint}>Muestra este QR en tu tienda VIDA</Text>
        </LinearGradient>

        {/* Progreso al siguiente nivel */}
        <View style={styles.block}>
          {sig ? (
            <>
              <View style={styles.rowBetween}>
                <Text style={styles.blockTitle}>Progreso a {sig.nombre}</Text>
                <Text style={styles.blockPts}>{ganados.toLocaleString('es-VE')} pts</Text>
              </View>
              <View style={styles.barBg}><View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} /></View>
              <Text style={styles.faltan}>Te faltan {sig.faltan.toLocaleString('es-VE')} puntos para {sig.nombre}</Text>
            </>
          ) : (
            <Text style={styles.blockTitle}>🏆 ¡Alcanzaste el nivel máximo!</Text>
          )}
        </View>

        {/* Beneficios del nivel actual */}
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Tus beneficios</Text>
          <Text style={styles.beneficios}>{data?.beneficios}</Text>
        </View>

        {/* Escalera de niveles */}
        <Text style={styles.laddTitle}>Niveles del club</Text>
        {(data?.niveles || []).map(n => {
          const activo = n.nivel === data?.nivel;
          const alcanzado = ganados >= n.minPuntos;
          return (
            <View key={n.nivel} style={[styles.nivelRow, activo && { borderColor: color, borderWidth: 2 }]}>
              <View style={[styles.dot, { backgroundColor: alcanzado ? (n.color || color) : '#E2E8F0' }]}>
                <Text style={styles.dotText}>{n.nivel}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nivelRowName}>{n.nombre}{activo ? ' · actual' : ''}</Text>
                <Text style={styles.nivelRowBen} numberOfLines={2}>{n.beneficios}</Text>
              </View>
              <Text style={styles.nivelRowPts}>{n.minPuntos.toLocaleString('es-VE')}</Text>
            </View>
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  card: { borderRadius: 20, padding: 20, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brand: { color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: 2 },
  cardKind: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700', letterSpacing: 3 },
  nivelBadge: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  nivelBadgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  cardBody: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  qr: { width: 96, height: 96, borderRadius: 10, backgroundColor: '#fff' },
  nombre: { color: '#fff', fontSize: 18, fontWeight: '800' },
  nivelNombre: { color: 'rgba(255,255,255,0.95)', fontSize: 14, fontWeight: '700', marginTop: 2 },
  codigo: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontFamily: 'monospace', marginTop: 8, letterSpacing: 1 },
  cardHint: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 16, textAlign: 'center' },
  block: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 12, borderWidth: 1, borderColor: '#EDF2F7' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  blockTitle: { fontSize: 14, fontWeight: '800', color: '#1A202C' },
  blockPts: { fontSize: 13, fontWeight: '800', color: '#4A5568' },
  barBg: { height: 10, borderRadius: 5, backgroundColor: '#EDF2F7', overflow: 'hidden', marginTop: 8 },
  barFill: { height: 10, borderRadius: 5 },
  faltan: { fontSize: 12, color: '#718096', marginTop: 6 },
  beneficios: { fontSize: 13, color: '#4A5568', marginTop: 6, lineHeight: 20 },
  laddTitle: { fontSize: 13, fontWeight: '800', color: '#4A5568', marginTop: 18, marginBottom: 8 },
  nivelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#EDF2F7' },
  dot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dotText: { color: '#fff', fontWeight: '900' },
  nivelRowName: { fontSize: 14, fontWeight: '700', color: '#1A202C' },
  nivelRowBen: { fontSize: 11, color: '#A0AEC0', marginTop: 1 },
  nivelRowPts: { fontSize: 12, fontWeight: '700', color: '#718096' },
});
