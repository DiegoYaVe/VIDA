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

export default function LoginScreen() {
  const [telefono, setTelefono] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const login = useAuthStore((s) => s.login);

  const handleLogin = async () => {
    if (!telefono.trim()) {
      setError('Ingresa tu número de teléfono');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/delivery/repartidor/login', {
        idBranch: ID_BRANCH,
        idCuenta: ID_CUENTA,
        Telefono: telefono.trim(),
        FcmToken: '',
      });
      const { token, repartidor } = res.data;
      await AsyncStorage.setItem('vida_repartidor_token', token);
      login({ repartidor, token });
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Fondo degradado con adornos */}
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
            <Text style={styles.cardTitle}>Bienvenido de vuelta 👋</Text>
            <Text style={styles.cardSubtitle}>
              Ingresa con el teléfono que registró tu administrador
            </Text>

            {error ? (
              <View style={styles.alertError}>
                <Ionicons name="alert-circle" size={16} color="#E53E3E" />
                <Text style={styles.alertErrorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.campo}>
              <Ionicons name="call-outline" size={19} color="#94A3B8" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.campoInput}
                placeholder="04XX-XXXXXXX"
                placeholderTextColor="#A0AEC0"
                keyboardType="phone-pad"
                value={telefono}
                onChangeText={setTelefono}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
            </View>

            <TouchableOpacity
              onPress={handleLogin}
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
                      <Text style={styles.primaryBtnText}>Comenzar a repartir</Text>
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </>
                }
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.footerInfo}>
              <Ionicons name="information-circle-outline" size={15} color="#94A3B8" />
              <Text style={styles.footerInfoText}>
                ¿No tienes cuenta? Pídele al administrador que te registre.
              </Text>
            </View>
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

  hero: { alignItems: 'center', paddingTop: SCREEN_HEIGHT * 0.09, paddingBottom: 30 },
  logoBadge: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    shadowColor: '#27AE60', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45, shadowRadius: 16, elevation: 10,
  },
  logoText: { fontSize: 42, fontWeight: '900', color: '#fff', letterSpacing: 12, marginLeft: 12 },
  repartidorChip: {
    backgroundColor: 'rgba(39,174,96,0.2)',
    borderWidth: 1, borderColor: 'rgba(39,174,96,0.5)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, marginTop: 8,
  },
  repartidorChipText: { color: '#7FDCA4', fontSize: 12, fontWeight: '800', letterSpacing: 3 },
  tagline: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 10, fontWeight: '600' },

  card: {
    marginHorizontal: 18, backgroundColor: '#fff', borderRadius: 28, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3, shadowRadius: 32, elevation: 14,
  },
  cardTitle: { fontSize: 21, fontWeight: '800', color: '#1A202C', marginBottom: 4 },
  cardSubtitle: { fontSize: 13.5, color: '#718096', marginBottom: 18, lineHeight: 19 },

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
  campoInput: { flex: 1, paddingVertical: 14, fontSize: 16, color: '#1A202C' },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 16, paddingVertical: 16, marginTop: 18,
    shadowColor: '#27AE60', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  footerInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, justifyContent: 'center' },
  footerInfoText: { color: '#94A3B8', fontSize: 12 },

  beneficios: { marginTop: 26, paddingHorizontal: 40, gap: 12 },
  beneficioRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  beneficioIcon: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(39,174,96,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  beneficioText: { color: 'rgba(255,255,255,0.75)', fontSize: 13.5, fontWeight: '600' },
});
