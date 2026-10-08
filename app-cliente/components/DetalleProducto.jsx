// Detalle de producto (diseño "Agua VIDA"): foto sobre fondo celeste con un
// círculo, hoja blanca con sellos, nombre, descripción, precio en USD y Bs,
// selector de cantidad, puntos que gana y botón fijo "Agregar al carrito".
import { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Modal, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from './Texto';
import { Chevron } from './Cabecera';
import { absImg } from '../constants/config';
import { useTasaReferencial, precioMonedas, fmtUSD } from '../services/moneda';
import { colores, fuentes } from '../constants/tema';

const PUNTOS_POR_DOLAR = 10; // config PuntosPorDolar por defecto

export default function DetalleProducto({ producto, onClose, onAgregar }) {
  const tasa = useTasaReferencial();
  const [cantidad, setCantidad] = useState(1);
  useEffect(() => { if (producto) setCantidad(1); }, [producto?.idProducto, producto?.idPuntoVenta]);
  if (!producto) return null;

  const precio = parseFloat(producto.PrecioPromo ?? producto.PrecioUSD ?? 0);
  const stock = parseFloat(producto.StockDisponible ?? 0);
  const maximo = stock > 0 ? Math.floor(stock) : 99;
  const { principal, secundario } = precioMonedas(precio, tasa);
  const marcaVida = /\bvida\b/i.test(producto.Nombre || '');
  const img = absImg(producto.ImagenProducto);
  const total = precio * cantidad;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
          <View style={styles.foto}>
            <View style={styles.circulo} />
            {img ? <Image source={{ uri: img }} style={styles.fotoImg} resizeMode="contain" /> : null}
            <SafeAreaView edges={['top']} style={styles.fotoBotones}>
              <TouchableOpacity style={styles.redondo} onPress={onClose} accessibilityLabel="Volver"><Chevron /></TouchableOpacity>
            </SafeAreaView>
          </View>

          <View style={styles.hoja}>
            <View style={styles.sellos}>
              {marcaVida ? <View style={styles.selloMarca}><Text style={styles.selloMarcaTexto}>Marca VIDA</Text></View> : null}
              {producto.NombreCategoria ? <View style={styles.selloCat}><Text style={styles.selloCatTexto}>{producto.NombreCategoria}</Text></View> : null}
              {producto.PromoBadge ? <View style={[styles.selloCat, { backgroundColor: colores.verdeClaro }]}><Text style={styles.selloCatTexto}>{producto.PromoBadge}</Text></View> : null}
            </View>
            <Text style={styles.nombre}>{producto.Nombre}</Text>
            {producto.Descripcion ? <Text style={styles.descripcion}>{producto.Descripcion}</Text> : null}
            {stock > 0 && stock <= 10 ? <Text style={styles.quedan}>Quedan {Math.floor(stock)} disponibles en {producto.NombreSucursal || 'la tienda'}</Text> : null}

            <View style={styles.precioFila}>
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.precio}>{principal}</Text>
                {secundario ? <Text style={styles.precioSec}>{secundario} · tasa BCV de hoy</Text> : null}
              </View>
              <View style={styles.stepper}>
                <TouchableOpacity style={styles.menos} onPress={() => setCantidad((c) => Math.max(1, c - 1))} accessibilityLabel="Quitar uno">
                  <Text style={styles.stepTexto}>−</Text>
                </TouchableOpacity>
                <Text style={styles.cantidad}>{cantidad}</Text>
                <TouchableOpacity style={[styles.mas, cantidad >= maximo && { opacity: 0.4 }]} disabled={cantidad >= maximo}
                  onPress={() => setCantidad((c) => Math.min(maximo, c + 1))} accessibilityLabel="Agregar uno">
                  <Text style={[styles.stepTexto, { color: colores.blanco }]}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.puntos}>
              <View style={styles.puntosIcono}><Text style={styles.puntosIconoTexto}>pts</Text></View>
              <Text style={styles.puntosTexto}>
                Con esta compra ganas <Text style={{ fontWeight: '800' }}>{Math.round(total * PUNTOS_POR_DOLAR).toLocaleString('es-VE')} puntos</Text> en tus puntos VIDA
              </Text>
            </View>
          </View>
        </ScrollView>

        <SafeAreaView edges={['bottom']} style={styles.pie}>
          <TouchableOpacity style={styles.agregar} onPress={() => { onAgregar(producto, cantidad); onClose(); }}>
            <Text style={styles.agregarTexto}>Agregar al carrito</Text>
            <Text style={styles.agregarTotal}>{fmtUSD(total)}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.blanco },
  foto: { height: 380, backgroundColor: colores.celesteClaro, alignItems: 'center', justifyContent: 'center' },
  circulo: { position: 'absolute', width: 230, height: 230, borderRadius: 115, backgroundColor: '#C3E8F2' },
  fotoImg: { width: 240, height: 260 },
  fotoBotones: { position: 'absolute', top: 0, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 16 },
  redondo: { width: 44, height: 44, borderRadius: 22, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center' },

  hoja: { marginTop: -28, backgroundColor: colores.blanco, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 24, paddingHorizontal: 22, gap: 14 },
  sellos: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  selloMarca: { backgroundColor: colores.marino, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  selloMarcaTexto: { color: colores.blanco, fontSize: 12, fontWeight: '800' },
  selloCat: { backgroundColor: colores.celesteClaro, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  selloCatTexto: { color: colores.marino, fontSize: 12, fontWeight: '800' },
  nombre: { fontFamily: fuentes.tituloFuerte, fontSize: 28, lineHeight: 31, color: colores.marino },
  descripcion: { fontSize: 15, lineHeight: 22, color: '#2C3D58' },
  quedan: { fontSize: 13, fontWeight: '700', color: colores.aviso },

  precioFila: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  precio: { fontFamily: fuentes.tituloFuerte, fontSize: 32, color: colores.marino },
  precioSec: { fontSize: 14, color: colores.textoSuave },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colores.fondo, borderRadius: 18, padding: 4 },
  menos: { width: 44, height: 44, borderRadius: 14, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center' },
  mas: { width: 44, height: 44, borderRadius: 14, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  stepTexto: { fontWeight: '800', fontSize: 20, color: colores.marino },
  cantidad: { width: 34, textAlign: 'center', fontFamily: fuentes.titulo, fontSize: 18, color: colores.marino },

  puntos: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colores.verdeClaro, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14 },
  puntosIcono: { width: 40, height: 40, borderRadius: 13, backgroundColor: colores.verde, alignItems: 'center', justifyContent: 'center' },
  puntosIconoTexto: { fontFamily: fuentes.tituloFuerte, fontSize: 13, color: colores.marino },
  puntosTexto: { flex: 1, fontSize: 14, lineHeight: 19, color: colores.marino },

  pie: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 14, paddingHorizontal: 20, paddingBottom: 20, backgroundColor: colores.blanco, borderTopWidth: 1, borderTopColor: colores.borde },
  agregar: { height: 58, borderRadius: 18, backgroundColor: colores.marino, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  agregarTexto: { color: colores.blanco, fontWeight: '800', fontSize: 17 },
  agregarTotal: { fontFamily: fuentes.titulo, fontSize: 17, color: colores.blanco },
});
