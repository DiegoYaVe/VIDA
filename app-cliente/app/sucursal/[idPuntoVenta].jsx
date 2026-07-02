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
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import useCarritoStore from '../../store/carritoStore';

const PLACEHOLDER = 'https://via.placeholder.com/150/EBF8FF/1A6A9A?text=VIDA';

export default function CatalogoScreen() {
  const { idPuntoVenta } = useLocalSearchParams();
  const router = useRouter();
  const { idBranch, idCuenta } = useAuthStore();

  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [categoriaActiva, setCategoriaActiva] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const items = useCarritoStore((s) => s.items);
  const idPVCarrito = useCarritoStore((s) => s.idPuntoVenta);
  const nombreSucursal = useCarritoStore((s) => s.nombreSucursal);
  const agregarItem = useCarritoStore((s) => s.agregarItem);
  const quitarItem = useCarritoStore((s) => s.quitarItem);
  const limpiarCarrito = useCarritoStore((s) => s.limpiarCarrito);
  const setSucursal = useCarritoStore((s) => s.setSucursal);
  const totalCarrito = useCarritoStore((s) =>
    s.items.reduce((acc, item) => acc + item.PrecioUSD * item.Cantidad, 0)
  );
  const totalItems = items.reduce((acc, i) => acc + i.Cantidad, 0);

  const fetchProductos = useCallback(async () => {
    try {
      setError('');
      const res = await api.get('/delivery/productos', {
        params: {
          idBranch,
          idCuenta,
          idPuntoVenta,
          search: '',
          idCategoria: '',
        },
      });
      const data = res.data?.productos ?? res.data ?? [];
      setProductos(data);

      // Build category list
      const cats = [];
      const seen = new Set();
      data.forEach((p) => {
        const id = p.idCategoria ?? p.categoria?.id;
        const name = p.NombreCategoria ?? p.categoria?.Nombre ?? p.categoria?.nombre;
        if (id && !seen.has(id)) {
          seen.add(id);
          cats.push({ id, nombre: name ?? 'General' });
        }
      });
      setCategorias(cats);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [idBranch, idCuenta, idPuntoVenta]);

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  const filtrados = useMemo(() => {
    let list = productos;
    if (categoriaActiva) list = list.filter((p) => (p.idCategoria ?? p.categoria?.id) === categoriaActiva);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => (p.Nombre ?? p.nombre ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [productos, categoriaActiva, search]);

  const getCantidad = (idProducto) => {
    const found = items.find((i) => i.idProducto === idProducto);
    return found?.Cantidad ?? 0;
  };

  const handleAgregar = (producto) => {
    const idProd = producto.idProducto ?? producto.id;

    if (idPVCarrito && String(idPVCarrito) !== String(idPuntoVenta) && items.length > 0) {
      Alert.alert(
        'Carrito de otra tienda',
        `Tienes productos de "${nombreSucursal}" en tu carrito. ¿Deseas vaciarlo y empezar uno nuevo?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Vaciar y agregar',
            style: 'destructive',
            onPress: () => {
              limpiarCarrito();
              setSucursal(idPuntoVenta, nombreSucursal);
              agregarItem({
                idProducto: idProd,
                Nombre: producto.Nombre ?? producto.nombre,
                PrecioUSD: parseFloat(producto.PrecioUSD ?? producto.precio ?? 0),
                Cantidad: 1,
                ImagenProducto: producto.ImagenProducto ?? producto.imagen ?? '',
              });
            },
          },
        ]
      );
      return;
    }

    if (!idPVCarrito) setSucursal(idPuntoVenta, nombreSucursal);
    agregarItem({
      idProducto: idProd,
      Nombre: producto.Nombre ?? producto.nombre,
      PrecioUSD: parseFloat(producto.PrecioUSD ?? producto.precio ?? 0),
      Cantidad: 1,
      ImagenProducto: producto.ImagenProducto ?? producto.imagen ?? '',
    });
  };

  const renderProducto = ({ item }) => {
    const idProd = item.idProducto ?? item.id;
    const cant = getCantidad(idProd);
    const precio = parseFloat(item.PrecioUSD ?? item.precio ?? 0);
    const nombre = item.Nombre ?? item.nombre ?? '';
    const imagen = item.ImagenProducto ?? item.imagen ?? '';

    return (
      <View style={styles.prodCard}>
        <Image
          source={{ uri: imagen || PLACEHOLDER }}
          style={styles.prodImg}
          defaultSource={{ uri: PLACEHOLDER }}
        />
        <Text style={styles.prodNombre} numberOfLines={2}>{nombre}</Text>
        <Text style={styles.prodPrecio}>${precio.toFixed(2)}</Text>

        {cant === 0 ? (
          <TouchableOpacity style={styles.addBtn} onPress={() => handleAgregar(item)}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.qtyRow}>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => quitarItem(idProd)}>
              <Ionicons name="remove" size={16} color="#1A6A9A" />
            </TouchableOpacity>
            <Text style={styles.qtyText}>{cant}</Text>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => handleAgregar(item)}>
              <Ionicons name="add" size={16} color="#1A6A9A" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: nombreSucursal || 'Productos',
          headerStyle: { backgroundColor: '#1A6A9A' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
        }}
      />

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color="#A0AEC0" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar productos..."
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

      {/* Categories */}
      {categorias.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catList}
        >
          <TouchableOpacity
            style={[styles.catChip, !categoriaActiva && styles.catChipActive]}
            onPress={() => setCategoriaActiva(null)}
          >
            <Text style={[styles.catChipText, !categoriaActiva && styles.catChipTextActive]}>
              Todos
            </Text>
          </TouchableOpacity>
          {categorias.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.catChip, categoriaActiva === c.id && styles.catChipActive]}
              onPress={() => setCategoriaActiva(categoriaActiva === c.id ? null : c.id)}
            >
              <Text style={[styles.catChipText, categoriaActiva === c.id && styles.catChipTextActive]}>
                {c.nombre}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A6A9A" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchProductos}>
            <Text style={styles.retryBtnText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtrados}
          keyExtractor={(item) => String(item.idProducto ?? item.id)}
          renderItem={renderProducto}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No se encontraron productos</Text>
            </View>
          }
        />
      )}

      {/* Floating cart button */}
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#1A202C' },
  catList: { paddingHorizontal: 12, paddingBottom: 10, gap: 8, flexDirection: 'row' },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#EDF2F7',
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginRight: 8,
  },
  catChipActive: { backgroundColor: '#EBF8FF', borderColor: '#1A6A9A' },
  catChipText: { color: '#718096', fontSize: 13, fontWeight: '600' },
  catChipTextActive: { color: '#1A6A9A' },
  grid: { paddingHorizontal: 8, paddingBottom: 100 },
  row: { justifyContent: 'space-between', paddingHorizontal: 4 },
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
  prodImg: { width: '100%', height: 110, borderRadius: 10, resizeMode: 'cover', marginBottom: 8 },
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
  emptyText: { color: '#A0AEC0', fontSize: 15 },
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
