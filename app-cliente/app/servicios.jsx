import { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Text, TextInput } from '../components/Texto';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import api from '../services/api';
import { colores, fuentes, radios } from '../constants/tema';
import { useTasaReferencial, precioEnLinea } from '../services/moneda';

const MONTOS = [1, 2, 5, 10, 20];
const METODOS = [
  { k: 'PAGO_MOVIL', l: 'Pago móvil' },
  { k: 'ZELLE', l: 'Zelle' },
  { k: 'TRANSFERENCIA', l: 'Transferencia' },
  { k: 'TARJETA', l: 'Tarjeta' },
];
const ESTADO_COLOR = { PROCESANDO: '#F59E0B', COMPLETADO: '#1F7A3F', RECHAZADO: '#DC2626' };

export default function ServiciosScreen() {
  const tasa = useTasaReferencial();
  const router = useRouter();
  const [operadoras, setOperadoras] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState(null);      // operadora elegida
  const [numero, setNumero] = useState('');
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState('PAGO_MOVIL');
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [o, m] = await Promise.all([
        api.get('/delivery/cliente/servicios/operadoras'),
        api.get('/delivery/cliente/servicios'),
      ]);
      setOperadoras(o.data || []);
      setOrdenes(m.data || []);
    } catch {} finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const reset = () => { setSel(null); setNumero(''); setMonto(''); setMetodo('PAGO_MOVIL'); };

  const confirmar = async () => {
    const m = Number(monto);
    if (!numero.trim() || !(m > 0)) { Alert.alert('Faltan datos', 'Ingresa el número y un monto mayor a 0.'); return; }
    setEnviando(true);
    try {
      const r = await api.post('/delivery/cliente/servicios', {
        idOperadora: sel.idOperadora, NumeroDestino: numero.trim(), MontoUSD: m, MetodoPago: metodo,
      });
      Alert.alert('¡Solicitud recibida!',
        `${sel.Nombre} · $${m.toFixed(2)}\nReferencia: ${r.data.referencia}\nGanaste ${r.data.puntosGanados} puntos.\n\nTu recarga se procesará en breve.`);
      reset(); cargar();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'No se pudo crear la solicitud.');
    } finally { setEnviando(false); }
  };

  // Agrupar operadoras por categoría
  const grupos = operadoras.reduce((acc, o) => { (acc[o.Categoria || 'Servicios'] ||= []).push(o); return acc; }, {});
  const esMovil = sel?.Tipo === 'RECARGA_MOVIL';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (sel ? reset() : router.back())}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
        <Text style={styles.headerTitle}>{sel ? sel.Nombre : 'Servicios y Recargas'}</Text>
        <View style={{ width: 22 }} />
      </View>

      {cargando ? <ActivityIndicator style={{ marginTop: 40 }} color="#001034" /> : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {!sel ? (
            <>
              {Object.entries(grupos).map(([cat, ops]) => (
                <View key={cat} style={{ marginBottom: 16 }}>
                  <Text style={styles.catTitle}>{cat}</Text>
                  <View style={styles.grid}>
                    {ops.map(o => (
                      <TouchableOpacity key={o.idOperadora} style={styles.op} onPress={() => setSel(o)} activeOpacity={0.85}>
                        <View style={[styles.opDot, { backgroundColor: o.Color || '#001034' }]}>
                          <Text style={styles.opDotText}>{o.Nombre.slice(0, 1)}</Text>
                        </View>
                        <Text style={styles.opName}>{o.Nombre}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}

              {ordenes.length > 0 && (
                <>
                  <Text style={styles.catTitle}>Mis servicios</Text>
                  {ordenes.map(o => (
                    <View key={o.idOrden} style={styles.ordRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.ordName}>{o.NombreOperadora} · {o.NumeroDestino}</Text>
                        <Text style={styles.ordSub}>{o.Referencia} · ${Number(o.MontoUSD).toFixed(2)}</Text>
                      </View>
                      <Text style={[styles.ordEstado, { color: ESTADO_COLOR[o.Status] || '#4B5B73' }]}>{o.Status}</Text>
                    </View>
                  ))}
                </>
              )}
            </>
          ) : (
            <>
              <Text style={styles.label}>{esMovil ? 'Número de teléfono' : 'Número de cuenta / contrato'}</Text>
              <TextInput style={styles.input} value={numero} onChangeText={setNumero}
                keyboardType={esMovil ? 'phone-pad' : 'default'} placeholder={esMovil ? '0412 000 0000' : 'N° de cuenta'} placeholderTextColor="#8C9BB0" />

              <Text style={styles.label}>Monto (USD)</Text>
              <TextInput style={styles.input} value={monto} onChangeText={setMonto} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#8C9BB0" />
              <View style={styles.montosRow}>
                {MONTOS.map(m => (
                  <TouchableOpacity key={m} style={[styles.montoChip, Number(monto) === m && styles.montoChipOn]} onPress={() => setMonto(String(m))}>
                    <Text style={[styles.montoChipText, Number(monto) === m && { color: '#fff' }]}>${m}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Método de pago</Text>
              <View style={styles.metodosRow}>
                {METODOS.map(m => (
                  <TouchableOpacity key={m.k} style={[styles.metodoChip, metodo === m.k && styles.metodoChipOn]} onPress={() => setMetodo(m.k)}>
                    <Text style={[styles.metodoChipText, metodo === m.k && { color: '#fff' }]}>{m.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={[styles.confirmBtn, enviando && { opacity: 0.6 }]} onPress={confirmar} disabled={enviando}>
                {enviando ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>Solicitar {monto ? `— ${precioEnLinea(Number(monto), tasa)}` : ''}</Text>}
              </TouchableOpacity>
              <Text style={styles.hint}>Tu solicitud queda en proceso; el equipo VIDA la completa y te acredita puntos.</Text>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },
  header: { backgroundColor: colores.marino, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, minHeight: 60 },
  headerTitle: { color: colores.blanco, fontSize: 18, fontWeight: '700' },
  catTitle: { fontSize: 14, fontWeight: '800', color: colores.marino, marginBottom: 8, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  op: { width: '30%', backgroundColor: colores.blanco, borderRadius: radios.medio, paddingVertical: 16, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colores.borde },
  opDot: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  opDotText: { color: colores.blanco, fontWeight: '900', fontSize: 18 },
  opName: { fontSize: 13, fontWeight: '800', color: colores.marino },
  ordRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colores.blanco, borderRadius: radios.medio, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colores.borde },
  ordName: { fontSize: 14, fontWeight: '800', color: colores.marino },
  ordSub: { fontSize: 12, color: colores.textoSuave, marginTop: 2 },
  ordEstado: { fontSize: 11, fontWeight: '800' },
  label: { fontSize: 14, fontWeight: '800', color: colores.marino, marginTop: 16, marginBottom: 6 },
  input: { backgroundColor: colores.blanco, borderWidth: 1.5, borderColor: colores.bordeFuerte, borderRadius: radios.medio, paddingHorizontal: 14, paddingVertical: 13, fontSize: 18, color: colores.marino, fontFamily: fuentes.tituloMedio },
  montosRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  montoChip: { paddingHorizontal: 18, minHeight: 48, justifyContent: 'center', borderRadius: radios.medio, backgroundColor: colores.blanco, borderWidth: 1.5, borderColor: colores.bordeFuerte },
  montoChipOn: { backgroundColor: colores.marino, borderColor: colores.marino },
  montoChipText: { fontWeight: '800', color: colores.marino, fontSize: 15 },
  metodosRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metodoChip: { paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderRadius: radios.medio, backgroundColor: colores.blanco, borderWidth: 1.5, borderColor: colores.bordeFuerte },
  metodoChipOn: { backgroundColor: colores.celesteClaro, borderColor: colores.marino },
  metodoChipText: { fontWeight: '800', color: colores.marino, fontSize: 13 },
  confirmBtn: { backgroundColor: colores.marino, borderRadius: 18, minHeight: 58, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  confirmText: { color: colores.blanco, fontSize: 17, fontWeight: '800' },
  hint: { fontSize: 12, color: colores.verdeTexto, textAlign: 'center', marginTop: 10, fontWeight: '700' },
});
