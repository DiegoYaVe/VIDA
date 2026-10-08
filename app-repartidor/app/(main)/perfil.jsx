import { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, ScrollView, Image, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput } from '../../components/Texto';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import useAuthStore from '../../store/authStore';
import api from '../../services/api';
import { API_URL } from '../../constants/config';
import { colores, fuentes, radios } from '../../constants/tema';

const API_BASE = API_URL.replace('/api', '');
const decimal = (n, d = 1) => Number(n).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });

export default function Perfil() {
  const { repartidor, logout } = useAuthStore();
  const router = useRouter();

  const [stats, setStats] = useState(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ Nombre: '', Telefono: '', Vehiculo: '', PlacaVehiculo: '' });
  const [cambiandoClave, setCambiandoClave] = useState(false);
  const [clave, setClave] = useState({ actual: '', nueva: '' });

  const formDesde = (d) => ({
    Nombre:        d?.Nombre        ?? repartidor?.Nombre        ?? '',
    Telefono:      d?.Telefono      ?? repartidor?.Telefono      ?? '',
    Vehiculo:      d?.Vehiculo      ?? repartidor?.Vehiculo      ?? '',
    PlacaVehiculo: d?.PlacaVehiculo ?? repartidor?.PlacaVehiculo ?? '',
  });

  useEffect(() => {
    api.get('/delivery/repartidor/perfil')
      .then(r => { setStats(r.data); setForm(formDesde(r.data)); })
      .catch(() => setForm(formDesde(null)));
  }, []);

  const nombre = form.Nombre || repartidor?.Nombre || 'Repartidor';
  const iniciales = nombre.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const fotoURL = stats?.FotoURL ?? repartidor?.FotoURL;
  const comisionPct = stats?.ComisionPct ?? repartidor?.ComisionPct;

  const kpis = [
    { valor: stats?.Calificacion != null ? decimal(stats.Calificacion) : '—', etiqueta: 'Calificación' },
    { valor: String(stats?.TotalPedidosEntregados ?? '—'), etiqueta: 'Entregas' },
    { valor: comisionPct != null ? `${decimal(comisionPct, 0)}%` : '—', etiqueta: 'Comisión' },
  ];

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
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setSubiendoFoto(true);
    try {
      const fd = new FormData();
      fd.append('foto', { uri: asset.uri, name: 'foto.jpg', type: asset.mimeType ?? 'image/jpeg' });
      const res = await api.post('/delivery/repartidor/foto', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setStats(prev => ({ ...prev, FotoURL: res.data.fotoURL }));
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
    } catch {
      Alert.alert('Error', 'No se pudieron guardar los cambios. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const datos = [
    { etiqueta: 'Teléfono', campo: 'Telefono', teclado: 'phone-pad', ejemplo: '0414-0000000' },
    { etiqueta: 'Vehículo', campo: 'Vehiculo', ejemplo: 'Moto, carro, bicicleta' },
    { etiqueta: 'Placa', campo: 'PlacaVehiculo', mayusculas: true, ejemplo: 'AB123CD' },
  ];

  const handleCambiarClave = async () => {
    if (clave.nueva.length < 6) return Alert.alert('Contraseña muy corta', 'La nueva contraseña debe tener al menos 6 caracteres.');
    setGuardando(true);
    try {
      await api.put('/delivery/repartidor/password', clave);
      setClave({ actual: '', nueva: '' });
      setCambiandoClave(false);
      Alert.alert('Listo', 'Tu contraseña fue actualizada.');
    } catch (e) {
      Alert.alert('No se pudo cambiar', e.response?.data?.error || 'Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const menu = [
    { nombre: editando ? 'Dejar de editar' : 'Editar perfil y foto', accion: () => (editando ? (setForm(formDesde(stats)), setEditando(false)) : setEditando(true)) },
    { nombre: 'Cambiar contraseña', accion: () => setCambiandoClave(v => !v) },
    { nombre: 'Ayuda y soporte', accion: () => Alert.alert('Ayuda y soporte', 'Para dudas sobre pedidos, cobros, liquidaciones o tu cuenta, comunícate con tu tienda o con el administrador de VIDA.') },
  ];

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ backgroundColor: colores.fondo }} contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Cabecera marina */}
          <View style={styles.cabecera}>
            <View style={styles.deco} />
            <TouchableOpacity onPress={handleSubirFoto} disabled={subiendoFoto} activeOpacity={0.85} accessibilityLabel="Cambiar foto de perfil">
              {fotoURL
                ? <Image source={{ uri: API_BASE + fotoURL }} style={styles.avatar} />
                : <View style={styles.avatar}><Text style={styles.avatarTexto}>{iniciales}</Text></View>}
              <View style={styles.camara}>
                {subiendoFoto ? <ActivityIndicator size="small" color={colores.marino} /> : <Ionicons name="camera" size={14} color={colores.marino} />}
              </View>
            </TouchableOpacity>
            <Text style={styles.nombre}>{nombre}</Text>
            <Text style={styles.subtitulo}>Repartidor aprobado</Text>
          </View>

          {/* Indicadores superpuestos */}
          <View style={styles.kpis}>
            {kpis.map(k => (
              <View key={k.etiqueta} style={styles.kpi}>
                <Text style={styles.kpiValor}>{k.valor}</Text>
                <Text style={styles.kpiEtiqueta}>{k.etiqueta}</Text>
              </View>
            ))}
          </View>

          <View style={styles.cuerpo}>
            {/* Datos */}
            <View style={styles.tarjeta}>
              {editando && (
                <View style={styles.fila}>
                  <Text style={styles.filaEtiqueta}>Nombre</Text>
                  <TextInput value={form.Nombre} onChangeText={v => setForm(p => ({ ...p, Nombre: v }))}
                    style={styles.input} placeholder="Tu nombre" placeholderTextColor={colores.textoTenue} />
                </View>
              )}
              {datos.map((d, i) => (
                <View key={d.campo} style={[styles.fila, i < datos.length - 1 && styles.filaBorde]}>
                  <Text style={styles.filaEtiqueta}>{d.etiqueta}</Text>
                  {editando ? (
                    <TextInput value={form[d.campo]} onChangeText={v => setForm(p => ({ ...p, [d.campo]: v }))}
                      style={styles.input} placeholder={d.ejemplo} placeholderTextColor={colores.textoTenue}
                      keyboardType={d.teclado ?? 'default'} autoCapitalize={d.mayusculas ? 'characters' : 'words'} />
                  ) : (
                    <Text style={styles.filaValor}>{form[d.campo] || '—'}</Text>
                  )}
                </View>
              ))}
              {!editando ? (
                <View style={[styles.fila, styles.filaBordeArriba]}>
                  <Text style={styles.filaEtiqueta}>Correo</Text>
                  <Text style={styles.filaValor} numberOfLines={1}>{stats?.Email || '—'}</Text>
                </View>
              ) : null}
            </View>
            {editando && (
              <>
                <Text style={styles.ayuda}>Toca tu foto arriba para cambiarla.</Text>
                <TouchableOpacity style={styles.guardar} onPress={handleGuardar} disabled={guardando}>
                  {guardando ? <ActivityIndicator color={colores.blanco} /> : <Text style={styles.guardarTexto}>Guardar cambios</Text>}
                </TouchableOpacity>
              </>
            )}

            {cambiandoClave && (
              <View style={styles.tarjeta}>
                <View style={[styles.fila, styles.filaBorde]}>
                  <Text style={styles.filaEtiqueta}>Actual</Text>
                  <TextInput value={clave.actual} onChangeText={v => setClave(c => ({ ...c, actual: v }))} secureTextEntry
                    style={styles.input} placeholder="Tu contraseña" placeholderTextColor={colores.textoTenue} />
                </View>
                <View style={styles.fila}>
                  <Text style={styles.filaEtiqueta}>Nueva</Text>
                  <TextInput value={clave.nueva} onChangeText={v => setClave(c => ({ ...c, nueva: v }))} secureTextEntry
                    style={styles.input} placeholder="Mínimo 6 caracteres" placeholderTextColor={colores.textoTenue} />
                </View>
              </View>
            )}
            {cambiandoClave && (
              <TouchableOpacity style={styles.guardar} onPress={handleCambiarClave} disabled={guardando}>
                {guardando ? <ActivityIndicator color={colores.blanco} /> : <Text style={styles.guardarTexto}>Guardar contraseña</Text>}
              </TouchableOpacity>
            )}

            {/* Menú */}
            <View style={[styles.tarjeta, { paddingHorizontal: 6 }]}>
              {menu.map((m, i) => (
                <TouchableOpacity key={m.nombre} onPress={m.accion} style={[styles.menuFila, i < menu.length - 1 && styles.filaBorde]}>
                  <Text style={styles.menuTexto}>{m.nombre}</Text>
                  <Ionicons name="chevron-forward" size={18} color="#8CA5B3" />
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.salir} onPress={handleLogout}>
              <Text style={styles.salirTexto}>Cerrar sesión</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.marino },
  cabecera: {
    backgroundColor: colores.marino, alignItems: 'center', gap: 6,
    paddingTop: 24, paddingBottom: 52, paddingHorizontal: 20, overflow: 'hidden',
  },
  deco: { position: 'absolute', right: -60, top: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: colores.marinoClaro },
  avatar: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: colores.celeste,
    borderWidth: 4, borderColor: colores.blanco, alignItems: 'center', justifyContent: 'center',
  },
  avatarTexto: { fontFamily: fuentes.tituloFuerte, fontSize: 28, color: colores.marino },
  camara: {
    position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14,
    backgroundColor: colores.celeste, borderWidth: 2, borderColor: colores.blanco, alignItems: 'center', justifyContent: 'center',
  },
  nombre: { fontFamily: fuentes.tituloFuerte, fontSize: 22, color: colores.blanco, marginTop: 4 },
  subtitulo: { fontSize: 14, color: colores.sobreMarino },

  kpis: { flexDirection: 'row', gap: 8, marginTop: -32, marginHorizontal: 20 },
  kpi: {
    flex: 1, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde,
    borderRadius: 18, paddingVertical: 12, alignItems: 'center',
  },
  kpiValor: { fontFamily: fuentes.tituloFuerte, fontSize: 19, color: colores.marino },
  kpiEtiqueta: { fontSize: 12, color: colores.textoSuave, fontWeight: '700' },

  cuerpo: { backgroundColor: colores.fondo, paddingHorizontal: 20, paddingTop: 16, gap: 12, flexGrow: 1 },
  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: radios.grande, paddingHorizontal: 14, paddingVertical: 4 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 52, gap: 12 },
  filaBorde: { borderBottomWidth: 1, borderBottomColor: '#EEF6F8' },
  filaBordeArriba: { borderTopWidth: 1, borderTopColor: '#EEF6F8' },
  filaEtiqueta: { fontSize: 14, color: colores.textoSuave, fontWeight: '700' },
  filaValor: { fontSize: 15, fontWeight: '800', color: colores.marino, flexShrink: 1, textAlign: 'right' },
  input: {
    flex: 1, textAlign: 'right', fontSize: 15, color: colores.marino, paddingVertical: 8,
    borderBottomWidth: 1.5, borderBottomColor: colores.celeste,
  },
  ayuda: { fontSize: 13, color: colores.textoSuave, textAlign: 'center' },
  guardar: { backgroundColor: colores.marino, borderRadius: radios.medio, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  guardarTexto: { color: colores.blanco, fontWeight: '800', fontSize: 15 },
  menuFila: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 8, gap: 12 },
  menuTexto: { flex: 1, fontSize: 15, fontWeight: '700', color: colores.marino },
  salir: { minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  salirTexto: { color: '#8A2B2B', fontWeight: '800', fontSize: 15 },
});
