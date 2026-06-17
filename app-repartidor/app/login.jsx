import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
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
      setError(e.message);
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
        {/* Gradient hero */}
        <View style={styles.hero}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoIcon}>🛵</Text>
          </View>
          <Text style={styles.logoText}>VIDA</Text>
          <Text style={styles.logoSub}>Repartidor</Text>
          <Text style={styles.logoTagline}>Panel del conductor</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Iniciar sesión</Text>
          <Text style={styles.cardSubtitle}>Ingresa tu número de teléfono registrado</Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Text style={styles.label}>Número de teléfono</Text>
          <TextInput
            style={styles.input}
            placeholder="04XX-XXXXXXX"
            placeholderTextColor="#A0AEC0"
            keyboardType="phone-pad"
            value={telefono}
            onChangeText={setTelefono}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Entrar</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const HERO_HEIGHT = SCREEN_HEIGHT * 0.42;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D3D5C' },
  scroll: { flexGrow: 1 },
  hero: {
    height: HERO_HEIGHT,
    backgroundColor: '#1A6A9A',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 50,
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoIcon: { fontSize: 36 },
  logoText: {
    fontSize: 52,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 10,
  },
  logoSub: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 4,
    marginTop: 2,
  },
  logoTagline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 8,
  },
  card: {
    marginHorizontal: 20,
    marginTop: -40,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
    marginBottom: 40,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A202C',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#718096',
    marginBottom: 20,
  },
  label: {
    color: '#4A5568',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A202C',
    backgroundColor: '#FAFAFA',
  },
  primaryBtn: {
    backgroundColor: '#27AE60',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#27AE60',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 0.5 },
  errorText: {
    color: '#E53E3E',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
    backgroundColor: '#FFF5F5',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FED7D7',
  },
});
