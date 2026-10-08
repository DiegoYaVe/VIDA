import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Dimensions, Image } from 'react-native';
import { Text, TextInput } from '../components/Texto';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import { ID_BRANCH, ID_CUENTA } from '../constants/config';
import { colores, logos, radios } from '../constants/tema';
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
      <Ionicons name={icon} size={19} color="#8C9BB0" style={{ marginRight: 8 }} />
      <TextInput style={styles.campoInput} placeholderTextColor="#8C9BB0" {...props} />
      {rightIcon ? (
        <TouchableOpacity onPress={onRightPress} style={{ padding: 6 }}>
          <Ionicons name={rightIcon} size={20} color="#8C9BB0" />
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
            <Image source={logos.completoOscuro} style={styles.logoImg} resizeMode="contain" accessibilityLabel="Comercializadora VIDA" />
            <View style={styles.repartidorChip}>
              <Text style={styles.repartidorChipText}>APP DE REPARTO</Text>
            </View>
            <Text style={styles.tagline}>Entrega en tu zona y cobra tus comisiones cada día.</Text>
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
                    <Text style={styles.cardTitle}>Bienvenido de vuelta</Text>
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
                    <Text style={styles.cardTitle}>Únete al equipo VIDA</Text>
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
                            <Ionicons name={v.icon} size={20} color={vehiculo === v.key ? '#fff' : '#4B5B73'} />
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
                  <View style={styles.primaryBtn}>
                    {loading
                      ? <ActivityIndicator color={colores.marino} />
                      : <>
                          <Text style={styles.primaryBtnText}>
                            {tab === 'login' ? 'Comenzar a repartir' : 'Enviar solicitud'}
                          </Text>
                          <Ionicons name="arrow-forward" size={18} color={colores.marino} />
                        </>
                    }
                  </View>
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
                  <Ionicons name={b.icon} size={16} color={colores.verde} />
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
  root: { flex: 1, backgroundColor: colores.marino },
  scroll: { flexGrow: 1, paddingBottom: 30 },

  hero: { alignItems: 'center', paddingTop: SCREEN_HEIGHT * 0.06, paddingBottom: 24, paddingHorizontal: 24, gap: 12 },
  logoImg: { width: 270, height: 130 },
  repartidorChip: { backgroundColor: colores.verde, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  repartidorChipText: { color: colores.marino, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  tagline: { color: colores.celesteClaro, fontSize: 15, fontWeight: '600', textAlign: 'center' },

  card: {
    marginHorizontal: 18, backgroundColor: colores.blanco, borderRadius: radios.enorme, padding: 22,
    shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.3, shadowRadius: 32, elevation: 14,
  },
  tabs: { flexDirection: 'row', backgroundColor: colores.fondo, borderRadius: 14, padding: 4, marginBottom: 16 },
  tabBtn: { flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: 'center' },
  tabBtnActive: { backgroundColor: colores.marino },
  tabText: { color: colores.textoSuave, fontWeight: '700', fontSize: 14 },
  tabTextActive: { color: colores.blanco, fontWeight: '800' },

  cardTitle: { fontSize: 20, fontWeight: '800', color: colores.marino, marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: colores.textoSuave, marginBottom: 16, lineHeight: 20 },

  alertError: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colores.errorClaro,
    borderRadius: 12, padding: 11, borderWidth: 1, borderColor: '#F5C2C2', marginBottom: 12,
  },
  alertErrorText: { color: colores.error, fontSize: 13, flex: 1 },

  campo: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colores.blanco,
    borderWidth: 1.5, borderColor: colores.bordeFuerte, borderRadius: radios.medio, paddingHorizontal: 14, minHeight: 52,
  },
  campoInput: { flex: 1, paddingVertical: 13, fontSize: 16, color: colores.marino },

  vehiculosRow: { flexDirection: 'row', gap: 8 },
  vehiculoBtn: {
    flex: 1, alignItems: 'center', gap: 4, minHeight: 56, justifyContent: 'center',
    backgroundColor: colores.fondo, borderRadius: 14, borderWidth: 1.5, borderColor: colores.borde,
  },
  vehiculoBtnActive: { backgroundColor: colores.marino, borderColor: colores.marino },
  vehiculoText: { fontSize: 12, fontWeight: '800', color: colores.textoSuave },
  vehiculoTextActive: { color: colores.blanco },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 18, minHeight: 58, marginTop: 18, backgroundColor: colores.celeste,
  },
  primaryBtnText: { color: colores.marino, fontSize: 17, fontWeight: '800' },

  pendienteWrap: { alignItems: 'center', paddingVertical: 10 },
  pendienteIcon: {
    width: 76, height: 76, borderRadius: 38, backgroundColor: colores.avisoClaro,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  pendienteTitle: { fontSize: 20, fontWeight: '800', color: colores.marino, marginBottom: 8 },
  pendienteText: { fontSize: 14, color: colores.textoSuave, textAlign: 'center', lineHeight: 20, marginBottom: 18 },
  pendienteBtn: { borderWidth: 1.5, borderColor: colores.bordeFuerte, borderRadius: 14, paddingHorizontal: 28, minHeight: 46, justifyContent: 'center' },
  pendienteBtnText: { color: colores.marino, fontWeight: '800', fontSize: 14 },

  beneficios: { marginTop: 26, paddingHorizontal: 36, gap: 12 },
  beneficioRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  beneficioIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colores.marinoClaro, alignItems: 'center', justifyContent: 'center' },
  beneficioText: { color: colores.celesteClaro, fontSize: 14, fontWeight: '600' },
});
