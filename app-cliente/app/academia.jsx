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
  const [tocable, setTocable] = useState(false); // gating: video debe terminar

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

  useEffect(() => {
    if (!leccion) return;
    setTocable(leccion.Completado || leccion.TipoLeccion !== 'VIDEO');
    if (sel && !leccion.Completado) api.post(`/delivery/cliente/academia/lecciones/${sel}/iniciar`).catch(() => {});
  }, [sel]); // eslint-disable-line

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
        {leccion ? <LeccionMedia leccion={leccion} onEnded={() => setTocable(true)} /> : null}

        {leccion && leccion.TipoLeccion !== 'QUIZ' ? (
          <>
            <TouchableOpacity style={[styles.btnMain, (leccion.Completado || !tocable) && styles.btnDone]} onPress={completar} disabled={proc || leccion.Completado || !tocable}>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.btnMainTxt}>{leccion.Completado ? 'Lección completada' : proc ? 'Guardando…' : 'Marcar como completada'}</Text>
            </TouchableOpacity>
            {!leccion.Completado && !tocable && leccion.TipoLeccion === 'VIDEO' ? (
              <Text style={{ fontSize: 11, color: '#A0AEC0', textAlign: 'center', marginBottom: 8 }}>Termina el video para poder completar.</Text>
            ) : null}
          </>
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

function LeccionMedia({ leccion, onEnded }) {
  const { TipoLeccion, VideoUrl, ArchivoUrl, Contenido, Titulo } = leccion;
  const h = Math.round((width - 32) * 9 / 16);
  // El WebView del video avisa a RN cuando el video TERMINA (gating de completar).
  const onMsg = (e) => { if (e?.nativeEvent?.data === 'ended') onEnded?.(); };

  if (TipoLeccion === 'VIDEO' && (VideoUrl || ArchivoUrl)) {
    const html = VideoUrl ? htmlVideoEmbebido(VideoUrl) : htmlVideoArchivo(absImg(ArchivoUrl));
    return (
      <View style={[styles.media, { height: h }]}>
        <WebView source={{ html }} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled domStorageEnabled onMessage={onMsg} style={{ flex: 1 }} />
      </View>
    );
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
    // Contenido es HTML enriquecido (del editor). Se muestra en un WebView con
    // JS deshabilitado en el documento (sin <script>), estilizado y legible.
    return (
      <View style={[styles.texto, { padding: 0, overflow: 'hidden' }]}>
        <WebView originWhitelist={["*"]} javaScriptEnabled={false} scrollEnabled={false}
          source={{ html: htmlTexto(Titulo, Contenido) }} style={{ height: alturaTexto(Contenido) }} />
      </View>
    );
  }
  if (TipoLeccion === 'QUIZ') return null;
  return <View style={styles.texto}><Text style={styles.textoBody}>Contenido no disponible.</Text></View>;
}

// Quita <script> de forma básica (defensa; el contenido es de admins del tenant).
function limpiarHtml(s) { return String(s || '').replace(/<script[\s\S]*?<\/script>/gi, ''); }
function alturaTexto(html) { const n = String(html || '').length; return Math.max(120, Math.min(900, 160 + n * 0.35)); }
function htmlTexto(titulo, contenido) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body{font-family:-apple-system,Roboto,sans-serif;color:#2D3748;margin:0;padding:14px;font-size:15px;line-height:1.6}
  h1,h2,h3{color:#0A1E3F}a{color:#0A1E3F}img{max-width:100%}blockquote{border-left:3px solid #54C4E0;margin:0;padding-left:12px;color:#4A5568}
  pre,code{background:#f1f5f9;border-radius:6px;padding:2px 4px}</style></head>
  <body>${limpiarHtml(contenido) || '<p style="color:#A0AEC0">Sin contenido.</p>'}</body></html>`;
}
function htmlVideoArchivo(uri) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;background:#000">
  <video id="v" controls playsinline style="width:100%;height:100%" src="${uri}"></video>
  <script>document.getElementById('v').addEventListener('ended',function(){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage('ended')});</script>
  </body></html>`;
}
function htmlVideoEmbebido(url) {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/);
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (yt) {
    // API de iframe de YouTube: postMessage 'ended' cuando el estado es 0 (ENDED).
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="margin:0;background:#000"><div id="p" style="width:100%;height:100%"></div>
    <script src="https://www.youtube.com/iframe_api"></script>
    <script>function onYouTubeIframeAPIReady(){new YT.Player('p',{videoId:'${yt[1]}',playerVars:{playsinline:1},
    events:{onStateChange:function(e){if(e.data===0)window.ReactNativeWebView&&window.ReactNativeWebView.postMessage('ended')}}})}</script>
    </body></html>`;
  }
  const src = vm ? `https://player.vimeo.com/video/${vm[1]}` : url;
  // Fallback: sin API fiable de fin, se habilita tras un tiempo mínimo visto.
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;background:#000"><iframe src="${src}" style="width:100%;height:100%;border:0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
  <script>setTimeout(function(){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage('ended')},60000);</script>
  </body></html>`;
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

  function setUnica(idP, idO) { setResp(s => ({ ...s, [idP]: idO })); }
  function toggleMulti(idP, idO) { setResp(s => { const a = Array.isArray(s[idP]) ? s[idP] : []; return { ...s, [idP]: a.includes(idO) ? a.filter(x => x !== idO) : [...a, idO] }; }); }
  function setTexto(idP, v) { setResp(s => ({ ...s, [idP]: v })); }

  const contestadas = preguntas.filter(p => {
    const a = resp[p.idPregunta];
    if (p.TipoPregunta === 'RESPUESTA_CORTA') return typeof a === 'string' && a.trim().length > 0;
    if (p.TipoPregunta === 'OPCION_MULTIPLE') return Array.isArray(a) && a.length > 0;
    return a != null;
  }).length;

  return (
    <View style={styles.quiz}>
      <Text style={styles.quizHint}>Evaluación · mínimo {leccion.QuizAprob}% para aprobar</Text>
      {preguntas.map((p, i) => {
        const tipo = p.TipoPregunta || 'OPCION_UNICA';
        return (
          <View key={p.idPregunta} style={{ marginBottom: 14 }}>
            <Text style={styles.quizPreg}>{i + 1}. {p.Texto}{tipo === 'OPCION_MULTIPLE' ? '  (varias correctas)' : ''}</Text>
            {tipo === 'RESPUESTA_CORTA' ? (
              <TextInput value={resp[p.idPregunta] || ''} onChangeText={v => setTexto(p.idPregunta, v)}
                placeholder="Tu respuesta…" placeholderTextColor="#A0AEC0"
                style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, marginTop: 4 }} />
            ) : tipo === 'OPCION_MULTIPLE' ? (
              p.opciones.map(o => {
                const on = Array.isArray(resp[p.idPregunta]) && resp[p.idPregunta].includes(o.idOpcion);
                return (
                  <TouchableOpacity key={o.idOpcion} style={[styles.quizOpc, on && styles.quizOpcOn]} onPress={() => toggleMulti(p.idPregunta, o.idOpcion)}>
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={16} color="#0A1E3F" />
                    <Text style={styles.quizOpcTxt}>{o.Texto}</Text>
                  </TouchableOpacity>
                );
              })
            ) : (
              p.opciones.map(o => {
                const on = resp[p.idPregunta] === o.idOpcion;
                return (
                  <TouchableOpacity key={o.idOpcion} style={[styles.quizOpc, on && styles.quizOpcOn]} onPress={() => setUnica(p.idPregunta, o.idOpcion)}>
                    <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={16} color="#0A1E3F" />
                    <Text style={styles.quizOpcTxt}>{o.Texto}</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        );
      })}
      {res ? <Text style={{ color: res.aprobado ? '#16A34A' : '#DC2626', fontWeight: '700', marginBottom: 8 }}>{res.correctas}/{res.total} ({res.puntaje}%) — {res.aprobado ? 'Aprobado' : 'No aprobado'}</Text> : null}
      <TouchableOpacity style={[styles.btnMain, (proc || contestadas < preguntas.length) && { opacity: 0.5 }]} onPress={enviar} disabled={proc || contestadas < preguntas.length}>
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
