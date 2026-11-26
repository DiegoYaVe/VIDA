// Barra inferior (estilo apps de delivery): Inicio · Tiendas · Pedidos ·
// Puntos · Cuenta, con icono y texto. Mientras hay productos, encima va la
// barra "Ver carrito" en las pestañas de compra.
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text } from './Texto';
import { Icono, BarraCarrito } from './ui';
import { colores } from '../constants/tema';
import { CLUB_PROXIMAMENTE } from '../constants/config';

const TODAS = [
  { ruta: 'index', etiqueta: 'Inicio', icono: 'home' },
  { ruta: 'tiendas', etiqueta: 'Tiendas', icono: 'storefront' },
  { ruta: 'pedidos', etiqueta: 'Pedidos', icono: 'receipt' },
  { ruta: 'puntos', etiqueta: 'Puntos', icono: 'gift' },
  { ruta: 'perfil', etiqueta: 'Cuenta', icono: 'person' },
];
// Mientras puntos y canjes son "Próximamente", sin pestaña de Puntos
const PESTANAS = CLUB_PROXIMAMENTE ? TODAS.filter((p) => p.ruta !== 'puntos') : TODAS;
const CON_CARRITO = ['index', 'tiendas'];

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
    <View style={styles.contenedor}>
      {CON_CARRITO.includes(actual) && <View style={styles.carrito}><BarraCarrito enLinea /></View>}
      <View style={[styles.barra, { paddingBottom: Math.max(insets.bottom, 6) }]}>
        {PESTANAS.map((p) => {
          const on = actual === p.ruta;
          return (
            <TouchableOpacity key={p.ruta} style={styles.pestana} onPress={() => ir(p.ruta)}
              accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={p.etiqueta}>
              <Icono nombre={on ? p.icono : `${p.icono}-outline`} tam={24} color={on ? colores.marino : colores.textoTenue} />
              <Text style={[styles.texto, on && styles.textoActivo]}>{p.etiqueta}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { backgroundColor: colores.blanco },
  carrito: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  barra: { flexDirection: 'row', backgroundColor: colores.blanco, borderTopWidth: 1, borderTopColor: colores.separador, paddingTop: 6 },
  pestana: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 2 },
  texto: { fontSize: 11, fontWeight: '700', color: colores.textoTenue },
  textoActivo: { fontWeight: '800', color: colores.marino },
});
