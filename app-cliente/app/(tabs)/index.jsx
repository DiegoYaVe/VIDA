// Inicio de la app cliente (estilo apps de delivery): "Entregar en" con la
// tienda, buscador, categorías con icono, hidratación del día, repetir el
// último pedido, tiendas cercanas en carrusel y productos de la tienda con
// su control de cantidad (+ → − n +) en cada uno.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, FlatList, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../components/Texto';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { reprogramarRecordatorios } from '../../services/recordatorios';
import { obtenerUbicacion, ordenarPorCercania, textoDistancia } from '../../services/cercania';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import useCarritoStore from '../../store/carritoStore';
import { absImg } from '../../constants/config';
import { colores, fuentes } from '../../constants/tema';
import DetalleProducto from '../../components/DetalleProducto';
import Anillo from '../../components/Anillo';
import { Icono, ControlCantidad, Buscador, TituloSeccion, PortadaTienda, useCantidades } from '../../components/ui';
import { useTasaReferencial, precioMonedas } from '../../services/moneda';
import { agregarConTienda } from '../../services/carrito';

function saludo() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}
const haceDias = (f) => {
  const d = Math.floor((Date.now() - new Date(f).getTime()) / 86400000);
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`;
};
// Icono para cada categoría según su nombre (las categorías las crea cada tienda)
const ICONOS_CAT = [
  [/agua|bebida|refresco|jugo/i, 'water'], [/harina|arroz|pasta|grano|v[ií]veres/i, 'basket'],
  [/limpie|hogar|deterg/i, 'sparkles'], [/l[aá]cte|leche|queso/i, 'cafe'], [/carne|pollo|charcut/i, 'restaurant'],
  [/fruta|verdura|vegetal/i, 'leaf'], [/snack|dulce|galleta|chuche/i, 'ice-cream'], [/higiene|personal|cuidado/i, 'happy'],
  [/pan|panader/i, 'pizza'], [/mascota/i, 'paw'],
];
const iconoCategoria = (n) => ICONOS_CAT.find(([re]) => re.test(n || ''))?.[1] || 'pricetag';

// Fila de producto (también la usa la tienda): texto a la izquierda, foto a
// la derecha con el control de cantidad encima
export function FilaProducto({ p, tasa, cantidad, onAbrir, onMas, onMenos, ultimo }) {
  const precio = parseFloat(p.PrecioPromo ?? p.PrecioUSD ?? 0);
  const { principal, secundario } = precioMonedas(precio, tasa);
  const antes = p.PrecioPromo != null && parseFloat(p.PrecioUSD) > precio ? precioMonedas(parseFloat(p.PrecioUSD), tasa).principal : null;
  const img = absImg(p.ImagenProducto);
  const stock = parseFloat(p.StockDisponible ?? 0);
  return (
    <TouchableOpacity style={[styles.fila, !ultimo && styles.filaBorde]} activeOpacity={0.7} onPress={onAbrir}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.filaNombre} numberOfLines={2}>{p.Nombre}</Text>
        <View style={styles.filaPrecios}>
          <Text style={styles.filaPrecio}>{principal}</Text>
          {antes ? <Text style={styles.filaAntes}>{antes}</Text> : null}
        </View>
        {secundario ? <Text style={styles.filaSec} numberOfLines={1}>{secundario}</Text> : null}
        {p.PromoBadge ? <View style={styles.filaPromo}><Text style={styles.filaPromoTexto}>{p.PromoBadge}</Text></View> : null}
      </View>
      <View>
        <View style={styles.filaFoto}>
          {img ? <Image source={{ uri: img }} style={styles.filaImg} /> : <Icono nombre="cube-outline" tam={30} color={colores.textoTenue} />}
        </View>
        <View style={styles.filaControl}>
          <ControlCantidad cantidad={cantidad} onMas={onMas} onMenos={onMenos} max={stock > 0 ? Math.floor(stock) : 99} flotante nombre={p.Nombre} />
        </View>
      </View>
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

  const idPVCarrito = useCarritoStore((s) => s.idPuntoVenta);
  const { cantidadDe, mas, menos } = useCantidades();

  const cargar = useCallback(async () => {
    try {
      setError('');
      const [prodRes, sucRes, pos] = await Promise.all([
        api.get('/delivery/productos', { params: { idBranch, idCuenta } }),
        api.get('/delivery/sucursales', { params: { idBranch, idCuenta } }),
        obtenerUbicacion({ pedirUnaVez: true }),
      ]);
      setProductos(prodRes.data?.productos ?? prodRes.data ?? []);
      // Con ubicación, la primera es la más cercana (tienda por defecto)
      setSucursales(ordenarPorCercania(sucRes.data?.sucursales ?? sucRes.data ?? [], pos));
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
    api.get('/delivery/cliente/hidratacion').then((r) => {
      setHidra(r.data);
      // Recordatorios de agua: si ya cumplió la meta hoy, no suenan más hoy
      reprogramarRecordatorios({ activa: !!r.data?.activa, metaCumplidaHoy: Number(r.data?.vasosHoy) >= Number(r.data?.meta || 8) });
    }).catch(() => setHidra(null));
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
      if (Number(r.data.vasosHoy) >= Number(hidra?.meta || 8)) reprogramarRecordatorios({ activa: true, metaCumplidaHoy: true });
      if (r.data.bonus > 0) Alert.alert('¡Racha completada!', `Llevas ${r.data.racha} días cumpliendo tu meta. Ganaste ${r.data.bonus} puntos VIDA.`);
    } catch {} finally { setVasoOcupado(false); }
  };

  // Tienda que se muestra: la del carrito, la del último pedido o la más cercana (o la primera)
  const idTienda = idPVCarrito || ultimo?.idPuntoVenta || sucursales[0]?.idPuntoVenta || null;
  const tienda = sucursales.find((s) => String(s.idPuntoVenta) === String(idTienda));
  const deTienda = useMemo(
    () => (idTienda ? productos.filter((p) => String(p.idPuntoVenta) === String(idTienda)) : productos),
    [productos, idTienda]);
  const categorias = useMemo(() => {
    const vistas = new Map();
    deTienda.forEach((p) => { if (p.idCategoria && !vistas.has(p.idCategoria)) vistas.set(p.idCategoria, p.NombreCategoria || 'General'); });
    return [...vistas.entries()].map(([id, nombre]) => ({ id, nombre }));
  }, [deTienda]);
  const lista = useMemo(() => (categoria ? deTienda.filter((p) => p.idCategoria === categoria) : deTienda), [deTienda, categoria]);
  const promos = useMemo(() => deTienda.filter((p) => p.PromoNombre || p.PromoBadge).slice(0, 10), [deTienda]);

  const repetir = () => {
    if (!ultimo) return;
    agregarConTienda(
      { ...ultimo.items[0], idPuntoVenta: ultimo.idPuntoVenta, NombreSucursal: ultimo.NombreSucursal },
      ultimo.items[0].Cantidad,
      () => {
        ultimo.items.slice(1).forEach((it) => useCarritoStore.getState().agregarItem(
          { idProducto: it.idProducto, Nombre: it.Nombre, PrecioUSD: it.PrecioUSD, ImagenProducto: it.ImagenProducto }, it.Cantidad));
        router.push('/(tabs)/carrito');
      });
  };

  const direccion = ultimo?.DireccionEntrega?.split('—')[0]?.trim() || tienda?.NomComercial || 'Elige tu tienda';
  const meta = Math.max(1, Number(hidra?.meta) || 8);
  const vasos = Number(hidra?.vasosHoy) || 0;
  const faltan = Math.max(0, meta - vasos);
  const abrirTienda = () => idTienda && router.push(`/sucursal/${idTienda}`);

  const Cabecera = (
    <View style={{ gap: 22, paddingBottom: 8 }}>
      {/* Categorías con icono */}
      {categorias.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
          {[{ id: null, nombre: 'Todo' }, ...categorias].map((c) => {
            const activa = categoria === c.id;
            return (
              <TouchableOpacity key={String(c.id)} style={styles.cat} onPress={() => setCategoria(c.id)} accessibilityState={{ selected: activa }}>
                <View style={[styles.catIcono, activa && styles.catIconoOn]}>
                  <Icono nombre={c.id == null ? 'grid' : iconoCategoria(c.nombre)} tam={26} color={activa ? colores.blanco : colores.marino} />
                </View>
                <Text style={[styles.catTexto, activa && styles.catTextoOn]} numberOfLines={1}>{c.nombre}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Hidratación del día (compacta) */}
      {token && hidra ? (
        <TouchableOpacity style={styles.hidra} activeOpacity={0.92} onPress={() => router.push('/mi-consumo')}>
          <View style={styles.hidraDeco} />
          <Anillo tam={64} grosor={8} avance={hidra.activa ? vasos / meta : 0} color={colores.celeste} pista={colores.marinoSuave}>
            <View style={styles.hidraCentro}><Text style={styles.hidraNum}>{hidra.activa ? vasos : 0}/{meta}</Text></View>
          </Anillo>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.hidraTitulo}>
              {!hidra.activa ? 'Mide tu agua del día' : faltan === 0 ? '¡Meta de agua cumplida!' : `Te faltan ${faltan} vaso${faltan === 1 ? '' : 's'}`}
            </Text>
            <Text style={styles.hidraSub}>{hidra.activa ? `Racha de ${Number(hidra.racha) || 0} día${Number(hidra.racha) === 1 ? '' : 's'}` : 'Gana puntos VIDA por racha'}</Text>
          </View>
          {hidra.activa ? (
            <TouchableOpacity style={styles.hidraBtn} onPress={tomarVaso} disabled={vasoOcupado} accessibilityLabel="Sumar un vaso de agua">
              <Icono nombre="add" tam={18} /><Text style={styles.hidraBtnTexto}>Vaso</Text>
            </TouchableOpacity>
          ) : <Icono nombre="chevron-forward" color={colores.blanco} />}
        </TouchableOpacity>
      ) : null}

      {/* Repetir el último pedido */}
      {ultimo ? (() => {
        const it = ultimo.items[0];
        const img = absImg(it.ImagenProducto);
        return (
          <View style={styles.repetir}>
            <View style={styles.repetirFoto}>{img ? <Image source={{ uri: img }} style={styles.repetirImg} /> : <Icono nombre="refresh" color={colores.textoTenue} />}</View>
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={styles.repetirEtiqueta}>Pídelo otra vez · {haceDias(ultimo.FechaCreacion)}</Text>
              <Text style={styles.repetirNombre} numberOfLines={1}>{it.Nombre}{ultimo.items.length > 1 ? ` y ${ultimo.items.length - 1} más` : ''}</Text>
              <Text style={styles.repetirSub} numberOfLines={1}>{ultimo.NombreSucursal}</Text>
            </View>
            <TouchableOpacity style={styles.repetirBtn} onPress={repetir} accessibilityLabel="Repetir el último pedido">
              <Icono nombre="refresh" tam={16} color={colores.blanco} />
              <Text style={styles.repetirBtnTexto}>Repetir</Text>
            </TouchableOpacity>
          </View>
        );
      })() : null}

      {/* Tiendas cercanas */}
      {sucursales.length > 1 && (
        <View style={{ gap: 12 }}>
          <TituloSeccion titulo="Tiendas cerca de ti" accion="Ver todas" onAccion={() => router.push('/(tabs)/tiendas')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiendas}>
            {sucursales.slice(0, 8).map((s) => {
              const actual = String(s.idPuntoVenta) === String(idTienda);
              return (
                <TouchableOpacity key={s.idPuntoVenta} style={styles.tiendaCard} activeOpacity={0.9} onPress={() => router.push(`/sucursal/${s.idPuntoVenta}`)}>
                  <PortadaTienda nombre={s.NomComercial} id={s.idPuntoVenta} alto={110} radio={16}>
                    {actual ? <View style={styles.tiendaSello}><Text style={styles.tiendaSelloTexto}>Tu tienda</Text></View> : null}
                  </PortadaTienda>
                  <Text style={styles.tiendaNombre} numberOfLines={1}>{s.NomComercial}</Text>
                  <Text style={styles.tiendaSub} numberOfLines={1}>
                    {[textoDistancia(s.DistanciaKm), 'Envío a domicilio'].filter(Boolean).join(' · ')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Ofertas */}
      {promos.length > 0 && !categoria && (
        <View style={{ gap: 12 }}>
          <TituloSeccion titulo="Ofertas de hoy" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiendas}>
            {promos.map((p) => {
              const img = absImg(p.ImagenProducto);
              const precio = precioMonedas(parseFloat(p.PrecioPromo ?? p.PrecioUSD ?? 0), tasa).principal;
              return (
                <TouchableOpacity key={p.idProducto} style={styles.oferta} activeOpacity={0.9} onPress={() => setProductoAbierto(p)}>
                  <View style={styles.ofertaFoto}>
                    {img ? <Image source={{ uri: img }} style={styles.filaImg} /> : <Icono nombre="pricetag-outline" tam={30} color={colores.textoTenue} />}
                    <View style={styles.ofertaBadge}><Text style={styles.ofertaBadgeTexto} numberOfLines={1}>{p.PromoBadge || 'Oferta'}</Text></View>
                    <View style={styles.ofertaControl}>
                      <ControlCantidad cantidad={cantidadDe(p)} onMas={() => mas(p)} onMenos={() => menos(p)} flotante nombre={p.Nombre} />
                    </View>
                  </View>
                  <Text style={styles.ofertaPrecio}>{precio}</Text>
                  <Text style={styles.ofertaNombre} numberOfLines={2}>{p.Nombre}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <TituloSeccion titulo={categoria ? categorias.find((c) => c.id === categoria)?.nombre : 'Todo en tu tienda'}
        sub={tienda?.NomComercial} accion={idTienda ? 'Ver tienda' : null} onAccion={abrirTienda} />
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.cabecera}>
        <TouchableOpacity style={styles.entregar} onPress={() => router.push('/(tabs)/tiendas')} accessibilityLabel="Cambiar de tienda">
          <Text style={styles.saludo} numberOfLines={1}>{saludo()}{cliente?.Nombre ? `, ${String(cliente.Nombre).split(' ')[0]}` : ''}</Text>
          <View style={styles.entregarFila}>
            <Text style={styles.entregarTexto} numberOfLines={1}>{direccion}</Text>
            <Icono nombre="chevron-down" tam={18} />
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.campana} onPress={() => router.push('/(tabs)/pedidos')} accessibilityLabel="Mis pedidos">
          <Icono nombre="receipt-outline" tam={22} />
        </TouchableOpacity>
      </View>
      <View style={styles.buscarCaja}>
        <Buscador placeholder={tienda ? `Buscar en ${tienda.NomComercial}` : 'Buscar productos'} onPress={abrirTienda} />
      </View>

      {loading ? (
        <View style={styles.centro}><ActivityIndicator size="large" color={colores.marino} /></View>
      ) : error ? (
        <View style={styles.centro}>
          <Icono nombre="cloud-offline-outline" tam={40} color={colores.textoTenue} />
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity style={styles.reintentar} onPress={cargar}><Text style={styles.reintentarTexto}>Reintentar</Text></TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={lista}
          keyExtractor={(p) => `${p.idProducto}-${p.idPuntoVenta}`}
          renderItem={({ item, index }) => (
            <FilaProducto p={item} tasa={tasa} cantidad={cantidadDe(item)} ultimo={index === lista.length - 1}
              onAbrir={() => setProductoAbierto(item)} onMas={() => mas(item)} onMenos={() => menos(item)} />
          )}
          ListHeaderComponent={Cabecera}
          contentContainerStyle={styles.lista}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colores.marino} />}
          ListEmptyComponent={<Text style={styles.vacio}>Esta tienda aún no tiene productos.</Text>}
        />
      )}

      {productoAbierto && <DetalleProducto producto={productoAbierto} onClose={() => setProductoAbierto(null)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  cabecera: { paddingTop: 10, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  entregar: { flex: 1, minHeight: 48, justifyContent: 'center' },
  saludo: { fontSize: 13, color: colores.textoSuave, fontWeight: '600' },
  entregarFila: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  entregarTexto: { fontFamily: fuentes.tituloFuerte, fontSize: 18, color: colores.marino, flexShrink: 1 },
  campana: { width: 44, height: 44, borderRadius: 22, backgroundColor: colores.superficie, alignItems: 'center', justifyContent: 'center' },
  buscarCaja: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 },

  lista: { paddingTop: 4, paddingBottom: 24 },

  cats: { paddingHorizontal: 16, gap: 4 },
  cat: { width: 76, alignItems: 'center', gap: 6 },
  catIcono: { width: 60, height: 60, borderRadius: 20, backgroundColor: colores.superficie, alignItems: 'center', justifyContent: 'center' },
  catIconoOn: { backgroundColor: colores.marino },
  catTexto: { fontSize: 12, fontWeight: '700', color: colores.textoSuave, maxWidth: 76 },
  catTextoOn: { color: colores.marino, fontWeight: '800' },

  hidra: { marginHorizontal: 20, backgroundColor: colores.marino, borderRadius: 20, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14, overflow: 'hidden' },
  hidraDeco: { position: 'absolute', right: -30, top: -50, width: 140, height: 140, borderRadius: 70, backgroundColor: colores.marinoClaro },
  hidraCentro: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  hidraNum: { fontFamily: fuentes.tituloFuerte, fontSize: 14, color: colores.blanco },
  hidraTitulo: { fontFamily: fuentes.titulo, fontSize: 15, color: colores.blanco },
  hidraSub: { fontSize: 12, color: colores.sobreMarino },
  hidraBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colores.celeste, height: 40, paddingHorizontal: 12, borderRadius: 99 },
  hidraBtnTexto: { color: colores.marino, fontWeight: '800', fontSize: 13 },

  repetir: { marginHorizontal: 20, backgroundColor: colores.superficie, borderRadius: 20, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  repetirFoto: { width: 54, height: 54, borderRadius: 14, backgroundColor: colores.blanco, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  repetirImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  repetirEtiqueta: { fontSize: 11, fontWeight: '800', color: colores.verdeTexto, textTransform: 'uppercase', letterSpacing: 0.4 },
  repetirNombre: { fontWeight: '800', fontSize: 15, color: colores.marino },
  repetirSub: { fontSize: 12, color: colores.textoSuave },
  repetirBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colores.marino, height: 40, paddingHorizontal: 14, borderRadius: 99 },
  repetirBtnTexto: { color: colores.blanco, fontWeight: '800', fontSize: 13 },

  tiendas: { paddingHorizontal: 20, gap: 12 },
  tiendaCard: { width: 210, gap: 4 },
  tiendaSello: { position: 'absolute', top: 10, left: 10, backgroundColor: colores.celeste, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  tiendaSelloTexto: { fontSize: 11, fontWeight: '800', color: colores.marino },
  tiendaNombre: { marginTop: 4, fontWeight: '800', fontSize: 15, color: colores.marino },
  tiendaSub: { fontSize: 12, color: colores.textoSuave },

  oferta: { width: 140, gap: 2 },
  ofertaFoto: { height: 140, borderRadius: 16, backgroundColor: colores.superficie, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  ofertaBadge: { position: 'absolute', top: 8, left: 8, maxWidth: 110, backgroundColor: colores.verde, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  ofertaBadgeTexto: { fontSize: 10, fontWeight: '800', color: colores.marino },
  ofertaControl: { position: 'absolute', right: 8, bottom: 8 },
  ofertaPrecio: { fontFamily: fuentes.titulo, fontSize: 15, color: colores.marino },
  ofertaNombre: { fontSize: 13, color: colores.textoSuave, lineHeight: 17 },

  fila: { marginHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 14 },
  filaBorde: { borderBottomWidth: 1, borderBottomColor: colores.separador },
  filaNombre: { fontWeight: '800', fontSize: 15, lineHeight: 19, color: colores.marino },
  filaPrecios: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  filaPrecio: { fontFamily: fuentes.tituloMedio, fontSize: 15, color: colores.marino },
  filaAntes: { fontSize: 13, color: colores.textoTenue, textDecorationLine: 'line-through' },
  filaSec: { fontSize: 12, color: colores.textoSuave },
  filaPromo: { alignSelf: 'flex-start', marginTop: 2, backgroundColor: colores.verdeClaro, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  filaPromoTexto: { fontSize: 11, fontWeight: '800', color: colores.verdeTexto },
  filaFoto: { width: 96, height: 96, borderRadius: 16, backgroundColor: colores.superficie, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  filaImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  // Dentro de la foto: en Android lo que sobresale del padre no recibe toques
  filaControl: { position: 'absolute', right: 5, bottom: 5 },

  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  error: { color: colores.error, textAlign: 'center', fontSize: 14 },
  reintentar: { backgroundColor: colores.marino, borderRadius: 99, paddingHorizontal: 22, minHeight: 44, justifyContent: 'center' },
  reintentarTexto: { color: colores.blanco, fontWeight: '800' },
  vacio: { textAlign: 'center', color: colores.textoSuave, padding: 24 },
});
