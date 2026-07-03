// Home estilo Uber Eats/DiDi: header con gradiente de marca, banner promo,
// categorías circulares y tarjetas de producto con imagen protagonista.
// Navegable sin cuenta — el login se pide hasta confirmar el pedido.
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import useCarritoStore from '../../store/carritoStore';
import { absImg } from '../../constants/config';
import DetalleProducto from '../../components/DetalleProducto';

const PLACEHOLDER = 'https://via.placeholder.com/300/EBF8FF/1A6A9A?text=VIDA';

// Emoji por nombre de categoría (estilo Uber Eats/DiDi)
function emojiCategoria(nombre = '') {
  const n = nombre.toLowerCase();
  if (n.includes('bebida') || n.includes('refresco') || n.includes('jugo')) return '🥤';
  if (n.includes('snack') || n.includes('botana') || n.includes('fritura')) return '🍿';
  if (n.includes('lácteo') || n.includes('lacteo') || n.includes('leche')) return '🥛';
  if (n.includes('limpieza') || n.includes('hogar')) return '🧼';
  if (n.includes('pan') || n.includes('bagel') || n.includes('reposter')) return '🥐';
  if (n.includes('dulce') || n.includes('chocolate') || n.includes('postre')) return '🍬';
  if (n.includes('carne') || n.includes('charcuter')) return '🥩';
  if (n.includes('fruta') || n.includes('verdura')) return '🍎';
  if (n.includes('comida') || n.includes('sandwich') || n.includes('sánd')) return '🥪';
  if (n.includes('licor') || n.includes('cerveza') || n.includes('vino')) return '🍺';
  return '🛒';
}

