import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import api from '../services/api';

function PasswordField({ label, value, onChangeText, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldRow}>
        <Ionicons name="lock-closed-outline" size={18} color="#A0AEC0" style={{ marginRight: 10 }} />
        <TextInput
          style={styles.fieldInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#CBD5E0"
          secureTextEntry={!show}
          autoCapitalize="none"
        />
        <TouchableOpacity onPress={() => setShow(v => !v)}>
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color="#A0AEC0" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function PerfilPasswordScreen() {
  const router = useRouter();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [guardando, setGuardando] = useState(false);

  const handleGuardar = async () => {
    if (!nueva || nueva.length < 6) {
      Alert.alert('Contraseña muy corta', 'Debe tener al menos 6 caracteres.');
      return;
    }
    if (nueva !== confirmar) {
      Alert.alert('No coinciden', 'La nueva contraseña y la confirmación deben ser iguales.');
      return;
    }
    setGuardando(true);
    try {
      await api.put('/delivery/cliente/password', { actual, nueva });
      Alert.alert('¡Listo!', 'Tu contraseña fue actualizada correctamente.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      const msg = err?.response?.data?.error ?? 'No se pudo cambiar la contraseña.';
      Alert.alert('Error', msg);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1A202C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cambiar contraseña</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={18} color="#4299E1" />
            <Text style={styles.infoText}>
              Si tu cuenta fue creada con Google, deja el campo "Contraseña actual" vacío.
            </Text>
          </View>

          <PasswordField label="Contraseña actual" value={actual} onChangeText={setActual} placeholder="Tu contraseña actual" />
          <PasswordField label="Nueva contraseña" value={nueva} onChangeText={setNueva} placeholder="Mínimo 6 caracteres" />
          <PasswordField label="Confirmar nueva contraseña" value={confirmar} onChangeText={setConfirmar} placeholder="Repite la nueva contraseña" />

          <TouchableOpacity style={styles.saveBtn} onPress={handleGuardar} disabled={guardando}>
            {guardando
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>Cambiar contraseña</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#EDF2F7',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#1A202C' },
  scroll: { padding: 20, gap: 16 },
  infoBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#EBF8FF', borderRadius: 12, padding: 14,
  },
  infoText: { flex: 1, fontSize: 13, color: '#2B6CB0', lineHeight: 19 },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#4A5568' },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  fieldInput: { flex: 1, fontSize: 15, color: '#1A202C' },
  saveBtn: {
    marginTop: 8, backgroundColor: '#1A6A9A', borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
