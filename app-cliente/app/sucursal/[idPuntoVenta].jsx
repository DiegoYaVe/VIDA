import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, FlatList, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator, SafeAreaView, ScrollView } from 'react-native';
import { Text, TextInput } from '../../components/Texto';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import useCarritoStore from '../../store/carritoStore';
import { absImg } from '../../constants/config';
import Precio from '../../components/Precio';
import { colores, fuentes, radios } from '../../constants/tema';
import { useTasaReferencial, precioMonedas } from '../../services/moneda';

const PLACEHOLDER = 'https://via.placeholder.com/150/DDF2F8/001034?text=VIDA';

export default function CatalogoScreen() {
  const tasa = useTasaReferencial();
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
    const esPlus = !!(item.EsProductoPlus ?? item.esProductoPlus);

    return (
      <View style={styles.prodCard}>
        <Image
          source={{ uri: absImg(imagen) || PLACEHOLDER }}
          style={styles.prodImg}
          defaultSource={{ uri: PLACEHOLDER }}
        />
        {esPlus && (
          <View style={styles.plusBadge}>
            <Text style={styles.plusBadgeText}>PLUS</Text>
          </View>
        )}
        <Text style={styles.prodNombre} numberOfLines={2}>{nombre}</Text>
        <Precio usd={precio} tasa={tasa} style={styles.prodPrecio} />

        {cant === 0 ? (
          <TouchableOpacity style={styles.addBtn} onPress={() => handleAgregar(item)}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.qtyRow}>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => quitarItem(idProd)}>
              <Ionicons name="remove" size={16} color="#001034" />
            </TouchableOpacity>
            <Text style={styles.qtyText}>{cant}</Text>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => handleAgregar(item)}>
              <Ionicons name="add" size={16} color="#001034" />
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
          headerStyle: { backgroundColor: '#001034' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontFamily: fuentes.titulo },
        }}
      />

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color="#8C9BB0" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar productos..."
          placeholderTextColor="#8C9BB0"
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color="#8C9BB0" />
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
          <ActivityIndicator size="large" color="#001034" />
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
          <Text style={styles.floatingCartPrice}>{precioMonedas(totalCarrito, tasa).principal}</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colores.blanco, margin: 16, marginBottom: 10,
    borderRadius: radios.medio, borderWidth: 1, borderColor: colores.borde, paddingHorizontal: 14, minHeight: 50,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: colores.marino, paddingVertical: 10 },
  catList: { paddingHorizontal: 16, paddingBottom: 10, gap: 8, flexDirection: 'row' },
  catChip: { minHeight: 40, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center', backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde },
  catChipActive: { backgroundColor: colores.marino, borderColor: colores.marino },
  catChipText: { color: colores.marino, fontSize: 14, fontWeight: '700' },
  catChipTextActive: { color: colores.blanco },
  grid: { paddingHorizontal: 10, paddingBottom: 110 },
  row: { justifyContent: 'space-between', paddingHorizontal: 0 },
  prodCard: { backgroundColor: colores.blanco, borderRadius: radios.grande, margin: 6, flex: 1, padding: 10, borderWidth: 1, borderColor: colores.borde },
  prodImg: { width: '100%', height: 110, borderRadius: 14, resizeMode: 'cover', marginBottom: 8, backgroundColor: colores.celesteClaro },
  plusBadge: { position: 'absolute', top: 14, right: 14, backgroundColor: colores.marino, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  plusBadgeText: { color: colores.blanco, fontSize: 10, fontWeight: '800' },
  prodNombre: { fontSize: 14, fontWeight: '800', color: colores.marino, marginBottom: 4, minHeight: 36 },
  prodPrecio: { fontSize: 16, fontWeight: '700', color: colores.marino, fontFamily: fuentes.titulo },
  addBtn: { backgroundColor: colores.marino, borderRadius: 22, width: 44, height: 44, justifyContent: 'center', alignItems: 'center', alignSelf: 'flex-end', marginTop: 6 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 6, backgroundColor: colores.celesteClaro, borderRadius: 22, height: 44 },
  qtyBtn: { width: 34, height: 44, alignItems: 'center', justifyContent: 'center' },
  qtyText: { paddingHorizontal: 6, fontSize: 14, fontWeight: '800', color: colores.marino },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  errorText: { color: colores.error, textAlign: 'center', fontSize: 14 },
  emptyText: { color: colores.textoSuave, fontSize: 15 },
  retryBtn: { marginTop: 12, backgroundColor: colores.marino, borderRadius: 14, paddingHorizontal: 22, minHeight: 44, justifyContent: 'center' },
  retryBtnText: { color: colores.blanco, fontWeight: '800' },
  floatingCart: {
    position: 'absolute', bottom: 16, left: 16, right: 16, minHeight: 62, backgroundColor: colores.marino, borderRadius: 20,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10,
    shadowColor: colores.marino, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  floatingCartBadge: { backgroundColor: colores.celeste, borderRadius: 12, minWidth: 30, height: 30, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  floatingCartBadgeText: { color: colores.marino, fontSize: 13, fontWeight: '800' },
  floatingCartText: { flex: 1, color: colores.blanco, fontWeight: '800', fontSize: 16 },
  floatingCartPrice: { color: colores.blanco, fontSize: 17, fontFamily: fuentes.titulo },
});