export default function HomeScreen() {
  const router = useRouter();
  const { idBranch, idCuenta, cliente } = useAuthStore();

  const [productos, setProductos] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [sucursalActiva, setSucursalActiva] = useState(null);
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
        <TouchableOpacity activeOpacity={0.9} onPress={() => setProductoAbierto(p)}>
          {/* Imagen protagonista con botón + flotante */}
          <View>
            <Image
              source={{ uri: absImg(p.ImagenProducto) || PLACEHOLDER }}
              style={styles.prodImg}
              defaultSource={{ uri: PLACEHOLDER }}
            />
            {cant === 0 ? (
              <TouchableOpacity style={styles.addFab} onPress={() => handleAgregar(p)}>
                <Ionicons name="add" size={22} color="#fff" />
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

          <View style={styles.prodInfo}>
            <Text style={styles.prodNombre} numberOfLines={1}>{p.Nombre}</Text>
            <Text style={styles.prodPrecio}>${precio.toFixed(2)}</Text>
            <View style={styles.sucChip}>
              <Ionicons name="storefront" size={10} color="#1A6A9A" />
              <Text style={styles.sucChipText} numberOfLines={1}>{p.NombreSucursal}</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  // Header completo del feed (va dentro del FlatList para scroll natural)
  const ListHeader = (
    <View>
      {/* Banner promo */}
      <LinearGradient
        colors={['#1A6A9A', '#27AE60']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.8 }}
        style={styles.banner}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitulo}>Entrega a domicilio 🛵</Text>
          <Text style={styles.bannerSub}>Pide de tu tienda favorita{'\n'}y recíbelo en minutos</Text>
        </View>
        <Text style={styles.bannerEmoji}>🛍️</Text>
      </LinearGradient>

      {/* Chips de sucursal */}
      {sucursales.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <TouchableOpacity
            style={[styles.sucFiltroChip, !sucursalActiva && styles.sucFiltroChipActive]}
            onPress={() => setSucursalActiva(null)}
          >
            <Text style={[styles.sucFiltroText, !sucursalActiva && styles.sucFiltroTextActive]}>
              Todas las tiendas
            </Text>
          </TouchableOpacity>
          {sucursales.map((s) => {
            const id = s.idPuntoVenta ?? s.id;
            const activa = String(sucursalActiva) === String(id);
            return (
              <TouchableOpacity
                key={id}
                style={[styles.sucFiltroChip, activa && styles.sucFiltroChipActive]}
                onPress={() => setSucursalActiva(activa ? null : id)}
              >
                <Ionicons name="storefront-outline" size={13}
                  color={activa ? '#fff' : '#1A6A9A'} style={{ marginRight: 4 }} />
                <Text style={[styles.sucFiltroText, activa && styles.sucFiltroTextActive]} numberOfLines={1}>
                  {s.NomComercial ?? s.Nombre ?? s.nombre}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Categorías circulares */}
      {categorias.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
          <TouchableOpacity style={styles.catItem} onPress={() => setCategoriaActiva(null)}>
            <View style={[styles.catCircle, !categoriaActiva && styles.catCircleActive]}>
              <Text style={styles.catEmoji}>✨</Text>
            </View>
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
                <View style={[styles.catCircle, activa && styles.catCircleActive]}>
                  <Text style={styles.catEmoji}>{emojiCategoria(c.nombre)}</Text>
                </View>
                <Text style={[styles.catLabel, activa && styles.catLabelActive]} numberOfLines={1}>
                  {c.nombre}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <Text style={styles.seccionTitulo}>
        {sucursalActiva || categoriaActiva || search ? 'Resultados' : 'Para ti'}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header con gradiente de marca */}
      <LinearGradient
        colors={['#0D1B2A', '#1A6A9A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1.4 }}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerHola}>
              {cliente ? `¡Hola, ${cliente.Nombre ?? ''}! 👋` : '¡Hola! 👋'}
            </Text>
            <Text style={styles.headerTitle}>¿Qué se te antoja hoy?</Text>
          </View>
          <TouchableOpacity style={styles.headerCarrito} onPress={() => router.push('/(tabs)/carrito')}>
            <Ionicons name="cart-outline" size={23} color="#fff" />
            {totalItems > 0 && (
              <View style={styles.headerCarritoBadge}>
                <Text style={styles.headerCarritoBadgeText}>{totalItems}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Búsqueda dentro del header */}
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar productos o tiendas..."
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A6A9A" />
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
          style={styles.floatingCartWrap}
          onPress={() => router.push('/(tabs)/carrito')}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={['#27AE60', '#1F9E56']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.floatingCart}
          >
            <View style={styles.floatingCartBadge}>
              <Text style={styles.floatingCartBadgeText}>{totalItems}</Text>
            </View>
            <Text style={styles.floatingCartText}>Ver carrito</Text>
            <Text style={styles.floatingCartPrice}>${totalCarrito.toFixed(2)}</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },

  // Header con gradiente
  header: {
    paddingTop: Platform.OS === 'ios' ? 58 : 46,
    paddingBottom: 18,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  headerHola: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '600' },
  headerTitle: { fontSize: 21, fontWeight: '900', color: '#fff', marginTop: 2 },
  headerCarrito: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerCarritoBadge: {
    position: 'absolute', top: -3, right: -3,
    backgroundColor: '#27AE60', borderRadius: 10, minWidth: 19, height: 19,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    borderWidth: 1.5, borderColor: '#fff',
  },
  headerCarritoBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 12 : 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 10, elevation: 5,
  },
  searchInput: { flex: 1, fontSize: 14.5, color: '#1A202C' },

  // Banner promo
  banner: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginTop: 14, marginBottom: 4,
    borderRadius: 18, paddingHorizontal: 18, paddingVertical: 16,
    shadowColor: '#1A6A9A', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 5,
  },
  bannerTitulo: { color: '#fff', fontSize: 16, fontWeight: '900' },
  bannerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, marginTop: 4, lineHeight: 17 },
  bannerEmoji: { fontSize: 44 },

  chipRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2, flexDirection: 'row' },
  sucFiltroChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#DBEAFE',
    marginRight: 8, maxWidth: 200,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  sucFiltroChipActive: { backgroundColor: '#1A6A9A', borderColor: '#1A6A9A' },
  sucFiltroText: { color: '#1A6A9A', fontSize: 13, fontWeight: '700' },
  sucFiltroTextActive: { color: '#fff' },

  catRow: { paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', gap: 14 },
  catItem: { alignItems: 'center', width: 62 },
  catCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  catCircleActive: { borderColor: '#27AE60', backgroundColor: '#F0FFF4' },
  catEmoji: { fontSize: 26 },
  catLabel: { fontSize: 11, color: '#718096', fontWeight: '600', marginTop: 5, textAlign: 'center' },
  catLabelActive: { color: '#27AE60', fontWeight: '800' },

  seccionTitulo: {
    fontSize: 18, fontWeight: '900', color: '#1A202C',
    paddingHorizontal: 16, marginTop: 8, marginBottom: 4,
  },

  grid: { paddingBottom: 110 },
  row: { paddingHorizontal: 10 },

  // Tarjeta de producto estilo DiDi
  prodCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    margin: 6,
    flex: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  prodImg: { width: '100%', height: 132, resizeMode: 'cover', backgroundColor: '#EDF2F7' },
  addFab: {
    position: 'absolute', right: 8, bottom: 8,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#27AE60',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 5, elevation: 5,
  },
  qtyFab: {
    position: 'absolute', right: 8, bottom: 8,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#27AE60', borderRadius: 18, height: 36,
    paddingHorizontal: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 5, elevation: 5,
  },
  qtyFabBtn: { width: 28, height: 36, alignItems: 'center', justifyContent: 'center' },
  qtyFabNum: { color: '#fff', fontSize: 14, fontWeight: '800', minWidth: 18, textAlign: 'center' },
  prodInfo: { padding: 11 },
  prodNombre: { fontSize: 14, fontWeight: '700', color: '#1A202C' },
  prodPrecio: { fontSize: 16.5, fontWeight: '900', color: '#1A6A9A', marginTop: 3 },
  sucChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#EBF8FF', borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 3, marginTop: 7,
  },
  sucChipText: { color: '#1A6A9A', fontSize: 10, fontWeight: '700' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  errorText: { color: '#E53E3E', textAlign: 'center', fontSize: 14 },
  emptyText: { color: '#A0AEC0', fontSize: 15, marginTop: 10 },
  retryBtn: {
    marginTop: 12, backgroundColor: '#1A6A9A', borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 9,
  },
  retryBtnText: { color: '#fff', fontWeight: '700' },

  floatingCartWrap: {
    position: 'absolute', bottom: 20, left: 20, right: 20,
    shadowColor: '#27AE60', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  floatingCart: {
    borderRadius: 16, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 15, gap: 8,
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
