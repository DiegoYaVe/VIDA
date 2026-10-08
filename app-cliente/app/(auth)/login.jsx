import { useState, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Dimensions, Image } from 'react-native';
import { Text, TextInput } from '../../components/Texto';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';

import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import { ID_BRANCH, ID_CUENTA, GOOGLE_WEB_CLIENT_ID } from '../../constants/config';
import { colores, logos, radios } from '../../constants/tema';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Google Sign-In es un módulo NATIVO que Expo Go no incluye: importarlo en Expo
// Go revienta con "RNGoogleSignin could not be found". Por eso se carga de forma
// perezosa y solo fuera de Expo Go (dev client / build de EAS). En Expo Go el
// login con Google queda deshabilitado, pero el login por teléfono sí funciona.
const EN_EXPO_GO = Constants.executionEnvironment === 'storeClient';
let GoogleSignin = null;
if (!EN_EXPO_GO) {
  try {
    GoogleSignin = require('@react-native-google-signin/google-signin').GoogleSignin;
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  } catch {
    GoogleSignin = null;
  }
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Campo de texto con ícono a la izquierda
function Campo({ icon, rightIcon, onRightPress, ...props }) {
  return (
    <View style={styles.campo}>
      <Ionicons name={icon} size={19} color="#8C9BB0" style={styles.campoIcon} />
      <TextInput
        style={styles.campoInput}
        placeholderTextColor="#8C9BB0"
        {...props}
      />
      {rightIcon ? (
        <TouchableOpacity onPress={onRightPress} style={styles.campoRight}>
          <Ionicons name={rightIcon} size={20} color="#8C9BB0" />
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
    if (!GoogleSignin) {
      setError('El acceso con Google no está disponible en Expo Go. Usa tu teléfono y contraseña, o instala la app compilada (APK/dev client).');
      return;
    }
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


      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero con el logo de Comercializadora VIDA (fondo marino = el del logo) */}
          <View style={styles.hero}>
            <Image source={logos.completoOscuro} style={styles.logoImg} resizeMode="contain" accessibilityLabel="Comercializadora VIDA" />
            <Text style={styles.tagline}>Tu bodega y tu agua,{'\n'}en la puerta de tu casa.</Text>
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

            {/* Google — solo si el módulo nativo está disponible (no en Expo Go) */}
            {GoogleSignin && (
              <>
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
              </>
            )}

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
              <View style={styles.primaryBtn}>
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Text style={styles.primaryBtnText}>
                        {tab === 'login' ? 'Entrar' : 'Crear mi cuenta'}
                      </Text>
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </>
                }
              </View>
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
  root: { flex: 1, backgroundColor: colores.marino },
  scroll: { flexGrow: 1, paddingBottom: 30 },

  // Hero
  hero: { alignItems: 'center', paddingTop: SCREEN_HEIGHT * 0.07, paddingBottom: 26, paddingHorizontal: 24, gap: 16 },
  logoImg: { width: 280, height: 135 },
  tagline: { color: colores.celesteClaro, fontSize: 18, fontWeight: '600', textAlign: 'center', lineHeight: 25 },

  // Tarjeta
  card: {
    marginHorizontal: 18, backgroundColor: colores.blanco, borderRadius: radios.enorme, padding: 22,
    shadowColor: '#000', shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25, shadowRadius: 32, elevation: 14,
  },
  tabs: { flexDirection: 'row', backgroundColor: colores.fondo, borderRadius: 14, padding: 4, marginBottom: 16 },
  tabBtn: { flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: 'center' },
  tabBtnActive: { backgroundColor: colores.marino },
  tabText: { color: colores.textoSuave, fontWeight: '700', fontSize: 14 },
  tabTextActive: { color: colores.blanco, fontWeight: '800' },

  alertError: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colores.errorClaro, borderRadius: 12, padding: 11,
    borderWidth: 1, borderColor: '#F5C2C2', marginBottom: 12,
  },
  alertErrorText: { color: colores.error, fontSize: 13, flex: 1 },
  alertOk: {
    backgroundColor: colores.verdeClaro, borderRadius: 12, padding: 11,
    borderWidth: 1, borderColor: '#A8DDB6', marginBottom: 12,
  },
  alertOkText: { color: colores.verdeTexto, fontSize: 13, textAlign: 'center' },

  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colores.bordeFuerte, borderRadius: radios.medio,
    paddingVertical: 14, gap: 10, backgroundColor: colores.blanco,
  },
  googleIcon: { fontSize: 18, fontWeight: '900', color: '#EA4335' },
  googleBtnText: { fontSize: 15, fontWeight: '800', color: colores.texto },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colores.borde },
  dividerText: { color: colores.textoSuave, fontSize: 12, fontWeight: '600' },

  form: { gap: 10 },
  campo: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colores.blanco, borderWidth: 1.5, borderColor: colores.bordeFuerte,
    borderRadius: radios.medio, paddingHorizontal: 14, minHeight: 52,
  },
  campoIcon: { marginRight: 8 },
  campoInput: { flex: 1, paddingVertical: 13, fontSize: 16, color: colores.texto },
  campoRight: { padding: 8 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 18, minHeight: 56, marginTop: 18, backgroundColor: colores.marino,
  },
  primaryBtnText: { color: colores.blanco, fontSize: 17, fontWeight: '800' },
  microcopy: { color: colores.textoSuave, fontSize: 12, textAlign: 'center', marginTop: 12 },

  guestBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    alignSelf: 'center', marginTop: 20, minHeight: 48,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: 24, paddingHorizontal: 20,
  },
  guestBtnText: { color: colores.blanco, fontSize: 14, fontWeight: '700' },
});
