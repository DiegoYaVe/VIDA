import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import useAuthStore from '../store/authStore';

function AuthGuard({ children }) {
  const token = useAuthStore((s) => s.token);
  const segments = useSegments();
  const router = useRouter();

  // Navegación guest-first: se puede explorar productos y llenar el carrito
  // sin cuenta. El login se exige solo al confirmar pedido, en el perfil y
  // en el tracking. Al iniciar sesión regresa a donde estaba (postLoginRedirect).
  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)';
    if (token && inAuthGroup) {
      const destino = useAuthStore.getState().postLoginRedirect;
      useAuthStore.getState().setPostLoginRedirect(null);
      router.replace(destino || '/(tabs)');
    }
  }, [token, segments]);

  return children;
}

export default function RootLayout() {
  return (
    <AuthGuard>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)/login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="sucursal/[idPuntoVenta]" />
        <Stack.Screen name="pedido/[idPedido]" />
        <Stack.Screen name="mis-pedidos" />
        <Stack.Screen name="perfil-editar" />
        <Stack.Screen name="perfil-password" />
        <Stack.Screen name="perfil-tarjetas" />
        <Stack.Screen name="info-ayuda" />
        <Stack.Screen name="info-quienes-somos" />
        <Stack.Screen name="info-privacidad" />
      </Stack>
    </AuthGuard>
  );
}
