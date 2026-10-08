// Entrar / crear cuenta (diseño "Agua VIDA"): cabecera marina con el logo y
// el lema, formulario con etiquetas, Google y "¿Primera vez? Crea tu cuenta".
import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextInput } from '../../components/Texto';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import { ID_BRANCH, ID_CUENTA, GOOGLE_WEB_CLIENT_ID } from '../../constants/config';
import { colores, fuentes, logos } from '../../constants/tema';

// Google Sign-In es un módulo nativo que Expo Go no incluye: se carga con
// require protegido. En Expo Go el botón avisa que use su teléfono.
let GoogleSignin = null;
try {
  GoogleSignin = require('@react-native-google-signin/google-signin').GoogleSignin;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
} catch (_) {
  GoogleSignin = null;
}

function Campo({ etiqueta, ...props }) {
  return (
    <View style={styles.campo}>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      <TextInput style={styles.input} placeholderTextColor="#8C9BB0" {...props} />
    </View>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [modo, setModo] = useState('login');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [telefonoReg, setTelefonoReg] = useState('');
  const [email, setEmail] = useState('');
  const [passwordReg, setPasswordReg] = useState('');

  const cambiar = (m) => { setModo(m); setError(''); setAviso(''); };

  const handleLogin = async () => {
    if (!telefono.trim()) return setError('Ingresa tu número de teléfono');
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/delivery/cliente/login', {
        idBranch: ID_BRANCH, idCuenta: ID_CUENTA, Telefono: telefono.trim(), Contrasena: password || undefined,
      });
      const { token, idCliente, Nombre, Apellidos, Email, emailConfirmado } = res.data;
      await AsyncStorage.setItem('vida_cliente_token', token);
      login({ cliente: { idCliente, Nombre, Apellidos, Email, emailConfirmado }, token });
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegistro = async () => {
    if (!nombre.trim() || !telefonoReg.trim()) return setError('Nombre y teléfono son obligatorios');
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/delivery/cliente/registro', {
        idBranch: ID_BRANCH, idCuenta: ID_CUENTA, Nombre: nombre.trim(), Apellidos: apellidos.trim(),
        Telefono: telefonoReg.trim(), Email: email.trim() || undefined, Contrasena: passwordReg || undefined, FcmToken: '',
      });
      const { token, idCliente, emailPendiente } = res.data;
      await AsyncStorage.setItem('vida_cliente_token', token);
      if (emailPendiente) setAviso('Cuenta creada. Revisa tu correo para confirmar tu email.');
      login({ cliente: { idCliente, Nombre: nombre.trim(), Apellidos: apellidos.trim() }, token });
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    if (!GoogleSignin) return setError('Entrar con Google no está disponible en Expo Go. Usa tu teléfono y contraseña, o la app instalada.');
    setGoogleLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const resultado = await GoogleSignin.signIn();
      if (resultado?.type === 'cancelled') return;
      const idToken = resultado?.data?.idToken ?? resultado?.idToken;
      if (!idToken) return setError('Google no entregó el token. Intenta de nuevo.');
      const r = await api.post('/delivery/cliente/google/native', { idBranch: ID_BRANCH, idCuenta: ID_CUENTA, idToken });
      await AsyncStorage.setItem('vida_cliente_token', r.data.token);
      login({ cliente: { idCliente: Number(r.data.idCliente), Nombre: r.data.Nombre, Email: r.data.Email }, token: r.data.token });
    } catch (e) {
      if (String(e?.code) === '12501' || /cancel/i.test(String(e?.message))) return;
      setError(e.response?.data?.error || e.message);
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <SafeAreaView edges={['top']} style={styles.hero}>
            <Image source={logos.completoOscuro} style={styles.logo} resizeMode="contain" accessibilityLabel="Comercializadora VIDA" />
            <Text style={styles.lema}>Tu bodega y tu agua,{'\n'}en la puerta de tu casa.</Text>
          </SafeAreaView>

          <View style={styles.form}>
            {modo === 'login' ? (
              <>
                <Campo etiqueta="Teléfono" placeholder="0414-0000000" keyboardType="phone-pad" value={telefono} onChangeText={setTelefono} />
                <Campo etiqueta="Contraseña" placeholder="••••••••" secureTextEntry value={password} onChangeText={setPassword}
                  returnKeyType="done" onSubmitEditing={handleLogin} />
              </>
            ) : (
              <>
                <View style={styles.dosCol}>
                  <View style={{ flex: 1 }}><Campo etiqueta="Nombre" placeholder="María" value={nombre} onChangeText={setNombre} /></View>
                  <View style={{ flex: 1 }}><Campo etiqueta="Apellido" placeholder="González" value={apellidos} onChangeText={setApellidos} /></View>
                </View>
                <Campo etiqueta="Teléfono" placeholder="0414-0000000" keyboardType="phone-pad" value={telefonoReg} onChangeText={setTelefonoReg} />
                <Campo etiqueta="Correo electrónico (opcional)" placeholder="tucorreo@ejemplo.com" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
                <Campo etiqueta="Contraseña" placeholder="Mínimo 6 caracteres" secureTextEntry value={passwordReg} onChangeText={setPasswordReg} />
              </>
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {aviso ? <Text style={styles.aviso}>{aviso}</Text> : null}

            <TouchableOpacity style={[styles.entrar, loading && { opacity: 0.7 }]} onPress={modo === 'login' ? handleLogin : handleRegistro} disabled={loading}>
              {loading ? <ActivityIndicator color={colores.blanco} /> : <Text style={styles.entrarTexto}>{modo === 'login' ? 'Entrar' : 'Crear cuenta'}</Text>}
            </TouchableOpacity>
            <View style={styles.separador}>
              <View style={styles.linea} /><Text style={styles.o}>o</Text><View style={styles.linea} />
            </View>
            <TouchableOpacity style={styles.google} onPress={handleGoogle} disabled={googleLoading}>
              {googleLoading ? <ActivityIndicator color={colores.marino} /> : <View style={styles.googleAro} />}
              <Text style={styles.googleTexto}>Continuar con Google</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.pie}>
            {modo === 'login' ? (
              <Text style={styles.pieTexto}>¿Primera vez? <Text style={styles.pieEnlace} onPress={() => cambiar('registro')}>Crea tu cuenta</Text></Text>
            ) : (
              <Text style={styles.pieTexto}>¿Ya tienes cuenta? <Text style={styles.pieEnlace} onPress={() => cambiar('login')}>Entrar</Text></Text>
            )}
            <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.explorar}>
              <Text style={styles.explorarTexto}>Explorar la tienda sin cuenta</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  scroll: { flexGrow: 1 },
  hero: {
    minHeight: 330, backgroundColor: colores.marino, borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
    justifyContent: 'center', alignItems: 'center', gap: 22, paddingVertical: 28, paddingHorizontal: 24,
  },
  logo: { width: 300, height: 144 },
  lema: { fontFamily: fuentes.tituloMedio, fontSize: 18, lineHeight: 23, color: colores.celesteClaro, textAlign: 'center' },

  form: { paddingTop: 28, paddingHorizontal: 24, gap: 14 },
  dosCol: { flexDirection: 'row', gap: 10 },
  campo: { gap: 6 },
  etiqueta: { fontSize: 14, fontWeight: '800', color: colores.marino },
  input: { height: 52, borderRadius: 16, borderWidth: 1.5, borderColor: colores.bordeFuerte, backgroundColor: colores.blanco, paddingHorizontal: 16, fontSize: 16, color: colores.marino },
  error: { backgroundColor: colores.errorClaro, color: colores.error, borderRadius: 12, padding: 10, fontSize: 14, fontWeight: '700' },
  aviso: { backgroundColor: colores.verdeClaro, color: colores.verdeTexto, borderRadius: 12, padding: 10, fontSize: 14, fontWeight: '700' },
  entrar: { height: 56, borderRadius: 18, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  entrarTexto: { color: colores.blanco, fontWeight: '800', fontSize: 17 },
  separador: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  linea: { flex: 1, height: 1, backgroundColor: colores.bordeFuerte },
  o: { fontSize: 13, color: colores.textoSuave },
  google: { height: 56, borderRadius: 18, backgroundColor: colores.blanco, borderWidth: 1.5, borderColor: colores.bordeFuerte, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  googleAro: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: colores.marino },
  googleTexto: { fontWeight: '800', fontSize: 16, color: colores.marino },

  pie: { marginTop: 'auto', paddingTop: 24, paddingBottom: 28, alignItems: 'center', gap: 4 },
  pieTexto: { fontSize: 15, color: colores.textoSuave },
  pieEnlace: { fontWeight: '800', color: colores.marino, textDecorationLine: 'underline' },
  explorar: { minHeight: 40, justifyContent: 'center' },
  explorarTexto: { fontSize: 14, fontWeight: '700', color: colores.textoSuave },
});
