// src/pages/Academia.jsx
// Academia VIDA — LMS del panel (estilo Udemy/Platzi).
//   • Mis cursos: catálogo filtrado por targeting + reproductor con progreso,
//     lecciones (VIDEO/TEXTO/PDF/QUIZ), comentarios y constancia.
//   • Gestión (roles de red): editor curso → módulos → lecciones, subir video o
//     pegar enlace, asignar visibilidad por rol/usuario, obligatorio + fecha límite, quiz.
//   • Analítica (roles de red): quién tomó, fuera de tiempo, menor tiempo, % avance.
import { useState, useEffect, useCallback } from 'react';
import {
  GraduationCap, PlayCircle, CheckCircle2, Clock, Star, Award, RefreshCw, X,
  BookOpen, FileText, HelpCircle, Video, Lock, AlertTriangle, ChevronRight,
  Plus, Pencil, Trash2, Users, BarChart3, Upload, Send, Printer, Eye, Timer,
} from 'lucide-react';
import api, { API_ORIGIN } from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';
import { useToast } from '../components/Toast.jsx';
import { Gestion, Analitica } from './AcademiaAdmin.jsx';

const CAT_COLOR = { Ventas:'#5BBE6A', Servicio:'#54C4E0', Marketing:'#7B3FBE', Finanzas:'#0A1E3F', Cumplimiento:'#E0574C', Test:'#888' };
const TIPO_LABEL = { CAPACITACION:'Capacitación', NORMAS:'Normas', GUBERNAMENTAL:'Gubernamental' };
const ROLES_ASIGNABLES = ['SUPER_ADMIN','ADMIN_PAIS','ADMIN_ESTADO','ADMIN','SUPERVISOR','CAJERO'];
const CORP = ['SUPER_ADMIN','ADMIN_PAIS','ADMIN_ESTADO'];
const ICON_LEC = { VIDEO:Video, TEXTO:FileText, PDF:FileText, QUIZ:HelpCircle };

function fmtSeg(s) {
  if (s == null) return '—';
  const m = Math.floor(s/60), sec = s%60;
  if (m >= 60) { const h=Math.floor(m/60); return `${h}h ${m%60}m`; }
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export default function Academia() {
  const { usuario } = useAuthStore();
  const esCorp = CORP.includes(usuario?.TipoUsuario);
  const [tab, setTab] = useState('cursos');

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
              <GraduationCap size={22} className="text-vida-blue" /> Academia VIDA
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">Capacítate, cumple las normas y gana puntos</p>
          </div>
        </div>
        <div className="flex gap-1 mt-3">
          <TabBtn active={tab==='cursos'} onClick={()=>setTab('cursos')} icon={BookOpen}>Mis cursos</TabBtn>
          {esCorp && <TabBtn active={tab==='gestion'} onClick={()=>setTab('gestion')} icon={Pencil}>Gestión</TabBtn>}
          {esCorp && <TabBtn active={tab==='analitica'} onClick={()=>setTab('analitica')} icon={BarChart3}>Analítica</TabBtn>}
        </div>
      </div>

      {tab==='cursos'    && <MisCursos />}
      {tab==='gestion'   && esCorp && <Gestion />}
      {tab==='analitica' && esCorp && <Analitica />}
    </div>
  );
}

