import { useState, useEffect } from 'react';
import { View, FlatList, TouchableOpacity, StyleSheet, Image, ActivityIndicator, SafeAreaView, Alert, ScrollView } from 'react-native';
import { Text, TextInput } from '../../components/Texto';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import api from '../../services/api';
import useCarritoStore from '../../store/carritoStore';
import useAuthStore from '../../store/authStore';
import { absImg } from '../../constants/config';
import SelectorUbicacion from '../../components/SelectorUbicacion';
import * as ImagePicker from 'expo-image-picker';
import { colores, fuentes, radios } from '../../constants/tema';
import { useTasaReferencial, fmtVES } from '../../services/moneda';

const PLACEHOLDER = 'https://via.placeholder.com/80/DDF2F8/001034?text=+';

const METODOS = [
  { key: 'EFECTIVO',   label: 'Efectivo',   icon: 'cash-outline' },
  { key: 'TARJETA',    label: 'Tarjeta',    icon: 'card-outline' },
  { key: 'PAGO_MOVIL', label: 'Pago Móvil', icon: 'phone-portrait-outline' },
];

export default function CarritoScreen() {
  const router = useRouter();
  const { idBranch, idCuenta, token, setPostLoginRedirect } = useAuthStore();

  const items = useCarritoStore((s) => s.items);
  const idPuntoVenta = useCarritoStore((s) => s.idPuntoVenta);
  const nombreSucursalCarrito = useCarritoStore((s) => s.nombreSucursal);
  const agregarItem = useCarritoStore((s) => s.agregarItem);
  const quitarItem = useCarritoStore((s) => s.quitarItem);
  const limpiarCarrito = useCarritoStore((s) => s.limpiarCarrito);
  const total = useCarritoStore((s) =>
    s.items.reduce((acc, item) => acc + item.PrecioUSD * item.Cantidad, 0)
  );

  const [direccion, setDireccion] = useState('');
  const [ubicacion, setUbicacion] = useState(null);       // { Latitud, Longitud }
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [direcciones, setDirecciones] = useState([]);     // guardadas del cliente
  const [notas, setNotas] = useState('');
  const [metodoPago, setMetodoPago] = useState('EFECTIVO');
  const [monedaEfectivo, setMonedaEfectivo] = useState('USD');
  const [loading, setLoading] = useState(false);

  // Pago Móvil
  const [datosPM, setDatosPM] = useState(null);
  const [referencia, setReferencia] = useState('');
  const [comprobante, setComprobante] = useState(null); // { uri, mimeType, fileName }
  const [cotizacion,setCotizacion]=useState(null);
  const [errorTasa,setErrorTasa]=useState('');

  // Puntos / canje
  const [puntosData, setPuntosData] = useState(null);   // { saldo, puntosPorDolarCanje }
  const [usarPuntos, setUsarPuntos] = useState(false);

  const canjeRate = puntosData?.puntosPorDolarCanje || 100;
  const saldoPuntos = puntosData?.saldo || 0;
  // Puntos aplicables: no más que el saldo ni que el total del carrito
  const puntosAplicables = Math.min(saldoPuntos, Math.floor(total * canjeRate));
  const puntosUsar = usarPuntos ? puntosAplicables : 0;
  const descuentoPuntos = +(puntosUsar / canjeRate).toFixed(2);
  const totalPagar = +(total - descuentoPuntos).toFixed(2);

  // Cupón (aplica sobre el total ya con puntos, igual que el backend)
  const [cuponInput, setCuponInput] = useState('');
  const [cuponCodigo, setCuponCodigo] = useState(null);   // código validado y aplicado
  const [descuentoCupon, setDescuentoCupon] = useState(0);
  const [cuponMsg, setCuponMsg] = useState('');           // estado/error mostrado
  const [cuponOk, setCuponOk] = useState(false);
  const [validandoCupon, setValidandoCupon] = useState(false);

  const totalFinal = +Math.max(0, totalPagar - descuentoCupon).toFixed(2);

  // Valida un código contra el total vigente. base = total sobre el que aplica.
  const validarCupon = async (codigo, base) => {
    const cod = String(codigo || '').trim().toUpperCase();
    if (!cod) return;
    setValidandoCupon(true);
    try {
      const r = await api.post('/delivery/cliente/cupones/validar', { codigo: cod, subtotal: base });
      if (r.data?.valido) {
        setCuponCodigo(cod);
        setDescuentoCupon(r.data.descuento || 0);
        setCuponOk(true);
        setCuponMsg(`Cupón ${cod} aplicado`);
      } else {
        setCuponCodigo(null); setDescuentoCupon(0); setCuponOk(false);
        setCuponMsg(r.data?.motivo || 'Cupón no válido');
      }
    } catch {
      setCuponCodigo(null); setDescuentoCupon(0); setCuponOk(false);
      setCuponMsg('No se pudo validar el cupón');
    } finally { setValidandoCupon(false); }
  };

  const quitarCupon = () => {
    setCuponCodigo(null); setDescuentoCupon(0); setCuponOk(false); setCuponMsg(''); setCuponInput('');
  };

  // Si cambia el total (p. ej. toggle de puntos) y hay un cupón aplicado, se
  // recalcula para que el descuento siga siendo correcto.
  useEffect(() => {
    if (cuponCodigo) validarCupon(cuponCodigo, totalPagar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPagar]);

  useEffect(() => {
    if (metodoPago !== 'PAGO_MOVIL' || datosPM) return;
    api.get('/delivery/pago-movil', { params: { idBranch, idCuenta } })
      .then(r => setDatosPM(r.data))
      .catch(() => setDatosPM({ disponible: false }));
  }, [metodoPago]);

  useEffect(()=>{
    if(!token||!['PAGO_MOVIL','EFECTIVO'].includes(metodoPago)) return;
    setErrorTasa('');
    api.get('/delivery/cliente/cotizacion-moneda',{params:{idPuntoVenta}}).then(r=>setCotizacion(r.data)).catch(e=>{setCotizacion(null);setErrorTasa(e.response?.data?.error||'No se pudo consultar la tasa');});
  },[token,metodoPago,idPuntoVenta]);

  useEffect(()=>{
    if (cotizacion?.Modo === 'VES') setMonedaEfectivo('VES');
    if (cotizacion?.Modo === 'USD') setMonedaEfectivo('USD');
  },[cotizacion?.Modo]);

  const tasaVES=Number(cotizacion?.tasa?.VESporUSD)||0;
  const totalVES=Math.round(totalFinal*tasaVES*100)/100;
  // IGTF 3%: solo efectivo en dólares en tiendas contribuyentes especiales
  const igtfUSD = metodoPago === 'EFECTIVO' && monedaEfectivo === 'USD' && cotizacion?.AplicaIGTF
    ? Math.round((totalFinal * 3 / 100 + Number.EPSILON) * 100) / 100 : 0;
  const totalCobroUSD = Math.round((totalFinal + igtfUSD + Number.EPSILON) * 100) / 100;
  // Equivalente de referencia para el resumen (la tasa real se congela al pedir)
  const tasaRef = useTasaReferencial();
  const tcRef = tasaVES || Number(tasaRef?.tasa?.VESporUSD) || 0;
  const totalVESRef = Math.round(totalFinal * tcRef * 100) / 100;

  const elegirComprobante = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!res.canceled && res.assets?.[0]) setComprobante(res.assets[0]);
  };

  // Direcciones guardadas (solo con sesión)
  useEffect(() => {
    if (!token) { setDirecciones([]); return; }
    api.get('/delivery/cliente/direcciones')
      .then(r => setDirecciones(r.data || []))
      .catch(() => {});
    // Puntos disponibles para canje
    api.get('/delivery/cliente/puntos')
      .then(r => setPuntosData(r.data))
      .catch(() => {});
  }, [token]);

  const usarDireccionGuardada = (d) => {
    setDireccion(d.Direccion || '');
    if (d.Latitud != null && d.Longitud != null) {
      setUbicacion({ Latitud: parseFloat(d.Latitud), Longitud: parseFloat(d.Longitud) });
    } else {
      setUbicacion(null);
    }
  };

  const onUbicacionConfirmada = async ({ Latitud, Longitud, guardar, alias }) => {
    setUbicacion({ Latitud, Longitud });
    setSelectorVisible(false);
    if (guardar && token) {
      try {
        await api.post('/delivery/cliente/direcciones', {
          Alias: alias || 'Mi dirección',
          Direccion: direccion.trim() || alias || 'Ubicación en mapa',
          Latitud, Longitud,
        });
        const r = await api.get('/delivery/cliente/direcciones');
        setDirecciones(r.data || []);
      } catch { /* no bloquear el flujo por esto */ }
    }
  };

  const handlePedido = async () => {
    // Explorar y llenar el carrito no requiere cuenta; pedir sí.
    // El carrito está persistido: no se pierde al ir a login/registro.
    if (!token) {
      Alert.alert(
        'Inicia sesión para pedir',
        'Tu carrito se guarda — crea tu cuenta o inicia sesión y termina tu pedido.',
        [
          { text: 'Ahora no', style: 'cancel' },
          {
            text: 'Iniciar sesión',
            onPress: () => {
              setPostLoginRedirect('/(tabs)/carrito');
              router.push('/(auth)/login');
            },
          },
        ]
      );
      return;
    }
    if (!direccion.trim()) {
      Alert.alert('Dirección requerida', 'Por favor ingresa tu dirección de entrega.');
      return;
    }
    if (metodoPago === 'PAGO_MOVIL') {
      if (!cotizacion || !['VES','AMBAS'].includes(cotizacion.Modo)) {
        Alert.alert('Pago Móvil no disponible', errorTasa || 'La cuenta no tiene habilitado el cobro en bolívares.');
        return;
      }
      if (!referencia.trim()) {
        Alert.alert('Referencia requerida', 'Ingresa el número de referencia de tu Pago Móvil.');
        return;
      }
      if (!comprobante) {
        Alert.alert('Comprobante requerido', 'Adjunta la captura de tu Pago Móvil.');
        return;
      }
    }
    if (metodoPago === 'EFECTIVO' && (!cotizacion || !['USD','VES','AMBAS'].includes(cotizacion.Modo))) {
      Alert.alert('Efectivo no disponible', errorTasa || 'No se pudo obtener la configuración monetaria.');
      return;
    }
    if (items.length === 0) return;

    setLoading(true);
    try {
      const payload = {
        idPuntoVenta,
        items: items.map((i) => ({
          idProducto: i.idProducto,
          Cantidad: i.Cantidad,
          PrecioUSD: i.PrecioUSD,
        })),
        DireccionEntrega: direccion.trim(),
        UbicacionEntregaLat: ubicacion?.Latitud ?? null,
        UbicacionEntregaLon: ubicacion?.Longitud ?? null,
        NotasCliente: notas.trim(),
        MetodoPago: metodoPago,
        PuntosUsar: puntosUsar,
        CuponCodigo: cuponCodigo,
        ...(['PAGO_MOVIL','EFECTIVO'].includes(metodoPago)?{PagoMoneda:{
          idTasa:cotizacion.tasa.idTasa,
          Moneda:metodoPago==='PAGO_MOVIL'?'VES':monedaEfectivo,
          MontoOriginal:(metodoPago==='PAGO_MOVIL'||monedaEfectivo==='VES')?totalVES:totalCobroUSD,
        }}:{}),
      };
      const res = await api.post('/delivery/pedido', payload);
      const idPedido = res.data?.idPedido ?? res.data?.pedido?.idPedido;

      // Pago Móvil: subir el comprobante — el admin lo revisa y aprueba
      if (metodoPago === 'PAGO_MOVIL' && comprobante && idPedido) {
        try {
          const fd = new FormData();
          fd.append('Referencia', referencia.trim());
          fd.append('file', {
            uri: comprobante.uri,
            name: comprobante.fileName || `comprobante_${idPedido}.jpg`,
            type: comprobante.mimeType || 'image/jpeg',
          });
          await api.post(`/delivery/pedido/${idPedido}/comprobante`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch {
          Alert.alert(
            'Comprobante no enviado',
            'Tu pedido se creó pero el comprobante no se pudo subir. Podrás mostrarlo al repartidor.'
          );
        }
      }

      limpiarCarrito();
      quitarCupon();
      setUbicacion(null);
      setComprobante(null);
      setReferencia('');
      router.push(`/pedido/${idPedido}`);
    } catch (e) {
      Alert.alert('Error al hacer el pedido', e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Tu pedido</Text>
        </View>
        <View style={styles.empty}>
          <Ionicons name="cart-outline" size={80} color="#CFE4EB" />
          <Text style={styles.emptyTitle}>Tu carrito está vacío</Text>
          <Text style={styles.emptyText}>Agrega tu agua VIDA, Harina PAN y lo que te haga falta.</Text>
          <TouchableOpacity style={styles.exploreBtn} onPress={() => router.push('/(tabs)')}>
            <Text style={styles.exploreBtnText}>Ir a comprar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Tu pedido</Text>
          {nombreSucursalCarrito ? <Text style={styles.headerSub}>De {nombreSucursalCarrito}</Text> : null}
        </View>
        <TouchableOpacity style={styles.clearBtn} onPress={() => {
          Alert.alert('Vaciar carrito', '¿Estás seguro?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Vaciar', style: 'destructive', onPress: limpiarCarrito },
          ]);
        }}>
          <Text style={styles.clearText}>Vaciar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Items */}
        {items.map((item) => (
          <View key={item.idProducto} style={styles.itemCard}>
            <Image
              source={{ uri: absImg(item.ImagenProducto) || PLACEHOLDER }}
              style={styles.itemImg}
            />
            <View style={styles.itemInfo}>
              <Text style={styles.itemNombre} numberOfLines={2}>{item.Nombre}</Text>
              <Text style={styles.itemPrecioUnit}>${item.PrecioUSD.toFixed(2)} c/u</Text>
              <Text style={styles.itemSubtotal}>${(item.PrecioUSD * item.Cantidad).toFixed(2)}</Text>
            </View>
            <View style={styles.qtyCol}>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => quitarItem(item.idProducto)} accessibilityLabel="Quitar uno">
                <Ionicons name="remove" size={16} color="#001034" />
              </TouchableOpacity>
              <Text style={styles.qtyText}>{item.Cantidad}</Text>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => agregarItem({ ...item, Cantidad: 1 })}
                accessibilityLabel="Agregar uno"
              >
                <Ionicons name="add" size={16} color="#001034" />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Delivery section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Entrega</Text>

          {/* Direcciones guardadas */}
          {direcciones.length > 0 && (
            <View style={styles.dirGuardadasRow}>
              {direcciones.map((d) => (
                <TouchableOpacity
                  key={d.idDireccion}
                  style={styles.dirChip}
                  onPress={() => usarDireccionGuardada(d)}
                >
                  <Ionicons
                    name={(d.Alias || '').toLowerCase().includes('casa') ? 'home' : 'bookmark'}
                    size={13} color="#001034"
                  />
                  <Text style={styles.dirChipText} numberOfLines={1}>
                    {d.Alias || d.Direccion}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.inputLabel}>Dirección de entrega *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Av. Principal, Edificio X, Apto 3B"
            placeholderTextColor="#8C9BB0"
            value={direccion}
            onChangeText={setDireccion}
            multiline
          />

          {/* Ubicación en mapa — el repartidor llega directo al pin */}
          <TouchableOpacity style={styles.mapaBtn} onPress={() => setSelectorVisible(true)}>
            <Ionicons
              name={ubicacion ? 'checkmark-circle' : 'location-outline'}
              size={18}
              color={ubicacion ? '#4DAD66' : '#001034'}
            />
            <Text style={[styles.mapaBtnText, ubicacion && { color: '#4DAD66' }]}>
              {ubicacion ? 'Ubicación fijada en el mapa ✓ (tocar para cambiar)' : 'Fijar mi ubicación en el mapa'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.inputLabel}>Método de pago</Text>
          <View style={styles.metodoRow}>
            {METODOS.map((m) => (
              <TouchableOpacity
                key={m.key}
                style={[styles.metodoBtn, metodoPago === m.key && styles.metodoBtnActive]}
                onPress={() => setMetodoPago(m.key)}
              >
                <Ionicons
                  name={m.icon}
                  size={18}
                  color={metodoPago === m.key ? '#fff' : '#4B5B73'}
                />
                <Text style={[styles.metodoBtnText, metodoPago === m.key && styles.metodoBtnTextActive]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {metodoPago === 'EFECTIVO' && cotizacion && (
            <View style={styles.pmCard}>
              <Text style={styles.pmTitulo}>¿En qué moneda pagarás al repartidor?</Text>
              <View style={styles.metodoRow}>
                {['USD','VES'].filter(m => cotizacion.Modo === 'AMBAS' || cotizacion.Modo === m).map(m => (
                  <TouchableOpacity key={m} style={[styles.metodoBtn, monedaEfectivo === m && styles.metodoBtnActive]} onPress={() => setMonedaEfectivo(m)}>
                    <Text style={[styles.metodoBtnText, monedaEfectivo === m && styles.metodoBtnTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {igtfUSD > 0 && <PMRow label="IGTF 3% (pago en divisas)" valor={`$${igtfUSD.toFixed(2)} USD`} />}
              <PMRow label="Total a entregar" valor={monedaEfectivo === 'VES' ? `${totalVES.toFixed(2)} VES` : `$${totalCobroUSD.toFixed(2)} USD`} destacado />
              {cotizacion.AplicaIGTF && cotizacion.Modo === 'AMBAS' ? (
                <Text style={styles.igtfNota}>
                  {monedaEfectivo === 'USD' ? 'Pagando en dólares se suma el IGTF (3%). En bolívares no aplica.' : 'En bolívares no pagas IGTF.'}
                </Text>
              ) : null}
              {monedaEfectivo === 'VES' && <PMRow label="Tasa" valor={`1 USD = ${tasaVES} VES · ${String(cotizacion.tasa.FechaValor).slice(0,10)}`} />}
            </View>
          )}

          {/* Pago Móvil: datos + referencia + comprobante */}
          {metodoPago === 'PAGO_MOVIL' && (
            <View style={styles.pmCard}>
              {datosPM === null ? (
                <ActivityIndicator size="small" color="#001034" />
              ) : !datosPM.disponible ? (
                <Text style={styles.pmNoDisponible}>
                  Pago Móvil no está configurado todavía. Elige otro método.
                </Text>
              ) : (
                <>
                  <Text style={styles.pmTitulo}>Realiza tu Pago Móvil a:</Text>
                  <View style={styles.pmDatos}>
                    <PMRow label="Banco"    valor={datosPM.Banco} />
                    <PMRow label="Teléfono" valor={datosPM.Telefono} />
                    <PMRow label="Cédula"   valor={datosPM.Cedula} />
                    {datosPM.Titular ? <PMRow label="Titular" valor={datosPM.Titular} /> : null}
                    <PMRow label="Monto" valor={cotizacion ? `${totalVES.toFixed(2)} VES` : 'Consultando tasa…'} destacado />
                    {cotizacion ? <PMRow label="Tasa" valor={`1 USD = ${tasaVES} VES · ${String(cotizacion.tasa.FechaValor).slice(0,10)}`} /> : null}
                  </View>

                  <Text style={styles.inputLabel}>Nº de referencia *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ej: 001234567890"
                    placeholderTextColor="#8C9BB0"
                    value={referencia}
                    onChangeText={setReferencia}
                    keyboardType="number-pad"
                  />

                  <TouchableOpacity style={styles.comprobanteBtn} onPress={elegirComprobante}>
                    {comprobante ? (
                      <>
                        <Image source={{ uri: comprobante.uri }} style={styles.comprobanteThumb} />
                        <Text style={[styles.comprobanteBtnText, { color: '#4DAD66' }]}>
                          Comprobante adjunto ✓ (tocar para cambiar)
                        </Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="image-outline" size={20} color="#001034" />
                        <Text style={styles.comprobanteBtnText}>Adjuntar captura del pago *</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}
              {errorTasa ? <Text style={styles.pmNoDisponible}>{errorTasa}</Text> : null}
            </View>
          )}

          <Text style={styles.inputLabel}>Notas para el establecimiento</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            placeholder="Ej: Sin cebolla, por favor..."
            placeholderTextColor="#8C9BB0"
            value={notas}
            onChangeText={setNotas}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Canje de puntos */}
        {token && saldoPuntos > 0 && puntosAplicables > 0 && (
          <TouchableOpacity style={styles.puntosBox} activeOpacity={0.8}
            onPress={() => setUsarPuntos(v => !v)}>
            <View style={styles.puntosIco}>
              <Text style={styles.puntosIcoText}>pts</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.puntosBoxTitle}>Usar mis puntos</Text>
              <Text style={styles.puntosBoxSub}>
                Tienes {saldoPuntos.toLocaleString('es-VE')} pts · aplicas {puntosAplicables.toLocaleString('es-VE')} = −${(puntosAplicables / canjeRate).toFixed(2)}
              </Text>
            </View>
            <View style={[styles.toggle, usarPuntos && styles.toggleOn]}>
              <View style={[styles.toggleDot, usarPuntos && styles.toggleDotOn]} />
            </View>
          </TouchableOpacity>
        )}

        {/* Cupón de descuento */}
        {token && (
          <View style={styles.cuponBox}>
            <View style={styles.cuponRow}>
              <View style={styles.cuponIco}>
                <Ionicons name="pricetag" size={16} color={colores.marino} />
              </View>
              <TextInput
                style={styles.cuponInput}
                placeholder="¿Tienes un cupón?"
                placeholderTextColor="#8C9BB0"
                autoCapitalize="characters"
                value={cuponInput}
                editable={!cuponOk}
                onChangeText={setCuponInput}
              />
              {cuponOk ? (
                <TouchableOpacity style={styles.cuponBtnQuitar} onPress={quitarCupon}>
                  <Text style={styles.cuponBtnQuitarText}>Quitar</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.cuponBtn}
                  disabled={validandoCupon || !cuponInput.trim()}
                  onPress={() => validarCupon(cuponInput, totalPagar)}
                >
                  {validandoCupon ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.cuponBtnText}>Aplicar</Text>}
                </TouchableOpacity>
              )}
            </View>
            {cuponMsg ? (
              <Text style={[styles.cuponMsg, { color: cuponOk ? colores.verdeTexto : colores.error }]}>{cuponMsg}</Text>
            ) : null}
          </View>
        )}

        {/* Summary */}
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>${total.toFixed(2)}</Text>
          </View>
          {descuentoPuntos > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colores.verdeTexto }]}>Descuento puntos ({puntosUsar.toLocaleString('es-VE')} pts)</Text>
              <Text style={[styles.summaryValue, { color: colores.verdeTexto }]}>−${descuentoPuntos.toFixed(2)}</Text>
            </View>
          )}
          {descuentoCupon > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colores.verdeTexto }]}>Cupón {cuponCodigo}</Text>
              <Text style={[styles.summaryValue, { color: colores.verdeTexto }]}>−${descuentoCupon.toFixed(2)}</Text>
            </View>
          )}
          {igtfUSD > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>IGTF 3% (pago en dólares)</Text>
              <Text style={styles.summaryValue}>+${igtfUSD.toFixed(2)}</Text>
            </View>
          )}
          <View style={[styles.summaryRow, styles.summaryTotal]}>
            <Text style={styles.summaryTotalLabel}>Total a pagar</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.summaryTotalValue}>${totalCobroUSD.toFixed(2)}</Text>
              {totalVESRef > 0 ? <Text style={styles.summaryTotalSec}>≈ {fmtVES(totalVESRef)} · tasa BCV</Text> : null}
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.pedidoBtn, loading && styles.btnDisabled]}
          onPress={handlePedido}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.pedidoBtnText}>Hacer pedido</Text>
              <Text style={styles.pedidoBtnPrecio}>${totalCobroUSD.toFixed(2)}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      <SelectorUbicacion
        visible={selectorVisible}
        onClose={() => setSelectorVisible(false)}
        onConfirmar={onUbicacionConfirmada}
        puedeGuardar={!!token}
      />
    </SafeAreaView>
  );
}

