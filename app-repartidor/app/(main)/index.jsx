import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, Easing, Vibration, Alert, ActivityIndicator, ScrollView, Dimensions, Platform, Image, Linking, Modal } from 'react-native';
import { Text } from '../../components/Texto';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import api from '../../services/api';
import { infoCobro, fmtUSD } from '../../services/cobro';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useLocation } from '../../hooks/useLocation';
import MapaRuta from '../../components/MapaRuta';
import { metricasRuta } from '../../components/estiloMapa';
import { iniciarUbicacionBackground, detenerUbicacionBackground } from '../../services/backgroundLocation';
import useAuthStore from '../../store/authStore';
import usePedidoStore from '../../store/pedidoStore';
import { colores, fuentes, logos, radios } from '../../constants/tema';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Máximo local de pedidos simultáneos (el backend valida el real por config)
const MAX_PEDIDOS = 3;
const SEGUNDOS_OFERTA = 60;

const STATUS_LABELS = {
  REPARTIDOR_ASIGNADO: 'Asignado',
  IR_A_SUCURSAL: 'Yendo a la tienda',
  EN_SUCURSAL: 'Listo para recoger',
  EN_CAMINO: 'En camino',
  ENTREGADO: 'Entregado',
};

// Espejo de las reglas del backend (TRANSICIONES_DELIVERY y LIBERABLES en
// controllers/delivery/repartidorApp.js): antes de recoger en la tienda el
// pedido se libera para que lo tome otro; una vez recogido ya no se le puede
// pasar a nadie y la única salida es cancelarlo con motivo.
const LIBERABLES  = ['REPARTIDOR_ASIGNADO', 'IR_A_SUCURSAL'];
const CANCELABLES = ['EN_SUCURSAL', 'EN_CAMINO'];

const MOTIVOS_CANCELACION = [
  'Cliente ausente',
  'Dirección incorrecta o no existe',
  'Cliente no responde el teléfono',
  'Cliente rechazó el pedido',
  'Problema con el vehículo',
];

// Siguiente paso de cada estado (un pedido recién aceptado llega sin Status
// o como REPARTIDOR_ASIGNADO)
const SIGUIENTE = {
  REPARTIDOR_ASIGNADO: { label: 'Voy a la tienda',        nextStatus: 'IR_A_SUCURSAL' },
  IR_A_SUCURSAL:       { label: 'Llegué a la tienda',     nextStatus: 'EN_SUCURSAL' },
  EN_SUCURSAL:         { label: 'Ya recogí el pedido',    nextStatus: 'EN_CAMINO' },
  EN_CAMINO:           { label: 'Entregar al cliente',    nextStatus: 'ENTREGADO' },
};

const km = (n) => `${Number(n).toLocaleString('es-VE', { maximumFractionDigits: 1 })} km`;
const decimal1 = (n) => Number(n).toLocaleString('es-VE', { maximumFractionDigits: 1 });
const primerNombre = (s) => String(s || '').trim().split(' ')[0];

// "2,4 km · 9 min" para la pastilla del mapa
function distanciaTiempo(p) {
  const partes = [];
  if (p?.DistanciaKm != null) partes.push(km(p.DistanciaKm));
  if (p?.MinutosRestantes != null && p.MinutosRestantes >= 0) partes.push(`${p.MinutosRestantes} min`);
  return partes.join(' · ');
}

// ---------- Interruptor En línea ----------
function Interruptor({ valor, cargando, onCambiar }) {
  return (
    <TouchableOpacity
      onPress={() => onCambiar(!valor)} disabled={cargando}
      accessibilityRole="switch" accessibilityState={{ checked: valor }}
      accessibilityLabel={valor ? 'Desconectarme' : 'Conectarme'}
      style={[styles.interruptor, valor ? styles.interruptorOn : styles.interruptorOff]}
    >
      {cargando
        ? <ActivityIndicator size="small" color={colores.blanco} style={{ marginHorizontal: 4 }} />
        : <View style={styles.interruptorBola} />}
    </TouchableOpacity>
  );
}

// ---------- Parada A / B ----------
function Parada({ letra, titulo, detalle, recoger, lineas = 1 }) {
  return (
    <View style={styles.parada}>
      <View style={[styles.paradaLetra, recoger ? styles.paradaRecoger : styles.paradaEntregar]}>
        <Text style={[styles.paradaLetraTexto, !recoger && { color: colores.blanco }]}>{letra}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.paradaTitulo} numberOfLines={lineas}>{titulo}</Text>
        {detalle ? <Text style={styles.paradaDetalle} numberOfLines={2}>{detalle}</Text> : null}
      </View>
    </View>
  );
}

// ---------- Botón principal (píldora marina con flecha) ----------
function BotonPrincipal({ texto, onPress, cargando, deshabilitado }) {
  return (
    <TouchableOpacity style={[styles.pildora, (cargando || deshabilitado) && styles.btnDisabled]} onPress={onPress} disabled={cargando || deshabilitado}>
      <View style={styles.pildoraFlecha}>
        {cargando ? <ActivityIndicator color={colores.marino} /> : <Ionicons name="arrow-forward" size={22} color={colores.marino} />}
      </View>
      <Text style={styles.pildoraTexto}>{texto}</Text>
    </TouchableOpacity>
  );
}

// Paradas de una oferta para dibujar su ruta (si trae coordenadas)
function paradasOferta(p) {
  const r = [];
  if (p?.LatSucursal != null && p?.LonSucursal != null) r.push({ tipo: 'PICKUP', lat: p.LatSucursal, lon: p.LonSucursal });
  if (p?.UbicacionEntregaLat != null && p?.UbicacionEntregaLon != null) r.push({ tipo: 'ENTREGA', lat: p.UbicacionEntregaLat, lon: p.UbicacionEntregaLon });
  return r;
}

