import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import useAuthStore from '../../store/authStore';

const COLORS = {
  primary: '#1A6A9A',
  green: '#27AE60',
  red: '#E53E3E',
  fondo: '#F5F7FA',
  texto: '#1A202C',
  texto2: '#718096',
  card: '#FFFFFF',
};

function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={COLORS.primary} style={styles.infoIcon} />
      <View>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value || '—'}</Text>
      </View>
    </View>
  );
}

export default function Perfil() {
  const { repartidor, logout } = useAuthStore();
  const router = useRouter();

  const initials = repartidor?.Nombre
    ? repartidor.Nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'R';

  const saldo = Number(repartidor?.SaldoPendiente || 0);

  const handleLogout = () => {
    Alert.alert(
      'Cerrar sesión',
      '¿Seguro que quieres salir?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir', style: 'destructive',
          onPress: () => { logout(); router.replace('/login'); },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.nombre}>{repartidor?.Nombre}</Text>
        <Text style={styles.subtitulo}>Repartidor</Text>
      </View>

      {/* Info personal */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Información personal</Text>
        <InfoRow icon="call-outline" label="Teléfono" value={repartidor?.Telefono} />
        <InfoRow icon="bicycle-outline" label="Vehículo" value={repartidor?.Vehiculo} />
        <InfoRow icon="car-outline" label="Placa" value={repartidor?.PlacaVehiculo} />
      </View>

      {/* Saldo pendiente */}
      {saldo > 0 && (
        <View style={[styles.card, styles.saldoCard]}>
          <Ionicons name="wallet-outline" size={24} color={COLORS.red} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.saldoLabel}>Efectivo pendiente de entregar</Text>
            <Text style={styles.saldoMonto}>${saldo.toFixed(2)}</Text>
          </View>
        </View>
      )}

      {/* Comisión */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Comisión</Text>
        <View style={styles.comisionRow}>
          <Text style={styles.comisionLabel}>Porcentaje asignado</Text>
          <Text style={styles.comisionVal}>
            {repartidor?.ComisionPct != null
              ? `${repartidor.ComisionPct}%`
              : 'Según config. global'}
          </Text>
        </View>
      </View>

      {/* Cerrar sesión */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color={COLORS.red} />
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.fondo },
  content: { padding: 16, paddingBottom: 40 },
  avatarSection: { alignItems: 'center', paddingVertical: 24 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  nombre: { fontSize: 22, fontWeight: '700', color: COLORS.texto },
  subtitulo: { fontSize: 14, color: COLORS.texto2, marginTop: 4 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 12, padding: 16,
    marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardTitle: { fontSize: 13, fontWeight: '700', color: COLORS.texto2, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  infoIcon: { marginRight: 12 },
  infoLabel: { fontSize: 11, color: COLORS.texto2 },
  infoValue: { fontSize: 15, color: COLORS.texto, fontWeight: '500', marginTop: 1 },
  saldoCard: { flexDirection: 'row', alignItems: 'center', borderLeftWidth: 4, borderLeftColor: COLORS.red },
  saldoLabel: { fontSize: 13, color: COLORS.texto2 },
  saldoMonto: { fontSize: 22, fontWeight: '800', color: COLORS.red, marginTop: 2 },
  comisionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  comisionLabel: { fontSize: 14, color: COLORS.texto },
  comisionVal: { fontSize: 16, fontWeight: '700', color: COLORS.primary },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFF5F5', borderRadius: 12, padding: 14, marginTop: 8, gap: 8,
  },
  logoutText: { color: COLORS.red, fontWeight: '700', fontSize: 15 },
});
