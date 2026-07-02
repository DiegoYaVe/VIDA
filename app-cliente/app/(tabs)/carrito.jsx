import { useState, useEffect } from 'react';
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
import { absImg } from '../../constants/config';
import SelectorUbicacion from '../../components/SelectorUbicacion';
import * as ImagePicker from 'expo-image-picker';

const PLACEHOLDER = 'https://via.placeholder.com/80/EBF8FF/1A6A9A?text=+';

const METODOS = [
  { key: 'EFECTIVO',   label: 'Efectivo',   icon: 'cash-outline' },
  { key: 'TARJETA',    label: 'Tarjeta',    icon: 'card-outline' },
  { key: 'PAGO_MOVIL', label: 'Pago Móvil', icon: 'phone-portrait-outline' },
];

export default function CarritoScreen() {
  const router = useRouter();
  const { idBranch, idCuenta, token, setPostLoginRedirect } = useAuthStore();

  const items = useCarritoStore((s) => s.items);
  const idPuntoVenta = useCarritoStore((s) => s.idPuntoVenta);
  const agregarItem = useCarritoStore((s) => s.agregarItem);
  const quitarItem = useCarritoStore((s) => s.quitarItem);
  const limpiarCarrito = useCarritoStore((s) => s.limpiarCarrito);
  const total = useCarritoStore((s) =>
    s.items.reduce((acc, item) => acc + item.PrecioUSD * item.Cantidad, 0)
  );

  const [direccion, setDireccion] = useState('');
  const [ubicacion, setUbicacion] = useState(null);       // { Latitud, Longitud }
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [direcciones, setDirecciones] = useState([]);     // guardadas del cliente
  const [notas, setNotas] = useState('');
  const [metodoPago, setMetodoPago] = useState('EFECTIVO');
  const [loading, setLoading] = useState(false);

  // Pago Móvil
  const [datosPM, setDatosPM] = useState(null);
  const [referencia, setReferencia] = useState('');
  const [comprobante, setComprobante] = useState(null); // { uri, mimeType, fileName }

  useEffect(() => {
    if (metodoPago !== 'PAGO_MOVIL' || datosPM) return;
    api.get('/delivery/pago-movil', { params: { idBranch, idCuenta } })
      .then(r => setDatosPM(r.data))
      .catch(() => setDatosPM({ disponible: false }));
  }, [metodoPago]);

  const elegirComprobante = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!res.canceled && res.assets?.[0]) setComprobante(res.assets[0]);
  };

  // Direcciones guardadas (solo con sesión)
  useEffect(() => {
    if (!token) { setDirecciones([]); return; }
    api.get('/delivery/cliente/direcciones')
      .then(r => setDirecciones(r.data || []))
      .catch(() => {});
  }, [token]);

  const usarDireccionGuardada = (d) => {
    setDireccion(d.Direccion || '');
    if (d.Latitud != null && d.Longitud != null) {
      setUbicacion({ Latitud: parseFloat(d.Latitud), Longitud: parseFloat(d.Longitud) });
    } else {
      setUbicacion(null);
    }
  };

  const onUbicacionConfirmada = async ({ Latitud, Longitud, guardar, alias }) => {
    setUbicacion({ Latitud, Longitud });
    setSelectorVisible(false);
    if (guardar && token) {
      try {
        await api.post('/delivery/cliente/direcciones', {
          Alias: alias || 'Mi dirección',
          Direccion: direccion.trim() || alias || 'Ubicación en mapa',
          Latitud, Longitud,
        });
        const r = await api.get('/delivery/cliente/direcciones');
        setDirecciones(r.data || []);
      } catch { /* no bloquear el flujo por esto */ }
    }
  };

  const handlePedido = async () => {
    // Explorar y llenar el carrito no requiere cuenta; pedir sí.
    // El carrito está persistido: no se pierde al ir a login/registro.
    if (!token) {
      Alert.alert(
        'Inicia sesión para pedir',
        'Tu carrito se guarda — crea tu cuenta o inicia sesión y termina tu pedido.',
        [
          { text: 'Ahora no', style: 'cancel' },
          {
            text: 'Iniciar sesión',
            onPress: () => {
              setPostLoginRedirect('/(tabs)/carrito');
              router.push('/(auth)/login');
            },
          },
        ]
      );
      return;
    }
    if (!direccion.trim()) {
      Alert.alert('Dirección requerida', 'Por favor ingresa tu dirección de entrega.');
      return;
    }
    if (metodoPago === 'PAGO_MOVIL') {
      if (!referencia.trim()) {
        Alert.alert('Referencia requerida', 'Ingresa el número de referencia de tu Pago Móvil.');
        return;
      }
      if (!comprobante) {
        Alert.alert('Comprobante requerido', 'Adjunta la captura de tu Pago Móvil.');
        return;
      }
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
        UbicacionEntregaLat: ubicacion?.Latitud ?? null,
        UbicacionEntregaLon: ubicacion?.Longitud ?? null,
        NotasCliente: notas.trim(),
        MetodoPago: metodoPago,
      };
      const res = await api.post('/delivery/pedido', payload);
      const idPedido = res.data?.idPedido ?? res.data?.pedido?.idPedido;

      // Pago Móvil: subir el comprobante — el admin lo revisa y aprueba
      if (metodoPago === 'PAGO_MOVIL' && comprobante && idPedido) {
        try {
          const fd = new FormData();
          fd.append('Referencia', referencia.trim());
          fd.append('file', {
            uri: comprobante.uri,
            name: comprobante.fileName || `comprobante_${idPedido}.jpg`,
            type: comprobante.mimeType || 'image/jpeg',
          });
          await api.post(`/delivery/pedido/${idPedido}/comprobante`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch {
          Alert.alert(
            'Comprobante no enviado',
            'Tu pedido se creó pero el comprobante no se pudo subir. Podrás mostrarlo al repartidor.'
          );
        }
      }

      limpiarCarrito();
      setUbicacion(null);
      setComprobante(null);
      setReferencia('');
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
              source={{ uri: absImg(item.ImagenProducto) || PLACEHOLDER }}
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

          {/* Direcciones guardadas */}
          {direcciones.length > 0 && (
            <View style={styles.dirGuardadasRow}>
              {direcciones.map((d) => (
                <TouchableOpacity
                  key={d.idDireccion}
                  style={styles.dirChip}
                  onPress={() => usarDireccionGuardada(d)}
                >
                  <Ionicons
                    name={(d.Alias || '').toLowerCase().includes('casa') ? 'home' : 'bookmark'}
                    size={13} color="#1A6A9A"
                  />
                  <Text style={styles.dirChipText} numberOfLines={1}>
                    {d.Alias || d.Direccion}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.inputLabel}>Dirección de entrega *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Av. Principal, Edificio X, Apto 3B"
            placeholderTextColor="#A0AEC0"
            value={direccion}
            onChangeText={setDireccion}
            multiline
          />

          {/* Ubicación en mapa — el repartidor llega directo al pin */}
          <TouchableOpacity style={styles.mapaBtn} onPress={() => setSelectorVisible(true)}>
            <Ionicons
              name={ubicacion ? 'checkmark-circle' : 'location-outline'}
              size={18}
              color={ubicacion ? '#27AE60' : '#1A6A9A'}
            />
            <Text style={[styles.mapaBtnText, ubicacion && { color: '#27AE60' }]}>
              {ubicacion ? 'Ubicación fijada en el mapa ✓ (tocar para cambiar)' : 'Fijar mi ubicación en el mapa'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.inputLabel}>Método de pago</Text>
          <View style={styles.metodoRow}>
            {METODOS.map((m) => (
              <TouchableOpacity
                key={m.key}
                style={[styles.metodoBtn, metodoPago === m.key && styles.metodoBtnActive]}
                onPress={() => setMetodoPago(m.key)}
              >
                <Ionicons
                  name={m.icon}
                  size={18}
                  color={metodoPago === m.key ? '#fff' : '#718096'}
                />
                <Text style={[styles.metodoBtnText, metodoPago === m.key && styles.metodoBtnTextActive]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Pago Móvil: datos + referencia + comprobante */}
          {metodoPago === 'PAGO_MOVIL' && (
            <View style={styles.pmCard}>
              {datosPM === null ? (
                <ActivityIndicator size="small" color="#1A6A9A" />
              ) : !datosPM.disponible ? (
                <Text style={styles.pmNoDisponible}>
                  Pago Móvil no está configurado todavía. Elige otro método.
                </Text>
              ) : (
                <>
                  <Text style={styles.pmTitulo}>Realiza tu Pago Móvil a:</Text>
                  <View style={styles.pmDatos}>
                    <PMRow label="Banco"    valor={datosPM.Banco} />
                    <PMRow label="Teléfono" valor={datosPM.Telefono} />
                    <PMRow label="Cédula"   valor={datosPM.Cedula} />
                    {datosPM.Titular ? <PMRow label="Titular" valor={datosPM.Titular} /> : null}
                    <PMRow label="Monto" valor={`$${total.toFixed(2)}`} destacado />
                  </View>

                  <Text style={styles.inputLabel}>Nº de referencia *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ej: 001234567890"
                    placeholderTextColor="#A0AEC0"
                    value={referencia}
                    onChangeText={setReferencia}
                    keyboardType="number-pad"
                  />

                  <TouchableOpacity style={styles.comprobanteBtn} onPress={elegirComprobante}>
                    {comprobante ? (
                      <>
                        <Image source={{ uri: comprobante.uri }} style={styles.comprobanteThumb} />
                        <Text style={[styles.comprobanteBtnText, { color: '#27AE60' }]}>
                          Comprobante adjunto ✓ (tocar para cambiar)
                        </Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="image-outline" size={20} color="#1A6A9A" />
                        <Text style={styles.comprobanteBtnText}>Adjuntar captura del pago *</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

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

      <SelectorUbicacion
        visible={selectorVisible}
        onClose={() => setSelectorVisible(false)}
        onConfirmar={onUbicacionConfirmada}
        puedeGuardar={!!token}
      />
    </SafeAreaView>
  );
}

function PMRow({ label, valor, destacado }) {
  return (
    <View style={pmStyles.row}>
      <Text style={pmStyles.label}>{label}</Text>
      <Text style={[pmStyles.valor, destacado && pmStyles.valorDestacado]} selectable>
        {valor || '—'}
      </Text>
    </View>
  );
}

const pmStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  label: { fontSize: 13, color: '#718096' },
  valor: { fontSize: 13.5, fontWeight: '700', color: '#1A202C' },
  valorDestacado: { color: '#27AE60', fontSize: 15, fontWeight: '800' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  pmCard: {
    backgroundColor: '#F7FAFC', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 14, padding: 14, marginTop: 10, marginBottom: 6,
  },
  pmNoDisponible: { fontSize: 13, color: '#E53E3E', textAlign: 'center' },
  pmTitulo: { fontSize: 13.5, fontWeight: '800', color: '#1A202C', marginBottom: 6 },
  pmDatos: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 8, marginBottom: 10,
  },
  comprobanteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#EBF8FF', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, marginTop: 8,
  },
  comprobanteBtnText: { color: '#1A6A9A', fontSize: 13.5, fontWeight: '700', flex: 1 },
  comprobanteThumb: { width: 36, height: 36, borderRadius: 8 },
  dirGuardadasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  dirChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#EBF8FF', borderWidth: 1, borderColor: '#BEE3F8',
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, maxWidth: 180,
  },
  dirChipText: { color: '#1A6A9A', fontSize: 12.5, fontWeight: '700' },
  mapaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#EBF8FF', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, marginTop: 8, marginBottom: 4,
  },
  mapaBtnText: { color: '#1A6A9A', fontSize: 13.5, fontWeight: '700', flex: 1 },
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
