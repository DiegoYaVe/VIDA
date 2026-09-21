// src/pages/AcademiaCurso.jsx
// Vista de curso a PANTALLA COMPLETA (estilo Udemy/Platzi): temario lateral,
// área principal grande con el contenido de la lección, header con progreso.
// Incluye gating de video (no se completa hasta terminar el video), render de
// TEXTO enriquecido (HTML sanitizado con DOMPurify) y quiz con varios tipos.
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import {
  ChevronLeft, CheckCircle2, Circle, Clock, PlayCircle, FileText, HelpCircle,
  Video, Lock, Award, ChevronDown, ChevronRight, Menu, X, Send, Trash2, Star, AlertTriangle,
} from 'lucide-react';
import api, { API_ORIGIN } from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';
import { useToast } from '../components/Toast.jsx';

const CORP = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO'];
const ICON_LEC = { VIDEO: Video, TEXTO: FileText, PDF: FileText, QUIZ: HelpCircle };

function fmtDur(min) { if (!min) return ''; return min >= 60 ? `${Math.floor(min/60)}h ${min%60}m` : `${min}m`; }

export default function AcademiaCurso() {
  const { idCurso } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [proc, setProc] = useState(false);
  const [tocable, setTocable] = useState(false); // gating: se puede completar
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [diploma, setDiploma] = useState(null);
  const inicioRef = useRef(Date.now());

  const cargar = useCallback(async () => {
    try {
      const r = await api.get(`/academia/cursos/${idCurso}`);
      setData(r.data);
      const lecs = (r.data.modulos || []).flatMap(m => m.lecciones);
      setSel(prev => prev ?? (lecs.find(l => !l.Completado) || lecs[0])?.idLeccion ?? null);
      if (r.data.progreso.total > 0 && r.data.progreso.completadas >= r.data.progreso.total) cargarDiploma();
    } catch (e) {
      if (e.response?.status === 403) toast.error('No tienes acceso a este curso');
      navigate('/academia');
    } finally { setCargando(false); }
  }, [idCurso]); // eslint-disable-line
  useEffect(() => { cargar(); }, [cargar]);

  async function cargarDiploma() {
    try {
      const r = await api.get('/academia/diplomas');
      const d = (r.data || []).find(x => Number(x.idCurso) === Number(idCurso));
      if (d) setDiploma(d);
    } catch {}
  }

  const lecciones = (data?.modulos || []).flatMap(m => m.lecciones);
  const leccion = lecciones.find(l => l.idLeccion === sel);
  const idx = lecciones.findIndex(l => l.idLeccion === sel);

  // Al cambiar de lección: reinicia gating y marca inicio
  useEffect(() => {
    if (!leccion) return;
    inicioRef.current = Date.now();
    // Solo VIDEO exige gating; TEXTO/PDF/QUIZ quedan habilitados de una.
    setTocable(leccion.Completado || leccion.TipoLeccion !== 'VIDEO');
    if (!leccion.Completado) api.post(`/academia/lecciones/${sel}/iniciar`).catch(() => {});
  }, [sel]); // eslint-disable-line

  async function completar(auto = false) {
    if (!leccion || (proc)) return;
    setProc(true);
    try {
      const segundos = Math.round((Date.now() - inicioRef.current) / 1000);
      const r = await api.post(`/academia/lecciones/${leccion.idLeccion}/completar`, { segundos });
      if (r.data?.curso?.completado) { toast.success('¡Curso completado!', 'Tu constancia ya está disponible'); }
      await cargar();
      if (!auto) {
        const sig = lecciones.slice(idx + 1).find(l => !l.Completado);
        if (sig) setSel(sig.idLeccion);
      }
    } catch { toast.error('No se pudo marcar la lección'); }
    finally { setProc(false); }
  }

  if (cargando) return <div className="flex-1 flex items-center justify-center text-gray-400">Cargando curso…</div>;
  if (!data) return null;

  const total = data.progreso.total, hechas = data.progreso.completadas;
  const pct = total > 0 ? Math.round((hechas / total) * 100) : 0;
  const curso = data.curso;

  const temario = (
    <nav className="h-full overflow-y-auto">
      <div className="p-4 border-b border-gray-100">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Contenido del curso</p>
        <p className="text-xs text-gray-500 mt-1">{hechas} de {total} lecciones · {pct}%</p>
      </div>
      {(data.modulos || []).map((m, mi) => (
        <div key={m.idModulo} className="border-b border-gray-50">
          <div className="px-4 pt-3 pb-1.5">
            <p className="text-[13px] font-bold text-gray-700">{mi + 1}. {m.Titulo}</p>
            {m.Descripcion ? <p className="text-[11px] text-gray-400">{m.Descripcion}</p> : null}
          </div>
          {m.lecciones.map(l => {
            const Icon = ICON_LEC[l.TipoLeccion] || Video;
            const activo = sel === l.idLeccion;
            return (
              <button key={l.idLeccion} onClick={() => { setSel(l.idLeccion); setMenuAbierto(false); }}
                className={`w-full text-left px-4 py-2.5 flex items-start gap-2.5 border-l-[3px] transition
                  ${activo ? 'bg-vida-blue/[0.06] border-vida-blue' : 'border-transparent hover:bg-gray-50'}`}>
                {l.Completado
                  ? <CheckCircle2 size={17} className="text-vida-green shrink-0 mt-0.5" />
                  : <Icon size={17} className={`shrink-0 mt-0.5 ${activo ? 'text-vida-blue' : 'text-gray-400'}`} />}
                <span className="flex-1 min-w-0">
                  <span className={`block text-[13px] leading-snug ${l.Completado ? 'text-gray-400' : activo ? 'text-vida-blue font-semibold' : 'text-gray-700'}`}>{l.Titulo}</span>
                  <span className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                    <span className="capitalize">{l.TipoLeccion.toLowerCase()}</span>
                    {l.DuracionMin ? <span className="flex items-center gap-0.5"><Clock size={9} /> {fmtDur(l.DuracionMin)}</span> : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
      {diploma ? (
        <a href={`/constancia/${encodeURIComponent(diploma.Folio)}`} target="_blank" rel="noopener noreferrer"
          className="m-4 flex items-center gap-2 bg-vida-green/10 text-vida-green rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-vida-green/20">
          <Award size={16} /> Ver mi constancia
        </a>
      ) : null}
    </nav>
  );

  return (
    <div className="flex-1 flex flex-col bg-gray-50 min-h-0">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/academia')} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft size={20} /></button>
        <button onClick={() => setMenuAbierto(true)} className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><Menu size={20} /></button>
        <div className="min-w-0 flex-1">
          <p className="font-black text-gray-900 truncate leading-tight">{curso.Titulo}</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-40 max-w-[35vw] h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? '#5BBE6A' : '#54C4E0' }} />
            </div>
            <span className="text-[11px] text-gray-400 font-semibold">{pct}%</span>
          </div>
        </div>
        {curso.Obligatorio ? (
          <span className={`hidden sm:flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg ${curso.FueraDeTiempo ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
            {curso.FueraDeTiempo ? <AlertTriangle size={12} /> : <Lock size={12} />} {curso.FueraDeTiempo ? 'Fuera de tiempo' : 'Obligatorio'}
          </span>
        ) : null}
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Temario desktop */}
        <aside className="hidden lg:block w-80 bg-white border-r border-gray-100 shrink-0">{temario}</aside>

        {/* Temario móvil (drawer) */}
        {menuAbierto ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMenuAbierto(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-xl">
              <div className="flex justify-end p-2"><button onClick={() => setMenuAbierto(false)} className="p-1.5 text-gray-500"><X size={20} /></button></div>
              {temario}
            </div>
          </div>
        ) : null}

        {/* Contenido */}
        <main className="flex-1 overflow-y-auto">
          {leccion ? (
            <div className="max-w-3xl mx-auto p-4 sm:p-6">
              <div className="mb-4">
                <p className="text-[11px] font-bold text-vida-blue uppercase tracking-wide">Lección {idx + 1} de {lecciones.length}</p>
                <h1 className="text-xl sm:text-2xl font-black text-gray-900 mt-0.5">{leccion.Titulo}</h1>
                {leccion.Descripcion ? <p className="text-sm text-gray-500 mt-1">{leccion.Descripcion}</p> : null}
              </div>

              <ContenidoLeccion leccion={leccion} onVideoFin={() => setTocable(true)} onQuizAprobado={cargar} />

              {leccion.TipoLeccion !== 'QUIZ' ? (
                <div className="mt-5 flex items-center gap-3 flex-wrap">
                  <button onClick={() => completar()} disabled={proc || leccion.Completado || !tocable}
                    className={`rounded-xl px-5 py-2.5 text-sm font-bold flex items-center gap-2 transition disabled:opacity-50
                      ${leccion.Completado ? 'bg-gray-100 text-gray-400' : 'bg-vida-green text-white hover:opacity-90'}`}>
                    <CheckCircle2 size={17} /> {leccion.Completado ? 'Completada' : proc ? 'Guardando…' : 'Marcar como completada'}
                  </button>
                  {!leccion.Completado && !tocable && leccion.TipoLeccion === 'VIDEO'
                    ? <span className="text-xs text-gray-400 flex items-center gap-1"><Lock size={12} /> Termina el video para completar</span> : null}
                  {idx < lecciones.length - 1
                    ? <button onClick={() => setSel(lecciones[idx + 1].idLeccion)} className="ml-auto text-sm text-vida-blue font-semibold flex items-center gap-1">Siguiente <ChevronRight size={16} /></button> : null}
                </div>
              ) : null}

              <Comentarios idCurso={idCurso} idLeccion={leccion.idLeccion} />
            </div>
          ) : <p className="p-6 text-gray-400">Este curso aún no tiene lecciones.</p>}
        </main>
      </div>
    </div>
  );
}

// ── Contenido según tipo ─────────────────────────────────────────────────────
function ContenidoLeccion({ leccion, onVideoFin, onQuizAprobado }) {
  const { TipoLeccion, VideoUrl, ArchivoUrl, Contenido } = leccion;

  if (TipoLeccion === 'VIDEO') {
    if (VideoUrl) return <VideoEmbebido url={VideoUrl} yaVisto={leccion.Completado} onFin={onVideoFin} duracionMin={leccion.DuracionMin} />;
    if (ArchivoUrl) return <VideoArchivo url={`${API_ORIGIN}${ArchivoUrl}`} yaVisto={leccion.Completado} onFin={onVideoFin} />;
    return <Vacio texto="Este video aún no tiene contenido." />;
  }
  if (TipoLeccion === 'PDF' && ArchivoUrl) {
    return (
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
        <iframe src={`${API_ORIGIN}${ArchivoUrl}`} title={leccion.Titulo} className="w-full h-[72vh]" />
        <a href={`${API_ORIGIN}${ArchivoUrl}`} target="_blank" rel="noopener noreferrer" className="block text-center text-xs text-vida-blue font-semibold py-2 border-t border-gray-100 hover:bg-gray-50">Abrir el PDF en otra pestaña</a>
      </div>
    );
  }
  if (TipoLeccion === 'TEXTO') return <TextoRico html={Contenido} />;
  if (TipoLeccion === 'QUIZ') return <Quiz leccion={leccion} onAprobado={onQuizAprobado} />;
  return <Vacio texto="Contenido no disponible." />;
}

function Vacio({ texto }) { return <div className="bg-white rounded-xl border border-gray-100 p-6 text-sm text-gray-400">{texto}</div>; }

// TEXTO: renderiza HTML enriquecido SANITIZADO (evita XSS de contenido guardado)
function TextoRico({ html }) {
  const limpio = DOMPurify.sanitize(html || '<p class="text-gray-400">Sin contenido.</p>', {
    ALLOWED_TAGS: ['p','br','b','strong','i','em','u','s','h1','h2','h3','h4','ul','ol','li','a','blockquote','code','pre','span','hr','img'],
    ALLOWED_ATTR: ['href','target','rel','class','src','alt'],
  });
  return <div className="prose-vida bg-white rounded-xl border border-gray-100 p-5 sm:p-6" dangerouslySetInnerHTML={{ __html: limpio }} />;
}

// Video de archivo (mp4): gating por el evento 'ended'
function VideoArchivo({ url, yaVisto, onFin }) {
  return (
    <video controls controlsList="nodownload" onEnded={onFin} className="w-full rounded-xl bg-black aspect-video">
      <source src={url} />
    </video>
  );
}

// Video embebido (YouTube/Vimeo): gating con la IFrame API de YouTube; para
// otros proveedores, fallback por tiempo mínimo visto.
function VideoEmbebido({ url, yaVisto, onFin, duracionMin }) {
  const ref = useRef(null);
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/);
  const vm = url.match(/vimeo\.com\/(\d+)/);
  const [restante, setRestante] = useState(null); // fallback por tiempo

  // YouTube: usa la IFrame API para detectar el fin real del video.
  useEffect(() => {
    if (!yt || yaVisto) return;
    let player, cancel = false;
    function crear() {
      if (cancel || !window.YT?.Player || !ref.current) return;
      player = new window.YT.Player(ref.current, {
        events: { onStateChange: (e) => { if (e.data === window.YT.PlayerState.ENDED) onFin?.(); } },
      });
    }
    if (window.YT?.Player) crear();
    else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); crear(); };
      if (!document.getElementById('yt-iframe-api')) {
        const s = document.createElement('script'); s.id = 'yt-iframe-api'; s.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(s);
      }
    }
    return () => { cancel = true; try { player?.destroy?.(); } catch {} };
  }, [url]); // eslint-disable-line

  // Fallback por tiempo para proveedores sin API fiable (Vimeo u otros).
  useEffect(() => {
    if (yt || yaVisto) return;
    const espera = Math.min(Math.max((duracionMin || 1) * 60, 15), 600); // 15s..10min
    setRestante(espera);
    const t0 = Date.now();
    const iv = setInterval(() => {
      const left = Math.max(0, espera - Math.round((Date.now() - t0) / 1000));
      setRestante(left);
      if (left <= 0) { clearInterval(iv); onFin?.(); }
    }, 1000);
    return () => clearInterval(iv);
  }, [url]); // eslint-disable-line

  const src = yt ? `https://www.youtube.com/embed/${yt[1]}?enablejsapi=1&playsinline=1`
    : vm ? `https://player.vimeo.com/video/${vm[1]}` : url;

  return (
    <div>
      <div className="aspect-video bg-black rounded-xl overflow-hidden">
        {yt
          ? <div ref={ref} id={`yt-${yt[1]}`} className="w-full h-full">
              <iframe src={src} title="video" className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            </div>
          : <iframe src={src} title="video" className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />}
      </div>
      {!yt && !yaVisto && restante > 0
        ? <p className="text-[11px] text-gray-400 mt-1.5">Podrás marcar como completada en {restante}s (o al terminar el video).</p> : null}
    </div>
  );
}

// ── Quiz (soporta OPCION_UNICA, VERDADERO_FALSO, OPCION_MULTIPLE, RESPUESTA_CORTA) ─
function Quiz({ leccion, onAprobado }) {
  const toast = useToast();
  const preguntas = leccion.quiz || [];
  const [resp, setResp] = useState({});
  const [res, setRes] = useState(null);
  const [proc, setProc] = useState(false);
  useEffect(() => { setResp({}); setRes(null); }, [leccion.idLeccion]);

  function setUnica(idP, idO) { setResp(s => ({ ...s, [idP]: idO })); }
  function toggleMulti(idP, idO) {
    setResp(s => { const arr = Array.isArray(s[idP]) ? s[idP] : []; return { ...s, [idP]: arr.includes(idO) ? arr.filter(x => x !== idO) : [...arr, idO] }; });
  }
  function setTexto(idP, v) { setResp(s => ({ ...s, [idP]: v })); }

  const contestadas = preguntas.filter(p => {
    const a = resp[p.idPregunta];
    if (p.TipoPregunta === 'RESPUESTA_CORTA') return typeof a === 'string' && a.trim().length > 0;
    if (p.TipoPregunta === 'OPCION_MULTIPLE') return Array.isArray(a) && a.length > 0;
    return a != null;
  }).length;

  async function enviar() {
    setProc(true);
    try {
      const r = await api.post(`/academia/lecciones/${leccion.idLeccion}/quiz/responder`, { respuestas: resp });
      setRes(r.data);
      if (r.data?.aprobado) { toast.success(`¡Aprobado! ${r.data.puntaje}%`); onAprobado?.(); }
      else toast.warning(`Puntaje ${r.data?.puntaje || 0}% — necesitas ${leccion.QuizAprob}%`);
    } catch { toast.error('No se pudo enviar el quiz. Tus respuestas siguen aquí.'); }
    finally { setProc(false); }
  }

  if (preguntas.length === 0) return <Vacio texto="Esta evaluación aún no tiene preguntas." />;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 sm:p-6 space-y-5">
      <div className="flex items-center gap-2 text-sm text-gray-500"><HelpCircle size={16} className="text-vida-blue" /> Evaluación · necesitas {leccion.QuizAprob}% para aprobar</div>
      {preguntas.map((p, i) => (
        <div key={p.idPregunta} className="border-b border-gray-50 pb-4 last:border-0 last:pb-0">
          <p className="font-semibold text-gray-800 text-sm">{i + 1}. {p.Texto}
            {p.TipoPregunta === 'OPCION_MULTIPLE' ? <span className="ml-2 text-[10px] font-bold text-vida-blue">(varias correctas)</span> : null}
          </p>
          <div className="mt-2 space-y-1.5">
            {p.TipoPregunta === 'RESPUESTA_CORTA' ? (
              <input value={resp[p.idPregunta] || ''} onChange={e => setTexto(p.idPregunta, e.target.value)}
                placeholder="Escribe tu respuesta…" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-vida-blue" />
            ) : p.TipoPregunta === 'OPCION_MULTIPLE' ? (
              p.opciones.map(o => {
                const on = Array.isArray(resp[p.idPregunta]) && resp[p.idPregunta].includes(o.idOpcion);
                return (
                  <label key={o.idOpcion} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer text-sm ${on ? 'border-vida-blue bg-vida-blue/5' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={on} onChange={() => toggleMulti(p.idPregunta, o.idOpcion)} />
                    <span className="text-gray-700">{o.Texto}</span>
                  </label>
                );
              })
            ) : (
              p.opciones.map(o => {
                const on = resp[p.idPregunta] === o.idOpcion;
                return (
                  <label key={o.idOpcion} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer text-sm ${on ? 'border-vida-blue bg-vida-blue/5' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <input type="radio" name={`p${p.idPregunta}`} checked={on} onChange={() => setUnica(p.idPregunta, o.idOpcion)} />
                    <span className="text-gray-700">{o.Texto}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      ))}
      {res ? <div className={`text-sm font-bold ${res.aprobado ? 'text-vida-green' : 'text-red-500'}`}>Resultado: {res.correctas}/{res.total} ({res.puntaje}%) — {res.aprobado ? 'Aprobado ✓' : 'No aprobado'}</div> : null}
      <button onClick={enviar} disabled={proc || contestadas < preguntas.length}
        className="rounded-xl px-5 py-2.5 text-sm font-bold bg-vida-blue text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
        <Send size={16} /> {proc ? 'Enviando…' : 'Enviar respuestas'}
      </button>
    </div>
  );
}

// ── Comentarios ──────────────────────────────────────────────────────────────
function Comentarios({ idCurso, idLeccion }) {
  const { usuario } = useAuthStore();
  const toast = useToast();
  const [lista, setLista] = useState([]);
  const [texto, setTexto] = useState('');
  const esCorp = CORP.includes(usuario?.TipoUsuario);

  const cargar = useCallback(async () => {
    try {
      const q = idLeccion ? `?idLeccion=${idLeccion}` : '';
      const r = await api.get(`/academia/cursos/${idCurso}/comentarios${q}`);
      setLista(r.data || []);
    } catch { setLista([]); }
  }, [idCurso, idLeccion]);
  useEffect(() => { cargar(); }, [cargar]);

  async function enviar() {
    if (!texto.trim()) return;
    try { await api.post(`/academia/cursos/${idCurso}/comentarios`, { texto: texto.trim(), idLeccion: idLeccion || null }); setTexto(''); cargar(); }
    catch { toast.error('No se pudo comentar'); }
  }
  async function borrar(id) { try { await api.delete(`/academia/comentarios/${id}`); cargar(); } catch { toast.error('No se pudo eliminar'); } }

  return (
    <div className="mt-8 pt-6 border-t border-gray-100">
      <p className="font-bold text-gray-700 text-sm mb-3">Comentarios de la lección</p>
      <div className="flex gap-2 mb-4">
        <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()}
          placeholder="Escribe un comentario o pregunta…" className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-vida-blue" />
        <button onClick={enviar} className="bg-vida-blue text-white px-4 rounded-xl hover:opacity-90"><Send size={16} /></button>
      </div>
      <div className="space-y-2">
        {lista.length === 0 ? <p className="text-xs text-gray-400">Sé el primero en comentar.</p> :
          lista.map(cm => (
            <div key={cm.idComentario} className="bg-white rounded-xl border border-gray-100 p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-700">{cm.Autor}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-300">{new Date(cm.FechaAlta).toLocaleDateString('es-VE')}</span>
                  {(esCorp || String(cm.idUsuario) === String(usuario?.idUsuario)) && String(cm.TipoActor || 'EMPRESARIO') === 'EMPRESARIO'
                    ? <button onClick={() => borrar(cm.idComentario)} className="text-gray-300 hover:text-red-400"><Trash2 size={13} /></button> : null}
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{cm.Texto}</p>
            </div>
          ))}
      </div>
    </div>
  );
}
