import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Image, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';

const API_BASE = process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') ?? '';

function MenuItem({ icon, label, sublabel, onPress, danger, right }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.menuIcon, danger && styles.menuIconDanger]}>
        <Ionicons name={icon} size={20} color={danger ? '#E53E3E' : '#1A6A9A'} />
      </View>
      <View style={styles.menuLabel}>
        <Text style={[styles.menuText, danger && styles.menuTextDanger]}>{label}</Text>
        {sublabel ? <Text style={styles.menuSublabel}>{sublabel}</Text> : null}
      </View>
      {right ?? <Ionicons name="chevron-forward" size={16} color="#CBD5E0" />}
    </TouchableOpacity>
  );
}

function SectionTitle({ title }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

export default function PerfilScreen() {
  const router = useRouter();
  const { cliente, token, logout, setCliente } = useAuthStore();
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [pedidosCount, setPedidosCount] = useState(null);

  useEffect(() => {
    if (!token) return;
    api.get('/delivery/cliente/pedidos')
      .then(r => setPedidosCount((r.data?.pedidos ?? r.data ?? []).length))
      .catch(() => {});
  }, [token]);

  if (!token) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.guestWrap}>
          <View style={styles.guestIcon}>
            <Ionicons name="person-outline" size={44} color="#1A6A9A" />
          </View>
          <Text style={styles.guestTitle}>Aún no tienes sesión</Text>
          <Text style={styles.guestSub}>
            Crea tu cuenta o inicia sesión para hacer pedidos y ver tu historial.
          </Text>
          <TouchableOpacity style={styles.guestBtn} onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.guestBtnText}>Iniciar sesión / Registrarme</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const nombre   = cliente?.Nombre    ?? cliente?.nombre    ?? 'Usuario';
  const apellido = cliente?.Apellidos ?? cliente?.apellidos ?? '';
  const email    = cliente?.Email     ?? cliente?.email     ?? '';
  const fotoURL  = cliente?.FotoURL   ?? cliente?.fotoURL;
  const initials = ([nombre[0], (apellido[0] || '')].join('')).toUpperCase() || '?';

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
      const res = await api.post('/delivery/cliente/foto', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setCliente({ ...cliente, FotoURL: res.data.fotoURL });
      Alert.alert('¡Listo!', 'Tu foto fue actualizada.');
    } catch {
      Alert.alert('Error', 'No se pudo subir la foto.');
    } finally {
      setSubiendoFoto(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión', style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('vida_cliente_token');
          logout();
          router.replace('/(tabs)');
        },
      },
    ]);
  };

  const handleEliminarCuenta = () => {
    Alert.alert(
      'Eliminar cuenta',
      'Esta acción es irreversible. Se eliminarán todos tus datos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => {
            try {
              await api.delete('/delivery/cliente');
              await AsyncStorage.removeItem('vida_cliente_token');
              logout();
              router.replace('/(tabs)');
            } catch {
              Alert.alert('Error', 'No se pudo eliminar la cuenta. Intenta de nuevo.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Header con foto */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleSubirFoto} disabled={subiendoFoto} activeOpacity={0.85}>
            {fotoURL ? (
              <Image source={{ uri: API_BASE + fotoURL }} style={styles.foto} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
            <View style={styles.cameraBtn}>
              {subiendoFoto
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="camera" size={13} color="#fff" />}
            </View>
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>{nombre} {apellido}</Text>
            {email ? <Text style={styles.headerEmail}>{email}</Text> : null}
          </View>
        </View>

        {/* Pedidos — botón prominente */}
        <TouchableOpacity
          style={styles.pedidosCard}
          onPress={() => router.push('/mis-pedidos')}
          activeOpacity={0.85}
        >
          <View style={styles.pedidosIcon}>
            <Ionicons name="receipt-outline" size={26} color="#1A6A9A" />
          </View>
          <View style={styles.pedidosInfo}>
            <Text style={styles.pedidosTitle}>Mis pedidos</Text>
            {pedidosCount !== null
              ? <Text style={styles.pedidosSub}>{pedidosCount} pedido{pedidosCount !== 1 ? 's' : ''} realizados</Text>
              : <Text style={styles.pedidosSub}>Ver historial de pedidos</Text>}
          </View>
          <Ionicons name="chevron-forward" size={20} color="#1A6A9A" />
        </TouchableOpacity>

        {/* Mi cuenta */}
        <View style={styles.section}>
          <SectionTitle title="Mi cuenta" />
          <View style={styles.card}>
            <MenuItem
              icon="person-outline"
              label="Editar perfil"
              sublabel="Nombre, teléfono, correo"
              onPress={() => router.push('/perfil-editar')}
            />
            <View style={styles.divider} />
            <MenuItem
              icon="lock-closed-outline"
              label="Cambiar contraseña"
              onPress={() => router.push('/perfil-password')}
            />
            <View style={styles.divider} />
            <MenuItem
              icon="card-outline"
              label="Mis tarjetas"
              sublabel="Métodos de pago guardados"
              onPress={() => router.push('/perfil-tarjetas')}
            />
          </View>
        </View>

        {/* Información */}
        <View style={styles.section}>
          <SectionTitle title="Información" />
          <View style={styles.card}>
            <MenuItem
              icon="help-circle-outline"
              label="Ayuda"
              sublabel="Preguntas frecuentes y soporte"
              onPress={() => router.push('/info-ayuda')}
            />
            <View style={styles.divider} />
            <MenuItem
              icon="people-outline"
              label="Quiénes somos"
              onPress={() => router.push('/info-quienes-somos')}
            />
            <View style={styles.divider} />
            <MenuItem
              icon="shield-checkmark-outline"
              label="Aviso de privacidad"
              onPress={() => router.push('/info-privacidad')}
            />
          </View>
        </View>

        {/* Sesión */}
        <View style={styles.section}>
          <View style={styles.card}>
            <MenuItem
              icon="log-out-outline"
              label="Cerrar sesión"
              onPress={handleLogout}
              danger
              right={null}
            />
          </View>
        </View>

        <TouchableOpacity style={styles.deleteBtn} onPress={handleEliminarCuenta}>
          <Text style={styles.deleteBtnText}>Eliminar cuenta</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  scroll: { paddingBottom: 40 },

  header: {
    backgroundColor: '#1A6A9A',
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28,
    gap: 16,
  },
  foto: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#EDF2F7' },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 26, fontWeight: '800', color: '#fff' },
  cameraBtn: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#fff',
  },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 19, fontWeight: '800', color: '#fff' },
  headerEmail: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 3 },

  pedidosCard: {
    marginHorizontal: 16, marginTop: 20, marginBottom: 4,
    backgroundColor: '#EBF8FF',
    borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1.5, borderColor: '#BEE3F8',
  },
  pedidosIcon: {
    width: 50, height: 50, borderRadius: 14,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  pedidosInfo: { flex: 1 },
  pedidosTitle: { fontSize: 15, fontWeight: '800', color: '#1A6A9A' },
  pedidosSub: { fontSize: 12, color: '#4299E1', marginTop: 2 },

  section: { marginHorizontal: 16, marginTop: 16 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#A0AEC0', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },
  card: {
    backgroundColor: '#fff', borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
    overflow: 'hidden',
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  menuIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#EBF8FF', alignItems: 'center', justifyContent: 'center',
  },
  menuIconDanger: { backgroundColor: '#FFF5F5' },
  menuLabel: { flex: 1 },
  menuText: { fontSize: 15, fontWeight: '600', color: '#1A202C' },
  menuTextDanger: { color: '#E53E3E' },
  menuSublabel: { fontSize: 12, color: '#A0AEC0', marginTop: 1 },
  divider: { height: 1, backgroundColor: '#F5F7FA', marginLeft: 66 },

  deleteBtn: { marginHorizontal: 16, marginTop: 24, alignItems: 'center' },
  deleteBtnText: { fontSize: 13, color: '#A0AEC0', textDecorationLine: 'underline' },

  guestWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  guestIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#EBF8FF', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  guestTitle: { fontSize: 20, fontWeight: '800', color: '#1A202C', marginBottom: 8 },
  guestSub: { fontSize: 14, color: '#718096', textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  guestBtn: { backgroundColor: '#27AE60', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, width: '100%', alignItems: 'center' },
  guestBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
