import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, Dimensions, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import { ID_BRANCH, ID_CUENTA, GOOGLE_WEB_CLIENT_ID } from '../../constants/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Campo de texto con ícono a la izquierda
function Campo({ icon, rightIcon, onRightPress, ...props }) {
  return (
    <View style={styles.campo}>
      <Ionicons name={icon} size={19} color="#94A3B8" style={styles.campoIcon} />
      <TextInput
        style={styles.campoInput}
        placeholderTextColor="#A0AEC0"
        {...props}
      />
      {rightIcon ? (
        <TouchableOpacity onPress={onRightPress} style={styles.campoRight}>
          <Ionicons name={rightIcon} size={20} color="#94A3B8" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function LoginScreen() {
  const router = useRouter();
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
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const resultado = await GoogleSignin.signIn();
      // v13+ regresa { type, data:{ idToken } }; versiones previas { idToken }
      if (resultado?.type === 'cancelled') return;
      const idToken = resultado?.data?.idToken ?? resultado?.idToken;
      if (!idToken) { setError('Google no entregó el token. Intenta de nuevo.'); return; }

      const r = await api.post('/delivery/cliente/google/native', {
        idBranch: ID_BRANCH, idCuenta: ID_CUENTA, idToken,
      });
      await AsyncStorage.setItem('vida_cliente_token', r.data.token);
      login({ cliente: { idCliente: Number(r.data.idCliente), Nombre: r.data.Nombre, Email: r.data.Email }, token: r.data.token });
    } catch (e) {
      // Cancelación del selector de cuenta no es un error
      if (String(e?.code) === '12501' || /cancel/i.test(String(e?.message))) return;
      setError(e.response?.data?.error || e.message);
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
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Fondo degradado a pantalla completa con adornos */}
      <LinearGradient
        colors={['#0D1B2A', '#14507A', '#1A6A9A']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.8, y: 1 }}
      />
      <View style={[styles.deco, styles.decoUno]} />
      <View style={[styles.deco, styles.decoDos]} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero con logo */}
          <View style={styles.hero}>
            <View style={styles.logoRing}>
              <Image source={require('../../assets/icon.png')} style={styles.logoImg} />
            </View>
            <Text style={styles.logoText}>VIDA</Text>
            <View style={styles.taglinePill}>
              <Ionicons name="bicycle" size={14} color="#7FDCA4" />
              <Text style={styles.taglineText}>Tu tienda favorita, a tu puerta</Text>
            </View>
          </View>

          {/* Tarjeta */}
          <View style={styles.card}>
            {/* Tabs */}
            <View style={styles.tabs}>
              {['login', 'registro'].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
                  onPress={() => { setTab(t); setError(''); setSuccessMsg(''); }}
                >
                  <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                    {t === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {error ? (
              <View style={styles.alertError}>
                <Ionicons name="alert-circle" size={16} color="#E53E3E" />
                <Text style={styles.alertErrorText}>{error}</Text>
              </View>
            ) : null}
            {successMsg ? (
              <View style={styles.alertOk}>
                <Text style={styles.alertOkText}>{successMsg}</Text>
              </View>
            ) : null}

            {/* Google */}
            <TouchableOpacity
              style={styles.googleBtn}
              onPress={handleGoogleSignIn}
              disabled={googleLoading}
              activeOpacity={0.85}
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
              <Text style={styles.dividerText}>o con tu teléfono</Text>
              <View style={styles.dividerLine} />
            </View>

            {tab === 'login' ? (
              <View style={styles.form}>
                <Campo
                  icon="call-outline"
                  placeholder="Teléfono (04XX-XXXXXXX)"
                  keyboardType="phone-pad"
                  value={telefono}
                  onChangeText={setTelefono}
                />
                <Campo
                  icon="lock-closed-outline"
                  placeholder="Contraseña (si la configuraste)"
                  secureTextEntry={!showPass}
                  value={password}
                  onChangeText={setPassword}
                  rightIcon={showPass ? 'eye-off-outline' : 'eye-outline'}
                  onRightPress={() => setShowPass(v => !v)}
                />
              </View>
            ) : (
              <View style={styles.form}>
                <Campo icon="person-outline" placeholder="Nombre *" value={nombre} onChangeText={setNombre} />
                <Campo icon="people-outline" placeholder="Apellidos" value={apellidos} onChangeText={setApellidos} />
                <Campo icon="call-outline" placeholder="Teléfono * (04XX-XXXXXXX)" keyboardType="phone-pad" value={telefonoReg} onChangeText={setTelefonoReg} />
                <Campo icon="mail-outline" placeholder="Correo electrónico" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
                <Campo
                  icon="lock-closed-outline"
                  placeholder="Contraseña (mínimo 6 caracteres)"
                  secureTextEntry={!showPassReg}
                  value={passwordReg}
                  onChangeText={setPasswordReg}
                  rightIcon={showPassReg ? 'eye-off-outline' : 'eye-outline'}
                  onRightPress={() => setShowPassReg(v => !v)}
                />
              </View>
            )}

            {/* Botón principal con gradiente */}
            <TouchableOpacity
              onPress={tab === 'login' ? handleLogin : handleRegistro}
              disabled={loading}
              activeOpacity={0.9}
              style={loading ? { opacity: 0.7 } : null}
            >
              <LinearGradient
                colors={['#27AE60', '#1F9E56']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.primaryBtn}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Text style={styles.primaryBtnText}>
                        {tab === 'login' ? 'Entrar' : 'Crear mi cuenta'}
                      </Text>
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </>
                }
              </LinearGradient>
            </TouchableOpacity>

            {tab === 'registro' && (
              <Text style={styles.microcopy}>
                Al crear tu cuenta aceptas nuestros términos y condiciones
              </Text>
            )}
          </View>

          {/* Guest-first */}
          <TouchableOpacity
            style={styles.guestBtn}
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.8}
          >
            <Ionicons name="storefront-outline" size={16} color="#fff" />
            <Text style={styles.guestBtnText}>Explorar la tienda sin cuenta</Text>
            <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D1B2A' },
  scroll: { flexGrow: 1, paddingBottom: 30 },

  // Adornos del fondo
  deco: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.05)' },
  decoUno: { width: 280, height: 280, top: -90, right: -80 },
  decoDos: { width: 200, height: 200, top: SCREEN_HEIGHT * 0.28, left: -100, backgroundColor: 'rgba(39,174,96,0.12)' },

  // Hero
  hero: { alignItems: 'center', paddingTop: SCREEN_HEIGHT * 0.075, paddingBottom: 28 },
  logoRing: {
    width: 92, height: 92, borderRadius: 46,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  logoImg: { width: 62, height: 62, borderRadius: 31 },
  logoText: { fontSize: 44, fontWeight: '900', color: '#fff', letterSpacing: 14, marginLeft: 14 },
  taglinePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginTop: 10,
  },
  taglineText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600' },

  // Tarjeta
  card: {
    marginHorizontal: 18, backgroundColor: '#fff', borderRadius: 28, padding: 22,
    shadowColor: '#000', shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25, shadowRadius: 32, elevation: 14,
  },
  tabs: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 14, padding: 4, marginBottom: 16 },
  tabBtn: { flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: 'center' },
  tabBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  tabText: { color: '#94A3B8', fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: '#1A6A9A', fontWeight: '800' },

  alertError: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFF5F5', borderRadius: 12, padding: 11,
    borderWidth: 1, borderColor: '#FED7D7', marginBottom: 12,
  },
  alertErrorText: { color: '#C53030', fontSize: 13, flex: 1 },
  alertOk: {
    backgroundColor: '#F0FFF4', borderRadius: 12, padding: 11,
    borderWidth: 1, borderColor: '#9AE6B4', marginBottom: 12,
  },
  alertOkText: { color: '#276749', fontSize: 13, textAlign: 'center' },

  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14,
    paddingVertical: 13, gap: 10, backgroundColor: '#fff',
  },
  googleIcon: { fontSize: 18, fontWeight: '900', color: '#EA4335' },
  googleBtnText: { fontSize: 15, fontWeight: '700', color: '#374151' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { color: '#A0AEC0', fontSize: 12, fontWeight: '600' },

  form: { gap: 10 },
  campo: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F7FAFC', borderWidth: 1.5, borderColor: '#E8EEF4',
    borderRadius: 14, paddingHorizontal: 12,
  },
  campoIcon: { marginRight: 8 },
  campoInput: { flex: 1, paddingVertical: 13, fontSize: 15, color: '#1A202C' },
  campoRight: { padding: 6 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 16, paddingVertical: 16, marginTop: 18,
    shadowColor: '#27AE60', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  microcopy: { color: '#A0AEC0', fontSize: 11.5, textAlign: 'center', marginTop: 12 },

  guestBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    alignSelf: 'center', marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12,
  },
  guestBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
