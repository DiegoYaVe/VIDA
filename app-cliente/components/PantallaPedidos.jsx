// Mis pedidos (estilo apps de delivery): en curso con su avance y anteriores
// en filas con la tienda, fecha, total, estado y "Repetir". Es la pestaña
// "Pedidos" y también /mis-pedidos.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text } from './Texto';
import { BotonAtras } from './Cabecera';
import { Icono, Invitado, PortadaTienda } from './ui';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import useCarritoStore from '../store/carritoStore';
import { agregarConTienda } from '../services/carrito';
import { fmtUSD, igtfDelPedido } from '../services/moneda';
import { colores, fuentes } from '../constants/tema';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const TERMINADOS = ['ENTREGADO', 'CANCELADO'];
const AVANCE = { ESPERANDO_PAGO: 0.1, BUSCANDO_REPARTIDOR: 0.25, REPARTIDOR_ASIGNADO: 0.4, IR_A_SUCURSAL: 0.5, EN_SUCURSAL: 0.6, EN_CAMINO: 0.8 };
const ESTADO = {
  ESPERANDO_PAGO: 'Esperando pago', BUSCANDO_REPARTIDOR: 'Buscando repartidor', REPARTIDOR_ASIGNADO: 'Preparando',
  IR_A_SUCURSAL: 'Preparando', EN_SUCURSAL: 'Preparando', EN_CAMINO: 'En camino', ENTREGADO: 'Entregado', CANCELADO: 'Cancelado',
};

function fechaHora(f) {
  const d = new Date(f);
  let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0'); const pm = h >= 12; h = h % 12 || 12;
  return `${d.getDate()} ${MESES[d.getMonth()]} · ${h}:${m} ${pm ? 'p. m.' : 'a. m.'}`;
}
const detalle = (p) => (p.items || []).map((i) => `${i.Nombre}${i.Cantidad > 1 ? ` ×${Number(i.Cantidad)}` : ''}`).join(' · ')
  || `${p.TotalItems || 0} producto${p.TotalItems === 1 ? '' : 's'}`;
const total = (p) => Number(p.TotalUSD || 0) + igtfDelPedido(p);

