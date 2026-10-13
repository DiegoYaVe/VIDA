// Puntos y premios (diseño "Agua VIDA"): saldo y nivel del Club, premios
// para canjear (algunos exclusivos por nivel), eventos del Club con
// confirmación de asistencia y movimientos. Es la pestaña "Puntos" y también
// /mis-puntos y /premios.
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
const DIAS_SEM = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
function fechaEvento(f) {
  const d = new Date(f);
  const h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0');
  return `${DIAS_SEM[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} · ${h % 12 || 12}:${m} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

export default function PantallaPuntos({ conAtras = false }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [saldo, setSaldo] = useState(0);
  const [premios, setPremios] = useState([]);
  const [movs, setMovs] = useState([]);
  const [club, setClub] = useState(null); // { nivel, nombreNivel }
  const [eventos, setEventos] = useState([]);
  const [procEv, setProcEv] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [proc, setProc] = useState(null);

  const cargar = useCallback(async () => {
    if (!token) { setCargando(false); return; }
    try {
      const [p, m, e] = await Promise.all([
        api.get('/delivery/cliente/premios'),
        api.get('/delivery/cliente/puntos'),
        api.get('/delivery/cliente/club/eventos').catch(() => ({ data: null })),
      ]);
      setSaldo(p.data?.saldo ?? m.data?.saldo ?? 0);
      setPremios(p.data?.premios ?? []);
      setMovs(m.data?.movimientos ?? []);
      setClub(p.data?.nombreNivel ? { nivel: p.data.nivel, nombreNivel: p.data.nombreNivel } : null);
      setEventos(e.data?.eventos ?? []);
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

  const asistencia = async (ev) => {
    setProcEv(ev.idEvento);
    try {
      if (ev.Asistire) await api.delete(`/delivery/cliente/club/eventos/${ev.idEvento}/asistencia`);
      else await api.post(`/delivery/cliente/club/eventos/${ev.idEvento}/asistencia`);
      if (!ev.Asistire) Alert.alert('¡Te esperamos!', `${ev.Titulo}\n${fechaEvento(ev.FechaInicio)}${ev.Lugar ? `\n${ev.Lugar}` : ''}`);
      cargar();
    } catch (e) {
      Alert.alert('No se pudo', e.response?.data?.error || 'Intenta de nuevo.');
    } finally { setProcEv(null); }
  };
  const cancelarAsistencia = (ev) => Alert.alert('Cancelar asistencia', `¿Ya no vas a "${ev.Titulo}"? Liberas tu cupo para otro miembro.`, [
    { text: 'Sí voy', style: 'cancel' }, { text: 'No voy', style: 'destructive', onPress: () => asistencia(ev) },
  ]);

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
          {club ? <View style={styles.nivel}><Text style={styles.nivelTexto}>Club VIDA · {club.nombreNivel}</Text></View> : null}
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
                  const alcanza = saldo >= p.CostoPuntos && p.Stock !== 0 && !p.Bloqueado;
                  return (
                    <View key={p.idPremio} style={styles.premio}>
                      <View style={[styles.premioFoto, { backgroundColor: FONDOS[i % FONDOS.length] }]}>
                        {img ? <Image source={{ uri: img }} style={styles.premioImg} /> : null}
                      </View>
                      {p.Exclusivo ? <Text style={styles.exclusivo} numberOfLines={1}>Exclusivo · {p.NombreNivel}</Text> : null}
                      <Text style={styles.premioNombre} numberOfLines={2}>{p.Nombre}</Text>
                      <View style={styles.premioPie}>
                        <Text style={styles.premioPts}>{pts(p.CostoPuntos)} pts</Text>
                        <TouchableOpacity style={[styles.canjear, !alcanza && { opacity: 0.45 }]} onPress={() => canjear(p)} disabled={!alcanza || proc === p.idPremio}>
                          {proc === p.idPremio ? <ActivityIndicator color={colores.marino} size="small" /> : <Text style={styles.canjearTexto}>{p.Stock === 0 ? 'Agotado' : p.Bloqueado ? 'Bloqueado' : 'Canjear'}</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {eventos.length > 0 && (
              <>
                <View style={styles.seccion}>
                  <Text style={styles.h2}>Eventos del Club</Text>
                  <Text style={styles.nota}>Para miembros</Text>
                </View>
                {eventos.map((ev) => {
                  const quedan = ev.Cupo != null ? Math.max(0, ev.Cupo - ev.Inscritos) : null;
                  const deshabilitado = !ev.Asistire && (ev.Bloqueado || ev.Lleno || ev.Comenzo);
                  return (
                    <View key={ev.idEvento} style={styles.evento}>
                      <View style={styles.eventoFecha}><Text style={styles.eventoFechaTexto}>{fechaEvento(ev.FechaInicio)}</Text></View>
                      <Text style={styles.eventoTitulo}>{ev.Titulo}</Text>
                      {ev.Descripcion ? <Text style={styles.eventoTexto} numberOfLines={3}>{ev.Descripcion}</Text> : null}
                      {ev.Lugar ? <Text style={styles.eventoLugar} numberOfLines={2}>{ev.Lugar}</Text> : null}
                      <View style={styles.eventoPie}>
                        <Text style={styles.nota}>
                          {ev.NombreNivel ? `Nivel ${ev.NombreNivel} · ` : ''}{quedan == null ? `${ev.Inscritos} van` : ev.Lleno ? 'Sin cupos' : `Quedan ${quedan} cupo${quedan === 1 ? '' : 's'}`}
                        </Text>
                        <TouchableOpacity style={[styles.asistir, ev.Asistire && styles.asistirOn, deshabilitado && { opacity: 0.45 }]}
                          disabled={deshabilitado || procEv === ev.idEvento} onPress={() => (ev.Asistire ? cancelarAsistencia(ev) : asistencia(ev))}>
                          {procEv === ev.idEvento ? <ActivityIndicator color={colores.marino} size="small" /> : (
                            <Text style={[styles.asistirTexto, ev.Asistire && { color: colores.blanco }]}>
                              {ev.Asistire ? 'Voy ✓' : ev.Bloqueado ? `Solo ${ev.NombreNivel}` : ev.Lleno ? 'Lleno' : 'Asistiré'}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </>
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
  nivel: { alignSelf: 'flex-start', marginTop: 8, backgroundColor: colores.celeste, borderRadius: 99, paddingVertical: 5, paddingHorizontal: 12 },
  nivelTexto: { fontWeight: '800', fontSize: 12, color: colores.marino },
  entrar: { marginTop: 10, alignSelf: 'flex-start', backgroundColor: colores.celeste, height: 44, paddingHorizontal: 18, borderRadius: 14, justifyContent: 'center' },
  entrarTexto: { color: colores.marino, fontWeight: '800', fontSize: 14 },

  seccion: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  h2: { fontFamily: fuentes.titulo, fontSize: 17, color: colores.marino },
  nota: { fontSize: 13, color: colores.textoSuave },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  premio: { width: '48.5%', backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 20, padding: 10, gap: 8 },
  premioFoto: { height: 76, borderRadius: 14, overflow: 'hidden' },
  premioImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  exclusivo: { alignSelf: 'flex-start', fontSize: 11, fontWeight: '800', color: colores.marino, backgroundColor: '#F5E7B8', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  premioNombre: { fontWeight: '800', fontSize: 14, lineHeight: 17, color: colores.marino },
  premioPie: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  premioPts: { fontFamily: fuentes.titulo, fontSize: 14, color: colores.marino, flexShrink: 1 },
  canjear: { height: 36, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colores.verde, justifyContent: 'center' },
  canjearTexto: { color: colores.marino, fontWeight: '800', fontSize: 13 },

  evento: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 20, padding: 14, gap: 6 },
  eventoFecha: { alignSelf: 'flex-start', backgroundColor: colores.celesteClaro, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  eventoFechaTexto: { fontWeight: '800', fontSize: 12, color: colores.marino },
  eventoTitulo: { fontFamily: fuentes.titulo, fontSize: 16, color: colores.marino },
  eventoTexto: { fontSize: 13, lineHeight: 18, color: '#2C3D58' },
  eventoLugar: { fontSize: 13, fontWeight: '700', color: colores.textoSuave },
  eventoPie: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 },
  asistir: { minWidth: 96, height: 40, paddingHorizontal: 14, borderRadius: 13, backgroundColor: colores.verde, alignItems: 'center', justifyContent: 'center' },
  asistirOn: { backgroundColor: colores.marino },
  asistirTexto: { color: colores.marino, fontWeight: '800', fontSize: 14 },
  movs: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 2 },
  mov: { flexDirection: 'row', alignItems: 'center', minHeight: 50, gap: 10 },
  movBorde: { borderBottomWidth: 1, borderBottomColor: '#EEF6F8' },
  movTitulo: { fontWeight: '700', fontSize: 14, color: colores.marino },
  movFecha: { fontSize: 12, color: colores.textoSuave },
  movPts: { fontFamily: fuentes.titulo, fontSize: 15 },
  vacio: { fontSize: 14, color: colores.textoSuave, paddingVertical: 12 },
});
