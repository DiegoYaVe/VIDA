// Mis direcciones: las direcciones guardadas para recibir pedidos. Se agregan
// al fijar la ubicación en el carrito; aquí se pueden borrar.
import { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text } from '../components/Texto';
import { BotonAtras } from '../components/Cabecera';
import api from '../services/api';
import { colores, fuentes } from '../constants/tema';

export default function MisDirecciones() {
  const [lista, setLista] = useState(null);
  const cargar = useCallback(() => {
    api.get('/delivery/cliente/direcciones').then((r) => setLista(r.data || [])).catch(() => setLista([]));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const borrar = (d) => Alert.alert('Borrar dirección', `¿Borrar "${d.Alias || d.Direccion}"?`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Borrar', style: 'destructive', onPress: async () => {
      try { await api.delete(`/delivery/cliente/direcciones/${d.idDireccion}`); cargar(); }
      catch (e) { Alert.alert('No se pudo borrar', e.response?.data?.error || 'Intenta de nuevo.'); }
    } },
  ]);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.contenido}>
        <View style={styles.cabecera}>
          <BotonAtras />
          <Text style={styles.titulo}>Mis direcciones</Text>
        </View>
        {lista === null ? <ActivityIndicator color={colores.marino} /> : lista.length === 0 ? (
          <Text style={styles.vacio}>Aún no tienes direcciones guardadas. Al hacer un pedido, fija tu ubicación en el mapa y márcala para guardarla.</Text>
        ) : (
          <View style={styles.tarjeta}>
            {lista.map((d, i) => (
              <View key={d.idDireccion} style={[styles.fila, i < lista.length - 1 && styles.borde]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.alias}>{d.Alias || 'Dirección'}</Text>
                  <Text style={styles.direccion} numberOfLines={2}>{d.Direccion}</Text>
                </View>
                <TouchableOpacity onPress={() => borrar(d)} style={styles.borrar}><Text style={styles.borrarTexto}>Borrar</Text></TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28, gap: 14 },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titulo: { fontFamily: fuentes.tituloFuerte, fontSize: 22, color: colores.marino },
  vacio: { fontSize: 14, color: colores.textoSuave, lineHeight: 20 },
  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 4 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  borde: { borderBottomWidth: 1, borderBottomColor: '#EEF6F8' },
  alias: { fontWeight: '800', fontSize: 15, color: colores.marino },
  direccion: { fontSize: 13, color: colores.textoSuave },
  borrar: { minHeight: 44, justifyContent: 'center' },
  borrarTexto: { fontWeight: '800', fontSize: 14, color: '#8A2B2B' },
});
