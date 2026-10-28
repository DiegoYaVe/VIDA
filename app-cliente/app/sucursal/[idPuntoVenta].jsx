// Tienda (estilo apps de delivery): portada con volver y buscar, datos de la
// tienda (tiempo, distancia, formas de pago), pestañas de categoría fijas
// que llevan a su sección, carrusel "Lo más pedido" y cada producto con su
// control de cantidad (+ → − n +). Barra "Ver carrito" flotante.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Image, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text } from '../../components/Texto';
import DetalleProducto from '../../components/DetalleProducto';
import { FilaProducto } from '../(tabs)/index';
import { Icono, ControlCantidad, Buscador, BarraCarrito, PortadaTienda, useCantidades } from '../../components/ui';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import useCarritoStore from '../../store/carritoStore';
import { absImg } from '../../constants/config';
import { colores, fuentes, sombraFuerte } from '../../constants/tema';
import { useTasaReferencial, precioMonedas } from '../../services/moneda';
import { obtenerUbicacion, kmEntre, textoDistancia } from '../../services/cercania';

const ALTO_PORTADA = 190;

export default function TiendaScreen() {
  const tasa = useTasaReferencial();
  const { idPuntoVenta } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { idBranch, idCuenta } = useAuthStore();
  const scrollRef = useRef(null);
  const posiciones = useRef({}); // categoría → y de su sección (dentro del bloque de productos)
  const base = useRef(0); // y del bloque de productos en el scroll

  const [productos, setProductos] = useState([]);
  const [tienda, setTienda] = useState(null);
  const [km, setKm] = useState(null);
  const [categoria, setCategoria] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(null);
  const [compacta, setCompacta] = useState(false);
  const [fijas, setFijas] = useState(false); // pestañas dentro de la barra superior
  const yPestanas = useRef(0);

  const hayCarrito = useCarritoStore((s) => s.items.length > 0);

  const cargar = useCallback(async () => {
    try {
      setError('');
      const [pr, su, pos] = await Promise.all([
        api.get('/delivery/productos', { params: { idBranch, idCuenta, idPuntoVenta } }),
        api.get('/delivery/sucursales', { params: { idBranch, idCuenta } }),
        obtenerUbicacion(),
      ]);
      const lista = pr.data?.productos ?? pr.data ?? [];
      setProductos(lista.filter((p) => String(p.idPuntoVenta) === String(idPuntoVenta)));
      const sucs = su.data?.sucursales ?? su.data ?? [];
      const t = sucs.find((s) => String(s.idPuntoVenta) === String(idPuntoVenta)) || null;
      setTienda(t);
      const lat = parseFloat(t?.Latitud), lon = parseFloat(t?.Longitud);
      setKm(pos && Number.isFinite(lat) && Number.isFinite(lon) ? kmEntre(pos, { lat, lon }) : null);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [idBranch, idCuenta, idPuntoVenta]);
  useEffect(() => { cargar(); }, [cargar]);

  const nombre = tienda?.NomComercial || productos[0]?.NombreSucursal || 'Tienda';
  const { cantidadDe, mas, menos } = useCantidades(nombre);
  const promo = productos.find((p) => p.PromoNombre);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return q ? productos.filter((p) => (p.Nombre || '').toLowerCase().includes(q)) : productos;
  }, [productos, busqueda]);
  // Productos agrupados por categoría
  const secciones = useMemo(() => {
    const m = new Map();
    filtrados.forEach((p) => {
      const k = p.NombreCategoria || 'Productos';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    });
    return [...m.entries()];
  }, [filtrados]);
  // Lo más pedido: primero las ofertas, luego los primeros del catálogo
  const destacados = useMemo(() => {
    const conPromo = productos.filter((p) => p.PromoBadge || p.PromoNombre);
    return [...conPromo, ...productos.filter((p) => !conPromo.includes(p))].slice(0, 8);
  }, [productos]);

  const irACategoria = (k) => {
    setCategoria(k);
    const y = posiciones.current[k];
    if (y != null) scrollRef.current?.scrollTo({ y: base.current + y - (insets.top + 100), animated: true });
  };
  const alDesplazar = (e) => {
    const y = e.nativeEvent.contentOffset.y;
    setCompacta(y > ALTO_PORTADA - 70);
    setFijas(y > yPestanas.current - (insets.top + 58));
    // La pestaña activa sigue a la sección que está a la vista
    let actual = null;
    for (const [k] of secciones) if (posiciones.current[k] != null && base.current + posiciones.current[k] - (insets.top + 120) <= y) actual = k;
    if (actual !== categoria) setCategoria(actual);
  };

  const minutos = km != null ? Math.round(15 + km * 3) : null;
  const datos = [
    minutos ? { icono: 'time-outline', texto: `${minutos}–${minutos + 10} min` } : null,
    km != null ? { icono: 'navigate-outline', texto: textoDistancia(km).replace(/^a /, '') } : null,
    { icono: 'bicycle-outline', texto: 'A domicilio' },
  ].filter(Boolean);

  const Pestanas = (
    <View style={styles.pestanas}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pestanasFila}>
        {secciones.map(([k]) => {
          const on = categoria === k;
          return (
            <TouchableOpacity key={k} style={[styles.pestana, on && styles.pestanaOn]} onPress={() => irACategoria(k)} accessibilityState={{ selected: on }}>
              <Text style={[styles.pestanaTexto, on && styles.pestanaTextoOn]}>{k}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style={compacta ? 'dark' : 'light'} />

      {/* Barra superior: flota sobre la portada y se vuelve blanca al bajar */}
      <View style={[styles.barraCaja, compacta && styles.barraCompacta]}>
      <View style={[styles.barra, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.redondo} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} accessibilityLabel="Volver">
          <Icono nombre="arrow-back" tam={22} />
        </TouchableOpacity>
        <Text style={[styles.barraTitulo, !compacta && { opacity: 0 }]} numberOfLines={1}>{nombre}</Text>
        <TouchableOpacity style={styles.redondo} onPress={() => { setBuscando((v) => !v); if (buscando) setBusqueda(''); }}
          accessibilityLabel={buscando ? 'Cerrar búsqueda' : 'Buscar en la tienda'}>
          <Icono nombre={buscando ? 'close' : 'search'} tam={21} />
        </TouchableOpacity>
      </View>
      {fijas && secciones.length > 0 ? Pestanas : null}
      </View>

      {cargando ? <ActivityIndicator size="large" color={colores.marino} style={{ marginTop: 240 }} /> : error ? (
        <View style={styles.centro}>
          <Icono nombre="cloud-offline-outline" tam={40} color={colores.textoTenue} />
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity style={styles.reintentar} onPress={cargar}><Text style={styles.reintentarTexto}>Reintentar</Text></TouchableOpacity>
        </View>
      ) : (
        <ScrollView ref={scrollRef} onScroll={alDesplazar} scrollEventThrottle={32}
          contentContainerStyle={{ paddingBottom: hayCarrito ? 110 + insets.bottom : 32 }} showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {/* 0 · Portada */}
          <PortadaTienda nombre={nombre} id={idPuntoVenta} alto={ALTO_PORTADA + insets.top} radio={0} />

          {/* 1 · Datos de la tienda */}
          <View style={styles.info}>
            <Text style={styles.nombre}>{nombre}</Text>
            <View style={styles.estadoFila}>
              <View style={styles.abierta}><View style={styles.punto} /><Text style={styles.abiertaTexto}>Abierta</Text></View>
              {tienda?.Direccion?.trim() ? <Text style={styles.direccion} numberOfLines={1}>{tienda.Direccion.trim()}</Text> : null}
            </View>
            <View style={styles.datos}>
              {datos.map((d) => (
                <View key={d.texto} style={styles.dato}>
                  <Icono nombre={d.icono} tam={16} color={colores.textoSuave} />
                  <Text style={styles.datoTexto}>{d.texto}</Text>
                </View>
              ))}
            </View>
            <View style={styles.pagos}>
              <Icono nombre="wallet-outline" tam={18} />
              <Text style={styles.pagosTexto}>Efectivo, tarjeta al recibir o Pago Móvil</Text>
            </View>
            {buscando ? <Buscador valor={busqueda} onCambiar={setBusqueda} placeholder={`Buscar en ${nombre}`} autoFocus /> : null}
          </View>

          {/* 2 · Pestañas de categoría (al bajar pasan a la barra superior) */}
          <View onLayout={(e) => { yPestanas.current = e.nativeEvent.layout.y; }} style={fijas && { opacity: 0 }}>{Pestanas}</View>

          {/* 3 · Promoción, lo más pedido y secciones */}
          <View onLayout={(e) => { base.current = e.nativeEvent.layout.y; }}>
            {promo && !busqueda ? (
              <View style={styles.promo}>
                <View style={styles.promoIcono}><Icono nombre="pricetags" tam={22} color={colores.marino} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.promoEtiqueta}>PROMOCIÓN</Text>
                  <Text style={styles.promoNombre}>{promo.PromoNombre}</Text>
                </View>
              </View>
            ) : null}

            {!busqueda && destacados.length > 2 ? (
              <View style={{ gap: 12, paddingTop: 18 }}>
                <Text style={styles.h2Pad}>Lo más pedido</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carrusel}>
                  {destacados.map((p) => {
                    const img = absImg(p.ImagenProducto);
                    const { principal } = precioMonedas(parseFloat(p.PrecioPromo ?? p.PrecioUSD ?? 0), tasa);
                    return (
                      <TouchableOpacity key={p.idProducto} style={styles.destacado} activeOpacity={0.9} onPress={() => setAbierto(p)}>
                        <View style={styles.destacadoFoto}>
                          {img ? <Image source={{ uri: img }} style={styles.img} /> : <Icono nombre="cube-outline" tam={30} color={colores.textoTenue} />}
                          {p.PromoBadge ? <View style={styles.badge}><Text style={styles.badgeTexto} numberOfLines={1}>{p.PromoBadge}</Text></View> : null}
                          <View style={styles.destacadoControl}>
                            <ControlCantidad cantidad={cantidadDe(p)} onMas={() => mas(p)} onMenos={() => menos(p)} flotante nombre={p.Nombre} />
                          </View>
                        </View>
                        <Text style={styles.destacadoPrecio}>{principal}</Text>
                        <Text style={styles.destacadoNombre} numberOfLines={2}>{p.Nombre}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {secciones.length === 0 && (
              <View style={styles.sinResultados}>
                <Icono nombre="search-outline" tam={36} color={colores.textoTenue} />
                <Text style={styles.vacio}>{busqueda ? `No encontramos "${busqueda}".` : 'Esta tienda aún no tiene productos.'}</Text>
              </View>
            )}
            {secciones.map(([titulo, lista]) => (
              <View key={titulo} style={styles.seccion} onLayout={(e) => { posiciones.current[titulo] = e.nativeEvent.layout.y; }}>
                <Text style={styles.h2}>{titulo}</Text>
                {lista.map((p, i) => (
                  <FilaProducto key={p.idProducto} p={p} tasa={tasa} cantidad={cantidadDe(p)} ultimo={i === lista.length - 1}
                    onAbrir={() => setAbierto(p)} onMas={() => mas(p)} onMenos={() => menos(p)} />
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      <BarraCarrito abajo={Math.max(insets.bottom, 12) + 4} />
      {abierto && <DetalleProducto producto={abierto} nombreTienda={nombre} onClose={() => setAbierto(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  barraCaja: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  barra: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  barraCompacta: { backgroundColor: colores.blanco, borderBottomWidth: 1, borderBottomColor: colores.separador },
  barraTitulo: { flex: 1, textAlign: 'center', fontFamily: fuentes.titulo, fontSize: 16, color: colores.marino },
  redondo: { width: 42, height: 42, borderRadius: 21, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center', ...sombraFuerte, shadowOpacity: 0.12 },

  info: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6, gap: 10, backgroundColor: colores.blanco },
  nombre: { fontFamily: fuentes.tituloFuerte, fontSize: 26, lineHeight: 31, color: colores.marino },
  estadoFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  abierta: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colores.verdeClaro, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  punto: { width: 7, height: 7, borderRadius: 4, backgroundColor: colores.verde },
  abiertaTexto: { fontSize: 12, fontWeight: '800', color: colores.verdeTexto },
  direccion: { flex: 1, fontSize: 13, color: colores.textoSuave },
  datos: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  dato: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colores.superficie, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 },
  datoTexto: { fontSize: 13, fontWeight: '700', color: colores.marino },
  pagos: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  pagosTexto: { fontSize: 13, color: colores.textoSuave },

  pestanas: { backgroundColor: colores.blanco, borderBottomWidth: 1, borderBottomColor: colores.separador },
  pestanasFila: { paddingHorizontal: 16, gap: 4 },
  pestana: { height: 48, paddingHorizontal: 12, justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  pestanaOn: { borderBottomColor: colores.marino },
  pestanaTexto: { fontWeight: '700', fontSize: 14, color: colores.textoSuave },
  pestanaTextoOn: { fontWeight: '800', color: colores.marino },

  promo: { marginTop: 16, marginHorizontal: 20, backgroundColor: colores.celesteClaro, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  promoIcono: { width: 44, height: 44, borderRadius: 22, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center' },
  promoEtiqueta: { fontSize: 11, fontWeight: '800', color: colores.marinoClaro, letterSpacing: 0.6 },
  promoNombre: { fontFamily: fuentes.titulo, fontSize: 15, color: colores.marino },

  h2Pad: { paddingHorizontal: 20, fontFamily: fuentes.tituloFuerte, fontSize: 20, color: colores.marino },
  carrusel: { paddingHorizontal: 20, gap: 12 },
  destacado: { width: 136, gap: 2 },
  destacadoFoto: { height: 136, borderRadius: 16, backgroundColor: colores.superficie, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  img: { width: '100%', height: '100%', resizeMode: 'cover' },
  badge: { position: 'absolute', top: 8, left: 8, maxWidth: 110, backgroundColor: colores.verde, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTexto: { fontSize: 10, fontWeight: '800', color: colores.marino },
  destacadoControl: { position: 'absolute', right: 6, bottom: 6 },
  destacadoPrecio: { fontFamily: fuentes.titulo, fontSize: 15, color: colores.marino },
  destacadoNombre: { fontSize: 13, color: colores.textoSuave, lineHeight: 17 },

  seccion: { paddingTop: 22 },
  h2: { paddingHorizontal: 20, fontFamily: fuentes.tituloFuerte, fontSize: 20, color: colores.marino, marginBottom: 2 },

  centro: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10, marginTop: 200 },
  error: { color: colores.error, textAlign: 'center' },
  reintentar: { backgroundColor: colores.marino, borderRadius: 99, paddingHorizontal: 22, minHeight: 44, justifyContent: 'center' },
  reintentarTexto: { color: colores.blanco, fontWeight: '800' },
  sinResultados: { alignItems: 'center', padding: 32, gap: 10 },
  vacio: { textAlign: 'center', color: colores.textoSuave },
});
