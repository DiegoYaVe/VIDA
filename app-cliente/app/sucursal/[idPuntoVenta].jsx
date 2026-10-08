// Tienda (diseño "Agua VIDA"): cabecera marina con búsqueda, categorías,
// promoción vigente, productos en cuadrícula por categoría y "Ver carrito".
import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, Image, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text, TextInput } from '../../components/Texto';
import { BotonAtras } from '../../components/Cabecera';
import DetalleProducto from '../../components/DetalleProducto';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import useCarritoStore from '../../store/carritoStore';
import { agregarConTienda } from '../../services/carrito';
import { absImg } from '../../constants/config';
import { colores, fuentes } from '../../constants/tema';
import { useTasaReferencial, precioMonedas } from '../../services/moneda';

const FONDOS = ['#DDF2F8', '#EADCCB', '#F8D9D9', '#FBE3B8', '#E3F3E7', '#F5E7B8'];
const marcaVida = (p) => /\bvida\b/i.test(p.Nombre || '');

function Lupa() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colores.textoSuave} strokeWidth={2.2} strokeLinecap="round">
      <Circle cx={11} cy={11} r={7} /><Path d="M20 20l-3.5-3.5" />
    </Svg>
  );
}

export default function TiendaScreen() {
  const tasa = useTasaReferencial();
  const { idPuntoVenta } = useLocalSearchParams();
  const router = useRouter();
  const { idBranch, idCuenta } = useAuthStore();

  const [productos, setProductos] = useState([]);
  const [tienda, setTienda] = useState(null);
  const [categoria, setCategoria] = useState(null);
  const [soloPromo, setSoloPromo] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(null);

  const items = useCarritoStore((s) => s.items);
  const idPVCarrito = useCarritoStore((s) => s.idPuntoVenta);
  const totalItems = items.reduce((a, i) => a + i.Cantidad, 0);
  const totalUSD = items.reduce((a, i) => a + i.PrecioUSD * i.Cantidad, 0);

  const cargar = useCallback(async () => {
    try {
      setError('');
      const [pr, su] = await Promise.all([
        api.get('/delivery/productos', { params: { idBranch, idCuenta, idPuntoVenta } }),
        api.get('/delivery/sucursales', { params: { idBranch, idCuenta } }),
      ]);
      const lista = pr.data?.productos ?? pr.data ?? [];
      setProductos(lista.filter((p) => String(p.idPuntoVenta) === String(idPuntoVenta)));
      const sucs = su.data?.sucursales ?? su.data ?? [];
      setTienda(sucs.find((s) => String(s.idPuntoVenta) === String(idPuntoVenta)) || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [idBranch, idCuenta, idPuntoVenta]);
  useEffect(() => { cargar(); }, [cargar]);

  const nombre = tienda?.NomComercial || productos[0]?.NombreSucursal || 'Tienda';
  const categorias = useMemo(() => {
    const vistas = new Map();
    productos.forEach((p) => { if (p.idCategoria && !vistas.has(p.idCategoria)) vistas.set(p.idCategoria, p.NombreCategoria || 'General'); });
    return [...vistas.entries()].map(([id, n]) => ({ id, nombre: n }));
  }, [productos]);
  const promo = productos.find((p) => p.PromoNombre);

  const filtrados = useMemo(() => {
    let l = productos;
    if (soloPromo) l = l.filter((p) => p.PromoNombre);
    if (categoria) l = l.filter((p) => p.idCategoria === categoria);
    const q = busqueda.trim().toLowerCase();
    if (q) l = l.filter((p) => (p.Nombre || '').toLowerCase().includes(q));
    return l;
  }, [productos, categoria, soloPromo, busqueda]);
  // Productos agrupados por categoría, en el orden de las píldoras
  const secciones = useMemo(() => {
    const m = new Map();
    filtrados.forEach((p) => {
      const k = p.NombreCategoria || 'Productos';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    });
    return [...m.entries()];
  }, [filtrados]);

  const cantidadDe = (p) => (String(idPVCarrito) === String(p.idPuntoVenta) ? items.find((i) => i.idProducto === p.idProducto)?.Cantidad ?? 0 : 0);
  const agregar = (p, c = 1) => agregarConTienda({ ...p, NombreSucursal: p.NombreSucursal || nombre }, c);
  const total = precioMonedas(totalUSD, tasa);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <View style={styles.cabecera}>
        <View style={styles.cabeceraFila}>
          <BotonAtras oscuro />
          <View style={{ flex: 1 }}>
            <Text style={styles.tiendaNombre} numberOfLines={1}>{nombre}</Text>
            <Text style={styles.tiendaSub} numberOfLines={1}>Abierta · {tienda?.Direccion?.trim() || 'pide a domicilio'}</Text>
          </View>
          <View style={styles.abierta}><Text style={styles.abiertaTexto}>Abierta</Text></View>
        </View>
        <View style={styles.buscar}>
          <Lupa />
          <TextInput style={styles.buscarInput} placeholder={`Buscar en ${nombre}`} placeholderTextColor={colores.textoSuave}
            value={busqueda} onChangeText={setBusqueda} accessibilityLabel="Buscar en la tienda" />
        </View>
      </View>

      {cargando ? <ActivityIndicator size="large" color={colores.celeste} style={{ marginTop: 40 }} /> : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <ScrollView style={{ backgroundColor: colores.fondo }} contentContainerStyle={{ paddingBottom: totalItems > 0 ? 100 : 24 }} showsVerticalScrollIndicator={false}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {[{ id: null, nombre: 'Todo' }, ...categorias].map((c) => {
              const activa = categoria === c.id;
              return (
                <TouchableOpacity key={String(c.id)} style={[styles.chip, activa && styles.chipActivo]} onPress={() => setCategoria(c.id)}>
                  <Text style={[styles.chipTexto, activa && { color: colores.blanco }]}>{c.nombre}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {promo ? (
            <View style={styles.promo}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.promoEtiqueta}>PROMOCIÓN</Text>
                <Text style={styles.promoNombre}>{promo.PromoNombre}</Text>
              </View>
              <TouchableOpacity style={styles.promoVer} onPress={() => setSoloPromo((v) => !v)}>
                <Text style={styles.promoVerTexto}>{soloPromo ? 'Todo' : 'Ver'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {secciones.length === 0 && <Text style={styles.vacio}>No encontramos productos.</Text>}
          {secciones.map(([titulo, lista]) => (
            <View key={titulo} style={styles.seccion}>
              <Text style={styles.h2}>{titulo}</Text>
              <View style={styles.grid}>
                {lista.map((p, i) => {
                  const cant = cantidadDe(p);
                  const { principal, secundario } = precioMonedas(parseFloat(p.PrecioPromo ?? p.PrecioUSD ?? 0), tasa);
                  const img = absImg(p.ImagenProducto);
                  return (
                    <TouchableOpacity key={p.idProducto} style={styles.tarjeta} activeOpacity={0.9} onPress={() => setAbierto(p)}>
                      <View style={[styles.foto, { backgroundColor: FONDOS[i % FONDOS.length] }]}>
                        {img ? <Image source={{ uri: img }} style={styles.fotoImg} /> : null}
                        {marcaVida(p) ? <View style={styles.vida}><Text style={styles.vidaTexto}>VIDA</Text></View> : null}
                        {p.PromoBadge ? <View style={styles.badge}><Text style={styles.badgeTexto}>{p.PromoBadge}</Text></View> : null}
                      </View>
                      <Text style={styles.prodNombre} numberOfLines={2}>{p.Nombre}</Text>
                      <View style={styles.prodPie}>
                        <View style={{ flexShrink: 1 }}>
                          <Text style={styles.prodPrecio}>{principal}</Text>
                          {secundario ? <Text style={styles.prodSec} numberOfLines={1}>{secundario}</Text> : null}
                        </View>
                        <TouchableOpacity style={[styles.mas, cant > 0 && styles.masLleno]} onPress={() => agregar(p)} accessibilityLabel={`Agregar ${p.Nombre}`}>
                          <Text style={[styles.masTexto, cant > 0 && { color: colores.marino }]}>{cant > 0 ? cant : '+'}</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {totalItems > 0 && (
        <TouchableOpacity style={styles.verCarrito} activeOpacity={0.9} onPress={() => router.push('/(tabs)/carrito')}>
          <View style={styles.verCarritoNum}><Text style={styles.verCarritoNumTexto}>{totalItems}</Text></View>
          <Text style={styles.verCarritoTexto}>Ver carrito</Text>
          <View style={{ alignItems: 'flex-end', paddingRight: 10 }}>
            <Text style={styles.verCarritoTotal}>{total.principal}</Text>
            {total.secundario ? <Text style={styles.verCarritoSec}>{total.secundario}</Text> : null}
          </View>
        </TouchableOpacity>
      )}

      {abierto && <DetalleProducto producto={abierto} onClose={() => setAbierto(null)} onAgregar={agregar} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.marino },
  cabecera: { backgroundColor: colores.marino, paddingTop: 16, paddingHorizontal: 20, paddingBottom: 20, gap: 14 },
  cabeceraFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tiendaNombre: { fontFamily: fuentes.titulo, fontSize: 19, color: colores.blanco },
  tiendaSub: { fontSize: 13, color: colores.sobreMarino },
  abierta: { backgroundColor: colores.verde, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  abiertaTexto: { color: colores.marino, fontWeight: '800', fontSize: 12 },
  buscar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colores.blanco, borderRadius: 16, paddingHorizontal: 14, height: 48 },
  buscarInput: { flex: 1, fontSize: 15, color: colores.marino },

  chips: { gap: 8, paddingHorizontal: 20, paddingTop: 14, backgroundColor: colores.fondo },
  chip: { height: 40, paddingHorizontal: 16, borderRadius: 99, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, justifyContent: 'center' },
  chipActivo: { backgroundColor: colores.marino, borderColor: colores.marino },
  chipTexto: { fontWeight: '700', fontSize: 14, color: colores.marino },

  promo: { marginTop: 14, marginHorizontal: 20, backgroundColor: colores.celesteClaro, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  promoEtiqueta: { fontSize: 12, fontWeight: '800', color: colores.marinoClaro, letterSpacing: 0.7 },
  promoNombre: { fontFamily: fuentes.titulo, fontSize: 16, color: colores.marino },
  promoVer: { minHeight: 44, justifyContent: 'center' },
  promoVerTexto: { fontWeight: '800', fontSize: 14, color: colores.marino, textDecorationLine: 'underline' },

  seccion: { paddingTop: 16, paddingHorizontal: 20, gap: 10 },
  h2: { fontFamily: fuentes.titulo, fontSize: 18, color: colores.marino },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tarjeta: { width: '47.8%', backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 20, padding: 10, gap: 8 },
  foto: { height: 96, borderRadius: 14, overflow: 'hidden' },
  fotoImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  vida: { position: 'absolute', top: 8, right: 8, backgroundColor: colores.marino, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  vidaTexto: { color: colores.blanco, fontSize: 10, fontWeight: '800' },
  badge: { position: 'absolute', top: 8, left: 8, backgroundColor: colores.verde, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  badgeTexto: { color: colores.marino, fontSize: 10, fontWeight: '800' },
  prodNombre: { fontWeight: '800', fontSize: 14, lineHeight: 17, color: colores.marino },
  prodPie: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  prodPrecio: { fontFamily: fuentes.titulo, fontSize: 16, color: colores.marino },
  prodSec: { fontSize: 11, color: colores.textoSuave },
  mas: { width: 44, height: 44, borderRadius: 22, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  masLleno: { backgroundColor: colores.celeste },
  masTexto: { color: colores.blanco, fontWeight: '800', fontSize: 15 },

  verCarrito: {
    position: 'absolute', left: 16, right: 16, bottom: 16, height: 62, borderRadius: 20, backgroundColor: colores.marino,
    flexDirection: 'row', alignItems: 'center', paddingLeft: 18, paddingRight: 8, gap: 12,
  },
  verCarritoNum: { width: 34, height: 34, borderRadius: 12, backgroundColor: colores.celeste, alignItems: 'center', justifyContent: 'center' },
  verCarritoNumTexto: { color: colores.marino, fontWeight: '800' },
  verCarritoTexto: { flex: 1, color: colores.blanco, fontWeight: '800', fontSize: 16 },
  verCarritoTotal: { fontFamily: fuentes.titulo, fontSize: 17, color: colores.blanco },
  verCarritoSec: { fontSize: 11, color: colores.sobreMarino },

  error: { color: colores.error, textAlign: 'center', padding: 24, backgroundColor: colores.fondo },
  vacio: { textAlign: 'center', color: colores.textoSuave, padding: 24 },
});
