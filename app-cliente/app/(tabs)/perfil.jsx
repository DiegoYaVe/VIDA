// Perfil (diseño "Agua VIDA"): avatar con iniciales, nombre y correo,
// resumen (puntos, pedidos, racha de agua) y menú con siglas.
import { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';
import { Text } from '../../components/Texto';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import { API_URL } from '../../constants/config';
import { colores, fuentes } from '../../constants/tema';

const API_BASE = API_URL.replace('/api', '');
const MENU = [
  { nombre: 'Mis pedidos', sigla: 'Pe', ruta: '/mis-pedidos' },
  { nombre: 'Mis direcciones', sigla: 'Di', ruta: '/mis-direcciones' },
  { nombre: 'Mi hidratación', sigla: 'H2O', ruta: '/mi-consumo' },
  { nombre: 'Puntos y premios', sigla: 'Pt', ruta: '/mis-puntos' },
  { nombre: 'Recargas y servicios', sigla: 'Re', ruta: '/servicios' },
  { nombre: 'Academia VIDA', sigla: 'Ac', ruta: '/academia' },
  { nombre: 'Contraseña y seguridad', sigla: 'Se', ruta: '/perfil-password', gris: true },
  { nombre: 'Ayuda y privacidad', sigla: '?', ruta: '/info-ayuda', gris: true },
];

function Flecha() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#8CA5B3" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

export default function PerfilScreen() {
  const router = useRouter();
  const { cliente, token, logout } = useAuthStore();
  const [resumen, setResumen] = useState({ puntos: null, pedidos: null, racha: null });
  const [foto, setFoto] = useState(null);

  useFocusEffect(useCallback(() => {
    if (!token) return;
    api.get('/delivery/cliente/puntos').then((r) => setResumen((s) => ({ ...s, puntos: r.data?.saldo ?? 0 }))).catch(() => {});
    api.get('/delivery/cliente/pedidos').then((r) => setResumen((s) => ({ ...s, pedidos: Array.isArray(r.data) ? r.data.length : 0 }))).catch(() => {});
    api.get('/delivery/cliente/hidratacion').then((r) => setResumen((s) => ({ ...s, racha: r.data?.activa ? Number(r.data.racha) || 0 : null }))).catch(() => {});
    api.get('/delivery/cliente/perfil').then((r) => setFoto(r.data?.FotoURL || null)).catch(() => {});
  }, [token]));

  if (!token) {
    return (
      <SafeAreaView edges={['top']} style={styles.root}>
        <View style={styles.invitado}>
          <Text style={styles.nombre}>Tu cuenta VIDA</Text>
          <Text style={styles.correo}>Entra para ver tus pedidos, puntos e hidratación.</Text>
          <TouchableOpacity style={styles.entrar} onPress={() => router.push('/(auth)/login')}><Text style={styles.entrarTexto}>Entrar o crear cuenta</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const nombre = [cliente?.Nombre, cliente?.Apellidos].filter(Boolean).join(' ') || 'Cliente VIDA';
  const iniciales = `${String(cliente?.Nombre || '').trim()[0] || ''}${String(cliente?.Apellidos || '').trim()[0] || ''}`.toUpperCase() || 'V';
  const tarjetas = [
    { valor: resumen.puntos != null ? Number(resumen.puntos).toLocaleString('es-VE') : '—', etiqueta: 'Puntos', ruta: '/(tabs)/puntos' },
    { valor: resumen.pedidos != null ? String(resumen.pedidos) : '—', etiqueta: 'Pedidos', ruta: '/(tabs)/pedidos' },
    { valor: resumen.racha != null ? `${resumen.racha} día${resumen.racha === 1 ? '' : 's'}` : '—', etiqueta: 'Racha de agua', ruta: '/mi-consumo' },
  ];

  const salir = () => Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Salir', style: 'destructive', onPress: () => { logout(); router.replace('/(tabs)'); } },
  ]);
  const eliminarCuenta = () => Alert.alert('Eliminar mi cuenta', 'Se borran tus datos personales y no se puede deshacer. ¿Continuar?', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Eliminar', style: 'destructive', onPress: async () => {
      try { await api.delete('/delivery/cliente'); logout(); router.replace('/(tabs)'); }
      catch (e) { Alert.alert('No se pudo eliminar', e.response?.data?.error || 'Intenta de nuevo.'); }
    } },
  ]);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.contenido} showsVerticalScrollIndicator={false}>
        <View style={styles.cabecera}>
          {foto ? <Image source={{ uri: API_BASE + foto }} style={styles.avatar} /> : (
            <View style={styles.avatar}><Text style={styles.avatarTexto}>{iniciales}</Text></View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.nombre} numberOfLines={1}>{nombre}</Text>
            {cliente?.Email ? <Text style={styles.correo} numberOfLines={1}>{cliente.Email}</Text> : null}
          </View>
          <TouchableOpacity style={styles.editar} onPress={() => router.push('/perfil-editar')}><Text style={styles.editarTexto}>Editar</Text></TouchableOpacity>
        </View>

        <View style={styles.resumen}>
          {tarjetas.map((t) => (
            <TouchableOpacity key={t.etiqueta} style={styles.dato} onPress={() => router.push(t.ruta)}>
              <Text style={styles.datoValor} numberOfLines={1} adjustsFontSizeToFit>{t.valor}</Text>
              <Text style={styles.datoEtiqueta}>{t.etiqueta}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.menu}>
          {MENU.map((m, i) => (
            <TouchableOpacity key={m.nombre} style={[styles.fila, i < MENU.length - 1 && styles.borde]} onPress={() => router.push(m.ruta)}>
              <View style={[styles.sigla, m.gris && { backgroundColor: '#EEF2F4' }]}><Text style={styles.siglaTexto}>{m.sigla}</Text></View>
              <Text style={styles.filaTexto}>{m.nombre}</Text>
              <Flecha />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.salir} onPress={salir}><Text style={styles.salirTexto}>Cerrar sesión</Text></TouchableOpacity>
        <TouchableOpacity style={styles.eliminar} onPress={eliminarCuenta}><Text style={styles.eliminarTexto}>Eliminar mi cuenta</Text></TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28, gap: 14 },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { fontFamily: fuentes.titulo, fontSize: 22, color: colores.blanco },
  nombre: { fontFamily: fuentes.tituloFuerte, fontSize: 21, color: colores.marino },
  correo: { fontSize: 14, color: colores.textoSuave },
  editar: { minHeight: 44, justifyContent: 'center' },
  editarTexto: { fontWeight: '800', fontSize: 14, color: colores.marino, textDecorationLine: 'underline' },
  resumen: { flexDirection: 'row', gap: 8 },
  dato: { flex: 1, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 18, padding: 12, gap: 2 },
  datoValor: { fontFamily: fuentes.tituloFuerte, fontSize: 20, color: colores.marino },
  datoEtiqueta: { fontSize: 12, color: colores.textoSuave, fontWeight: '700' },
  menu: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 22, paddingHorizontal: 6, paddingVertical: 4 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingHorizontal: 8 },
  borde: { borderBottomWidth: 1, borderBottomColor: '#EEF6F8' },
  sigla: { width: 36, height: 36, borderRadius: 12, backgroundColor: colores.celesteClaro, alignItems: 'center', justifyContent: 'center' },
  siglaTexto: { fontFamily: fuentes.titulo, fontSize: 12, color: colores.marino },
  filaTexto: { flex: 1, fontWeight: '700', fontSize: 15, color: colores.marino },
  salir: { height: 50, alignItems: 'center', justifyContent: 'center' },
  salirTexto: { fontWeight: '800', fontSize: 15, color: '#8A2B2B' },
  eliminar: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  eliminarTexto: { fontSize: 13, color: colores.textoSuave },
  invitado: { padding: 24, gap: 10 },
  entrar: { marginTop: 8, height: 54, borderRadius: 18, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  entrarTexto: { color: colores.blanco, fontWeight: '800', fontSize: 16 },
});
