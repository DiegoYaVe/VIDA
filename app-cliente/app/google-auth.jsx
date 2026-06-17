import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useAuthStore from '../store/authStore';

// Cierra la sesión del navegador para que openAuthSessionAsync quede libre
WebBrowser.maybeCompleteAuthSession();

export default function GoogleAuthCallback() {
  const { token, nombre, id, error } = useLocalSearchParams();
  const login = useAuthStore((s) => s.login);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      if (token && !error) {
        await AsyncStorage.setItem('vida_cliente_token', token);
        login({ cliente: { idCliente: Number(id), Nombre: decodeURIComponent(nombre || '') }, token });
      } else {
        router.replace('/(auth)/login');
      }
    })();
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F7FA' }}>
      <ActivityIndicator size="large" color="#27AE60" />
    </View>
  );
}
