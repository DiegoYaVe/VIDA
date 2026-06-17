import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import useAuthStore from '../store/authStore';

function AuthGuard({ children }) {
  const token = useAuthStore((s) => s.token);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const inMain = segments[0] === '(main)';
    const inLogin = segments[0] === 'login';

    if (!token && !inLogin) {
      router.replace('/login');
    } else if (token && inLogin) {
      router.replace('/(main)');
    }
  }, [token, segments]);

  return children;
}

export default function RootLayout() {
  return (
    <AuthGuard>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(main)" />
      </Stack>
    </AuthGuard>
  );
}
