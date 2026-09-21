// app/academia.jsx — Academia VIDA para el consumidor.
// Catálogo de cursos visibles al cliente (Audiencia CLIENTE/AMBOS), detalle con
// temario, reproductor (video embebido/subido, texto, PDF, quiz), progreso,
// comentarios y constancia con QR al completar (+ puntos VIDA).
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert, Image, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import api from '../services/api';
import { absImg } from '../constants/config';

const { width } = Dimensions.get('window');
const TIPO_ICON = { VIDEO: 'play-circle', TEXTO: 'document-text', PDF: 'document', QUIZ: 'help-circle' };

function toEmbed(url) {
  if (!url) return url;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?playsinline=1`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return url;
}

export default function AcademiaScreen() {
  const router = useRouter();
  const [cursos, setCursos] = useState([]);
  const [resumen, setResumen] = useState({ total: 0, completados: 0, puntos: 0 });
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null); // idCurso

  const cargar = useCallback(async () => {
    try {
      const r = await api.get('/delivery/cliente/academia/cursos');
      setCursos(r.data?.cursos || []);
      setResumen(r.data?.resumen || { total: 0, completados: 0, puntos: 0 });
    } catch {} finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  if (abierto != null) return <CursoDetalle idCurso={abierto} onBack={() => { setAbierto(null); cargar(); }} />;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Academia VIDA</Text>
        <View style={{ width: 22 }} />
      </View>

      {cargando ? <ActivityIndicator style={{ marginTop: 40 }} color="#0A1E3F" /> : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={styles.resumen}>
            <View style={styles.resItem}><Text style={styles.resNum}>{resumen.completados}/{resumen.total}</Text><Text style={styles.resLbl}>Cursos</Text></View>
            <View style={styles.resDiv} />
            <View style={styles.resItem}><Text style={styles.resNum}>{resumen.puntos}</Text><Text style={styles.resLbl}>Puntos ganados</Text></View>
          </View>

          {cursos.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Ionicons name="school-outline" size={48} color="#CBD5E0" />
              <Text style={{ color: '#A0AEC0', marginTop: 8 }}>Aún no hay cursos disponibles.</Text>
            </View>
          ) : cursos.map(c => (
            <TouchableOpacity key={c.idCurso} style={styles.card} onPress={() => setAbierto(c.idCurso)} activeOpacity={0.85}>
              <View style={styles.cardIcon}><Ionicons name="play" size={22} color="#fff" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{c.Titulo}</Text>
                <Text style={styles.cardSub} numberOfLines={2}>{c.Descripcion}</Text>
                <View style={styles.progWrap}>
                  <View style={styles.progBar}><View style={[styles.progFill, { width: `${c.ProgresoPct || 0}%` }]} /></View>
                  <Text style={styles.progTxt}>{c.ProgresoPct || 0}%</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaTxt}><Ionicons name="time-outline" size={12} /> {c.DuracionMin} min</Text>
                  <Text style={styles.metaTxt}><Ionicons name="star-outline" size={12} /> {c.Puntos} pts</Text>
                  {c.Completado ? <Text style={[styles.metaTxt, { color: '#16A34A' }]}><Ionicons name="checkmark-circle" size={12} /> Completado</Text> : null}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function CursoDetalle({ idCurso, onBack }) {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [proc, setProc] = useState(false);
  const [diploma, setDiploma] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const r = await api.get(`/delivery/cliente/academia/cursos/${idCurso}`);
      setData(r.data);
      const lecs = (r.data.modulos || []).flatMap(m => m.lecciones);
      setSel(prev => prev ?? (lecs.find(l => !l.Completado) || lecs[0])?.idLeccion ?? null);
      // Si ya está completo, trae la constancia
      if (r.data.progreso.total > 0 && r.data.progreso.completadas >= r.data.progreso.total) cargarDiploma();
    } catch {} finally { setCargando(false); }
  }, [idCurso]);
  useEffect(() => { cargar(); }, [cargar]);

  async function cargarDiploma() {
    try {
      const r = await api.get('/delivery/cliente/academia/diplomas');
      const d = (r.data || []).find(x => Number(x.idCurso) === Number(idCurso));
      if (d) { const c = await api.get(`/delivery/cliente/academia/constancia/${d.Folio}`); setDiploma(c.data); }
    } catch {}
  }

  const lecciones = (data?.modulos || []).flatMap(m => m.lecciones);
  const leccion = lecciones.find(l => l.idLeccion === sel);

  useEffect(() => { if (sel && leccion && !leccion.Completado) api.post(`/delivery/cliente/academia/lecciones/${sel}/iniciar`).catch(() => {}); }, [sel]); // eslint-disable-line

  async function completar() {
    if (!leccion) return;
    setProc(true);
    try {
      const r = await api.post(`/delivery/cliente/academia/lecciones/${leccion.idLeccion}/completar`, { segundos: 30 });
      if (r.data?.curso?.completado) { Alert.alert('¡Curso completado! 🎉', 'Ganaste tus puntos VIDA y tu constancia está lista.'); }
      await cargar();
      const idx = lecciones.findIndex(l => l.idLeccion === leccion.idLeccion);
      const sig = lecciones.slice(idx + 1).find(l => !l.Completado);
      if (sig) setSel(sig.idLeccion);
    } catch (e) { Alert.alert('Error', e.message || 'No se pudo completar.'); }
    finally { setProc(false); }
  }

  if (cargando) return (
    <SafeAreaView style={styles.container}><StatusBar style="light" />
      <View style={styles.header}><TouchableOpacity onPress={onBack}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity><Text style={styles.headerTitle}>Curso</Text><View style={{ width: 22 }} /></View>
      <ActivityIndicator style={{ marginTop: 40 }} color="#0A1E3F" />
    </SafeAreaView>
  );

  const total = data?.progreso?.total || 0, hechas = data?.progreso?.completadas || 0;
  const pct = total > 0 ? Math.round((hechas / total) * 100) : 0;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{data?.curso?.Titulo || 'Curso'}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles.progWrap}>
          <View style={styles.progBar}><View style={[styles.progFill, { width: `${pct}%` }]} /></View>
          <Text style={styles.progTxt}>{hechas}/{total}</Text>
        </View>

        {/* Media de la lección seleccionada */}
        {leccion ? <LeccionMedia leccion={leccion} /> : null}

        {leccion && leccion.TipoLeccion !== 'QUIZ' ? (
          <TouchableOpacity style={[styles.btnMain, leccion.Completado && styles.btnDone]} onPress={completar} disabled={proc || leccion.Completado}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.btnMainTxt}>{leccion.Completado ? 'Lección completada' : proc ? 'Guardando…' : 'Marcar como completada'}</Text>
          </TouchableOpacity>
        ) : null}

        {leccion && leccion.TipoLeccion === 'QUIZ' ? <Quiz leccion={leccion} onDone={cargar} /> : null}

        {/* Temario */}
        <Text style={styles.secTitle}>Contenido</Text>
        {(data?.modulos || []).map(m => (
          <View key={m.idModulo} style={{ marginBottom: 8 }}>
            <Text style={styles.modTitle}>{m.Titulo}</Text>
            {m.lecciones.map(l => (
              <TouchableOpacity key={l.idLeccion} style={[styles.lecRow, sel === l.idLeccion && styles.lecRowOn]} onPress={() => setSel(l.idLeccion)}>
                <Ionicons name={l.Completado ? 'checkmark-circle' : (TIPO_ICON[l.TipoLeccion] || 'play-circle')} size={18} color={l.Completado ? '#16A34A' : '#718096'} />
                <Text style={[styles.lecTxt, l.Completado && { color: '#A0AEC0' }]} numberOfLines={1}>{l.Titulo}</Text>
                <Text style={styles.lecMin}>{l.DuracionMin}m</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}

        {/* Constancia */}
        {diploma ? (
          <View style={styles.diploma}>
            <Text style={styles.diplomaTitle}>🎓 Constancia obtenida</Text>
            {diploma.qrDataUrl ? <Image source={{ uri: diploma.qrDataUrl }} style={{ width: 120, height: 120, alignSelf: 'center', marginVertical: 8 }} /> : null}
            <Text style={styles.diplomaFolio}>Folio: {diploma.Folio}</Text>
            <Text style={styles.diplomaSub}>{diploma.NombreUsuario} · {new Date(diploma.FechaEmision).toLocaleDateString('es-VE')}</Text>
          </View>
        ) : null}

        {/* Comentarios */}
        <Comentarios idCurso={idCurso} idLeccion={leccion?.idLeccion} />
      </ScrollView>
    </SafeAreaView>
  );
}

function LeccionMedia({ leccion }) {
  const { TipoLeccion, VideoUrl, ArchivoUrl, Contenido, Titulo } = leccion;
  const h = Math.round((width - 32) * 9 / 16);

  if (TipoLeccion === 'VIDEO' && VideoUrl) {
    return <View style={[styles.media, { height: h }]}><WebView source={{ uri: toEmbed(VideoUrl) }} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} style={{ flex: 1 }} /></View>;
  }
  if (TipoLeccion === 'VIDEO' && ArchivoUrl) {
    const uri = absImg(ArchivoUrl);
    const html = `<html><body style="margin:0;background:#000"><video controls playsinline style="width:100%;height:100%" src="${uri}"></video></body></html>`;
    return <View style={[styles.media, { height: h }]}><WebView source={{ html }} allowsInlineMediaPlayback style={{ flex: 1 }} /></View>;
  }
  if (TipoLeccion === 'PDF' && ArchivoUrl) {
    return (
      <TouchableOpacity style={styles.pdfBtn} onPress={() => WebBrowser.openBrowserAsync(absImg(ArchivoUrl))}>
        <Ionicons name="document" size={20} color="#0A1E3F" />
        <Text style={styles.pdfTxt}>Abrir documento PDF</Text>
      </TouchableOpacity>
    );
  }
  if (TipoLeccion === 'TEXTO') {
    return <View style={styles.texto}><Text style={styles.textoTitle}>{Titulo}</Text><Text style={styles.textoBody}>{Contenido || 'Sin contenido.'}</Text></View>;
  }
  if (TipoLeccion === 'QUIZ') return null;
  return <View style={styles.texto}><Text style={styles.textoBody}>Contenido no disponible.</Text></View>;
}

function Quiz({ leccion, onDone }) {
  const preguntas = leccion.quiz || [];
  const [resp, setResp] = useState({});
  const [res, setRes] = useState(null);
  const [proc, setProc] = useState(false);
  useEffect(() => { setResp({}); setRes(null); }, [leccion.idLeccion]);

  async function enviar() {
    setProc(true);
    try {
      const r = await api.post(`/delivery/cliente/academia/lecciones/${leccion.idLeccion}/quiz/responder`, { respuestas: resp });
      setRes(r.data);
      if (r.data?.aprobado) { Alert.alert('¡Aprobado!', `Obtuviste ${r.data.puntaje}%`); onDone?.(); }
      else Alert.alert('Sigue intentando', `Obtuviste ${r.data?.puntaje || 0}% — necesitas ${leccion.QuizAprob}%`);
    } catch (e) { Alert.alert('Error', e.message || 'No se pudo enviar.'); }
    finally { setProc(false); }
  }

  if (preguntas.length === 0) return <View style={styles.texto}><Text style={styles.textoBody}>Esta evaluación aún no tiene preguntas.</Text></View>;

  return (
    <View style={styles.quiz}>
      <Text style={styles.quizHint}>Evaluación · mínimo {leccion.QuizAprob}% para aprobar</Text>
      {preguntas.map((p, i) => (
        <View key={p.idPregunta} style={{ marginBottom: 12 }}>
          <Text style={styles.quizPreg}>{i + 1}. {p.Texto}</Text>
          {p.opciones.map(o => (
            <TouchableOpacity key={o.idOpcion} style={[styles.quizOpc, resp[p.idPregunta] === o.idOpcion && styles.quizOpcOn]} onPress={() => setResp(s => ({ ...s, [p.idPregunta]: o.idOpcion }))}>
              <Ionicons name={resp[p.idPregunta] === o.idOpcion ? 'radio-button-on' : 'radio-button-off'} size={16} color="#0A1E3F" />
              <Text style={styles.quizOpcTxt}>{o.Texto}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
      {res ? <Text style={{ color: res.aprobado ? '#16A34A' : '#DC2626', fontWeight: '700', marginBottom: 8 }}>{res.correctas}/{res.total} ({res.puntaje}%) — {res.aprobado ? 'Aprobado' : 'No aprobado'}</Text> : null}
      <TouchableOpacity style={[styles.btnMain, (proc || Object.keys(resp).length < preguntas.length) && { opacity: 0.5 }]} onPress={enviar} disabled={proc || Object.keys(resp).length < preguntas.length}>
        <Text style={styles.btnMainTxt}>{proc ? 'Enviando…' : 'Enviar respuestas'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function Comentarios({ idCurso, idLeccion }) {
  const [lista, setLista] = useState([]);
  const [texto, setTexto] = useState('');

  const cargar = useCallback(async () => {
    try {
      const q = idLeccion ? `?idLeccion=${idLeccion}` : '';
      const r = await api.get(`/delivery/cliente/academia/cursos/${idCurso}/comentarios${q}`);
      setLista(r.data || []);
    } catch {}
  }, [idCurso, idLeccion]);
  useEffect(() => { cargar(); }, [cargar]);

  async function enviar() {
    if (!texto.trim()) return;
    try { await api.post(`/delivery/cliente/academia/cursos/${idCurso}/comentarios`, { texto: texto.trim(), idLeccion: idLeccion || null }); setTexto(''); cargar(); }
    catch (e) { Alert.alert('Error', e.message || 'No se pudo comentar.'); }
  }

  return (
    <View style={{ marginTop: 16 }}>
      <Text style={styles.secTitle}>Comentarios</Text>
      <View style={styles.comInputRow}>
        <TextInput style={styles.comInput} value={texto} onChangeText={setTexto} placeholder="Escribe un comentario…" placeholderTextColor="#A0AEC0" />
        <TouchableOpacity style={styles.comSend} onPress={enviar}><Ionicons name="send" size={16} color="#fff" /></TouchableOpacity>
      </View>
      {lista.length === 0 ? <Text style={{ color: '#A0AEC0', fontSize: 12 }}>Sé el primero en comentar.</Text> :
        lista.map(cm => (
          <View key={cm.idComentario} style={styles.comItem}>
            <Text style={styles.comAutor}>{cm.Autor}</Text>
            <Text style={styles.comTxt}>{cm.Texto}</Text>
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0A1E3F', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  resumen: { flexDirection: 'row', backgroundColor: '#0A1E3F', borderRadius: 16, padding: 16, marginBottom: 16, alignItems: 'center' },
  resItem: { flex: 1, alignItems: 'center' }, resDiv: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' },
  resNum: { color: '#fff', fontSize: 22, fontWeight: '900' }, resLbl: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12, gap: 12, elevation: 1 },
  cardIcon: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#54C4E0', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#1A202C' }, cardSub: { fontSize: 12, color: '#718096', marginTop: 2 },
  progWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  progBar: { flex: 1, height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' },
  progFill: { height: '100%', backgroundColor: '#5BBE6A', borderRadius: 3 },
  progTxt: { fontSize: 11, color: '#718096', fontWeight: '700' },
  metaRow: { flexDirection: 'row', gap: 12, marginTop: 6 }, metaTxt: { fontSize: 11, color: '#A0AEC0' },
  media: { width: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: '#000', marginBottom: 12 },
  texto: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 },
  textoTitle: { fontSize: 15, fontWeight: '800', color: '#1A202C', marginBottom: 6 }, textoBody: { fontSize: 14, color: '#4A5568', lineHeight: 21 },
  pdfBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EDF2F7', borderRadius: 12, padding: 16, marginBottom: 12, justifyContent: 'center' },
  pdfTxt: { color: '#0A1E3F', fontWeight: '700' },
  btnMain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#5BBE6A', borderRadius: 12, paddingVertical: 13, marginBottom: 8 },
  btnDone: { backgroundColor: '#A0AEC0' }, btnMainTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  secTitle: { fontSize: 14, fontWeight: '800', color: '#2D3748', marginTop: 8, marginBottom: 8 },
  modTitle: { fontSize: 12, fontWeight: '700', color: '#A0AEC0', textTransform: 'uppercase', marginBottom: 4 },
  lecRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 6 },
  lecRowOn: { borderWidth: 1.5, borderColor: '#0A1E3F' },
  lecTxt: { flex: 1, fontSize: 13, color: '#2D3748' }, lecMin: { fontSize: 11, color: '#CBD5E0' },
  diploma: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 16, borderWidth: 2, borderColor: '#5BBE6A', alignItems: 'center' },
  diplomaTitle: { fontSize: 15, fontWeight: '800', color: '#0A1E3F' },
  diplomaFolio: { fontSize: 12, color: '#4A5568', fontWeight: '700' }, diplomaSub: { fontSize: 11, color: '#A0AEC0', marginTop: 2 },
  quiz: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 },
  quizHint: { fontSize: 12, color: '#718096', marginBottom: 10 },
  quizPreg: { fontSize: 14, fontWeight: '700', color: '#2D3748', marginBottom: 6 },
  quizOpc: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 10, marginBottom: 6 },
  quizOpcOn: { borderColor: '#0A1E3F', backgroundColor: '#EBF4FF' }, quizOpcTxt: { fontSize: 13, color: '#2D3748', flex: 1 },
  comInputRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  comInput: { flex: 1, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 12, paddingVertical: 8, fontSize: 13 },
  comSend: { backgroundColor: '#0A1E3F', borderRadius: 10, width: 42, alignItems: 'center', justifyContent: 'center' },
  comItem: { backgroundColor: '#fff', borderRadius: 10, padding: 10, marginBottom: 6 },
  comAutor: { fontSize: 12, fontWeight: '700', color: '#2D3748' }, comTxt: { fontSize: 13, color: '#4A5568', marginTop: 2 },
});
