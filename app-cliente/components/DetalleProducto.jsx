// Detalle de producto (diseño Agua VIDA): foto grande, hoja blanca con el
// nombre, sello de marca propia, precio en USD y bolívares, stepper y botón
// fijo "Agregar N al carrito · $total".
import { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Modal, Image, ScrollView, Dimensions, Platform } from 'react-native';
import { Text } from './Texto';
import { Ionicons } from '@expo/vector-icons';
import { absImg } from '../constants/config';
import { useTasaReferencial, precioMonedas } from '../services/moneda';
import { colores, fuentes, radios } from '../constants/tema';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PLACEHOLDER = 'https://via.placeholder.com/600/DDF2F8/001034?text=VIDA';

export default function DetalleProducto({ producto, onClose, onAgregar }) {
  const tasa = useTasaReferencial();
  const [cantidad, setCantidad] = useState(1);

  useEffect(() => { if (producto) setCantidad(1); }, [producto?.idProducto, producto?.idPuntoVenta]);

  if (!producto) return null;

  const precio = parseFloat(producto.PrecioUSD || 0);
  const stock = parseFloat(producto.StockDisponible ?? 0);
  const total = precio * cantidad;
  const maxAlcanzado = stock > 0 && cantidad >= stock;
  const marcaVida = /\bvida\b/i.test(producto.Nombre || '');

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
            <TouchableOpacity style={styles.cerrarBtn} onPress={onClose} accessibilityLabel="Volver">
              <Ionicons name="arrow-back" size={22} color="#001034" />
            </TouchableOpacity>
          </View>

          <View style={styles.contenido}>
            <View style={styles.chips}>
              {marcaVida ? (
                <View style={styles.chipMarca}><Text style={styles.chipMarcaText}>Marca VIDA</Text></View>
              ) : null}
              <View style={styles.sucChip}>
                <Ionicons name="storefront-outline" size={13} color={colores.marino} />
                <Text style={styles.sucChipText}>{producto.NombreSucursal}</Text>
              </View>
            </View>

            <Text style={styles.nombre}>{producto.Nombre}</Text>
            <Text style={styles.precio}>{precioMonedas(precio, tasa).principal}</Text>
            {precioMonedas(precio, tasa).secundario ? (
              <Text style={styles.precioSufijo}>{precioMonedas(precio, tasa).secundario} · tasa de referencia</Text>
            ) : null}

            {producto.Descripcion ? (
              <Text style={styles.descripcion}>{producto.Descripcion}</Text>
            ) : null}

            {producto.NombreCategoria ? (
              <View style={styles.metaRow}>
                <Ionicons name="pricetag-outline" size={14} color="#8C9BB0" />
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
              accessibilityLabel="Quitar uno"
            >
              <Ionicons name="remove" size={20} color={cantidad <= 1 ? '#CFE4EB' : '#001034'} />
            </TouchableOpacity>
            <Text style={styles.stepperNum}>{cantidad}</Text>
            <TouchableOpacity
              style={[styles.stepperBtn, styles.stepperBtnMas]}
              onPress={() => !maxAlcanzado && setCantidad(c => c + 1)}
              accessibilityLabel="Agregar uno"
            >
              <Ionicons name="add" size={20} color={maxAlcanzado ? colores.bordeFuerte : colores.blanco} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={0.9}
            onPress={() => { onAgregar(producto, cantidad); onClose(); }}
          >
            <View style={styles.agregarBtn}>
              <Text style={styles.agregarBtnText}>
                Agregar {cantidad} al carrito
              </Text>
              <Text style={styles.agregarBtnPrecio}>{precioMonedas(total, tasa).principal}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.blanco },
  imagen: { width: '100%', height: SCREEN_HEIGHT * 0.42, resizeMode: 'cover', backgroundColor: colores.celesteClaro },
  cerrarBtn: {
    position: 'absolute', top: Platform.OS === 'ios' ? 54 : 42, left: 16,
    width: 46, height: 46, borderRadius: 23, backgroundColor: colores.blanco,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 5,
  },
  contenido: {
    marginTop: -28, backgroundColor: colores.blanco, borderTopLeftRadius: radios.enorme, borderTopRightRadius: radios.enorme,
    paddingHorizontal: 22, paddingTop: 24,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chipMarca: { backgroundColor: colores.marino, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  chipMarcaText: { color: colores.blanco, fontSize: 12, fontWeight: '800' },
  sucChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colores.celesteClaro, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
  },
  sucChipText: { color: colores.marino, fontSize: 12, fontWeight: '800' },
  nombre: { fontSize: 28, fontWeight: '800', color: colores.marino, marginBottom: 10, lineHeight: 34 },
  precio: { fontSize: 32, color: colores.marino, fontFamily: fuentes.tituloFuerte, marginBottom: 2 },
  precioSufijo: { fontSize: 14, fontWeight: '600', color: colores.textoSuave, marginBottom: 14 },
  descripcion: { fontSize: 15, color: '#2C3D58', lineHeight: 23, marginTop: 6, marginBottom: 16 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  metaText: { fontSize: 14, color: colores.textoSuave },

  barraInferior: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colores.blanco, padding: 16, paddingBottom: Platform.OS === 'ios' ? 30 : 16,
    borderTopWidth: 1, borderTopColor: colores.borde,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colores.fondo, borderRadius: 18, padding: 4, gap: 2 },
  stepperBtn: { width: 44, height: 46, borderRadius: 14, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center' },
  stepperBtnMas: { backgroundColor: colores.marino },
  stepperNum: { fontSize: 18, color: colores.marino, minWidth: 30, textAlign: 'center', fontFamily: fuentes.titulo },
  agregarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 18, paddingHorizontal: 18, minHeight: 56, backgroundColor: colores.marino,
  },
  agregarBtnText: { color: colores.blanco, fontSize: 15, fontWeight: '800' },
  agregarBtnPrecio: { color: colores.blanco, fontSize: 16, fontFamily: fuentes.titulo },
});
