// Versión web (solo para previsualizar la app en el navegador): el selector
// real usa Leaflet en un WebView, que no existe en web.
import { Modal, View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from './Texto';

export default function SelectorUbicacion({ visible, onClose }) {
  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.fondo}>
        <View style={styles.caja}>
          <Text style={styles.texto}>El mapa para fijar la ubicación solo funciona en el teléfono.</Text>
          <TouchableOpacity onPress={onClose} style={styles.boton}><Text style={styles.botonTexto}>Cerrar</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0,16,52,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  caja: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20, gap: 14 },
  texto: { fontSize: 15, color: '#001034' },
  boton: { backgroundColor: '#001034', borderRadius: 14, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { color: '#FFFFFF', fontWeight: '800' },
});
