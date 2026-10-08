import { View, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { Text } from '../components/Texto';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

export default function TarjetasScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#001034" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mis tarjetas</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.center}>
        <Ionicons name="card-outline" size={60} color="#CFE4EB" />
        <Text style={styles.title}>Próximamente</Text>
        <Text style={styles.sub}>
          Podrás guardar tus métodos de pago para comprar más rápido.{'\n'}
          Por ahora los pagos se realizan al momento de la entrega.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F9FB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E6F1F5',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#001034' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  title: { fontSize: 20, fontWeight: '800', color: '#001034', marginTop: 16, marginBottom: 10 },
  sub: { fontSize: 14, color: '#4B5B73', textAlign: 'center', lineHeight: 22 },
});
