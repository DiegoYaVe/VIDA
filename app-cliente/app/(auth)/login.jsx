import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

WebBrowser.maybeCompleteAuthSession();
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import { API_URL, ID_BRANCH, ID_CUENTA } from '../../constants/config';
import AsyncStorage from '@react-native-async-storage/async-storage';


const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function LoginScreen() {
  const [tab, setTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Login
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Registro
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [telefonoReg, setTelefonoReg] = useState('');
  const [email, setEmail] = useState('');
  const [passwordReg, setPasswordReg] = useState('');
  const [showPassReg, setShowPassReg] = useState(false);

  const login = useAuthStore((s) => s.login);

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const appRedirectUri = Linking.createURL('google-auth');
      const googleUrl = `${API_URL}/delivery/cliente/google/start?idBranch=${ID_BRANCH}&idCuenta=${ID_CUENTA}&appRedirectUri=${encodeURIComponent(appRedirectUri)}`;
      const result = await WebBrowser.openAuthSessionAsync(googleUrl, appRedirectUri);

      if (result.type !== 'success') { setGoogleLoading(false); return; }

      // Parsear el deep link de retorno
      const parsed = Linking.parse(result.url);
      const { token, nombre, id, error: authError } = parsed.queryParams || {};

      if (authError || !token) {
        setError('No se pudo iniciar sesión con Google');
        return;
      }
      await AsyncStorage.setItem('vida_cliente_token', token);
      login({ cliente: { idCliente: Number(id), Nombre: nombre }, token });
    } catch (e) {
      setError(e.message);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!telefono.trim()) { setError('Ingresa tu número de teléfono'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/delivery/cliente/login', {
        idBranch: ID_BRANCH,
        idCuenta: ID_CUENTA,
        Telefono: telefono.trim(),
        Contrasena: password || undefined,
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
    if (!nombre.trim() || !telefonoReg.trim()) {
      setError('Nombre y teléfono son obligatorios');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/delivery/cliente/registro', {
        idBranch: ID_BRANCH,
        idCuenta: ID_CUENTA,
        Nombre: nombre.trim(),
        Apellidos: apellidos.trim(),
        Telefono: telefonoReg.trim(),
        Email: email.trim() || undefined,
        Contrasena: passwordReg || undefined,
        FcmToken: '',
      });
      const { token, idCliente, emailPendiente } = res.data;
      await AsyncStorage.setItem('vida_cliente_token', token);
      if (emailPendiente) {
        setSuccessMsg('✅ Cuenta creada. Revisa tu correo para confirmar tu email.');
      }
      login({ cliente: { idCliente, Nombre: nombre.trim() }, token });
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['#1A6A9A', '#27AE60']}
          style={styles.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.logoText}>VIDA</Text>
          <Text style={styles.logoSub}>Tu tienda favorita, a tu puerta</Text>
        </LinearGradient>

        <View style={styles.card}>
          <View style={styles.tabs}>
            {['login', 'registro'].map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
                onPress={() => { setTab(t); setError(''); setSuccessMsg(''); }}
              >
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                  {t === 'login' ? 'Iniciar sesión' : 'Registrarse'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {successMsg ? <Text style={styles.successText}>{successMsg}</Text> : null}

          {/* Google button */}
          <TouchableOpacity
            style={styles.googleBtn}
            onPress={handleGoogleSignIn}
            disabled={googleLoading}
          >
            {googleLoading
              ? <ActivityIndicator color="#555" />
              : <>
                  <Text style={styles.googleIcon}>G</Text>
                  <Text style={styles.googleBtnText}>Continuar con Google</Text>
                </>
            }
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>o</Text>
            <View style={styles.dividerLine} />
          </View>

          {tab === 'login' ? (
            <View>
              <Text style={styles.label}>Teléfono *</Text>
              <TextInput
                style={styles.input}
                placeholder="04XX-XXXXXXX"
                placeholderTextColor="#A0AEC0"
                keyboardType="phone-pad"
                value={telefono}
                onChangeText={setTelefono}
              />
              <Text style={styles.label}>Contraseña</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Tu contraseña (opcional si no la configuraste)"
                  placeholderTextColor="#A0AEC0"
                  secureTextEntry={!showPass}
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPass(v => !v)}>
                  <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color="#718096" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.btnDisabled]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Entrar</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={styles.label}>Nombre *</Text>
              <TextInput style={styles.input} placeholder="Tu nombre" placeholderTextColor="#A0AEC0" value={nombre} onChangeText={setNombre} />
              <Text style={styles.label}>Apellidos</Text>
              <TextInput style={styles.input} placeholder="Tus apellidos" placeholderTextColor="#A0AEC0" value={apellidos} onChangeText={setApellidos} />
              <Text style={styles.label}>Teléfono *</Text>
              <TextInput style={styles.input} placeholder="04XX-XXXXXXX" placeholderTextColor="#A0AEC0" keyboardType="phone-pad" value={telefonoReg} onChangeText={setTelefonoReg} />
              <Text style={styles.label}>Correo electrónico</Text>
              <TextInput style={styles.input} placeholder="correo@ejemplo.com" placeholderTextColor="#A0AEC0" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
              <Text style={styles.label}>Contraseña</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Mínimo 6 caracteres"
                  placeholderTextColor="#A0AEC0"
                  secureTextEntry={!showPassReg}
                  value={passwordReg}
                  onChangeText={setPasswordReg}
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassReg(v => !v)}>
                  <Ionicons name={showPassReg ? 'eye-off-outline' : 'eye-outline'} size={20} color="#718096" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.btnDisabled]}
                onPress={handleRegistro}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Crear cuenta</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const HERO_HEIGHT = SCREEN_HEIGHT * 0.32;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  scroll: { flexGrow: 1 },
  hero: { height: HERO_HEIGHT, justifyContent: 'center', alignItems: 'center', paddingBottom: 40 },
  logoText: { fontSize: 64, fontWeight: '900', color: '#fff', letterSpacing: 12 },
  logoSub: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 8, textAlign: 'center', paddingHorizontal: 24 },
  card: {
    marginHorizontal: 20, marginTop: -50, backgroundColor: '#fff',
    borderRadius: 20, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12, shadowRadius: 24, elevation: 8, marginBottom: 40,
  },
  tabs: { flexDirection: 'row', backgroundColor: '#F5F7FA', borderRadius: 12, padding: 4, marginBottom: 16 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 },
  tabText: { color: '#718096', fontWeight: '500', fontSize: 14 },
  tabTextActive: { color: '#1A6A9A', fontWeight: '700' },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14,
    paddingVertical: 13, gap: 10, backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  googleIcon: { fontSize: 18, fontWeight: '900', color: '#EA4335' },
  googleBtnText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { color: '#A0AEC0', fontSize: 13 },
  label: { color: '#4A5568', fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    color: '#1A202C', backgroundColor: '#FAFAFA',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: { padding: 12 },
  primaryBtn: {
    backgroundColor: '#27AE60', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 20,
    shadowColor: '#27AE60', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  errorText: {
    color: '#E53E3E', fontSize: 13, textAlign: 'center', marginBottom: 10,
    backgroundColor: '#FFF5F5', borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: '#FED7D7',
  },
  successText: {
    color: '#276749', fontSize: 13, textAlign: 'center', marginBottom: 10,
    backgroundColor: '#F0FFF4', borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: '#9AE6B4',
  },
});
