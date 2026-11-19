// Piezas del diseño compartidas por las pantallas (estilo apps de delivery):
// iconos, control de cantidad en cada producto, barra flotante del carrito,
// buscador, títulos de sección y portada de tienda.
import { View, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, TextInput } from './Texto';
import useCarritoStore from '../store/carritoStore';
import { agregarConTienda } from '../services/carrito';
import { useTasaReferencial, precioMonedas } from '../services/moneda';
import { colores, fuentes, logos, sombraFuerte } from '../constants/tema';

export function Icono({ nombre, tam = 22, color = colores.marino, style }) {
  return <Ionicons name={nombre} size={tam} color={color} style={style} />;
}

// Cantidad en el carrito de un producto y cómo sumar/restar desde cualquier
// pantalla (respeta que el pedido es de una sola tienda)
export function useCantidades(nombreTienda) {
  const items = useCarritoStore((s) => s.items);
  const idPV = useCarritoStore((s) => s.idPuntoVenta);
  const cantidadDe = (p) => (String(idPV) === String(p.idPuntoVenta) ? items.find((i) => i.idProducto === p.idProducto)?.Cantidad ?? 0 : 0);
  const mas = (p, c = 1) => agregarConTienda({ ...p, NombreSucursal: p.NombreSucursal || nombreTienda }, c);
  const menos = (p) => { if (cantidadDe(p) > 0) useCarritoStore.getState().quitarItem(p.idProducto); };
  return { cantidadDe, mas, menos };
}

// "+" que al agregar se vuelve "− n +" en el mismo lugar. `flotante`: va
// sobre la foto del producto (con sombra y fondo blanco).
export function ControlCantidad({ cantidad, onMas, onMenos, max = 99, flotante = false, nombre = '' }) {
  if (!cantidad) {
    return (
      <TouchableOpacity style={[ui.masSolo, flotante && ui.flotante]} onPress={onMas} hitSlop={6} accessibilityLabel={`Agregar ${nombre}`}>
        <Icono nombre="add" tam={22} />
      </TouchableOpacity>
    );
  }
  return (
    <View style={[ui.pastilla, flotante && ui.flotante]}>
      <TouchableOpacity style={ui.paso} onPress={onMenos} hitSlop={4} accessibilityLabel={cantidad === 1 ? `Quitar ${nombre}` : 'Quitar uno'}>
        <Icono nombre={cantidad === 1 ? 'trash-outline' : 'remove'} tam={cantidad === 1 ? 17 : 20} />
      </TouchableOpacity>
      <Text style={ui.pasoNum}>{cantidad}</Text>
      <TouchableOpacity style={[ui.paso, cantidad >= max && { opacity: 0.35 }]} disabled={cantidad >= max} onPress={onMas} hitSlop={4} accessibilityLabel="Agregar uno">
        <Icono nombre="add" tam={20} />
      </TouchableOpacity>
    </View>
  );
}

// Barra marina "Ver carrito" que flota abajo mientras hay productos.
// `enLinea`: dentro de otro contenedor (sobre la barra de pestañas) en vez
// de flotar sobre la pantalla.
export function BarraCarrito({ abajo = 16, enLinea = false }) {
  const router = useRouter();
  const tasa = useTasaReferencial();
  const items = useCarritoStore((s) => s.items);
  const tienda = useCarritoStore((s) => s.nombreSucursal);
  const n = items.reduce((a, i) => a + i.Cantidad, 0);
  if (!n) return null;
  const { principal } = precioMonedas(items.reduce((a, i) => a + i.PrecioUSD * i.Cantidad, 0), tasa);
  return (
    <TouchableOpacity style={[ui.carrito, enLinea ? ui.carritoEnLinea : { bottom: abajo }]} activeOpacity={0.92} onPress={() => router.push('/(tabs)/carrito')}
      accessibilityLabel={`Ver carrito, ${n} producto${n === 1 ? '' : 's'}`}>
      <View style={ui.carritoNum}><Text style={ui.carritoNumTexto}>{n > 99 ? '99+' : n}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={ui.carritoTexto}>Ver carrito</Text>
        {tienda ? <Text style={ui.carritoTienda} numberOfLines={1}>{tienda}</Text> : null}
      </View>
      <Text style={ui.carritoTotal}>{principal}</Text>
    </TouchableOpacity>
  );
}

