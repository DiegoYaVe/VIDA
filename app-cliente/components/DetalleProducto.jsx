// Detalle de producto (estilo apps de delivery): foto grande, nombre, precio
// en USD y Bs, descripción, puntos que gana y barra fija con la cantidad y
// el botón. Si el producto ya está en el carrito abre con esa cantidad y el
// botón lo actualiza (o lo quita al bajar a 0).
import { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Modal, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from './Texto';
import { Icono, useCantidades } from './ui';
import useCarritoStore from '../store/carritoStore';
import { absImg } from '../constants/config';
import { useTasaReferencial, precioMonedas, fmtUSD } from '../services/moneda';
import { colores, fuentes, sombraFuerte } from '../constants/tema';

const PUNTOS_POR_DOLAR = 10; // config PuntosPorDolar por defecto

export default function DetalleProducto({ producto, onClose, nombreTienda }) {
  const tasa = useTasaReferencial();
  const { cantidadDe, mas } = useCantidades(nombreTienda);
  const enCarrito = producto ? cantidadDe(producto) : 0;
  const [cantidad, setCantidad] = useState(1);
  useEffect(() => { if (producto) setCantidad(enCarrito || 1); }, [producto?.idProducto, producto?.idPuntoVenta]);
  if (!producto) return null;

  const precio = parseFloat(producto.PrecioPromo ?? producto.PrecioUSD ?? 0);
  const antes = producto.PrecioPromo != null && parseFloat(producto.PrecioUSD) > precio ? fmtUSD(parseFloat(producto.PrecioUSD)) : null;
  const stock = parseFloat(producto.StockDisponible ?? 0);
  const maximo = stock > 0 ? Math.floor(stock) : 99;
  const { principal, secundario } = precioMonedas(precio, tasa);
  const marcaVida = /\bvida\b/i.test(producto.Nombre || '');
  const img = absImg(producto.ImagenProducto);
  const total = precio * cantidad;
  const minimo = enCarrito ? 0 : 1;

  const confirmar = () => {
    if (enCarrito) useCarritoStore.getState().fijarCantidad(producto.idProducto, cantidad);
    else mas(producto, cantidad);
    onClose();
  };
  const textoBoton = !enCarrito ? `Agregar ${cantidad}` : cantidad === 0 ? 'Quitar del carrito' : cantidad === enCarrito ? 'Listo' : 'Actualizar carrito';

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <View style={styles.foto}>
            {img ? <Image source={{ uri: img }} style={styles.fotoImg} resizeMode="contain" />
              : <Icono nombre="cube-outline" tam={80} color={colores.textoTenue} />}
            <SafeAreaView edges={['top']} style={styles.fotoBotones}>
              <TouchableOpacity style={styles.redondo} onPress={onClose} accessibilityLabel="Cerrar"><Icono nombre="close" tam={24} /></TouchableOpacity>
            </SafeAreaView>
          </View>

          <View style={styles.cuerpo}>
            <View style={styles.sellos}>
              {marcaVida ? <View style={styles.selloMarca}><Text style={styles.selloMarcaTexto}>Marca VIDA</Text></View> : null}
              {producto.PromoBadge ? <View style={[styles.sello, { backgroundColor: colores.verdeClaro }]}><Text style={[styles.selloTexto, { color: colores.verdeTexto }]}>{producto.PromoBadge}</Text></View> : null}
              {producto.NombreCategoria ? <View style={styles.sello}><Text style={styles.selloTexto}>{producto.NombreCategoria}</Text></View> : null}
            </View>
            <Text style={styles.nombre}>{producto.Nombre}</Text>
            <View style={styles.precioFila}>
              <Text style={styles.precio}>{principal}</Text>
              {antes ? <Text style={styles.antes}>{antes}</Text> : null}
            </View>
            {secundario ? <Text style={styles.precioSec}>{secundario} · tasa BCV de hoy</Text> : null}
            {producto.Descripcion ? <Text style={styles.descripcion}>{producto.Descripcion}</Text> : null}

            {stock > 0 && stock <= 10 ? (
              <View style={styles.aviso}>
                <Icono nombre="alert-circle" tam={18} color={colores.aviso} />
                <Text style={styles.avisoTexto}>Quedan {Math.floor(stock)} en {producto.NombreSucursal || 'la tienda'}</Text>
              </View>
            ) : null}

            <View style={styles.puntos}>
              <View style={styles.puntosIcono}><Icono nombre="gift" tam={20} color={colores.marino} /></View>
              <Text style={styles.puntosTexto}>
                Ganas <Text style={{ fontWeight: '800' }}>{Math.round(Math.max(1, cantidad) * precio * PUNTOS_POR_DOLAR).toLocaleString('es-VE')} puntos VIDA</Text> con esta compra
              </Text>
            </View>
          </View>
        </ScrollView>

        <SafeAreaView edges={['bottom']} style={styles.pie}>
          <View style={styles.stepper}>
            <TouchableOpacity style={[styles.paso, cantidad <= minimo && { opacity: 0.3 }]} disabled={cantidad <= minimo}
              onPress={() => setCantidad((c) => Math.max(minimo, c - 1))} accessibilityLabel="Quitar uno">
              <Icono nombre="remove" tam={22} />
            </TouchableOpacity>
            <Text style={styles.cantidad}>{cantidad}</Text>
            <TouchableOpacity style={[styles.paso, cantidad >= maximo && { opacity: 0.3 }]} disabled={cantidad >= maximo}
              onPress={() => setCantidad((c) => Math.min(maximo, c + 1))} accessibilityLabel="Agregar uno">
              <Icono nombre="add" tam={22} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.agregar, enCarrito && cantidad === 0 && { backgroundColor: colores.error }]} onPress={confirmar}>
            <Text style={styles.agregarTexto} numberOfLines={1}>{textoBoton}</Text>
            {cantidad > 0 ? <Text style={styles.agregarTotal}>{fmtUSD(total)}</Text> : null}
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.blanco },
  foto: { height: 340, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colores.separador },
  fotoImg: { width: '78%', height: '82%' },
  fotoBotones: { position: 'absolute', top: 0, left: 16, right: 16, flexDirection: 'row', paddingTop: 12 },
  redondo: { width: 44, height: 44, borderRadius: 22, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center', ...sombraFuerte, shadowOpacity: 0.12 },

  cuerpo: { paddingTop: 20, paddingHorizontal: 20, gap: 8 },
  sellos: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  selloMarca: { backgroundColor: colores.marino, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  selloMarcaTexto: { color: colores.blanco, fontSize: 12, fontWeight: '800' },
  sello: { backgroundColor: colores.superficie, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  selloTexto: { color: colores.marino, fontSize: 12, fontWeight: '700' },
  nombre: { fontFamily: fuentes.tituloFuerte, fontSize: 26, lineHeight: 31, color: colores.marino, marginTop: 4 },
  precioFila: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  precio: { fontFamily: fuentes.titulo, fontSize: 22, color: colores.marino },
  antes: { fontSize: 15, color: colores.textoTenue, textDecorationLine: 'line-through' },
  precioSec: { fontSize: 14, color: colores.textoSuave, marginTop: -4 },
  descripcion: { fontSize: 15, lineHeight: 22, color: colores.textoSuave, marginTop: 6 },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, backgroundColor: colores.avisoClaro, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  avisoTexto: { fontSize: 13, fontWeight: '700', color: colores.aviso },

  puntos: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, borderWidth: 1, borderColor: colores.separador, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14 },
  puntosIcono: { width: 40, height: 40, borderRadius: 20, backgroundColor: colores.verdeClaro, alignItems: 'center', justifyContent: 'center' },
  puntosTexto: { flex: 1, fontSize: 14, lineHeight: 19, color: colores.marino },

  pie: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colores.blanco, borderTopWidth: 1, borderTopColor: colores.separador },
  stepper: { flexDirection: 'row', alignItems: 'center', height: 56, borderRadius: 16, backgroundColor: colores.superficie, paddingHorizontal: 4 },
  paso: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  cantidad: { minWidth: 26, textAlign: 'center', fontFamily: fuentes.titulo, fontSize: 18, color: colores.marino },
  agregar: { flex: 1, height: 56, borderRadius: 16, backgroundColor: colores.marino, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, gap: 8 },
  agregarTexto: { color: colores.blanco, fontWeight: '800', fontSize: 16, flexShrink: 1 },
  agregarTotal: { fontFamily: fuentes.titulo, fontSize: 16, color: colores.blanco },
});
