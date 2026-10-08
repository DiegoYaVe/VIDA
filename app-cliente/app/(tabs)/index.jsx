// Inicio de la app cliente (diseño "Agua VIDA"): saludo con el símbolo VIDA,
// selector de tienda, tarjeta de hidratación, acceso rápido al agua VIDA,
// categorías en píldoras y productos con precio en USD y bolívares.
// Navegable sin cuenta: la hidratación solo aparece con sesión.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, FlatList, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator, ScrollView, RefreshControl, Platform, Modal, Dimensions } from 'react-native';
import { Text, TextInput } from '../../components/Texto';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import useCarritoStore from '../../store/carritoStore';
import { absImg } from '../../constants/config';
import { colores, logos, radios } from '../../constants/tema';
import DetalleProducto from '../../components/DetalleProducto';
import Precio from '../../components/Precio';
import { useTasaReferencial, precioMonedas } from '../../services/moneda';

const PLACEHOLDER = 'https://via.placeholder.com/300/EEF6F8/8C9BB0?text=VIDA';
const { width: SCREEN_W } = Dimensions.get('window');
// Ancho fijo por tarjeta: así el último producto impar NO se estira
const CARD_W = (SCREEN_W - 16 * 2 - 12) / 2;

function saludo() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export default function HomeScreen() {
  const tasa = useTasaReferencial();
  const router = useRouter();
  const { idBranch, idCuenta, cliente, token } = useAuthStore();

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
  const [hidra, setHidra] = useState(null);
  const [vasoOcupado, setVasoOcupado] = useState(false);

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

  // Hidratación: solo con sesión; si falla, la tarjeta simplemente no aparece
  const cargarHidratacion = useCallback(async () => {
    if (!token) { setHidra(null); return; }
    try { setHidra((await api.get('/delivery/cliente/hidratacion')).data); }
    catch { setHidra(null); }
  }, [token]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { cargarHidratacion(); }, [cargarHidratacion]);

  const onRefresh = () => { setRefreshing(true); cargar(); cargarHidratacion(); };

  const tomarVaso = async () => {
    if (vasoOcupado) return;
    setVasoOcupado(true);
    try {
      const r = await api.post('/delivery/cliente/hidratacion/vaso');
      setHidra((d) => ({ ...d, vasosHoy: r.data.vasosHoy, mlHoy: r.data.mlHoy, racha: r.data.racha }));
      if (r.data.bonus > 0) {
        Alert.alert('¡Racha completada!', `Llevas ${r.data.racha} días cumpliendo tu meta. Ganaste ${r.data.bonus} puntos VIDA.`);
      }
    } catch {} finally { setVasoOcupado(false); }
  };

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

  // Acceso rápido al agua VIDA (el producto estrella de la marca)
  const agua = useMemo(() => {
    const lista = sucursalActiva ? productos.filter((p) => String(p.idPuntoVenta) === String(sucursalActiva)) : productos;
    return lista.find((p) => /agua/i.test(p.Nombre || '')) || null;
  }, [productos, sucursalActiva]);

  // Búsqueda por tienda: agrupa productos coincidentes por sucursal (3+ chars)
  const tiendaBusqueda = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 3) return null;
    const mapa = new Map();
    productos.forEach(p => {
      if (!(p.Nombre || '').toLowerCase().includes(q) &&
          !(p.NombreSucursal || '').toLowerCase().includes(q)) return;
      const id = p.idPuntoVenta;
      if (!mapa.has(id)) {
        mapa.set(id, {
          idPuntoVenta: id,
          NombreSucursal: p.NombreSucursal || 'Tienda',
          productos: [],
        });
      }
      mapa.get(id).productos.push(p);
    });
    return [...mapa.values()];
  }, [search, productos]);

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
    const { principal, secundario } = precioMonedas(precio, tasa);

    return (
      <TouchableOpacity style={styles.prodCard} activeOpacity={0.88} onPress={() => setProductoAbierto(p)}>
        <Image
          source={{ uri: absImg(p.ImagenProducto) || PLACEHOLDER }}
          style={styles.prodImg}
          defaultSource={{ uri: PLACEHOLDER }}
        />
        <Text style={styles.prodNombre} numberOfLines={2}>{p.Nombre}</Text>
        <Text style={styles.prodTienda} numberOfLines={1}>{p.NombreSucursal}</Text>
        <View style={styles.prodPie}>
          <View style={{ flex: 1 }}>
            <Text style={styles.prodPrecio}>{principal}</Text>
            {secundario ? <Text style={styles.prodPrecioSec} numberOfLines={1}>{secundario}</Text> : null}
          </View>
          {cant === 0 ? (
            <TouchableOpacity style={styles.addBtn} onPress={() => handleAgregar(p)} accessibilityLabel={`Agregar ${p.Nombre}`}>
              <Ionicons name="add" size={22} color={colores.blanco} />
            </TouchableOpacity>
          ) : (
            <View style={styles.qty}>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => quitarItem(p.idProducto)} accessibilityLabel="Quitar uno">
                <Ionicons name="remove" size={16} color={colores.marino} />
              </TouchableOpacity>
              <Text style={styles.qtyNum}>{cant}</Text>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => handleAgregar(p)} accessibilityLabel="Agregar uno">
                <Ionicons name="add" size={16} color={colores.marino} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const meta = Math.max(1, Number(hidra?.meta) || 8);
  const vasos = Number(hidra?.vasosHoy) || 0;
  const pctAgua = Math.min(1, vasos / meta);

  // Header del feed (scrollea junto con los productos)
  const ListHeader = (
    <View>
      {/* Hidratación (programa activo) */}
      {hidra?.activa ? (
        <TouchableOpacity style={styles.hidraCard} activeOpacity={0.9} onPress={() => router.push('/mi-consumo')}>
          <View style={styles.hidraDeco} />
          <View style={styles.hidraAnillo}>
            <Text style={styles.hidraNum}>{vasos}/{meta}</Text>
            <Text style={styles.hidraUnidad}>vasos</Text>
          </View>
          <View style={{ flex: 1, gap: 10 }}>
            <Text style={styles.hidraTitulo}>
              {vasos >= meta ? '¡Meta de hoy cumplida!' : `Te faltan ${meta - vasos} vaso${meta - vasos === 1 ? '' : 's'} hoy.`}
            </Text>
            <View style={styles.hidraBarra}><View style={[styles.hidraBarraLlena, { width: `${pctAgua * 100}%` }]} /></View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.hidraBtn} onPress={tomarVaso} disabled={vasoOcupado}>
                <Text style={styles.hidraBtnText}>+ 1 vaso</Text>
              </TouchableOpacity>
              {Number(hidra?.racha) > 0 ? (
                <View style={styles.hidraRacha}><Text style={styles.hidraRachaText}>Racha {hidra.racha} días</Text></View>
              ) : null}
            </View>
          </View>
        </TouchableOpacity>
      ) : null}

      {/* Acceso rápido al agua VIDA */}
      {agua && !search ? (
        <View style={styles.aguaCard}>
          <Image source={{ uri: absImg(agua.ImagenProducto) || PLACEHOLDER }} style={styles.aguaImg} />
          <View style={{ flex: 1 }}>
            <Text style={styles.aguaNombre} numberOfLines={1}>{agua.Nombre}</Text>
            <Text style={styles.aguaSub} numberOfLines={1}>Pídela en {agua.NombreSucursal}</Text>
            <Precio usd={parseFloat(agua.PrecioUSD || 0)} tasa={tasa} style={styles.aguaPrecio} />
          </View>
          <TouchableOpacity style={styles.aguaBtn} onPress={() => handleAgregar(agua)}>
            <Text style={styles.aguaBtnText}>Agregar</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Búsqueda */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={19} color={colores.textoSuave} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Harina PAN, café, agua…"
          placeholderTextColor={colores.textoTenue}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="Borrar búsqueda">
            <Ionicons name="close-circle" size={19} color={colores.textoTenue} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Categorías en píldoras */}
      {categorias.length > 0 && !tiendaBusqueda && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
          <TouchableOpacity style={[styles.chip, !categoriaActiva && styles.chipActivo]} onPress={() => setCategoriaActiva(null)}>
            <Text style={[styles.chipText, !categoriaActiva && styles.chipTextActivo]}>Todo</Text>
          </TouchableOpacity>
          {categorias.map((c) => {
            const activa = categoriaActiva === c.id;
            return (
              <TouchableOpacity key={c.id} style={[styles.chip, activa && styles.chipActivo]} onPress={() => setCategoriaActiva(activa ? null : c.id)}>
                <Text style={[styles.chipText, activa && styles.chipTextActivo]} numberOfLines={1}>{c.nombre}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Búsqueda de 3+ letras: tiendas con productos */}
      {tiendaBusqueda !== null ? (
        <View style={styles.searchResultsWrap}>
          <Text style={styles.searchResultsTitle}>
            {tiendaBusqueda.length === 0
              ? 'Sin resultados para "' + search.trim() + '"'
              : `${tiendaBusqueda.length} tienda${tiendaBusqueda.length !== 1 ? 's' : ''} con "${search.trim()}"`}
          </Text>
          {tiendaBusqueda.map(tienda => (
            <TouchableOpacity
              key={tienda.idPuntoVenta}
              style={styles.tiendaResultCard}
              onPress={() => { setSucursalActiva(tienda.idPuntoVenta); setSearch(''); }}
              activeOpacity={0.8}
            >
              <View style={styles.tiendaResultHeader}>
                <View style={styles.tiendaResultIconWrap}>
                  <Ionicons name="storefront" size={18} color={colores.marino} />
                </View>
                <Text style={styles.tiendaResultNombre} numberOfLines={1}>{tienda.NombreSucursal}</Text>
                <View style={styles.tiendaResultBadge}>
                  <Text style={styles.tiendaResultBadgeText}>{tienda.productos.length} producto{tienda.productos.length !== 1 ? 's' : ''}</Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiendaResultProds}>
                {tienda.productos.slice(0, 6).map(p => (
                  <TouchableOpacity
                    key={p.idProducto}
                    style={styles.miniProdCard}
                    onPress={() => { setProductoAbierto(p); setSearch(''); }}
                    activeOpacity={0.85}
                  >
                    <Image source={{ uri: absImg(p.ImagenProducto) || PLACEHOLDER }} style={styles.miniProdImg} />
                    <Text style={styles.miniProdNombre} numberOfLines={2}>{p.Nombre}</Text>
                    <Precio usd={parseFloat(p.PrecioUSD || 0)} tasa={tasa} style={styles.miniProdPrecio} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <Text style={styles.seccionTitulo}>
          {sucursalActiva || categoriaActiva ? 'Resultados' : 'Lo más pedido'}
        </Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Encabezado: símbolo VIDA, saludo, tienda y carrito */}
      <View style={styles.header}>
        <View style={styles.simbolo}>
          <Image source={logos.simboloClaro} style={styles.simboloImg} resizeMode="contain" accessibilityLabel="VIDA" />
        </View>
        <TouchableOpacity style={styles.headerTexto} onPress={() => setSelectorTienda(true)} accessibilityLabel="Cambiar de tienda">
          <Text style={styles.saludo} numberOfLines={1}>
            {saludo()}{cliente?.Nombre ? `, ${String(cliente.Nombre).split(' ')[0]}` : ''}
          </Text>
          <View style={styles.tiendaRow}>
            <Ionicons name="storefront-outline" size={16} color={colores.marino} />
            <Text style={styles.tiendaSelectorText} numberOfLines={1}>{nombreSucursalActiva}</Text>
            <Ionicons name="chevron-down" size={16} color={colores.marino} />
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerCarrito} onPress={() => router.push('/(tabs)/carrito')} accessibilityLabel="Ver carrito">
          <Ionicons name="cart-outline" size={24} color={colores.marino} />
          {totalItems > 0 && (
            <View style={styles.headerCarritoBadge}>
              <Text style={styles.headerCarritoBadgeText}>{totalItems}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colores.marino} />
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colores.marino} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="basket-outline" size={54} color={colores.bordeFuerte} />
              <Text style={styles.emptyText}>No encontramos productos</Text>
            </View>
          }
        />
      )}

      {/* Selector de tienda */}
      <Modal visible={selectorTienda} transparent animationType="fade" onRequestClose={() => setSelectorTienda(false)}>
        <TouchableOpacity style={styles.modalFondo} activeOpacity={1} onPress={() => setSelectorTienda(false)}>
          <View style={styles.modalTiendas}>
            <Text style={styles.modalTiendasTitulo}>¿De qué tienda pides?</Text>
            <TouchableOpacity
              style={styles.tiendaOpcion}
              onPress={() => { setSucursalActiva(null); setSelectorTienda(false); }}
            >
              <View style={styles.tiendaOpcionIcon}><Ionicons name="apps" size={16} color={colores.marino} /></View>
              <Text style={styles.tiendaOpcionText}>Todas las tiendas</Text>
              {!sucursalActiva && <Ionicons name="checkmark-circle" size={20} color={colores.verde} />}
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
                    <Ionicons name="storefront" size={16} color={colores.marino} />
                  </View>
                  <Text style={styles.tiendaOpcionText} numberOfLines={1}>
                    {s.NomComercial ?? s.Nombre ?? s.nombre}
                  </Text>
                  {activa && <Ionicons name="checkmark-circle" size={20} color={colores.verde} />}
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

      {/* Barra del carrito */}
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
          <Precio usd={totalCarrito} tasa={tasa} align="right" style={styles.floatingCartPrice} styleSecundario={styles.floatingCartPriceSec} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: Platform.OS === 'ios' ? 58 : 44,
    paddingBottom: 12, paddingHorizontal: 16,
  },
  simbolo: {
    width: 48, height: 48, borderRadius: 15, backgroundColor: colores.blanco,
    borderWidth: 1, borderColor: colores.borde, alignItems: 'center', justifyContent: 'center',
  },
  simboloImg: { width: 26, height: 40 },
  headerTexto: { flex: 1, minHeight: 48, justifyContent: 'center' },
  saludo: { fontSize: 13, color: colores.textoSuave, fontWeight: '600' },
  tiendaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  tiendaSelectorText: { fontSize: 18, fontWeight: '700', color: colores.marino, flexShrink: 1 },
  headerCarrito: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colores.blanco,
    borderWidth: 1, borderColor: colores.borde, alignItems: 'center', justifyContent: 'center',
  },
  headerCarritoBadge: {
    position: 'absolute', top: -2, right: -2,
    backgroundColor: colores.celeste, borderRadius: 10, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    borderWidth: 2, borderColor: colores.fondo,
  },
  headerCarritoBadgeText: { color: colores.marino, fontSize: 10, fontWeight: '800' },

  // Hidratación
  hidraCard: {
    marginHorizontal: 16, marginTop: 4, backgroundColor: colores.marino, borderRadius: radios.enorme,
    padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16, overflow: 'hidden',
  },
  hidraDeco: { position: 'absolute', right: -40, bottom: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: colores.marinoClaro },
  hidraAnillo: {
    width: 96, height: 96, borderRadius: 48, borderWidth: 10, borderColor: colores.celeste,
    alignItems: 'center', justifyContent: 'center',
  },
  hidraNum: { color: colores.blanco, fontSize: 22, fontWeight: '800' },
  hidraUnidad: { color: colores.sobreMarino, fontSize: 11 },
  hidraTitulo: { color: colores.blanco, fontSize: 18, fontWeight: '700', lineHeight: 23 },
  hidraBarra: { height: 6, borderRadius: 3, backgroundColor: colores.marinoSuave, overflow: 'hidden' },
  hidraBarraLlena: { height: 6, borderRadius: 3, backgroundColor: colores.celeste },
  hidraBtn: { backgroundColor: colores.celeste, borderRadius: 14, minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' },
  hidraBtnText: { color: colores.marino, fontSize: 14, fontWeight: '800' },
  hidraRacha: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  hidraRachaText: { color: colores.blanco, fontSize: 13, fontWeight: '700' },

  // Agua VIDA
  aguaCard: {
    marginHorizontal: 16, marginTop: 12, backgroundColor: colores.blanco, borderRadius: radios.grande,
    borderWidth: 1, borderColor: colores.borde, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  aguaImg: { width: 60, height: 70, borderRadius: 16, backgroundColor: colores.celesteClaro },
  aguaNombre: { fontSize: 15, fontWeight: '800', color: colores.marino },
  aguaSub: { fontSize: 12, color: colores.textoSuave, marginBottom: 2 },
  aguaPrecio: { fontSize: 18, fontWeight: '700', color: colores.marino },
  aguaBtn: { backgroundColor: colores.marino, borderRadius: 14, minHeight: 46, paddingHorizontal: 16, justifyContent: 'center' },
  aguaBtnText: { color: colores.blanco, fontSize: 14, fontWeight: '800' },

  // Búsqueda
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colores.blanco, borderRadius: radios.medio, borderWidth: 1, borderColor: colores.borde,
    marginHorizontal: 16, marginTop: 14, paddingHorizontal: 14, minHeight: 50,
  },
  searchInput: { flex: 1, fontSize: 15, color: colores.marino, paddingVertical: Platform.OS === 'ios' ? 12 : 8 },

  // Categorías
  catRow: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  chip: {
    minHeight: 40, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center',
    backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde,
  },
  chipActivo: { backgroundColor: colores.marino, borderColor: colores.marino },
  chipText: { fontSize: 14, fontWeight: '700', color: colores.marino },
  chipTextActivo: { color: colores.blanco },

  seccionTitulo: { fontSize: 20, fontWeight: '700', color: colores.marino, paddingHorizontal: 16, marginTop: 18, marginBottom: 12 },

  grid: { paddingBottom: 120 },
  row: { paddingHorizontal: 16, justifyContent: 'space-between' },

  // Producto
  prodCard: {
    width: CARD_W, marginBottom: 12, backgroundColor: colores.blanco, borderRadius: radios.grande,
    borderWidth: 1, borderColor: colores.borde, padding: 10,
  },
  prodImg: { width: '100%', height: CARD_W * 0.7, borderRadius: 14, resizeMode: 'cover', backgroundColor: colores.celesteClaro },
  prodNombre: { fontSize: 14, fontWeight: '800', color: colores.marino, marginTop: 8, lineHeight: 18, minHeight: 36 },
  prodTienda: { fontSize: 11, color: colores.textoSuave, marginTop: 2 },
  prodPie: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  prodPrecio: { fontSize: 16, fontWeight: '700', color: colores.marino, fontFamily: 'Poppins_700Bold' },
  prodPrecioSec: { fontSize: 11, color: colores.textoSuave },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  qty: { flexDirection: 'row', alignItems: 'center', backgroundColor: colores.celesteClaro, borderRadius: 22, height: 44 },
  qtyBtn: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  qtyNum: { color: colores.marino, fontSize: 14, fontWeight: '800', minWidth: 16, textAlign: 'center' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  errorText: { color: colores.error, textAlign: 'center', fontSize: 14, paddingHorizontal: 24 },
  emptyText: { color: colores.textoSuave, fontSize: 15, marginTop: 10 },
  retryBtn: { marginTop: 12, backgroundColor: colores.marino, borderRadius: 14, paddingHorizontal: 22, minHeight: 44, justifyContent: 'center' },
  retryBtnText: { color: colores.blanco, fontWeight: '800' },

  // Selector de tienda
  modalFondo: { flex: 1, backgroundColor: 'rgba(0,16,52,0.45)', justifyContent: 'flex-start' },
  modalTiendas: {
    marginTop: Platform.OS === 'ios' ? 112 : 98, marginHorizontal: 16,
    backgroundColor: colores.blanco, borderRadius: radios.grande, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 12,
  },
  modalTiendasTitulo: { fontSize: 18, fontWeight: '700', color: colores.marino, marginBottom: 8 },
  tiendaOpcion: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderBottomWidth: 1, borderBottomColor: colores.fondo },
  tiendaOpcionIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colores.celesteClaro, alignItems: 'center', justifyContent: 'center' },
  tiendaOpcionText: { flex: 1, fontSize: 15, fontWeight: '700', color: colores.marino },

  // Barra del carrito
  floatingCart: {
    position: 'absolute', bottom: 16, left: 16, right: 16, minHeight: 62,
    backgroundColor: colores.marino, borderRadius: 20,
    flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 18, gap: 10,
    shadowColor: colores.marino, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  floatingCartBadge: {
    backgroundColor: colores.celeste, borderRadius: 12, minWidth: 34, height: 34,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6,
  },
  floatingCartBadgeText: { color: colores.marino, fontSize: 14, fontWeight: '800' },
  floatingCartText: { flex: 1, color: colores.blanco, fontWeight: '800', fontSize: 16 },
  floatingCartPrice: { color: colores.blanco, fontSize: 17, fontWeight: '700', fontFamily: 'Poppins_700Bold' },
  floatingCartPriceSec: { color: colores.sobreMarino, fontSize: 11 },

  // Resultados de búsqueda por tienda
  searchResultsWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  searchResultsTitle: { fontSize: 13, fontWeight: '700', color: colores.textoSuave, marginBottom: 12 },
  tiendaResultCard: {
    backgroundColor: colores.blanco, borderRadius: radios.grande, marginBottom: 12,
    borderWidth: 1, borderColor: colores.borde, overflow: 'hidden',
  },
  tiendaResultHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 },
  tiendaResultIconWrap: { width: 36, height: 36, borderRadius: 12, backgroundColor: colores.celesteClaro, alignItems: 'center', justifyContent: 'center' },
  tiendaResultNombre: { flex: 1, fontSize: 15, fontWeight: '800', color: colores.marino },
  tiendaResultBadge: { backgroundColor: colores.celesteClaro, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  tiendaResultBadgeText: { fontSize: 11, fontWeight: '800', color: colores.marino },
  tiendaResultProds: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  miniProdCard: { width: 104 },
  miniProdImg: { width: 104, height: 76, borderRadius: 12, backgroundColor: colores.celesteClaro, resizeMode: 'cover' },
  miniProdNombre: { fontSize: 12, fontWeight: '700', color: colores.marino, marginTop: 6, lineHeight: 16 },
  miniProdPrecio: { fontSize: 13, fontWeight: '800', color: colores.marino, marginTop: 2 },
});
