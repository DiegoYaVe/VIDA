// Home estilo Uber Eats: feed de productos de todas las sucursales, con
// búsqueda, filtro por sucursal y categorías. Navegable sin cuenta —
// el login se pide hasta el momento de confirmar el pedido.
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
  SafeAreaView,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import useCarritoStore from '../../store/carritoStore';
import { absImg } from '../../constants/config';
import DetalleProducto from '../../components/DetalleProducto';

const PLACEHOLDER = 'https://via.placeholder.com/150/EBF8FF/1A6A9A?text=VIDA';

// Emoji por nombre de categoría (estilo Uber Eats/DiDi)
function emojiCategoria(nombre = '') {
  const n = nombre.toLowerCase();
  if (n.includes('bebida') || n.includes('refresco') || n.includes('jugo')) return '🥤';
  if (n.includes('snack') || n.includes('botana')) return '🍿';
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

  // Categorías derivadas del feed (solo las que tienen productos)
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

  // Cantidad en carrito de este producto (solo cuenta si es de la misma sucursal)
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

    // Un carrito por sucursal (como Uber Eats: un restaurante a la vez)
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
        {/* Tap en la tarjeta → detalle estilo Uber Eats */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => setProductoAbierto(p)} style={{ width: '100%', alignItems: 'center' }}>
          <Image
            source={{ uri: absImg(p.ImagenProducto) || PLACEHOLDER }}
            style={styles.prodImg}
            defaultSource={{ uri: PLACEHOLDER }}
          />
          <View style={styles.sucChip}>
            <Ionicons name="storefront-outline" size={11} color="#1A6A9A" />
            <Text style={styles.sucChipText} numberOfLines={1}>{p.NombreSucursal}</Text>
          </View>
          <Text style={styles.prodNombre} numberOfLines={2}>{p.Nombre}</Text>
          <Text style={styles.prodPrecio}>${precio.toFixed(2)}</Text>
        </TouchableOpacity>

        {cant === 0 ? (
          <TouchableOpacity style={styles.addBtn} onPress={() => handleAgregar(p)}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.qtyRow}>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => quitarItem(p.idProducto)}>
              <Ionicons name="remove" size={16} color="#1A6A9A" />
            </TouchableOpacity>
            <Text style={styles.qtyText}>{cant}</Text>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => handleAgregar(p)}>
              <Ionicons name="add" size={16} color="#1A6A9A" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerHola}>
            {cliente ? `Hola, ${cliente.Nombre ?? ''} 👋` : '¡Hola! 👋'}
          </Text>
          <Text style={styles.headerTitle}>¿Qué se te antoja hoy?</Text>
        </View>
      </View>

      {/* Búsqueda */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color="#A0AEC0" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar productos o tiendas..."
          placeholderTextColor="#A0AEC0"
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color="#A0AEC0" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Chips de sucursal */}
      {sucursales.length > 1 && (
        <View>
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
        </View>
      )}

      {/* Categorías circulares estilo Uber Eats */}
      {categorias.length > 0 && (
        <View>
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
        </View>
      )}

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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="basket-outline" size={54} color="#CBD5E0" />
              <Text style={styles.emptyText}>No encontramos productos</Text>
            </View>
          }
        />
      )}

      {/* Detalle de producto (estilo Uber Eats) */}
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
          <Ionicons name="cart-outline" size={20} color="#fff" />
          <Text style={styles.floatingCartText}>Ver carrito</Text>
          <Text style={styles.floatingCartPrice}>${totalCarrito.toFixed(2)}</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  headerHola: { fontSize: 14, color: '#718096', fontWeight: '600' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#1A202C', marginTop: 2 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1A202C' },
  chipRow: { paddingHorizontal: 16, paddingVertical: 5, flexDirection: 'row' },
  sucFiltroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#BEE3F8',
    marginRight: 8,
    maxWidth: 200,
  },
  sucFiltroChipActive: { backgroundColor: '#1A6A9A', borderColor: '#1A6A9A' },
  sucFiltroText: { color: '#1A6A9A', fontSize: 13, fontWeight: '700' },
  sucFiltroTextActive: { color: '#fff' },
  catRow: { paddingHorizontal: 16, paddingVertical: 6, flexDirection: 'row', gap: 14 },
  catItem: { alignItems: 'center', width: 62 },
  catCircle: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  catCircleActive: { borderColor: '#27AE60', backgroundColor: '#F0FFF4' },
  catEmoji: { fontSize: 24 },
  catLabel: { fontSize: 11, color: '#718096', fontWeight: '600', marginTop: 5, textAlign: 'center' },
  catLabelActive: { color: '#27AE60', fontWeight: '800' },
  grid: { paddingHorizontal: 10, paddingTop: 6, paddingBottom: 100 },
  row: { justifyContent: 'space-between', paddingHorizontal: 2 },
  prodCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    margin: 6,
    flex: 1,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  prodImg: { width: '100%', height: 105, borderRadius: 10, resizeMode: 'cover', marginBottom: 8 },
  sucChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EBF8FF',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
    maxWidth: '100%',
  },
  sucChipText: { color: '#1A6A9A', fontSize: 10.5, fontWeight: '700' },
  prodNombre: { fontSize: 13, fontWeight: '600', color: '#1A202C', textAlign: 'center', marginBottom: 4 },
  prodPrecio: { fontSize: 15, fontWeight: '800', color: '#1A6A9A', marginBottom: 10 },
  addBtn: {
    backgroundColor: '#27AE60',
    borderRadius: 10,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#1A6A9A',
    borderRadius: 10,
    overflow: 'hidden',
  },
  qtyBtn: { padding: 7, backgroundColor: '#EBF8FF' },
  qtyText: { paddingHorizontal: 12, fontSize: 14, fontWeight: '700', color: '#1A202C' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  errorText: { color: '#E53E3E', textAlign: 'center', fontSize: 14 },
  emptyText: { color: '#A0AEC0', fontSize: 15, marginTop: 10 },
  retryBtn: {
    marginTop: 12,
    backgroundColor: '#1A6A9A',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  retryBtnText: { color: '#fff', fontWeight: '700' },
  floatingCart: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#1A6A9A',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowColor: '#1A6A9A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
    gap: 8,
  },
  floatingCartBadge: {
    backgroundColor: '#27AE60',
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  floatingCartBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  floatingCartText: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 15, marginLeft: 4 },
  floatingCartPrice: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