// Buscador gris. Con onPress es un botón que abre otra pantalla.
export function Buscador({ valor, onCambiar, placeholder = 'Buscar', onPress, autoFocus }) {
  if (onPress) {
    return (
      <TouchableOpacity style={ui.buscar} activeOpacity={0.85} onPress={onPress} accessibilityRole="search">
        <Icono nombre="search" tam={20} color={colores.textoSuave} />
        <Text style={ui.buscarFalso} numberOfLines={1}>{placeholder}</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View style={ui.buscar}>
      <Icono nombre="search" tam={20} color={colores.textoSuave} />
      <TextInput style={ui.buscarInput} placeholder={placeholder} placeholderTextColor={colores.textoSuave} value={valor}
        onChangeText={onCambiar} autoFocus={autoFocus} returnKeyType="search" accessibilityLabel={placeholder} />
      {valor ? (
        <TouchableOpacity onPress={() => onCambiar('')} hitSlop={8} accessibilityLabel="Borrar búsqueda">
          <Icono nombre="close-circle" tam={20} color={colores.textoTenue} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// Pantalla para quien no ha iniciado sesión: icono, texto y botón de entrar
export function Invitado({ icono, titulo, texto }) {
  const router = useRouter();
  return (
    <View style={ui.invitado}>
      <View style={ui.invitadoIcono}><Icono nombre={icono} tam={40} /></View>
      <Text style={ui.invitadoTitulo}>{titulo}</Text>
      <Text style={ui.invitadoTexto}>{texto}</Text>
      <TouchableOpacity style={ui.invitadoBoton} onPress={() => router.push('/(auth)/login')}>
        <Text style={ui.invitadoBotonTexto}>Entrar o crear cuenta</Text>
      </TouchableOpacity>
    </View>
  );
}

// sello: etiqueta corta antes del título (p. ej. "PLUS")
export function TituloSeccion({ titulo, sub, accion, onAccion, sello }) {
  return (
    <View style={ui.seccion}>
      <View style={{ flex: 1 }}>
        {sello ? (
          <View style={ui.seccionSelloFila}>
            <View style={ui.seccionSello}><Text style={ui.seccionSelloTexto}>{sello}</Text></View>
            <Text style={[ui.seccionTitulo, { flexShrink: 1 }]}>{titulo}</Text>
          </View>
        ) : <Text style={ui.seccionTitulo}>{titulo}</Text>}
        {sub ? <Text style={ui.seccionSub}>{sub}</Text> : null}
      </View>
      {accion ? (
        <TouchableOpacity style={ui.seccionAccion} onPress={onAccion} hitSlop={8}>
          <Text style={ui.seccionAccionTexto}>{accion}</Text>
          <Icono nombre="arrow-forward" tam={16} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// Las tiendas no tienen foto: portada marina con la gota VIDA. El tono
// cambia por tienda para distinguirlas en las listas.
const TONOS = [['#001034', '#0C2A5E'], ['#0C2A5E', '#1E5A8A'], ['#00213F', '#2A7F9E'], ['#001A4D', '#3F6FB0']];
export function PortadaTienda({ nombre = '', id = 0, alto = 120, radio = 18, children }) {
  const [a, b] = TONOS[Math.abs(Number(id) || 0) % TONOS.length];
  return (
    <LinearGradient colors={[a, b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[ui.portada, { height: alto, borderRadius: radio }]}>
      <View style={[ui.portadaCirculo, { width: alto * 1.4, height: alto * 1.4, borderRadius: alto * 0.7, right: -alto * 0.35, top: -alto * 0.45 }]} />
      <View style={[ui.portadaCirculo2, { width: alto * 0.9, height: alto * 0.9, borderRadius: alto * 0.45, left: -alto * 0.25, bottom: -alto * 0.45 }]} />
      <View style={[ui.portadaLogo, { width: alto * 0.46, height: alto * 0.46, borderRadius: alto * 0.14 }]} accessibilityLabel={nombre}>
        <Image source={logos.simboloClaro} style={{ width: alto * 0.22, height: alto * 0.34 }} resizeMode="contain" />
      </View>
      {children}
    </LinearGradient>
  );
}

const ui = StyleSheet.create({
  masSolo: { width: 36, height: 36, borderRadius: 18, backgroundColor: colores.blanco, borderWidth: 1.5, borderColor: colores.separador, alignItems: 'center', justifyContent: 'center' },
  flotante: { borderWidth: 0, ...sombraFuerte, shadowOpacity: 0.16, elevation: 5 },
  pastilla: { flexDirection: 'row', alignItems: 'center', height: 36, borderRadius: 18, backgroundColor: colores.blanco, borderWidth: 1.5, borderColor: colores.separador },
  paso: { width: 34, height: 36, alignItems: 'center', justifyContent: 'center' },
  pasoNum: { minWidth: 18, textAlign: 'center', fontWeight: '800', fontSize: 15, color: colores.marino },

  carrito: {
    position: 'absolute', left: 16, right: 16, height: 60, borderRadius: 18, backgroundColor: colores.marino,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12, ...sombraFuerte,
  },
  carritoEnLinea: { position: 'relative', left: 0, right: 0 },
  carritoNum: { minWidth: 32, height: 32, paddingHorizontal: 6, borderRadius: 10, backgroundColor: colores.celeste, alignItems: 'center', justifyContent: 'center' },
  carritoNumTexto: { color: colores.marino, fontWeight: '800', fontSize: 14 },
  carritoTexto: { color: colores.blanco, fontWeight: '800', fontSize: 16 },
  carritoTienda: { color: colores.sobreMarino, fontSize: 12 },
  carritoTotal: { fontFamily: fuentes.titulo, fontSize: 17, color: colores.blanco },

  buscar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colores.superficie, borderRadius: 99, paddingHorizontal: 16, height: 48 },
  buscarInput: { flex: 1, fontSize: 15, color: colores.marino, height: 48 },
  buscarFalso: { flex: 1, fontSize: 15, color: colores.textoSuave },

  invitado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  invitadoIcono: { width: 96, height: 96, borderRadius: 48, backgroundColor: colores.celesteClaro, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  invitadoTitulo: { fontFamily: fuentes.tituloFuerte, fontSize: 22, color: colores.marino, textAlign: 'center' },
  invitadoTexto: { fontSize: 15, lineHeight: 21, color: colores.textoSuave, textAlign: 'center', maxWidth: 300 },
  invitadoBoton: { marginTop: 12, height: 54, alignSelf: 'stretch', borderRadius: 16, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  invitadoBotonTexto: { color: colores.blanco, fontWeight: '800', fontSize: 16 },

  seccion: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 20 },
  seccionTitulo: { fontFamily: fuentes.tituloFuerte, fontSize: 20, color: colores.marino },
  seccionSelloFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seccionSello: { backgroundColor: '#F2B705', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  seccionSelloTexto: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  seccionSub: { fontSize: 13, color: colores.textoSuave },
  seccionAccion: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, backgroundColor: colores.superficie, borderRadius: 99, paddingHorizontal: 12 },
  seccionAccionTexto: { fontWeight: '800', fontSize: 13, color: colores.marino },

  portada: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 6 },
  portadaCirculo: { position: 'absolute', backgroundColor: 'rgba(98,198,222,0.18)' },
  portadaCirculo2: { position: 'absolute', backgroundColor: 'rgba(77,173,102,0.18)' },
  portadaLogo: { backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center' },
});
