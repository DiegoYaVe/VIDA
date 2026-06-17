import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useAuthStore from '../store/authStore';

function AuthGuard({ children }) {
  const token = useAuthStore((s) => s.token);
  const login = useAuthStore((s) => s.login);
  const segments = useSegments();
  const router = useRouter();

  // Manejar deep link de retorno de Google OAuth
  useEffect(() => {
    const handleUrl = async ({ url }) => {
      if (!url) return;
      const parsed = Linking.parse(url);
      // En Expo Go el path llega como '--/google-auth', en prod como 'google-auth'
      const path = parsed.path || '';
      if (path === 'google-auth' || path === '--/google-auth') {
        const { token: t, nombre, id, error } = parsed.queryParams || {};
        if (t && !error) {
          await AsyncStorage.setItem('vida_cliente_token', t);
          login({ cliente: { idCliente: Number(id), Nombre: decodeURIComponent(nombre || '') }, token: t });
        }
      }
    };

    // URL que abrió la app (cold start)
    Linking.getInitialURL().then(url => { if (url) handleUrl({ url }); });

    // URL mientras la app ya estaba abierta
    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)';
    if (!token && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (token && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [token, segments]);

  return children;
}

export default function RootLayout() {
  return (
    <AuthGuard>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="google-auth" />
        <Stack.Screen name="sucursal/[idPuntoVenta]" />
        <Stack.Screen name="pedido/[idPedido]" />
      </Stack>
    </AuthGuard>
  );
}
