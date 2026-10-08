import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { Text, TextInput } from '../components/Texto';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import { ID_BRANCH, ID_CUENTA } from '../constants/config';
import { colores, fuentes, logos } from '../constants/tema';
import AsyncStorage from '@react-native-async-storage/async-storage';

const VEHICULOS = ['Moto', 'Bicicleta', 'Carro'];

function Campo({ etiqueta, ...props }) {
  return (
    <View style={styles.campo}>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      <TextInput style={styles.input} placeholderTextColor="#8C9BB0" {...props} />
    </View>
  );
}

export default function LoginScreen() {
  const [modo, setModo] = useState('login'); // login | registro | pendiente
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');

  const [nombre, setNombre] = useState('');
  const [telefonoReg, setTelefonoReg] = useState('');
  const [vehiculo, setVehiculo] = useState('Moto');
  const [placa, setPlaca] = useState('');
  const [passwordReg, setPasswordReg] = useState('');

  const login = useAuthStore((s) => s.login);

  const cambiar = (m) => { setModo(m); setError(''); };

  const handleLogin = async () => {
    if (!telefono.trim()) return setError('Ingresa tu número de teléfono');
    if (!password) return setError('Ingresa tu contraseña');
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/delivery/repartidor/login', {
        idBranch: ID_BRANCH, idCuenta: ID_CUENTA, Telefono: telefono.trim(), Contrasena: password, FcmToken: '',
      });
      // El backend responde { idRepartidor, Nombre, token }
      const { token } = res.data;
      const repartidor = res.data.repartidor ?? { idRepartidor: res.data.idRepartidor, Nombre: res.data.Nombre };
      await AsyncStorage.setItem('vida_repartidor_token', token);
      login({ repartidor, token });
    } catch (e) {
      if (e.response?.data?.codigo === 'PENDIENTE_APROBACION') cambiar('pendiente');
      else setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegistro = async () => {
    if (!nombre.trim() || !telefonoReg.trim()) return setError('Nombre y teléfono son obligatorios');
    if (!passwordReg || passwordReg.length < 6) return setError('La contraseña debe tener al menos 6 caracteres');
    setError('');
    setLoading(true);
    try {
      await api.post('/delivery/repartidor/registro', {
        idBranch: ID_BRANCH, idCuenta: ID_CUENTA, Nombre: nombre.trim(), Telefono: telefonoReg.trim(),
        Vehiculo: vehiculo, PlacaVehiculo: placa.trim() || undefined, Contrasena: passwordReg,
      });
      cambiar('pendiente');
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const boton = (texto, onPress) => (
    <TouchableOpacity style={[styles.boton, loading && { opacity: 0.7 }]} onPress={onPress} disabled={loading} activeOpacity={0.9}>
      {loading ? <ActivityIndicator color={colores.marino} /> : <Text style={styles.botonTexto}>{texto}</Text>}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.marca}>
            <Image source={logos.completoOscuro} style={styles.logo} resizeMode="contain" accessibilityLabel="Comercializadora VIDA" />
            <View style={styles.chip}><Text style={styles.chipTexto}>APP DE REPARTO</Text></View>
            <Text style={styles.lema}>Entrega en tu zona y cobra{'\n'}tus comisiones cada día.</Text>
          </View>

          {modo === 'login' && (
            <View style={styles.form}>
              <Campo etiqueta="Teléfono" placeholder="0414-0000000" keyboardType="phone-pad" value={telefono} onChangeText={setTelefono} />
              <Campo etiqueta="Contraseña" placeholder="••••••••" secureTextEntry value={password} onChangeText={setPassword}
                returnKeyType="done" onSubmitEditing={handleLogin} />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {boton('Entrar', handleLogin)}
            </View>
          )}

          {modo === 'registro' && (
            <View style={styles.form}>
              <Campo etiqueta="Nombre completo" placeholder="Carlos Rodríguez" value={nombre} onChangeText={setNombre} />
              <Campo etiqueta="Teléfono" placeholder="0414-0000000" keyboardType="phone-pad" value={telefonoReg} onChangeText={setTelefonoReg} />
              <View style={styles.campo}>
                <Text style={styles.etiqueta}>Vehículo</Text>
                <View style={styles.vehiculos}>
                  {VEHICULOS.map(v => (
                    <TouchableOpacity key={v} onPress={() => setVehiculo(v)} style={[styles.vehiculo, vehiculo === v && styles.vehiculoOn]}
                      accessibilityRole="radio" accessibilityState={{ selected: vehiculo === v }}>
                      <Text style={[styles.vehiculoTexto, vehiculo === v && { color: colores.marino }]}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {vehiculo !== 'Bicicleta' && (
                <Campo etiqueta="Placa" placeholder="AB123CD" autoCapitalize="characters" value={placa} onChangeText={setPlaca} />
              )}
              <Campo etiqueta="Contraseña" placeholder="Mínimo 6 caracteres" secureTextEntry value={passwordReg} onChangeText={setPasswordReg} />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {boton('Enviar solicitud', handleRegistro)}
            </View>
          )}

          {modo === 'pendiente' && (
            <View style={[styles.form, styles.aviso]}>
              <Text style={styles.avisoTitulo}>Tu solicitud está en revisión</Text>
              <Text style={styles.avisoTexto}>La tienda revisa tus datos y te aprueba. Cuando esté lista podrás entrar con tu teléfono y contraseña.</Text>
            </View>
          )}

          <View style={styles.registro}>
            {modo === 'login' ? (
              <>
                <Text style={styles.registroTitulo}>¿Quieres repartir con VIDA?</Text>
                <Text style={styles.registroTexto}>Regístrate con tu moto o vehículo. La tienda revisa tus datos y te aprueba.</Text>
                <TouchableOpacity onPress={() => cambiar('registro')} style={styles.enlace}>
                  <Text style={styles.enlaceTexto}>Quiero ser repartidor</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.registroTitulo}>¿Ya tienes cuenta?</Text>
                <TouchableOpacity onPress={() => cambiar('login')} style={styles.enlace}>
                  <Text style={styles.enlaceTexto}>Entrar con mi teléfono</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.marino },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },

  marca: { marginTop: 90, gap: 10 },
  logo: { width: 280, height: 135 },
  chip: { alignSelf: 'flex-start', backgroundColor: colores.verde, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  chipTexto: { color: colores.marino, fontWeight: '800', fontSize: 13, letterSpacing: 1 },
  lema: { marginTop: 10, fontFamily: fuentes.tituloMedio, fontSize: 20, lineHeight: 26, color: colores.celesteClaro },

  form: { marginTop: 40, marginBottom: 24, gap: 14 },
  campo: { gap: 6 },
  etiqueta: { fontSize: 14, fontWeight: '800', color: colores.blanco },
  input: { height: 54, borderRadius: 16, backgroundColor: colores.blanco, paddingHorizontal: 16, fontSize: 16, color: colores.marino },
  error: { backgroundColor: colores.errorClaro, color: colores.error, borderRadius: 12, padding: 10, fontSize: 14, fontWeight: '700' },
  boton: { marginTop: 6, height: 58, borderRadius: 18, backgroundColor: colores.celeste, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { color: colores.marino, fontWeight: '800', fontSize: 17 },

  vehiculos: { flexDirection: 'row', gap: 8 },
  vehiculo: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center' },
  vehiculoOn: { backgroundColor: colores.celeste, borderColor: colores.celeste },
  vehiculoTexto: { color: colores.blanco, fontWeight: '800', fontSize: 15 },

  aviso: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: 16, gap: 6 },
  avisoTitulo: { fontWeight: '800', fontSize: 17, color: colores.blanco },
  avisoTexto: { fontSize: 14, color: colores.celesteClaro, lineHeight: 20 },

  registro: { marginTop: 'auto', marginBottom: 30, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: 16, gap: 6 },
  registroTitulo: { fontWeight: '800', fontSize: 15, color: colores.blanco },
  registroTexto: { fontSize: 14, color: colores.celesteClaro, lineHeight: 20 },
  enlace: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  enlaceTexto: { fontWeight: '800', fontSize: 15, color: colores.celeste, textDecorationLine: 'underline' },
});
