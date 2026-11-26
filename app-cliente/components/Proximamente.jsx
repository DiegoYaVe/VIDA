// Pantalla "Próximamente" para lo que aún no arranca (puntos, canjes y
// Academia VIDA; ver CLUB_PROXIMAMENTE en constants/config).
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Text } from './Texto';
import { Icono } from './ui';
import { BotonAtras } from './Cabecera';
import { colores, fuentes } from '../constants/tema';

export default function Proximamente({ icono = 'gift-outline', titulo, texto, conAtras = true }) {
  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <StatusBar style="dark" />
      {conAtras ? <View style={styles.barra}><BotonAtras /></View> : null}
      <View style={styles.centro}>
        <View style={styles.icono}><Icono nombre={icono} tam={40} /></View>
        <View style={styles.sello}><Text style={styles.selloTexto}>PRÓXIMAMENTE</Text></View>
        <Text style={styles.titulo}>{titulo}</Text>
        {texto ? <Text style={styles.texto}>{texto}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  barra: { paddingHorizontal: 20, paddingTop: 8 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  icono: { width: 96, height: 96, borderRadius: 48, backgroundColor: colores.celesteClaro, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  sello: { backgroundColor: colores.marino, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  selloTexto: { color: colores.blanco, fontWeight: '800', fontSize: 11, letterSpacing: 1 },
  titulo: { fontFamily: fuentes.tituloFuerte, fontSize: 22, color: colores.marino, textAlign: 'center' },
  texto: { fontSize: 15, lineHeight: 21, color: colores.textoSuave, textAlign: 'center', maxWidth: 300 },
});
