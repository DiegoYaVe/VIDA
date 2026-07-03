// Home calcado del layout de Uber Eats con colores VIDA:
// header blanco con selector de tienda + carrito, categorías con íconos
// grandes, búsqueda tipo píldora, "Destacados" y tarjetas planas con
// imagen protagonista. Navegable sin cuenta.
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Platform,
  Modal,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import useCarritoStore from '../../store/carritoStore';
import { absImg } from '../../constants/config';
import DetalleProducto from '../../components/DetalleProducto';

const PLACEHOLDER = 'https://via.placeholder.com/300/F1F5F9/94A3B8?text=VIDA';
const { width: SCREEN_W } = Dimensions.get('window');
// Ancho fijo por tarjeta: así el último producto impar NO se estira
const CARD_W = (SCREEN_W - 16 * 2 - 14) / 2;

// Emoji por nombre de categoría
function emojiCategoria(nombre = '') {
  const n = nombre.toLowerCase();
  if (n.includes('bebida') || n.includes('refresco') || n.includes('jugo')) return '🥤';
  if (n.includes('snack') || n.includes('botana') || n.includes('fritura')) return '🍟';
  if (n.includes('lácteo') || n.includes('lacteo') || n.includes('leche')) return '🥛';
  if (n.includes('limpieza') || n.includes('hogar')) return '🧼';
  if (n.includes('pan') || n.includes('bagel') || n.includes('reposter')) return '🥞';
  if (n.includes('dulce') || n.includes('chocolate') || n.includes('postre')) return '🍩';
  if (n.includes('carne') || n.includes('charcuter')) return '🥩';
  if (n.includes('fruta') || n.includes('verdura')) return '🍎';
  if (n.includes('comida') || n.includes('sandwich') || n.includes('sánd')) return '🌮';
  if (n.includes('licor') || n.includes('cerveza') || n.includes('vino')) return '🍺';
  if (n.includes('café') || n.includes('cafe')) return '☕';
  if (n.includes('pizza')) return '🍕';
  return '🛍️';
}

