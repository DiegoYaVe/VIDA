// Versión web (solo para previsualizar la app en el navegador): el mapa real
// usa react-native-maps o Leaflet en un WebView, que no existen en web.
import { View, StyleSheet } from 'react-native';
import { Text } from './Texto';

export default function MapaPedido() {
  return (
    <View style={styles.mapa}>
      <Text style={styles.texto}>Mapa (en el teléfono)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mapa: { flex: 1, backgroundColor: '#DDEFF5', alignItems: 'center', justifyContent: 'center' },
  texto: { fontSize: 12, color: '#4B5B73' },
});
