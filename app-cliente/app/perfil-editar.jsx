import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput } from '../components/Texto';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import api from '../services/api';
import useAuthStore from '../store/authStore';

function Field({ label, icon, value, onChangeText, placeholder, keyboardType, autoCapitalize }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldRow}>
        <Ionicons name={icon} size={18} color="#8C9BB0" style={{ marginRight: 10 }} />
        <TextInput
          style={styles.fieldInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#CFE4EB"
          keyboardType={keyboardType ?? 'default'}
          autoCapitalize={autoCapitalize ?? 'words'}
        />
      </View>
    </View>
  );
}

export default function PerfilEditarScreen() {
  const router = useRouter();
  const { cliente, setCliente } = useAuthStore();
  const [form, setForm] = useState({
    Nombre:    cliente?.Nombre    ?? cliente?.nombre    ?? '',
    Apellidos: cliente?.Apellidos ?? cliente?.apellidos ?? '',
    Telefono:  cliente?.Telefono  ?? cliente?.telefono  ?? '',
    Email:     cliente?.Email     ?? cliente?.email     ?? '',
  });
  const [guardando, setGuardando] = useState(false);

  const handleGuardar = async () => {
    if (!form.Nombre.trim()) {
      Alert.alert('Campo requerido', 'El nombre no puede estar vacío.');
      return;
    }
    setGuardando(true);
    try {
      const res = await api.put('/delivery/cliente/perfil', form);
      setCliente({ ...cliente, ...res.data });
      Alert.alert('¡Guardado!', 'Tu información fue actualizada.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Error', 'No se pudieron guardar los cambios.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#001034" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Editar perfil</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Field
            label="Nombre" icon="person-outline"
            value={form.Nombre} onChangeText={v => setForm(p => ({ ...p, Nombre: v }))}
            placeholder="Tu nombre"
          />
          <Field
            label="Apellidos" icon="person-outline"
            value={form.Apellidos} onChangeText={v => setForm(p => ({ ...p, Apellidos: v }))}
            placeholder="Tus apellidos"
          />
          <Field
            label="Teléfono" icon="call-outline"
            value={form.Telefono} onChangeText={v => setForm(p => ({ ...p, Telefono: v }))}
            placeholder="Ej: 04141234567" keyboardType="phone-pad" autoCapitalize="none"
          />
          <Field
            label="Correo electrónico" icon="mail-outline"
            value={form.Email} onChangeText={v => setForm(p => ({ ...p, Email: v }))}
            placeholder="correo@ejemplo.com" keyboardType="email-address" autoCapitalize="none"
          />

          <TouchableOpacity style={styles.saveBtn} onPress={handleGuardar} disabled={guardando}>
            {guardando
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>Guardar cambios</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F9FB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E6F1F5',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#001034' },
  scroll: { padding: 20, gap: 16 },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#2C3D58' },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1.5, borderColor: '#DCEEF3',
  },
  fieldInput: { flex: 1, fontSize: 15, color: '#001034' },
  saveBtn: {
    marginTop: 8, backgroundColor: '#001034', borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
