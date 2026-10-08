// Inicio de la app cliente (diseño "Agua VIDA", propuesta B): saludo con el
// símbolo VIDA, dirección y avatar; hidratación del día; repetir el último
// pedido; categorías en píldoras y productos de la tienda en lista.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, FlatList, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../components/Texto';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Circle } from 'react-native-svg';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import useCarritoStore from '../../store/carritoStore';
import { absImg } from '../../constants/config';
import { colores, fuentes, logos } from '../../constants/tema';
import DetalleProducto from '../../components/DetalleProducto';
import Anillo from '../../components/Anillo';
import { useTasaReferencial, precioMonedas } from '../../services/moneda';
import { agregarConTienda } from '../../services/carrito';

function saludo() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}
const iniciales = (c) => `${String(c?.Nombre || '').trim()[0] || ''}${String(c?.Apellidos || '').trim()[0] || ''}`.toUpperCase() || 'VI';
const haceDias = (f) => {
  const d = Math.floor((Date.now() - new Date(f).getTime()) / 86400000);
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`;
};

export function IconoMas({ color = colores.marino, tam = 18 }) {
  return (
    <Svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.8} strokeLinecap="round">
      <Path d="M12 5v14M5 12h14" />
    </Svg>
  );
}
function IconoUbicacion() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colores.marino} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" />
      <Circle cx={12} cy={10} r={2.5} />
    </Svg>
  );
}

// Fila de producto (también la usa la tienda): foto, nombre, Bs, USD y +
export function FilaProducto({ p, tasa, cantidad, onAbrir, onAgregar }) {
  const { principal, secundario } = precioMonedas(parseFloat(p.PrecioUSD || 0), tasa);
  const img = absImg(p.ImagenProducto);
  return (
    <TouchableOpacity style={styles.fila} activeOpacity={0.88} onPress={onAbrir}>
      <View style={styles.filaFoto}>{img ? <Image source={{ uri: img }} style={styles.filaImg} /> : null}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.filaNombre} numberOfLines={1}>{p.Nombre}</Text>
        {secundario ? <Text style={styles.filaSec} numberOfLines={1}>{secundario}</Text> : null}
      </View>
      <Text style={styles.filaPrecio}>{principal}</Text>
      <TouchableOpacity style={[styles.mas, cantidad > 0 && styles.masLleno]} onPress={onAgregar} accessibilityLabel={`Agregar ${p.Nombre}`}>
        {cantidad > 0 ? <Text style={styles.masNum}>{cantidad}</Text> : <IconoMas />}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const tasa = useTasaReferencial();
  const router = useRouter();
  const { idBranch, idCuenta, cliente, token } = useAuthStore();

  const [productos, setProductos] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [ultimo, setUltimo] = useState(null);
  const [categoria, setCategoria] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [productoAbierto, setProductoAbierto] = useState(null);
  const [hidra, setHidra] = useState(null);
  const [vasoOcupado, setVasoOcupado] = useState(false);

  const items = useCarritoStore((s) => s.items);
  const idPVCarrito = useCarritoStore((s) => s.idPuntoVenta);

  const cargar = useCallback(async () => {
    try {
      setError('');
      const [prodRes, sucRes] = await Promise.all([
        api.get('/delivery/productos', { params: { idBranch, idCuenta } }),
        api.get('/delivery/sucursales', { params: { idBranch, idCuenta } }),
      ]);
      setProductos(prodRes.data?.productos ?? prodRes.data ?? []);
      setSucursales(sucRes.data?.sucursales ?? sucRes.data ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [idBranch, idCuenta]);

  // Con sesión: hidratación del día y último pedido (para "Repetir")
  const cargarCliente = useCallback(async () => {
    if (!token) { setHidra(null); setUltimo(null); return; }
    api.get('/delivery/cliente/hidratacion').then((r) => setHidra(r.data)).catch(() => setHidra(null));
    api.get('/delivery/cliente/pedidos').then((r) => {
      const lista = Array.isArray(r.data) ? r.data : [];
      setUltimo(lista.find((p) => p.items?.length) || null);
    }).catch(() => setUltimo(null));
  }, [token]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { cargarCliente(); }, [cargarCliente]);

  const onRefresh = () => { setRefreshing(true); cargar(); cargarCliente(); };

  const tomarVaso = async () => {
    if (vasoOcupado) return;
    setVasoOcupado(true);
    try {
      const r = await api.post('/delivery/cliente/hidratacion/vaso');
      setHidra((d) => ({ ...d, vasosHoy: r.data.vasosHoy, mlHoy: r.data.mlHoy, racha: r.data.racha }));
      if (r.data.bonus > 0) Alert.alert('¡Racha completada!', `Llevas ${r.data.racha} días cumpliendo tu meta. Ganaste ${r.data.bonus} puntos VIDA.`);
    } catch {} finally { setVasoOcupado(false); }
  };

  // Tienda que se muestra: la del carrito, la del último pedido o la primera
  const idTienda = idPVCarrito || ultimo?.idPuntoVenta || sucursales[0]?.idPuntoVenta || null;
  const deTienda = useMemo(
    () => (idTienda ? productos.filter((p) => String(p.idPuntoVenta) === String(idTienda)) : productos),
    [productos, idTienda]);
  const categorias = useMemo(() => {
    const vistas = new Map();
    deTienda.forEach((p) => { if (p.idCategoria && !vistas.has(p.idCategoria)) vistas.set(p.idCategoria, p.NombreCategoria || 'General'); });
    return [...vistas.entries()].map(([id, nombre]) => ({ id, nombre }));
  }, [deTienda]);
  const lista = useMemo(() => (categoria ? deTienda.filter((p) => p.idCategoria === categoria) : deTienda), [deTienda, categoria]);
  const agua = useMemo(() => deTienda.find((p) => /agua/i.test(p.Nombre || '')) || null, [deTienda]);

  const cantidadDe = (p) => (String(idPVCarrito) === String(p.idPuntoVenta) ? items.find((i) => i.idProducto === p.idProducto)?.Cantidad ?? 0 : 0);
  const agregar = (p, cantidad = 1) => agregarConTienda(p, cantidad);

  const repetir = () => {
    if (!ultimo) return;
    const ok = agregarConTienda(
      { ...ultimo.items[0], idPuntoVenta: ultimo.idPuntoVenta, NombreSucursal: ultimo.NombreSucursal },
      ultimo.items[0].Cantidad,
      () => {
        ultimo.items.slice(1).forEach((it) => useCarritoStore.getState().agregarItem(
          { idProducto: it.idProducto, Nombre: it.Nombre, PrecioUSD: it.PrecioUSD, ImagenProducto: it.ImagenProducto }, it.Cantidad));
        router.push('/(tabs)/carrito');
      });
    return ok;
  };

  const direccion = ultimo?.DireccionEntrega?.split('—')[0]?.trim()
    || sucursales.find((s) => String(s.idPuntoVenta) === String(idTienda))?.NomComercial || 'Elige tu tienda';
  const meta = Math.max(1, Number(hidra?.meta) || 8);
  const vasos = Number(hidra?.vasosHoy) || 0;
  const faltan = Math.max(0, meta - vasos);

  const Cabecera = (
    <View>
      {/* Hidratación */}
      {token && hidra ? (
        <View style={styles.hidra}>
          <View style={styles.hidraDeco} />
          {hidra.activa ? (
            <>
              <Anillo tam={104} grosor={12} avance={vasos / meta} color={colores.celeste} pista={colores.marinoSuave}>
                <View style={styles.hidraCentro}>
                  <Text style={styles.hidraNum}>{vasos}/{meta}</Text>
                  <Text style={styles.hidraUnidad}>vasos</Text>
                </View>
              </Anillo>
              <View style={styles.hidraTexto}>
                <Text style={styles.hidraTitulo}>
                  {faltan === 0 ? '¡Meta cumplida!\nSigue así.' : `${vasos === 0 ? 'Empieza tu día.' : 'Vas bien hoy.'}\nTe faltan ${faltan} vaso${faltan === 1 ? '' : 's'}.`}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={styles.hidraBtn} onPress={tomarVaso} disabled={vasoOcupado}>
                    <Text style={styles.hidraBtnTexto}>+ 1 vaso</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.hidraRacha} onPress={() => router.push('/mi-consumo')}>
                    <Text style={styles.hidraRachaTexto}>Racha {Number(hidra.racha) || 0} día{Number(hidra.racha) === 1 ? '' : 's'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          ) : (
            <>
              <Anillo tam={104} grosor={12} avance={0} pista={colores.marinoSuave}>
                <View style={styles.hidraCentro}><Text style={styles.hidraNum}>0/8</Text><Text style={styles.hidraUnidad}>vasos</Text></View>
              </Anillo>
              <View style={styles.hidraTexto}>
                <Text style={styles.hidraTitulo}>Mide tu agua del día.{'\n'}Gana puntos por racha.</Text>
                <TouchableOpacity style={[styles.hidraBtn, { alignSelf: 'flex-start' }]} onPress={() => router.push('/mi-consumo')}>
                  <Text style={styles.hidraBtnTexto}>Activar</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      ) : null}

      {/* Repetir el último pedido (o pedir el agua VIDA) */}
      {ultimo ? (() => {
        const it = ultimo.items[0];
        const { principal, secundario } = precioMonedas(it.PrecioUSD, tasa);
        const img = absImg(it.ImagenProducto);
        return (
          <View style={styles.repetir}>
            <View style={styles.repetirFoto}>{img ? <Image source={{ uri: img }} style={styles.repetirImg} /> : null}</View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.repetirNombre} numberOfLines={2}>{it.Nombre}{ultimo.items.length > 1 ? ` y ${ultimo.items.length - 1} más` : ''}</Text>
              <Text style={styles.repetirSub}>Tu último pedido · {haceDias(ultimo.FechaCreacion)}</Text>
              <Text style={styles.repetirPrecio}>{principal} {secundario ? <Text style={styles.repetirPrecioSec}>{secundario}</Text> : null}</Text>
            </View>
            <TouchableOpacity style={styles.repetirBtn} onPress={repetir}>
              <Text style={styles.repetirBtnTexto}>Repetir</Text>
            </TouchableOpacity>
          </View>
        );
      })() : agua ? (() => {
        const { principal, secundario } = precioMonedas(parseFloat(agua.PrecioUSD || 0), tasa);
        const img = absImg(agua.ImagenProducto);
        return (
          <View style={styles.repetir}>
            <View style={styles.repetirFoto}>{img ? <Image source={{ uri: img }} style={styles.repetirImg} /> : null}</View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.repetirNombre} numberOfLines={2}>{agua.Nombre}</Text>
              <Text style={styles.repetirSub}>Pídela en {agua.NombreSucursal}</Text>
              <Text style={styles.repetirPrecio}>{principal} {secundario ? <Text style={styles.repetirPrecioSec}>{secundario}</Text> : null}</Text>
            </View>
            <TouchableOpacity style={styles.repetirBtn} onPress={() => agregar(agua)}>
              <Text style={styles.repetirBtnTexto}>Agregar</Text>
            </TouchableOpacity>
          </View>
        );
      })() : null}

      {/* Categorías */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ marginTop: 20 }}>
        {[{ id: null, nombre: 'Todo' }, ...categorias].map((c) => {
          const activa = categoria === c.id;
          return (
            <TouchableOpacity key={String(c.id)} style={[styles.chip, activa && styles.chipActivo]} onPress={() => setCategoria(c.id)}>
              <Text style={[styles.chipTexto, activa && { color: colores.blanco }]} numberOfLines={1}>{c.nombre}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.cabecera}>
        <View style={styles.cabeceraIzq}>
          <View style={styles.simbolo}>
            <Image source={logos.simboloClaro} style={styles.simboloImg} resizeMode="contain" accessibilityLabel="VIDA" />
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.saludo} numberOfLines={1}>{saludo()}{cliente?.Nombre ? `, ${String(cliente.Nombre).split(' ')[0]}` : ''}</Text>
            <TouchableOpacity style={styles.direccion} onPress={() => router.push('/(tabs)/tiendas')} accessibilityLabel="Cambiar de tienda">
              <IconoUbicacion />
              <Text style={styles.direccionTexto} numberOfLines={1}>{direccion}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity style={styles.avatar} onPress={() => router.push(token ? '/(tabs)/perfil' : '/(auth)/login')} accessibilityLabel="Mi perfil">
          <Text style={styles.avatarTexto}>{token ? iniciales(cliente) : '?'}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centro}><ActivityIndicator size="large" color={colores.marino} /></View>
      ) : error ? (
        <View style={styles.centro}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity style={styles.reintentar} onPress={cargar}><Text style={styles.reintentarTexto}>Reintentar</Text></TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={lista}
          keyExtractor={(p) => `${p.idProducto}-${p.idPuntoVenta}`}
          renderItem={({ item }) => (
            <FilaProducto p={item} tasa={tasa} cantidad={cantidadDe(item)} onAbrir={() => setProductoAbierto(item)} onAgregar={() => agregar(item)} />
          )}
          ListHeaderComponent={Cabecera}
          contentContainerStyle={styles.lista}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colores.marino} />}
          ListEmptyComponent={<Text style={styles.vacio}>Esta tienda aún no tiene productos.</Text>}
        />
      )}

      {productoAbierto && (
        <DetalleProducto producto={productoAbierto} onClose={() => setProductoAbierto(null)} onAgregar={agregar} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  cabecera: { paddingTop: 20, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  cabeceraIzq: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  simbolo: { width: 48, height: 48, borderRadius: 15, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, alignItems: 'center', justifyContent: 'center' },
  simboloImg: { width: 22, height: 36 },
  saludo: { fontSize: 13, color: colores.textoSuave },
  direccion: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  direccionTexto: { fontFamily: fuentes.titulo, fontSize: 17, color: colores.marino, flexShrink: 1 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { fontFamily: fuentes.titulo, fontSize: 15, color: colores.blanco },

  lista: { paddingBottom: 24 },

  hidra: {
    marginTop: 16, marginHorizontal: 20, backgroundColor: colores.marino, borderRadius: 28, padding: 20,
    flexDirection: 'row', alignItems: 'center', gap: 18, overflow: 'hidden',
  },
  hidraDeco: { position: 'absolute', right: -40, bottom: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: colores.marinoClaro },
  hidraCentro: { width: 80, height: 80, borderRadius: 40, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  hidraNum: { fontFamily: fuentes.tituloFuerte, fontSize: 26, lineHeight: 28, color: colores.blanco },
  hidraUnidad: { fontSize: 11, color: colores.sobreMarino },
  hidraTexto: { flex: 1, gap: 8 },
  hidraTitulo: { fontFamily: fuentes.titulo, fontSize: 18, lineHeight: 22, color: colores.blanco },
  hidraBtn: { backgroundColor: colores.celeste, height: 44, paddingHorizontal: 14, borderRadius: 14, justifyContent: 'center' },
  hidraBtnTexto: { color: colores.marino, fontWeight: '800', fontSize: 14 },
  hidraRacha: { backgroundColor: 'rgba(255,255,255,0.14)', height: 44, paddingHorizontal: 14, borderRadius: 14, justifyContent: 'center' },
  hidraRachaTexto: { color: colores.blanco, fontWeight: '700', fontSize: 14 },

  repetir: {
    marginTop: 14, marginHorizontal: 20, backgroundColor: colores.blanco, borderRadius: 22, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: colores.borde,
  },
  repetirFoto: { width: 60, height: 72, borderRadius: 16, backgroundColor: colores.celesteClaro, overflow: 'hidden' },
  repetirImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  repetirNombre: { fontWeight: '800', fontSize: 15, color: colores.marino },
  repetirSub: { fontSize: 13, color: colores.textoSuave },
  repetirPrecio: { fontFamily: fuentes.titulo, fontSize: 16, color: colores.marino },
  repetirPrecioSec: { fontFamily: fuentes.textoSemi, fontSize: 12, color: colores.textoSuave },
  repetirBtn: { backgroundColor: colores.marino, height: 46, paddingHorizontal: 16, borderRadius: 14, justifyContent: 'center' },
  repetirBtnTexto: { color: colores.blanco, fontWeight: '800', fontSize: 14 },

  chips: { paddingHorizontal: 20, gap: 8, paddingBottom: 12 },
  chip: { height: 40, paddingHorizontal: 16, borderRadius: 99, backgroundColor: colores.blanco, justifyContent: 'center' },
  chipActivo: { backgroundColor: colores.marino },
  chipTexto: { fontWeight: '700', fontSize: 14, color: colores.marino },

  fila: {
    marginHorizontal: 20, marginBottom: 10, backgroundColor: colores.blanco, borderRadius: 20,
    paddingVertical: 10, paddingLeft: 10, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: colores.borde,
  },
  filaFoto: { width: 54, height: 54, borderRadius: 14, backgroundColor: colores.celesteClaro, overflow: 'hidden' },
  filaImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  filaNombre: { fontWeight: '800', fontSize: 15, color: colores.marino },
  filaSec: { fontSize: 12, color: colores.textoSuave },
  filaPrecio: { fontFamily: fuentes.titulo, fontSize: 16, color: colores.marino },
  mas: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  masLleno: { backgroundColor: colores.celeste, borderColor: colores.celeste },
  masNum: { fontWeight: '800', fontSize: 15, color: colores.marino },

  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: colores.error, textAlign: 'center', fontSize: 14 },
  reintentar: { marginTop: 12, backgroundColor: colores.marino, borderRadius: 14, paddingHorizontal: 22, minHeight: 44, justifyContent: 'center' },
  reintentarTexto: { color: colores.blanco, fontWeight: '800' },
  vacio: { textAlign: 'center', color: colores.textoSuave, padding: 24 },
});
