import { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Text } from '../../components/Texto';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../../services/api';
import { fmtUSD, fmtVES } from '../../services/cobro';
import { colores, fuentes, radios } from '../../constants/tema';

const PERIODOS = [
  { key: 'hoy',    label: 'Hoy',    titulo: 'Tus comisiones de hoy' },
  { key: 'semana', label: 'Semana', titulo: 'Tus comisiones esta semana' },
  { key: 'mes',    label: 'Mes',    titulo: 'Tus comisiones de los últimos 30 días' },
];
const LETRA_DIA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
// "Lunes 6 oct" en hora de Caracas
const fechaLarga = (f) => {
  const d = new Date(new Date(f).getTime() - 4 * 3600 * 1000);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
};

export default function GananciasScreen() {
  const [periodo, setPeriodo] = useState('semana');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async (p) => {
    try {
      const r = await api.get('/delivery/repartidor/ganancias', { params: { periodo: p } });
      setDatos(r.data); setError('');
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudieron cargar tus ganancias');
    } finally {
      setCargando(false); setRefrescando(false);
    }
  }, []);

  useEffect(() => { setCargando(true); cargar(periodo); }, [periodo, cargar]);

  const p = PERIODOS.find(x => x.key === periodo);
  const serie = datos?.serie || [];
  const maximo = Math.max(...serie.map(d => d.Comision), 0.01);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(periodo); }} colors={[colores.marino]} />}
      >
        <Text style={styles.titulo}>Ganancias</Text>

        <View style={styles.segmento} accessibilityRole="tablist">
          {PERIODOS.map(x => (
            <TouchableOpacity key={x.key} onPress={() => setPeriodo(x.key)} accessibilityRole="tab" accessibilityState={{ selected: periodo === x.key }}
              style={[styles.segBtn, periodo === x.key && styles.segBtnOn]}>
              <Text style={[styles.segTexto, periodo === x.key && styles.segTextoOn]}>{x.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {error ? (
          <TouchableOpacity style={styles.error} onPress={() => { setCargando(true); cargar(periodo); }}>
            <Text style={styles.errorTexto}>{error}. Toca para reintentar.</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.hero}>
          {cargando && !datos ? <ActivityIndicator color={colores.blanco} style={{ marginVertical: 30 }} /> : (
            <>
              <View>
                <Text style={styles.heroEtiqueta}>{p.titulo}</Text>
                <Text style={styles.heroMonto}>{fmtUSD(datos?.Comision)}</Text>
                <Text style={styles.heroEtiqueta}>{datos?.Entregas ?? 0} entrega{datos?.Entregas === 1 ? '' : 's'}</Text>
              </View>
              {serie.length > 1 && (
                <View style={[styles.barras, { gap: serie.length <= 7 ? 8 : 2 }]}>
                  {serie.map((d, i) => {
                    const esHoy = d.Hoy ?? i === serie.length - 1;
                    const alto = Math.max(8, Math.round((d.Comision / maximo) * 100));
                    return (
                      <View key={d.Fecha} style={styles.barraCol}>
                        <View style={[styles.barra, { height: `${alto}%`, backgroundColor: esHoy ? colores.celeste : '#24427E' }]} />
                        {serie.length <= 7 ? <Text style={styles.barraDia}>{LETRA_DIA[new Date(d.Fecha + 'T12:00:00').getDay()]}</Text> : null}
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </View>

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Efectivo por rendir a la tienda</Text>
          <View style={styles.dosCol}>
            <View style={styles.tarjeta}>
              <Text style={styles.tarjetaEtiqueta}>En dólares</Text>
              <Text style={styles.tarjetaMonto}>{fmtUSD(datos?.SaldoPendienteUSD)}</Text>
            </View>
            <View style={styles.tarjeta}>
              <Text style={styles.tarjetaEtiqueta}>En bolívares</Text>
              <Text style={[styles.tarjetaMonto, { fontSize: 18 }]}>{fmtVES(datos?.SaldoPendienteVES)}</Text>
            </View>
          </View>
          <Text style={styles.nota}>Ya descontada tu comisión. Cada moneda se rinde aparte.</Text>
        </View>

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Liquidaciones</Text>
          <View style={[styles.tarjeta, { paddingVertical: 2 }]}>
            {(datos?.liquidaciones || []).length === 0 ? (
              <Text style={styles.vacio}>Aún no tienes liquidaciones.</Text>
            ) : datos.liquidaciones.map((l, i, arr) => (
              <View key={l.idLiquidacion} style={[styles.liq, i < arr.length - 1 && styles.liqBorde]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.liqFecha}>{fechaLarga(l.Fecha)}</Text>
                  <Text style={styles.liqDetalle}>
                    {[l.USD > 0 && fmtUSD(l.USD), l.VES > 0 && fmtVES(l.VES)].filter(Boolean).join(' y ') || fmtUSD(0)} entregados · {l.NumPedidos} pedido{l.NumPedidos === 1 ? '' : 's'}
                  </Text>
                </View>
                <View style={styles.liqBadge}><Text style={styles.liqBadgeTexto}>Liquidado</Text></View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  scroll: { padding: 20, paddingBottom: 40, gap: 14 },
  titulo: { fontFamily: fuentes.tituloFuerte, fontSize: 26, color: colores.marino },

  segmento: { flexDirection: 'row', gap: 6, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 16, padding: 4 },
  segBtn: { flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: colores.marino },
  segTexto: { fontWeight: '800', fontSize: 14, color: colores.textoSuave },
  segTextoOn: { color: colores.blanco },

  error: { backgroundColor: colores.errorClaro, borderRadius: radios.chico, padding: 12 },
  errorTexto: { color: colores.error, fontSize: 13, fontWeight: '700' },

  hero: { backgroundColor: colores.marino, borderRadius: 26, padding: 20, gap: 14 },
  heroEtiqueta: { fontSize: 13, color: colores.sobreMarino },
  heroMonto: { fontFamily: fuentes.tituloFuerte, fontSize: 40, lineHeight: 46, color: colores.blanco },
  barras: { height: 84, flexDirection: 'row', alignItems: 'flex-end' },
  barraCol: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', gap: 6 },
  barra: { width: '100%', borderRadius: 6 },
  barraDia: { fontSize: 11, fontWeight: '700', color: colores.sobreMarino },

  seccion: { gap: 8 },
  seccionTitulo: { fontWeight: '800', fontSize: 15, color: colores.marino },
  dosCol: { flexDirection: 'row', gap: 10 },
  tarjeta: { flex: 1, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 20, padding: 14 },
  tarjetaEtiqueta: { fontSize: 12, color: colores.textoSuave, fontWeight: '700' },
  tarjetaMonto: { fontFamily: fuentes.tituloFuerte, fontSize: 22, color: colores.marino },
  nota: { fontSize: 12, color: colores.textoSuave },

  vacio: { fontSize: 14, color: colores.textoSuave, paddingVertical: 14 },
  liq: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 10 },
  liqBorde: { borderBottomWidth: 1, borderBottomColor: '#EEF6F8' },
  liqFecha: { fontWeight: '700', fontSize: 14, color: colores.marino },
  liqDetalle: { fontSize: 12, color: colores.textoSuave },
  liqBadge: { backgroundColor: '#DDF1E2', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5 },
  liqBadgeTexto: { color: colores.verdeTexto, fontWeight: '800', fontSize: 12 },
});
