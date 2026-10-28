// Cuenta (estilo apps de delivery): nombre y foto, accesos rápidos (puntos,
// pedidos, racha de agua) y menú con iconos agrupado por tema.
import { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text } from '../../components/Texto';
import { Icono, Invitado } from '../../components/ui';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import { API_URL } from '../../constants/config';
import { colores, fuentes } from '../../constants/tema';

const API_BASE = API_URL.replace('/api', '');
const GRUPOS = [
  { titulo: 'Tus compras', items: [
    { nombre: 'Mis direcciones', icono: 'location-outline', ruta: '/mis-direcciones' },
    { nombre: 'Mis tarjetas', icono: 'card-outline', ruta: '/perfil-tarjetas' },
    { nombre: 'Recargas y servicios', icono: 'phone-portrait-outline', ruta: '/servicios' },
  ] },
  { titulo: 'Club VIDA', items: [
    { nombre: 'Mi hidratación', icono: 'water-outline', ruta: '/mi-consumo' },
    { nombre: 'Puntos y premios', icono: 'gift-outline', ruta: '/mis-puntos' },
    { nombre: 'Academia VIDA', icono: 'school-outline', ruta: '/academia' },
  ] },
  { titulo: 'Ajustes', items: [
    { nombre: 'Editar perfil', icono: 'person-outline', ruta: '/perfil-editar' },
    { nombre: 'Contraseña y seguridad', icono: 'lock-closed-outline', ruta: '/perfil-password' },
    { nombre: 'Ayuda', icono: 'help-circle-outline', ruta: '/info-ayuda' },
    { nombre: 'Privacidad', icono: 'shield-checkmark-outline', ruta: '/info-privacidad' },
    { nombre: 'Quiénes somos', icono: 'information-circle-outline', ruta: '/info-quienes-somos' },
  ] },
];

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
        <StatusBar style="dark" />
        <Invitado icono="person-outline" titulo="Tu cuenta VIDA" texto="Entra para ver tus pedidos, tus puntos y tu hidratación del día." />
        <View style={styles.enlacesInvitado}>
          <TouchableOpacity onPress={() => router.push('/info-ayuda')}><Text style={styles.enlace}>Ayuda</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/info-privacidad')}><Text style={styles.enlace}>Privacidad</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const nombre = [cliente?.Nombre, cliente?.Apellidos].filter(Boolean).join(' ') || 'Cliente VIDA';
  const iniciales = `${String(cliente?.Nombre || '').trim()[0] || ''}${String(cliente?.Apellidos || '').trim()[0] || ''}`.toUpperCase() || 'V';
  const accesos = [
    { icono: 'gift', valor: resumen.puntos != null ? Number(resumen.puntos).toLocaleString('es-VE') : '—', etiqueta: 'Puntos', ruta: '/(tabs)/puntos', fondo: colores.verdeClaro },
    { icono: 'receipt', valor: resumen.pedidos != null ? String(resumen.pedidos) : '—', etiqueta: 'Pedidos', ruta: '/(tabs)/pedidos', fondo: colores.superficie },
    { icono: 'water', valor: resumen.racha != null ? `${resumen.racha} d` : '—', etiqueta: 'Racha de agua', ruta: '/mi-consumo', fondo: colores.celesteClaro },
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
        <TouchableOpacity style={styles.cabecera} onPress={() => router.push('/perfil-editar')} activeOpacity={0.8} accessibilityLabel="Editar perfil">
          <View style={{ flex: 1 }}>
            <Text style={styles.nombre} numberOfLines={2}>{nombre}</Text>
            {cliente?.Email ? <Text style={styles.correo} numberOfLines={1}>{cliente.Email}</Text> : null}
            <View style={styles.editar}><Text style={styles.editarTexto}>Ver y editar perfil</Text><Icono nombre="chevron-forward" tam={14} /></View>
          </View>
          {foto ? <Image source={{ uri: API_BASE + foto }} style={styles.avatar} /> : (
            <View style={styles.avatar}><Text style={styles.avatarTexto}>{iniciales}</Text></View>
          )}
        </TouchableOpacity>

        <View style={styles.accesos}>
          {accesos.map((a) => (
            <TouchableOpacity key={a.etiqueta} style={[styles.acceso, { backgroundColor: a.fondo }]} onPress={() => router.push(a.ruta)}>
              <Icono nombre={a.icono} tam={24} />
              <Text style={styles.accesoValor} numberOfLines={1} adjustsFontSizeToFit>{a.valor}</Text>
              <Text style={styles.accesoEtiqueta} numberOfLines={1}>{a.etiqueta}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {GRUPOS.map((g) => (
          <View key={g.titulo} style={styles.grupo}>
            <Text style={styles.grupoTitulo}>{g.titulo}</Text>
            {g.items.map((m) => (
              <TouchableOpacity key={m.nombre} style={styles.fila} onPress={() => router.push(m.ruta)}>
                <Icono nombre={m.icono} tam={22} />
                <Text style={styles.filaTexto}>{m.nombre}</Text>
                <Icono nombre="chevron-forward" tam={18} color={colores.textoTenue} />
              </TouchableOpacity>
            ))}
          </View>
        ))}

        <TouchableOpacity style={styles.salir} onPress={salir}>
          <Icono nombre="log-out-outline" tam={20} color={colores.error} />
          <Text style={styles.salirTexto}>Cerrar sesión</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.eliminar} onPress={eliminarCuenta}><Text style={styles.eliminarTexto}>Eliminar mi cuenta</Text></TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28, gap: 18 },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { fontFamily: fuentes.titulo, fontSize: 24, color: colores.blanco },
  nombre: { fontFamily: fuentes.tituloFuerte, fontSize: 26, lineHeight: 31, color: colores.marino },
  correo: { fontSize: 14, color: colores.textoSuave },
  editar: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 6 },
  editarTexto: { fontWeight: '800', fontSize: 13, color: colores.marino },

  accesos: { flexDirection: 'row', gap: 10 },
  acceso: { flex: 1, borderRadius: 18, padding: 14, gap: 4 },
  accesoValor: { fontFamily: fuentes.tituloFuerte, fontSize: 20, color: colores.marino, marginTop: 4 },
  accesoEtiqueta: { fontSize: 12, color: colores.textoSuave, fontWeight: '700' },

  grupo: { gap: 2 },
  grupoTitulo: { fontFamily: fuentes.titulo, fontSize: 16, color: colores.marino, marginBottom: 4 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, borderBottomWidth: 1, borderBottomColor: colores.separador },
  filaTexto: { flex: 1, fontWeight: '700', fontSize: 15, color: colores.marino },

  salir: { flexDirection: 'row', gap: 8, height: 52, borderRadius: 16, backgroundColor: colores.errorClaro, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  salirTexto: { fontWeight: '800', fontSize: 15, color: colores.error },
  eliminar: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  eliminarTexto: { fontSize: 13, color: colores.textoSuave },
  enlacesInvitado: { flexDirection: 'row', justifyContent: 'center', gap: 24, paddingBottom: 24 },
  enlace: { fontSize: 14, fontWeight: '700', color: colores.textoSuave, textDecorationLine: 'underline' },
});
