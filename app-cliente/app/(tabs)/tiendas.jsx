// Tiendas VIDA: lista de tiendas activas; cada una abre su catálogo.
import { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';
import { Text } from '../../components/Texto';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import useCarritoStore from '../../store/carritoStore';
import { colores, fuentes } from '../../constants/tema';

function Flecha() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#8CA5B3" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

export default function TiendasScreen() {
  const router = useRouter();
  const { idBranch, idCuenta } = useAuthStore();
  const idCarrito = useCarritoStore((s) => s.idPuntoVenta);
  const [tiendas, setTiendas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await api.get('/delivery/sucursales', { params: { idBranch, idCuenta } });
      setTiendas(r.data?.sucursales ?? r.data ?? []);
    } catch { /* se queda con lo que había */ }
    finally { setCargando(false); setRefrescando(false); }
  }, [idBranch, idCuenta]);
  useEffect(() => { cargar(); }, [cargar]);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.contenido} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} tintColor={colores.marino} />}>
        <Text style={styles.titulo}>Tiendas</Text>
        <Text style={styles.sub}>Elige la tienda VIDA que te queda cerca. Tu pedido es de una sola tienda.</Text>
        {cargando ? <ActivityIndicator color={colores.marino} style={{ marginTop: 24 }} /> : (
          <View style={styles.lista}>
            {tiendas.map((t, i) => {
              const actual = String(t.idPuntoVenta) === String(idCarrito);
              return (
                <TouchableOpacity key={t.idPuntoVenta} style={[styles.fila, i < tiendas.length - 1 && styles.borde]}
                  onPress={() => router.push(`/sucursal/${t.idPuntoVenta}`)}>
                  <View style={[styles.inicial, actual && { backgroundColor: colores.marino }]}>
                    <Text style={[styles.inicialTexto, actual && { color: colores.blanco }]}>{String(t.NomComercial || 'T').trim()[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nombre} numberOfLines={1}>{t.NomComercial}</Text>
                    <Text style={styles.direccion} numberOfLines={1}>{t.Direccion?.trim() || 'Pide a domicilio'}</Text>
                  </View>
                  {actual ? <View style={styles.sello}><Text style={styles.selloTexto}>Tu carrito</Text></View> : null}
                  <Flecha />
                </TouchableOpacity>
              );
            })}
            {tiendas.length === 0 && <Text style={styles.vacio}>No hay tiendas disponibles por ahora.</Text>}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28, gap: 10 },
  titulo: { fontFamily: fuentes.tituloFuerte, fontSize: 26, color: colores.marino },
  sub: { fontSize: 14, color: colores.textoSuave, marginBottom: 4 },
  lista: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 4 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66 },
  borde: { borderBottomWidth: 1, borderBottomColor: '#EEF6F8' },
  inicial: { width: 40, height: 40, borderRadius: 13, backgroundColor: colores.celesteClaro, alignItems: 'center', justifyContent: 'center' },
  inicialTexto: { fontFamily: fuentes.tituloFuerte, fontSize: 15, color: colores.marino },
  nombre: { fontWeight: '800', fontSize: 15, color: colores.marino },
  direccion: { fontSize: 13, color: colores.textoSuave },
  sello: { backgroundColor: colores.celesteClaro, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  selloTexto: { fontSize: 11, fontWeight: '800', color: colores.marino },
  vacio: { padding: 16, color: colores.textoSuave },
});
