import { useState, useEffect, useRef, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, Animated, Linking, ActivityIndicator, Easing, Image, Alert } from 'react-native';
import { Text, TextInput } from '../../components/Texto';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import { WS_URL } from '../../constants/config';
import MapaTracking from '../../components/MapaTracking';
import { montoVESDelPedido, fmtUSD } from '../../services/moneda';
import { colores, fuentes, radios } from '../../constants/tema';

const PASOS = [
  { key: 'BUSCANDO', label: 'Buscando\nrepartidor', icon: 'search-outline' },
  { key: 'ASIGNADO', label: 'Asignado', icon: 'bicycle-outline' },
  { key: 'EN_CAMINO_TIENDA', label: 'En camino\na tienda', icon: 'navigate-outline' },
  { key: 'EN_TIENDA', label: 'En tienda', icon: 'storefront-outline' },
  { key: 'EN_CAMINO', label: 'En camino', icon: 'car-outline' },
  { key: 'ENTREGADO', label: 'Entregado', icon: 'checkmark-circle-outline' },
];

// Map backend status values to our step keys
function normalizeStatus(raw) {
  if (!raw) return 'BUSCANDO';
  const s = String(raw).toUpperCase();
  if (s === 'BUSCANDO_REPARTIDOR' || s.includes('BUSCAN') || s === 'PENDIENTE' || s === 'NUEVO') return 'BUSCANDO';
  if (s === 'REPARTIDOR_ASIGNADO' || s.includes('ASIGNA')) return 'ASIGNADO';
  if (s === 'IR_A_SUCURSAL') return 'EN_CAMINO_TIENDA';
  if (s === 'EN_SUCURSAL') return 'EN_TIENDA';
  if (s === 'EN_CAMINO') return 'EN_CAMINO';
  if (s === 'ENTREGADO' || s.includes('ENTREGA') || s === 'COMPLETADO') return 'ENTREGADO';
  return 'BUSCANDO';
}

