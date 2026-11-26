// Carrito y pago (estilo apps de delivery): productos con su cantidad,
// "Agregar más", entrega, forma de pago con iconos, ahorros (cupón y puntos)
// y barra fija con el total y "Hacer pedido".
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
import { absImg, CLUB_PROXIMAMENTE } from '../../constants/config';
import SelectorUbicacion from '../../components/SelectorUbicacion';
import { Icono, ControlCantidad } from '../../components/ui';
import { colores, fuentes } from '../../constants/tema';
import { useTasaReferencial, fmtUSD, fmtVES } from '../../services/moneda';
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
  // Cupones personales (p. ej. "te extrañamos"): se aplican con un toque
  const [misCupones, setMisCupones] = useState([]);
  useEffect(() => {
    if (!token) { setMisCupones([]); return; }
    api.get('/delivery/cliente/cupones').then((r) => setMisCupones(r.data || [])).catch(() => setMisCupones([]));
  }, [token]);
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
    if (!CLUB_PROXIMAMENTE) api.get('/delivery/cliente/puntos').then((r) => setPuntosData(r.data)).catch(() => {});
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
      if (cuponCodigo) setMisCupones((l) => l.filter((k) => k.Codigo !== cuponCodigo));
      quitarCupon();
      setParteUSDTexto(''); setPagaConUSDTexto(''); setPagaConVESTexto('');
      router.push(`/pedido/${idPedido}`);
    } catch (e) {
      Alert.alert('No se pudo hacer el pedido', e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const volver = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  if (items.length === 0) {
    return (
      <SafeAreaView edges={['top']} style={styles.root}>
        <StatusBar style="dark" />
        <View style={styles.barra}>
          <TouchableOpacity style={styles.redondo} onPress={volver} accessibilityLabel="Volver"><Icono nombre="arrow-back" tam={22} /></TouchableOpacity>
          <Text style={styles.barraTitulo}>Tu carrito</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.vacio}>
          <View style={styles.vacioIcono}><Icono nombre="cart-outline" tam={40} /></View>
          <Text style={styles.vacioTitulo}>Tu carrito está vacío</Text>
          <Text style={styles.vacioTexto}>Agrega tu agua VIDA, Harina PAN y lo que te haga falta.</Text>
          <TouchableOpacity style={styles.boton} onPress={() => router.push('/(tabs)')}><Text style={styles.botonTexto}>Ir a comprar</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const nProductos = items.reduce((a, i) => a + i.Cantidad, 0);
  const vaciar = () => Alert.alert('Vaciar carrito', '¿Quitar todos los productos?', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Vaciar', style: 'destructive', onPress: limpiarCarrito },
  ]);
  const METODOS = [
    ['EFECTIVO', 'Efectivo', 'Pagas al recibir', 'cash-outline'],
    ['TARJETA', 'Tarjeta', 'El repartidor lleva el punto de venta', 'card-outline'],
    ['PAGO_MOVIL', 'Pago Móvil', pmHabilitado ? 'En bolívares, antes del envío' : 'No disponible en esta tienda', 'phone-portrait-outline'],
  ];
  const textoTotal = combinado && parteUSDValida ? `${fmtUSD(debeUSD)} + ${fmtVES(parteVES)}`
    : pagaEnBs && totalVES ? fmtVES(totalVES) : fmtUSD(totalCobroUSD);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.barra}>
        <TouchableOpacity style={styles.redondo} onPress={volver} accessibilityLabel="Volver"><Icono nombre="arrow-back" tam={22} /></TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.barraTitulo}>Tu carrito</Text>
          {nombreSucursal ? <Text style={styles.barraSub} numberOfLines={1}>{nombreSucursal}</Text> : null}
        </View>
        <TouchableOpacity style={styles.redondo} onPress={vaciar} accessibilityLabel="Vaciar carrito"><Icono nombre="trash-outline" tam={20} /></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.contenido} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Productos */}
        <View style={styles.bloque}>
          <Text style={styles.h2}>{nProductos} producto{nProductos === 1 ? '' : 's'}</Text>
          {items.map((it, i) => {
            const img = absImg(it.ImagenProducto);
            return (
              <View key={it.idProducto} style={[styles.item, i < items.length - 1 && styles.itemBorde]}>
                <View style={styles.itemFoto}>{img ? <Image source={{ uri: img }} style={styles.itemImg} /> : <Icono nombre="cube-outline" color={colores.textoTenue} />}</View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.itemNombre} numberOfLines={2}>{it.Nombre}</Text>
                  <Text style={styles.itemPrecio}>{fmtUSD(it.PrecioUSD * it.Cantidad)}</Text>
                  {it.Cantidad > 1 ? <Text style={styles.itemUnidad}>{fmtUSD(it.PrecioUSD)} c/u</Text> : null}
                </View>
                <ControlCantidad cantidad={it.Cantidad} onMas={() => agregarItem({ ...it }, 1)} onMenos={() => quitarItem(it.idProducto)} nombre={it.Nombre} />
              </View>
            );
          })}
          {idPuntoVenta ? (
            <TouchableOpacity style={styles.agregarMas} onPress={() => router.push(`/sucursal/${idPuntoVenta}`)}>
              <Icono nombre="add" tam={20} />
              <Text style={styles.agregarMasTexto}>Agregar más productos</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.division} />

        {/* Entrega */}
        <View style={styles.bloque}>
          <Text style={styles.h2}>Entrega</Text>
          <TouchableOpacity style={styles.opcion} onPress={() => setEditandoEntrega(true)} accessibilityLabel="Cambiar dirección de entrega">
            <View style={styles.opcionIcono}><Icono nombre="location" tam={20} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.opcionTitulo, !direccion.trim() && { color: colores.error }]} numberOfLines={2}>
                {direccion.trim() ? (ubicacion?.Alias || 'Entregar en') : 'Agrega tu dirección'}
              </Text>
              <Text style={styles.opcionSub} numberOfLines={2}>
                {direccion.trim() || 'Para saber a dónde llevar tu pedido'}{ubicacion ? '' : direccion.trim() ? ' · sin ubicación en el mapa' : ''}
              </Text>
            </View>
            <Icono nombre="chevron-forward" tam={20} color={colores.textoTenue} />
          </TouchableOpacity>
          {notas.trim() ? (
            <View style={styles.opcion}>
              <View style={styles.opcionIcono}><Icono nombre="chatbubble-ellipses-outline" tam={19} /></View>
              <Text style={[styles.opcionSub, { flex: 1 }]} numberOfLines={2}>{notas.trim()}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.division} />

        {/* Pago */}
        <View style={styles.bloque}>
          <Text style={styles.h2}>¿Cómo vas a pagar?</Text>
          {METODOS.map(([k, t, s, ic]) => {
            const on = metodoPago === k;
            const off = k === 'PAGO_MOVIL' && !pmHabilitado;
            return (
              <TouchableOpacity key={k} style={[styles.metodo, on && styles.metodoOn, off && { opacity: 0.4 }]} disabled={off} onPress={() => setMetodoPago(k)}
                accessibilityRole="radio" accessibilityState={{ selected: on }}>
                <View style={[styles.opcionIcono, on && { backgroundColor: colores.blanco }]}><Icono nombre={ic} tam={20} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.opcionTitulo}>{t}</Text>
                  <Text style={styles.opcionSub}>{s}</Text>
                </View>
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioPunto} /> : null}</View>
              </TouchableOpacity>
            );
          })}

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
              <Text style={styles.etiqueta}>¿Cuánto pagas en dólares?</Text>
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
            <View style={{ gap: 8 }}>
              <Text style={styles.etiqueta}>¿Con cuánto pagas? <Text style={styles.opcional}>Opcional, para que te lleven cambio</Text></Text>
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
                <View style={styles.cambio}>
                  <Icono nombre="swap-horizontal" tam={18} color={colores.verdeTexto} />
                  <Text style={styles.cambioTexto}>
                    El repartidor te lleva {[cambioUSD > 0 && `${fmtUSD(cambioUSD)} de cambio`, cambioVES > 0 && `${fmtVES(cambioVES)} de cambio`].filter(Boolean).join(' y ')}.
                  </Text>
                </View>
              ) : null}
            </View>
          )}
          {metodoPago === 'EFECTIVO' && cotizacion?.AplicaIGTF ? (
            <Text style={styles.nota}>{moneda === 'VES' ? 'En bolívares no pagas IGTF.' : combinado ? 'Sobre la parte en dólares se suma el IGTF (3%).' : 'Pagando en dólares se suma el IGTF (3%). En bolívares no aplica.'}</Text>
          ) : null}
          {metodoPago === 'TARJETA' ? (
            <Text style={styles.nota}>Pagas con tarjeta de débito o crédito al recibir{monedaTarjeta === 'VES' ? ', en bolívares' : ''}.{monedaTarjeta === 'USD' && cotizacion?.AplicaIGTF ? ' Se suma el IGTF (3%).' : ''}</Text>
          ) : null}
          {metodoPago === 'PAGO_MOVIL' ? <Text style={styles.nota}>Al hacer el pedido te mostramos los datos para pagar y enviar el comprobante.</Text> : null}
          {errorTasa ? <Text style={[styles.nota, { color: colores.error }]}>{errorTasa}</Text> : null}
        </View>

        <View style={styles.division} />

        {/* Ahorros: cupón y puntos */}
        <View style={styles.bloque}>
          <Text style={styles.h2}>Ahorra en tu pedido</Text>
          <View style={styles.opcion}>
            <View style={[styles.opcionIcono, { backgroundColor: colores.verdeClaro }]}><Icono nombre="pricetag" tam={19} color={colores.verdeTexto} /></View>
            {cuponCodigo ? (
              <>
                <View style={{ flex: 1 }}>
                  <Text style={styles.opcionTitulo}>Cupón {cuponCodigo}</Text>
                  <Text style={[styles.opcionSub, { color: colores.verdeTexto }]}>Ahorras {fmtUSD(descuentoCupon)}</Text>
                </View>
                <TouchableOpacity onPress={quitarCupon} hitSlop={8} accessibilityLabel="Quitar cupón"><Icono nombre="close-circle" tam={22} color={colores.textoTenue} /></TouchableOpacity>
              </>
            ) : (
              <>
                <TextInput style={styles.cuponInput} placeholder="Código de cupón" placeholderTextColor={colores.textoTenue} autoCapitalize="characters"
                  value={cuponInput} onChangeText={setCuponInput} returnKeyType="done" onSubmitEditing={() => validarCupon(cuponInput, totalPagar)}
                  editable={!validandoCupon} accessibilityLabel="Código de cupón" />
                {cuponInput.trim() ? (
                  <TouchableOpacity style={styles.aplicar} onPress={() => validarCupon(cuponInput, totalPagar)} disabled={validandoCupon}>
                    {validandoCupon ? <ActivityIndicator size="small" color={colores.blanco} /> : <Text style={styles.aplicarTexto}>Aplicar</Text>}
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>
          {cuponMsg && !cuponCodigo ? <Text style={styles.cuponMsg}>{cuponMsg}</Text> : null}
          {!cuponCodigo && misCupones.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {misCupones.map((k) => (
                <TouchableOpacity key={k.Codigo} style={styles.miCupon} onPress={() => validarCupon(k.Codigo, totalPagar)} disabled={validandoCupon}
                  accessibilityLabel={`Aplicar cupón ${k.Codigo}`}>
                  <Text style={styles.miCuponTitulo}>{k.Tipo === 'DESCUENTO_PCT' ? `${Number(k.Valor)}% de descuento` : `${fmtUSD(k.Valor)} de descuento`}</Text>
                  <Text style={styles.miCuponSub}>{k.Codigo}{k.MinCompra ? ` · mín. ${fmtUSD(k.MinCompra)}` : ''}</Text>
                  <Text style={styles.miCuponUsar}>Usar</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {CLUB_PROXIMAMENTE ? null : (
          <TouchableOpacity style={styles.opcion} disabled={!saldoPuntos} onPress={() => setUsarPuntos((v) => !v)}
            accessibilityRole="switch" accessibilityState={{ checked: usarPuntos }}>
            <View style={[styles.opcionIcono, { backgroundColor: colores.verdeClaro }]}><Icono nombre="gift" tam={19} color={colores.verdeTexto} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.opcionTitulo}>Usar mis puntos VIDA</Text>
              <Text style={styles.opcionSub}>{saldoPuntos ? `Tienes ${saldoPuntos.toLocaleString('es-VE')} pts${descuentoPuntos > 0 ? ` · ahorras ${fmtUSD(descuentoPuntos)}` : ''}` : 'Aún no tienes puntos'}</Text>
            </View>
            <View style={[styles.interruptor, usarPuntos && styles.interruptorOn]}><View style={styles.interruptorBola} /></View>
          </TouchableOpacity>
          )}
        </View>

        <View style={styles.division} />

        {/* Resumen */}
        <View style={[styles.bloque, { gap: 8 }]}>
          <Text style={styles.h2}>Resumen</Text>
          <View style={styles.resFila}><Text style={styles.resSuave}>Productos</Text><Text style={styles.resSuave}>{fmtUSD(subtotal)}</Text></View>
          {descuentoPuntos > 0 && <View style={styles.resFila}><Text style={styles.resVerde}>Puntos ({puntosUsar.toLocaleString('es-VE')} pts)</Text><Text style={styles.resVerde}>−{fmtUSD(descuentoPuntos)}</Text></View>}
          {descuentoCupon > 0 && <View style={styles.resFila}><Text style={styles.resVerde}>Cupón {cuponCodigo}</Text><Text style={styles.resVerde}>−{fmtUSD(descuentoCupon)}</Text></View>}
          {igtfUSD > 0 && <View style={styles.resFila}><Text style={styles.resSuave}>IGTF 3% (pago en dólares)</Text><Text style={styles.resSuave}>+{fmtUSD(igtfUSD)}</Text></View>}
          <View style={[styles.resFila, styles.resTotal]}>
            <Text style={styles.totalEtiqueta}>Total</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.total}>{textoTotal}</Text>
              {(combinado && parteUSDValida) || (pagaEnBs && totalVES) ? <Text style={styles.totalSec}>{fmtUSD(totalFinal)} · tasa BCV</Text>
                : tcRef ? <Text style={styles.totalSec}>≈ {fmtVES(r2(totalFinal * tcRef))} · tasa BCV</Text> : null}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Barra fija: hacer pedido */}
      <SafeAreaView edges={['bottom']} style={styles.pie}>
        <TouchableOpacity style={[styles.pedir, loading && { opacity: 0.7 }]} onPress={handlePedido} disabled={loading}>
          {loading ? <ActivityIndicator color={colores.blanco} /> : (
            <>
              <Text style={styles.pedirTexto}>{token ? (direccion.trim() ? 'Hacer pedido' : 'Agregar dirección') : 'Inicia sesión para pedir'}</Text>
              <Text style={styles.pedirTotal} numberOfLines={1}>{textoTotal}</Text>
            </>
          )}
        </TouchableOpacity>
      </SafeAreaView>

      {/* Dirección de entrega */}
      <Modal visible={editandoEntrega} transparent animationType="slide" onRequestClose={() => setEditandoEntrega(false)}>
        <KeyboardAvoidingView style={styles.modalFondo} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modal}>
            <View style={styles.asa} />
            <Text style={styles.modalTitulo}>¿Dónde te lo entregamos?</Text>
            {direcciones.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {direcciones.map((d) => {
                  const on = d.Direccion === direccion;
                  return (
                    <TouchableOpacity key={d.idDireccion} style={[styles.dirChip, on && styles.dirChipOn]} onPress={() => usarDireccion(d)}>
                      <Icono nombre={/casa|hogar/i.test(d.Alias || '') ? 'home' : /trabajo|oficina/i.test(d.Alias || '') ? 'briefcase' : 'location'} tam={16}
                        color={on ? colores.blanco : colores.marino} />
                      <Text style={[styles.dirChipTexto, on && { color: colores.blanco }]} numberOfLines={1}>{d.Alias || d.Direccion}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            <Text style={styles.campoEtiqueta}>Dirección</Text>
            <TextInput style={styles.campo} placeholder="Av. Bolívar, edificio, apartamento" placeholderTextColor={colores.textoTenue}
              value={direccion} onChangeText={setDireccion} multiline />
            <TouchableOpacity style={styles.mapaBtn} onPress={() => setSelectorVisible(true)}>
              <Icono nombre={ubicacion ? 'checkmark-circle' : 'map-outline'} tam={20} color={ubicacion ? colores.verdeTexto : colores.marino} />
              <Text style={styles.mapaBtnTexto}>{ubicacion ? 'Ubicación fijada en el mapa · cambiar' : 'Fijar mi ubicación en el mapa'}</Text>
            </TouchableOpacity>
            <Text style={styles.campoEtiqueta}>Notas para el repartidor</Text>
            <TextInput style={styles.campo} placeholder="Ej.: casa con portón azul" placeholderTextColor={colores.textoTenue} value={notas} onChangeText={setNotas} />
            <TouchableOpacity style={[styles.pedir, { justifyContent: 'center' }]} onPress={() => setEditandoEntrega(false)}><Text style={styles.pedirTexto}>Listo</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <SelectorUbicacion visible={selectorVisible} onClose={() => setSelectorVisible(false)} onConfirmar={onUbicacionConfirmada} puedeGuardar={!!token} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  barra: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colores.separador },
  barraTitulo: { fontFamily: fuentes.tituloFuerte, fontSize: 18, color: colores.marino },
  barraSub: { fontSize: 12, color: colores.textoSuave },
  redondo: { width: 44, height: 44, borderRadius: 22, backgroundColor: colores.superficie, alignItems: 'center', justifyContent: 'center' },
  contenido: { paddingTop: 8, paddingBottom: 120 },

  bloque: { paddingHorizontal: 20, paddingVertical: 16, gap: 10 },
  division: { height: 8, backgroundColor: colores.superficie },
  h2: { fontFamily: fuentes.tituloFuerte, fontSize: 18, color: colores.marino },
  etiqueta: { fontSize: 13, color: colores.marino, fontWeight: '800' },
  opcional: { fontWeight: '400', color: colores.textoSuave },

  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  itemBorde: { borderBottomWidth: 1, borderBottomColor: colores.separador },
  itemFoto: { width: 56, height: 56, borderRadius: 14, backgroundColor: colores.superficie, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  itemImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  itemNombre: { fontWeight: '800', fontSize: 14, color: colores.marino },
  itemPrecio: { fontFamily: fuentes.tituloMedio, fontSize: 14, color: colores.marino },
  itemUnidad: { fontSize: 12, color: colores.textoSuave },
  agregarMas: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 40, backgroundColor: colores.superficie, borderRadius: 99, paddingHorizontal: 14 },
  agregarMasTexto: { fontWeight: '800', fontSize: 14, color: colores.marino },

  opcion: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  opcionIcono: { width: 40, height: 40, borderRadius: 20, backgroundColor: colores.superficie, alignItems: 'center', justifyContent: 'center' },
  opcionTitulo: { fontWeight: '800', fontSize: 15, color: colores.marino },
  opcionSub: { fontSize: 13, color: colores.textoSuave },

  metodo: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, borderRadius: 16, borderWidth: 1.5, borderColor: colores.separador, paddingHorizontal: 12 },
  metodoOn: { borderColor: colores.marino, backgroundColor: colores.celesteClaro },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colores.bordeFuerte, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colores.marino },
  radioPunto: { width: 11, height: 11, borderRadius: 6, backgroundColor: colores.marino },
  segmento: { flexDirection: 'row', gap: 4, backgroundColor: colores.superficie, borderRadius: 14, padding: 4 },
  segBtn: { flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: colores.blanco },
  segTexto: { fontWeight: '700', fontSize: 14, color: colores.textoSuave },
  segTextoOn: { fontWeight: '800', color: colores.marino },
  nota: { fontSize: 12, color: colores.textoSuave, lineHeight: 17 },
  cambio: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colores.verdeClaro, borderRadius: 12, padding: 10 },
  cambioTexto: { flex: 1, fontSize: 13, fontWeight: '700', color: colores.verdeTexto },
  montoFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  montoCaja: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 50, borderRadius: 14, backgroundColor: colores.superficie, paddingHorizontal: 12 },
  montoCajaFija: { backgroundColor: colores.separador },
  montoSimbolo: { fontWeight: '800', fontSize: 15, color: colores.textoSuave },
  montoInput: { flex: 1, minHeight: 46, fontFamily: fuentes.tituloMedio, fontSize: 17, color: colores.marino, padding: 0 },
  montoFijo: { flex: 1, fontFamily: fuentes.tituloMedio, fontSize: 16, color: colores.marino },
  montoMas: { fontWeight: '800', fontSize: 18, color: colores.textoSuave },
  billetes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  billete: { minWidth: 64, height: 42, paddingHorizontal: 12, borderRadius: 99, backgroundColor: colores.superficie, alignItems: 'center', justifyContent: 'center' },
  billeteOn: { backgroundColor: colores.marino },
  billeteTexto: { fontWeight: '700', fontSize: 14, color: colores.marino },
  billeteTextoOn: { fontWeight: '800', color: colores.blanco },
  billeteInput: { flex: 1, minWidth: 80, fontWeight: '700', fontSize: 14, color: colores.marino, textAlign: 'center', paddingVertical: 0 },

  cuponInput: { flex: 1, minHeight: 44, fontWeight: '700', fontSize: 15, letterSpacing: 0.5, color: colores.marino, padding: 0 },
  aplicar: { height: 38, minWidth: 80, paddingHorizontal: 14, borderRadius: 99, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  aplicarTexto: { color: colores.blanco, fontWeight: '800', fontSize: 13 },
  cuponMsg: { fontSize: 12, color: colores.error, marginTop: -6, marginLeft: 52 },
  miCupon: { width: 180, gap: 2, backgroundColor: colores.verdeClaro, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colores.verde, padding: 12 },
  miCuponTitulo: { fontWeight: '800', fontSize: 14, color: colores.marino },
  miCuponSub: { fontSize: 12, color: colores.verdeTexto, fontWeight: '700' },
  miCuponUsar: { marginTop: 4, fontWeight: '800', fontSize: 13, color: colores.marino, textDecorationLine: 'underline' },
  interruptor: { width: 46, height: 28, borderRadius: 14, backgroundColor: colores.bordeFuerte, padding: 3, justifyContent: 'center' },
  interruptorOn: { backgroundColor: colores.verde, alignItems: 'flex-end' },
  interruptorBola: { width: 22, height: 22, borderRadius: 11, backgroundColor: colores.blanco },

  resFila: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  resSuave: { fontSize: 14, color: colores.textoSuave },
  resVerde: { fontSize: 14, color: colores.verdeTexto, fontWeight: '700' },
  resTotal: { alignItems: 'baseline', marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: colores.separador },
  totalEtiqueta: { fontWeight: '800', fontSize: 16, color: colores.marino },
  total: { fontFamily: fuentes.tituloFuerte, fontSize: 22, color: colores.marino },
  totalSec: { fontSize: 12, color: colores.textoSuave },

  pie: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colores.blanco, borderTopWidth: 1, borderTopColor: colores.separador, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 14 },
  pedir: { height: 58, borderRadius: 18, backgroundColor: colores.marino, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, gap: 10 },
  pedirTexto: { color: colores.blanco, fontWeight: '800', fontSize: 16 },
  pedirTotal: { fontFamily: fuentes.titulo, fontSize: 16, color: colores.blanco, flexShrink: 1 },

  vacio: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  vacioIcono: { width: 88, height: 88, borderRadius: 44, backgroundColor: colores.superficie, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  vacioTitulo: { fontFamily: fuentes.tituloFuerte, fontSize: 20, color: colores.marino },
  vacioTexto: { fontSize: 14, color: colores.textoSuave, textAlign: 'center' },
  boton: { marginTop: 10, backgroundColor: colores.marino, height: 50, paddingHorizontal: 24, borderRadius: 99, justifyContent: 'center' },
  botonTexto: { color: colores.blanco, fontWeight: '800', fontSize: 15 },

  modalFondo: { flex: 1, backgroundColor: 'rgba(0,16,52,0.45)', justifyContent: 'flex-end' },
  modal: { backgroundColor: colores.blanco, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingTop: 10, paddingBottom: 28, gap: 10 },
  asa: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colores.bordeFuerte, marginBottom: 6 },
  modalTitulo: { fontFamily: fuentes.tituloFuerte, fontSize: 20, color: colores.marino, marginBottom: 4 },
  dirChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 99, backgroundColor: colores.superficie, maxWidth: 220 },
  dirChipOn: { backgroundColor: colores.marino },
  dirChipTexto: { fontWeight: '700', fontSize: 14, color: colores.marino },
  campoEtiqueta: { fontSize: 14, fontWeight: '800', color: colores.marino, marginTop: 4 },
  campo: { minHeight: 50, borderRadius: 14, backgroundColor: colores.superficie, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: colores.marino },
  mapaBtn: { flexDirection: 'row', gap: 8, minHeight: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colores.separador, alignItems: 'center', justifyContent: 'center' },
  mapaBtnTexto: { fontWeight: '800', fontSize: 14, color: colores.marino },
});
