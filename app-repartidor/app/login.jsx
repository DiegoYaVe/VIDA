import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import { ID_BRANCH, ID_CUENTA } from '../constants/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const VEHICULOS = [
  { key: 'Moto',      icon: 'bicycle' },
  { key: 'Bicicleta', icon: 'bicycle-outline' },
  { key: 'Carro',     icon: 'car-outline' },
];

function Campo({ icon, rightIcon, onRightPress, ...props }) {
  return (
    <View style={styles.campo}>
      <Ionicons name={icon} size={19} color="#94A3B8" style={{ marginRight: 8 }} />
      <TextInput style={styles.campoInput} placeholderTextColor="#A0AEC0" {...props} />
      {rightIcon ? (
        <TouchableOpacity onPress={onRightPress} style={{ padding: 6 }}>
          <Ionicons name={rightIcon} size={20} color="#94A3B8" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function LoginScreen() {
  const [tab, setTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendiente, setPendiente] = useState(false); // solicitud enviada o en revisión

  // Login
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Registro
  const [nombre, setNombre] = useState('');
  const [telefonoReg, setTelefonoReg] = useState('');
  const [vehiculo, setVehiculo] = useState('Moto');
  const [placa, setPlaca] = useState('');
  const [passwordReg, setPasswordReg] = useState('');
  const [showPassReg, setShowPassReg] = useState(false);

  const login = useAuthStore((s) => s.login);

  const handleLogin = async () => {
    if (!telefono.trim()) {
      setError('Ingresa tu número de teléfono');
      return;
    }
    if (!password) {
      setError('Ingresa tu contraseña');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/delivery/repartidor/login', {
        idBranch: ID_BRANCH,
        idCuenta: ID_CUENTA,
        Telefono: telefono.trim(),
        Contrasena: password,
        FcmToken: '',
      });
      const { token, repartidor } = res.data;
      await AsyncStorage.setItem('vida_repartidor_token', token);
      login({ repartidor, token });
    } catch (e) {
      if (e.response?.data?.codigo === 'PENDIENTE_APROBACION') {
        setPendiente(true);
      } else {
        setError(e.response?.data?.error || e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegistro = async () => {
    if (!nombre.trim() || !telefonoReg.trim()) {
      setError('Nombre y teléfono son obligatorios');
      return;
    }
    if (!passwordReg || passwordReg.length < 6) {
      setError('La contraseña es obligatoria (mínimo 6 caracteres)');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.post('/delivery/repartidor/registro', {
        idBranch: ID_BRANCH,
        idCuenta: ID_CUENTA,
        Nombre: nombre.trim(),
        Telefono: telefonoReg.trim(),
        Vehiculo: vehiculo,
        PlacaVehiculo: placa.trim() || undefined,
        Contrasena: passwordReg,
      });
      setPendiente(true);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <LinearGradient
        colors={['#0D1B2A', '#11304A', '#14507A']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 1 }}
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
          {/* Hero */}
          <View style={styles.hero}>
            <LinearGradient
              colors={['#27AE60', '#1A6A9A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoBadge}
            >
              <Ionicons name="bicycle" size={42} color="#fff" />
            </LinearGradient>
            <Text style={styles.logoText}>VIDA</Text>
            <View style={styles.repartidorChip}>
              <Text style={styles.repartidorChipText}>REPARTIDOR</Text>
            </View>
            <Text style={styles.tagline}>Entrega. Gana. Repite.</Text>
          </View>

          {/* Tarjeta */}
          <View style={styles.card}>
            {pendiente ? (
              /* Estado: solicitud en revisión */
              <View style={styles.pendienteWrap}>
                <View style={styles.pendienteIcon}>
                  <Ionicons name="hourglass-outline" size={38} color="#D69E2E" />
                </View>
                <Text style={styles.pendienteTitle}>Solicitud en revisión</Text>
                <Text style={styles.pendienteText}>
                  El administrador revisará tu solicitud. Te avisaremos cuando tu
                  cuenta esté aprobada y puedas comenzar a repartir.
                </Text>
                <TouchableOpacity
                  style={styles.pendienteBtn}
                  onPress={() => { setPendiente(false); setTab('login'); setError(''); }}
                >
                  <Text style={styles.pendienteBtnText}>Volver</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Tabs */}
                <View style={styles.tabs}>
                  {['login', 'registro'].map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
                      onPress={() => { setTab(t); setError(''); }}
                    >
                      <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                        {t === 'login' ? 'Iniciar sesión' : 'Quiero repartir'}
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

                {tab === 'login' ? (
                  <>
                    <Text style={styles.cardTitle}>Bienvenido de vuelta 👋</Text>
                    <Text style={styles.cardSubtitle}>Ingresa con tu teléfono y contraseña</Text>
                    <View style={{ gap: 10 }}>
                      <Campo
                        icon="call-outline"
                        placeholder="04XX-XXXXXXX"
                        keyboardType="phone-pad"
                        value={telefono}
                        onChangeText={setTelefono}
                      />
                      <Campo
                        icon="lock-closed-outline"
                        placeholder="Contraseña"
                        secureTextEntry={!showPass}
                        value={password}
                        onChangeText={setPassword}
                        rightIcon={showPass ? 'eye-off-outline' : 'eye-outline'}
                        onRightPress={() => setShowPass(v => !v)}
                        returnKeyType="done"
                        onSubmitEditing={handleLogin}
                      />
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.cardTitle}>Únete al equipo 🛵</Text>
                    <Text style={styles.cardSubtitle}>
                      Llena tus datos y el administrador aprobará tu cuenta
                    </Text>
                    <View style={{ gap: 10 }}>
                      <Campo icon="person-outline" placeholder="Nombre completo *" value={nombre} onChangeText={setNombre} />
                      <Campo icon="call-outline" placeholder="Teléfono * (04XX-XXXXXXX)" keyboardType="phone-pad" value={telefonoReg} onChangeText={setTelefonoReg} />

                      {/* Selector de vehículo */}
                      <View style={styles.vehiculosRow}>
                        {VEHICULOS.map(v => (
                          <TouchableOpacity
                            key={v.key}
                            style={[styles.vehiculoBtn, vehiculo === v.key && styles.vehiculoBtnActive]}
                            onPress={() => setVehiculo(v.key)}
                          >
                            <Ionicons name={v.icon} size={20} color={vehiculo === v.key ? '#fff' : '#64748B'} />
                            <Text style={[styles.vehiculoText, vehiculo === v.key && styles.vehiculoTextActive]}>
                              {v.key}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {vehiculo !== 'Bicicleta' && (
                        <Campo icon="pricetag-outline" placeholder="Placa del vehículo" autoCapitalize="characters" value={placa} onChangeText={setPlaca} />
                      )}

                      <Campo
                        icon="lock-closed-outline"
                        placeholder="Contraseña * (mínimo 6 caracteres)"
                        secureTextEntry={!showPassReg}
                        value={passwordReg}
                        onChangeText={setPasswordReg}
                        rightIcon={showPassReg ? 'eye-off-outline' : 'eye-outline'}
                        onRightPress={() => setShowPassReg(v => !v)}
                      />
                    </View>
                  </>
                )}

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
                            {tab === 'login' ? 'Comenzar a repartir' : 'Enviar solicitud'}
                          </Text>
                          <Ionicons name="arrow-forward" size={18} color="#fff" />
                        </>
                    }
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Beneficios */}
          <View style={styles.beneficios}>
            {[
              { icon: 'cash-outline', texto: 'Gana comisión por entrega' },
              { icon: 'notifications-outline', texto: 'Pedidos cercanos al instante' },
              { icon: 'map-outline', texto: 'Navegación integrada' },
            ].map((b) => (
              <View key={b.icon} style={styles.beneficioRow}>
                <View style={styles.beneficioIcon}>
                  <Ionicons name={b.icon} size={16} color="#7FDCA4" />
                </View>
                <Text style={styles.beneficioText}>{b.texto}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D1B2A' },
  scroll: { flexGrow: 1, paddingBottom: 30 },

  deco: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.05)' },
  decoUno: { width: 300, height: 300, top: -110, left: -90 },
  decoDos: { width: 220, height: 220, top: SCREEN_HEIGHT * 0.3, right: -110, backgroundColor: 'rgba(39,174,96,0.12)' },

  hero: { alignItems: 'center', paddingTop: SCREEN_HEIGHT * 0.07, paddingBottom: 26 },
  logoBadge: {
    width: 84, height: 84, borderRadius: 42,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    shadowColor: '#27AE60', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45, shadowRadius: 16, elevation: 10,
  },
  logoText: { fontSize: 40, fontWeight: '900', color: '#fff', letterSpacing: 12, marginLeft: 12 },
  repartidorChip: {
    backgroundColor: 'rgba(39,174,96,0.2)',
    borderWidth: 1, borderColor: 'rgba(39,174,96,0.5)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, marginTop: 8,
  },
  repartidorChipText: { color: '#7FDCA4', fontSize: 12, fontWeight: '800', letterSpacing: 3 },
  tagline: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 10, fontWeight: '600' },

  card: {
    marginHorizontal: 18, backgroundColor: '#fff', borderRadius: 28, padding: 22,
    shadowColor: '#000', shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3, shadowRadius: 32, elevation: 14,
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

  cardTitle: { fontSize: 20, fontWeight: '800', color: '#1A202C', marginBottom: 4 },
  cardSubtitle: { fontSize: 13.5, color: '#718096', marginBottom: 16, lineHeight: 19 },

  alertError: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFF5F5', borderRadius: 12, padding: 11,
    borderWidth: 1, borderColor: '#FED7D7', marginBottom: 12,
  },
  alertErrorText: { color: '#C53030', fontSize: 13, flex: 1 },

  campo: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F7FAFC', borderWidth: 1.5, borderColor: '#E8EEF4',
    borderRadius: 14, paddingHorizontal: 12,
  },
  campoInput: { flex: 1, paddingVertical: 13, fontSize: 15, color: '#1A202C' },

  vehiculosRow: { flexDirection: 'row', gap: 8 },
  vehiculoBtn: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: '#F1F5F9', borderRadius: 12, paddingVertical: 10,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  vehiculoBtnActive: { backgroundColor: '#1A6A9A', borderColor: '#1A6A9A' },
  vehiculoText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  vehiculoTextActive: { color: '#fff' },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 16, paddingVertical: 16, marginTop: 18,
    shadowColor: '#27AE60', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  pendienteWrap: { alignItems: 'center', paddingVertical: 10 },
  pendienteIcon: {
    width: 76, height: 76, borderRadius: 38, backgroundColor: '#FFFBEB',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  pendienteTitle: { fontSize: 19, fontWeight: '800', color: '#1A202C', marginBottom: 8 },
  pendienteText: { fontSize: 13.5, color: '#718096', textAlign: 'center', lineHeight: 20, marginBottom: 18 },
  pendienteBtn: {
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12,
    paddingHorizontal: 28, paddingVertical: 11,
  },
  pendienteBtnText: { color: '#4A5568', fontWeight: '700', fontSize: 14 },

  beneficios: { marginTop: 26, paddingHorizontal: 40, gap: 12 },
  beneficioRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  beneficioIcon: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(39,174,96,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  beneficioText: { color: 'rgba(255,255,255,0.75)', fontSize: 13.5, fontWeight: '600' },
});
