// Tiendas VIDA (estilo apps de delivery): buscador y tarjetas grandes con
// portada, distancia y dirección; las más cercanas primero si el cliente
// comparte su ubicación. Tocar una tienda abre su catálogo.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text } from '../../components/Texto';
import { Icono, Buscador, PortadaTienda } from '../../components/ui';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import useCarritoStore from '../../store/carritoStore';
import { colores, fuentes } from '../../constants/tema';
import { obtenerUbicacion, ordenarPorCercania, textoDistancia } from '../../services/cercania';

// Tiempo estimado de entrega según la distancia (preparación + trayecto en moto)
function tiempoEstimado(km) {
  if (km == null) return null;
  const min = Math.round(15 + km * 3);
  return `${min}–${min + 10} min`;
}

export default function TiendasScreen() {
  const router = useRouter();
  const { idBranch, idCuenta } = useAuthStore();
  const idCarrito = useCarritoStore((s) => s.idPuntoVenta);
  const nCarrito = useCarritoStore((s) => s.items.reduce((a, i) => a + i.Cantidad, 0));
  const [tiendas, setTiendas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [conUbicacion, setConUbicacion] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const cargar = useCallback(async () => {
    try {
      const [r, pos] = await Promise.all([
        api.get('/delivery/sucursales', { params: { idBranch, idCuenta } }),
        obtenerUbicacion({ pedir: true }),
      ]);
      setConUbicacion(!!pos);
      setTiendas(ordenarPorCercania(r.data?.sucursales ?? r.data ?? [], pos));
    } catch { /* se queda con lo que había */ }
    finally { setCargando(false); setRefrescando(false); }
  }, [idBranch, idCuenta]);
  useEffect(() => { cargar(); }, [cargar]);

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return q ? tiendas.filter((t) => `${t.NomComercial} ${t.Direccion || ''}`.toLowerCase().includes(q)) : tiendas;
  }, [tiendas, busqueda]);

  const Cabecera = (
    <View style={{ gap: 14, paddingBottom: 6 }}>
      <View>
        <Text style={styles.titulo}>Tiendas</Text>
        <Text style={styles.sub}>{conUbicacion ? 'Las más cercanas a ti primero' : 'Activa tu ubicación para ver las más cercanas'}</Text>
      </View>
      <Buscador valor={busqueda} onCambiar={setBusqueda} placeholder="Buscar tienda o zona" />
      <View style={styles.info}>
        <Icono nombre="information-circle-outline" tam={18} color={colores.textoSuave} />
        <Text style={styles.infoTexto}>Cada pedido es de una sola tienda.</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <StatusBar style="dark" />
      {cargando ? <ActivityIndicator color={colores.marino} size="large" style={{ marginTop: 60 }} /> : (
        <FlatList
          data={lista}
          keyExtractor={(t) => String(t.idPuntoVenta)}
          ListHeaderComponent={Cabecera}
          contentContainerStyle={styles.contenido}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} tintColor={colores.marino} />}
          ListEmptyComponent={(
            <View style={styles.vacio}>
              <Icono nombre="storefront-outline" tam={40} color={colores.textoTenue} />
              <Text style={styles.vacioTexto}>{busqueda ? 'No encontramos tiendas con ese nombre.' : 'No hay tiendas disponibles por ahora.'}</Text>
            </View>
          )}
          renderItem={({ item: t, index: i }) => {
            const actual = String(t.idPuntoVenta) === String(idCarrito) && nCarrito > 0;
            const tiempo = tiempoEstimado(t.DistanciaKm);
            return (
              <TouchableOpacity style={styles.tarjeta} activeOpacity={0.9} onPress={() => router.push(`/sucursal/${t.idPuntoVenta}`)}
                accessibilityLabel={`Abrir ${t.NomComercial}`}>
                <PortadaTienda nombre={t.NomComercial} id={t.idPuntoVenta} alto={150} radio={18}>
                  <View style={styles.sellos}>
                    {actual ? <View style={styles.selloCarrito}><Icono nombre="cart" tam={13} /><Text style={styles.selloTexto}>Tu carrito · {nCarrito}</Text></View> : null}
                    {i === 0 && t.DistanciaKm != null && !busqueda ? <View style={styles.selloCerca}><Text style={styles.selloTexto}>Más cerca</Text></View> : null}
                  </View>
                  {tiempo ? <View style={styles.tiempo}><Text style={styles.tiempoTexto}>{tiempo}</Text></View> : null}
                </PortadaTienda>
                <View style={styles.datos}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nombre} numberOfLines={1}>{t.NomComercial}</Text>
                    <Text style={styles.direccion} numberOfLines={1}>
                      {[textoDistancia(t.DistanciaKm), t.Direccion?.trim() || 'Envío a domicilio'].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={styles.abierta}><View style={styles.punto} /><Text style={styles.abiertaTexto}>Abierta</Text></View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 28, gap: 18 },
  titulo: { fontFamily: fuentes.tituloFuerte, fontSize: 28, color: colores.marino },
  sub: { fontSize: 14, color: colores.textoSuave },
  info: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoTexto: { fontSize: 13, color: colores.textoSuave },

  tarjeta: { gap: 10 },
  sellos: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 6 },
  selloCarrito: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colores.celeste, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  selloCerca: { backgroundColor: colores.blanco, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  selloTexto: { fontSize: 12, fontWeight: '800', color: colores.marino },
  tiempo: { position: 'absolute', right: 12, bottom: 12, backgroundColor: colores.blanco, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  tiempoTexto: { fontSize: 12, fontWeight: '800', color: colores.marino },
  datos: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nombre: { fontFamily: fuentes.titulo, fontSize: 17, color: colores.marino },
  direccion: { fontSize: 13, color: colores.textoSuave },
  abierta: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colores.verdeClaro, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  punto: { width: 7, height: 7, borderRadius: 4, backgroundColor: colores.verde },
  abiertaTexto: { fontSize: 12, fontWeight: '800', color: colores.verdeTexto },

  vacio: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  vacioTexto: { color: colores.textoSuave, textAlign: 'center' },
});
