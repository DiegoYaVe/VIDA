// Seguimiento del pedido (diseño "Agua VIDA"). Dos caras:
//  - Pago Móvil pendiente: "Paga con Pago Móvil" con el monto en Bs, los
//    datos de la cuenta (copiables), la referencia, la captura y el plazo.
//  - Seguimiento: mapa arriba y hoja con la etapa, el repartidor, lo que hay
//    que tener listo para pagar y el detalle del pedido.
import { useState, useEffect, useRef, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView, Linking, ActivityIndicator, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { Text, TextInput } from '../../components/Texto';
import { BotonAtras, Chevron } from '../../components/Cabecera';
import MapaTracking from '../../components/MapaTracking';
import api from '../../services/api';
import useAuthStore from '../../store/authStore';
import { WS_URL, API_URL } from '../../constants/config';
import { igtfDelPedido, fmtUSD, fmtVES } from '../../services/moneda';
import { colores, fuentes } from '../../constants/tema';

const ETAPAS = ['Recibido', 'Preparando', 'En camino', 'Entregado'];
function etapaDe(s) {
  if (s === 'ENTREGADO') return 3;
  if (s === 'EN_CAMINO') return 2;
  if (['REPARTIDOR_ASIGNADO', 'IR_A_SUCURSAL', 'EN_SUCURSAL'].includes(s)) return 1;
  return 0;
}
const snapshot = (e) => { let p = e?.PagoMonedaJSON; if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } } return p; };
const iniciales = (n) => String(n || 'R').split(' ').filter(Boolean).map((x) => x[0]).join('').slice(0, 2).toUpperCase();

function IconoTelefono() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colores.marino} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
    </Svg>
  );
}
function IconoReloj() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colores.celeste} strokeWidth={2.2} strokeLinecap="round">
      <Circle cx={12} cy={12} r={9} /><Path d="M12 7v5l3 2" />
    </Svg>
  );
}
function IconoCamara() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={colores.marino} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={5} width={18} height={14} rx={3} /><Circle cx={12} cy={12} r={3.2} /><Path d="M8 5l1.5-2h5L16 5" />
    </Svg>
  );
}

