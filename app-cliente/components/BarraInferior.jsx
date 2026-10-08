// Barra inferior del diseño "Agua VIDA": Inicio · Tiendas · carrito flotante
// al centro (celeste, con contador) · Puntos · Pedidos. Solo texto en las
// pestañas, como en el diseño.
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text } from './Texto';
import useCarritoStore from '../store/carritoStore';
import { colores } from '../constants/tema';

const PESTANAS = [
  { ruta: 'index', etiqueta: 'Inicio' },
  { ruta: 'tiendas', etiqueta: 'Tiendas' },
  { ruta: 'carrito', etiqueta: null },
  { ruta: 'puntos', etiqueta: 'Puntos' },
  { ruta: 'pedidos', etiqueta: 'Pedidos' },
];

export function IconoCarrito({ tam = 24, color = colores.marino }) {
  return (
    <Svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={9} cy={20} r={1.5} />
      <Circle cx={18} cy={20} r={1.5} />
      <Path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" />
    </Svg>
  );
}

export default function BarraInferior({ state, navigation }) {
  const insets = useSafeAreaInsets();
  const items = useCarritoStore((s) => s.items);
  const total = items.reduce((a, i) => a + i.Cantidad, 0);
  const actual = state.routes[state.index]?.name;
  // El carrito es una pantalla completa (con su propia hoja de pago)
  if (actual === 'carrito') return null;

  const ir = (ruta) => {
    const r = state.routes.find((x) => x.name === ruta);
    if (!r) return;
    const evento = navigation.emit({ type: 'tabPress', target: r.key, canPreventDefault: true });
    if (actual !== ruta && !evento.defaultPrevented) navigation.navigate(ruta);
  };

  return (
    <View style={[styles.barra, { height: 80 + insets.bottom, paddingBottom: insets.bottom }]}>
      {PESTANAS.map((p) => p.etiqueta ? (
        <TouchableOpacity key={p.ruta} style={styles.pestana} onPress={() => ir(p.ruta)}
          accessibilityRole="tab" accessibilityState={{ selected: actual === p.ruta }}>
          <Text style={[styles.texto, actual === p.ruta && styles.textoActivo]}>{p.etiqueta}</Text>
        </TouchableOpacity>
      ) : (
        <View key={p.ruta} style={styles.pestana}>
          <TouchableOpacity style={styles.carrito} onPress={() => ir('carrito')}
            accessibilityLabel={`Carrito, ${total} producto${total === 1 ? '' : 's'}`}>
            <IconoCarrito />
            {total > 0 && (
              <View style={styles.contador}><Text style={styles.contadorTexto}>{total > 99 ? '99+' : total}</Text></View>
            )}
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  barra: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colores.blanco,
    borderTopWidth: 1, borderTopColor: colores.borde,
  },
  pestana: { flex: 1, height: 80, alignItems: 'center', justifyContent: 'center' },
  texto: { fontSize: 12, fontWeight: '700', color: colores.textoSuave },
  textoActivo: { fontWeight: '800', color: colores.marino },
  carrito: {
    width: 60, height: 60, marginTop: -26, borderRadius: 30, backgroundColor: colores.celeste,
    borderWidth: 4, borderColor: colores.fondo, alignItems: 'center', justifyContent: 'center',
  },
  contador: {
    position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4,
    backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center',
  },
  contadorTexto: { color: colores.blanco, fontSize: 11, fontWeight: '800' },
});
