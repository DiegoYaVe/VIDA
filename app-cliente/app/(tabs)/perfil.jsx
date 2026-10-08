import { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Image, ActivityIndicator, Alert } from 'react-native';
import { Text } from '../../components/Texto';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import { colores, fuentes, radios } from '../../constants/tema';

const API_BASE = process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') ?? '';

function MenuItem({ icon, label, sublabel, onPress, danger, right, tono }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.menuIcon, tono && { backgroundColor: tono }, danger && styles.menuIconDanger]}>
        <Ionicons name={icon} size={20} color={danger ? colores.error : colores.marino} />
      </View>
      <View style={styles.menuLabel}>
        <Text style={[styles.menuText, danger && styles.menuTextDanger]}>{label}</Text>
        {sublabel ? <Text style={styles.menuSublabel}>{sublabel}</Text> : null}
      </View>
      {right ?? <Ionicons name="chevron-forward" size={18} color={colores.textoTenue} />}
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
  const [puntos, setPuntos] = useState(null);
  const [agua, setAgua] = useState(null);
  const [club, setClub] = useState(null);

  useEffect(() => {
    if (!token) return;
    api.get('/delivery/cliente/pedidos')
      .then(r => setPedidosCount((r.data?.pedidos ?? r.data ?? []).length))
      .catch(() => {});
    api.get('/delivery/cliente/puntos')
      .then(r => setPuntos(r.data?.saldo ?? 0))
      .catch(() => {});
    api.get('/delivery/cliente/hidratacion')
      .then(r => setAgua(r.data))
      .catch(() => {});
    api.get('/delivery/cliente/membresia')
      .then(r => setClub(r.data))
      .catch(() => {});
  }, [token]);

  if (!token) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.guestWrap}>
          <View style={styles.guestIcon}>
            <Ionicons name="person-outline" size={44} color="#001034" />
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
          <TouchableOpacity onPress={handleSubirFoto} disabled={subiendoFoto} activeOpacity={0.85} accessibilityLabel="Cambiar foto">
            {fotoURL ? (
              <Image source={{ uri: API_BASE + fotoURL }} style={styles.foto} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
            <View style={styles.cameraBtn}>
              {subiendoFoto
                ? <ActivityIndicator size="small" color={colores.marino} />
                : <Ionicons name="camera" size={14} color={colores.marino} />}
            </View>
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>{nombre} {apellido}</Text>
            {email ? <Text style={styles.headerEmail}>{email}</Text> : null}
          </View>
        </View>

        {/* Resumen: puntos, pedidos y racha de agua */}
        <View style={styles.resumen}>
          <TouchableOpacity style={styles.resumenItem} onPress={() => router.push('/mis-puntos')} activeOpacity={0.85}>
            <Text style={[styles.resumenValor, { color: colores.verdeTexto }]}>{puntos !== null ? puntos.toLocaleString('es-VE') : '…'}</Text>
            <Text style={styles.resumenLabel}>Puntos VIDA</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.resumenItem} onPress={() => router.push('/mis-pedidos')} activeOpacity={0.85}>
            <Text style={styles.resumenValor}>{pedidosCount !== null ? pedidosCount : '…'}</Text>
            <Text style={styles.resumenLabel}>Pedidos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.resumenItem} onPress={() => router.push('/mi-consumo')} activeOpacity={0.85}>
            <Text style={styles.resumenValor}>{agua?.activa ? `${agua.racha ?? 0} d` : '—'}</Text>
            <Text style={styles.resumenLabel}>Racha de agua</Text>
          </TouchableOpacity>
        </View>

        {/* Programas de VIDA */}
        <View style={styles.section}>
          <SectionTitle title="Mis programas" />
          <View style={styles.card}>
            <MenuItem
              icon="receipt-outline"
              label="Mis pedidos"
              sublabel={pedidosCount !== null ? `${pedidosCount} pedido${pedidosCount !== 1 ? 's' : ''} realizados` : 'Historial y repetir pedidos'}
              onPress={() => router.push('/mis-pedidos')}
            />
            <View style={styles.divider} />
            <MenuItem
              icon="gift-outline"
              label="Puntos y premios"
              sublabel={puntos !== null ? `${puntos.toLocaleString('es-VE')} puntos disponibles` : 'Tu billetera de puntos'}
              tono={colores.verdeClaro}
              onPress={() => router.push('/mis-puntos')}
            />
            <View style={styles.divider} />
            <MenuItem
              icon="water-outline"
              label="Mi hidratación"
              sublabel={agua?.activa ? `Hoy: ${agua.vasosHoy ?? 0}/${agua.meta ?? 8} vasos` : 'Activa tu programa de hidratación'}
              onPress={() => router.push('/mi-consumo')}
            />
            <View style={styles.divider} />
            <MenuItem
              icon="card-outline"
              label="Club Vida"
              sublabel={club ? `Nivel ${club.nivel} · ${club.nombreNivel}` : 'Tu membresía digital'}
              onPress={() => router.push('/mi-club')}
            />
            <View style={styles.divider} />
            <MenuItem
              icon="phone-portrait-outline"
              label="Recargas y servicios"
              sublabel="Movistar, Movilnet, Digitel, CANTV…"
              onPress={() => router.push('/servicios')}
            />
            <View style={styles.divider} />
            <MenuItem
              icon="school-outline"
              label="Academia VIDA"
              sublabel="Aprende y gana puntos con cada curso"
              onPress={() => router.push('/academia')}
            />
          </View>
        </View>

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
  container: { flex: 1, backgroundColor: colores.fondo },
  scroll: { paddingBottom: 40 },

  header: {
    backgroundColor: colores.marino, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 22, paddingBottom: 54, gap: 16,
  },
  foto: { width: 74, height: 74, borderRadius: 37, backgroundColor: colores.celesteClaro, borderWidth: 3, borderColor: colores.blanco },
  avatar: {
    width: 74, height: 74, borderRadius: 37, backgroundColor: colores.celeste,
    borderWidth: 3, borderColor: colores.blanco, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 26, fontWeight: '800', color: colores.marino },
  cameraBtn: {
    position: 'absolute', bottom: -2, right: -2, width: 28, height: 28, borderRadius: 14,
    backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colores.marino,
  },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 21, fontWeight: '800', color: colores.blanco },
  headerEmail: { fontSize: 13, color: colores.sobreMarino, marginTop: 3 },

  resumen: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: -34 },
  resumenItem: {
    flex: 1, backgroundColor: colores.blanco, borderRadius: radios.medio, paddingVertical: 14, paddingHorizontal: 10,
    alignItems: 'center', borderWidth: 1, borderColor: colores.borde,
  },
  resumenValor: { fontSize: 20, fontWeight: '800', color: colores.marino },
  resumenLabel: { fontSize: 12, fontWeight: '700', color: colores.textoSuave, marginTop: 2, textAlign: 'center' },

  section: { marginHorizontal: 16, marginTop: 18 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: colores.textoSuave, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: colores.blanco, borderRadius: radios.grande, borderWidth: 1, borderColor: colores.borde, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, minHeight: 60, gap: 12 },
  menuIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colores.celesteClaro, alignItems: 'center', justifyContent: 'center' },
  menuIconDanger: { backgroundColor: colores.errorClaro },
  menuLabel: { flex: 1, paddingVertical: 10 },
  menuText: { fontSize: 15, fontWeight: '700', color: colores.marino },
  menuTextDanger: { color: colores.error },
  menuSublabel: { fontSize: 12, color: colores.textoSuave, marginTop: 1 },
  divider: { height: 1, backgroundColor: colores.fondo, marginLeft: 66 },

  deleteBtn: { marginHorizontal: 16, marginTop: 24, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  deleteBtnText: { fontSize: 13, color: colores.textoSuave, textDecorationLine: 'underline' },

  guestWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  guestIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: colores.celesteClaro, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  guestTitle: { fontSize: 22, fontWeight: '800', color: colores.marino, marginBottom: 8 },
  guestSub: { fontSize: 14, color: colores.textoSuave, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  guestBtn: { backgroundColor: colores.marino, borderRadius: radios.medio, minHeight: 54, paddingHorizontal: 28, width: '100%', alignItems: 'center', justifyContent: 'center' },
  guestBtnText: { color: colores.blanco, fontWeight: '800', fontSize: 15 },
});
