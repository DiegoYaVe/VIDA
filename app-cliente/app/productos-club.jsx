// Productos Club VIDA: todos los productos PLUS de la red, agrupados por
// tienda (la más cercana primero). Se agregan al carrito como en la tienda;
// si el carrito es de otra tienda, la app pregunta antes de cambiarlo.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, SectionList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text } from '../components/Texto';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import { colores, fuentes } from '../constants/tema';
import DetalleProducto from '../components/DetalleProducto';
import { Icono, Buscador, useCantidades } from '../components/ui';
import { FilaProducto } from './(tabs)/index';
import { obtenerUbicacion, ordenarPorCercania, textoDistancia } from '../services/cercania';
import { useTasaReferencial } from '../services/moneda';
import { plusPorTienda } from '../services/productosClub';

export default function ProductosClubScreen() {
  const router = useRouter();
  const { idBranch, idCuenta } = useAuthStore();
  const tasa = useTasaReferencial();
  const { cantidadDe, mas, menos } = useCantidades();
  const [productos, setProductos] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(null);

  const cargar = useCallback(async () => {
    try {
      setError('');
      const [prodRes, sucRes, pos] = await Promise.all([
        api.get('/delivery/productos', { params: { idBranch, idCuenta } }),
        api.get('/delivery/sucursales', { params: { idBranch, idCuenta } }),
        obtenerUbicacion({ pedirUnaVez: true }),
      ]);
      setProductos(prodRes.data?.productos ?? prodRes.data ?? []);
      setSucursales(ordenarPorCercania(sucRes.data?.sucursales ?? sucRes.data ?? [], pos));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, [idBranch, idCuenta]);
  useEffect(() => { cargar(); }, [cargar]);

  const secciones = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtrados = q ? productos.filter((p) => (p.Nombre || '').toLowerCase().includes(q)) : productos;
    return plusPorTienda(filtrados, sucursales).map((g) => ({ ...g, data: g.productos }));
  }, [productos, sucursales, busqueda]);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" />
      <View style={styles.barra}>
        <TouchableOpacity style={styles.redondo} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} accessibilityLabel="Volver">
          <Icono nombre="arrow-back" tam={22} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={styles.tituloFila}>
            <View style={styles.sello}><Text style={styles.selloTexto}>PLUS</Text></View>
            <Text style={styles.titulo} numberOfLines={1}>Productos Club VIDA</Text>
          </View>
          <Text style={styles.sub}>Los productos PLUS de cada tienda VIDA</Text>
        </View>
      </View>
      <View style={styles.buscarCaja}>
        <Buscador valor={busqueda} onCambiar={setBusqueda} placeholder="Buscar un producto PLUS" />
      </View>

      {cargando ? (
        <ActivityIndicator size="large" color={colores.marino} style={{ marginTop: 80 }} />
      ) : error ? (
        <View style={styles.centro}>
          <Icono nombre="cloud-offline-outline" tam={40} color={colores.textoTenue} />
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity style={styles.reintentar} onPress={cargar}><Text style={styles.reintentarTexto}>Reintentar</Text></TouchableOpacity>
        </View>
      ) : (
        <SectionList
          sections={secciones}
          keyExtractor={(p) => `${p.idProducto}-${p.idPuntoVenta}`}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} tintColor={colores.marino} />}
          renderSectionHeader={({ section }) => (
            <TouchableOpacity style={styles.tienda} activeOpacity={0.8} onPress={() => router.push(`/sucursal/${section.idPuntoVenta}`)}
              accessibilityLabel={`Ver la tienda ${section.NombreSucursal}`}>
              <View style={styles.tiendaIcono}><Icono nombre="storefront" tam={18} color={colores.marino} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tiendaNombre} numberOfLines={1}>{section.NombreSucursal}</Text>
                <Text style={styles.tiendaSub} numberOfLines={1}>
                  {[textoDistancia(section.DistanciaKm), `${section.data.length} producto${section.data.length === 1 ? '' : 's'} PLUS`].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Icono nombre="chevron-forward" tam={18} color={colores.textoSuave} />
            </TouchableOpacity>
          )}
          renderItem={({ item, index, section }) => (
            <FilaProducto p={item} tasa={tasa} cantidad={cantidadDe(item)} ultimo={index === section.data.length - 1}
              onAbrir={() => setAbierto(item)} onMas={() => mas(item)} onMenos={() => menos(item)} />
          )}
          ListEmptyComponent={
            <View style={styles.centro}>
              <Icono nombre="star-outline" tam={40} color={colores.textoTenue} />
              <Text style={styles.vacio}>
                {busqueda ? `No encontramos "${busqueda}" entre los productos PLUS.` : 'Todavía no hay productos PLUS disponibles cerca de ti.'}
              </Text>
            </View>
          }
        />
      )}

      {abierto && <DetalleProducto producto={abierto} onClose={() => setAbierto(null)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  barra: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8 },
  redondo: { width: 44, height: 44, borderRadius: 22, backgroundColor: colores.superficie, alignItems: 'center', justifyContent: 'center' },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sello: { backgroundColor: '#F2B705', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  selloTexto: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  titulo: { fontFamily: fuentes.tituloFuerte, fontSize: 20, color: colores.marino, flexShrink: 1 },
  sub: { fontSize: 13, color: colores.textoSuave },
  buscarCaja: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  tienda: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginTop: 18, paddingVertical: 10,
    paddingHorizontal: 12, borderRadius: 16, backgroundColor: colores.superficie },
  tiendaIcono: { width: 36, height: 36, borderRadius: 12, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center' },
  tiendaNombre: { fontWeight: '800', fontSize: 15, color: colores.marino },
  tiendaSub: { fontSize: 12, color: colores.textoSuave },
  centro: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  error: { color: colores.error, textAlign: 'center', fontSize: 14 },
  reintentar: { backgroundColor: colores.marino, borderRadius: 99, paddingHorizontal: 22, minHeight: 44, justifyContent: 'center' },
  reintentarTexto: { color: colores.blanco, fontWeight: '800' },
  vacio: { textAlign: 'center', color: colores.textoSuave, fontSize: 14 },
});
