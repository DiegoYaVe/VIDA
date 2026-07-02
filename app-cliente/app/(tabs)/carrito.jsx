import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Image,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import api from '../../services/api';
import useCarritoStore from '../../store/carritoStore';
import useAuthStore from '../../store/authStore';

const PLACEHOLDER = 'https://via.placeholder.com/80/EBF8FF/1A6A9A?text=+';

const METODOS = ['EFECTIVO', 'TARJETA'];

export default function CarritoScreen() {
  const router = useRouter();
  const { idBranch } = useAuthStore();

  const items = useCarritoStore((s) => s.items);
  const idPuntoVenta = useCarritoStore((s) => s.idPuntoVenta);
  const agregarItem = useCarritoStore((s) => s.agregarItem);
  const quitarItem = useCarritoStore((s) => s.quitarItem);
  const limpiarCarrito = useCarritoStore((s) => s.limpiarCarrito);
  const total = useCarritoStore((s) =>
    s.items.reduce((acc, item) => acc + item.PrecioUSD * item.Cantidad, 0)
  );

  const [direccion, setDireccion] = useState('');
  const [notas, setNotas] = useState('');
  const [metodoPago, setMetodoPago] = useState('EFECTIVO');
  const [loading, setLoading] = useState(false);

  const handlePedido = async () => {
    if (!direccion.trim()) {
      Alert.alert('Dirección requerida', 'Por favor ingresa tu dirección de entrega.');
      return;
    }
    if (items.length === 0) return;

    setLoading(true);
    try {
      const payload = {
        idPuntoVenta,
        items: items.map((i) => ({
          idProducto: i.idProducto,
          Cantidad: i.Cantidad,
          PrecioUSD: i.PrecioUSD,
        })),
        DireccionEntrega: direccion.trim(),
        UbicacionEntregaLat: null,
        UbicacionEntregaLon: null,
        NotasCliente: notas.trim(),
        MetodoPago: metodoPago,
      };
      const res = await api.post('/delivery/pedido', payload);
      const idPedido = res.data?.idPedido ?? res.data?.pedido?.idPedido;
      limpiarCarrito();
      router.push(`/pedido/${idPedido}`);
    } catch (e) {
      Alert.alert('Error al hacer el pedido', e.message);
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Mi carrito</Text>
        </View>
        <View style={styles.empty}>
          <Ionicons name="cart-outline" size={80} color="#CBD5E0" />
          <Text style={styles.emptyTitle}>Tu carrito está vacío</Text>
          <Text style={styles.emptyText}>Agrega productos desde nuestras tiendas</Text>
          <TouchableOpacity style={styles.exploreBtn} onPress={() => router.push('/(tabs)')}>
            <Text style={styles.exploreBtnText}>Explorar tiendas</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mi carrito</Text>
        <TouchableOpacity onPress={() => {
          Alert.alert('Vaciar carrito', '¿Estás seguro?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Vaciar', style: 'destructive', onPress: limpiarCarrito },
          ]);
        }}>
          <Text style={styles.clearText}>Vaciar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Items */}
        {items.map((item) => (
          <View key={item.idProducto} style={styles.itemCard}>
            <Image
              source={{ uri: item.ImagenProducto || PLACEHOLDER }}
              style={styles.itemImg}
            />
            <View style={styles.itemInfo}>
              <Text style={styles.itemNombre} numberOfLines={2}>{item.Nombre}</Text>
              <Text style={styles.itemPrecioUnit}>${item.PrecioUSD.toFixed(2)} c/u</Text>
              <Text style={styles.itemSubtotal}>
                Subtotal: ${(item.PrecioUSD * item.Cantidad).toFixed(2)}
              </Text>
            </View>
            <View style={styles.qtyCol}>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => quitarItem(item.idProducto)}>
                <Ionicons name="remove" size={16} color="#1A6A9A" />
              </TouchableOpacity>
              <Text style={styles.qtyText}>{item.Cantidad}</Text>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => agregarItem({ ...item, Cantidad: 1 })}
              >
                <Ionicons name="add" size={16} color="#1A6A9A" />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Delivery section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Entrega</Text>

          <Text style={styles.inputLabel}>Dirección de entrega *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Av. Principal, Edificio X, Apto 3B"
            placeholderTextColor="#A0AEC0"
            value={direccion}
            onChangeText={setDireccion}
            multiline
          />

          <Text style={styles.inputLabel}>Método de pago</Text>
          <View style={styles.metodoRow}>
            {METODOS.map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.metodoBtn, metodoPago === m && styles.metodoBtnActive]}
                onPress={() => setMetodoPago(m)}
              >
                <Ionicons
                  name={m === 'EFECTIVO' ? 'cash-outline' : 'card-outline'}
                  size={18}
                  color={metodoPago === m ? '#fff' : '#718096'}
                />
                <Text style={[styles.metodoBtnText, metodoPago === m && styles.metodoBtnTextActive]}>
                  {m}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.inputLabel}>Notas para el establecimiento</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            placeholder="Ej: Sin cebolla, por favor..."
            placeholderTextColor="#A0AEC0"
            value={notas}
            onChangeText={setNotas}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Summary */}
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>${total.toFixed(2)}</Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryTotal]}>
            <Text style={styles.summaryTotalLabel}>Total</Text>
            <Text style={styles.summaryTotalValue}>${total.toFixed(2)}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.pedidoBtn, loading && styles.btnDisabled]}
          onPress={handlePedido}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              <Text style={styles.pedidoBtnText}>Hacer pedido — ${total.toFixed(2)}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#1A202C' },
  clearText: { color: '#E53E3E', fontWeight: '600', fontSize: 14 },
  scroll: { padding: 16, paddingBottom: 40 },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  itemImg: { width: 68, height: 68, borderRadius: 10, resizeMode: 'cover' },
  itemInfo: { flex: 1, paddingHorizontal: 12 },
  itemNombre: { fontSize: 14, fontWeight: '600', color: '#1A202C' },
  itemPrecioUnit: { fontSize: 12, color: '#718096', marginTop: 2 },
  itemSubtotal: { fontSize: 13, fontWeight: '700', color: '#27AE60', marginTop: 4 },
  qtyCol: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  qtyBtn: { padding: 6, backgroundColor: '#F7FAFC' },
  qtyText: { paddingVertical: 4, paddingHorizontal: 8, fontSize: 14, fontWeight: '700', color: '#1A202C' },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1A202C', marginBottom: 12 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#4A5568', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1A202C',
    backgroundColor: '#FAFAFA',
  },
  inputMulti: { minHeight: 70, textAlignVertical: 'top' },
  metodoRow: { flexDirection: 'row', gap: 10 },
  metodoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F7FAFC',
  },
  metodoBtnActive: { backgroundColor: '#1A6A9A', borderColor: '#1A6A9A' },
  metodoBtnText: { fontWeight: '700', color: '#718096', fontSize: 13 },
  metodoBtnTextActive: { color: '#fff' },
  summary: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryLabel: { color: '#718096', fontSize: 14 },
  summaryValue: { color: '#1A202C', fontSize: 14, fontWeight: '600' },
  summaryTotal: {
    borderTopWidth: 1,
    borderTopColor: '#EDF2F7',
    marginTop: 8,
    paddingTop: 12,
  },
  summaryTotalLabel: { fontSize: 16, fontWeight: '800', color: '#1A202C' },
  summaryTotalValue: { fontSize: 18, fontWeight: '900', color: '#1A6A9A' },
  pedidoBtn: {
    backgroundColor: '#27AE60',
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    shadowColor: '#27AE60',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  btnDisabled: { opacity: 0.6 },
  pedidoBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1A202C', marginTop: 16 },
  emptyText: { color: '#718096', textAlign: 'center', marginTop: 8, fontSize: 14 },
  exploreBtn: {
    marginTop: 24,
    backgroundColor: '#1A6A9A',
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 13,
  },
  exploreBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
