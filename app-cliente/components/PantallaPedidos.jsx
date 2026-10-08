// Mis pedidos (diseño "Agua VIDA"): en curso con su avance y anteriores con
// "Repetir este pedido". Es la pestaña "Pedidos" y también /mis-pedidos.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text } from './Texto';
import { BotonAtras } from './Cabecera';
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

  const Tarjeta = ({ p }) => {
    const entregado = p.Status === 'ENTREGADO';
    return (
      <TouchableOpacity style={styles.tarjeta} activeOpacity={0.9} onPress={() => router.push(`/pedido/${p.idPedido}`)}>
        <View style={styles.fila}>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.tarjetaTitulo}>#{p.idPedido} · {p.NombreSucursal || 'VIDA'}</Text>
            <Text style={styles.tarjetaFecha}>{fechaHora(p.FechaCreacion)}</Text>
          </View>
          <View style={[styles.estado, { backgroundColor: entregado ? '#DDF1E2' : '#F6E1E1' }]}>
            <Text style={[styles.estadoTexto, { color: entregado ? colores.verdeTexto : '#8A2B2B' }]}>{ESTADO[p.Status]}</Text>
          </View>
        </View>
        <View style={styles.fila}>
          <Text style={styles.detalle} numberOfLines={1}>{detalle(p)}</Text>
          <Text style={styles.total}>{fmtUSD(total(p))}</Text>
        </View>
        {entregado && p.items?.length ? (
          <TouchableOpacity style={styles.repetir} onPress={() => repetir(p)}>
            <Text style={styles.repetirTexto}>Repetir este pedido</Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.contenido} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} tintColor={colores.marino} />}>
        <View style={styles.cabecera}>
          {conAtras ? <BotonAtras /> : null}
          <Text style={styles.titulo}>Mis pedidos</Text>
        </View>

        {!token ? (
          <View style={styles.vacioCaja}>
            <Text style={styles.vacio}>Inicia sesión para ver tus pedidos.</Text>
            <TouchableOpacity style={styles.boton} onPress={() => router.push('/(auth)/login')}><Text style={styles.botonTexto}>Entrar</Text></TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.segmento}>
              {[['curso', `En curso (${enCurso.length})`], ['anteriores', 'Anteriores']].map(([k, t]) => (
                <TouchableOpacity key={k} onPress={() => setPestana(k)} style={[styles.segBtn, pestana === k && styles.segBtnOn]}
                  accessibilityRole="tab" accessibilityState={{ selected: pestana === k }}>
                  <Text style={[styles.segTexto, pestana === k && styles.segTextoOn]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {cargando ? <ActivityIndicator color={colores.marino} style={{ marginTop: 24 }} /> : pestana === 'curso' ? (
              <>
                {enCurso.map((p) => (
                  <TouchableOpacity key={p.idPedido} style={styles.activo} activeOpacity={0.9} onPress={() => router.push(`/pedido/${p.idPedido}`)}>
                    <View style={styles.fila}>
                      <Text style={styles.activoTitulo}>#{p.idPedido} · {p.NombreSucursal || 'VIDA'}</Text>
                      <View style={styles.activoEstado}><Text style={styles.activoEstadoTexto}>{ESTADO[p.Status] || 'En curso'}</Text></View>
                    </View>
                    <View style={styles.barra}><View style={[styles.barraLlena, { width: `${(AVANCE[p.Status] ?? 0.2) * 100}%` }]} /></View>
                    <View style={styles.fila}>
                      <Text style={styles.activoSub}>
                        {p.MinutosRestantes != null && p.MinutosRestantes >= 0 ? `Llega en ${p.MinutosRestantes} min` : ESTADO[p.Status]}
                      </Text>
                      <Text style={styles.activoLink}>Ver en el mapa</Text>
                    </View>
                  </TouchableOpacity>
                ))}
                {enCurso.length === 0 && <Text style={styles.vacio}>No tienes pedidos en curso.</Text>}
                {esteMes.length > 0 && <Text style={styles.h2}>Este mes</Text>}
                {esteMes.map((p) => <Tarjeta key={p.idPedido} p={p} />)}
              </>
            ) : (
              <>
                {grupos.length === 0 && <Text style={styles.vacio}>Aún no tienes pedidos anteriores.</Text>}
                {grupos.map((g) => (
                  <View key={g.titulo} style={{ gap: 10 }}>
                    <Text style={styles.h2}>{g.titulo}</Text>
                    {g.lista.map((p) => <Tarjeta key={p.idPedido} p={p} />)}
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28, gap: 14 },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titulo: { fontFamily: fuentes.tituloFuerte, fontSize: 26, color: colores.marino },
  segmento: { flexDirection: 'row', gap: 6, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 16, padding: 4 },
  segBtn: { flex: 1, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: colores.marino },
  segTexto: { fontWeight: '700', fontSize: 14, color: colores.textoSuave },
  segTextoOn: { fontWeight: '800', color: colores.blanco },

  activo: { backgroundColor: colores.marino, borderRadius: 24, padding: 16, gap: 10 },
  activoTitulo: { fontFamily: fuentes.titulo, fontSize: 16, color: colores.blanco, flexShrink: 1 },
  activoEstado: { backgroundColor: colores.celeste, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  activoEstadoTexto: { color: colores.marino, fontWeight: '800', fontSize: 12 },
  barra: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  barraLlena: { height: '100%', backgroundColor: colores.celeste },
  activoSub: { fontSize: 14, color: colores.sobreMarino },
  activoLink: { fontSize: 14, fontWeight: '800', color: colores.blanco },

  h2: { marginTop: 6, fontFamily: fuentes.titulo, fontSize: 17, color: colores.marino },
  tarjeta: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 22, padding: 14, gap: 10 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  tarjetaTitulo: { fontWeight: '800', fontSize: 15, color: colores.marino },
  tarjetaFecha: { fontSize: 13, color: colores.textoSuave },
  estado: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  estadoTexto: { fontWeight: '800', fontSize: 12 },
  detalle: { flex: 1, fontSize: 13, color: '#2C3D58' },
  total: { fontFamily: fuentes.titulo, fontSize: 16, color: colores.marino },
  repetir: { height: 44, borderRadius: 14, borderWidth: 1.5, borderColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  repetirTexto: { fontWeight: '800', fontSize: 14, color: colores.marino },

  vacioCaja: { gap: 12, alignItems: 'flex-start' },
  vacio: { fontSize: 14, color: colores.textoSuave },
  boton: { backgroundColor: colores.marino, height: 44, paddingHorizontal: 18, borderRadius: 14, justifyContent: 'center' },
  botonTexto: { color: colores.blanco, fontWeight: '800', fontSize: 14 },
});
