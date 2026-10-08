import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, Easing, Vibration, Alert, ActivityIndicator, ScrollView, Switch, Dimensions, Platform, Image } from 'react-native';
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
import { iniciarUbicacionBackground, detenerUbicacionBackground } from '../../services/backgroundLocation';
import useAuthStore from '../../store/authStore';
import usePedidoStore from '../../store/pedidoStore';
import { colores, fuentes, logos, radios } from '../../constants/tema';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

// Máximo local de pedidos simultáneos (el backend valida el real por config)
const MAX_PEDIDOS = 3;

const STATUSES = ['IR_A_SUCURSAL', 'EN_SUCURSAL', 'EN_CAMINO', 'ENTREGADO'];
const STATUS_LABELS = {
  REPARTIDOR_ASIGNADO: 'Asignado',
  IR_A_SUCURSAL: 'Ir a sucursal',
  EN_SUCURSAL: 'En sucursal',
  EN_CAMINO: 'En camino',
  ENTREGADO: 'Entregado',
};
const STATUS_ICONS = {
  IR_A_SUCURSAL: 'navigate-outline',
  EN_SUCURSAL: 'storefront-outline',
  EN_CAMINO: 'bicycle-outline',
  ENTREGADO: 'checkmark-circle-outline',
};

// Espejo de las reglas del backend (TRANSICIONES_DELIVERY y LIBERABLES en
// delivery.controller.js): antes de recoger en sucursal el pedido se libera
// para que lo tome otro; una vez recogido ya no se le puede pasar a nadie y
// la única salida es cancelarlo con motivo.
const LIBERABLES  = ['REPARTIDOR_ASIGNADO', 'IR_A_SUCURSAL'];
const CANCELABLES = ['EN_SUCURSAL', 'EN_CAMINO'];

const MOTIVOS_CANCELACION = [
  'Cliente ausente',
  'Dirección incorrecta o no existe',
  'Cliente no responde el teléfono',
  'Cliente rechazó el pedido',
  'Problema con el vehículo',
];

const ACTION_BUTTONS = [
  { fromStatus: 'REPARTIDOR_ASIGNADO', label: 'Voy a la sucursal',                nextStatus: 'IR_A_SUCURSAL', color: '#001034' },
  { fromStatus: null,                  label: 'Voy a la sucursal',                nextStatus: 'IR_A_SUCURSAL', color: '#001034' },
  { fromStatus: 'IR_A_SUCURSAL',       label: 'Llegué a la sucursal',             nextStatus: 'EN_SUCURSAL',   color: '#001034' },
  { fromStatus: 'EN_SUCURSAL',         label: 'Tomé el pedido, voy al cliente',   nextStatus: 'EN_CAMINO',     color: '#001034' },
  { fromStatus: 'EN_CAMINO',           label: 'Marcar como entregado',            nextStatus: 'ENTREGADO',     color: '#001034' },
];

// Formatea el ETA como "~25 min · 3:40 PM"
function fmtETA(pedido) {
  const min = pedido?.MinutosRestantes;
  const eta = pedido?.ETAEntrega ? new Date(pedido.ETAEntrega) : null;
  if (min == null && !eta) return null;
  const hora = eta
    ? eta.toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })
    : '';
  if (min != null && min >= 0) return `~${min} min${hora ? ` · ${hora}` : ''}`;
  return hora || null;
}

// ---------- PulseView ----------
function PulseView({ style }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.15, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,    duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[style, { transform: [{ scale: anim }] }]} />;
}