export default function SeguimientoScreen() {
  const { idPedido } = useLocalSearchParams();
  const router = useRouter();
  const { token, setPostLoginRedirect } = useAuthStore();

  useEffect(() => {
    if (!token) { setPostLoginRedirect(`/pedido/${idPedido}`); router.replace('/(auth)/login'); }
  }, [token]);

  const [estado, setEstado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verDetalle, setVerDetalle] = useState(false);
  const [calificacion, setCalificacion] = useState(0);
  const [calificado, setCalificado] = useState(false);
  const [accion, setAccion] = useState(false);
  // Pago Móvil
  const [datosPM, setDatosPM] = useState(null);
  const [referencia, setReferencia] = useState('');
  const [captura, setCaptura] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [ahora, setAhora] = useState(Date.now());

  const wsRef = useRef(null);
  const status = String(estado?.Status || '').toUpperCase();
  const cancelado = status === 'CANCELADO';
  const entregado = status === 'ENTREGADO';
  const esperandoPago = status === 'ESPERANDO_PAGO';
  const rechazado = esperandoPago && estado?.StatusPago === 'RECHAZADO';
  const enRevision = esperandoPago && !rechazado && (estado?.ComprobantesPendientes == null || Number(estado.ComprobantesPendientes) > 0);
  const pantallaPago = esperandoPago && !enRevision;

  const fetchEstado = useCallback(async () => {
    try {
      const res = await api.get(`/delivery/pedido/${idPedido}/estado`);
      const data = res.data?.pedido ?? res.data;
      setEstado({ ...data, recibidoEn: Date.now() });
      if (data?.YaCalificado) setCalificado(true);
      setError('');
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  }, [idPedido]);

  useEffect(() => {
    fetchEstado();
    const t = setInterval(() => { if (!entregado && !cancelado) fetchEstado(); }, 10000);
    return () => clearInterval(t);
  }, [fetchEstado, entregado, cancelado]);
  // Reloj para la cuenta regresiva del plazo de pago
  useEffect(() => { if (!pantallaPago) return; const t = setInterval(() => setAhora(Date.now()), 15000); return () => clearInterval(t); }, [pantallaPago]);
  useEffect(() => {
    if (!pantallaPago || datosPM) return;
    api.get('/delivery/pago-movil', { params: { idBranch: useAuthStore.getState().idBranch, idCuenta: useAuthStore.getState().idCuenta } })
      .then((r) => setDatosPM(r.data)).catch(() => setDatosPM({ disponible: false }));
  }, [pantallaPago]);

  // WebSocket: cambios de estado, repartidor en movimiento y hora estimada
  useEffect(() => {
    if (!token) return;
    try {
      const ws = new WebSocket(`${WS_URL}?token=${token}`);
      wsRef.current = ws;
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (String(msg.idPedido) !== String(idPedido)) return;
          if (msg.tipo === 'status_pedido') setEstado((p) => ({ ...p, Status: msg.estado }));
          if (['pedido_asignado', 'pedido_liberado', 'busqueda_sin_repartidor'].includes(msg.tipo)) fetchEstado();
          if (msg.tipo === 'ubicacion_repartidor') setEstado((p) => (p ? { ...p, LatRepartidor: msg.Latitud, LonRepartidor: msg.Longitud } : p));
          if (msg.tipo === 'eta_pedido') setEstado((p) => (p ? { ...p, ETAEntrega: msg.ETAEntrega, MinutosRestantes: msg.MinutosRestantes, ParadasAntes: msg.ParadasAntes } : p));
        } catch {}
      };
      ws.onerror = () => {};
    } catch {}
    return () => wsRef.current?.close();
  }, [token, idPedido]);

  const cancelarPedido = () => {
    Alert.alert('Cancelar pedido', '¿Seguro que quieres cancelar este pedido?', [
      { text: 'No', style: 'cancel' },
      { text: 'Sí, cancelar', style: 'destructive', onPress: async () => {
        setAccion(true);
        try { await api.post(`/delivery/pedido/${idPedido}/cancelar`); setEstado((p) => (p ? { ...p, Status: 'CANCELADO' } : p)); }
        catch (e) { Alert.alert('No se pudo cancelar', e.response?.data?.error || 'Intenta de nuevo.'); fetchEstado(); }
        finally { setAccion(false); }
      } },
    ]);
  };
  const extenderBusqueda = async () => {
    setAccion(true);
    try { const r = await api.post(`/delivery/pedido/${idPedido}/extender-busqueda`); await fetchEstado(); Alert.alert('Listo', `Seguimos buscando repartidor ${r.data.minutosExtra} minutos más.`); }
    catch (e) { Alert.alert('No se pudo', e.response?.data?.error || 'Intenta de nuevo.'); fetchEstado(); }
    finally { setAccion(false); }
  };
  const calificar = async (n) => {
    if (calificado) return;
    setCalificacion(n);
    try { await api.post(`/delivery/pedido/${idPedido}/calificar`, { Estrellas: n }); setCalificado(true); }
    catch { Alert.alert('No se pudo enviar', 'Intenta de nuevo.'); setCalificacion(0); }
  };
  const elegirCaptura = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.75 });
    if (!r.canceled && r.assets?.[0]) setCaptura(r.assets[0]);
  };
  const enviarComprobante = async () => {
    if (!referencia.trim()) return Alert.alert('Falta la referencia', 'Escribe el número de referencia de tu Pago Móvil.');
    if (!captura) return Alert.alert('Falta la captura', 'Sube la captura del pago.');
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append('Referencia', referencia.trim());
      fd.append('file', { uri: captura.uri, name: captura.fileName || `comprobante_${idPedido}.jpg`, type: captura.mimeType || 'image/jpeg' });
      await api.post(`/delivery/pedido/${idPedido}/comprobante`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setReferencia(''); setCaptura(null);
      await fetchEstado();
    } catch (e) { Alert.alert('No se pudo enviar', e.response?.data?.error || e.message); }
    finally { setEnviando(false); }
  };
  const copiar = async (t) => { try { await Clipboard.setStringAsync(String(t)); } catch {} };

  if (loading || error) {
    return (
      <SafeAreaView style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centro}>
          {loading ? <ActivityIndicator size="large" color={colores.marino} /> : (
            <>
              <Text style={styles.errorTexto}>{error}</Text>
              <TouchableOpacity style={styles.botonMarino} onPress={fetchEstado}><Text style={styles.botonMarinoTexto}>Reintentar</Text></TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const snap = snapshot(estado);
  const igtf = igtfDelPedido(estado);
  const totalUSD = Number(estado?.TotalUSD || 0) + igtf;
  const montoBs = snap?.Moneda === 'VES' ? Number(snap.TotalOriginal ?? snap.TotalVES) : null;

  // ── Pago Móvil pendiente ────────────────────────────────────────────────
  if (pantallaPago) {
    const segRestantes = estado?.SegundosPagoRestantes != null
      ? Math.max(0, estado.SegundosPagoRestantes - Math.round((ahora - (estado.recibidoEn || ahora)) / 1000)) : null;
    const datos = datosPM?.disponible ? [
      ['Banco', datosPM.Banco], ['Teléfono', datosPM.Telefono], ['Cédula / RIF', datosPM.Cedula], ['Titular', datosPM.Titular],
    ].filter(([, v]) => v) : [];
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.pm} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.cabecera}>
            <BotonAtras onPress={() => router.replace('/(tabs)')} />
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.titulo}>Paga con Pago Móvil</Text>
              <Text style={styles.sub}>Pedido #{idPedido} · esperando tu pago</Text>
            </View>
          </View>
          {rechazado && <Text style={styles.rechazo}>Revisamos tu comprobante anterior y no coincide. Envía uno nuevo.</Text>}

          <View style={styles.pmMonto}>
            <Text style={styles.pmEtiqueta}>Monto exacto a transferir</Text>
            <Text style={styles.pmBs} numberOfLines={1} adjustsFontSizeToFit>{montoBs != null ? fmtVES(montoBs) : fmtUSD(totalUSD)}</Text>
            <Text style={styles.pmEtiqueta}>Equivale a {fmtUSD(totalUSD)} · tasa congelada de tu pedido</Text>
            {segRestantes != null && (
              <View style={styles.pmPlazo}>
                <IconoReloj />
                <Text style={styles.pmPlazoTexto}>Envía el comprobante en los próximos <Text style={{ fontWeight: '800', color: colores.celeste }}>{Math.ceil(segRestantes / 60)} min</Text></Text>
              </View>
            )}
          </View>

          <View style={[styles.tarjeta, { paddingVertical: 6 }]}>
            {datosPM === null ? <ActivityIndicator color={colores.marino} style={{ margin: 16 }} /> : datos.length === 0 ? (
              <Text style={styles.nota}>La tienda aún no tiene sus datos de Pago Móvil. Comunícate con ella o cancela el pedido.</Text>
            ) : datos.map(([e, v], i) => (
              <View key={e} style={[styles.dato, i < datos.length - 1 && styles.borde]}>
                <View style={{ flexShrink: 1 }}>
                  <Text style={styles.datoEtiqueta}>{e}</Text>
                  <Text style={styles.datoValor}>{v}</Text>
                </View>
                <TouchableOpacity style={styles.copiar} onPress={() => copiar(v)} accessibilityLabel={`Copiar ${e}`}><Text style={styles.copiarTexto}>Copiar</Text></TouchableOpacity>
              </View>
            ))}
          </View>

          <View style={{ gap: 10 }}>
            <View style={{ gap: 6 }}>
              <Text style={styles.campoEtiqueta}>Número de referencia</Text>
              <TextInput style={styles.campo} placeholder="Últimos dígitos de la operación" placeholderTextColor={colores.textoTenue}
                value={referencia} onChangeText={setReferencia} keyboardType="number-pad" />
            </View>
            <TouchableOpacity style={styles.subir} onPress={elegirCaptura}>
              {captura ? <Image source={{ uri: captura.uri }} style={styles.subirImg} /> : <IconoCamara />}
              <Text style={styles.subirTexto}>{captura ? 'Captura lista · toca para cambiarla' : 'Subir captura del pago'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        <View style={styles.pmPie}>
          <TouchableOpacity style={[styles.botonMarino, enviando && { opacity: 0.7 }]} onPress={enviarComprobante} disabled={enviando}>
            {enviando ? <ActivityIndicator color={colores.blanco} /> : <Text style={styles.botonMarinoTexto}>Enviar comprobante</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.enlace} onPress={cancelarPedido} disabled={accion}><Text style={styles.enlaceRojo}>Cancelar pedido</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Seguimiento ─────────────────────────────────────────────────────────
  const etapa = etapaDe(status);
  const buscando = status === 'BUSCANDO_REPARTIDOR';
  const etiqueta = cancelado ? 'Cancelado' : enRevision ? 'Revisando tu pago' : buscando ? 'Buscando repartidor' : ETAPAS[etapa];
  const titulo = cancelado ? 'Pedido cancelado'
    : entregado ? '¡Tu pedido llegó!'
    : enRevision ? 'Validando tu Pago Móvil'
    : buscando ? 'Buscando quién te lo lleve'
    : estado?.MinutosRestantes != null && estado.MinutosRestantes >= 0 ? `Llega en ${estado.MinutosRestantes} min`
    : etapa === 2 ? 'Va en camino' : 'Preparando tu pedido';
  const rep = estado?.NombreRepartidor ? {
    Nombre: estado.NombreRepartidor, Telefono: estado.TelefonoRepartidor, FotoURL: estado.FotoRepartidor,
    Vehiculo: estado.VehiculoRepartidor, Placa: estado.PlacaRepartidor, Calificacion: estado.CalificacionRepartidor,
  } : null;
  const items = estado?.items || [];
  const nProductos = items.reduce((a, i) => a + Number(i.Cantidad || 0), 0);
  const metodo = String(estado?.MetodoPago || '').toUpperCase();
  // Efectivo combinado: una parte en dólares y el resto en bolívares
  const mixto = snap?.Moneda === 'MIXTA' ? snap.Desglose || {} : null;
  const montoCobro = mixto
    ? `${fmtUSD(Number(mixto.USD?.Monto || 0))} + ${fmtVES(Number(mixto.VES?.Monto || 0))}`
    : montoBs != null ? fmtVES(montoBs) : `${fmtUSD(totalUSD)} USD`;
  // Cambio que lleva el repartidor (el cliente dijo con cuánto paga)
  const cambio = mixto
    ? [Number(mixto.USD?.Cambio) > 0 && fmtUSD(Number(mixto.USD.Cambio)), Number(mixto.VES?.Cambio) > 0 && fmtVES(Number(mixto.VES.Cambio))].filter(Boolean)
    : Number(snap?.Cambio) > 0 ? [snap.Moneda === 'VES' ? fmtVES(Number(snap.Cambio)) : fmtUSD(Number(snap.Cambio))] : [];
  const cobro = metodo === 'PAGO_MOVIL'
    ? { etiqueta: 'Pagado con Pago Móvil', monto: montoBs != null ? fmtVES(montoBs) : fmtUSD(totalUSD) }
    : metodo === 'EFECTIVO'
      ? { etiqueta: entregado ? 'Pagaste en efectivo' : 'Ten listo en efectivo', monto: montoCobro,
          nota: !entregado && cambio.length ? `Te llevan ${cambio.join(' y ')} de cambio` : null }
      : { etiqueta: entregado ? 'Pagaste con tarjeta' : 'Pagas con tarjeta al recibir', monto: montoBs != null ? fmtVES(montoBs) : fmtUSD(totalUSD) };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View style={styles.mapa}>
          <MapaTracking estado={estado} />
          <SafeAreaView edges={['top']} style={styles.mapaArriba} pointerEvents="box-none">
            <TouchableOpacity style={styles.volverRedondo} onPress={() => router.replace('/(tabs)')} accessibilityLabel="Volver"><Chevron /></TouchableOpacity>
          </SafeAreaView>
        </View>

        <View style={styles.hoja}>
          <View style={styles.fila}>
            <View style={{ flexShrink: 1 }}>
              <Text style={[styles.etiquetaEstado, cancelado && { color: colores.error }]}>{etiqueta}</Text>
              <Text style={styles.tituloEstado}>{titulo}</Text>
            </View>
            <Text style={styles.sub}>Pedido #{idPedido}</Text>
          </View>

          {!cancelado && (
            <View style={styles.etapas}>
              {ETAPAS.map((e, i) => {
                const hecha = i < etapa || entregado;
                const actual = i === etapa && !entregado;
                return (
                  <View key={e} style={styles.etapa}>
                    <View style={[styles.etapaBarra, { backgroundColor: hecha ? colores.marino : actual ? colores.celeste : colores.borde }]} />
                    <Text style={[styles.etapaTexto, !(hecha || actual) && { color: colores.textoSuave }]}>{e}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {buscando && estado?.AvisoSinRepartidor ? (
            <View style={styles.aviso}>
              <Text style={styles.avisoTitulo}>Aún no encontramos repartidor</Text>
              <Text style={styles.nota}>Puedes seguir esperando o cancelar sin costo.</Text>
              <View style={styles.avisoAcciones}>
                <TouchableOpacity style={[styles.botonMarino, { flex: 1, height: 46 }]} onPress={extenderBusqueda} disabled={accion}><Text style={styles.botonMarinoTexto}>Seguir esperando</Text></TouchableOpacity>
                <TouchableOpacity style={styles.enlace} onPress={cancelarPedido} disabled={accion}><Text style={styles.enlaceRojo}>Cancelar</Text></TouchableOpacity>
              </View>
            </View>
          ) : null}

          {rep && !cancelado && (
            <View style={styles.rep}>
              {rep.FotoURL ? <Image source={{ uri: API_URL.replace('/api', '') + rep.FotoURL }} style={styles.repFoto} />
                : <View style={styles.repFoto}><Text style={styles.repIniciales}>{iniciales(rep.Nombre)}</Text></View>}
              <View style={{ flex: 1 }}>
                <Text style={styles.repNombre} numberOfLines={1}>{String(rep.Nombre).split(' ')[0]} {String(rep.Nombre).split(' ')[1]?.[0] ? `${String(rep.Nombre).split(' ')[1][0]}.` : ''} · tu repartidor</Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {[rep.Vehiculo, rep.Placa ? `placa ${rep.Placa}` : null, rep.Calificacion != null ? Number(rep.Calificacion).toLocaleString('es-VE', { maximumFractionDigits: 1 }) : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {rep.Telefono ? (
                <TouchableOpacity style={styles.llamar} onPress={() => Linking.openURL(`tel:${rep.Telefono}`)} accessibilityLabel="Llamar al repartidor"><IconoTelefono /></TouchableOpacity>
              ) : null}
            </View>
          )}

          {entregado && rep && (
            <View style={styles.calificar}>
              <Text style={styles.avisoTitulo}>{calificado ? '¡Gracias por calificar!' : `¿Cómo te atendió ${String(rep.Nombre).split(' ')[0]}?`}</Text>
              {!calificado && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <TouchableOpacity key={n} onPress={() => calificar(n)} style={[styles.estrella, n <= calificacion && { backgroundColor: colores.celeste }]} accessibilityLabel={`${n} estrellas`}>
                      <Text style={styles.estrellaTexto}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {!cancelado && (
            <View style={styles.cobro}>
              <View style={{ flex: 1 }}>
                <Text style={styles.datoEtiqueta}>{cobro.etiqueta}</Text>
                <Text style={styles.cobroMonto} numberOfLines={1} adjustsFontSizeToFit>{cobro.monto}</Text>
                {cobro.nota ? <Text style={styles.cobroNota}>{cobro.nota}</Text> : null}
              </View>
              <Text style={styles.cobroItems} numberOfLines={2}>
                {nProductos} producto{nProductos === 1 ? '' : 's'}{'\n'}{items.slice(0, 2).map((i) => i.Nombre).join(' y ')}
              </Text>
            </View>
          )}

          {cancelado && (
            <TouchableOpacity style={styles.botonMarino} onPress={() => router.replace('/(tabs)')}><Text style={styles.botonMarinoTexto}>Volver a la tienda</Text></TouchableOpacity>
          )}

          {verDetalle && (
            <View style={[styles.tarjeta, { paddingVertical: 6 }]}>
              {items.map((i, k) => (
                <View key={k} style={[styles.dato, styles.borde]}>
                  <Text style={styles.detalleNombre} numberOfLines={1}>{i.Cantidad} × {i.Nombre}</Text>
                  <Text style={styles.detallePrecio}>{fmtUSD(i.PrecioUSD * i.Cantidad)}</Text>
                </View>
              ))}
              {igtf > 0 && <View style={[styles.dato, styles.borde]}><Text style={styles.detalleNombre}>IGTF 3% (pago en dólares)</Text><Text style={styles.detallePrecio}>{fmtUSD(igtf)}</Text></View>}
              <View style={styles.dato}><Text style={[styles.detalleNombre, { fontWeight: '800' }]}>Total</Text><Text style={styles.detallePrecio}>{fmtUSD(totalUSD)}{montoBs != null ? ` · ${fmtVES(montoBs)}` : ''}</Text></View>
              {estado?.DireccionEntrega ? <Text style={[styles.nota, { paddingBottom: 10 }]}>Entrega en {estado.DireccionEntrega}</Text> : null}
            </View>
          )}
          <TouchableOpacity style={styles.enlace} onPress={() => setVerDetalle((v) => !v)}>
            <Text style={styles.enlaceTexto}>{verDetalle ? 'Ocultar detalle' : 'Ver detalle del pedido'}</Text>
          </TouchableOpacity>
          {buscando && !estado?.AvisoSinRepartidor && (
            <TouchableOpacity style={styles.enlace} onPress={cancelarPedido} disabled={accion}><Text style={styles.enlaceRojo}>Cancelar pedido</Text></TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  errorTexto: { color: colores.error, textAlign: 'center' },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titulo: { fontFamily: fuentes.tituloFuerte, fontSize: 22, color: colores.marino },
  sub: { fontSize: 13, color: colores.textoSuave },
  nota: { fontSize: 13, color: colores.textoSuave, lineHeight: 18 },
  rechazo: { backgroundColor: colores.errorClaro, color: colores.error, borderRadius: 14, padding: 12, fontSize: 14, fontWeight: '700' },

  // Pago Móvil
  pm: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 14 },
  pmMonto: { backgroundColor: colores.marino, borderRadius: 24, padding: 18, gap: 4 },
  pmEtiqueta: { fontSize: 13, color: colores.sobreMarino },
  pmBs: { fontFamily: fuentes.tituloFuerte, fontSize: 34, color: colores.blanco },
  pmPlazo: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  pmPlazoTexto: { flex: 1, fontSize: 14, color: colores.blanco },
  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 22, paddingHorizontal: 14 },
  dato: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, gap: 10 },
  borde: { borderBottomWidth: 1, borderBottomColor: '#EEF6F8' },
  datoEtiqueta: { fontSize: 12, color: colores.textoSuave, fontWeight: '700' },
  datoValor: { fontWeight: '800', fontSize: 16, color: colores.marino },
  copiar: { height: 36, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colores.celesteClaro, justifyContent: 'center' },
  copiarTexto: { fontWeight: '800', fontSize: 13, color: colores.marino },
  campoEtiqueta: { fontSize: 14, fontWeight: '800', color: colores.marino },
  campo: { height: 50, borderRadius: 16, borderWidth: 1.5, borderColor: colores.bordeFuerte, backgroundColor: colores.blanco, paddingHorizontal: 16, fontSize: 15, color: colores.marino },
  subir: { minHeight: 84, borderRadius: 18, borderWidth: 2, borderStyle: 'dashed', borderColor: '#8ACFE2', backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 10 },
  subirImg: { width: 52, height: 52, borderRadius: 10 },
  subirTexto: { fontWeight: '800', fontSize: 14, color: colores.marino },
  pmPie: { paddingHorizontal: 20, paddingBottom: 12, gap: 2 },

  botonMarino: { height: 58, borderRadius: 18, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  botonMarinoTexto: { color: colores.blanco, fontWeight: '800', fontSize: 17 },
  enlace: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  enlaceTexto: { fontWeight: '800', fontSize: 15, color: colores.marino, textDecorationLine: 'underline' },
  enlaceRojo: { fontWeight: '800', fontSize: 14, color: '#8A2B2B' },

  // Seguimiento
  mapa: { height: 360, backgroundColor: '#DDEFF5' },
  mapaArriba: { position: 'absolute', top: 0, left: 0, right: 0 },
  volverRedondo: { marginLeft: 16, marginTop: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center' },
  hoja: { flex: 1, marginTop: -30, backgroundColor: colores.blanco, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 30, gap: 16 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  etiquetaEstado: { fontSize: 13, fontWeight: '800', color: colores.marinoClaro, letterSpacing: 0.8, textTransform: 'uppercase' },
  tituloEstado: { fontFamily: fuentes.tituloFuerte, fontSize: 28, lineHeight: 34, color: colores.marino },
  etapas: { flexDirection: 'row', gap: 6 },
  etapa: { flex: 1, gap: 6 },
  etapaBarra: { height: 6, borderRadius: 3 },
  etapaTexto: { fontSize: 11, fontWeight: '800', color: colores.marino },
  aviso: { backgroundColor: colores.avisoClaro, borderRadius: 18, padding: 14, gap: 8 },
  avisoTitulo: { fontWeight: '800', fontSize: 15, color: colores.marino },
  avisoAcciones: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rep: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colores.fondo, borderRadius: 20, padding: 12 },
  repFoto: { width: 50, height: 50, borderRadius: 25, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  repIniciales: { fontFamily: fuentes.titulo, fontSize: 16, color: colores.blanco },
  repNombre: { fontWeight: '800', fontSize: 15, color: colores.marino },
  llamar: { width: 46, height: 46, borderRadius: 15, backgroundColor: colores.celeste, alignItems: 'center', justifyContent: 'center' },
  calificar: { gap: 10, alignItems: 'flex-start' },
  estrella: { width: 44, height: 44, borderRadius: 14, backgroundColor: colores.fondo, alignItems: 'center', justifyContent: 'center' },
  estrellaTexto: { fontWeight: '800', fontSize: 16, color: colores.marino },
  cobro: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: colores.borde, borderRadius: 20, padding: 14 },
  cobroMonto: { fontFamily: fuentes.tituloFuerte, fontSize: 22, color: colores.marino },
  cobroNota: { fontSize: 12, fontWeight: '700', color: colores.verdeTexto },
  cobroItems: { fontSize: 12, color: colores.textoSuave, textAlign: 'right', maxWidth: 150 },
  detalleNombre: { flex: 1, fontSize: 14, color: colores.marino },
  detallePrecio: { fontFamily: fuentes.titulo, fontSize: 14, color: colores.marino },
});
