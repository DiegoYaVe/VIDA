import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ScrollView, Image, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import useAuthStore from '../../store/authStore';
import api from '../../services/api';

const API_BASE = process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') ?? '';

const COLORS = {
  primary: '#1A6A9A', green: '#27AE60', red: '#E53E3E',
  fondo: '#F5F7FA', texto: '#1A202C', texto2: '#718096', card: '#FFFFFF',
};

function Stars({ value }) {
  const stars = Math.round(value ?? 0);
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1,2,3,4,5].map(n => (
        <Ionicons key={n} name={n <= stars ? 'star' : 'star-outline'} size={16} color="#F6AD55" />
      ))}
    </View>
  );
}

export default function Perfil() {
  const { repartidor, logout } = useAuthStore();
  const router = useRouter();

  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  // Modo edición
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ Nombre: '', Telefono: '', Vehiculo: '', PlacaVehiculo: '' });

  useEffect(() => {
    api.get('/delivery/repartidor/perfil')
      .then(r => {
        setStats(r.data);
        setForm({
          Nombre:        r.data.Nombre        ?? repartidor?.Nombre        ?? '',
          Telefono:      r.data.Telefono      ?? repartidor?.Telefono      ?? '',
          Vehiculo:      r.data.Vehiculo      ?? repartidor?.Vehiculo      ?? '',
          PlacaVehiculo: r.data.PlacaVehiculo ?? repartidor?.PlacaVehiculo ?? '',
        });
      })
      .catch(() => {
        setForm({
          Nombre:        repartidor?.Nombre        ?? '',
          Telefono:      repartidor?.Telefono      ?? '',
          Vehiculo:      repartidor?.Vehiculo       ?? '',
          PlacaVehiculo: repartidor?.PlacaVehiculo ?? '',
        });
      })
      .finally(() => setLoadingStats(false));
  }, []);

  const initials = (form.Nombre || repartidor?.Nombre || 'R')
    .split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const saldo = Number(stats?.SaldoPendiente ?? repartidor?.SaldoPendiente ?? 0);
  const fotoURL = stats?.FotoURL ?? repartidor?.FotoURL;

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => { logout(); router.replace('/login'); } },
    ]);
  };

  const handleSubirFoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para subir una foto.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.7,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setSubiendoFoto(true);
    try {
      const fd = new FormData();
      fd.append('foto', { uri: asset.uri, name: 'foto.jpg', type: asset.mimeType ?? 'image/jpeg' });
      const res = await api.post('/delivery/repartidor/foto', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setStats(prev => ({ ...prev, FotoURL: res.data.fotoURL }));
      Alert.alert('¡Listo!', 'Tu foto fue actualizada.');
    } catch {
      Alert.alert('Error', 'No se pudo subir la foto. Intenta de nuevo.');
    } finally {
      setSubiendoFoto(false);
    }
  };

  const handleGuardar = async () => {
    if (!form.Nombre.trim()) {
      Alert.alert('Campo requerido', 'El nombre no puede estar vacío.');
      return;
    }
    setGuardando(true);
    try {
      const res = await api.put('/delivery/repartidor/perfil', form);
      setStats(prev => ({ ...prev, ...res.data }));
      setEditando(false);
      Alert.alert('¡Guardado!', 'Tu información fue actualizada correctamente.');
    } catch {
      Alert.alert('Error', 'No se pudieron guardar los cambios. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const handleCancelar = () => {
    // Restaurar valores originales
    setForm({
      Nombre:        stats?.Nombre        ?? repartidor?.Nombre        ?? '',
      Telefono:      stats?.Telefono      ?? repartidor?.Telefono      ?? '',
      Vehiculo:      stats?.Vehiculo      ?? repartidor?.Vehiculo      ?? '',
      PlacaVehiculo: stats?.PlacaVehiculo ?? repartidor?.PlacaVehiculo ?? '',
    });
    setEditando(false);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Avatar + foto */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handleSubirFoto} disabled={subiendoFoto} activeOpacity={0.8}>
            {fotoURL ? (
              <Image source={{ uri: API_BASE + fotoURL }} style={styles.fotoCircle} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
            <View style={styles.cameraBtn}>
              {subiendoFoto
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="camera" size={14} color="#fff" />}
            </View>
          </TouchableOpacity>
          <Text style={styles.nombre}>{form.Nombre || repartidor?.Nombre}</Text>
          <Text style={styles.subtitulo}>Repartidor</Text>
        </View>

        {/* Estadísticas */}
        {loadingStats ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 16 }} />
        ) : stats ? (
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{stats.TotalPedidosEntregados ?? 0}</Text>
              <Text style={styles.statLbl}>Pedidos</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              {stats.Calificacion != null ? (
                <>
                  <Stars value={stats.Calificacion} />
                  <Text style={styles.statLbl}>
                    {parseFloat(stats.Calificacion).toFixed(1)} ({stats.TotalCalificaciones ?? 0})
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.statNum}>—</Text>
                  <Text style={styles.statLbl}>Sin calificaciones</Text>
                </>
              )}
            </View>
          </View>
        ) : null}

        {/* Info personal */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Información personal</Text>
            {!editando ? (
              <TouchableOpacity onPress={() => setEditando(true)} style={styles.editBtn}>
                <Ionicons name="pencil" size={14} color={COLORS.primary} />
                <Text style={styles.editBtnText}>Editar</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.editActions}>
                <TouchableOpacity onPress={handleCancelar} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleGuardar}
                  style={styles.saveBtn}
                  disabled={guardando}
                >
                  {guardando
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.saveBtnText}>Guardar</Text>}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {editando ? (
            <>
              <FormField
                icon="person-outline" label="Nombre"
                value={form.Nombre} onChangeText={v => setForm(p => ({ ...p, Nombre: v }))}
                placeholder="Tu nombre completo"
              />
              <FormField
                icon="call-outline" label="Teléfono"
                value={form.Telefono} onChangeText={v => setForm(p => ({ ...p, Telefono: v }))}
                placeholder="Ej: 04141234567" keyboardType="phone-pad"
              />
              <FormField
                icon="bicycle-outline" label="Vehículo"
                value={form.Vehiculo} onChangeText={v => setForm(p => ({ ...p, Vehiculo: v }))}
                placeholder="Ej: Moto, Carro, Bicicleta"
              />
              <FormField
                icon="car-outline" label="Placa"
                value={form.PlacaVehiculo} onChangeText={v => setForm(p => ({ ...p, PlacaVehiculo: v }))}
                placeholder="Ej: AB123CD" autoCapitalize="characters"
              />
            </>
          ) : (
            <>
              <InfoRow icon="call-outline" label="Teléfono" value={form.Telefono} />
              <InfoRow icon="bicycle-outline" label="Vehículo" value={form.Vehiculo} />
              <InfoRow icon="car-outline" label="Placa" value={form.PlacaVehiculo} />
            </>
          )}
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
              {(stats?.ComisionPct ?? repartidor?.ComisionPct) != null
                ? `${stats?.ComisionPct ?? repartidor?.ComisionPct}%`
                : 'Según config. global'}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.red} />
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

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

