import { useEffect } from 'react';
import { useFonts, Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold } from '@expo-google-fonts/poppins';
import { NunitoSans_400Regular, NunitoSans_600SemiBold, NunitoSans_700Bold, NunitoSans_800ExtraBold } from '@expo-google-fonts/nunito-sans';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import useAuthStore from '../store/authStore';
// Importa el módulo para que TaskManager registre la tarea de ubicación
// en background al arrancar la app (requisito de expo-task-manager)
import '../services/backgroundLocation';

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
  // Tipografía de la marca (Poppins + Nunito Sans, ver components/Texto.jsx).
  // Si falla la carga se sigue con la fuente del sistema.
  const [fuentesListas, errorFuentes] = useFonts({
    Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold,
    NunitoSans_400Regular, NunitoSans_600SemiBold, NunitoSans_700Bold, NunitoSans_800ExtraBold,
  });
  if (!fuentesListas && !errorFuentes) return null;

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
