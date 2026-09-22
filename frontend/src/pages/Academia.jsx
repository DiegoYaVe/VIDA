// src/pages/Academia.jsx
// Academia VIDA — LMS del panel (estilo Udemy/Platzi).
//   • Mis cursos: catálogo filtrado por targeting + reproductor con progreso,
//     lecciones (VIDEO/TEXTO/PDF/QUIZ), comentarios y constancia.
//   • Gestión (roles de red): editor curso → módulos → lecciones, subir video o
//     pegar enlace, asignar visibilidad por rol/usuario, obligatorio + fecha límite, quiz.
//   • Analítica (roles de red): quién tomó, fuera de tiempo, menor tiempo, % avance.
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap, PlayCircle, CheckCircle2, Clock, Star, Award, RefreshCw,
  BookOpen, Lock, AlertTriangle, ChevronRight, Pencil, BarChart3, Printer,
  Video, FileText, HelpCircle,
} from 'lucide-react';
import api from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';
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
  const navigate = useNavigate();
  const [cursos, setCursos] = useState([]);
  const [resumen, setResumen] = useState({ total:0, completados:0, puntos:0, obligatoriosPendientes:0, fueraDeTiempo:0 });
  const [cargando, setCargando] = useState(true);

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
          {cursos.map(c => <CursoCard key={c.idCurso} c={c} onAbrir={()=>navigate(`/academia/curso/${c.idCurso}`)} />)}
        </div>
      )}

      <MisConstancias />
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
