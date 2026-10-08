import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, SectionList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { Text } from '../../components/Texto';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { fmtUSD } from '../../services/cobro';
import { colores, fuentes } from '../../constants/tema';

const LIMITE = 20;
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Fecha y hora de Caracas (UTC−4) sin depender de la zona del teléfono
const caracas = (f) => new Date(new Date(f).getTime() - 4 * 3600 * 1000);
const claveMes = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
function ultimosMeses(n = 6) {
  const hoy = caracas(Date.now());
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
    return { clave: claveMes(d), nombre: `${MESES[d.getUTCMonth()]}${i >= hoy.getUTCMonth() + 1 ? ` ${d.getUTCFullYear()}` : ''}` };
  });
}
function etiquetaDia(f) {
  const d = caracas(f), hoy = caracas(Date.now());
  const dia = (x) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const dif = Math.round((dia(hoy) - dia(d)) / 86400000);
  if (dif === 0) return 'Hoy';
  if (dif === 1) return 'Ayer';
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()].toLowerCase()}`;
}
const hora = (f) => {
  const d = caracas(f); let h = d.getUTCHours(); const m = String(d.getUTCMinutes()).padStart(2, '0');
  const pm = h >= 12; h = h % 12 || 12;
  return `${h}:${m} ${pm ? 'p. m.' : 'a. m.'}`;
};
// Moneda con la que pagó el cliente: Pago Móvil y efectivo VES son
// bolívares; MIXTA = efectivo combinado (parte en dólares y parte en Bs)
function monedaPedido(p) {
  let s = p.PagoMonedaJSON;
  if (typeof s === 'string') { try { s = JSON.parse(s); } catch { s = null; } }
  if (s?.Moneda === 'MIXTA') return 'MIXTA';
  if (p.MetodoPago === 'PAGO_MOVIL' || s?.Moneda === 'VES') return 'VES';
  return 'USD';
}
const ETIQUETA_MONEDA = { USD: 'USD', VES: 'VES', MIXTA: '$+Bs' };
const estrellas = (n) => (n ? `${n} estrella${n === 1 ? '' : 's'}` : 'Sin calificar');

function Entrega({ item }) {
  const moneda = monedaPedido(item);
  const ves = moneda === 'VES';
  const detalle = [hora(item.FechaEntrega || item.FechaAlta), item.DireccionEntrega?.split(',')[0]?.trim(),
    item.DistanciaKm > 0.05 ? `${Number(item.DistanciaKm).toLocaleString('es-VE', { maximumFractionDigits: 1 })} km` : null]
    .filter(Boolean).join(' · ');
  return (
    <View style={styles.entrega}>
      <View style={[styles.moneda, ves && styles.monedaVES, moneda === 'MIXTA' && styles.monedaMixta]}>
        <Text style={[styles.monedaTexto, ves && { color: colores.blanco }, moneda === 'MIXTA' && { fontSize: 11 }]}>{ETIQUETA_MONEDA[moneda]}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.entregaTitulo} numberOfLines={1}>#{item.idPedido}{item.Cliente ? ` · ${item.Cliente}` : ''}</Text>
        <Text style={styles.entregaDetalle} numberOfLines={1}>{detalle}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.comision}>+{fmtUSD(item.ComisionRepartidor)}</Text>
        <Text style={styles.entregaDetalle}>{estrellas(item.Estrellas)}</Text>
      </View>
    </View>
  );
}

export default function Historial() {
  const meses = useMemo(() => ultimosMeses(), []);
  const [mes, setMes] = useState(meses[0].clave);
  const [eligiendoMes, setEligiendoMes] = useState(false);
  const [pedidos, setPedidos] = useState([]);
  const [resumen, setResumen] = useState({ total: 0, Comisiones: 0 });
  const [calificacion, setCalificacion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [hayMas, setHayMas] = useState(false);

  const cargar = useCallback(async (p, m) => {
    try {
      const r = await api.get('/delivery/repartidor/historial', { params: { page: p, limit: LIMITE, mes: m } });
      const data = r.data.data || [];
      setPedidos(prev => (p === 1 ? data : [...prev, ...data]));
      setResumen({ total: r.data.total ?? data.length, Comisiones: r.data.Comisiones ?? 0 });
      setHayMas(p < (r.data.pages || 1));
      setPagina(p);
    } catch { /* se queda con lo que había */ }
    finally { setCargando(false); setRefrescando(false); }
  }, []);

  useEffect(() => { setCargando(true); cargar(1, mes); }, [mes, cargar]);
  useEffect(() => { api.get('/delivery/repartidor/perfil').then(r => setCalificacion(r.data?.Calificacion ?? null)).catch(() => {}); }, []);

  const secciones = useMemo(() => {
    const grupos = [];
    for (const p of pedidos) {
      const t = etiquetaDia(p.FechaEntrega || p.FechaAlta);
      if (grupos.at(-1)?.title !== t) grupos.push({ title: t, data: [] });
      grupos.at(-1).data.push(p);
    }
    return grupos;
  }, [pedidos]);

  const nombreMes = meses.find(m => m.clave === mes)?.nombre;
  const kpis = [
    { etiqueta: 'Entregas', valor: String(resumen.total) },
    { etiqueta: 'Comisiones', valor: fmtUSD(resumen.Comisiones) },
    { etiqueta: 'Calificación', valor: calificacion != null ? Number(calificacion).toLocaleString('es-VE', { maximumFractionDigits: 1 }) : '—' },
  ];

  const cabecera = (
    <View style={{ gap: 14, marginBottom: 4 }}>
      <View style={styles.tituloFila}>
        <Text style={styles.titulo}>Historial</Text>
        <TouchableOpacity style={styles.mesBtn} onPress={() => setEligiendoMes(v => !v)} accessibilityLabel={`Mes: ${nombreMes}. Cambiar`}>
          <Text style={styles.mesTexto}>{nombreMes}</Text>
          <Ionicons name={eligiendoMes ? 'chevron-up' : 'chevron-down'} size={16} color={colores.marino} />
        </TouchableOpacity>
      </View>
      {eligiendoMes && (
        <View style={styles.meses}>
          {meses.map(m => (
            <TouchableOpacity key={m.clave} onPress={() => { setMes(m.clave); setEligiendoMes(false); }}
              style={[styles.mesOpcion, m.clave === mes && styles.mesOpcionOn]}>
              <Text style={[styles.mesOpcionTexto, m.clave === mes && { color: colores.blanco }]}>{m.nombre}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={styles.kpis}>
        {kpis.map(k => (
          <View key={k.etiqueta} style={styles.kpi}>
            <Text style={styles.kpiEtiqueta}>{k.etiqueta}</Text>
            <Text style={styles.kpiValor} numberOfLines={1} adjustsFontSizeToFit>{k.valor}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <SectionList
        sections={secciones}
        keyExtractor={item => String(item.idPedido)}
        renderItem={({ item }) => <Entrega item={item} />}
        renderSectionHeader={({ section }) => <Text style={styles.dia}>{section.title}</Text>}
        ListHeaderComponent={cabecera}
        contentContainerStyle={styles.lista}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(1, mes); }} colors={[colores.marino]} />}
        onEndReached={() => { if (hayMas && !cargando) cargar(pagina + 1, mes); }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={cargando || hayMas ? <ActivityIndicator style={{ margin: 16 }} color={colores.marino} /> : null}
        ListEmptyComponent={cargando ? null : (
          <View style={styles.vacio}>
            <Ionicons name="bag-check-outline" size={48} color={colores.textoTenue} />
            <Text style={styles.vacioTexto}>Sin entregas en {nombreMes?.toLowerCase()}.</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  lista: { padding: 20, paddingBottom: 40 },
  tituloFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titulo: { fontFamily: fuentes.tituloFuerte, fontSize: 26, color: colores.marino },
  mesBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 14,
    borderRadius: 14, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde,
  },
  mesTexto: { fontWeight: '800', fontSize: 14, color: colores.marino },
  meses: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mesOpcion: { paddingHorizontal: 14, minHeight: 40, justifyContent: 'center', borderRadius: 12, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde },
  mesOpcionOn: { backgroundColor: colores.marino, borderColor: colores.marino },
  mesOpcionTexto: { fontWeight: '700', fontSize: 13, color: colores.marino },
  kpis: { flexDirection: 'row', gap: 8 },
  kpi: { flex: 1, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 18, padding: 12 },
  kpiEtiqueta: { fontSize: 12, color: colores.textoSuave, fontWeight: '700' },
  kpiValor: { fontFamily: fuentes.tituloFuerte, fontSize: 19, color: colores.marino },
  dia: { fontWeight: '800', fontSize: 14, color: colores.textoSuave, marginTop: 10, marginBottom: 10 },
  entrega: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colores.blanco,
    borderWidth: 1, borderColor: colores.borde, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10,
  },
  moneda: { width: 44, height: 44, borderRadius: 14, backgroundColor: colores.celesteClaro, alignItems: 'center', justifyContent: 'center' },
  monedaVES: { backgroundColor: colores.marino },
  monedaMixta: { borderWidth: 2, borderColor: colores.marino },
  monedaTexto: { fontFamily: fuentes.titulo, fontSize: 12, color: colores.marino },
  entregaTitulo: { fontWeight: '800', fontSize: 15, color: colores.marino },
  entregaDetalle: { fontSize: 12, color: colores.textoSuave },
  comision: { fontFamily: fuentes.titulo, fontSize: 15, color: colores.verdeTexto },
  vacio: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  vacioTexto: { color: colores.textoSuave, fontSize: 15 },
});
