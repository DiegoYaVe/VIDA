// Detalle de producto estilo Uber Eats: imagen grande, info, stepper de
// cantidad y botón sticky "Agregar N al carrito • $total".
import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Image,
  ScrollView, Dimensions, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { absImg } from '../constants/config';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PLACEHOLDER = 'https://via.placeholder.com/600/EBF8FF/1A6A9A?text=VIDA';

export default function DetalleProducto({ producto, onClose, onAgregar }) {
  const [cantidad, setCantidad] = useState(1);

  useEffect(() => { if (producto) setCantidad(1); }, [producto?.idProducto, producto?.idPuntoVenta]);

  if (!producto) return null;

  const precio = parseFloat(producto.PrecioUSD || 0);
  const stock = parseFloat(producto.StockDisponible ?? 0);
  const total = precio * cantidad;
  const maxAlcanzado = stock > 0 && cantidad >= stock;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
          {/* Imagen grande */}
          <View>
            <Image
              source={{ uri: absImg(producto.ImagenProducto) || PLACEHOLDER }}
              style={styles.imagen}
            />
            <TouchableOpacity style={styles.cerrarBtn} onPress={onClose}>
              <Ionicons name="arrow-back" size={22} color="#1A202C" />
            </TouchableOpacity>
          </View>

          <View style={styles.contenido}>
            {/* Sucursal */}
            <View style={styles.sucChip}>
              <Ionicons name="storefront-outline" size={13} color="#1A6A9A" />
              <Text style={styles.sucChipText}>{producto.NombreSucursal}</Text>
            </View>

            <Text style={styles.nombre}>{producto.Nombre}</Text>
            <Text style={styles.precio}>
              ${precio.toFixed(2)}
              <Text style={styles.precioSufijo}>  USD</Text>
            </Text>

            {producto.Descripcion ? (
              <Text style={styles.descripcion}>{producto.Descripcion}</Text>
            ) : null}

            {producto.NombreCategoria ? (
              <View style={styles.metaRow}>
                <Ionicons name="pricetag-outline" size={14} color="#94A3B8" />
                <Text style={styles.metaText}>{producto.NombreCategoria}</Text>
              </View>
            ) : null}
            {stock > 0 && stock <= 10 ? (
              <View style={styles.metaRow}>
                <Ionicons name="flash-outline" size={14} color="#D69E2E" />
                <Text style={[styles.metaText, { color: '#D69E2E', fontWeight: '700' }]}>
                  ¡Quedan solo {Math.floor(stock)} disponibles!
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        {/* Barra inferior sticky: stepper + agregar */}
        <View style={styles.barraInferior}>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => setCantidad(c => Math.max(1, c - 1))}
            >
              <Ionicons name="remove" size={20} color={cantidad <= 1 ? '#CBD5E0' : '#1A202C'} />
            </TouchableOpacity>
            <Text style={styles.stepperNum}>{cantidad}</Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => !maxAlcanzado && setCantidad(c => c + 1)}
            >
              <Ionicons name="add" size={20} color={maxAlcanzado ? '#CBD5E0' : '#1A202C'} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={0.9}
            onPress={() => { onAgregar(producto, cantidad); onClose(); }}
          >
            <LinearGradient
              colors={['#27AE60', '#1F9E56']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.agregarBtn}
            >
              <Text style={styles.agregarBtnText}>
                Agregar {cantidad} al carrito
              </Text>
              <Text style={styles.agregarBtnPrecio}>${total.toFixed(2)}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  imagen: { width: '100%', height: SCREEN_HEIGHT * 0.38, resizeMode: 'cover', backgroundColor: '#EDF2F7' },
  cerrarBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 42,
    left: 16,
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 5,
  },
  contenido: { padding: 20 },
  sucChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: '#EBF8FF', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 5, marginBottom: 12,
  },
  sucChipText: { color: '#1A6A9A', fontSize: 12.5, fontWeight: '700' },
  nombre: { fontSize: 26, fontWeight: '900', color: '#1A202C', marginBottom: 6 },
  precio: { fontSize: 24, fontWeight: '800', color: '#1A6A9A', marginBottom: 14 },
  precioSufijo: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  descripcion: { fontSize: 15, color: '#4A5568', lineHeight: 22, marginBottom: 16 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  metaText: { fontSize: 13.5, color: '#94A3B8' },

  barraInferior: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 }, elevation: 12,
  },
  stepper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F1F5F9', borderRadius: 24, paddingHorizontal: 4,
  },
  stepperBtn: { width: 42, height: 46, alignItems: 'center', justifyContent: 'center' },
  stepperNum: { fontSize: 17, fontWeight: '800', color: '#1A202C', minWidth: 26, textAlign: 'center' },
  agregarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 16, paddingHorizontal: 18, paddingVertical: 15,
  },
  agregarBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  agregarBtnPrecio: { color: '#fff', fontSize: 15, fontWeight: '900' },
});
