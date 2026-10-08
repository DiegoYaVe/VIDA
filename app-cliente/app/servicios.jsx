// Recargas y servicios (diseño "Agua VIDA"): operadora, número, monto,
// puntos que ganas y "Recargar". Se paga con Pago Móvil; el equipo VIDA la
// procesa y acredita los puntos.
import { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, TextInput } from '../components/Texto';
import { BotonAtras } from '../components/Cabecera';
import api from '../services/api';
import { colores, fuentes } from '../constants/tema';
import { useTasaReferencial, fmtUSD, fmtVES } from '../services/moneda';

const MONTOS = [1, 2, 5, 10];
const PUNTOS_POR_DOLAR = 10;
const TIPO = { RECARGA_MOVIL: 'Móvil', INTERNET: 'Internet', TV: 'TV', INTERNET_TV: 'Internet y TV' };

export default function ServiciosScreen() {
  const tasa = useTasaReferencial();
  const [operadoras, setOperadoras] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState(null);
  const [numero, setNumero] = useState('');
  const [monto, setMonto] = useState(2);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await api.get('/delivery/cliente/servicios/operadoras');
      setOperadoras(r.data || []);
      setSel((s) => s || (r.data || [])[0] || null);
    } catch {} finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const esMovil = !sel || sel.Tipo === 'RECARGA_MOVIL';
  const tc = Number(tasa?.tasa?.VESporUSD) || 0;

  const recargar = async () => {
    if (!sel) return;
    if (!numero.trim()) return Alert.alert('Falta el número', esMovil ? 'Escribe el número a recargar.' : 'Escribe tu número de cuenta o contrato.');
    setEnviando(true);
    try {
      const r = await api.post('/delivery/cliente/servicios', { idOperadora: sel.idOperadora, NumeroDestino: numero.trim(), MontoUSD: monto, MetodoPago: 'PAGO_MOVIL' });
      Alert.alert('Solicitud recibida', `${sel.Nombre} · ${fmtUSD(monto)}\nReferencia: ${r.data.referencia}\nGanaste ${r.data.puntosGanados} puntos.\n\nTu recarga se procesará en breve.`);
      setNumero('');
    } catch (e) {
      Alert.alert('No se pudo solicitar', e.response?.data?.error || 'Intenta de nuevo.');
    } finally { setEnviando(false); }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.cabecera}>
            <BotonAtras />
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.titulo}>Recargas y servicios</Text>
              <Text style={styles.sub}>Paga tu línea, internet o TV y gana puntos</Text>
            </View>
          </View>

          {cargando ? <ActivityIndicator color={colores.marino} /> : (
            <View style={styles.grid}>
              {operadoras.map((o) => {
                const activa = sel?.idOperadora === o.idOperadora;
                return (
                  <TouchableOpacity key={o.idOperadora} style={[styles.op, activa && styles.opActiva]} onPress={() => setSel(o)}
                    accessibilityRole="radio" accessibilityState={{ selected: activa }}>
                    <Text style={[styles.opNombre, activa && { color: colores.blanco }]} numberOfLines={1}>{o.Nombre}</Text>
                    <Text style={[styles.opTipo, activa && { color: colores.blanco }]} numberOfLines={1}>{TIPO[o.Tipo] || o.Categoria || 'Servicio'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <View style={{ gap: 6 }}>
            <Text style={styles.etiqueta}>{esMovil ? 'Número a recargar' : 'Número de cuenta o contrato'}</Text>
            <TextInput style={styles.numero} value={numero} onChangeText={setNumero} placeholder={esMovil ? '0414-' : 'N° de cuenta'}
              placeholderTextColor={colores.textoTenue} keyboardType={esMovil ? 'phone-pad' : 'default'} accessibilityLabel="Número a recargar" />
          </View>

          <View style={{ gap: 8 }}>
            <Text style={styles.etiqueta}>Monto</Text>
            <View style={styles.montos}>
              {MONTOS.map((m) => (
                <TouchableOpacity key={m} style={[styles.monto, monto === m && styles.montoActivo]} onPress={() => setMonto(m)}>
                  <Text style={[styles.montoTexto, monto === m && { color: colores.blanco }]}>${m}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.sub}>{tc ? `≈ ${fmtVES(Math.round(monto * tc * 100) / 100)} · ` : ''}pagas con Pago Móvil</Text>
          </View>

          <View style={styles.puntos}>
            <View style={styles.puntosIcono}><Text style={styles.puntosIconoTexto}>pts</Text></View>
            <Text style={styles.puntosTexto}>Con esta recarga ganas <Text style={{ fontWeight: '800' }}>{(monto * PUNTOS_POR_DOLAR).toLocaleString('es-VE')} puntos</Text></Text>
          </View>
        </ScrollView>
        <View style={styles.pie}>
          <TouchableOpacity style={[styles.boton, (enviando || !sel) && { opacity: 0.6 }]} onPress={recargar} disabled={enviando || !sel}>
            {enviando ? <ActivityIndicator color={colores.blanco} /> : <Text style={styles.botonTexto}>Recargar {fmtUSD(monto)}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 16 },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titulo: { fontFamily: fuentes.tituloFuerte, fontSize: 22, color: colores.marino },
  sub: { fontSize: 13, color: colores.textoSuave },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  op: { width: '31%', flexGrow: 1, maxWidth: '32%', height: 74, borderRadius: 18, backgroundColor: colores.blanco, borderWidth: 1.5, borderColor: colores.borde, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 6 },
  opActiva: { backgroundColor: colores.marino, borderColor: colores.marino },
  opNombre: { fontWeight: '800', fontSize: 14, color: colores.marino },
  opTipo: { fontSize: 11, color: colores.marino, opacity: 0.8 },
  etiqueta: { fontSize: 14, fontWeight: '800', color: colores.marino },
  numero: { height: 54, borderRadius: 16, borderWidth: 1.5, borderColor: colores.bordeFuerte, backgroundColor: colores.blanco, paddingHorizontal: 16, fontFamily: fuentes.tituloMedio, fontSize: 18, color: colores.marino },
  montos: { flexDirection: 'row', gap: 8 },
  monto: { flex: 1, height: 52, borderRadius: 16, borderWidth: 1.5, borderColor: colores.bordeFuerte, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center' },
  montoActivo: { backgroundColor: colores.marino, borderColor: colores.marino },
  montoTexto: { fontFamily: fuentes.titulo, fontSize: 16, color: colores.marino },
  puntos: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colores.verdeClaro, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14 },
  puntosIcono: { width: 40, height: 40, borderRadius: 13, backgroundColor: colores.verde, alignItems: 'center', justifyContent: 'center' },
  puntosIconoTexto: { fontFamily: fuentes.tituloFuerte, fontSize: 13, color: colores.marino },
  puntosTexto: { flex: 1, fontSize: 14, color: colores.marino },
  pie: { paddingHorizontal: 20, paddingBottom: 20 },
  boton: { height: 58, borderRadius: 18, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  botonTexto: { color: colores.blanco, fontWeight: '800', fontSize: 17 },
});