export default function SeguimientoScreen() {
  const { idPedido } = useLocalSearchParams();
  const router = useRouter();
  const { token, setPostLoginRedirect } = useAuthStore();

  // El tracking requiere sesión (el pedido pertenece a un cliente)
  useEffect(() => {
    if (!token) {
      setPostLoginRedirect(`/pedido/${idPedido}`);
      router.replace('/(auth)/login');
    }
  }, [token]);

  const [estado, setEstado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [calificacion, setCalificacion] = useState(0);
  const [calificado, setCalificado] = useState(false);
  const [enviandoCalif, setEnviandoCalif] = useState(false);
  const [referenciaPago, setReferenciaPago] = useState('');
  const [reenviandoPago, setReenviandoPago] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const wsRef = useRef(null);
  const pollingRef = useRef(null);
  const confettiAnim = useRef(new Animated.Value(0)).current;

  const rawStatus = String(estado?.Status ?? estado?.EstadoPedido ?? estado?.estado ?? '').toUpperCase();
  const isCancelado = rawStatus === 'CANCELADO';
  const esperandoPago = rawStatus === 'ESPERANDO_PAGO';
  const pagoRechazado = esperandoPago && estado?.StatusPago === 'RECHAZADO';
  // Un backend anterior no envía ComprobantesPendientes: se asume en revisión
  // (comportamiento previo) para no pedir un comprobante que ya se mandó.
  const comprobanteEnRevision = esperandoPago && !pagoRechazado
    && (estado?.ComprobantesPendientes == null || Number(estado.ComprobantesPendientes) > 0);
  const stepIndex = estado ? PASOS.findIndex((p) => p.key === normalizeStatus(estado.Status ?? estado.EstadoPedido ?? estado.estado)) : 0;
  const isDelivered = stepIndex === PASOS.length - 1;
  const isBuscando = stepIndex === 0 && !isCancelado && !esperandoPago;

  // Pulse animation for "buscando"
  useEffect(() => {
    if (!isBuscando || isDelivered) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 700, easing: Easing.ease, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, easing: Easing.ease, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isBuscando, isDelivered]);

  // Confetti when delivered
  useEffect(() => {
    if (!isDelivered) return;
    Animated.spring(confettiAnim, { toValue: 1, useNativeDriver: true }).start();
  }, [isDelivered]);

  const fetchEstado = useCallback(async () => {
    try {
      const res = await api.get(`/delivery/pedido/${idPedido}/estado`);
      const data = res.data?.pedido ?? res.data;
      setEstado(data);
      if (data?.YaCalificado) setCalificado(true);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [idPedido]);

  // Polling every 10s
  useEffect(() => {
    fetchEstado();
    pollingRef.current = setInterval(() => {
      if (!isDelivered) fetchEstado();
    }, 10000);
    return () => clearInterval(pollingRef.current);
  }, [fetchEstado, isDelivered]);

  // WebSocket
  useEffect(() => {
    if (!token) return;
    try {
      const ws = new WebSocket(`${WS_URL}?token=${token}`);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.tipo === 'status_pedido' && String(msg.idPedido) === String(idPedido)) {
            setEstado((prev) => ({ ...prev, Status: msg.estado, EstadoPedido: msg.estado }));
          }
          if (msg.tipo === 'pedido_asignado' && String(msg.idPedido) === String(idPedido)) {
            fetchEstado();
          }
          // El repartidor liberó el pedido: volvió a la búsqueda y ya no hay
          // nadie asignado, así que hay que refrescar (no basta con el status)
          if (msg.tipo === 'pedido_liberado' && String(msg.idPedido) === String(idPedido)) {
            fetchEstado();
          }
          // Repartidor moviéndose: actualizar su posición en el mapa en vivo
          if (msg.tipo === 'ubicacion_repartidor' && String(msg.idPedido) === String(idPedido)) {
            setEstado((prev) => prev
              ? { ...prev, LatRepartidor: msg.Latitud, LonRepartidor: msg.Longitud }
              : prev);
          }
          // Aviso del sistema: nadie ha tomado el pedido
          if (msg.tipo === 'busqueda_sin_repartidor' && String(msg.idPedido) === String(idPedido)) {
            setEstado((prev) => prev ? { ...prev, AvisoSinRepartidor: 1 } : prev);
            fetchEstado(); // trae el tiempo límite actualizado
          }
          // Ruta recalculada: nueva hora estimada y paradas antes de la mía
          if (msg.tipo === 'eta_pedido' && String(msg.idPedido) === String(idPedido)) {
            setEstado((prev) => prev
              ? {
                  ...prev,
                  ETAEntrega: msg.ETAEntrega,
                  MinutosRestantes: msg.MinutosRestantes,
                  ParadasAntes: msg.ParadasAntes,
                  OrdenRuta: msg.OrdenRuta,
                }
              : prev);
          }
        } catch {}
      };

      ws.onerror = () => {};
    } catch {}

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [token, idPedido]);

  const repartidor = estado?.repartidor ?? estado?.Repartidor ?? (
    estado?.NombreRepartidor ? {
      Nombre: estado.NombreRepartidor,
      Telefono: estado.TelefonoRepartidor,
      FotoURL: estado.FotoRepartidor,
      Vehiculo: estado.VehiculoRepartidor,
      PlacaVehiculo: estado.PlacaRepartidor,
      Calificacion: estado.CalificacionRepartidor,
      TotalCalificaciones: estado.TotalCalificacionesRepartidor,
    } : null
  );

  const BASE_URL_IMG = process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') ?? '';

  const [accionBusqueda, setAccionBusqueda] = useState(false);

  // El cliente decide seguir esperando: extiende el deadline de búsqueda
  const extenderBusqueda = async () => {
    setAccionBusqueda(true);
    try {
      const res = await api.post(`/delivery/pedido/${idPedido}/extender-busqueda`);
      await fetchEstado(); // refresca el tiempo límite desde el servidor
      Alert.alert('¡Listo!', `Seguimos buscando repartidor ${res.data.minutosExtra} minutos más.`);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'No se pudo extender la búsqueda.');
      fetchEstado();
    } finally {
      setAccionBusqueda(false);
    }
  };

  const cancelarPedido = () => {
    Alert.alert('Cancelar pedido', '¿Seguro que quieres cancelar este pedido?', [
      { text: 'No, seguir esperando', style: 'cancel' },
      {
        text: 'Sí, cancelar', style: 'destructive',
        onPress: async () => {
          setAccionBusqueda(true);
          try {
            await api.post(`/delivery/pedido/${idPedido}/cancelar`);
            setEstado((prev) => prev ? { ...prev, Status: 'CANCELADO' } : prev);
          } catch (e) {
            Alert.alert('Error', e.response?.data?.error || 'No se pudo cancelar.');
            fetchEstado();
          } finally {
            setAccionBusqueda(false);
          }
        },
      },
    ]);
  };

  const enviarCalificacion = async (estrellas) => {
    if (enviandoCalif || calificado) return;
    setCalificacion(estrellas);
    setEnviandoCalif(true);
    try {
      await api.post(`/delivery/pedido/${idPedido}/calificar`, { Estrellas: estrellas });
      setCalificado(true);
      Alert.alert('¡Gracias!', 'Tu calificación fue enviada.');
    } catch {
      Alert.alert('Error', 'No se pudo enviar la calificación. Intenta de nuevo.');
    } finally {
      setEnviandoCalif(false);
    }
  };

  const reenviarComprobante = async () => {
    if (!referenciaPago.trim()) return Alert.alert('Referencia requerida','Escribe el número de referencia del nuevo pago.');
    const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes:['images'], quality:0.75 });
    if (pick.canceled || !pick.assets?.[0]) return;
    const asset = pick.assets[0];
    setReenviandoPago(true);
    try {
      const fd = new FormData();
      fd.append('Referencia',referenciaPago.trim());
      fd.append('file',{uri:asset.uri,name:asset.fileName||`comprobante_${idPedido}.jpg`,type:asset.mimeType||'image/jpeg'});
      await api.post(`/delivery/pedido/${idPedido}/comprobante`,fd,{headers:{'Content-Type':'multipart/form-data'}});
      setReferenciaPago('');
      await fetchEstado();
      Alert.alert('Comprobante enviado','Lo revisaremos antes de buscar repartidor.');
    } catch(e) {
      Alert.alert('No se pudo enviar',e.response?.data?.error||e.message);
    } finally { setReenviandoPago(false); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: `Pedido #${idPedido}`,
          headerStyle: { backgroundColor: colores.fondo },
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: fuentes.titulo, color: colores.marino },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.headerCerrar} accessibilityLabel="Cerrar">
              <Ionicons name="close" size={22} color={colores.marino} />
            </TouchableOpacity>
          ),
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#001034" />
          <Text style={styles.loadingText}>Cargando tu pedido...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchEstado}>
            <Text style={styles.retryBtnText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {esperandoPago && (
            <View style={{backgroundColor:pagoRechazado?'#FFF5F5':'#FFFBEB',borderColor:pagoRechazado?'#FEB2B2':'#FBD38D',borderWidth:1,borderRadius:18,padding:18,marginBottom:16}}>
              <Ionicons name={pagoRechazado?'alert-circle':comprobanteEnRevision?'time-outline':'cloud-upload-outline'} size={34} color={pagoRechazado?'#C53030':'#B7791F'} />
              <Text style={{fontSize:18,fontWeight:'800',color:'#001034',marginTop:8}}>
                {pagoRechazado?'Comprobante rechazado':comprobanteEnRevision?'Estamos revisando tu pago':'Envía tu comprobante de pago'}
              </Text>
              <Text style={{color:'#4B5B73',marginTop:5,lineHeight:20}}>
                {pagoRechazado?'Envía un nuevo comprobante. El pedido todavía no fue asignado a un repartidor.'
                  :comprobanteEnRevision?'Cuando aprobemos el comprobante comenzará automáticamente la búsqueda de repartidor.'
                  :'Haz el Pago Móvil y sube la captura con su referencia. Cuando lo aprobemos empezará la búsqueda de repartidor.'}
              </Text>
              {estado?.SegundosPagoRestantes != null && (
                <Text style={{color:'#B7791F',fontWeight:'700',marginTop:8,lineHeight:20}}>
                  Tienes hasta las {new Date(Date.now() + estado.SegundosPagoRestantes * 1000).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })} para enviarlo; si no, el pedido se cancelará automáticamente.
                </Text>
              )}
              {!comprobanteEnRevision && <>
                <TextInput value={referenciaPago} onChangeText={setReferenciaPago} placeholder={pagoRechazado?'Nueva referencia':'Referencia del pago'} keyboardType="number-pad" style={{backgroundColor:'#fff',borderWidth:1,borderColor:'#DCEEF3',borderRadius:12,padding:12,marginTop:14}} />
                <TouchableOpacity disabled={reenviandoPago} onPress={reenviarComprobante} style={{backgroundColor:'#001034',borderRadius:12,padding:13,alignItems:'center',marginTop:10,opacity:reenviandoPago?0.6:1}}>
                  <Text style={{color:'#fff',fontWeight:'800'}}>{reenviandoPago?'Enviando…':pagoRechazado?'Elegir foto y reenviar':'Elegir foto y enviar'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={cancelarPedido} style={{alignItems:'center',marginTop:12}}>
                  <Text style={{color:'#C53030',fontWeight:'700'}}>Cancelar pedido</Text>
                </TouchableOpacity>
              </>}
            </View>
          )}

          {/* Delivered celebration */}
          {isDelivered && (
            <Animated.View style={[styles.celebrationBanner, { transform: [{ scale: confettiAnim }] }]}>
              <Ionicons name="checkmark-circle" size={48} color={colores.verde} />
              <Text style={styles.celebrationTitle}>¡Tu pedido llegó!</Text>
              <Text style={styles.celebrationSub}>Gracias por usar VIDA</Text>
            </Animated.View>
          )}

          {/* Pedido cancelado */}
          {isCancelado && (
            <View style={styles.canceladoBanner}>
              <Ionicons name="close-circle" size={44} color="#E53E3E" />
              <Text style={styles.canceladoTitle}>Pedido cancelado</Text>
              <Text style={styles.canceladoSub}>
                {estado?.AvisoSinRepartidor
                  ? 'No encontramos un repartidor disponible. No se realizó ningún cobro — puedes intentar de nuevo.'
                  : 'Este pedido fue cancelado. No se realizó ningún cobro.'}
              </Text>
              <TouchableOpacity style={styles.canceladoBtn} onPress={() => router.replace('/(tabs)')}>
                <Text style={styles.canceladoBtnText}>Volver a la tienda</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Aún sin repartidor: el cliente decide */}
          {isBuscando && !!estado?.AvisoSinRepartidor && (
            <View style={styles.sinRepCard}>
              <View style={styles.sinRepHeader}>
                <Ionicons name="alert-circle" size={22} color="#C05621" />
                <Text style={styles.sinRepTitle}>Aún no encontramos repartidor</Text>
              </View>
              <Text style={styles.sinRepSub}>
                Nadie ha tomado tu pedido todavía.
                {estado?.SegundosBusquedaRestantes != null && estado.SegundosBusquedaRestantes > 0
                  ? ` Si nadie lo acepta antes de las ${new Date(Date.now() + estado.SegundosBusquedaRestantes * 1000).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })}, se cancelará automáticamente sin costo.`
                  : ' Puedes seguir esperando o cancelar sin costo.'}
              </Text>
              <View style={styles.sinRepActions}>
                <TouchableOpacity
                  style={[styles.sinRepBtnEsperar, accionBusqueda && { opacity: 0.6 }]}
                  onPress={extenderBusqueda}
                  disabled={accionBusqueda}
                >
                  {accionBusqueda
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <>
                        <Ionicons name="time-outline" size={16} color="#fff" />
                        <Text style={styles.sinRepBtnEsperarText}>Seguir esperando</Text>
                      </>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sinRepBtnCancelar}
                  onPress={cancelarPedido}
                  disabled={accionBusqueda}
                >
                  <Text style={styles.sinRepBtnCancelarText}>Cancelar pedido</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Progress bar */}
          {!isCancelado && (
          <>
          {/* Avance: un segmento por etapa; el actual en celeste */}
          <View style={styles.progressContainer}>
            <View style={styles.segmentos}>
              {PASOS.map((paso, idx) => (
                <Animated.View
                  key={paso.key}
                  style={[
                    styles.segmento,
                    idx < stepIndex && styles.segmentoHecho,
                    idx === stepIndex && styles.segmentoActual,
                    idx === stepIndex && isBuscando && { transform: [{ scaleY: pulseAnim }] },
                  ]}
                />
              ))}
            </View>
            <Text style={styles.progresoTexto}>Etapa {Math.max(0, stepIndex) + 1} de {PASOS.length}</Text>
          </View>

          {/* Status card */}
          <View style={styles.statusCard}>
            <View style={styles.statusIconWrap}>
              <Ionicons
                name={PASOS[Math.max(0, stepIndex)].icon}
                size={32}
                color="#001034"
              />
            </View>
            <View style={styles.statusInfo}>
              <Text style={styles.statusTitle}>
                {PASOS[Math.max(0, stepIndex)].label.replace('\n', ' ')}
              </Text>
              <Text style={styles.statusSub}>
                {isDelivered
                  ? 'Tu pedido fue entregado exitosamente'
                  : isBuscando
                  ? 'Estamos asignando un repartidor para tu pedido...'
                  : 'Tu pedido está en camino'}
              </Text>
            </View>
          </View>
          </>
          )}

          {/* Hora estimada de entrega */}
          {!isDelivered && !isBuscando && (estado?.ETAEntrega || estado?.MinutosRestantes != null) && (
            <View style={styles.etaCard}>
              <View style={styles.etaIconWrap}>
                <Ionicons name="time-outline" size={26} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.etaTitle}>
                  {estado?.MinutosRestantes != null && estado.MinutosRestantes >= 0
                    ? `Llega en ~${estado.MinutosRestantes} min`
                    : 'Llegando pronto'}
                </Text>
                {estado?.ETAEntrega && (
                  <Text style={styles.etaSub}>
                    Hora estimada: {new Date(estado.ETAEntrega).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                )}
                {estado?.ParadasAntes > 0 && (
                  <View style={styles.etaParadasChip}>
                    <Ionicons name="layers-outline" size={12} color="#001034" />
                    <Text style={styles.etaParadasText}>
                      El repartidor tiene {estado.ParadasAntes} entrega{estado.ParadasAntes !== 1 ? 's' : ''} antes que la tuya
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Repartidor info */}
          {repartidor && (
            <View style={styles.repartidorCard}>
              <View style={styles.repartidorTop}>
                {repartidor.FotoURL ? (
                  <Image
                    source={{ uri: BASE_URL_IMG + repartidor.FotoURL }}
                    style={styles.repartidorFoto}
                  />
                ) : (
                  <View style={styles.repartidorAvatar}>
                    <Text style={styles.repartidorInitial}>
                      {(repartidor.Nombre ?? 'R')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.repartidorInfo}>
                  <Text style={styles.repartidorNombre}>{repartidor.Nombre}</Text>
                  <Text style={styles.repartidorLabel}>Tu repartidor</Text>
                  {repartidor.Calificacion != null && (
                    <View style={styles.ratingRow}>
                      <Ionicons name="star" size={13} color="#F6AD55" />
                      <Text style={styles.ratingText}>
                        {parseFloat(repartidor.Calificacion).toFixed(1)}
                        <Text style={styles.ratingTotal}> ({repartidor.TotalCalificaciones ?? 0})</Text>
                      </Text>
                    </View>
                  )}
                </View>
                {repartidor.Telefono && (
                  <TouchableOpacity
                    style={styles.callBtn}
                    onPress={() => Linking.openURL(`tel:${repartidor.Telefono}`)}
                    accessibilityLabel="Llamar al repartidor"
                  >
                    <Ionicons name="call" size={20} color={colores.marino} />
                  </TouchableOpacity>
                )}
              </View>

              {(repartidor.Vehiculo || repartidor.PlacaVehiculo) && (
                <View style={styles.repartidorVehiculo}>
                  <Ionicons name="bicycle-outline" size={15} color="#4B5B73" />
                  <Text style={styles.repartidorVehiculoText}>
                    {[repartidor.Vehiculo, repartidor.PlacaVehiculo].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              )}

              {/* Widget de calificación — solo cuando está entregado */}
              {isDelivered && !calificado && (
                <View style={styles.califSection}>
                  <Text style={styles.califTitle}>¿Cómo fue tu repartidor?</Text>
                  <View style={styles.starsRow}>
                    {[1,2,3,4,5].map(n => (
                      <TouchableOpacity
                        key={n}
                        onPress={() => enviarCalificacion(n)}
                        disabled={enviandoCalif}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={n <= calificacion ? 'star' : 'star-outline'}
                          size={34}
                          color="#F6AD55"
                          style={{ marginHorizontal: 4 }}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                  {enviandoCalif && <ActivityIndicator size="small" color="#001034" style={{ marginTop: 8 }} />}
                </View>
              )}

              {isDelivered && calificado && (
                <View style={styles.califDone}>
                  <Ionicons name="checkmark-circle" size={18} color="#4DAD66" />
                  <Text style={styles.califDoneText}>Calificación enviada. ¡Gracias!</Text>
                </View>
              )}
            </View>
          )}

          {/* Mapa de seguimiento: repartidor en movimiento + destino */}
          {!isDelivered && !isCancelado && (
            <MapaTracking
              estado={estado}
              enCamino={normalizeStatus(estado?.EstadoPedido ?? estado?.estado ?? estado?.Status) === 'EN_CAMINO'}
            />
          )}

          {/* Order summary */}
          {estado?.items && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Resumen del pedido</Text>
              {estado.items.map((item, i) => (
                <View key={i} style={styles.orderItem}>
                  <Text style={styles.orderItemQty}>{item.Cantidad}x</Text>
                  <Text style={styles.orderItemName}>{item.Nombre ?? item.nombre}</Text>
                  <Text style={styles.orderItemPrice}>
                    ${(item.PrecioUSD * item.Cantidad).toFixed(2)}
                  </Text>
                </View>
              ))}
              <View style={styles.divider} />
              <View style={styles.orderTotal}>
                <Text style={styles.orderTotalLabel}>Total</Text>
                <Text style={styles.orderTotalValue}>
                  {(estado.TotalUSD ?? estado.total) != null ? fmtUSD(estado.TotalUSD ?? estado.total) : '—'}
                  {montoVESDelPedido(estado) ? `  ·  ${montoVESDelPedido(estado)}` : ''}
                </Text>
              </View>
            </View>
          )}

          {estado?.DireccionEntrega && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Dirección de entrega</Text>
              <View style={styles.addressRow}>
                <Ionicons name="location-outline" size={18} color="#001034" />
                <Text style={styles.addressText}>{estado.DireccionEntrega}</Text>
              </View>
            </View>
          )}

          {isDelivered && (
            <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/(tabs)')}>
              <Text style={styles.homeBtnText}>Volver al inicio</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const tarjeta = {
  backgroundColor: colores.blanco, borderRadius: radios.grande, padding: 16, marginBottom: 12,
  borderWidth: 1, borderColor: colores.borde,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },
  headerCerrar: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  loadingText: { marginTop: 12, color: colores.textoSuave },
  errorText: { color: colores.error, textAlign: 'center' },
  retryBtn: { marginTop: 12, backgroundColor: colores.marino, borderRadius: 14, paddingHorizontal: 22, minHeight: 44, justifyContent: 'center' },
  retryBtnText: { color: colores.blanco, fontWeight: '800' },
  scroll: { padding: 16, paddingBottom: 40 },

  celebrationBanner: { ...tarjeta, alignItems: 'center', padding: 22, backgroundColor: colores.verdeClaro, borderColor: '#A8DDB6' },
  celebrationEmoji: { fontSize: 40 },
  celebrationTitle: { fontSize: 24, fontWeight: '800', color: colores.marino, marginTop: 8 },
  celebrationSub: { color: colores.verdeTexto, marginTop: 4, fontWeight: '700' },

  canceladoBanner: { ...tarjeta, alignItems: 'center', padding: 24, backgroundColor: colores.errorClaro, borderColor: '#F5C2C2' },
  canceladoTitle: { fontSize: 20, fontWeight: '800', color: colores.error, marginTop: 10 },
  canceladoSub: { color: colores.error, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  canceladoBtn: { backgroundColor: colores.marino, borderRadius: radios.medio, minHeight: 48, paddingHorizontal: 28, marginTop: 16, justifyContent: 'center' },
  canceladoBtnText: { color: colores.blanco, fontWeight: '800', fontSize: 14 },

  sinRepCard: { ...tarjeta, backgroundColor: colores.avisoClaro, borderColor: '#F6D58A' },
  sinRepHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sinRepTitle: { fontSize: 15, fontWeight: '800', color: colores.marino, flex: 1 },
  sinRepSub: { fontSize: 13, color: '#7A5A12', lineHeight: 19, marginTop: 8 },
  sinRepActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  sinRepBtnEsperar: {
    flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colores.marino, borderRadius: radios.medio, minHeight: 48,
  },
  sinRepBtnEsperarText: { color: colores.blanco, fontWeight: '800', fontSize: 14 },
  sinRepBtnCancelar: {
    flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48,
    backgroundColor: colores.blanco, borderRadius: radios.medio, borderWidth: 1.5, borderColor: colores.error,
  },
  sinRepBtnCancelarText: { color: colores.error, fontWeight: '800', fontSize: 14 },

  progressContainer: { ...tarjeta, gap: 10 },
  segmentos: { flexDirection: 'row', gap: 6 },
  segmento: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colores.borde },
  segmentoHecho: { backgroundColor: colores.marino },
  segmentoActual: { backgroundColor: colores.celeste },
  progresoTexto: { fontSize: 12, fontWeight: '800', color: colores.textoSuave },

  statusCard: { ...tarjeta, flexDirection: 'row', alignItems: 'center' },
  statusIconWrap: {
    width: 56, height: 56, borderRadius: 18, backgroundColor: colores.celesteClaro,
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  statusInfo: { flex: 1 },
  statusTitle: { fontSize: 20, fontWeight: '700', color: colores.marino },
  statusSub: { fontSize: 14, color: colores.textoSuave, marginTop: 3 },

  etaCard: {
    backgroundColor: colores.marino, borderRadius: radios.grande, padding: 18,
    flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12,
  },
  etaIconWrap: { width: 50, height: 50, borderRadius: 25, backgroundColor: colores.marinoClaro, justifyContent: 'center', alignItems: 'center' },
  etaTitle: { color: colores.blanco, fontSize: 24, fontWeight: '800' },
  etaSub: { color: colores.sobreMarino, fontSize: 13, marginTop: 2 },
  etaParadasChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colores.celeste,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, marginTop: 8, alignSelf: 'flex-start',
  },
  etaParadasText: { color: colores.marino, fontSize: 11, fontWeight: '800' },

  repartidorCard: tarjeta,
  repartidorTop: { flexDirection: 'row', alignItems: 'center' },
  repartidorFoto: { width: 54, height: 54, borderRadius: 27, marginRight: 12, backgroundColor: colores.celesteClaro },
  repartidorAvatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colores.marino, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  repartidorInitial: { color: colores.blanco, fontSize: 20, fontWeight: '800' },
  repartidorInfo: { flex: 1 },
  repartidorNombre: { fontSize: 16, fontWeight: '800', color: colores.marino },
  repartidorLabel: { fontSize: 12, color: colores.textoSuave },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  ratingText: { fontSize: 13, fontWeight: '800', color: colores.marino },
  ratingTotal: { fontSize: 11, color: colores.textoSuave, fontWeight: '400' },
  repartidorVehiculo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colores.borde },
  repartidorVehiculoText: { fontSize: 13, color: colores.textoSuave },
  callBtn: { backgroundColor: colores.celeste, width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  califSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colores.borde, alignItems: 'center' },
  califTitle: { fontSize: 15, fontWeight: '800', color: colores.marino, marginBottom: 10 },
  starsRow: { flexDirection: 'row', alignItems: 'center' },
  califDone: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colores.borde, justifyContent: 'center' },
  califDoneText: { fontSize: 13, color: colores.verdeTexto, fontWeight: '700' },

  mapPlaceholder: { height: 160, backgroundColor: colores.borde, borderRadius: radios.grande, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  mapPlaceholderText: { color: colores.textoSuave, marginTop: 8, fontSize: 13 },

  section: tarjeta,
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colores.marino, marginBottom: 10 },
  orderItem: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  orderItemQty: { fontSize: 14, fontWeight: '800', color: colores.marino, width: 32 },
  orderItemName: { flex: 1, fontSize: 14, color: colores.marino },
  orderItemPrice: { fontSize: 14, fontWeight: '800', color: colores.marino },
  divider: { height: 1, backgroundColor: colores.borde, marginVertical: 8 },
  orderTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  orderTotalLabel: { fontSize: 15, fontWeight: '800', color: colores.marino },
  orderTotalValue: { fontSize: 16, color: colores.marino, fontFamily: fuentes.titulo, flexShrink: 1, textAlign: 'right' },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  addressText: { flex: 1, color: '#2C3D58', fontSize: 14, lineHeight: 20 },

  homeBtn: { backgroundColor: colores.marino, borderRadius: 18, minHeight: 56, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  homeBtnText: { color: colores.blanco, fontSize: 16, fontWeight: '800' },
});