// ---------- Pedido nuevo (oferta) ----------
function NuevoPedidoModal({ pedido, pedidosActivos, comisionPct, ubicacion, onAceptar, onRechazar, aceptando }) {
  const cobro = infoCobro(pedido);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const progreso = useRef(new Animated.Value(1)).current;
  const [segundos, setSegundos] = useState(SEGUNDOS_OFERTA);

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 10, useNativeDriver: true }).start();
    Animated.timing(progreso, { toValue: 0, duration: SEGUNDOS_OFERTA * 1000, easing: Easing.linear, useNativeDriver: false }).start();
    const intervalo = setInterval(() => {
      setSegundos((s) => {
        if (s <= 1) { clearInterval(intervalo); onRechazar(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalo);
  }, []);

  const total = Number(pedido.TotalUSD ?? pedido.total ?? pedido.Total ?? 0);
  const ganancia = comisionPct > 0 ? Math.round(total * comisionPct) / 100 : null;
  // Distancia y tiempo de la ruta: tú → tienda → cliente (por calles)
  const [ruta, setRuta] = useState(null);
  useEffect(() => {
    const yo = ubicacion?.Latitud != null ? { lat: Number(ubicacion.Latitud), lon: Number(ubicacion.Longitud) } : null;
    const paradas = paradasOferta(pedido).map((p) => ({ lat: Number(p.lat), lon: Number(p.lon) }));
    let vivo = true;
    metricasRuta([yo, ...paradas].filter(Boolean)).then((m) => { if (vivo && m) setRuta({ ...m, conYo: !!yo }); });
    return () => { vivo = false; };
  }, [pedido?.idPedido]);
  const distancia = ruta ? ruta.km : (pedido.DistanciaKm ?? null);
  const minutos = ruta ? ruta.min + 3 : (pedido.MinutosRestantes ?? null); // + ~3 min en la tienda
  const tramoTienda = ruta?.conYo ? ruta.tramos[0] : null;
  const tramoCliente = ruta ? ruta.tramos[ruta.conYo ? 1 : 0] : null;
  const datos = [
    { etiqueta: 'Distancia', valor: distancia != null ? km(distancia) : '—' },
    { etiqueta: 'Tiempo', valor: minutos != null ? `${minutos} min` : '—' },
    { etiqueta: 'Cobro', valor: cobro.corto },
  ];
  const direccion = pedido.direccion || pedido.DireccionEntrega || '';
  const sinCalle = !direccion || /^ubicaci[oó]n en mapa$/i.test(direccion.trim());
  const [calle, ...resto] = (sinCalle ? 'la ubicación del cliente' : direccion).split(',');
  const ancho = progreso.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={[modalStyles.overlay, { backgroundColor: '#DDEFF5' }]}>
      {/* Mapa a pantalla completa: tú → tienda → cliente */}
      <View style={StyleSheet.absoluteFill}>
        <MapaRuta ubicacion={ubicacion} paradas={paradasOferta(pedido)} margenAbajo={460} interactivo={false} numerar={false} />
      </View>
      <Animated.View style={[modalStyles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={modalStyles.ofertaCabecera}>
          <View style={{ flex: 1 }}>
            <Text style={modalStyles.ofertaEtiqueta}>{pedidosActivos > 0 ? 'Pedido extra en tu ruta' : 'Pedido nuevo cerca de ti'}</Text>
            <Text style={modalStyles.ofertaGanas}>{ganancia != null ? `Ganas ${fmtUSD(ganancia)}` : fmtUSD(total)}</Text>
          </View>
          <View style={modalStyles.reloj} accessibilityLabel={`${segundos} segundos para aceptar`}>
            <Text style={modalStyles.relojTexto}>{segundos}s</Text>
          </View>
        </View>
        <View style={modalStyles.barraFondo}><Animated.View style={[modalStyles.barra, { width: ancho }]} /></View>

        <View style={modalStyles.datos}>
          {datos.map(d => (
            <View key={d.etiqueta} style={modalStyles.dato}>
              <Text style={modalStyles.datoEtiqueta}>{d.etiqueta}</Text>
              <Text style={modalStyles.datoValor} numberOfLines={1} adjustsFontSizeToFit>{d.valor}</Text>
            </View>
          ))}
        </View>

        <View style={{ gap: 10 }}>
          <Parada letra="A" recoger lineas={2} titulo={`Recoger en ${pedido.sucursal || pedido.NombreSucursal || 'la tienda'}`}
            detalle={[pedido.DireccionSucursal?.trim(), tramoTienda ? `a ${km(tramoTienda.km)} de ti` : null].filter(Boolean).join(' · ') || null} />
          <Parada letra="B" lineas={2} titulo={`Entregar en ${calle.trim()}`}
            detalle={[resto.join(',').trim(), tramoCliente ? `${km(tramoCliente.km)} desde la tienda` : null, (cobro.cobrar || cobro.tarjeta) && cobro.monto ? `cobrar ${cobro.monto}` : null].filter(Boolean).join(' · ')} />
        </View>

        {cobro.cambio ? <Text style={modalStyles.cambio}>Lleva cambio: {cobro.cambio}</Text> : null}

        {pedidosActivos > 0 && (
          <Text style={modalStyles.extra}>Ya llevas {pedidosActivos} pedido{pedidosActivos !== 1 ? 's' : ''}: este se suma a tu ruta.</Text>
        )}

        <View style={modalStyles.acciones}>
          <TouchableOpacity style={modalStyles.btnPasar} onPress={onRechazar} disabled={aceptando}>
            <Text style={modalStyles.btnPasarTexto}>Pasar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[modalStyles.btnAceptar, aceptando && styles.btnDisabled]} onPress={onAceptar} disabled={aceptando}>
            {aceptando ? <ActivityIndicator color={colores.blanco} /> : <Text style={modalStyles.btnAceptarTexto}>Aceptar pedido</Text>}
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

// Línea bajo el monto a cobrar: equivalencia en Bs o desglose del IGTF
function subCobro(pedido, cobro) {
  const c = pedido?.Cobro;
  if (cobro.cobrar && c?.Moneda === 'VES') return `Equivale a ${fmtUSD(c.TotalUSD)} · tasa del pedido · no aceptes otro monto`;
  if (cobro.tarjeta) return cobro.detalle ? `${cobro.detalle} · pasa la tarjeta por este monto` : 'Pasa la tarjeta por este monto';
  return cobro.detalle ? `${cobro.detalle} · no aceptes otro monto` : 'No aceptes otro monto';
}

// ---------- Entregar (cobro, productos, foto y confirmación) ----------
function EntregaModal({ pedido, cargando, onConfirmar, onProblema, onCerrar }) {
  const cobro = infoCobro(pedido);
  const [recibido, setRecibido] = useState(!cobro.cobrar && !cobro.tarjeta);
  const [foto, setFoto] = useState(null);
  const cliente = pedido.NombreCliente || pedido.cliente;
  const direccion = pedido.direccion || pedido.DireccionEntrega;

  const tomarFoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Sin permiso de cámara', 'Puedes confirmar la entrega sin foto.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!res.canceled && res.assets?.[0]) setFoto(res.assets[0]);
  };

  return (
    <View style={[modalStyles.overlay, { justifyContent: 'flex-start' }]}>
      <SafeAreaView edges={['top', 'bottom']} style={entregaStyles.pantalla}>
        <ScrollView contentContainerStyle={entregaStyles.contenido} showsVerticalScrollIndicator={false}>
          <View style={entregaStyles.cabecera}>
            <TouchableOpacity style={entregaStyles.volver} onPress={onCerrar} accessibilityLabel="Volver" disabled={cargando}>
              <Ionicons name="chevron-back" size={20} color={colores.marino} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={entregaStyles.titulo}>Entregar #{pedido.idPedido}</Text>
              <Text style={entregaStyles.sub} numberOfLines={1}>{[cliente, direccion].filter(Boolean).join(' · ')}</Text>
            </View>
            {pedido.TelefonoCliente ? (
              <TouchableOpacity style={entregaStyles.llamar} onPress={() => Linking.openURL(`tel:${pedido.TelefonoCliente}`)} accessibilityLabel="Llamar al cliente">
                <Ionicons name="call-outline" size={20} color={colores.marino} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={entregaStyles.cobro}>
            {cobro.cobrar || cobro.tarjeta ? (
              <>
                <Text style={entregaStyles.cobroEtiqueta}>{cobro.tarjeta ? 'Cobra con el punto de venta' : cobro.titulo === 'Efectivo combinado' ? 'Cobra en efectivo: dólares + bolívares' : 'Cobra al cliente en efectivo'}</Text>
                <Text style={entregaStyles.cobroMonto} numberOfLines={1} adjustsFontSizeToFit>{cobro.monto || 'Confirma con la tienda'}</Text>
                <Text style={entregaStyles.cobroEtiqueta}>{subCobro(pedido, cobro)}</Text>
                {cobro.cambio ? (
                  <View style={entregaStyles.cambio}><Text style={entregaStyles.cambioTexto}>Entrega de cambio: {cobro.cambio}</Text></View>
                ) : null}
              </>
            ) : (
              <>
                <Text style={entregaStyles.cobroEtiqueta}>{cobro.titulo}</Text>
                <Text style={[entregaStyles.cobroMonto, { fontSize: 26 }]}>No cobres nada</Text>
                <Text style={entregaStyles.cobroEtiqueta}>{cobro.detalle}</Text>
              </>
            )}
          </View>

          {pedido.items?.length > 0 && (
            <View style={entregaStyles.items}>
              {pedido.items.map((it, i) => (
                <View key={i} style={[entregaStyles.item, i < pedido.items.length - 1 && entregaStyles.itemBorde]}>
                  <Text style={entregaStyles.itemNombre} numberOfLines={1}>{it.Nombre}</Text>
                  <Text style={entregaStyles.itemCant}>×{decimal1(it.Cantidad)}</Text>
                </View>
              ))}
            </View>
          )}

          {pedido.NotasCliente ? (
            <View style={entregaStyles.nota}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={colores.marino} />
              <Text style={entregaStyles.notaTexto}>{pedido.NotasCliente}</Text>
            </View>
          ) : null}

          {(cobro.cobrar || cobro.tarjeta) && (
            <TouchableOpacity style={[entregaStyles.check, recibido && entregaStyles.checkOn]} onPress={() => setRecibido(v => !v)}
              accessibilityRole="checkbox" accessibilityState={{ checked: recibido }}>
              <Ionicons name={recibido ? 'checkbox' : 'square-outline'} size={26} color={colores.marino} />
              <Text style={entregaStyles.checkTexto}>
                {cobro.tarjeta ? `El punto aprobó ${cobro.monto || 'el pago'}` : `Recibí ${cobro.monto || 'el pago'} del cliente${cobro.cambio ? ` y le di ${cobro.cambio} de cambio` : ''}`}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={entregaStyles.foto} onPress={tomarFoto} disabled={cargando}>
            {foto ? (
              <>
                <Image source={{ uri: foto.uri }} style={entregaStyles.fotoMini} />
                <Text style={entregaStyles.fotoTitulo}>Foto lista · toca para repetirla</Text>
              </>
            ) : (
              <>
                <Ionicons name="camera-outline" size={28} color={colores.marino} />
                <Text style={entregaStyles.fotoTitulo}>Foto de la entrega</Text>
                <Text style={entregaStyles.fotoSub}>Paquete en la puerta o en manos del cliente</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>

        <View style={entregaStyles.pie}>
          <TouchableOpacity style={[entregaStyles.confirmar, (!recibido || cargando) && styles.btnDisabled]}
            onPress={() => onConfirmar(foto)} disabled={!recibido || cargando}>
            {cargando ? <ActivityIndicator color={colores.blanco} /> : <Text style={entregaStyles.confirmarTexto}>Confirmar entrega</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={entregaStyles.problema} onPress={onProblema} disabled={cargando}>
            <Text style={entregaStyles.problemaTexto}>Tengo un problema con este pedido</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ---------- Motivo de cancelación ----------
// Modal propio en vez de Alert: el AlertDialog de Android solo admite 3
// botones y aquí hay 5 motivos.
function MotivoCancelacionModal({ pedido, loading, onConfirmar, onCerrar }) {
  const [sel, setSel] = useState(null);
  return (
    <View style={modalStyles.overlay}>
      <View style={motivoStyles.sheet}>
        <Text style={motivoStyles.title}>Cancelar pedido #{pedido.idPedido}</Text>
        <Text style={motivoStyles.sub}>
          Ya recogiste este pedido, así que no se le puede pasar a otro repartidor.
          Indica por qué no se puede entregar: queda registrado.
        </Text>
        {MOTIVOS_CANCELACION.map((m) => (
          <TouchableOpacity key={m} style={[motivoStyles.opcion, sel === m && motivoStyles.opcionSel]} onPress={() => setSel(m)} disabled={loading}>
            <Ionicons name={sel === m ? 'radio-button-on' : 'radio-button-off'} size={20} color={sel === m ? colores.error : colores.textoTenue} />
            <Text style={[motivoStyles.opcionText, sel === m && motivoStyles.opcionTextSel]}>{m}</Text>
          </TouchableOpacity>
        ))}
        <View style={motivoStyles.actions}>
          <TouchableOpacity style={motivoStyles.btnVolver} onPress={onCerrar} disabled={loading}>
            <Text style={motivoStyles.btnVolverText}>Volver</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[motivoStyles.btnConfirmar, (!sel || loading) && styles.btnDisabled]} onPress={() => sel && onConfirmar(sel)} disabled={!sel || loading}>
            {loading ? <ActivityIndicator color={colores.blanco} /> : <Text style={motivoStyles.btnConfirmarText}>Cancelar pedido</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ---------- Pantalla principal ----------
export default function IndexScreen() {
  // Estado global compartido con las demás pestañas
  const disponible     = usePedidoStore((s) => s.disponible);
  const pedidosActivos = usePedidoStore((s) => s.pedidosActivos);
  const rutaParadas    = usePedidoStore((s) => s.rutaParadas);
  const setDisponible     = usePedidoStore((s) => s.setDisponible);
  const setPedidosActivos = usePedidoStore((s) => s.setPedidosActivos);
  const setRutaParadas    = usePedidoStore((s) => s.setRutaParadas);
  const actualizarPedido  = usePedidoStore((s) => s.actualizarPedido);
  const quitarPedido      = usePedidoStore((s) => s.quitarPedido);
  const repartidor     = useAuthStore((s) => s.repartidor);
  const setRepartidor  = useAuthStore((s) => s.setRepartidor);

  const [nuevoPedido,   setNuevoPedido]   = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toggling,      setToggling]      = useState(false);
  const [idPedidoSel,   setIdPedidoSel]   = useState(null);
  const [pedidoACancelar, setPedidoACancelar] = useState(null);
  const [pedidoAEntregar, setPedidoAEntregar] = useState(null);
  const [hoy, setHoy] = useState(null); // comisión, entregas, calificación y % de comisión
  // Mientras se toca el mapa la pantalla no se desliza: así el mapa recibe el
  // pellizco para acercar y el arrastre para moverse
  const [tocandoMapa, setTocandoMapa] = useState(false);

  const { ubicacion } = useLocation(disponible);

  const pedidoSel = useMemo(() => {
    if (!pedidosActivos.length) return null;
    return pedidosActivos.find((p) => String(p.idPedido) === String(idPedidoSel)) ?? pedidosActivos[0];
  }, [pedidosActivos, idPedidoSel]);

  const cargarHoy = useCallback(async () => {
    try { setHoy((await api.get('/delivery/repartidor/ganancias', { params: { periodo: 'hoy' } })).data); } catch (_) {}
  }, []);

  // Pedidos activos + ruta desde el backend
  const cargarActivos = useCallback(async () => {
    try {
      const res = await api.get('/delivery/repartidor/pedidos-activos');
      const pedidos = Array.isArray(res.data) ? res.data : (res.data?.pedidos || []);
      setPedidosActivos(pedidos);
      if (pedidos.length > 0) {
        setDisponible(true);
        try {
          const rutaRes = await api.get('/delivery/repartidor/ruta');
          setRutaParadas(rutaRes.data?.paradas || []);
        } catch (_) {}
      } else {
        setRutaParadas([]);
      }
    } catch (_) {}
  }, []);

  useEffect(() => { cargarActivos(); cargarHoy(); }, []);

  // Sesiones guardadas antes de que el login guardara nombre e id: se completan
  useEffect(() => {
    if (repartidor?.Nombre && repartidor?.idRepartidor) return;
    api.get('/delivery/repartidor/perfil')
      .then(r => setRepartidor({ ...repartidor, idRepartidor: repartidor?.idRepartidor ?? r.data.idRepartidor, Nombre: r.data.Nombre }))
      .catch(() => {});
  }, [repartidor?.Nombre, repartidor?.idRepartidor]);

  // WebSocket: pedidos nuevos y ruta recalculada en tiempo real
  useWebSocket((msg) => {
    const tipo = msg.tipo || msg.type;
    if (tipo === 'nuevo_pedido_disponible') {
      if (usePedidoStore.getState().pedidosActivos.length >= MAX_PEDIDOS) return;
      // El despacho es dirigido: si el mensaje trae destinatarios y yo no
      // estoy (fuera del radio de búsqueda), lo ignoro
      const objetivo = msg.repartidores;
      if (Array.isArray(objetivo) && objetivo.length > 0 &&
          !objetivo.map(String).includes(String(repartidor?.idRepartidor))) return;
      const pedido = msg.pedido || msg.data || msg;
      Vibration.vibrate([0, 400, 200, 400, 200, 400]);
      setNuevoPedido(pedido);
    }
    if (tipo === 'ruta_actualizada' && String(msg.idRepartidor) === String(repartidor?.idRepartidor)) {
      setRutaParadas(msg.paradas || []);
      (msg.etas || []).forEach((e) => {
        actualizarPedido(e.idPedido, {
          OrdenRuta: e.OrdenRuta, ETAEntrega: e.ETAEntrega,
          MinutosRestantes: e.MinutosRestantes, DistanciaKm: e.DistanciaKm,
        });
      });
    }
  });

  // Sondeo cada 10 s por si el WebSocket no llegó (mientras haya cupo)
  useEffect(() => {
    if (!disponible || pedidosActivos.length >= MAX_PEDIDOS) return;
    const intervalo = setInterval(async () => {
      try {
        const res = await api.get('/delivery/repartidor/pedidos-disponibles');
        const lista = Array.isArray(res.data) ? res.data : [];
        const nuevos = lista.filter((p) => !pedidosActivos.some((a) => String(a.idPedido) === String(p.idPedido)));
        if (nuevos.length > 0 && !nuevoPedido) {
          Vibration.vibrate([0, 400, 200, 400, 200, 400]);
          setNuevoPedido(nuevos[0]);
        }
      } catch (_) {}
    }, 10000);
    return () => clearInterval(intervalo);
  }, [disponible, pedidosActivos, nuevoPedido]);

  // Conectarse / desconectarse
  const handleToggle = useCallback(async (valor) => {
    setToggling(true);
    try {
      if (valor) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permiso requerido', 'Necesitamos tu ubicación para mostrarte pedidos cercanos.');
          return;
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        await api.post('/delivery/repartidor/disponible', { disponible: true, Latitud: loc.coords.latitude, Longitud: loc.coords.longitude });
        iniciarUbicacionBackground();
      } else {
        await api.post('/delivery/repartidor/disponible', { disponible: false });
        detenerUbicacionBackground();
      }
      setDisponible(valor);
    } catch (e) {
      Alert.alert('No se pudo cambiar tu estado', e.response?.data?.error || e.message || 'Revisa tu conexión');
    } finally { setToggling(false); }
  }, []);

  const handleAceptarPedido = async () => {
    if (!nuevoPedido) return;
    setActionLoading(true);
    try {
      const res = await api.post('/delivery/repartidor/aceptar', { idPedido: nuevoPedido.idPedido || nuevoPedido.id });
      setNuevoPedido(null);
      if (res.data?.ruta?.paradas) setRutaParadas(res.data.ruta.paradas);
      await cargarActivos();
    } catch (e) {
      Alert.alert('No se pudo aceptar', e.response?.data?.error || e.message);
      setNuevoPedido(null);
    } finally {
      setActionLoading(false);
    }
  };

  const doCambiarStatus = async (pedido, nuevoStatus, motivo) => {
    setActionLoading(true);
    const idPedido = pedido.idPedido || pedido.id;
    try {
      await api.post('/delivery/repartidor/status-pedido', { idPedido, nuevoStatus, motivo });
      if (nuevoStatus === 'ENTREGADO' || nuevoStatus === 'CANCELADO') {
        quitarPedido(idPedido);
        setIdPedidoSel(null);
        cargarActivos();
        cargarHoy();
      } else {
        actualizarPedido(idPedido, { Status: nuevoStatus });
      }
      return true;
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || e.message);
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  // La entrega pasa por su propia pantalla (cobro, productos, foto)
  const handleSiguiente = (pedido, nuevoStatus) => {
    if (!pedido) return;
    if (nuevoStatus === 'ENTREGADO') { setPedidoAEntregar(pedido); return; }
    doCambiarStatus(pedido, nuevoStatus);
  };

  const confirmarEntrega = async (foto) => {
    const pedido = pedidoAEntregar;
    if (!pedido) return;
    if (foto) {
      const idPedido = pedido.idPedido || pedido.id;
      const fd = new FormData();
      fd.append('file', { uri: foto.uri, name: `entrega_${idPedido}.jpg`, type: foto.mimeType || 'image/jpeg' });
      try {
        await api.post(`/delivery/repartidor/pedido/${idPedido}/evidencia`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } catch { /* la foto no bloquea la entrega */ }
    }
    if (await doCambiarStatus(pedido, 'ENTREGADO')) setPedidoAEntregar(null);
  };

  const doCancelarConMotivo = async (motivo) => {
    const pedido = pedidoACancelar;
    if (!pedido) return;
    // Si falla se deja el modal abierto con el motivo elegido para reintentar
    if (await doCambiarStatus(pedido, 'CANCELADO', motivo)) { setPedidoACancelar(null); setPedidoAEntregar(null); }
  };

  // Liberar: el pedido vuelve a la búsqueda y lo toma otro repartidor. El
  // backend no se lo vuelve a ofrecer a quien lo soltó.
  const handleLiberar = (pedido) => {
    Alert.alert(
      'Liberar pedido',
      `El pedido #${pedido.idPedido} vuelve a la búsqueda para que lo tome otro repartidor. A ti no se te va a volver a ofrecer.`,
      [{ text: 'No', style: 'cancel' }, { text: 'Sí, liberar', style: 'destructive', onPress: () => doLiberar(pedido) }],
    );
  };

  const doLiberar = async (pedido) => {
    setActionLoading(true);
    const idPedido = pedido.idPedido || pedido.id;
    try {
      await api.post('/delivery/repartidor/liberar', { idPedido });
      quitarPedido(idPedido);
      setIdPedidoSel(null);
      cargarActivos();
    } catch (e) {
      Alert.alert('No se pudo liberar', e.response?.data?.error || e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const statusSel     = pedidoSel?.Status || 'REPARTIDOR_ASIGNADO';
  const siguiente     = pedidoSel ? SIGUIENTE[statusSel] : null;
  const puedeLiberar  = !!pedidoSel && LIBERABLES.includes(statusSel);
  const puedeCancelar = !!pedidoSel && CANCELABLES.includes(statusSel);
  const comisionPct   = Number(hoy?.ComisionPctEfectiva ?? 0);

  const nombre = primerNombre(repartidor?.Nombre) || 'repartidor';
  const estado = !disponible
    ? 'Desconectado'
    : pedidosActivos.length > 0
      ? `En ruta · ${pedidosActivos.length} pedido${pedidosActivos.length !== 1 ? 's' : ''}`
      : `En línea · ${hoy?.Entregas ?? 0} entrega${hoy?.Entregas === 1 ? '' : 's'}`;

  const kpis = [
    { etiqueta: 'Ganado hoy', valor: fmtUSD(hoy?.Comision) },
    { etiqueta: 'Entregas', valor: String(hoy?.Entregas ?? 0) },
    { etiqueta: 'Calificación', valor: hoy?.Calificacion != null ? decimal1(hoy.Calificacion) : '—' },
  ];

  const cobroSel = pedidoSel ? infoCobro(pedidoSel) : null;
  const comisionSel = pedidoSel && comisionPct > 0 ? Math.round(Number(pedidoSel.TotalUSD || 0) * comisionPct) / 100 : null;
  const etiquetaMapa = distanciaTiempo(pedidoSel);
  // Navegación en Google Maps hacia la siguiente parada de la ruta
  const navegarSiguiente = () => {
    const s = (rutaParadas || []).find((p) => p.lat != null && p.lon != null);
    if (s) Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}&travelmode=driving`).catch(() => {});
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.contenido} showsVerticalScrollIndicator={false} scrollEnabled={!tocandoMapa}>
        {/* Encabezado */}
        <View style={styles.cabecera}>
          <View style={styles.cabeceraIzq}>
            <View style={styles.simbolo}>
              <Image source={logos.simboloClaro} style={styles.simboloImg} resizeMode="contain" accessibilityLabel="VIDA" />
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.hola}>Hola, {nombre}</Text>
              <Text style={styles.estado} numberOfLines={1}>{estado}</Text>
            </View>
          </View>
          <Interruptor valor={disponible} cargando={toggling} onCambiar={handleToggle} />
        </View>

        {/* Indicadores del día */}
        <View style={styles.kpis}>
          {kpis.map(k => (
            <View key={k.etiqueta} style={styles.kpi}>
              <Text style={styles.kpiEtiqueta}>{k.etiqueta}</Text>
              <Text style={styles.kpiValor} numberOfLines={1} adjustsFontSizeToFit>{k.valor}</Text>
            </View>
          ))}
        </View>

        {!disponible && pedidosActivos.length === 0 ? (
          // Desconectado
          <View style={styles.tarjetaCentro}>
            <View style={styles.desconectadoIcono}>
              <Image source={logos.simboloClaro} style={{ width: 44, height: 64 }} resizeMode="contain" />
            </View>
            <Text style={styles.centroTitulo}>Estás desconectado</Text>
            <Text style={styles.centroSub}>Conéctate para recibir pedidos cerca de ti.</Text>
            <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
              <BotonPrincipal texto="Conectarme" onPress={() => handleToggle(true)} cargando={toggling} />
            </View>
          </View>
        ) : (
          <>
            {/* Mapa */}
            <View style={[styles.mapa, pedidosActivos.length === 0 && styles.mapaGrande]}
              onTouchStart={() => setTocandoMapa(true)} onTouchEnd={() => setTocandoMapa(false)} onTouchCancel={() => setTocandoMapa(false)}>
              <MapaRuta ubicacion={ubicacion} paradas={rutaParadas} />
              {etiquetaMapa ? (
                <TouchableOpacity style={styles.mapaChip} onPress={navegarSiguiente} accessibilityLabel="Abrir navegación a la siguiente parada">
                  <Text style={styles.mapaChipTexto}>{etiquetaMapa}</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {pedidosActivos.length === 0 ? (
              <View style={styles.tarjetaCentro}>
                <Ionicons name="radio-outline" size={36} color={colores.celeste} />
                <Text style={styles.centroTitulo}>Esperando pedidos…</Text>
                <Text style={styles.centroSub}>Estás en línea: te avisamos con sonido y vibración cuando haya uno cerca.</Text>
              </View>
            ) : (
              <>
                {/* Varios pedidos: selector en el orden de la ruta */}
                {pedidosActivos.length > 1 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {pedidosActivos.map((p) => {
                      const sel = String(p.idPedido) === String(pedidoSel?.idPedido);
                      return (
                        <TouchableOpacity key={p.idPedido} style={[styles.chip, sel && styles.chipSel]} onPress={() => setIdPedidoSel(p.idPedido)}>
                          <Text style={[styles.chipTexto, sel && { color: colores.blanco }]}>
                            {p.OrdenRuta ? `${p.OrdenRuta}. ` : ''}#{p.idPedido}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}

                {/* Pedido */}
                <View style={styles.pedido}>
                  <View style={styles.pedidoCabecera}>
                    <Text style={styles.pedidoTitulo}>Pedido #{pedidoSel.idPedido}</Text>
                    <View style={styles.pedidoEstado}><Text style={styles.pedidoEstadoTexto}>{STATUS_LABELS[statusSel] || 'Nuevo'}</Text></View>
                  </View>
                  <View style={{ gap: 10 }}>
                    <Parada letra="A" recoger titulo={pedidoSel.NombreSucursal || pedidoSel.sucursal || 'Tienda'}
                      detalle={`Recoger · ${pedidoSel.DireccionSucursal?.trim() || 'dirección de la tienda'}`} />
                    <Parada letra="B" titulo={pedidoSel.NombreCliente || pedidoSel.cliente || 'Cliente'}
                      detalle={`Entregar · ${pedidoSel.direccion || pedidoSel.DireccionEntrega || 'sin dirección'}`} />
                  </View>
                  <View style={styles.pedidoPie}>
                    <View style={{ flexShrink: 1 }}>
                      <Text style={styles.pieEtiqueta}>{cobroSel.etiqueta}</Text>
                      <Text style={[styles.pieMonto, !cobroSel.cobrar && !cobroSel.tarjeta && { fontSize: 16 }]} numberOfLines={1} adjustsFontSizeToFit>
                        {cobroSel.cobrar || cobroSel.tarjeta ? (cobroSel.monto || 'Confirma con la tienda') : 'No cobres nada'}
                      </Text>
                      {(cobroSel.cobrar || cobroSel.tarjeta) && cobroSel.detalle ? <Text style={styles.pieEtiqueta}>{cobroSel.detalle}</Text> : null}
                      {cobroSel.cambio ? <Text style={styles.pieCambio}>Lleva cambio: {cobroSel.cambio}</Text> : null}
                    </View>
                    {comisionSel != null && (
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.pieEtiqueta}>Tu comisión</Text>
                        <Text style={styles.pieComision}>{fmtUSD(comisionSel)}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {siguiente && (
                  <BotonPrincipal texto={siguiente.label} cargando={actionLoading} onPress={() => handleSiguiente(pedidoSel, siguiente.nextStatus)} />
                )}
                {puedeLiberar && (
                  <TouchableOpacity style={styles.secundario} onPress={() => handleLiberar(pedidoSel)} disabled={actionLoading}>
                    <Text style={styles.secundarioTexto}>Liberar: que lo tome otro repartidor</Text>
                  </TouchableOpacity>
                )}
                {puedeCancelar && statusSel !== 'EN_CAMINO' && (
                  <TouchableOpacity style={styles.secundario} onPress={() => setPedidoACancelar(pedidoSel)} disabled={actionLoading}>
                    <Text style={[styles.secundarioTexto, { color: '#8A2B2B' }]}>Tengo un problema con este pedido</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={!!pedidoAEntregar} transparent animationType="slide" onRequestClose={() => setPedidoAEntregar(null)} statusBarTranslucent>
      {pedidoAEntregar && (
        <EntregaModal
          pedido={pedidoAEntregar}
          cargando={actionLoading}
          onConfirmar={confirmarEntrega}
          onProblema={() => setPedidoACancelar(pedidoAEntregar)}
          onCerrar={() => setPedidoAEntregar(null)}
        />
      )}
      {pedidoACancelar && pedidoAEntregar && (
        <MotivoCancelacionModal pedido={pedidoACancelar} loading={actionLoading} onConfirmar={doCancelarConMotivo} onCerrar={() => setPedidoACancelar(null)} />
      )}
      </Modal>

      <Modal visible={!!pedidoACancelar && !pedidoAEntregar} transparent animationType="fade" onRequestClose={() => setPedidoACancelar(null)} statusBarTranslucent>
        {pedidoACancelar && !pedidoAEntregar && (
          <MotivoCancelacionModal
            pedido={pedidoACancelar}
            loading={actionLoading}
            onConfirmar={doCancelarConMotivo}
            onCerrar={() => setPedidoACancelar(null)}
          />
        )}
      </Modal>

      <Modal visible={!!nuevoPedido} transparent animationType="none" onRequestClose={() => setNuevoPedido(null)} statusBarTranslucent>
      {nuevoPedido && (
        <NuevoPedidoModal
          pedido={nuevoPedido}
          pedidosActivos={pedidosActivos.length}
          comisionPct={comisionPct}
          ubicacion={ubicacion}
          aceptando={actionLoading}
          onAceptar={handleAceptarPedido}
          onRechazar={() => setNuevoPedido(null)}
        />
      )}
      </Modal>
    </SafeAreaView>
  );
}

// ---- Estilos ----
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 14 },
  btnDisabled: { opacity: 0.55 },

  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cabeceraIzq: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  simbolo: { width: 48, height: 48, borderRadius: 15, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, alignItems: 'center', justifyContent: 'center' },
  simboloImg: { width: 26, height: 36 },
  hola: { fontSize: 13, color: colores.textoSuave },
  estado: { fontFamily: fuentes.titulo, fontSize: 19, color: colores.marino },

  interruptor: { width: 58, height: 34, borderRadius: 17, padding: 3, flexDirection: 'row', alignItems: 'center' },
  interruptorOn: { backgroundColor: colores.verde, justifyContent: 'flex-end' },
  interruptorOff: { backgroundColor: colores.bordeFuerte, justifyContent: 'flex-start' },
  interruptorBola: { width: 28, height: 28, borderRadius: 14, backgroundColor: colores.blanco },

  kpis: { flexDirection: 'row', gap: 8 },
  kpi: { flex: 1, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 18, padding: 12, gap: 2 },
  kpiEtiqueta: { fontSize: 12, color: colores.textoSuave },
  kpiValor: { fontFamily: fuentes.tituloFuerte, fontSize: 20, color: colores.marino },

  mapa: { height: 170, borderRadius: 24, overflow: 'hidden', backgroundColor: '#DDEFF5' },
  mapaGrande: { height: 260 },
  mapaChip: { position: 'absolute', right: 12, bottom: 12, backgroundColor: colores.blanco, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  mapaChipTexto: { fontSize: 13, fontWeight: '800', color: colores.marino },

  tarjetaCentro: {
    backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 26,
    padding: 22, alignItems: 'center', gap: 8,
  },
  desconectadoIcono: { width: 84, height: 84, borderRadius: 26, backgroundColor: colores.fondo, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  centroTitulo: { fontFamily: fuentes.tituloFuerte, fontSize: 20, color: colores.marino, textAlign: 'center' },
  centroSub: { fontSize: 14, color: colores.textoSuave, textAlign: 'center', lineHeight: 20 },

  chips: { gap: 8 },
  chip: { paddingHorizontal: 14, minHeight: 40, justifyContent: 'center', borderRadius: 12, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde },
  chipSel: { backgroundColor: colores.marino, borderColor: colores.marino },
  chipTexto: { fontWeight: '800', fontSize: 13, color: colores.marino },

  pedido: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 26, padding: 18, gap: 14 },
  pedidoCabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  pedidoTitulo: { fontFamily: fuentes.tituloFuerte, fontSize: 18, color: colores.marino },
  pedidoEstado: { backgroundColor: colores.celesteClaro, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  pedidoEstadoTexto: { fontSize: 12, fontWeight: '800', color: colores.marino },
  parada: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  paradaLetra: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  paradaRecoger: { backgroundColor: colores.celeste },
  paradaEntregar: { backgroundColor: colores.marino },
  paradaLetraTexto: { fontWeight: '800', fontSize: 13, color: colores.marino },
  paradaTitulo: { fontWeight: '800', fontSize: 15, color: colores.marino },
  paradaDetalle: { fontSize: 13, color: colores.textoSuave },
  pedidoPie: {
    borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: '#BFDDE6', paddingTop: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12,
  },
  pieEtiqueta: { fontSize: 12, color: colores.textoSuave },
  pieCambio: { fontSize: 12, fontWeight: '800', color: colores.marino },
  pieMonto: { fontFamily: fuentes.tituloFuerte, fontSize: 24, color: colores.marino },
  pieComision: { fontFamily: fuentes.titulo, fontSize: 18, color: colores.verdeTexto },

  pildora: { height: 60, borderRadius: 30, backgroundColor: colores.marino, flexDirection: 'row', alignItems: 'center', padding: 6, gap: 14 },
  pildoraFlecha: { width: 48, height: 48, borderRadius: 24, backgroundColor: colores.celeste, alignItems: 'center', justifyContent: 'center' },
  pildoraTexto: { color: colores.blanco, fontWeight: '800', fontSize: 17 },
  secundario: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  secundarioTexto: { fontWeight: '800', fontSize: 14, color: colores.textoSuave },
});

const entregaStyles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 14 },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  volver: { width: 44, height: 44, borderRadius: 14, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontFamily: fuentes.tituloFuerte, fontSize: 22, color: colores.marino },
  sub: { fontSize: 13, color: colores.textoSuave },
  llamar: { width: 46, height: 46, borderRadius: 15, backgroundColor: colores.celeste, alignItems: 'center', justifyContent: 'center' },
  cobro: { backgroundColor: colores.marino, borderRadius: 26, padding: 20, gap: 6 },
  cobroEtiqueta: { fontSize: 13, color: colores.sobreMarino },
  cobroMonto: { fontFamily: fuentes.tituloFuerte, fontSize: 40, lineHeight: 46, color: colores.blanco },
  cambio: { alignSelf: 'flex-start', marginTop: 6, backgroundColor: colores.celeste, borderRadius: 99, paddingVertical: 6, paddingHorizontal: 12 },
  cambioTexto: { fontWeight: '800', fontSize: 14, color: colores.marino },
  items: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: radios.grande, paddingHorizontal: 14, paddingVertical: 4 },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, gap: 10 },
  itemBorde: { borderBottomWidth: 1, borderBottomColor: '#EEF6F8' },
  itemNombre: { flex: 1, fontWeight: '700', fontSize: 15, color: colores.marino },
  itemCant: { fontFamily: fuentes.titulo, fontSize: 15, color: colores.marino },
  nota: { flexDirection: 'row', gap: 8, backgroundColor: colores.celesteClaro, borderRadius: 14, padding: 12 },
  notaTexto: { flex: 1, fontSize: 13, color: colores.marino },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colores.blanco, borderWidth: 1.5, borderColor: colores.bordeFuerte, borderRadius: 18, padding: 14 },
  checkOn: { borderColor: colores.marino },
  checkTexto: { flex: 1, fontWeight: '800', fontSize: 15, color: colores.marino },
  foto: { minHeight: 110, borderRadius: 20, backgroundColor: colores.celesteClaro, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12 },
  fotoMini: { width: 64, height: 64, borderRadius: 12 },
  fotoTitulo: { fontWeight: '800', fontSize: 15, color: colores.marino },
  fotoSub: { fontSize: 12, color: '#2C3D58' },
  pie: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 4 },
  confirmar: { height: 60, borderRadius: 18, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  confirmarTexto: { color: colores.blanco, fontWeight: '800', fontSize: 17 },
  problema: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  problemaTexto: { fontWeight: '800', fontSize: 14, color: '#8A2B2B', textDecorationLine: 'underline' },
});

const motivoStyles = StyleSheet.create({
  sheet: {
    backgroundColor: colores.blanco, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  title: { fontFamily: fuentes.tituloFuerte, fontSize: 20, color: colores.marino },
  sub:   { fontSize: 14, color: colores.textoSuave, marginTop: 6, marginBottom: 18, lineHeight: 20 },
  opcion: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, marginBottom: 8,
    borderRadius: 14, borderWidth: 1.5, borderColor: colores.borde, backgroundColor: '#F7FBFC',
  },
  opcionSel:      { borderColor: colores.error, backgroundColor: colores.errorClaro },
  opcionText:     { flex: 1, fontSize: 15, color: '#1B2A45', fontWeight: '600' },
  opcionTextSel:  { color: colores.error },
  actions:        { flexDirection: 'row', gap: 12, marginTop: 12 },
  btnVolver: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 54, borderRadius: 16, backgroundColor: '#E6F1F5' },
  btnVolverText: { color: '#2C3D58', fontSize: 16, fontWeight: '700' },
  btnConfirmar: { flex: 1.4, alignItems: 'center', justifyContent: 'center', minHeight: 54, borderRadius: 16, backgroundColor: colores.error },
  btnConfirmarText: { color: colores.blanco, fontSize: 16, fontWeight: '700' },
});

const modalStyles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,16,52,0.45)', justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colores.blanco, borderTopLeftRadius: 30, borderTopRightRadius: 30,
    paddingHorizontal: 20, paddingTop: 22, paddingBottom: Platform.OS === 'ios' ? 34 : 20, gap: 16,
    shadowColor: colores.marino, shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.12, shadowRadius: 30, elevation: 20,
  },
  ofertaCabecera: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ofertaEtiqueta: { fontSize: 13, fontWeight: '800', color: colores.marinoClaro, textTransform: 'uppercase', letterSpacing: 0.8 },
  ofertaGanas: { fontFamily: fuentes.tituloFuerte, fontSize: 34, lineHeight: 40, color: colores.verdeTexto },
  reloj: { width: 66, height: 66, borderRadius: 33, borderWidth: 7, borderColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  relojTexto: { fontFamily: fuentes.tituloFuerte, fontSize: 17, color: colores.marino },
  barraFondo: { height: 5, borderRadius: 3, backgroundColor: colores.borde, overflow: 'hidden', marginTop: -6 },
  barra: { height: 5, backgroundColor: colores.marino },
  datos: { flexDirection: 'row', gap: 8 },
  cambio: { fontWeight: '800', fontSize: 14, color: colores.marino, backgroundColor: colores.celesteClaro, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, overflow: 'hidden' },
  dato: { flex: 1, backgroundColor: colores.fondo, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12 },
  datoEtiqueta: { fontSize: 12, color: colores.textoSuave, fontWeight: '700' },
  datoValor: { fontFamily: fuentes.titulo, fontSize: 16, color: colores.marino },
  extra: { fontSize: 13, color: colores.textoSuave, fontWeight: '700' },
  acciones: { flexDirection: 'row', gap: 10 },
  btnPasar: { flex: 1, height: 58, borderRadius: 18, borderWidth: 2, borderColor: colores.borde, alignItems: 'center', justifyContent: 'center' },
  btnPasarTexto: { fontWeight: '800', fontSize: 16, color: colores.textoSuave },
  btnAceptar: { flex: 2, height: 58, borderRadius: 18, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  btnAceptarTexto: { fontWeight: '800', fontSize: 17, color: colores.blanco },
});