function TabBtn({ active, onClick, icon:Icon, children }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition
        ${active ? 'bg-vida-blue text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
      <Icon size={15} /> {children}
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MIS CURSOS (learner)
// ════════════════════════════════════════════════════════════════════════════
function MisCursos() {
  const [cursos, setCursos] = useState([]);
  const [resumen, setResumen] = useState({ total:0, completados:0, puntos:0, obligatoriosPendientes:0, fueraDeTiempo:0 });
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null); // idCurso

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await api.get('/academia/cursos');
      setCursos(r.data?.cursos || []);
      setResumen(r.data?.resumen || resumen);
    } catch { setCursos([]); }
    finally { setCargando(false); }
  }, []); // eslint-disable-line
  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div className="p-6 space-y-5">
      {/* Resumen */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard color="#0A1E3F" icon={Award} valor={`${resumen.puntos.toLocaleString('es-VE')}`} label="Puntos de academia" />
        <StatCard color="#5BBE6A" icon={CheckCircle2} valor={`${resumen.completados}/${resumen.total}`} label="Cursos completados" />
        <StatCard color="#E0574C" icon={AlertTriangle} valor={resumen.obligatoriosPendientes} label="Obligatorios pendientes" />
        <StatCard color="#E0574C" icon={Clock} valor={resumen.fueraDeTiempo} label="Fuera de tiempo" />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-700 text-sm">Cursos disponibles para ti</h2>
        <button onClick={cargar} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-vida-blue border border-gray-200 px-2.5 py-1.5 rounded-lg">
          <RefreshCw size={13} className={cargando ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {cargando ? (
        <p className="text-center text-gray-400 py-10 text-sm">Cargando cursos…</p>
      ) : cursos.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          <GraduationCap size={44} className="mx-auto mb-3 opacity-20" />
          <p>No tienes cursos asignados por ahora.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cursos.map(c => <CursoCard key={c.idCurso} c={c} onAbrir={()=>setAbierto(c.idCurso)} />)}
        </div>
      )}

      <MisConstancias />

      {abierto != null && <Reproductor idCurso={abierto} onClose={()=>{ setAbierto(null); cargar(); }} />}
    </div>
  );
}

function MisConstancias() {
  const [lista, setLista] = useState([]);
  useEffect(() => {
    (async () => { try { const r = await api.get('/academia/diplomas'); setLista(r.data || []); } catch {} })();
  }, []);
  if (lista.length === 0) return null;
  return (
    <div className="pt-2">
      <h2 className="font-bold text-gray-700 text-sm mb-3 flex items-center gap-1.5"><Award size={15} className="text-vida-green"/> Mis constancias</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map(d => (
          <div key={d.idDiploma} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
            <div className="min-w-0">
              <p className="font-bold text-gray-800 text-sm truncate">{d.TituloCurso}</p>
              <p className="text-[11px] text-gray-400 font-mono">{d.Folio}</p>
              <p className="text-[11px] text-gray-400">{new Date(d.FechaEmision).toLocaleDateString('es-VE')}</p>
            </div>
            <a href={`/constancia/${encodeURIComponent(d.Folio)}`} target="_blank" rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1 bg-vida-blue text-white text-xs font-semibold px-3 py-2 rounded-xl hover:opacity-90">
              <Printer size={14}/> Ver
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ color, icon:Icon, valor, label }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background:`${color}18`, color }}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-xl font-black text-gray-800 leading-none">{valor}</p>
        <p className="text-[11px] text-gray-400 mt-1">{label}</p>
      </div>
    </div>
  );
}

