import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../components/Texto';
import { Ionicons } from '@expo/vector-icons';
import useCarritoStore from '../../store/carritoStore';
import useAuthStore from '../../store/authStore';
import { registrarPushToken, escucharTapsNotificacion } from '../../services/push';
import { colores, fuentes } from '../../constants/tema';

function CartTabIcon({ color, focused }) {
  const items = useCarritoStore((s) => s.items);
  const totalItems = items.reduce((acc, i) => acc + i.Cantidad, 0);

  return (
    <View>
      <Ionicons name={focused ? 'cart' : 'cart-outline'} size={24} color={color} />
      {totalItems > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{totalItems > 99 ? '99+' : totalItems}</Text>
        </View>
      )}
    </View>
  );
}

export default function TabsLayout() {
  const token = useAuthStore((s) => s.token);
  const router = useRouter();

  // Push: registrar token con sesión activa; al tocar una notificación de
  // status, abrir el tracking del pedido
  useEffect(() => {
    if (token) registrarPushToken();
    return escucharTapsNotificacion((data) => {
      if (data?.tipo === 'status_pedido' && data?.idPedido) {
        router.push(`/pedido/${data.idPedido}`);
      }
    });
  }, [token]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colores.blanco,
          borderTopWidth: 1,
          borderTopColor: colores.borde,
          height: 66,
          paddingBottom: 10,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colores.marino,
        tabBarInactiveTintColor: colores.textoTenue,
        tabBarLabelStyle: { fontSize: 12, fontFamily: fuentes.textoFuerte },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'storefront' : 'storefront-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="carrito"
        options={{
          title: 'Carrito',
          tabBarIcon: (props) => <CartTabIcon {...props} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    right: -6,
    top: -4,
    backgroundColor: colores.celeste,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colores.blanco,
  },
  badgeText: { color: colores.marino, fontSize: 9, fontWeight: '800' },
});