// ---------- NuevoPedidoModal ----------
function NuevoPedidoModal({ pedido, pedidosActivos, onAceptar, onRechazar }) {
  const cobro = infoCobro(pedido);
  const slideAnim   = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;
  const [segundos, setSegundos] = useState(60);

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 10, useNativeDriver: true }).start();
    Animated.timing(progressAnim, { toValue: 0, duration: 60000, easing: Easing.linear, useNativeDriver: false }).start();
    const interval = setInterval(() => {
      setSegundos((s) => {
        if (s <= 1) { clearInterval(interval); onRechazar(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const colorProgress = progressAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: ['#E53E3E', '#E67E22', '#4DAD66'] });

  return (
    <View style={modalStyles.overlay}>
      <Animated.View style={[modalStyles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={modalStyles.urgentHeader}>
          <Ionicons name="flash" size={26} color={colores.celeste} />
          <Text style={modalStyles.urgentTitle}>
            {pedidosActivos > 0 ? '¡Pedido extra en tu ruta!' : '¡Nuevo pedido!'}
          </Text>
          <Text style={modalStyles.timerText}>{segundos}s</Text>
        </View>
        <View style={modalStyles.progressBg}>
          <Animated.View style={[modalStyles.progressFill, { width: progressWidth, backgroundColor: colorProgress }]} />
        </View>
        <View style={modalStyles.body}>
          {pedidosActivos > 0 && (
            <View style={modalStyles.multiChip}>
              <Ionicons name="layers-outline" size={16} color="#001034" />
              <Text style={modalStyles.multiChipText}>
                Ya llevas {pedidosActivos} pedido{pedidosActivos !== 1 ? 's' : ''} — este se suma a tu ruta
              </Text>
            </View>
          )}
          {(pedido.sucursal || pedido.NombreSucursal) && (
            <View style={modalStyles.infoRow}>
              <Ionicons name="storefront-outline" size={20} color="#4B5B73" />
              <Text style={modalStyles.infoLabel}>Recoger en:</Text>
              <Text style={modalStyles.infoValue}>{pedido.sucursal || pedido.NombreSucursal}</Text>
            </View>
          )}
          <View style={modalStyles.infoRow}>
            <Ionicons name="location-outline" size={20} color="#4B5B73" />
            <Text style={modalStyles.infoLabel}>Entregar en:</Text>
            <Text style={modalStyles.infoValue} numberOfLines={2}>{pedido.direccion || pedido.DireccionEntrega || 'Sin dirección'}</Text>
          </View>
          <View style={modalStyles.totalRow}>
            <Text style={modalStyles.totalLabel}>{cobro.cobrar ? 'Cobrar al cliente' : 'Total del pedido'}</Text>
            <Text style={modalStyles.totalValue}>{cobro.cobrar ? (cobro.monto || 'Confirmar') : fmtUSD(pedido.total || pedido.Total || pedido.TotalUSD)}</Text>
          </View>
          <View style={modalStyles.pagoRow}>
            <Ionicons name={cobro.cobrar ? 'cash-outline' : 'checkmark-circle-outline'} size={22} color={cobro.cobrar ? colores.verdeTexto : colores.marino} />
            <View style={{ flexShrink: 1 }}>
              <Text style={[modalStyles.pagoText, { color: cobro.cobrar ? colores.verdeTexto : colores.marino }]}>{cobro.titulo}</Text>
              {cobro.detalle ? <Text style={{ fontSize: 12, color: '#4B5B73', marginTop: 2 }}>{cobro.detalle}</Text> : null}
            </View>
          </View>
        </View>
        <View style={modalStyles.actions}>
          <TouchableOpacity style={modalStyles.btnRechazar} onPress={onRechazar}>
            <Ionicons name="close" size={22} color="#4B5B73" />
            <Text style={modalStyles.btnRechazarText}>Rechazar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={modalStyles.btnAceptar} onPress={onAceptar}>
            <Ionicons name="checkmark" size={24} color={colores.marino} />
            <Text style={modalStyles.btnAceptarText}>Aceptar pedido</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

// ---------- MotivoCancelacionModal ----------
// Se usa un modal propio en vez de Alert porque el AlertDialog de Android
// solo admite 3 botones y acá hay 5 motivos.
function MotivoCancelacionModal({ pedido, loading, onConfirmar, onCerrar }) {
  const [sel, setSel] = useState(null);

  return (
    <View style={modalStyles.overlay}>
      <View style={motivoStyles.sheet}>
        <Text style={motivoStyles.title}>Cancelar pedido #{pedido.idPedido}</Text>
        <Text style={motivoStyles.sub}>
          Ya recogiste este pedido, así que no se le puede pasar a otro repartidor.
          Indicá por qué no se puede entregar — queda registrado.
        </Text>

        {MOTIVOS_CANCELACION.map((m) => (
          <TouchableOpacity
            key={m}
            style={[motivoStyles.opcion, sel === m && motivoStyles.opcionSel]}
            onPress={() => setSel(m)}
            disabled={loading}
          >
            <Ionicons
              name={sel === m ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={sel === m ? '#E53E3E' : '#8C9BB0'}
            />
            <Text style={[motivoStyles.opcionText, sel === m && motivoStyles.opcionTextSel]}>{m}</Text>
          </TouchableOpacity>
        ))}

        <View style={motivoStyles.actions}>
          <TouchableOpacity style={motivoStyles.btnVolver} onPress={onCerrar} disabled={loading}>
            <Text style={motivoStyles.btnVolverText}>Volver</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[motivoStyles.btnConfirmar, (!sel || loading) && styles.btnDisabled]}
            onPress={() => sel && onConfirmar(sel)}
            disabled={!sel || loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={motivoStyles.btnConfirmarText}>Cancelar pedido</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ---------- StatusBar del pedido ----------
function PedidoStatusBar({ currentStatus }) {
  return (
    <View style={pedidoStyles.statusBar}>
      {STATUSES.map((s, i) => {
        const idx  = STATUSES.indexOf(currentStatus);
        const done = i < idx;
        const active = s === currentStatus;
        return (
          <View key={s} style={pedidoStyles.stepContainer}>
            <View style={[pedidoStyles.stepDot, done && pedidoStyles.stepDone, active && pedidoStyles.stepActive]}>
              {done
                ? <Ionicons name="checkmark" size={12} color="#fff" />
                : <Ionicons name={STATUS_ICONS[s]} size={active ? 14 : 12} color={active ? colores.marino : colores.textoTenue} />
              }
            </View>
            <Text style={[pedidoStyles.stepLabel, active && pedidoStyles.stepLabelActive, done && pedidoStyles.stepLabelDone]}>
              {STATUS_LABELS[s]}
            </Text>
            {i < STATUSES.length - 1 && (
              <View style={[pedidoStyles.connector, (done || active) && pedidoStyles.connectorActive]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

// ---------- Pantalla principal ----------
export default function IndexScreen() {
  // Estado global compartido con las demás tabs
  const disponible     = usePedidoStore((s) => s.disponible);
  const pedidosActivos = usePedidoStore((s) => s.pedidosActivos);
  const rutaParadas    = usePedidoStore((s) => s.rutaParadas);
  const setDisponible     = usePedidoStore((s) => s.setDisponible);
  const setPedidosActivos = usePedidoStore((s) => s.setPedidosActivos);
  const setRutaParadas    = usePedidoStore((s) => s.setRutaParadas);
  const actualizarPedido  = usePedidoStore((s) => s.actualizarPedido);
  const quitarPedido      = usePedidoStore((s) => s.quitarPedido);
  const repartidor     = useAuthStore((s) => s.repartidor);

  const [nuevoPedido,   setNuevoPedido]   = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toggling,      setToggling]      = useState(false);
  const [idPedidoSel,   setIdPedidoSel]   = useState(null);
  // Pedido esperando que el repartidor elija motivo de cancelación
  const [pedidoACancelar, setPedidoACancelar] = useState(null);

  const { ubicacion } = useLocation(disponible);

  // El pedido seleccionado (por defecto el primero de la ruta)
  const pedidoSel = useMemo(() => {
    if (!pedidosActivos.length) return null;
    return pedidosActivos.find((p) => String(p.idPedido) === String(idPedidoSel))
      ?? pedidosActivos[0];
  }, [pedidosActivos, idPedidoSel]);

  // Cargar pedidos activos + ruta desde el backend
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

  useEffect(() => { cargarActivos(); }, []);

  // WebSocket — pedidos nuevos y ruta recalculada en tiempo real
  useWebSocket((msg) => {
    const tipo = msg.tipo || msg.type;
    if (tipo === 'nuevo_pedido_disponible') {
      if (usePedidoStore.getState().pedidosActivos.length >= MAX_PEDIDOS) return;
      // El despacho es dirigido: si el mensaje trae lista de destinatarios
      // y yo no estoy (fuera del radio de búsqueda), lo ignoro
      const objetivo = msg.repartidores;
      if (Array.isArray(objetivo) && objetivo.length > 0 &&
          !objetivo.map(String).includes(String(repartidor?.idRepartidor))) return;
      const pedido = msg.pedido || msg.data || msg;
      Vibration.vibrate([0, 400, 200, 400, 200, 400]);
      setNuevoPedido(pedido);
    }
    if (tipo === 'ruta_actualizada' &&
        String(msg.idRepartidor) === String(repartidor?.idRepartidor)) {
      setRutaParadas(msg.paradas || []);
      // Actualizar ETA/orden de cada pedido con lo que trae la ruta
      (msg.etas || []).forEach((e) => {
        actualizarPedido(e.idPedido, {
          OrdenRuta: e.OrdenRuta,
          ETAEntrega: e.ETAEntrega,
          MinutosRestantes: e.MinutosRestantes,
          DistanciaKm: e.DistanciaKm,
        });
      });
    }
  });

  // Polling cada 10s — fallback si el WS no llegó (sigue activo con pedidos
  // encima mientras haya cupo para otro)
  useEffect(() => {
    if (!disponible || pedidosActivos.length >= MAX_PEDIDOS) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.get('/delivery/repartidor/pedidos-disponibles');
        const lista = Array.isArray(res.data) ? res.data : [];
        // No re-ofrecer un pedido que ya llevo
        const nuevos = lista.filter((p) =>
          !pedidosActivos.some((a) => String(a.idPedido) === String(p.idPedido)));
        if (nuevos.length > 0 && !nuevoPedido) {
          Vibration.vibrate([0, 400, 200, 400, 200, 400]);
          setNuevoPedido(nuevos[0]);
        }
      } catch (_) {}
    }, 10000);
    return () => clearInterval(interval);
  }, [disponible, pedidosActivos, nuevoPedido]);

  // Toggle disponible (el switch del header)
  const handleToggle = useCallback(async (value) => {
    setToggling(true);
    try {
      if (value) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { setToggling(false); return; }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        await api.post('/delivery/repartidor/disponible', {
          disponible: true,
          Latitud: loc.coords.latitude,
          Longitud: loc.coords.longitude,
        });
        iniciarUbicacionBackground();
      } else {
        await api.post('/delivery/repartidor/disponible', { disponible: false });
        detenerUbicacionBackground();
      }
      setDisponible(value);
    } catch (_) {}
    finally { setToggling(false); }
  }, []);

  const handleConectarme = async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a tu ubicación para mostrarte pedidos cercanos.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await api.post('/delivery/repartidor/disponible', {
        disponible: true,
        Latitud: loc.coords.latitude,
        Longitud: loc.coords.longitude,
      });
      setDisponible(true);
      iniciarUbicacionBackground();
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo conectar');
    } finally {
      setLoading(false);
    }
  };

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

  const handleRechazarPedido = () => setNuevoPedido(null);

  const handleCambiarStatus = (pedido, nuevoStatus) => {
    if (!pedido) return;
    if (nuevoStatus === 'ENTREGADO') {
      Alert.alert('Confirmar entrega', 'Toma una foto del pedido entregado como evidencia.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: '📷 Tomar foto', onPress: () => entregarConFoto(pedido) },
        { text: 'Entregar sin foto', style: 'destructive', onPress: () => doCambiarStatus(pedido, 'ENTREGADO') },
      ]);
      return;
    }
    doCambiarStatus(pedido, nuevoStatus);
  };

  const entregarConFoto = async (pedido) => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Sin permiso de cámara', '¿Entregar sin foto?', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Entregar', onPress: () => doCambiarStatus(pedido, 'ENTREGADO') },
        ]);
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
      if (res.canceled || !res.assets?.[0]) return;
      const foto = res.assets[0];
      const idPedido = pedido.idPedido || pedido.id;
      const fd = new FormData();
      fd.append('file', { uri: foto.uri, name: `entrega_${idPedido}.jpg`, type: foto.mimeType || 'image/jpeg' });
      try {
        await api.post(`/delivery/repartidor/pedido/${idPedido}/evidencia`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } catch { /* no bloquea la entrega */ }
      doCambiarStatus(pedido, 'ENTREGADO');
    } catch {
      doCambiarStatus(pedido, 'ENTREGADO');
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
        // Refrescar la ruta con los pedidos que quedan
        cargarActivos();
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

  // Cancelar solo está disponible con el pedido ya recogido, y exige motivo
  const handleCancelar = (pedido) => setPedidoACancelar(pedido);

  const doCancelarConMotivo = async (motivo) => {
    const pedido = pedidoACancelar;
    if (!pedido) return;
    // Si falla se deja el modal abierto con el motivo elegido para reintentar
    const ok = await doCambiarStatus(pedido, 'CANCELADO', motivo);
    if (ok) setPedidoACancelar(null);
  };

  // Liberar: el pedido vuelve al pool y lo toma otro repartidor. El backend
  // no se lo vuelve a ofrecer a quien lo soltó.
  const handleLiberar = (pedido) => {
    Alert.alert(
      'Liberar pedido',
      `El pedido #${pedido.idPedido} vuelve a la búsqueda para que lo tome otro repartidor. ` +
      'A ti no se te va a volver a ofrecer.',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Sí, liberar', style: 'destructive', onPress: () => doLiberar(pedido) },
      ],
    );
  };

  const doLiberar = async (pedido) => {
    setActionLoading(true);
    const idPedido = pedido.idPedido || pedido.id;
    try {
      await api.post('/delivery/repartidor/liberar', { idPedido });
      quitarPedido(idPedido);
      setIdPedidoSel(null);
      // Refrescar la ruta con los pedidos que le quedan
      cargarActivos();
    } catch (e) {
      Alert.alert('No se pudo liberar', e.response?.data?.error || e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Un pedido recién aceptado llega sin Status o como REPARTIDOR_ASIGNADO
  const statusSel     = pedidoSel?.Status || 'REPARTIDOR_ASIGNADO';
  const puedeLiberar  = !!pedidoSel && LIBERABLES.includes(statusSel);
  const puedeCancelar = !!pedidoSel && CANCELABLES.includes(statusSel);

  const currentStatus = pedidoSel?.Status === 'REPARTIDOR_ASIGNADO' ? null : (pedidoSel?.Status || null);
  const actionBtn = pedidoSel
    ? ACTION_BUTTONS.find((b) => b.fromStatus === (pedidoSel.Status === 'REPARTIDOR_ASIGNADO' ? 'REPARTIDOR_ASIGNADO' : pedidoSel.Status || null))
    : null;

  // -------- Header integrado en la pantalla --------
  const Header = (
    <SafeAreaView
      edges={['top']}
      style={[styles.header, disponible ? styles.headerOnline : styles.headerOffline]}
    >
      <View style={styles.headerContent}>
        <View style={styles.headerIzq}>
          <View style={styles.headerSimbolo}>
            <Image source={logos.simboloOscuro} style={styles.headerSimboloImg} resizeMode="contain" accessibilityLabel="VIDA" />
          </View>
          <View>
          <Text style={styles.headerGreeting}>Hola, {repartidor?.Nombre || 'Repartidor'}</Text>
          <Text style={styles.headerStatus}>
            {disponible
              ? pedidosActivos.length > 0
                ? `● En línea · ${pedidosActivos.length} pedido${pedidosActivos.length !== 1 ? 's' : ''} activo${pedidosActivos.length !== 1 ? 's' : ''}`
                : '● En línea'
              : '● Desconectado'}
          </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {toggling ? (
            <ActivityIndicator color="#fff" size="small" style={{ marginRight: 4 }} />
          ) : (
            <Switch
              value={disponible}
              onValueChange={handleToggle}
              trackColor={{ false: 'rgba(255,255,255,0.3)', true: colores.celeste }}
              thumbColor="#fff"
              ios_backgroundColor="rgba(255,255,255,0.3)"
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );

  // -------- RENDER INACTIVO --------
  if (!disponible && pedidosActivos.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#001034' }}>
        {Header}
        <View style={styles.inactivoContainer}>
          <View style={styles.inactivoContent}>
            <PulseView style={styles.pulseBg} />
            <View style={styles.pulseCenter}>
              <Image source={logos.simboloOscuro} style={styles.pulseSimbolo} resizeMode="contain" accessibilityLabel="VIDA" />
            </View>
            <Text style={styles.inactivoTitle}>Estás desconectado</Text>
            <Text style={styles.inactivoSub}>Actívate para recibir pedidos cercanos</Text>
            <TouchableOpacity
              style={[styles.conectarBtn, loading && styles.btnDisabled]}
              onPress={handleConectarme}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colores.marino} />
              ) : (
                <>
                  <Ionicons name="power" size={22} color={colores.marino} />
                  <Text style={styles.conectarBtnText}>Conectarme</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // -------- RENDER DISPONIBLE / CON PEDIDOS --------
  return (
    <View style={{ flex: 1, backgroundColor: '#F2F9FB' }}>
      {Header}
      <View style={styles.onlineContainer}>
        <View style={styles.mapPlaceholder}>
          <MapaRuta ubicacion={ubicacion} paradas={rutaParadas} />
        </View>

        <View style={styles.bottomPanel}>
          {pedidosActivos.length > 0 ? (
            <>
            {/* Solo el detalle scrollea: los botones viven en el footer fijo
                de abajo, para que nunca queden fuera de alcance */}
            <ScrollView style={styles.panelScroll} contentContainerStyle={styles.panelScrollContent}>

              {/* Selector horizontal de pedidos (orden de la ruta) */}
              {pedidosActivos.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.chipsScroll}
                  contentContainerStyle={styles.chipsRow}
                >
                  {pedidosActivos.map((p) => {
                    const sel = String(p.idPedido) === String(pedidoSel?.idPedido);
                    const eta = fmtETA(p);
                    return (
                      <TouchableOpacity
                        key={p.idPedido}
                        style={[styles.chip, sel && styles.chipSel]}
                        onPress={() => setIdPedidoSel(p.idPedido)}
                      >
                        <View style={[styles.chipNum, { backgroundColor: getStatusColor(p.Status) }]}>
                          <Text style={styles.chipNumText}>{p.OrdenRuta ?? '·'}</Text>
                        </View>
                        <View>
                          <Text style={[styles.chipTitle, sel && styles.chipTitleSel]}>#{p.idPedido}</Text>
                          {eta ? <Text style={styles.chipEta}>{eta}</Text> : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              <PedidoStatusBar currentStatus={pedidoSel?.Status} />

              <View style={styles.pedidoCard}>
                <View style={styles.pedidoHeader}>
                  <Text style={styles.pedidoTitle}>
                    Pedido #{pedidoSel?.idPedido}
                    {pedidoSel?.OrdenRuta ? `  ·  Parada ${pedidoSel.OrdenRuta}` : ''}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(pedidoSel?.Status) }]}>
                    <Text style={styles.statusBadgeText}>{STATUS_LABELS[pedidoSel?.Status] || 'Nuevo'}</Text>
                  </View>
                </View>

                {/* ETA estimado */}
                {fmtETA(pedidoSel) && (
                  <View style={styles.etaBox}>
                    <Ionicons name="time-outline" size={18} color="#001034" />
                    <Text style={styles.etaText}>Entrega estimada: {fmtETA(pedidoSel)}</Text>
                    {pedidoSel?.DistanciaKm != null && (
                      <Text style={styles.etaKm}>{parseFloat(pedidoSel.DistanciaKm).toFixed(1)} km</Text>
                    )}
                  </View>
                )}

                {(pedidoSel?.NombreCliente || pedidoSel?.cliente) && (
                  <View style={styles.infoRow}>
                    <Ionicons name="person-outline" size={18} color="#4B5B73" />
                    <Text style={styles.infoText}>{pedidoSel.NombreCliente || pedidoSel.cliente}</Text>
                  </View>
                )}
                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={18} color="#4B5B73" />
                  <Text style={styles.infoText} numberOfLines={2}>
                    {pedidoSel?.direccion || pedidoSel?.DireccionEntrega || 'Sin dirección'}
                  </Text>
                </View>
                {(pedidoSel?.sucursal || pedidoSel?.NombreSucursal) && (
                  <View style={styles.infoRow}>
                    <Ionicons name="storefront-outline" size={18} color="#4B5B73" />
                    <Text style={styles.infoText}>{pedidoSel.sucursal || pedidoSel.NombreSucursal}</Text>
                  </View>
                )}

                {/* Cobro al cliente: moneda y monto físico del snapshot del pedido */}
                {(() => {
                  const cobro = infoCobro(pedidoSel);
                  return cobro.cobrar ? (
                    <View style={styles.efectivoBox}>
                      <Ionicons name="cash-outline" size={22} color={colores.celeste} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.efectivoLabel}>Cobra al cliente · {cobro.titulo}</Text>
                        {cobro.monto ? <Text style={styles.efectivoMonto}>{cobro.monto}</Text> : null}
                        {cobro.detalle ? <Text style={styles.efectivoLabel}>{cobro.detalle}</Text> : null}
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.efectivoBox, { backgroundColor: '#DDF2F8', borderColor: '#C3E8F2' }]}>
                      <Ionicons name="checkmark-circle-outline" size={20} color="#001034" />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.efectivoLabel, { color: '#001034' }]}>{cobro.titulo}</Text>
                        <Text style={[styles.efectivoLabel, { color: '#001034' }]}>{cobro.detalle}</Text>
                      </View>
                    </View>
                  );
                })()}

                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>
                    {fmtUSD(pedidoSel?.total || pedidoSel?.Total || pedidoSel?.TotalUSD)}
                  </Text>
                </View>
              </View>

            </ScrollView>

            <View style={styles.panelFooter}>
              {actionBtn && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: actionBtn.color }, actionLoading && styles.btnDisabled]}
                  onPress={() => handleCambiarStatus(pedidoSel, actionBtn.nextStatus)}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name={STATUS_ICONS[actionBtn.nextStatus]} size={22} color="#fff" />
                      <Text style={styles.actionBtnText}>{actionBtn.label}</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {/* Antes de recoger: liberar. Después: cancelar con motivo. */}
              {puedeLiberar && (
                <TouchableOpacity
                  style={[styles.liberarBtn, actionLoading && styles.btnDisabled]}
                  onPress={() => handleLiberar(pedidoSel)}
                  disabled={actionLoading}
                >
                  <Ionicons name="swap-horizontal-outline" size={18} color="#E67E22" />
                  <Text style={styles.liberarBtnText}>Liberar — que lo tome otro</Text>
                </TouchableOpacity>
              )}

              {puedeCancelar && (
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => handleCancelar(pedidoSel)}
                  disabled={actionLoading}
                >
                  <Text style={styles.cancelBtnText}>No puedo entregarlo — cancelar</Text>
                </TouchableOpacity>
              )}
            </View>
            </>
          ) : (
            <View style={styles.esperandoContainer}>
              <Ionicons name="radio-outline" size={40} color={colores.celeste} />
              <Text style={styles.esperandoTitle}>Esperando pedidos...</Text>
              <Text style={styles.esperandoSub}>Estás en línea y visible para clientes cercanos</Text>
            </View>
          )}
        </View>
      </View>

      {pedidoACancelar && (
        <MotivoCancelacionModal
          pedido={pedidoACancelar}
          loading={actionLoading}
          onConfirmar={doCancelarConMotivo}
          onCerrar={() => setPedidoACancelar(null)}
        />
      )}

      {nuevoPedido && (
        <NuevoPedidoModal
          pedido={nuevoPedido}
          pedidosActivos={pedidosActivos.length}
          onAceptar={handleAceptarPedido}
          onRechazar={handleRechazarPedido}
        />
      )}
    </View>
  );
}

function getStatusColor(status) {
  return {
    REPARTIDOR_ASIGNADO: '#4B5B73',
    IR_A_SUCURSAL: '#001034',
    EN_SUCURSAL: '#0C2A5E',
    EN_CAMINO: '#E67E22',
    ENTREGADO: '#4DAD66',
    CANCELADO: '#E53E3E',
  }[status] || '#4B5B73';
}

// ---- Styles ----
const styles = StyleSheet.create({
  header: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 6,
  },
  headerOffline: { backgroundColor: colores.marinoSuave },
  headerOnline: { backgroundColor: colores.marino },
  headerContent: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10, paddingBottom: Platform.OS === 'android' ? 14 : 10,
  },
  headerIzq: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  headerSimbolo: { width: 44, height: 44, borderRadius: 14, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  headerSimboloImg: { width: 26, height: 40 },
  headerGreeting: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerStatus: { color: colores.sobreMarino, fontSize: 12, marginTop: 1 },
  headerRight:    { flexDirection: 'row', alignItems: 'center', gap: 8 },

  inactivoContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  inactivoContent:   { alignItems: 'center', paddingHorizontal: 32 },
  pulseBg: { width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(98,198,222,0.18)', position: 'absolute' },
  pulseCenter: { width: 124, height: 124, borderRadius: 62, backgroundColor: colores.marino, borderWidth: 3, borderColor: colores.celeste, justifyContent: 'center', alignItems: 'center', marginBottom: 32 },
  pulseSimbolo: { width: 54, height: 84 },
  inactivoTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  inactivoSub: { color: colores.sobreMarino, fontSize: 15, textAlign: 'center', marginBottom: 40 },
  conectarBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colores.celeste, paddingHorizontal: 40, minHeight: 60, borderRadius: 30, gap: 10 },
  conectarBtnText: { color: colores.marino, fontSize: 18, fontWeight: '800' },
  btnDisabled: { opacity: 0.6 },

  onlineContainer: { flex: 1 },
  // El minHeight iba en SCREEN_HEIGHT * 0.3 y el panel en 0.55: 0.85 de la
  // pantalla COMPLETA, cuando el espacio real es la pantalla menos el header
  // y la tab bar. El panel no podía encogerse y su parte de abajo (los
  // botones) terminaba detrás de la tab bar, inalcanzable.
  mapPlaceholder: { flex: 1, backgroundColor: '#DDEFF5', minHeight: 140, overflow: 'hidden' },

  bottomPanel: {
    backgroundColor: colores.blanco, borderTopLeftRadius: radios.enorme, borderTopRightRadius: radios.enorme,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, maxHeight: '68%', flexShrink: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8,
  },
  // flexShrink sin flexGrow: el scroll cede espacio al footer, nunca lo tapa
  panelScroll:        { flexShrink: 1 },
  panelScrollContent: { paddingBottom: 4 },
  panelFooter: {
    paddingTop: 12, gap: 4,
    borderTopWidth: 1, borderTopColor: '#E6F1F5',
  },
  esperandoContainer: { alignItems: 'center', paddingVertical: 32 },
  esperandoTitle: { fontSize: 20, fontWeight: '700', color: '#001034', marginTop: 12 },
  esperandoSub:   { color: '#4B5B73', fontSize: 14, textAlign: 'center', marginTop: 6 },

  chipsScroll: { marginBottom: 14, marginHorizontal: -4 },
  chipsRow:    { gap: 8, paddingHorizontal: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colores.blanco, borderRadius: radios.medio, paddingHorizontal: 12, minHeight: 48, borderWidth: 1.5, borderColor: colores.borde },
  chipSel: { borderColor: colores.marino, backgroundColor: colores.celesteClaro },
  chipNum: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  chipNumText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  chipTitle:    { fontSize: 13, fontWeight: '700', color: '#2C3D58' },
  chipTitleSel: { color: '#001034' },
  chipEta:      { fontSize: 10, color: '#4B5B73' },

  etaBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colores.celesteClaro, borderRadius: 14, padding: 12, marginBottom: 10 },
  etaText: { color: '#001034', fontSize: 13, fontWeight: '700', flex: 1 },
  etaKm: { color: colores.marino, fontSize: 12, fontWeight: '800' },

  pedidoCard: { backgroundColor: colores.blanco, borderRadius: radios.grande, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colores.borde },
  pedidoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  pedidoTitle: { fontSize: 18, fontWeight: '700', color: colores.marino, flex: 1, marginRight: 8 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  statusBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  infoRow:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  infoText: { color: '#2C3D58', fontSize: 14, flex: 1 },

  efectivoBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colores.marino, borderRadius: radios.grande, padding: 16, marginBottom: 10 },
  efectivoLabel: { fontSize: 12, color: colores.sobreMarino, fontWeight: '700' },
  efectivoMonto: { fontSize: 30, color: colores.blanco, fontFamily: fuentes.tituloFuerte },

  totalRow: { backgroundColor: colores.fondo, borderRadius: radios.medio, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 },
  totalLabel: { color: '#4B5B73', fontSize: 14 },
  totalValue: { color: colores.marino, fontSize: 20, fontFamily: fuentes.titulo },

  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 60, borderRadius: 18, marginBottom: 12, gap: 10 },
  actionBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  liberarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: radios.medio, borderWidth: 1.5, borderColor: '#F0C29A', backgroundColor: '#FFF7ED' },
  liberarBtnText: { color: '#C05621', fontSize: 14, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  cancelBtnText: { color: colores.error, fontSize: 14, fontWeight: '800' },
});

const motivoStyles = StyleSheet.create({
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#001034' },
  sub:   { fontSize: 14, color: '#4B5B73', marginTop: 6, marginBottom: 18, lineHeight: 20 },
  opcion: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 14, marginBottom: 8,
    borderRadius: 14, borderWidth: 1.5, borderColor: '#DCEEF3', backgroundColor: '#F7FBFC',
  },
  opcionSel:      { borderColor: '#E53E3E', backgroundColor: '#FFF5F5' },
  opcionText:     { flex: 1, fontSize: 15, color: '#1B2A45', fontWeight: '600' },
  opcionTextSel:  { color: '#C53030' },
  actions:        { flexDirection: 'row', gap: 12, marginTop: 12 },
  btnVolver: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 16, backgroundColor: '#E6F1F5',
  },
  btnVolverText: { color: '#2C3D58', fontSize: 16, fontWeight: '700' },
  btnConfirmar: {
    flex: 1.4, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 16, backgroundColor: '#E53E3E',
  },
  btnConfirmarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

const pedidoStyles = StyleSheet.create({
  statusBar: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start',
    marginBottom: 16, paddingHorizontal: 4,
  },
  stepContainer: { alignItems: 'center', flex: 1, position: 'relative' },
  stepDot: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#DCEEF3',
    justifyContent: 'center', alignItems: 'center', zIndex: 1,
  },
  stepDone: { backgroundColor: colores.marino },
  stepActive: { backgroundColor: colores.celeste, width: 36, height: 36, borderRadius: 18 },
  stepLabel:       { fontSize: 9, color: '#8C9BB0', textAlign: 'center', marginTop: 4, fontWeight: '500' },
  stepLabelActive: { color: colores.marino, fontWeight: '800' },
  stepLabelDone: { color: colores.marino },
  connector: {
    position: 'absolute', top: 16, right: -SCREEN_WIDTH * 0.12,
    width: SCREEN_WIDTH * 0.22, height: 2, backgroundColor: '#DCEEF3', zIndex: 0,
  },
  connectorActive: { backgroundColor: colores.marino },
});

const modalStyles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.2, shadowRadius: 20, elevation: 20,
  },
  urgentHeader: { backgroundColor: colores.marino, borderTopLeftRadius: 28, borderTopRightRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, paddingHorizontal: 16, gap: 10 },
  urgentTitle: { color: '#fff', fontSize: 20, fontWeight: '800', flex: 1, textAlign: 'center' },
  timerText: { color: colores.marino, fontSize: 18, fontWeight: '800', backgroundColor: colores.celeste, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, minWidth: 48, textAlign: 'center' },
  progressBg:   { height: 5, backgroundColor: '#DCEEF3' },
  progressFill: { height: 5 },
  body: { padding: 20 },
  multiChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colores.celesteClaro, borderRadius: 14, padding: 12, marginBottom: 12 },
  multiChipText: { color: '#001034', fontSize: 12, fontWeight: '600', flex: 1 },
  infoRow:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 8 },
  infoLabel: { color: '#4B5B73', fontSize: 13, fontWeight: '600', width: 80 },
  infoValue: { color: '#001034', fontSize: 14, flex: 1, fontWeight: '500' },
  totalRow: {
    backgroundColor: '#F7FBFC', borderRadius: 14, padding: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8,
  },
  totalLabel: { color: '#4B5B73', fontSize: 15 },
  totalValue: { color: '#001034', fontSize: 28, fontWeight: '900' },
  pagoRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  pagoText:  { fontSize: 15, fontWeight: '700' },
  actions: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  btnRechazar: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colores.blanco, borderRadius: 18, minHeight: 58, gap: 6, borderWidth: 2, borderColor: colores.borde },
  btnRechazarText: { color: '#4B5B73', fontSize: 15, fontWeight: '700' },
  btnAceptar: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colores.celeste, borderRadius: 18, minHeight: 58, gap: 6 },
  btnAceptarText: { color: colores.marino, fontSize: 17, fontWeight: '800' },
});