function PMRow({ label, valor, destacado }) {
  return (
    <View style={pmStyles.row}>
      <Text style={pmStyles.label}>{label}</Text>
      <Text style={[pmStyles.valor, destacado && pmStyles.valorDestacado]} selectable>
        {valor || '—'}
      </Text>
    </View>
  );
}

const pmStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 30, gap: 10 },
  label: { fontSize: 13, color: colores.textoSuave },
  valor: { fontSize: 14, fontWeight: '800', color: colores.marino, flexShrink: 1, textAlign: 'right' },
  valorDestacado: { fontSize: 17, color: colores.marino, fontFamily: fuentes.titulo },
});

const styles = StyleSheet.create({
  igtfNota: { fontSize: 12, color: colores.textoSuave, marginTop: 6, lineHeight: 17 },
  container: { flex: 1, backgroundColor: colores.fondo },
  pmCard: {
    backgroundColor: colores.fondo, borderWidth: 1, borderColor: colores.borde,
    borderRadius: radios.medio, padding: 14, marginTop: 12, marginBottom: 6,
  },
  pmNoDisponible: { fontSize: 13, color: colores.error, textAlign: 'center' },
  pmTitulo: { fontSize: 14, fontWeight: '800', color: colores.marino, marginBottom: 8 },
  pmDatos: { backgroundColor: colores.blanco, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10, borderWidth: 1, borderColor: colores.borde },
  comprobanteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56,
    backgroundColor: colores.blanco, borderRadius: radios.medio, borderWidth: 2, borderStyle: 'dashed', borderColor: '#8ACFE2',
    paddingHorizontal: 14, marginTop: 10,
  },
  comprobanteBtnText: { color: colores.marino, fontSize: 14, fontWeight: '800', flex: 1 },
  comprobanteThumb: { width: 40, height: 40, borderRadius: 10 },
  dirGuardadasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  dirChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 40,
    backgroundColor: colores.celesteClaro, borderRadius: 999, paddingHorizontal: 14, maxWidth: 190,
  },
  dirChipText: { color: colores.marino, fontSize: 13, fontWeight: '800' },
  mapaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48,
    backgroundColor: colores.celesteClaro, borderRadius: radios.medio, paddingHorizontal: 14, marginTop: 10, marginBottom: 4,
  },
  mapaBtnText: { color: colores.marino, fontSize: 14, fontWeight: '800', flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: colores.marino },
  headerSub: { fontSize: 13, color: colores.textoSuave, marginTop: 1 },
  clearBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  clearText: { color: colores.error, fontWeight: '800', fontSize: 14 },
  scroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
  itemCard: {
    backgroundColor: colores.blanco, borderRadius: radios.grande, padding: 10,
    flexDirection: 'row', alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: colores.borde,
  },
  itemImg: { width: 62, height: 62, borderRadius: 14, resizeMode: 'cover', backgroundColor: colores.celesteClaro },
  itemInfo: { flex: 1, paddingHorizontal: 12 },
  itemNombre: { fontSize: 14, fontWeight: '800', color: colores.marino },
  itemPrecioUnit: { fontSize: 12, color: colores.textoSuave, marginTop: 2 },
  itemSubtotal: { fontSize: 15, color: colores.marino, marginTop: 4, fontFamily: fuentes.titulo },
  qtyCol: { flexDirection: 'row', alignItems: 'center', backgroundColor: colores.fondo, borderRadius: 16, padding: 2 },
  qtyBtn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  qtyText: { minWidth: 20, textAlign: 'center', fontSize: 15, fontWeight: '800', color: colores.marino },
  section: { backgroundColor: colores.blanco, borderRadius: radios.grande, padding: 16, marginTop: 6, borderWidth: 1, borderColor: colores.borde },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colores.marino, marginBottom: 6 },
  inputLabel: { fontSize: 13, fontWeight: '800', color: colores.marino, marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1.5, borderColor: colores.bordeFuerte, borderRadius: radios.medio,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colores.marino, backgroundColor: colores.blanco, minHeight: 50,
  },
  inputMulti: { minHeight: 76, textAlignVertical: 'top' },
  metodoRow: { flexDirection: 'row', gap: 8 },
  metodoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 50,
    borderRadius: radios.medio, borderWidth: 1.5, borderColor: colores.borde, backgroundColor: colores.blanco,
  },
  metodoBtnActive: { backgroundColor: colores.celesteClaro, borderColor: colores.marino, borderWidth: 2 },
  metodoBtnText: { fontWeight: '800', color: colores.textoSuave, fontSize: 13 },
  metodoBtnTextActive: { color: colores.marino },
  summary: { backgroundColor: colores.blanco, borderRadius: radios.grande, padding: 16, marginTop: 12, borderWidth: 1, borderColor: colores.borde },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryLabel: { color: colores.textoSuave, fontSize: 14 },
  summaryValue: { color: colores.marino, fontSize: 14, fontWeight: '700' },
  puntosBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colores.verdeClaro, borderRadius: radios.medio, padding: 14, marginTop: 12,
  },
  puntosIco: { width: 40, height: 40, borderRadius: 13, backgroundColor: colores.verde, alignItems: 'center', justifyContent: 'center' },
  puntosIcoText: { color: colores.marino, fontSize: 13, fontFamily: fuentes.tituloFuerte },
  puntosBoxTitle: { fontSize: 14, fontWeight: '800', color: colores.marino },
  puntosBoxSub: { fontSize: 12, color: colores.verdeTexto, marginTop: 2 },
  toggle: { width: 46, height: 28, borderRadius: 14, backgroundColor: colores.bordeFuerte, padding: 3, justifyContent: 'center' },
  toggleOn: { backgroundColor: colores.verde },
  toggleDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colores.blanco },
  toggleDotOn: { alignSelf: 'flex-end' },
  cuponBox: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: radios.medio, padding: 12, marginTop: 10 },
  cuponRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cuponIco: { width: 36, height: 36, borderRadius: 11, backgroundColor: colores.celesteClaro, alignItems: 'center', justifyContent: 'center' },
  cuponInput: { flex: 1, fontSize: 15, fontWeight: '800', color: colores.marino, paddingVertical: 8, letterSpacing: 1 },
  cuponBtn: { backgroundColor: colores.marino, borderRadius: 12, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' },
  cuponBtnText: { color: colores.blanco, fontWeight: '800', fontSize: 14 },
  cuponBtnQuitar: { borderWidth: 1.5, borderColor: colores.bordeFuerte, borderRadius: 12, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  cuponBtnQuitarText: { color: colores.marino, fontWeight: '800', fontSize: 14 },
  cuponMsg: { fontSize: 12, fontWeight: '700', marginTop: 8, marginLeft: 4 },
  summaryTotal: { borderTopWidth: 1, borderTopColor: colores.borde, marginTop: 8, paddingTop: 12, alignItems: 'flex-start' },
  summaryTotalLabel: { fontSize: 16, fontWeight: '800', color: colores.marino, marginTop: 4 },
  summaryTotalValue: { fontSize: 24, color: colores.marino, fontFamily: fuentes.tituloFuerte },
  summaryTotalSec: { fontSize: 12, color: colores.textoSuave },
  pedidoBtn: {
    backgroundColor: colores.marino, borderRadius: 18, minHeight: 58, paddingHorizontal: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16,
  },
  btnDisabled: { opacity: 0.6 },
  pedidoBtnText: { color: colores.blanco, fontSize: 17, fontWeight: '800' },
  pedidoBtnPrecio: { color: colores.blanco, fontSize: 18, fontFamily: fuentes.titulo },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: colores.marino, marginTop: 16 },
  emptyText: { color: colores.textoSuave, textAlign: 'center', marginTop: 8, fontSize: 14, lineHeight: 20 },
  exploreBtn: { marginTop: 24, backgroundColor: colores.marino, borderRadius: radios.medio, paddingHorizontal: 28, minHeight: 50, justifyContent: 'center' },
  exploreBtnText: { color: colores.blanco, fontWeight: '800', fontSize: 15 },
});
