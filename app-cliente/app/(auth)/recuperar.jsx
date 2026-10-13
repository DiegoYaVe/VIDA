// Recuperar contraseña: el cliente pide un código con su teléfono, le llega
// al correo de su cuenta, y con él pone una contraseña nueva. Al terminar
// queda con la sesión iniciada.
import { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, TextInput } from '../../components/Texto';
import { BotonAtras } from '../../components/Cabecera';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import { ID_BRANCH, ID_CUENTA } from '../../constants/config';
import { colores, fuentes } from '../../constants/tema';

function Campo({ etiqueta, ...props }) {
  return (
    <View style={styles.campo}>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      <TextInput style={styles.input} placeholderTextColor="#8C9BB0" {...props} />
    </View>
  );
}

export default function RecuperarScreen() {
  const login = useAuthStore((s) => s.login);
  const params = useLocalSearchParams();
  const [telefono, setTelefono] = useState(String(params.telefono || ''));
  const [destino, setDestino] = useState(null); // correo enmascarado: paso 2
  const [codigo, setCodigo] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [espera, setEspera] = useState(0);

  useEffect(() => {
    if (espera <= 0) return undefined;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const pedirCodigo = async () => {
    if (!telefono.trim()) return setError('Escribe el teléfono de tu cuenta');
    setError(''); setCargando(true);
    try {
      const r = await api.post('/delivery/cliente/password/codigo', { idBranch: ID_BRANCH, idCuenta: ID_CUENTA, Telefono: telefono.trim() });
      setDestino(r.data.destino); setEspera(60); setCodigo('');
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo enviar el código. Revisa tu conexión.');
    } finally { setCargando(false); }
  };

  const cambiar = async () => {
    if (!/^\d{6}$/.test(codigo.trim())) return setError('El código tiene 6 números');
    if (nueva.length < 6) return setError('La contraseña debe tener al menos 6 caracteres');
    if (nueva !== repetir) return setError('Las contraseñas no coinciden');
    setError(''); setCargando(true);
    try {
      const r = await api.post('/delivery/cliente/password/restablecer', {
        idBranch: ID_BRANCH, idCuenta: ID_CUENTA, Telefono: telefono.trim(), Codigo: codigo.trim(), Nueva: nueva,
      });
      const { token, idCliente, Nombre, Apellidos, Email, emailConfirmado } = r.data;
      await AsyncStorage.setItem('vida_cliente_token', token);
      login({ cliente: { idCliente, Nombre, Apellidos, Email, emailConfirmado }, token }); // el layout lleva al inicio
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo cambiar la contraseña');
    } finally { setCargando(false); }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
          <BotonAtras />
          <Text style={styles.titulo}>Recuperar tu cuenta</Text>
          {!destino ? (
            <>
              <Text style={styles.sub}>Escribe el teléfono de tu cuenta. Te enviamos un código al correo que registraste.</Text>
              <Campo etiqueta="Teléfono" placeholder="0414-0000000" keyboardType="phone-pad" value={telefono} onChangeText={setTelefono}
                returnKeyType="send" onSubmitEditing={pedirCodigo} autoFocus={!telefono} />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity style={[styles.boton, cargando && { opacity: 0.7 }]} onPress={pedirCodigo} disabled={cargando}>
                {cargando ? <ActivityIndicator color={colores.blanco} /> : <Text style={styles.botonTexto}>Enviarme un código</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.sub}>Te enviamos un código de 6 números a <Text style={styles.destino}>{destino}</Text>. Vence en 15 minutos; revisa también la carpeta de spam.</Text>
              <Campo etiqueta="Código" placeholder="000000" keyboardType="number-pad" maxLength={6} value={codigo}
                onChangeText={(t) => setCodigo(t.replace(/\D/g, ''))} textContentType="oneTimeCode" autoComplete="sms-otp" autoFocus
                style={[styles.input, styles.codigo]} />
              <Campo etiqueta="Contraseña nueva" placeholder="Mínimo 6 caracteres" secureTextEntry value={nueva} onChangeText={setNueva} />
              <Campo etiqueta="Repite la contraseña" placeholder="Igual a la de arriba" secureTextEntry value={repetir} onChangeText={setRepetir}
                returnKeyType="done" onSubmitEditing={cambiar} />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity style={[styles.boton, cargando && { opacity: 0.7 }]} onPress={cambiar} disabled={cargando}>
                {cargando ? <ActivityIndicator color={colores.blanco} /> : <Text style={styles.botonTexto}>Cambiar contraseña y entrar</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.reenviar} onPress={pedirCodigo} disabled={espera > 0 || cargando}>
                <Text style={[styles.reenviarTexto, espera > 0 && { color: colores.textoSuave, textDecorationLine: 'none' }]}>
                  {espera > 0 ? `Reenviar el código en ${espera} s` : 'Reenviar el código'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 28, gap: 14 },
  titulo: { fontFamily: fuentes.tituloFuerte, fontSize: 26, color: colores.marino, marginTop: 6 },
  sub: { fontSize: 15, lineHeight: 21, color: colores.textoSuave },
  destino: { fontWeight: '800', color: colores.marino },
  campo: { gap: 6 },
  etiqueta: { fontSize: 14, fontWeight: '800', color: colores.marino },
  input: { height: 52, borderRadius: 16, borderWidth: 1.5, borderColor: colores.bordeFuerte, backgroundColor: colores.blanco, paddingHorizontal: 16, fontSize: 16, color: colores.marino },
  codigo: { fontFamily: fuentes.tituloFuerte, fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  error: { backgroundColor: colores.errorClaro, color: colores.error, borderRadius: 12, padding: 10, fontSize: 14, fontWeight: '700' },
  boton: { height: 56, borderRadius: 18, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { color: colores.blanco, fontWeight: '800', fontSize: 17 },
  reenviar: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  reenviarTexto: { fontWeight: '800', fontSize: 15, color: colores.marino, textDecorationLine: 'underline' },
});
