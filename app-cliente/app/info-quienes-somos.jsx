import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

export default function QuienesSomosScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1A202C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Quiénes somos</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.logoWrap}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>VIDA</Text>
          </View>
          <Text style={styles.logoSub}>Delivery</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nuestra misión</Text>
          <Text style={styles.cardBody}>
            VIDA Delivery nace con el propósito de conectar a las personas con los mejores
            negocios locales, llevando productos frescos y de calidad directamente a tu puerta
            de forma rápida, segura y confiable.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nuestra visión</Text>
          <Text style={styles.cardBody}>
            Ser la plataforma de delivery más confiable de Venezuela, impulsando el comercio
            local y generando oportunidades de trabajo para nuestros repartidores.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nuestros valores</Text>
          {[
            { icon: '⚡', title: 'Rapidez', desc: 'Entregamos en el menor tiempo posible.' },
            { icon: '🤝', title: 'Confianza', desc: 'Transparencia en cada pedido.' },
            { icon: '🌱', title: 'Compromiso', desc: 'Con la comunidad y el comercio local.' },
            { icon: '💡', title: 'Innovación', desc: 'Mejoramos continuamente para darte la mejor experiencia.' },
          ].map((v, i) => (
            <View key={i} style={styles.valueItem}>
              <Text style={styles.valueEmoji}>{v.icon}</Text>
              <View>
                <Text style={styles.valueTitle}>{v.title}</Text>
                <Text style={styles.valueDesc}>{v.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.version}>VIDA Delivery · v1.0.0</Text>
      </ScrollView>
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
  scroll: { padding: 16, paddingBottom: 40, gap: 16 },
  logoWrap: { alignItems: 'center', paddingVertical: 24 },
  logoCircle: {
    width: 88, height: 88, borderRadius: 24,
    backgroundColor: '#1A6A9A', alignItems: 'center', justifyContent: 'center',
  },
  logoText: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  logoSub: { fontSize: 14, color: '#718096', marginTop: 8, letterSpacing: 3 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#1A202C', marginBottom: 10 },
  cardBody: { fontSize: 14, color: '#718096', lineHeight: 22 },
  valueItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 14 },
  valueEmoji: { fontSize: 24, width: 32, textAlign: 'center' },
  valueTitle: { fontSize: 14, fontWeight: '700', color: '#1A202C' },
  valueDesc: { fontSize: 13, color: '#718096', marginTop: 2 },
  version: { textAlign: 'center', fontSize: 12, color: '#CBD5E0', marginTop: 8 },
});