function CursoCard({ c, onAbrir }) {
  const color = CAT_COLOR[c.Categoria] || '#0A1E3F';
  const pct = c.ProgresoPct ?? 0;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
      <div className="h-24 flex items-center justify-center relative" style={{ background:`${color}14` }}>
        <PlayCircle size={40} style={{ color }} />
        {c.Completado ? (
          <span className="absolute top-2 right-2 flex items-center gap-1 bg-vida-green text-white text-[10px] font-bold px-2 py-0.5 rounded-lg"><CheckCircle2 size={11}/> Completado</span>
        ) : c.FueraDeTiempo ? (
          <span className="absolute top-2 right-2 flex items-center gap-1 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-lg"><AlertTriangle size={11}/> Fuera de tiempo</span>
        ) : c.Obligatorio ? (
          <span className="absolute top-2 right-2 flex items-center gap-1 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-lg"><Lock size={11}/> Obligatorio</span>
        ) : null}
        {c.Categoria ? <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-lg text-white" style={{ backgroundColor:color }}>{c.Categoria}</span> : null}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <p className="font-bold text-gray-800 text-sm">{c.Titulo}</p>
        <p className="text-xs text-gray-400 mt-1 flex-1 line-clamp-2">{c.Descripcion}</p>
        <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
          <span className="flex items-center gap-1"><Clock size={12}/> {c.DuracionMin} min</span>
          <span className="flex items-center gap-1"><Star size={12}/> {c.Puntos} pts</span>
          {c.Obligatorio && c.FechaLimite ? <span className="flex items-center gap-1"><AlertTriangle size={12}/> {new Date(c.FechaLimite).toLocaleDateString('es-VE')}</span> : null}
        </div>
        {/* Progreso */}
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-gray-400 mb-1"><span>Progreso</span><span>{pct}%</span></div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width:`${pct}%`, background: pct===100?'#5BBE6A':'#54C4E0' }} />
          </div>
        </div>
        <button onClick={onAbrir}
          className="mt-3 w-full rounded-xl px-3 py-2 text-sm font-semibold bg-vida-blue text-white hover:opacity-90 flex items-center justify-center gap-1.5">
          {c.Completado ? 'Repasar' : pct>0 ? 'Continuar' : 'Empezar'} <ChevronRight size={15}/>
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// REPRODUCTOR (course player)
// ════════════════════════════════════════════════════════════════════════════
function Reproductor({ idCurso, onClose }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null); // idLeccion
  const [cargando, setCargando] = useState(true);
  const [proc, setProc] = useState(false);
  const [inicio, setInicio] = useState(Date.now());

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await api.get(`/academia/cursos/${idCurso}`);
      setData(r.data);
      const lecs = (r.data.modulos||[]).flatMap(m => m.lecciones);
      const primeraPend = lecs.find(l => !l.Completado) || lecs[0];
      setSel(prev => prev ?? primeraPend?.idLeccion ?? null);
    } catch { toast.error('No se pudo abrir el curso'); onClose(); }
    finally { setCargando(false); }
  }, [idCurso]); // eslint-disable-line
  useEffect(() => { cargar(); }, [cargar]);

  const lecciones = (data?.modulos||[]).flatMap(m => m.lecciones);
  const leccion = lecciones.find(l => l.idLeccion === sel);
  useEffect(() => { if (sel) { setInicio(Date.now()); if (leccion && !leccion.Completado) api.post(`/academia/lecciones/${sel}/iniciar`).catch(()=>{}); } }, [sel]); // eslint-disable-line

  async function completar() {
    if (!leccion) return;
    setProc(true);
    try {
      const segundos = Math.round((Date.now()-inicio)/1000);
      const r = await api.post(`/academia/lecciones/${leccion.idLeccion}/completar`, { segundos });
      if (r.data?.curso?.completado) toast.success('¡Curso completado!', 'Tu constancia ya está disponible');
      await cargar();
      // avanza a la siguiente pendiente
      const idx = lecciones.findIndex(l => l.idLeccion === leccion.idLeccion);
      const sig = lecciones.slice(idx+1).find(l => !l.Completado);
      if (sig) setSel(sig.idLeccion);
    } catch { toast.error('No se pudo marcar la lección'); }
    finally { setProc(false); }
  }

  const total = data?.progreso?.total || 0;
  const hechas = data?.progreso?.completadas || 0;
  const pct = total>0 ? Math.round((hechas/total)*100) : 0;
  const curso = data?.curso;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-stretch justify-center">
      <div className="bg-gray-50 w-full max-w-6xl my-0 flex flex-col shadow-2xl">
        {/* header */}
        <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <p className="font-black text-gray-800 truncate">{curso?.Titulo || 'Curso'}</p>
            <p className="text-[11px] text-gray-400">{hechas}/{total} lecciones · {pct}%</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><X size={20}/></button>
        </div>

        {cargando ? (
          <p className="flex-1 flex items-center justify-center text-gray-400">Cargando…</p>
        ) : (
          <div className="flex-1 flex min-h-0">
            {/* temario */}
            <div className="w-72 border-r border-gray-100 bg-white overflow-y-auto shrink-0 hidden md:block">
              {(data.modulos||[]).map(m => (
                <div key={m.idModulo}>
                  <p className="px-4 pt-3 pb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wide">{m.Titulo}</p>
                  {m.lecciones.map(l => {
                    const Icon = ICON_LEC[l.TipoLeccion] || Video;
                    return (
                      <button key={l.idLeccion} onClick={()=>setSel(l.idLeccion)}
                        className={`w-full text-left px-4 py-2 flex items-center gap-2 text-sm border-l-2 ${sel===l.idLeccion?'bg-vida-blue/5 border-vida-blue':'border-transparent hover:bg-gray-50'}`}>
                        {l.Completado ? <CheckCircle2 size={16} className="text-vida-green shrink-0"/> : <Icon size={16} className="text-gray-400 shrink-0"/>}
                        <span className={`flex-1 truncate ${l.Completado?'text-gray-400':'text-gray-700'}`}>{l.Titulo}</span>
                        <span className="text-[10px] text-gray-300">{l.DuracionMin}m</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* contenido */}
            <div className="flex-1 overflow-y-auto">
              {leccion ? <VistaLeccion leccion={leccion} onCompletar={completar} proc={proc} recargar={cargar} /> : <p className="p-6 text-gray-400">Sin lecciones.</p>}
              <Comentarios idCurso={idCurso} idLeccion={leccion?.idLeccion} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VistaLeccion({ leccion, onCompletar, proc, recargar }) {
  return (
    <div className="p-5">
      <div className="mb-3">
        <p className="text-lg font-black text-gray-800">{leccion.Titulo}</p>
        {leccion.Descripcion ? <p className="text-sm text-gray-500 mt-0.5">{leccion.Descripcion}</p> : null}
      </div>

      {/* Media según tipo */}
      {leccion.TipoLeccion === 'VIDEO' && leccion.VideoUrl ? (
        <div className="aspect-video bg-black rounded-xl overflow-hidden">
          <iframe src={toEmbed(leccion.VideoUrl)} title={leccion.Titulo} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
      ) : leccion.TipoLeccion === 'VIDEO' && leccion.ArchivoUrl ? (
        <video controls className="w-full rounded-xl bg-black" src={`${API_ORIGIN}${leccion.ArchivoUrl}`} />
      ) : leccion.TipoLeccion === 'PDF' && leccion.ArchivoUrl ? (
        <iframe src={`${API_ORIGIN}${leccion.ArchivoUrl}`} title={leccion.Titulo} className="w-full h-[70vh] rounded-xl border border-gray-200" />
      ) : leccion.TipoLeccion === 'TEXTO' ? (
        <div className="bg-white rounded-xl border border-gray-100 p-5 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{leccion.Contenido || 'Sin contenido.'}</div>
      ) : leccion.TipoLeccion === 'QUIZ' ? (
        <QuizRunner leccion={leccion} onAprobado={recargar} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 p-5 text-sm text-gray-400">Contenido no disponible.</div>
      )}

      {leccion.TipoLeccion !== 'QUIZ' && (
        <button onClick={onCompletar} disabled={proc || leccion.Completado}
          className={`mt-4 rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center gap-2 disabled:opacity-60
            ${leccion.Completado ? 'bg-gray-100 text-gray-400' : 'bg-vida-green text-white hover:opacity-90'}`}>
          <CheckCircle2 size={16}/> {leccion.Completado ? 'Lección completada' : proc ? 'Guardando…' : 'Marcar como completada'}
        </button>
      )}
    </div>
  );
}

function QuizRunner({ leccion, onAprobado }) {
  const toast = useToast();
  const preguntas = leccion.quiz || [];
  const [resp, setResp] = useState({});
  const [res, setRes] = useState(null);
  const [proc, setProc] = useState(false);
  useEffect(() => { setResp({}); setRes(null); }, [leccion.idLeccion]);

  async function enviar() {
    setProc(true);
    try {
      const r = await api.post(`/academia/lecciones/${leccion.idLeccion}/quiz/responder`, { respuestas: resp });
      setRes(r.data);
      if (r.data?.aprobado) { toast.success(`¡Aprobado! ${r.data.puntaje}%`); onAprobado?.(); }
      else toast.warning(`Puntaje ${r.data?.puntaje||0}% — necesitas ${leccion.QuizAprob}%`);
    } catch { toast.error('No se pudo enviar el quiz'); }
    finally { setProc(false); }
  }

  if (preguntas.length === 0) return <div className="bg-white rounded-xl border border-gray-100 p-5 text-sm text-gray-400">Esta evaluación aún no tiene preguntas.</div>;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
      <p className="text-sm text-gray-500 flex items-center gap-1.5"><HelpCircle size={15}/> Responde para aprobar (mínimo {leccion.QuizAprob}%).</p>
      {preguntas.map((p, i) => (
        <div key={p.idPregunta}>
          <p className="font-semibold text-gray-800 text-sm">{i+1}. {p.Texto}</p>
          <div className="mt-1.5 space-y-1.5">
            {p.opciones.map(o => (
              <label key={o.idOpcion} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm
                ${resp[p.idPregunta]===o.idOpcion?'border-vida-blue bg-vida-blue/5':'border-gray-200 hover:bg-gray-50'}`}>
                <input type="radio" name={`p${p.idPregunta}`} checked={resp[p.idPregunta]===o.idOpcion}
                  onChange={()=>setResp(s=>({ ...s, [p.idPregunta]:o.idOpcion }))} />
                <span className="text-gray-700">{o.Texto}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      {res && (
        <div className={`text-sm font-semibold ${res.aprobado?'text-vida-green':'text-red-500'}`}>
          Resultado: {res.correctas}/{res.total} ({res.puntaje}%) — {res.aprobado?'Aprobado':'No aprobado'}
        </div>
      )}
      <button onClick={enviar} disabled={proc || Object.keys(resp).length < preguntas.length}
        className="rounded-xl px-4 py-2.5 text-sm font-semibold bg-vida-blue text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
        <Send size={15}/> {proc?'Enviando…':'Enviar respuestas'}
      </button>
    </div>
  );
}

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
    try {
      await api.post(`/academia/cursos/${idCurso}/comentarios`, { texto: texto.trim(), idLeccion: idLeccion||null });
      setTexto(''); cargar();
    } catch { toast.error('No se pudo comentar'); }
  }
  async function borrar(id) {
    try { await api.delete(`/academia/comentarios/${id}`); cargar(); }
    catch { toast.error('No se pudo eliminar'); }
  }

  return (
    <div className="p-5 border-t border-gray-100">
      <p className="font-bold text-gray-700 text-sm mb-3">Comentarios {idLeccion?'de la lección':'del curso'}</p>
      <div className="flex gap-2 mb-4">
        <input value={texto} onChange={e=>setTexto(e.target.value)} onKeyDown={e=>e.key==='Enter'&&enviar()}
          placeholder="Escribe un comentario…" className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-vida-blue" />
        <button onClick={enviar} className="bg-vida-blue text-white px-3 rounded-xl"><Send size={16}/></button>
      </div>
      <div className="space-y-2">
        {lista.length===0 ? <p className="text-xs text-gray-400">Sé el primero en comentar.</p> :
          lista.map(cm => (
            <div key={cm.idComentario} className="bg-white rounded-xl border border-gray-100 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-700">{cm.Autor}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-300">{new Date(cm.FechaAlta).toLocaleDateString('es-VE')}</span>
                  {(esCorp || String(cm.idUsuario)===String(usuario?.idUsuario)) &&
                    <button onClick={()=>borrar(cm.idComentario)} className="text-gray-300 hover:text-red-400"><Trash2 size={13}/></button>}
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{cm.Texto}</p>
            </div>
          ))}
      </div>
    </div>
  );
}

function toEmbed(url) {
  if (!url) return url;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return url;
}