export default function PantallaPedidos({ conAtras = false }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [pedidos, setPedidos] = useState([]);
  const [pestana, setPestana] = useState('curso');
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    if (!token) { setCargando(false); return; }
    try {
      const r = await api.get('/delivery/cliente/pedidos');
      setPedidos(Array.isArray(r.data) ? r.data : []);
    } catch { /* se queda con lo que había */ }
    finally { setCargando(false); setRefrescando(false); }
  }, [token]);
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const enCurso = pedidos.filter((p) => !TERMINADOS.includes(p.Status));
  const pasados = pedidos.filter((p) => TERMINADOS.includes(p.Status));
  const ahora = new Date();
  const esteMes = pasados.filter((p) => { const d = new Date(p.FechaCreacion); return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear(); });
  const grupos = useMemo(() => {
    const g = [];
    for (const p of pasados) {
      const d = new Date(p.FechaCreacion);
      const t = `${MESES_LARGO[d.getMonth()]}${d.getFullYear() !== ahora.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
      if (g.at(-1)?.titulo !== t) g.push({ titulo: t, lista: [] });
      g.at(-1).lista.push(p);
    }
    return g;
  }, [pedidos]);

  const repetir = (p) => {
    if (!p.items?.length) return;
    const [primero, ...resto] = p.items;
    agregarConTienda({ ...primero, idPuntoVenta: p.idPuntoVenta, NombreSucursal: p.NombreSucursal }, primero.Cantidad, () => {
      resto.forEach((it) => useCarritoStore.getState().agregarItem(
        { idProducto: it.idProducto, Nombre: it.Nombre, PrecioUSD: it.PrecioUSD, ImagenProducto: it.ImagenProducto }, it.Cantidad));
      router.push('/(tabs)/carrito');
    });
  };

  const Fila = ({ p, ultimo }) => {
    const entregado = p.Status === 'ENTREGADO';
    return (
      <TouchableOpacity style={[styles.fila, !ultimo && styles.filaBorde]} activeOpacity={0.7} onPress={() => router.push(`/pedido/${p.idPedido}`)}>
        <PortadaTienda nombre="" id={p.idPuntoVenta} alto={56} radio={14} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.filaTitulo} numberOfLines={1}>{p.NombreSucursal || 'VIDA'}</Text>
          <Text style={styles.filaSub} numberOfLines={1}>{fechaHora(p.FechaCreacion)} · {fmtUSD(total(p))}</Text>
          <View style={styles.filaEstado}>
            <Icono nombre={entregado ? 'checkmark-circle' : 'close-circle'} tam={14} color={entregado ? colores.verdeTexto : colores.error} />
            <Text style={[styles.filaEstadoTexto, { color: entregado ? colores.verdeTexto : colores.error }]}>{ESTADO[p.Status]}</Text>
            <Text style={styles.filaDetalle} numberOfLines={1}> · {detalle(p)}</Text>
          </View>
        </View>
        {entregado && p.items?.length ? (
          <TouchableOpacity style={styles.repetir} onPress={() => repetir(p)} accessibilityLabel={`Repetir pedido ${p.idPedido}`}>
            <Icono nombre="refresh" tam={15} />
            <Text style={styles.repetirTexto}>Repetir</Text>
          </TouchableOpacity>
        ) : <Icono nombre="chevron-forward" tam={18} color={colores.textoTenue} />}
      </TouchableOpacity>
    );
  };

  if (!token) {
    return (
      <SafeAreaView edges={['top']} style={styles.root}>
        <StatusBar style="dark" />
        {conAtras ? <View style={{ padding: 16 }}><BotonAtras /></View> : null}
        <Invitado icono="receipt-outline" titulo="Tus pedidos" texto="Inicia sesión para seguir tus pedidos en el mapa y repetir los que más compras." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.cabecera}>
        {conAtras ? <BotonAtras /> : null}
        <Text style={styles.titulo}>Pedidos</Text>
      </View>
      <View style={styles.pestanas}>
        {[['curso', 'En curso', enCurso.length], ['anteriores', 'Anteriores', null]].map(([k, t, n]) => (
          <TouchableOpacity key={k} onPress={() => setPestana(k)} style={[styles.pestana, pestana === k && styles.pestanaOn]}
            accessibilityRole="tab" accessibilityState={{ selected: pestana === k }}>
            <Text style={[styles.pestanaTexto, pestana === k && styles.pestanaTextoOn]}>{t}</Text>
            {n ? <View style={styles.contador}><Text style={styles.contadorTexto}>{n}</Text></View> : null}
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.contenido} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} tintColor={colores.marino} />}>
        {cargando ? <ActivityIndicator color={colores.marino} style={{ marginTop: 32 }} /> : pestana === 'curso' ? (
          <>
            {enCurso.map((p) => {
              const min = p.MinutosRestantes != null && p.MinutosRestantes >= 0 ? p.MinutosRestantes : null;
              return (
                <TouchableOpacity key={p.idPedido} style={styles.activo} activeOpacity={0.92} onPress={() => router.push(`/pedido/${p.idPedido}`)}>
                  <View style={styles.activoDeco} />
                  <View style={styles.activoFila}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.activoEstado}>{ESTADO[p.Status] || 'En curso'}</Text>
                      <Text style={styles.activoTitulo} numberOfLines={1}>{min != null ? `Llega en ${min} min` : p.NombreSucursal || 'Tu pedido'}</Text>
                    </View>
                    <View style={styles.activoIcono}><Icono nombre={p.Status === 'EN_CAMINO' ? 'bicycle' : p.Status === 'ESPERANDO_PAGO' ? 'wallet' : 'bag-handle'} tam={24} /></View>
                  </View>
                  <View style={styles.barra}><View style={[styles.barraLlena, { width: `${(AVANCE[p.Status] ?? 0.2) * 100}%` }]} /></View>
                  <View style={styles.activoFila}>
                    <Text style={styles.activoSub} numberOfLines={1}>#{p.idPedido} · {p.NombreSucursal || 'VIDA'} · {fmtUSD(total(p))}</Text>
                    <View style={styles.activoVer}><Icono nombre="map" tam={14} /><Text style={styles.activoVerTexto}>Seguir</Text></View>
                  </View>
                </TouchableOpacity>
              );
            })}
            {enCurso.length === 0 && (
              <View style={styles.vacio}>
                <Icono nombre="bag-handle-outline" tam={40} color={colores.textoTenue} />
                <Text style={styles.vacioTitulo}>Sin pedidos en curso</Text>
                <TouchableOpacity style={styles.boton} onPress={() => router.push('/(tabs)')}><Text style={styles.botonTexto}>Hacer un pedido</Text></TouchableOpacity>
              </View>
            )}
            {esteMes.length > 0 && <Text style={styles.h2}>Este mes</Text>}
            {esteMes.map((p, i) => <Fila key={p.idPedido} p={p} ultimo={i === esteMes.length - 1} />)}
          </>
        ) : (
          <>
            {grupos.length === 0 && (
              <View style={styles.vacio}>
                <Icono nombre="time-outline" tam={40} color={colores.textoTenue} />
                <Text style={styles.vacioTitulo}>Aún no tienes pedidos anteriores</Text>
              </View>
            )}
            {grupos.map((g) => (
              <View key={g.titulo}>
                <Text style={styles.h2}>{g.titulo}</Text>
                {g.lista.map((p, i) => <Fila key={p.idPedido} p={p} ultimo={i === g.lista.length - 1} />)}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 14 },
  titulo: { fontFamily: fuentes.tituloFuerte, fontSize: 28, color: colores.marino },
  pestanas: { flexDirection: 'row', paddingHorizontal: 20, gap: 18, borderBottomWidth: 1, borderBottomColor: colores.separador, marginTop: 6 },
  pestana: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 48, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  pestanaOn: { borderBottomColor: colores.marino },
  pestanaTexto: { fontWeight: '700', fontSize: 15, color: colores.textoSuave },
  pestanaTextoOn: { fontWeight: '800', color: colores.marino },
  contador: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: colores.celeste, alignItems: 'center', justifyContent: 'center' },
  contadorTexto: { fontSize: 11, fontWeight: '800', color: colores.marino },
  contenido: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28, gap: 12 },

  activo: { backgroundColor: colores.marino, borderRadius: 22, padding: 16, gap: 12, overflow: 'hidden' },
  activoDeco: { position: 'absolute', right: -40, top: -60, width: 170, height: 170, borderRadius: 85, backgroundColor: colores.marinoClaro },
  activoFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  activoEstado: { fontSize: 12, fontWeight: '800', color: colores.celeste, textTransform: 'uppercase', letterSpacing: 0.6 },
  activoTitulo: { fontFamily: fuentes.tituloFuerte, fontSize: 22, color: colores.blanco },
  activoIcono: { width: 48, height: 48, borderRadius: 24, backgroundColor: colores.celeste, alignItems: 'center', justifyContent: 'center' },
  barra: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  barraLlena: { height: '100%', borderRadius: 3, backgroundColor: colores.celeste },
  activoSub: { flex: 1, fontSize: 13, color: colores.sobreMarino },
  activoVer: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colores.blanco, borderRadius: 99, paddingHorizontal: 12, height: 32 },
  activoVerTexto: { fontSize: 13, fontWeight: '800', color: colores.marino },

  h2: { marginTop: 10, fontFamily: fuentes.tituloFuerte, fontSize: 18, color: colores.marino },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  filaBorde: { borderBottomWidth: 1, borderBottomColor: colores.separador },
  filaTitulo: { fontWeight: '800', fontSize: 15, color: colores.marino },
  filaSub: { fontSize: 13, color: colores.textoSuave },
  filaEstado: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  filaEstadoTexto: { fontSize: 12, fontWeight: '800' },
  filaDetalle: { flex: 1, fontSize: 12, color: colores.textoTenue },
  repetir: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 12, borderRadius: 99, backgroundColor: colores.superficie },
  repetirTexto: { fontWeight: '800', fontSize: 13, color: colores.marino },

  vacio: { alignItems: 'center', gap: 10, paddingVertical: 28 },
  vacioTitulo: { fontWeight: '800', fontSize: 15, color: colores.textoSuave },
  boton: { backgroundColor: colores.marino, height: 46, paddingHorizontal: 20, borderRadius: 99, justifyContent: 'center' },
  botonTexto: { color: colores.blanco, fontWeight: '800', fontSize: 14 },
});