export default function HomeScreen() {
  const router = useRouter();
  const { idBranch, idCuenta, cliente } = useAuthStore();

  const [productos, setProductos] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [sucursalActiva, setSucursalActiva] = useState(null);
  const [selectorTienda, setSelectorTienda] = useState(false);
  const [categoriaActiva, setCategoriaActiva] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [productoAbierto, setProductoAbierto] = useState(null);

  const items = useCarritoStore((s) => s.items);
  const idPVCarrito = useCarritoStore((s) => s.idPuntoVenta);
  const nombreSucursalCarrito = useCarritoStore((s) => s.nombreSucursal);
  const agregarItem = useCarritoStore((s) => s.agregarItem);
  const quitarItem = useCarritoStore((s) => s.quitarItem);
  const limpiarCarrito = useCarritoStore((s) => s.limpiarCarrito);
  const setSucursal = useCarritoStore((s) => s.setSucursal);
  const totalCarrito = items.reduce((acc, i) => acc + i.PrecioUSD * i.Cantidad, 0);
  const totalItems = items.reduce((acc, i) => acc + i.Cantidad, 0);

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

  useEffect(() => { cargar(); }, [cargar]);

  const onRefresh = () => { setRefreshing(true); cargar(); };

  const categorias = useMemo(() => {
    const seen = new Map();
    productos.forEach((p) => {
      if (p.idCategoria && !seen.has(p.idCategoria)) {
        seen.set(p.idCategoria, p.NombreCategoria || 'General');
      }
    });
    return [...seen.entries()].map(([id, nombre]) => ({ id, nombre }));
  }, [productos]);

  const filtrados = useMemo(() => {
    let list = productos;
    if (sucursalActiva)  list = list.filter((p) => String(p.idPuntoVenta) === String(sucursalActiva));
    if (categoriaActiva) list = list.filter((p) => p.idCategoria === categoriaActiva);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        (p.Nombre || '').toLowerCase().includes(q) ||
        (p.NombreSucursal || '').toLowerCase().includes(q));
    }
    return list;
  }, [productos, sucursalActiva, categoriaActiva, search]);

  const nombreSucursalActiva = useMemo(() => {
    if (!sucursalActiva) return 'Todas las tiendas';
    const s = sucursales.find(x => String(x.idPuntoVenta ?? x.id) === String(sucursalActiva));
    return s?.NomComercial ?? s?.Nombre ?? 'Tienda';
  }, [sucursalActiva, sucursales]);

  const getCantidad = (p) => {
    if (idPVCarrito && String(idPVCarrito) !== String(p.idPuntoVenta)) return 0;
    return items.find((i) => i.idProducto === p.idProducto)?.Cantidad ?? 0;
  };

  const handleAgregar = (p, cantidad = 1) => {
    const doAgregar = () => {
      if (!useCarritoStore.getState().idPuntoVenta) {
        setSucursal(p.idPuntoVenta, p.NombreSucursal || '');
      }
      agregarItem({
        idProducto: p.idProducto,
        Nombre: p.Nombre,
        PrecioUSD: parseFloat(p.PrecioUSD || 0),
        ImagenProducto: p.ImagenProducto || '',
      }, cantidad);
    };

    if (idPVCarrito && String(idPVCarrito) !== String(p.idPuntoVenta) && items.length > 0) {
      Alert.alert(
        'Carrito de otra tienda',
        `Tienes productos de "${nombreSucursalCarrito}". ¿Vaciar el carrito y pedir de "${p.NombreSucursal}"?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Vaciar y agregar',
            style: 'destructive',
            onPress: () => {
              limpiarCarrito();
              setSucursal(p.idPuntoVenta, p.NombreSucursal || '');
              doAgregar();
            },
          },
        ]
      );
      return;
    }
    doAgregar();
  };

  const renderProducto = ({ item: p }) => {
    const cant = getCantidad(p);
    const precio = parseFloat(p.PrecioUSD || 0);

    return (
      <View style={styles.prodCard}>
        <TouchableOpacity activeOpacity={0.85} onPress={() => setProductoAbierto(p)}>
          <View>
            <Image
              source={{ uri: absImg(p.ImagenProducto) || PLACEHOLDER }}
              style={styles.prodImg}
              defaultSource={{ uri: PLACEHOLDER }}
            />
            {cant === 0 ? (
              <TouchableOpacity style={styles.addFab} onPress={() => handleAgregar(p)}>
                <Ionicons name="add" size={22} color="#1A202C" />
              </TouchableOpacity>
            ) : (
              <View style={styles.qtyFab}>
                <TouchableOpacity style={styles.qtyFabBtn} onPress={() => quitarItem(p.idProducto)}>
                  <Ionicons name="remove" size={16} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.qtyFabNum}>{cant}</Text>
                <TouchableOpacity style={styles.qtyFabBtn} onPress={() => handleAgregar(p)}>
                  <Ionicons name="add" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          <Text style={styles.prodNombre} numberOfLines={1}>{p.Nombre}</Text>
          <View style={styles.prodMetaRow}>
            <Text style={styles.prodPrecio}>${precio.toFixed(2)}</Text>
            <Text style={styles.prodMetaSep}> · </Text>
            <Ionicons name="storefront-outline" size={12} color="#6B7280" />
            <Text style={styles.prodMeta} numberOfLines={1}> {p.NombreSucursal}</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  // Header del feed (scrollea junto con los productos)
  const ListHeader = (
    <View>
      {/* Categorías con íconos grandes (fila estilo Uber Eats) */}
      {categorias.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
          <TouchableOpacity style={styles.catItem} onPress={() => setCategoriaActiva(null)}>
            <Text style={[styles.catEmoji, categoriaActiva && styles.catEmojiInactiva]}>🛍️</Text>
            <Text style={[styles.catLabel, !categoriaActiva && styles.catLabelActive]}>Todo</Text>
          </TouchableOpacity>
          {categorias.map((c) => {
            const activa = categoriaActiva === c.id;
            return (
              <TouchableOpacity
                key={c.id}
                style={styles.catItem}
                onPress={() => setCategoriaActiva(activa ? null : c.id)}
              >
                <Text style={[styles.catEmoji, categoriaActiva && !activa && styles.catEmojiInactiva]}>
                  {emojiCategoria(c.nombre)}
                </Text>
                <Text style={[styles.catLabel, activa && styles.catLabelActive]} numberOfLines={1}>
                  {c.nombre}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Búsqueda tipo píldora */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color="#6B7280" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar en VIDA..."
          placeholderTextColor="#6B7280"
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Título de sección con flecha */}
      <View style={styles.seccionRow}>
        <Text style={styles.seccionTitulo}>
          {sucursalActiva || categoriaActiva || search ? 'Resultados' : 'Destacados en VIDA'}
        </Text>
        <View style={styles.seccionArrow}>
          <Ionicons name="arrow-forward" size={18} color="#1A202C" />
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Header blanco: selector de tienda + carrito */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.tiendaSelector} onPress={() => setSelectorTienda(true)}>
          <Text style={styles.tiendaSelectorText} numberOfLines={1}>{nombreSucursalActiva}</Text>
          <Ionicons name="chevron-down" size={20} color="#1A202C" style={{ marginLeft: 4, marginTop: 2 }} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerCarrito} onPress={() => router.push('/(tabs)/carrito')}>
          <Ionicons name="cart-outline" size={24} color="#1A202C" />
          {totalItems > 0 && (
            <View style={styles.headerCarritoBadge}>
              <Text style={styles.headerCarritoBadgeText}>{totalItems}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#27AE60" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={cargar}>
            <Text style={styles.retryBtnText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtrados}
          keyExtractor={(p) => `${p.idProducto}-${p.idPuntoVenta}`}
          renderItem={renderProducto}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          ListHeaderComponent={ListHeader}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="basket-outline" size={54} color="#CBD5E0" />
              <Text style={styles.emptyText}>No encontramos productos</Text>
            </View>
          }
        />
      )}

      {/* Selector de tienda (dropdown como el "Casa ▼" de Uber Eats) */}
      <Modal visible={selectorTienda} transparent animationType="fade" onRequestClose={() => setSelectorTienda(false)}>
        <TouchableOpacity style={styles.modalFondo} activeOpacity={1} onPress={() => setSelectorTienda(false)}>
          <View style={styles.modalTiendas}>
            <Text style={styles.modalTiendasTitulo}>Elige una tienda</Text>
            <TouchableOpacity
              style={styles.tiendaOpcion}
              onPress={() => { setSucursalActiva(null); setSelectorTienda(false); }}
            >
              <View style={styles.tiendaOpcionIcon}><Text style={{ fontSize: 18 }}>🛍️</Text></View>
              <Text style={styles.tiendaOpcionText}>Todas las tiendas</Text>
              {!sucursalActiva && <Ionicons name="checkmark-circle" size={20} color="#27AE60" />}
            </TouchableOpacity>
            {sucursales.map((s) => {
              const id = s.idPuntoVenta ?? s.id;
              const activa = String(sucursalActiva) === String(id);
              return (
                <TouchableOpacity
                  key={id}
                  style={styles.tiendaOpcion}
                  onPress={() => { setSucursalActiva(id); setSelectorTienda(false); }}
                >
                  <View style={styles.tiendaOpcionIcon}>
                    <Ionicons name="storefront" size={16} color="#1A6A9A" />
                  </View>
                  <Text style={styles.tiendaOpcionText} numberOfLines={1}>
                    {s.NomComercial ?? s.Nombre ?? s.nombre}
                  </Text>
                  {activa && <Ionicons name="checkmark-circle" size={20} color="#27AE60" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Detalle de producto */}
      {productoAbierto && (
        <DetalleProducto
          producto={productoAbierto}
          onClose={() => setProductoAbierto(null)}
          onAgregar={handleAgregar}
        />
      )}

      {/* Botón flotante del carrito */}
      {totalItems > 0 && (
        <TouchableOpacity
          style={styles.floatingCart}
          onPress={() => router.push('/(tabs)/carrito')}
          activeOpacity={0.9}
        >
          <View style={styles.floatingCartBadge}>
            <Text style={styles.floatingCartBadgeText}>{totalItems}</Text>
          </View>
          <Text style={styles.floatingCartText}>Ver carrito</Text>
          <Text style={styles.floatingCartPrice}>${totalCarrito.toFixed(2)}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  // Header blanco estilo Uber Eats
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 58 : 46,
    paddingBottom: 10,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  tiendaSelector: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  tiendaSelectorText: { fontSize: 24, fontWeight: '900', color: '#1A202C' },
  headerCarrito: { padding: 4 },
  headerCarritoBadge: {
    position: 'absolute', top: -4, right: -6,
    backgroundColor: '#27AE60', borderRadius: 10, minWidth: 19, height: 19,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    borderWidth: 1.5, borderColor: '#fff',
  },
  headerCarritoBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  // Categorías con íconos grandes
  catRow: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4, flexDirection: 'row', gap: 22 },
  catItem: { alignItems: 'center', minWidth: 56 },
  catEmoji: { fontSize: 38 },
  catEmojiInactiva: { opacity: 0.45 },
  catLabel: { fontSize: 13.5, color: '#1A202C', fontWeight: '500', marginTop: 6, textAlign: 'center' },
  catLabelActive: { fontWeight: '800' },

  // Búsqueda píldora
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F3F4F6', borderRadius: 26,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 12 : 6,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#1A202C' },

  // Sección
  seccionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginTop: 16, marginBottom: 12,
  },
  seccionTitulo: { fontSize: 22, fontWeight: '900', color: '#1A202C' },
  seccionArrow: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },

  grid: { paddingBottom: 110 },
  row: { paddingHorizontal: 16, justifyContent: 'space-between' },

  // Tarjeta plana estilo Uber Eats (ancho FIJO: el último impar no se estira)
  prodCard: { width: CARD_W, marginBottom: 20 },
  prodImg: {
    width: '100%', height: CARD_W * 0.72, borderRadius: 14,
    resizeMode: 'cover', backgroundColor: '#F3F4F6',
  },
  addFab: {
    position: 'absolute', right: 8, bottom: 8,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 5, elevation: 4,
  },
  qtyFab: {
    position: 'absolute', right: 8, bottom: 8,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#27AE60', borderRadius: 19, height: 38,
    paddingHorizontal: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 5, elevation: 4,
  },
  qtyFabBtn: { width: 28, height: 38, alignItems: 'center', justifyContent: 'center' },
  qtyFabNum: { color: '#fff', fontSize: 14, fontWeight: '800', minWidth: 18, textAlign: 'center' },
  prodNombre: { fontSize: 15.5, fontWeight: '800', color: '#1A202C', marginTop: 9 },
  prodMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  prodPrecio: { fontSize: 14.5, fontWeight: '800', color: '#27AE60' },
  prodMetaSep: { color: '#9CA3AF', fontSize: 13 },
  prodMeta: { color: '#6B7280', fontSize: 12.5, flexShrink: 1 },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  errorText: { color: '#E53E3E', textAlign: 'center', fontSize: 14 },
  emptyText: { color: '#A0AEC0', fontSize: 15, marginTop: 10 },
  retryBtn: {
    marginTop: 12, backgroundColor: '#1A6A9A', borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 9,
  },
  retryBtnText: { color: '#fff', fontWeight: '700' },

  // Selector de tienda
  modalFondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-start' },
  modalTiendas: {
    marginTop: Platform.OS === 'ios' ? 105 : 92,
    marginHorizontal: 16,
    backgroundColor: '#fff', borderRadius: 20, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2, shadowRadius: 24, elevation: 12,
  },
  modalTiendasTitulo: { fontSize: 16, fontWeight: '900', color: '#1A202C', marginBottom: 10 },
  tiendaOpcion: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  tiendaOpcionIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  tiendaOpcionText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1A202C' },

  floatingCart: {
    position: 'absolute', bottom: 20, left: 20, right: 20,
    backgroundColor: '#27AE60', borderRadius: 16,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 15, gap: 8,
    shadowColor: '#27AE60', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  floatingCartBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 12,
    minWidth: 24, height: 24, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 5,
  },
  floatingCartBadgeText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  floatingCartText: { flex: 1, color: '#fff', fontWeight: '800', fontSize: 15, marginLeft: 4 },
  floatingCartPrice: { color: '#fff', fontWeight: '900', fontSize: 16 },
});
