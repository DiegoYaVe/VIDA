// Carrito y pago (diseño "Agua VIDA"): productos con cantidad, cupón y
// puntos, dirección de entrega, forma de pago y hoja fija con el total.
// Efectivo: en dólares, bolívares o combinado (una parte en dólares y el
// resto en bolívares), con "¿Con cuánto pagas?" para que el repartidor lleve
// cambio. Tarjeta: con el punto de venta al recibir. Pago Móvil crea el
// pedido en ESPERANDO_PAGO y abre su pantalla de pago.
import { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Alert, ScrollView, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextInput } from '../../components/Texto';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import api from '../../services/api';
import useCarritoStore from '../../store/carritoStore';
import useAuthStore from '../../store/authStore';
import { absImg } from '../../constants/config';
import SelectorUbicacion from '../../components/SelectorUbicacion';
import { BotonAtras } from '../../components/Cabecera';
import { IconoCarrito } from '../../components/BarraInferior';
import { colores, fuentes } from '../../constants/tema';
import { useTasaReferencial, fmtUSD, fmtVES } from '../../services/moneda';

const FONDOS = ['#DDF2F8', '#EADCCB', '#F8D9D9', '#FBE3B8', '#E3F3E7'];
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
// Lo que escribe el cliente: admite coma decimal; vacío = no informado
const leerMonto = (s) => {
  const t = String(s ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? r2(n) : NaN;
};
const BILLETES_USD = [5, 10, 20, 50, 100];

export default function CarritoScreen() {
  const router = useRouter();
  const { token, setPostLoginRedirect } = useAuthStore();

  const items = useCarritoStore((s) => s.items);
  const idPuntoVenta = useCarritoStore((s) => s.idPuntoVenta);
  const nombreSucursal = useCarritoStore((s) => s.nombreSucursal);
  const agregarItem = useCarritoStore((s) => s.agregarItem);
  const quitarItem = useCarritoStore((s) => s.quitarItem);
  const limpiarCarrito = useCarritoStore((s) => s.limpiarCarrito);
  const subtotal = r2(items.reduce((a, i) => a + i.PrecioUSD * i.Cantidad, 0));

  const [direccion, setDireccion] = useState('');
  const [ubicacion, setUbicacion] = useState(null);
  const [notas, setNotas] = useState('');
  const [direcciones, setDirecciones] = useState([]);
  const [editandoEntrega, setEditandoEntrega] = useState(false);
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [metodoPago, setMetodoPago] = useState('EFECTIVO');
  const [monedaEfectivo, setMonedaEfectivo] = useState('USD'); // USD | VES | MIXTA
  const [parteUSDTexto, setParteUSDTexto] = useState('');
  const [pagaConUSDTexto, setPagaConUSDTexto] = useState('');
  const [pagaConVESTexto, setPagaConVESTexto] = useState('');
  const [cotizacion, setCotizacion] = useState(null);
  const [errorTasa, setErrorTasa] = useState('');
  const [loading, setLoading] = useState(false);

  // Puntos (canje)
  const [puntosData, setPuntosData] = useState(null);
  const [usarPuntos, setUsarPuntos] = useState(false);
  const canjeRate = puntosData?.puntosPorDolarCanje || 100;
  const saldoPuntos = puntosData?.saldo || 0;
  const puntosUsar = usarPuntos ? Math.min(saldoPuntos, Math.floor(subtotal * canjeRate)) : 0;
  const descuentoPuntos = r2(puntosUsar / canjeRate);
  const totalPagar = r2(subtotal - descuentoPuntos);

  // Cupón (aplica sobre el total ya con puntos, igual que el backend)
  const [cuponInput, setCuponInput] = useState('');
  const [cuponCodigo, setCuponCodigo] = useState(null);
  const [descuentoCupon, setDescuentoCupon] = useState(0);
  const [cuponMsg, setCuponMsg] = useState('');
  const [validandoCupon, setValidandoCupon] = useState(false);
  const totalFinal = r2(Math.max(0, totalPagar - descuentoCupon));

  const validarCupon = async (codigo, base) => {
    const cod = String(codigo || '').trim().toUpperCase();
    if (!cod) return;
    if (!token) { setCuponMsg('Inicia sesión para usar cupones'); return; }
    setValidandoCupon(true);
    try {
      const r = await api.post('/delivery/cliente/cupones/validar', { codigo: cod, subtotal: base });
      if (r.data?.valido) { setCuponCodigo(cod); setDescuentoCupon(r.data.descuento || 0); setCuponMsg(`Cupón ${cod}: −${fmtUSD(r.data.descuento || 0)}`); }
      else { setCuponCodigo(null); setDescuentoCupon(0); setCuponMsg(r.data?.motivo || 'Cupón no válido'); }
    } catch { setCuponCodigo(null); setDescuentoCupon(0); setCuponMsg('No se pudo validar el cupón'); }
    finally { setValidandoCupon(false); }
  };
  const quitarCupon = () => { setCuponCodigo(null); setDescuentoCupon(0); setCuponMsg(''); setCuponInput(''); };
  // Si cambia el total y hay un cupón, se recalcula su descuento
  useEffect(() => { if (cuponCodigo) validarCupon(cuponCodigo, totalPagar); }, [totalPagar]);

  // Cotización (tasa, monedas habilitadas e IGTF de la tienda)
  useEffect(() => {
    if (!token || !idPuntoVenta) return;
    setErrorTasa('');
    api.get('/delivery/cliente/cotizacion-moneda', { params: { idPuntoVenta } })
      .then((r) => setCotizacion(r.data))
      .catch((e) => { setCotizacion(null); setErrorTasa(e.response?.data?.error || 'No se pudo consultar la tasa'); });
  }, [token, idPuntoVenta]);
  useEffect(() => {
    if (cotizacion?.Modo === 'VES') setMonedaEfectivo('VES');
    if (cotizacion?.Modo === 'USD') setMonedaEfectivo('USD');
  }, [cotizacion?.Modo]);
  // Al cambiar de moneda o de forma de pago, el billete informado deja de servir
  useEffect(() => { setPagaConUSDTexto(''); setPagaConVESTexto(''); }, [monedaEfectivo, metodoPago]);

  // Direcciones guardadas y puntos (con sesión); la primera dirección por defecto
  useEffect(() => {
    if (!token) { setDirecciones([]); return; }
    api.get('/delivery/cliente/direcciones').then((r) => {
      const lista = r.data || [];
      setDirecciones(lista);
      if (lista[0] && !direccion) usarDireccion(lista[0]);
    }).catch(() => {});
    api.get('/delivery/cliente/puntos').then((r) => setPuntosData(r.data)).catch(() => {});
  }, [token]);

  const usarDireccion = (d) => {
    setDireccion(d.Direccion || '');
    setUbicacion(d.Latitud != null && d.Longitud != null ? { Latitud: parseFloat(d.Latitud), Longitud: parseFloat(d.Longitud), Alias: d.Alias } : null);
  };

  const onUbicacionConfirmada = async ({ Latitud, Longitud, guardar, alias }) => {
    setUbicacion({ Latitud, Longitud, Alias: alias });
    setSelectorVisible(false);
    if (guardar && token) {
      try {
        await api.post('/delivery/cliente/direcciones', { Alias: alias || 'Mi dirección', Direccion: direccion.trim() || alias || 'Ubicación en mapa', Latitud, Longitud });
        setDirecciones((await api.get('/delivery/cliente/direcciones')).data || []);
      } catch { /* no bloquea el pedido */ }
    }
  };

  const tasaVES = Number(cotizacion?.tasa?.VESporUSD) || 0;
  const totalVES = r2(totalFinal * tasaVES);
  // La tarjeta se cobra en bolívares, salvo en cuentas que solo cobran dólares
  const monedaTarjeta = cotizacion?.Modo === 'USD' ? 'USD' : 'VES';
  const moneda = metodoPago === 'PAGO_MOVIL' ? 'VES' : metodoPago === 'TARJETA' ? monedaTarjeta : monedaEfectivo;
  const pagaEnBs = moneda === 'VES';
  const combinado = moneda === 'MIXTA';
  // Combinado: el cliente dice cuánto paga en dólares; el resto va en bolívares
  const parteUSD = combinado ? leerMonto(parteUSDTexto) : null;
  const parteUSDValida = combinado && parteUSD != null && parteUSD > 0 && parteUSD < totalFinal;
  const parteVES = parteUSDValida ? r2((totalFinal - parteUSD) * tasaVES) : 0;
  // IGTF 3% sobre lo pagado en dólares, solo en tiendas contribuyentes especiales
  const baseIGTF = moneda === 'USD' ? totalFinal : parteUSDValida ? parteUSD : 0;
  const igtfUSD = cotizacion?.AplicaIGTF ? r2(baseIGTF * 3 / 100) : 0;
  const totalCobroUSD = r2(totalFinal + igtfUSD);
  // Lo que entrega el cliente en cada moneda (para calcular el cambio)
  const debeUSD = moneda === 'USD' ? totalCobroUSD : parteUSDValida ? r2(parteUSD + igtfUSD) : 0;
  const debeVES = moneda === 'VES' ? totalVES : parteVES;
  const pagaConUSD = metodoPago === 'EFECTIVO' && debeUSD > 0 ? leerMonto(pagaConUSDTexto) : null;
  const pagaConVES = metodoPago === 'EFECTIVO' && debeVES > 0 ? leerMonto(pagaConVESTexto) : null;
  const cambioUSD = pagaConUSD > debeUSD ? r2(pagaConUSD - debeUSD) : 0;
  const cambioVES = pagaConVES > debeVES ? r2(pagaConVES - debeVES) : 0;
  const billetes = debeUSD > 0 ? BILLETES_USD.filter((b) => b > debeUSD).slice(0, 3) : [];
  const tasaRef = useTasaReferencial();
  const tcRef = tasaVES || Number(tasaRef?.tasa?.VESporUSD) || 0;
  const pmHabilitado = !cotizacion || ['VES', 'AMBAS'].includes(cotizacion.Modo);

  const handlePedido = async () => {
    if (!token) {
      Alert.alert('Inicia sesión para pedir', 'Tu carrito se guarda: crea tu cuenta o inicia sesión y termina tu pedido.', [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Iniciar sesión', onPress: () => { setPostLoginRedirect('/(tabs)/carrito'); router.push('/(auth)/login'); } },
      ]);
      return;
    }
    if (!direccion.trim()) { setEditandoEntrega(true); return; }
    if (!cotizacion) { Alert.alert('No se pudo cotizar', errorTasa || 'Intenta de nuevo en un momento.'); return; }
    if (metodoPago === 'PAGO_MOVIL' && !pmHabilitado) { Alert.alert('Pago Móvil no disponible', 'Esta cuenta no cobra en bolívares.'); return; }
    if (combinado && !parteUSDValida) {
      Alert.alert('Pago combinado', `Indica cuánto pagas en dólares: más de $0 y menos de ${fmtUSD(totalFinal)}. El resto lo pagas en bolívares.`);
      return;
    }
    if (Number.isNaN(pagaConUSD) || Number.isNaN(pagaConVES)) { Alert.alert('¿Con cuánto pagas?', 'Revisa el monto del billete.'); return; }
    if (pagaConUSD != null && pagaConUSD < debeUSD) { Alert.alert('¿Con cuánto pagas?', `En dólares debes entregar al menos ${fmtUSD(debeUSD)}.`); return; }
    if (pagaConVES != null && pagaConVES < debeVES) { Alert.alert('¿Con cuánto pagas?', `En bolívares debes entregar al menos ${fmtVES(debeVES)}.`); return; }
    if (items.length === 0) return;
    setLoading(true);
    try {
      const res = await api.post('/delivery/pedido', {
        idPuntoVenta,
        items: items.map((i) => ({ idProducto: i.idProducto, Cantidad: i.Cantidad, PrecioUSD: i.PrecioUSD })),
        DireccionEntrega: direccion.trim(),
        UbicacionEntregaLat: ubicacion?.Latitud ?? null,
        UbicacionEntregaLon: ubicacion?.Longitud ?? null,
        NotasCliente: notas.trim(),
        MetodoPago: metodoPago,
        PuntosUsar: puntosUsar,
        CuponCodigo: cuponCodigo,
        PagoMoneda: {
          idTasa: cotizacion.tasa.idTasa,
          Moneda: moneda,
          ...(combinado ? { MontoUSD: parteUSD, MontoVES: parteVES } : { MontoOriginal: pagaEnBs ? totalVES : totalCobroUSD }),
          ...(pagaConUSD != null ? { PagaConUSD: pagaConUSD } : {}),
          ...(pagaConVES != null ? { PagaConVES: pagaConVES } : {}),
        },
      });
      const idPedido = res.data?.idPedido ?? res.data?.pedido?.idPedido;
      limpiarCarrito();
      quitarCupon();
      setParteUSDTexto(''); setPagaConUSDTexto(''); setPagaConVESTexto('');
      router.push(`/pedido/${idPedido}`);
    } catch (e) {
      Alert.alert('No se pudo hacer el pedido', e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <SafeAreaView edges={['top']} style={styles.root}>
        <StatusBar style="dark" />
        <View style={styles.cabecera}>
          <BotonAtras />
          <Text style={styles.titulo}>Tu pedido</Text>
        </View>
        <View style={styles.vacio}>
          <View style={styles.vacioIcono}><IconoCarrito tam={34} /></View>
          <Text style={styles.vacioTitulo}>Tu carrito está vacío</Text>
          <Text style={styles.vacioTexto}>Agrega tu agua VIDA, Harina PAN y lo que te haga falta.</Text>
          <TouchableOpacity style={styles.boton} onPress={() => router.push('/(tabs)')}><Text style={styles.botonTexto}>Ir a comprar</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const etiquetaDireccion = direccion.trim()
    ? `${ubicacion?.Alias ? `${ubicacion.Alias} · ` : ''}${direccion.trim()}`
    : 'Agrega tu dirección';

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.contenido} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.cabecera}>
          <BotonAtras />
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.titulo}>Tu pedido</Text>
            {nombreSucursal ? <Text style={styles.sub}>De {nombreSucursal}</Text> : null}
          </View>
        </View>

        {/* Productos */}
        <View style={[styles.tarjeta, { paddingVertical: 6 }]}>
          {items.map((it, i) => {
            const img = absImg(it.ImagenProducto);
            return (
              <View key={it.idProducto} style={[styles.item, i < items.length - 1 && styles.itemBorde]}>
                <View style={[styles.itemFoto, { backgroundColor: FONDOS[i % FONDOS.length] }]}>{img ? <Image source={{ uri: img }} style={styles.itemImg} /> : null}</View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemNombre} numberOfLines={2}>{it.Nombre}</Text>
                  <Text style={styles.itemPrecio}>{fmtUSD(it.PrecioUSD * it.Cantidad)}</Text>
                </View>
                <View style={styles.stepper}>
                  <TouchableOpacity style={styles.paso} onPress={() => quitarItem(it.idProducto)} accessibilityLabel="Quitar uno"><Text style={styles.pasoTexto}>−</Text></TouchableOpacity>
                  <Text style={styles.pasoNum}>{it.Cantidad}</Text>
                  <TouchableOpacity style={styles.paso} onPress={() => agregarItem({ ...it }, 1)} accessibilityLabel="Agregar uno"><Text style={styles.pasoTexto}>+</Text></TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>

        {/* Cupón y puntos */}
        <View style={styles.dosCol}>
          <View style={styles.mini}>
            <Text style={styles.miniEtiqueta}>Cupón</Text>
            {cuponCodigo ? (
              <TouchableOpacity onPress={quitarCupon} accessibilityLabel="Quitar cupón">
                <Text style={styles.cuponAplicado}>{cuponCodigo} ✕</Text>
              </TouchableOpacity>
            ) : (
              <TextInput style={styles.cuponInput} placeholder="CÓDIGO" placeholderTextColor={colores.textoTenue} autoCapitalize="characters"
                value={cuponInput} onChangeText={setCuponInput} returnKeyType="done" onSubmitEditing={() => validarCupon(cuponInput, totalPagar)}
                onBlur={() => cuponInput.trim() && validarCupon(cuponInput, totalPagar)} editable={!validandoCupon} />
            )}
          </View>
          <TouchableOpacity style={[styles.mini, styles.puntos]} disabled={!saldoPuntos} onPress={() => setUsarPuntos((v) => !v)}
            accessibilityRole="switch" accessibilityState={{ checked: usarPuntos }}>
            <View>
              <Text style={styles.miniEtiqueta}>Usar puntos</Text>
              <Text style={styles.puntosValor}>{saldoPuntos.toLocaleString('es-VE')} pts</Text>
            </View>
            <View style={[styles.interruptor, usarPuntos && styles.interruptorOn]}><View style={styles.interruptorBola} /></View>
          </TouchableOpacity>
        </View>
        {cuponMsg ? <Text style={[styles.cuponMsg, cuponCodigo && { color: colores.verdeTexto }]}>{validandoCupon ? 'Validando…' : cuponMsg}</Text> : null}

        {/* Entrega y pago */}
        <View style={[styles.tarjeta, { padding: 14, gap: 12 }]}>
          <View style={styles.fila}>
            <View style={{ flex: 1 }}>
              <Text style={styles.miniEtiqueta}>Entregar en</Text>
              <Text style={[styles.direccion, !direccion.trim() && { color: colores.textoSuave }]} numberOfLines={2}>{etiquetaDireccion}</Text>
            </View>
            <TouchableOpacity style={styles.enlace} onPress={() => setEditandoEntrega(true)}>
              <Text style={styles.enlaceTexto}>{direccion.trim() ? 'Cambiar' : 'Agregar'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.miniEtiqueta}>¿Cómo vas a pagar?</Text>
          <View style={styles.dosCol}>
            {[['EFECTIVO', 'Efectivo', 'Al recibir'], ['TARJETA', 'Tarjeta', 'Punto de venta'], ['PAGO_MOVIL', 'Pago Móvil', 'En bolívares']].map(([k, t, s]) => (
              <TouchableOpacity key={k} style={[styles.metodo, metodoPago === k && styles.metodoOn, k === 'PAGO_MOVIL' && !pmHabilitado && { opacity: 0.4 }]}
                disabled={k === 'PAGO_MOVIL' && !pmHabilitado} onPress={() => setMetodoPago(k)}
                accessibilityRole="radio" accessibilityState={{ selected: metodoPago === k }}>
                <Text style={styles.metodoTitulo}>{t}</Text>
                <Text style={styles.metodoSub}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {metodoPago === 'EFECTIVO' && cotizacion?.Modo === 'AMBAS' && (
            <View style={styles.segmento}>
              {[['USD', 'Dólares'], ['VES', 'Bolívares'], ['MIXTA', 'Combinado']].map(([k, t]) => (
                <TouchableOpacity key={k} style={[styles.segBtn, monedaEfectivo === k && styles.segBtnOn]} onPress={() => setMonedaEfectivo(k)}
                  accessibilityRole="tab" accessibilityState={{ selected: monedaEfectivo === k }}>
                  <Text style={[styles.segTexto, monedaEfectivo === k && styles.segTextoOn]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {combinado && (
            <View style={{ gap: 6 }}>
              <Text style={styles.miniEtiqueta}>¿Cuánto pagas en dólares?</Text>
              <View style={styles.montoFila}>
                <View style={styles.montoCaja}>
                  <Text style={styles.montoSimbolo}>$</Text>
                  <TextInput style={styles.montoInput} value={parteUSDTexto} onChangeText={setParteUSDTexto} keyboardType="decimal-pad"
                    placeholder="0,00" placeholderTextColor={colores.textoTenue} accessibilityLabel="Parte en dólares" />
                </View>
                <Text style={styles.montoMas}>+</Text>
                <View style={[styles.montoCaja, styles.montoCajaFija]}>
                  <Text style={styles.montoFijo} numberOfLines={1} adjustsFontSizeToFit>{parteUSDValida ? fmtVES(parteVES) : 'Bs —'}</Text>
                </View>
              </View>
              <Text style={styles.nota}>El resto ({parteUSDValida ? fmtUSD(r2(totalFinal - parteUSD)) : '—'}) lo pagas en bolívares a la tasa BCV.</Text>
            </View>
          )}
          {metodoPago === 'EFECTIVO' && (debeUSD > 0 || debeVES > 0) && (
            <View style={{ gap: 6 }}>
              <Text style={styles.miniEtiqueta}>¿Con cuánto pagas? <Text style={styles.opcional}>(opcional, para que te lleven cambio)</Text></Text>
              {debeUSD > 0 && (
                <View style={styles.billetes}>
                  {[null, ...billetes].map((b) => {
                    const on = b == null ? !pagaConUSDTexto : leerMonto(pagaConUSDTexto) === b;
                    return (
                      <TouchableOpacity key={b ?? 'exacto'} style={[styles.billete, on && styles.billeteOn]} onPress={() => setPagaConUSDTexto(b == null ? '' : String(b))}
                        accessibilityRole="radio" accessibilityState={{ selected: on }}>
                        <Text style={[styles.billeteTexto, on && styles.billeteTextoOn]}>{b == null ? 'Exacto' : `$${b}`}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TextInput style={[styles.billete, styles.billeteInput]} value={billetes.includes(leerMonto(pagaConUSDTexto)) ? '' : pagaConUSDTexto}
                    onChangeText={setPagaConUSDTexto} keyboardType="decimal-pad" placeholder="Otro $" placeholderTextColor={colores.textoTenue} accessibilityLabel="Billete en dólares" />
                </View>
              )}
              {debeVES > 0 && (
                <View style={styles.montoCaja}>
                  <Text style={styles.montoSimbolo}>Bs</Text>
                  <TextInput style={styles.montoInput} value={pagaConVESTexto} onChangeText={setPagaConVESTexto} keyboardType="decimal-pad"
                    placeholder={`Exacto (${fmtVES(debeVES)})`} placeholderTextColor={colores.textoTenue} accessibilityLabel="Billetes en bolívares" />
                </View>
              )}
              {cambioUSD > 0 || cambioVES > 0 ? (
                <Text style={[styles.nota, styles.notaCambio]}>
                  El repartidor te lleva {[cambioUSD > 0 && `${fmtUSD(cambioUSD)} de cambio`, cambioVES > 0 && `${fmtVES(cambioVES)} de cambio`].filter(Boolean).join(' y ')}.
                </Text>
              ) : null}
            </View>
          )}
          {metodoPago === 'EFECTIVO' && cotizacion?.AplicaIGTF ? (
            <Text style={styles.nota}>{moneda === 'VES' ? 'En bolívares no pagas IGTF.' : combinado ? 'Sobre la parte en dólares se suma el IGTF (3%).' : 'Pagando en dólares se suma el IGTF (3%). En bolívares no aplica.'}</Text>
          ) : null}
          {metodoPago === 'TARJETA' ? (
            <Text style={styles.nota}>El repartidor lleva el punto de venta: pagas con tarjeta de débito o crédito al recibir{monedaTarjeta === 'VES' ? ', en bolívares' : ''}.{monedaTarjeta === 'USD' && cotizacion?.AplicaIGTF ? ' Se suma el IGTF (3%).' : ''}</Text>
          ) : null}
          {metodoPago === 'PAGO_MOVIL' ? <Text style={styles.nota}>Al hacer el pedido te mostramos los datos para pagar y enviar el comprobante.</Text> : null}
          {errorTasa ? <Text style={[styles.nota, { color: colores.error }]}>{errorTasa}</Text> : null}
        </View>
      </ScrollView>

      {/* Hoja fija con el total */}
      <SafeAreaView edges={['bottom']} style={styles.hoja}>
        <View style={styles.hojaFila}><Text style={styles.hojaSuave}>Subtotal</Text><Text style={styles.hojaSuave}>{fmtUSD(subtotal)}</Text></View>
        {descuentoPuntos > 0 && <View style={styles.hojaFila}><Text style={styles.hojaVerde}>Puntos ({puntosUsar.toLocaleString('es-VE')} pts)</Text><Text style={styles.hojaVerde}>−{fmtUSD(descuentoPuntos)}</Text></View>}
        {descuentoCupon > 0 && <View style={styles.hojaFila}><Text style={styles.hojaVerde}>Cupón {cuponCodigo}</Text><Text style={styles.hojaVerde}>−{fmtUSD(descuentoCupon)}</Text></View>}
        {igtfUSD > 0 && <View style={styles.hojaFila}><Text style={styles.hojaSuave}>IGTF 3% (pago en dólares)</Text><Text style={styles.hojaSuave}>+{fmtUSD(igtfUSD)}</Text></View>}
        <View style={[styles.hojaFila, { alignItems: 'baseline' }]}>
          <Text style={styles.totalEtiqueta}>Total a pagar</Text>
          <View style={{ alignItems: 'flex-end' }}>
            {combinado && parteUSDValida ? (
              <>
                <Text style={styles.total}>{fmtUSD(debeUSD)}</Text>
                <Text style={styles.totalMas}>+ {fmtVES(parteVES)}</Text>
              </>
            ) : <Text style={styles.total}>{pagaEnBs && totalVES ? fmtVES(totalVES) : fmtUSD(totalCobroUSD)}</Text>}
            {(combinado && parteUSDValida) || (pagaEnBs && totalVES) ? <Text style={styles.totalSec}>{fmtUSD(totalFinal)} · tasa BCV</Text>
              : tcRef ? <Text style={styles.totalSec}>≈ {fmtVES(r2(totalFinal * tcRef))} · tasa BCV</Text> : null}
          </View>
        </View>
        <TouchableOpacity style={[styles.pedir, loading && { opacity: 0.7 }]} onPress={handlePedido} disabled={loading}>
          {loading ? <ActivityIndicator color={colores.blanco} /> : <Text style={styles.pedirTexto}>Hacer pedido</Text>}
        </TouchableOpacity>
      </SafeAreaView>

      {/* Dirección de entrega */}
      <Modal visible={editandoEntrega} transparent animationType="slide" onRequestClose={() => setEditandoEntrega(false)}>
        <KeyboardAvoidingView style={styles.modalFondo} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modal}>
            <Text style={styles.modalTitulo}>¿Dónde te lo entregamos?</Text>
            {direcciones.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {direcciones.map((d) => (
                  <TouchableOpacity key={d.idDireccion} style={styles.dirChip} onPress={() => usarDireccion(d)}>
                    <Text style={styles.dirChipTexto} numberOfLines={1}>{d.Alias || d.Direccion}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <Text style={styles.campoEtiqueta}>Dirección</Text>
            <TextInput style={styles.campo} placeholder="Av. Bolívar, edificio, apartamento" placeholderTextColor={colores.textoTenue}
              value={direccion} onChangeText={setDireccion} multiline />
            <TouchableOpacity style={styles.mapaBtn} onPress={() => setSelectorVisible(true)}>
              <Text style={styles.mapaBtnTexto}>{ubicacion ? 'Ubicación fijada en el mapa · cambiar' : 'Fijar mi ubicación en el mapa'}</Text>
            </TouchableOpacity>
            <Text style={styles.campoEtiqueta}>Notas para el repartidor</Text>
            <TextInput style={styles.campo} placeholder="Ej.: casa con portón azul" placeholderTextColor={colores.textoTenue} value={notas} onChangeText={setNotas} />
            <TouchableOpacity style={styles.pedir} onPress={() => setEditandoEntrega(false)}><Text style={styles.pedirTexto}>Listo</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <SelectorUbicacion visible={selectorVisible} onClose={() => setSelectorVisible(false)} onConfirmar={onUbicacionConfirmada} puedeGuardar={!!token} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 260, gap: 12 },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titulo: { fontFamily: fuentes.tituloFuerte, fontSize: 22, color: colores.marino },
  sub: { fontSize: 13, color: colores.textoSuave },

  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 22, paddingHorizontal: 14 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  itemBorde: { borderBottomWidth: 1, borderBottomColor: '#EEF6F8' },
  itemFoto: { width: 46, height: 46, borderRadius: 14, overflow: 'hidden' },
  itemImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  itemNombre: { fontWeight: '800', fontSize: 14, color: colores.marino },
  itemPrecio: { fontFamily: fuentes.titulo, fontSize: 14, color: colores.marino },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colores.fondo, borderRadius: 14, padding: 2 },
  paso: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pasoTexto: { fontWeight: '800', fontSize: 18, color: colores.marino },
  pasoNum: { width: 20, textAlign: 'center', fontWeight: '800', color: colores.marino },

  dosCol: { flexDirection: 'row', gap: 10 },
  mini: { flex: 1, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  miniEtiqueta: { fontSize: 12, color: colores.textoSuave, fontWeight: '700' },
  cuponInput: { fontWeight: '800', fontSize: 15, letterSpacing: 1, minHeight: 26, color: colores.marino, padding: 0 },
  cuponAplicado: { fontWeight: '800', fontSize: 15, color: colores.verdeTexto, minHeight: 26 },
  cuponMsg: { fontSize: 12, color: colores.error, marginTop: -4, marginLeft: 4 },
  puntos: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  puntosValor: { fontWeight: '800', fontSize: 15, color: colores.marino },
  interruptor: { width: 44, height: 26, borderRadius: 13, backgroundColor: colores.bordeFuerte, padding: 3, justifyContent: 'center' },
  interruptorOn: { backgroundColor: colores.verde, alignItems: 'flex-end' },
  interruptorBola: { width: 20, height: 20, borderRadius: 10, backgroundColor: colores.blanco },

  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  direccion: { fontWeight: '800', fontSize: 15, color: colores.marino },
  enlace: { minHeight: 44, justifyContent: 'center' },
  enlaceTexto: { fontWeight: '800', fontSize: 14, color: colores.marino, textDecorationLine: 'underline' },
  metodo: { flex: 1, borderRadius: 16, borderWidth: 1.5, borderColor: colores.borde, backgroundColor: colores.blanco, paddingVertical: 10, paddingHorizontal: 10, gap: 2 },
  metodoOn: { borderWidth: 2, borderColor: colores.marino, backgroundColor: colores.celesteClaro },
  metodoTitulo: { fontWeight: '800', fontSize: 15, color: colores.marino },
  metodoSub: { fontSize: 12, color: '#2C3D58' },
  segmento: { flexDirection: 'row', gap: 6, backgroundColor: colores.fondo, borderRadius: 14, padding: 4 },
  segBtn: { flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: colores.blanco },
  segTexto: { fontWeight: '700', fontSize: 14, color: colores.textoSuave },
  segTextoOn: { fontWeight: '800', color: colores.marino },
  nota: { fontSize: 12, color: colores.textoSuave, lineHeight: 17 },
  notaCambio: { color: colores.verdeTexto, fontWeight: '700' },
  opcional: { fontWeight: '400' },
  montoFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  montoCaja: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 50, borderRadius: 14, borderWidth: 1.5, borderColor: colores.bordeFuerte, backgroundColor: colores.blanco, paddingHorizontal: 12 },
  montoCajaFija: { backgroundColor: colores.fondo, borderColor: colores.borde },
  montoSimbolo: { fontWeight: '800', fontSize: 15, color: colores.textoSuave },
  montoInput: { flex: 1, minHeight: 46, fontFamily: fuentes.tituloMedio, fontSize: 17, color: colores.marino, padding: 0 },
  montoFijo: { flex: 1, fontFamily: fuentes.tituloMedio, fontSize: 16, color: colores.marino },
  montoMas: { fontWeight: '800', fontSize: 18, color: colores.textoSuave },
  billetes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  billete: { minWidth: 64, height: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colores.borde, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center' },
  billeteOn: { borderWidth: 2, borderColor: colores.marino, backgroundColor: colores.celesteClaro },
  billeteTexto: { fontWeight: '700', fontSize: 14, color: colores.marino },
  billeteTextoOn: { fontWeight: '800' },
  billeteInput: { flex: 1, minWidth: 80, fontWeight: '700', fontSize: 14, color: colores.marino, textAlign: 'center', paddingVertical: 0 },

  hoja: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colores.blanco,
    borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTopWidth: 1, borderColor: colores.borde,
    paddingTop: 16, paddingHorizontal: 20, paddingBottom: 20, gap: 12,
  },
  hojaFila: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  hojaSuave: { fontSize: 14, color: colores.textoSuave },
  hojaVerde: { fontSize: 14, color: colores.verdeTexto, fontWeight: '700' },
  totalEtiqueta: { fontWeight: '800', fontSize: 16, color: colores.marino },
  total: { fontFamily: fuentes.tituloFuerte, fontSize: 24, color: colores.marino },
  totalSec: { fontSize: 12, color: colores.textoSuave },
  totalMas: { fontFamily: fuentes.tituloMedio, fontSize: 16, color: colores.marino },
  pedir: { height: 58, borderRadius: 18, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  pedirTexto: { color: colores.blanco, fontWeight: '800', fontSize: 17 },

  vacio: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  vacioIcono: { width: 76, height: 76, borderRadius: 24, backgroundColor: colores.celesteClaro, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  vacioTitulo: { fontFamily: fuentes.tituloFuerte, fontSize: 20, color: colores.marino },
  vacioTexto: { fontSize: 14, color: colores.textoSuave, textAlign: 'center' },
  boton: { marginTop: 10, backgroundColor: colores.marino, height: 50, paddingHorizontal: 24, borderRadius: 16, justifyContent: 'center' },
  botonTexto: { color: colores.blanco, fontWeight: '800', fontSize: 15 },

  modalFondo: { flex: 1, backgroundColor: 'rgba(0,16,52,0.45)', justifyContent: 'flex-end' },
  modal: { backgroundColor: colores.blanco, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 28, gap: 10 },
  modalTitulo: { fontFamily: fuentes.tituloFuerte, fontSize: 20, color: colores.marino, marginBottom: 4 },
  dirChip: { height: 40, paddingHorizontal: 14, borderRadius: 99, backgroundColor: colores.celesteClaro, justifyContent: 'center', maxWidth: 220 },
  dirChipTexto: { fontWeight: '700', fontSize: 14, color: colores.marino },
  campoEtiqueta: { fontSize: 14, fontWeight: '800', color: colores.marino, marginTop: 4 },
  campo: { minHeight: 50, borderRadius: 16, borderWidth: 1.5, borderColor: colores.bordeFuerte, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: colores.marino },
  mapaBtn: { minHeight: 44, borderRadius: 14, backgroundColor: colores.fondo, alignItems: 'center', justifyContent: 'center' },
  mapaBtnTexto: { fontWeight: '800', fontSize: 14, color: colores.marino },
});
