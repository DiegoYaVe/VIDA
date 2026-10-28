import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import useAuthStore from '../../store/authStore';
import { registrarPushToken, escucharTapsNotificacion } from '../../services/push';
import BarraInferior from '../../components/BarraInferior';

export default function TabsLayout() {
  const token = useAuthStore((s) => s.token);
  const router = useRouter();

  // Push: registrar token con sesión activa; al tocar una notificación se abre
  // el seguimiento del pedido, el carrito (cupón) o Mi hidratación (recordatorio)
  useEffect(() => {
    if (token) registrarPushToken();
    return escucharTapsNotificacion((data) => {
      if (data?.tipo === 'status_pedido' && data?.idPedido) {
        router.push(`/pedido/${data.idPedido}`);
      } else if (data?.tipo === 'CUPON') {
        router.push('/(tabs)/carrito');       // ahí aparece en "Tus cupones"
      } else if (data?.url === '/mi-consumo') {
        router.push('/mi-consumo');           // recordatorio de agua
      }
    });
  }, [token]);

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <BarraInferior {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="tiendas" options={{ title: 'Tiendas' }} />
      <Tabs.Screen name="pedidos" options={{ title: 'Pedidos' }} />
      <Tabs.Screen name="puntos" options={{ title: 'Puntos' }} />
      <Tabs.Screen name="perfil" options={{ title: 'Cuenta' }} />
      {/* El carrito se abre desde la barra "Ver carrito", no es una pestaña */}
      <Tabs.Screen name="carrito" options={{ title: 'Carrito', href: null }} />
    </Tabs>
  );
}
