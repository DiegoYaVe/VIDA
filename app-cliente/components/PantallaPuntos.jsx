// Puntos y premios (diseño "Agua VIDA"): saldo, premios para canjear y
// movimientos. Es la pestaña "Puntos" y también /mis-puntos y /premios.
import { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text } from './Texto';
import { BotonAtras } from './Cabecera';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import { absImg } from '../constants/config';
import { colores, fuentes } from '../constants/tema';

const FONDOS = ['#EADCCB', '#F6E1C6', '#DDF2F8', '#F5E7B8'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
function cuando(f) {
  const d = new Date(f), hoy = new Date();
  const dia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dif = Math.round((dia(hoy) - dia(d)) / 86400000);
  if (dif === 0) return 'Hoy';
  if (dif === 1) return 'Ayer';
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}
const pts = (n) => Number(n || 0).toLocaleString('es-VE');

export default function PantallaPuntos({ conAtras = false }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [saldo, setSaldo] = useState(0);
  const [premios, setPremios] = useState([]);
  const [movs, setMovs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [proc, setProc] = useState(null);

  const cargar = useCallback(async () => {
    if (!token) { setCargando(false); return; }
    try {
      const [p, m] = await Promise.all([
        api.get('/delivery/cliente/premios'),
        api.get('/delivery/cliente/puntos'),
      ]);
      setSaldo(p.data?.saldo ?? m.data?.saldo ?? 0);
      setPremios(p.data?.premios ?? []);
      setMovs(m.data?.movimientos ?? []);
    } catch { /* se queda con lo que había */ }
    finally { setCargando(false); setRefrescando(false); }
  }, [token]);
  useEffect(() => { cargar(); }, [cargar]);

  const canjear = (premio) => {
    Alert.alert('Canjear premio', `${premio.Nombre}\nCuesta ${pts(premio.CostoPuntos)} puntos.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Canjear', onPress: async () => {
        setProc(premio.idPremio);
        try {
          const r = await api.post(`/delivery/cliente/premios/${premio.idPremio}/canjear`);
          Alert.alert('¡Canje exitoso!', `${premio.Nombre}\nCódigo: ${r.data.codigo}\n\nMuéstralo en tu tienda VIDA para reclamarlo.`);
          cargar();
        } catch (e) {
          Alert.alert('No se pudo canjear', e.response?.data?.error || 'Intenta de nuevo.');
        } finally { setProc(null); }
      } },
    ]);
  };

  if (!token) {
    return (
      <SafeAreaView edges={['top']} style={styles.root}>
        <View style={styles.contenido}>
          <Text style={styles.titulo}>Puntos y premios</Text>
          <View style={styles.saldo}>
            <View style={styles.saldoDeco} />
            <Text style={styles.saldoTexto}>Inicia sesión para ganar puntos con cada pedido y con tu racha de agua.</Text>
            <TouchableOpacity style={styles.entrar} onPress={() => router.push('/(auth)/login')}>
              <Text style={styles.entrarTexto}>Entrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.contenido} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} tintColor={colores.marino} />}>
        <View style={styles.cabecera}>
          {conAtras ? <BotonAtras /> : null}
          <Text style={[styles.titulo, conAtras && { fontSize: 22 }]}>Puntos y premios</Text>
        </View>

        <View style={styles.saldo}>
          <View style={styles.saldoDeco} />
          <Text style={styles.saldoEtiqueta}>Tienes</Text>
          <Text style={styles.saldoNum}>{pts(saldo)} <Text style={styles.saldoPts}>pts</Text></Text>
          <Text style={styles.saldoTexto}>Ganas puntos con cada pedido y con tu racha de agua.</Text>
        </View>

        {cargando ? <ActivityIndicator color={colores.marino} style={{ marginTop: 20 }} /> : (
          <>
            <View style={styles.seccion}>
              <Text style={styles.h2}>Canjea</Text>
              <Text style={styles.nota}>Según disponibilidad</Text>
            </View>
            {premios.length === 0 ? <Text style={styles.vacio}>Pronto habrá premios para canjear.</Text> : (
              <View style={styles.grid}>
                {premios.map((p, i) => {
                  const img = absImg(p.ImagenUrl || p.ImagenURL);
                  const alcanza = saldo >= p.CostoPuntos && p.Stock !== 0;
                  return (
                    <View key={p.idPremio} style={styles.premio}>
                      <View style={[styles.premioFoto, { backgroundColor: FONDOS[i % FONDOS.length] }]}>
                        {img ? <Image source={{ uri: img }} style={styles.premioImg} /> : null}
                      </View>
                      <Text style={styles.premioNombre} numberOfLines={2}>{p.Nombre}</Text>
                      <View style={styles.premioPie}>
                        <Text style={styles.premioPts}>{pts(p.CostoPuntos)} pts</Text>
                        <TouchableOpacity style={[styles.canjear, !alcanza && { opacity: 0.45 }]} onPress={() => canjear(p)} disabled={!alcanza || proc === p.idPremio}>
                          {proc === p.idPremio ? <ActivityIndicator color={colores.marino} size="small" /> : <Text style={styles.canjearTexto}>{p.Stock === 0 ? 'Agotado' : 'Canjear'}</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            <Text style={[styles.h2, { marginTop: 4 }]}>Movimientos</Text>
            <View style={styles.movs}>
              {movs.length === 0 ? <Text style={styles.vacio}>Haz tu primer pedido y empieza a ganar puntos.</Text> : movs.slice(0, 30).map((m, i, arr) => {
                const gana = m.Puntos >= 0;
                return (
                  <View key={m.idMovimiento ?? i} style={[styles.mov, i < arr.length - 1 && styles.movBorde]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.movTitulo} numberOfLines={1}>{m.Descripcion || (gana ? 'Puntos ganados' : 'Canje')}</Text>
                      <Text style={styles.movFecha}>{cuando(m.FechaAlta)}</Text>
                    </View>
                    <Text style={[styles.movPts, { color: gana ? colores.verdeTexto : '#8A2B2B' }]}>{gana ? '+ ' : '− '}{pts(Math.abs(m.Puntos))}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.fondo },
  contenido: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28, gap: 14 },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titulo: { fontFamily: fuentes.tituloFuerte, fontSize: 26, color: colores.marino },

  saldo: { backgroundColor: colores.marino, borderRadius: 26, padding: 20, gap: 4, overflow: 'hidden' },
  saldoDeco: { position: 'absolute', right: -50, bottom: -70, width: 200, height: 200, borderRadius: 100, backgroundColor: colores.marinoClaro },
  saldoEtiqueta: { fontSize: 13, color: colores.sobreMarino },
  saldoNum: { fontFamily: fuentes.tituloFuerte, fontSize: 46, lineHeight: 50, color: colores.blanco },
  saldoPts: { fontFamily: fuentes.tituloFuerte, fontSize: 18, color: colores.verde },
  saldoTexto: { fontSize: 14, color: colores.celesteClaro },
  entrar: { marginTop: 10, alignSelf: 'flex-start', backgroundColor: colores.celeste, height: 44, paddingHorizontal: 18, borderRadius: 14, justifyContent: 'center' },
  entrarTexto: { color: colores.marino, fontWeight: '800', fontSize: 14 },

  seccion: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  h2: { fontFamily: fuentes.titulo, fontSize: 17, color: colores.marino },
  nota: { fontSize: 13, color: colores.textoSuave },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  premio: { width: '48.5%', backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 20, padding: 10, gap: 8 },
  premioFoto: { height: 76, borderRadius: 14, overflow: 'hidden' },
  premioImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  premioNombre: { fontWeight: '800', fontSize: 14, lineHeight: 17, color: colores.marino },
  premioPie: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  premioPts: { fontFamily: fuentes.titulo, fontSize: 14, color: colores.marino, flexShrink: 1 },
  canjear: { height: 36, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colores.verde, justifyContent: 'center' },
  canjearTexto: { color: colores.marino, fontWeight: '800', fontSize: 13 },

  movs: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 2 },
  mov: { flexDirection: 'row', alignItems: 'center', minHeight: 50, gap: 10 },
  movBorde: { borderBottomWidth: 1, borderBottomColor: '#EEF6F8' },
  movTitulo: { fontWeight: '700', fontSize: 14, color: colores.marino },
  movFecha: { fontSize: 12, color: colores.textoSuave },
  movPts: { fontFamily: fuentes.titulo, fontSize: 15 },
  vacio: { fontSize: 14, color: colores.textoSuave, paddingVertical: 12 },
});