function FormField({ icon, label, value, onChangeText, placeholder, keyboardType, autoCapitalize }) {
  return (
    <View style={styles.fieldRow}>
      <Ionicons name={icon} size={18} color={COLORS.primary} style={styles.infoIcon} />
      <View style={styles.fieldInner}>
        <Text style={styles.infoLabel}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#CBD5E0"
          keyboardType={keyboardType ?? 'default'}
          autoCapitalize={autoCapitalize ?? 'words'}
          style={styles.fieldInput}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.fondo },
  content: { padding: 16, paddingBottom: 40 },
  avatarSection: { alignItems: 'center', paddingVertical: 24 },
  fotoCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#EDF2F7' },
  avatar: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 30, fontWeight: 'bold' },
  cameraBtn: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  nombre: { fontSize: 22, fontWeight: '700', color: COLORS.texto, marginTop: 12 },
  subtitulo: { fontSize: 14, color: COLORS.texto2, marginTop: 4 },
  statsRow: {
    flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 14,
    padding: 16, marginBottom: 12, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  statBox: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: '800', color: COLORS.primary },
  statLbl: { fontSize: 12, color: COLORS.texto2, marginTop: 3, textAlign: 'center' },
  statDivider: { width: 1, height: 40, backgroundColor: '#EDF2F7', marginHorizontal: 8 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 12, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: COLORS.texto2, textTransform: 'uppercase', letterSpacing: 0.5 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EBF8FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  editBtnText: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  editActions: { flexDirection: 'row', gap: 8 },
  cancelBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#EDF2F7' },
  cancelBtnText: { fontSize: 13, color: COLORS.texto2, fontWeight: '600' },
  saveBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 5, backgroundColor: COLORS.primary, minWidth: 70, alignItems: 'center' },
  saveBtnText: { fontSize: 13, color: '#fff', fontWeight: '700' },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  infoIcon: { marginRight: 12 },
  infoLabel: { fontSize: 11, color: COLORS.texto2 },
  infoValue: { fontSize: 15, color: COLORS.texto, fontWeight: '500', marginTop: 1 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#EDF2F7' },
  fieldInner: { flex: 1 },
  fieldInput: {
    fontSize: 15, color: COLORS.texto, fontWeight: '500', marginTop: 2,
    borderBottomWidth: 1.5, borderBottomColor: COLORS.primary,
    paddingVertical: 4, paddingHorizontal: 0,
  },
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
