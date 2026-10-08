// Mi hidratación (diseño "Agua VIDA"): anillo grande del día sobre fondo
// marino, sumar o quitar vasos, racha, bono, la semana y pedir agua VIDA.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Circle } from 'react-native-svg';
import { Text } from '../components/Texto';
import { BotonAtras } from '../components/Cabecera';
import Anillo from '../components/Anillo';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import { agregarConTienda } from '../services/carrito';
import { fmtUSD } from '../services/moneda';
import { colores, fuentes } from '../constants/tema';

const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function IconoAjustes() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colores.blanco} strokeWidth={2.2} strokeLinecap="round">
      <Path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><Circle cx={16} cy={7} r={2} /><Circle cx={10} cy={17} r={2} />
    </Svg>
  );
}

export default function MiHidratacion() {
  const router = useRouter();
  const { idBranch, idCuenta } = useAuthStore();
  const [data, setData] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [ajustes, setAjustes] = useState(false);
  const [agua, setAgua] = useState(null);

  const cargar = useCallback(async () => {
    try { setData((await api.get('/delivery/cliente/hidratacion')).data); } catch { setData({ activa: false, meta: 8, mlVaso: 250, vasosHoy: 0, historial: [] }); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    api.get('/delivery/productos', { params: { idBranch, idCuenta } })
      .then((r) => setAgua((r.data?.productos ?? r.data ?? []).find((p) => /agua/i.test(p.Nombre || '')) || null)).catch(() => {});
  }, [idBranch, idCuenta]);

  const guardar = async (cambios) => {
    const nuevo = { activa: data.activa, meta: data.meta, mlVaso: data.mlVaso, ...cambios };
    setData((d) => ({ ...d, ...cambios }));
    try { await api.put('/delivery/cliente/hidratacion', nuevo); await cargar(); } catch {}
  };
  const tomar = async () => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const r = await api.post('/delivery/cliente/hidratacion/vaso');
      setData((d) => ({ ...d, vasosHoy: r.data.vasosHoy, mlHoy: r.data.mlHoy, racha: r.data.racha }));
      if (r.data.bonus > 0) Alert.alert('¡Racha completada!', `Llevas ${r.data.racha} días cumpliendo tu meta. Ganaste ${r.data.bonus} puntos VIDA.`);
      cargar();
    } catch {} finally { setOcupado(false); }
  };
  const quitar = async () => {
    if (ocupado || !data?.vasosHoy) return;
    setOcupado(true);
    try { const r = await api.post('/delivery/cliente/hidratacion/quitar'); setData((d) => ({ ...d, vasosHoy: r.data.vasosHoy, mlHoy: r.data.mlHoy })); cargar(); }
    catch {} finally { setOcupado(false); }
  };

  const meta = Math.max(1, Number(data?.meta) || 8);
  const vasos = Number(data?.vasosHoy) || 0;
  const ml = Number(data?.mlHoy ?? vasos * (data?.mlVaso || 250));

  // Semana de lunes a domingo con lo registrado
  const semana = useMemo(() => {
    const hist = new Map((data?.historial || []).map((h) => [h.fecha, h.vasos]));
    const hoy = data?.hoy ? new Date(data.hoy + 'T12:00:00Z') : new Date();
    const desdeLunes = (hoy.getUTCDay() + 6) % 7;
    return DIAS.map((dia, i) => {
      const f = new Date(hoy.getTime() + (i - desdeLunes) * 86400000).toISOString().slice(0, 10);
      const v = hist.get(f) || 0;
      const esHoy = i === desdeLunes, futuro = i > desdeLunes;
      return { dia, alto: futuro || v === 0 ? 6 : Math.max(10, Math.min(100, Math.round((v / meta) * 100))),
        color: futuro || v === 0 ? colores.borde : esHoy ? colores.celeste : colores.marino, clave: f };
    });
  }, [data?.historial, data?.hoy, meta]);

  if (!data) return (<View style={[styles.root, styles.centro]}><ActivityIndicator color={colores.celeste} /></View>);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View style={styles.cabecera}>
          <BotonAtras oscuro />
          <Text style={styles.titulo}>Mi hidratación</Text>
          <TouchableOpacity style={styles.ajustarBtn} onPress={() => setAjustes(true)} accessibilityLabel="Ajustar meta"><IconoAjustes /></TouchableOpacity>
        </View>

        <View style={styles.centroAnillo}>
          <Anillo tam={220} grosor={20} avance={data.activa ? vasos / meta : 0} color={colores.celeste} pista={colores.marinoSuave}>
            <View style={styles.anilloDentro}>
              <Text style={styles.num}>{vasos}<Text style={styles.numMeta}>/{meta}</Text></Text>
              <Text style={styles.ml}>vasos · {ml.toLocaleString('es-VE')} ml</Text>
            </View>
          </Anillo>
          {data.activa ? (
            <View style={styles.botones}>
              <TouchableOpacity style={styles.menos} onPress={quitar} disabled={ocupado || !vasos} accessibilityLabel="Quitar un vaso"><Text style={styles.menosTexto}>−</Text></TouchableOpacity>
              <TouchableOpacity style={styles.tome} onPress={tomar} disabled={ocupado}><Text style={styles.tomeTexto}>Tomé un vaso</Text></TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.tome} onPress={() => guardar({ activa: true })}><Text style={styles.tomeTexto}>Activar mi programa</Text></TouchableOpacity>
          )}
        </View>

        <View style={styles.hoja}>
          <View style={styles.dosCol}>
            <View style={styles.dato}><Text style={styles.datoEtiqueta}>Racha</Text><Text style={styles.datoValor}>{Number(data.racha) || 0} día{Number(data.racha) === 1 ? '' : 's'}</Text></View>
            <View style={styles.dato}><Text style={styles.datoEtiqueta}>Bono cada 7 días</Text><Text style={styles.datoValor}>{data.bonoRacha ?? 50} pts</Text></View>
          </View>
          <View style={styles.semana}>
            <Text style={styles.semanaTitulo}>Esta semana</Text>
            <View style={styles.barras}>
              {semana.map((d) => (
                <View key={d.clave} style={styles.barraCol}>
                  <View style={[styles.barra, { height: `${d.alto}%`, backgroundColor: d.color }]} />
                  <Text style={styles.barraDia}>{d.dia}</Text>
                </View>
              ))}
            </View>
          </View>
          <TouchableOpacity style={styles.pedir} activeOpacity={0.9}
            onPress={() => (agua ? agregarConTienda(agua, 1, () => router.push('/(tabs)/carrito')) : router.push('/(tabs)'))}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pedirTitulo}>¿Se te acaba el agua?</Text>
              <Text style={styles.pedirSub}>Pide {agua?.Nombre?.toLowerCase().includes('vida') ? agua.Nombre : 'agua purificada VIDA'}{agua ? ` · ${fmtUSD(agua.PrecioUSD)}` : ''}</Text>
            </View>
            <View style={styles.pedirBtn}><Text style={styles.pedirBtnTexto}>Pedir</Text></View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={ajustes} transparent animationType="slide" onRequestClose={() => setAjustes(false)}>
        <View style={styles.modalFondo}>
          <View style={styles.modal}>
            <Text style={styles.modalTitulo}>Tu meta diaria</Text>
            <View style={styles.metaFila}>
              <TouchableOpacity style={styles.metaPaso} onPress={() => guardar({ meta: Math.max(1, meta - 1) })} accessibilityLabel="Bajar meta"><Text style={styles.metaPasoTexto}>−</Text></TouchableOpacity>
              <Text style={styles.metaValor}>{meta} vasos</Text>
              <TouchableOpacity style={[styles.metaPaso, { backgroundColor: colores.marino }]} onPress={() => guardar({ meta: Math.min(20, meta + 1) })} accessibilityLabel="Subir meta"><Text style={[styles.metaPasoTexto, { color: colores.blanco }]}>+</Text></TouchableOpacity>
            </View>
            <Text style={styles.nota}>Cada vaso son {data.mlVaso || 250} ml. Cumple la meta 7 días seguidos y ganas {data.bonoRacha ?? 50} puntos.</Text>
            {data.activa && (
              <TouchableOpacity onPress={() => { guardar({ activa: false }); setAjustes(false); }} style={styles.desactivar}>
                <Text style={styles.desactivarTexto}>Pausar mi programa</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.listo} onPress={() => setAjustes(false)}><Text style={styles.listoTexto}>Listo</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colores.marino },
  centro: { alignItems: 'center', justifyContent: 'center' },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 16, paddingHorizontal: 20 },
  titulo: { flex: 1, fontFamily: fuentes.tituloFuerte, fontSize: 22, color: colores.blanco },
  ajustarBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  centroAnillo: { alignItems: 'center', gap: 12, paddingTop: 22, paddingHorizontal: 20 },
  anilloDentro: { width: 180, height: 180, borderRadius: 90, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center', gap: 2 },
  num: { fontFamily: fuentes.tituloFuerte, fontSize: 54, lineHeight: 58, color: colores.blanco },
  numMeta: { fontSize: 26, color: colores.sobreMarino },
  ml: { fontSize: 14, color: colores.sobreMarino },
  botones: { flexDirection: 'row', gap: 10 },
  menos: { width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  menosTexto: { color: colores.blanco, fontWeight: '800', fontSize: 24 },
  tome: { height: 56, paddingHorizontal: 28, borderRadius: 18, backgroundColor: colores.celeste, justifyContent: 'center' },
  tomeTexto: { color: colores.marino, fontWeight: '800', fontSize: 17 },

  hoja: { flex: 1, marginTop: 22, backgroundColor: colores.fondo, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 30, gap: 16 },
  dosCol: { flexDirection: 'row', gap: 10 },
  dato: { flex: 1, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 14 },
  datoEtiqueta: { fontSize: 12, color: colores.textoSuave, fontWeight: '700' },
  datoValor: { fontFamily: fuentes.tituloFuerte, fontSize: 22, color: colores.marino },
  semana: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde, borderRadius: 22, padding: 14, gap: 10 },
  semanaTitulo: { fontWeight: '800', fontSize: 15, color: colores.marino },
  barras: { height: 110, flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  barraCol: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', gap: 6 },
  barra: { width: '100%', borderRadius: 8 },
  barraDia: { fontSize: 12, fontWeight: '700', color: colores.textoSuave },
  pedir: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colores.celesteClaro, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 14 },
  pedirTitulo: { fontWeight: '800', fontSize: 15, color: colores.marino },
  pedirSub: { fontSize: 13, color: '#2C3D58' },
  pedirBtn: { height: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colores.marino, justifyContent: 'center' },
  pedirBtnTexto: { color: colores.blanco, fontWeight: '800', fontSize: 14 },

  modalFondo: { flex: 1, backgroundColor: 'rgba(0,16,52,0.45)', justifyContent: 'flex-end' },
  modal: { backgroundColor: colores.blanco, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 30, gap: 14 },
  modalTitulo: { fontFamily: fuentes.tituloFuerte, fontSize: 20, color: colores.marino },
  metaFila: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: colores.fondo, borderRadius: 18, padding: 4 },
  metaPaso: { width: 44, height: 44, borderRadius: 14, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center' },
  metaPasoTexto: { fontWeight: '800', fontSize: 20, color: colores.marino },
  metaValor: { minWidth: 90, textAlign: 'center', fontFamily: fuentes.titulo, fontSize: 18, color: colores.marino },
  nota: { fontSize: 13, color: colores.textoSuave, lineHeight: 18 },
  desactivar: { minHeight: 40, justifyContent: 'center' },
  desactivarTexto: { fontWeight: '800', fontSize: 14, color: '#8A2B2B' },
  listo: { height: 54, borderRadius: 18, backgroundColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  listoTexto: { color: colores.blanco, fontWeight: '800', fontSize: 16 },
});
