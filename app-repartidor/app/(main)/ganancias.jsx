import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';

const C = {
  primary: '#1A6A9A',
  green: '#27AE60',
  orange: '#E67E22',
  purple: '#7B3FBE',
  bg: '#F5F7FA',
  card: '#FFFFFF',
  texto: '#1A202C',
  texto2: '#718096',
};

// ---------- Periodos ----------
const PERIODOS = [
  { key: 'hoy',    label: 'Hoy' },
  { key: 'semana', label: '7 días' },
  { key: 'mes',    label: '30 días' },
];

// ---------- Resumen card ----------
function ResumenCard({ icon, label, value, color, sub }) {
  return (
    <View style={[styles.resumenCard, { borderTopColor: color }]}>
      <View style={[styles.resumenIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.resumenLabel}>{label}</Text>
      <Text style={[styles.resumenValue, { color }]}>{value}</Text>
      {sub ? <Text style={styles.resumenSub}>{sub}</Text> : null}
    </View>
  );
}

export default function GananciasScreen() {
  const [periodo, setPeriodo] = useState('hoy');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [pedidos, setPedidos] = useState([]);

  const cargar = useCallback(async () => {
    try {
      // Reutilizamos el historial para calcular las estadísticas
      const [resHist, resPerf] = await Promise.all([
        api.get('/delivery/repartidor/historial?page=1&limit=100'),
        api.get('/delivery/repartidor/perfil'),
      ]);

      const todos = resHist.data.data || [];
      const perfil = resPerf.data || {};

      const ahora = new Date();
      const hoyStr = ahora.toDateString();
      const hace7  = new Date(ahora); hace7.setDate(ahora.getDate() - 7);
      const hace30 = new Date(ahora); hace30.setDate(ahora.getDate() - 30);

      const sumar = (lista) => lista.reduce((acc, d) => acc + Number(d.ComisionRepartidor || 0), 0);
      const contar = (lista) => lista.length;

      const listHoy    = todos.filter(d => new Date(d.FechaAlta).toDateString() === hoyStr);
      const listSemana = todos.filter(d => new Date(d.FechaAlta) >= hace7);
      const listMes    = todos.filter(d => new Date(d.FechaAlta) >= hace30);

      // Efectivo pendiente de entregar (saldo de pedidos de hoy en efectivo no ENTREGADO aún)
      // Lo aproximamos con los del día en efectivo — el backend ideal lo daría exacto
      const saldoEfectivo = listHoy
        .filter(d => (d.MetodoPago || '').toLowerCase().includes('efectivo'))
        .reduce((acc, d) => acc + Number(d.TotalUSD || 0), 0);

      setStats({
        hoy:     { ganancia: sumar(listHoy),    pedidos: contar(listHoy)    },
        semana:  { ganancia: sumar(listSemana),  pedidos: contar(listSemana) },
        mes:     { ganancia: sumar(listMes),     pedidos: contar(listMes)    },
        total:   { ganancia: sumar(todos),       pedidos: contar(todos)      },
        saldoEfectivo,
        calificacion: perfil.Calificacion ?? null,
      });

      // Mostramos los últimos 15 para la tabla de movimientos
      setPedidos(todos.slice(0, 15));
    } catch (_) {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const onRefresh = () => { setRefreshing(true); cargar(); };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  const sel = stats?.[periodo] || { ganancia: 0, pedidos: 0 };
  const periodoLabel = PERIODOS.find(p => p.key === periodo)?.label || '';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mis ganancias</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} />}
      >
        {/* Hero principal */}
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Ganancia — {periodoLabel}</Text>
          <Text style={styles.heroMonto}>${sel.ganancia.toFixed(2)}</Text>
          <Text style={styles.heroPedidos}>{sel.pedidos} pedidos entregados</Text>

          {/* Selector de periodo */}
          <View style={styles.periodoRow}>
            {PERIODOS.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[styles.periodoBtn, periodo === p.key && styles.periodoBtnActive]}
                onPress={() => setPeriodo(p.key)}
              >
                <Text style={[styles.periodoBtnText, periodo === p.key && styles.periodoBtnTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Resumen rápido */}
        <View style={styles.resumenGrid}>
          <ResumenCard
            icon="cash-outline"
            label="Efectivo a entregar"
            value={`$${(stats?.saldoEfectivo || 0).toFixed(2)}`}
            color={C.orange}
            sub="Cobrado hoy en efectivo"
          />
          <ResumenCard
            icon="star"
            label="Tu calificación"
            value={stats?.calificacion ? `${Number(stats.calificacion).toFixed(1)} ★` : '–'}
            color="#F6AD55"
            sub="Promedio clientes"
          />
        </View>

        <View style={styles.resumenGrid}>
          <ResumenCard
            icon="bicycle-outline"
            label="Total histórico"
            value={`${stats?.total?.pedidos || 0}`}
            color={C.purple}
            sub="pedidos entregados"
          />
          <ResumenCard
            icon="trending-up-outline"
            label="Comisión total"
            value={`$${(stats?.total?.ganancia || 0).toFixed(2)}`}
            color={C.green}
            sub="Acumulado"
          />
        </View>

        {/* Últimos movimientos */}
        <Text style={styles.sectionTitle}>Últimos movimientos</Text>
        {pedidos.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="wallet-outline" size={48} color={C.texto2} />
            <Text style={styles.emptyText}>Sin movimientos aún</Text>
          </View>
        ) : (
          <View style={styles.listaCard}>
            {pedidos.map((p, i) => {
              const comision = Number(p.ComisionRepartidor || 0);
              const esEfectivo = (p.MetodoPago || '').toLowerCase().includes('efectivo');
              const fecha = new Date(p.FechaAlta).toLocaleDateString('es-VE', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              });
              return (
                <View key={p.idPedido} style={[styles.movRow, i > 0 && styles.movDivider]}>
                  <View style={[styles.movIcon, { backgroundColor: esEfectivo ? '#F0FFF4' : '#EBF8FF' }]}>
                    <Ionicons
                      name={esEfectivo ? 'cash-outline' : 'card-outline'}
                      size={18}
                      color={esEfectivo ? C.green : C.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.movTitle}>Pedido #{p.idPedido}</Text>
                    <Text style={styles.movFecha}>{fecha}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.movComision}>+${comision.toFixed(2)}</Text>
                    <Text style={styles.movTotal}>${Number(p.TotalUSD || 0).toFixed(2)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#EDF2F7',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: C.texto },
  scroll: { padding: 16, paddingBottom: 40, gap: 14 },

  hero: {
    backgroundColor: C.primary, borderRadius: 20, padding: 24,
    alignItems: 'center',
    shadowColor: C.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 14, elevation: 6,
  },
  heroLabel:   { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 4 },
  heroMonto:   { color: '#fff', fontSize: 48, fontWeight: '900' },
  heroPedidos: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 4 },
  periodoRow:  { flexDirection: 'row', marginTop: 20, gap: 8 },
  periodoBtn: {
    paddingHorizontal: 18, paddingVertical: 7,
    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)',
  },
  periodoBtnActive: { backgroundColor: '#fff' },
  periodoBtnText:   { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  periodoBtnTextActive: { color: C.primary, fontWeight: '700' },

  resumenGrid: { flexDirection: 'row', gap: 12 },
  resumenCard: {
    flex: 1, backgroundColor: C.card, borderRadius: 16, padding: 16,
    borderTopWidth: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  resumenIcon:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  resumenLabel: { fontSize: 12, color: C.texto2, fontWeight: '600', marginBottom: 4 },
  resumenValue: { fontSize: 22, fontWeight: '800' },
  resumenSub:   { fontSize: 11, color: C.texto2, marginTop: 2 },

  sectionTitle: { fontSize: 12, fontWeight: '700', color: C.texto2, textTransform: 'uppercase', letterSpacing: 0.8, marginLeft: 2 },
  listaCard: {
    backgroundColor: C.card, borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  movRow:     { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  movDivider: { borderTopWidth: 1, borderTopColor: '#F5F7FA' },
  movIcon:    { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  movTitle:   { fontSize: 14, fontWeight: '600', color: C.texto },
  movFecha:   { fontSize: 11, color: C.texto2, marginTop: 1 },
  movComision: { fontSize: 15, fontWeight: '700', color: C.green },
  movTotal:   { fontSize: 11, color: C.texto2, marginTop: 1 },
  empty:      { alignItems: 'center', paddingVertical: 32 },
  emptyText:  { marginTop: 12, color: C.texto2, fontSize: 15 },
});
