// Botón "Volver" del diseño: cuadro blanco de 44 con chevron marino.
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { colores } from '../constants/tema';

export function Chevron({ color = colores.marino, tam = 20 }) {
  return (
    <Svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 18l-6-6 6-6" />
    </Svg>
  );
}

export function BotonAtras({ onPress, oscuro = false }) {
  const router = useRouter();
  const volver = onPress || (() => (router.canGoBack() ? router.back() : router.replace('/(tabs)')));
  return (
    <TouchableOpacity onPress={volver} accessibilityLabel="Volver" style={[styles.boton, oscuro && styles.oscuro]}>
      <Chevron color={oscuro ? colores.blanco : colores.marino} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  boton: { width: 44, height: 44, borderRadius: 14, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, alignItems: 'center', justifyContent: 'center' },
  oscuro: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 0 },
});
