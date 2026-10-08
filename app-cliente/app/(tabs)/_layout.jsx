import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import useAuthStore from '../../store/authStore';
import { registrarPushToken, escucharTapsNotificacion } from '../../services/push';
import BarraInferior from '../../components/BarraInferior';

export default function TabsLayout() {
  const token = useAuthStore((s) => s.token);
  const router = useRouter();

  // Push: registrar token con sesión activa; al tocar una notificación de
  // status, abrir el seguimiento del pedido
  useEffect(() => {
    if (token) registrarPushToken();
    return escucharTapsNotificacion((data) => {
      if (data?.tipo === 'status_pedido' && data?.idPedido) {
        router.push(`/pedido/${data.idPedido}`);
      }
    });
  }, [token]);

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <BarraInferior {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="tiendas" options={{ title: 'Tiendas' }} />
      <Tabs.Screen name="carrito" options={{ title: 'Carrito' }} />
      <Tabs.Screen name="puntos" options={{ title: 'Puntos' }} />
      <Tabs.Screen name="pedidos" options={{ title: 'Pedidos' }} />
      {/* El perfil se abre desde el avatar del inicio, no desde la barra */}
      <Tabs.Screen name="perfil" options={{ title: 'Perfil', href: null }} />
    </Tabs>
  );
}
