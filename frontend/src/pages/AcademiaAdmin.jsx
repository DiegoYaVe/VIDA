// src/pages/AcademiaAdmin.jsx
// Academia VIDA — pestañas de administración (roles de red): Gestión (editor
// curso → módulos → lecciones + visibilidad + quiz) y Analítica.
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Pencil, Trash2, X, Save, Users, Video, FileText, HelpCircle, Upload,
  ChevronRight, ChevronDown, BarChart3, AlertTriangle, CheckCircle2, Timer, Eye,
  BookOpen, GripVertical, Lock,
} from 'lucide-react';
import api, { API_ORIGIN } from '../services/api.js';
import { useToast } from '../components/Toast.jsx';

const TIPOS_CURSO = [
  { v:'CAPACITACION', l:'Capacitación del sistema' },
  { v:'NORMAS', l:'Normas específicas' },
  { v:'GUBERNAMENTAL', l:'Cumplimiento gubernamental' },
];
const VISIBILIDADES = [
  { v:'TODOS', l:'Todos los usuarios' },
  { v:'ROLES', l:'Por rol' },
  { v:'USUARIOS', l:'Por usuario específico' },
  { v:'MIXTO', l:'Por rol o usuario' },
];
const AUDIENCIAS = [
  { v:'EMPRESARIO', l:'Empresarios (panel)' },
  { v:'CLIENTE', l:'Clientes (app)' },
  { v:'AMBOS', l:'Ambos' },
];
const ROLES = ['SUPER_ADMIN','ADMIN_PAIS','ADMIN_ESTADO','ADMIN','SUPERVISOR','CAJERO'];
const TIPOS_LECCION = [
  { v:'VIDEO', l:'Video', icon:Video },
  { v:'TEXTO', l:'Artículo / Texto', icon:FileText },
  { v:'PDF', l:'PDF', icon:FileText },
  { v:'QUIZ', l:'Evaluación (Quiz)', icon:HelpCircle },
];

// ════════════════════════════════════════════════════════════════════════════
// GESTIÓN
// ════════════════════════════════════════════════════════════════════════════
export function Gestion() {
  const toast = useToast();
  const [cursos, setCursos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [edit, setEdit] = useState(null); // idCurso | 'nuevo' | null

  const cargar = useCallback(async () => {
    setCargando(true);
    try { const r = await api.get('/academia/admin/cursos'); setCursos(r.data || []); }
    catch { toast.error('No se pudieron cargar los cursos'); }
    finally { setCargando(false); }
  }, []); // eslint-disable-line
  useEffect(() => { cargar(); }, [cargar]);

  async function eliminar(idCurso) {
    if (!confirm('¿Desactivar este curso?')) return;
    try { await api.delete(`/academia/admin/cursos/${idCurso}`); cargar(); }
    catch { toast.error('No se pudo eliminar'); }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-700 text-sm">Cursos ({cursos.length})</h2>
        <button onClick={()=>setEdit('nuevo')} className="flex items-center gap-1.5 bg-vida-green text-white px-3 py-2 rounded-xl text-sm font-semibold hover:opacity-90">
          <Plus size={16}/> Nuevo curso
        </button>
      </div>

      {cargando ? <p className="text-center text-gray-400 py-10 text-sm">Cargando…</p> : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-400 text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Curso</th>
                <th className="text-left px-4 py-2 font-semibold">Tipo</th>
                <th className="text-center px-4 py-2 font-semibold">Módulos</th>
                <th className="text-center px-4 py-2 font-semibold">Lecciones</th>
                <th className="text-center px-4 py-2 font-semibold">Completaron</th>
                <th className="text-center px-4 py-2 font-semibold">Estado</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {cursos.map(c => (
                <tr key={c.idCurso} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-gray-800">{c.Titulo}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {c.Obligatorio ? <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold flex items-center gap-1"><Lock size={9}/> Obligatorio</span> : null}
                      {c.FechaLimite ? <span className="text-[10px] text-gray-400">límite {new Date(c.FechaLimite).toLocaleDateString('es-VE')}</span> : null}
                      <span className="text-[10px] text-gray-400 flex items-center gap-1"><Eye size={10}/> {c.Visibilidad}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{TIPOS_CURSO.find(t=>t.v===c.Tipo)?.l || c.Tipo}</td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{c.Modulos}</td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{c.Lecciones}</td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{c.Completaron}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${c.Status==='ACTIVO'?'bg-green-100 text-green-700':'bg-gray-100 text-gray-400'}`}>{c.Status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={()=>setEdit(c.idCurso)} className="text-gray-400 hover:text-vida-blue p-1"><Pencil size={15}/></button>
                    <button onClick={()=>eliminar(c.idCurso)} className="text-gray-400 hover:text-red-500 p-1"><Trash2 size={15}/></button>
                  </td>
                </tr>
              ))}
              {cursos.length===0 && <tr><td colSpan={7} className="text-center text-gray-400 py-8">Sin cursos. Crea el primero.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {edit != null && <EditorCurso idCurso={edit==='nuevo'?null:edit} onClose={()=>{ setEdit(null); cargar(); }} />}
    </div>
  );
}

const CURSO_VACIO = { Titulo:'', Descripcion:'', Categoria:'', Tipo:'CAPACITACION', Obligatorio:false, FechaLimite:'', Visibilidad:'TODOS', Audiencia:'EMPRESARIO', Puntos:100, DuracionMin:0, Orden:0, Status:'ACTIVO' };

function EditorCurso({ idCurso, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState(CURSO_VACIO);
  const [modulos, setModulos] = useState([]);
  const [targeting, setTargeting] = useState({ roles:[], usuarios:[] });
  const [usuarios, setUsuarios] = useState([]);
  const [id, setId] = useState(idCurso);
  const [cargando, setCargando] = useState(!!idCurso);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const [u] = await Promise.all([ api.get('/academia/admin/usuarios').catch(()=>({data:[]})) ]);
    setUsuarios(u.data || []);
    if (idCurso) {
      try {
        const r = await api.get(`/academia/admin/cursos/${idCurso}`);
        const c = r.data.curso;
        setForm({ ...CURSO_VACIO, ...c, FechaLimite: c.FechaLimite ? String(c.FechaLimite).slice(0,10) : '', Obligatorio: !!c.Obligatorio });
        setModulos(r.data.modulos || []);
        setTargeting(r.data.targeting || { roles:[], usuarios:[] });
      } catch { toast.error('No se pudo cargar el curso'); }
    }
    setCargando(false);
  }, [idCurso]); // eslint-disable-line
  useEffect(() => { cargar(); }, [cargar]);

  async function guardarCurso() {
    if (!form.Titulo.trim()) { toast.warning('El título es obligatorio'); return; }
    setGuardando(true);
    try {
      const payload = { ...form, FechaLimite: form.FechaLimite || null };
      let curId = id;
      if (id) { await api.put(`/academia/admin/cursos/${id}`, payload); }
      else { const r = await api.post('/academia/admin/cursos', payload); curId = r.data.idCurso; setId(curId); }
      await api.put(`/academia/admin/cursos/${curId}/visibilidad`, { Visibilidad: form.Visibilidad, roles: targeting.roles, usuarios: targeting.usuarios });
      toast.success('Curso guardado');
      if (!id) { const r = await api.get(`/academia/admin/cursos/${curId}`); setModulos(r.data.modulos||[]); }
    } catch { toast.error('No se pudo guardar el curso'); }
    finally { setGuardando(false); }
  }

  function up(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function toggleRol(r) { setTargeting(t => ({ ...t, roles: t.roles.includes(r) ? t.roles.filter(x=>x!==r) : [...t.roles, r] })); }
  function toggleUsr(uId) { setTargeting(t => ({ ...t, usuarios: t.usuarios.includes(uId) ? t.usuarios.filter(x=>x!==uId) : [...t.usuarios, uId] })); }

  const mostrarRoles = form.Visibilidad==='ROLES' || form.Visibilidad==='MIXTO';
  const mostrarUsuarios = form.Visibilidad==='USUARIOS' || form.Visibilidad==='MIXTO';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-stretch justify-center">
      <div className="bg-gray-50 w-full max-w-4xl flex flex-col shadow-2xl">
        <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between shrink-0">
          <p className="font-black text-gray-800">{id ? 'Editar curso' : 'Nuevo curso'}</p>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><X size={20}/></button>
        </div>

        {cargando ? <p className="flex-1 flex items-center justify-center text-gray-400">Cargando…</p> : (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Datos del curso */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
              <p className="font-bold text-gray-700 text-sm">Datos del curso</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Título"><input value={form.Titulo} onChange={e=>up('Titulo',e.target.value)} className="inp"/></Field>
                <Field label="Categoría"><input value={form.Categoria||''} onChange={e=>up('Categoria',e.target.value)} className="inp" placeholder="Ventas, Cumplimiento…"/></Field>
              </div>
              <Field label="Descripción"><textarea value={form.Descripcion||''} onChange={e=>up('Descripcion',e.target.value)} rows={2} className="inp"/></Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Tipo de curso"><select value={form.Tipo} onChange={e=>up('Tipo',e.target.value)} className="inp">{TIPOS_CURSO.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}</select></Field>
                <Field label="Audiencia"><select value={form.Audiencia} onChange={e=>up('Audiencia',e.target.value)} className="inp">{AUDIENCIAS.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}</select></Field>
                <Field label="Puntos"><input type="number" value={form.Puntos} onChange={e=>up('Puntos',e.target.value)} className="inp"/></Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 items-end">
                <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
                  <input type="checkbox" checked={form.Obligatorio} onChange={e=>up('Obligatorio',e.target.checked)}/> Obligatorio
                </label>
                <Field label="Fecha límite"><input type="date" value={form.FechaLimite||''} onChange={e=>up('FechaLimite',e.target.value)} className="inp" disabled={!form.Obligatorio}/></Field>
                <Field label="Orden"><input type="number" value={form.Orden} onChange={e=>up('Orden',e.target.value)} className="inp"/></Field>
              </div>
            </div>

            {/* Visibilidad / targeting */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
              <p className="font-bold text-gray-700 text-sm flex items-center gap-1.5"><Users size={15}/> ¿Quién ve este curso?</p>
              <Field label="Visibilidad"><select value={form.Visibilidad} onChange={e=>up('Visibilidad',e.target.value)} className="inp">{VISIBILIDADES.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}</select></Field>
              {mostrarRoles && (
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">Roles</p>
                  <div className="flex flex-wrap gap-2">
                    {ROLES.map(r => (
                      <button key={r} onClick={()=>toggleRol(r)} type="button"
                        className={`text-xs px-2.5 py-1 rounded-lg border font-semibold ${targeting.roles.includes(r)?'bg-vida-blue text-white border-vida-blue':'border-gray-200 text-gray-500'}`}>{r}</button>
                    ))}
                  </div>
                </div>
              )}
              {mostrarUsuarios && (
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">Usuarios ({targeting.usuarios.length} seleccionados)</p>
                  <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                    {usuarios.map(u => (
                      <label key={u.idUsuario} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={targeting.usuarios.includes(u.idUsuario)} onChange={()=>toggleUsr(u.idUsuario)}/>
                        <span className="text-gray-700">{u.Nombre} {u.Apellidos}</span>
                        <span className="text-[10px] text-gray-400 ml-auto">{u.TipoUsuario}</span>
                      </label>
                    ))}
                    {usuarios.length===0 && <p className="text-xs text-gray-400 px-3 py-2">Sin usuarios.</p>}
                  </div>
                </div>
              )}
            </div>

            <button onClick={guardarCurso} disabled={guardando} className="w-full bg-vida-blue text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
              <Save size={16}/> {guardando?'Guardando…':'Guardar curso y visibilidad'}
            </button>

            {/* Módulos y lecciones (solo tras crear el curso) */}
            {id ? <ModulosEditor idCurso={id} modulos={modulos} onChange={setModulos} /> :
              <p className="text-center text-xs text-gray-400">Guarda el curso para agregar módulos y lecciones.</p>}
          </div>
        )}
      </div>
      <style>{`.inp{width:100%;border:1px solid #e5e7eb;border-radius:0.75rem;padding:0.5rem 0.75rem;font-size:0.875rem;outline:none}.inp:focus{border-color:#0A1E3F}.inp:disabled{background:#f9fafb;color:#9ca3af}`}</style>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="block"><span className="text-xs text-gray-400 block mb-1">{label}</span>{children}</label>;
}

function ModulosEditor({ idCurso, modulos, onChange }) {
  const toast = useToast();
  const [nuevoMod, setNuevoMod] = useState('');

  async function recargar() {
    const r = await api.get(`/academia/admin/cursos/${idCurso}`);
    onChange(r.data.modulos || []);
  }
  async function addModulo() {
    if (!nuevoMod.trim()) return;
    try { await api.post(`/academia/admin/cursos/${idCurso}/modulos`, { Titulo:nuevoMod.trim(), Orden:modulos.length+1 }); setNuevoMod(''); recargar(); }
    catch { toast.error('No se pudo crear el módulo'); }
  }
  async function delModulo(idModulo) {
    if (!confirm('¿Eliminar módulo y sus lecciones?')) return;
    try { await api.delete(`/academia/admin/modulos/${idModulo}`); recargar(); }
    catch { toast.error('No se pudo eliminar'); }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
      <p className="font-bold text-gray-700 text-sm flex items-center gap-1.5"><BookOpen size={15}/> Contenido del curso</p>
      {modulos.map(m => <ModuloRow key={m.idModulo} idCurso={idCurso} modulo={m} onDel={()=>delModulo(m.idModulo)} onChange={recargar} />)}
      <div className="flex gap-2 pt-1">
        <input value={nuevoMod} onChange={e=>setNuevoMod(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addModulo()} placeholder="Nuevo módulo…" className="inp flex-1"/>
        <button onClick={addModulo} className="bg-vida-green text-white px-3 rounded-xl flex items-center gap-1 text-sm font-semibold"><Plus size={15}/> Módulo</button>
      </div>
    </div>
  );
}

function ModuloRow({ idCurso, modulo, onDel, onChange }) {
  const toast = useToast();
  const [abierto, setAbierto] = useState(true);
  const [addLec, setAddLec] = useState(false);

  async function delLeccion(idLeccion) {
    if (!confirm('¿Eliminar lección?')) return;
    try { await api.delete(`/academia/admin/lecciones/${idLeccion}`); onChange(); }
    catch { toast.error('No se pudo eliminar'); }
  }

  return (
    <div className="border border-gray-100 rounded-xl">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-t-xl">
        <button onClick={()=>setAbierto(a=>!a)} className="text-gray-400">{abierto?<ChevronDown size={16}/>:<ChevronRight size={16}/>}</button>
        <p className="font-semibold text-sm text-gray-700 flex-1">{modulo.Titulo}</p>
        <span className="text-[10px] text-gray-400">{modulo.lecciones?.length||0} lecciones</span>
        <button onClick={onDel} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={14}/></button>
      </div>
      {abierto && (
        <div className="p-2 space-y-1">
          {(modulo.lecciones||[]).map(l => <LeccionRow key={l.idLeccion} leccion={l} onDel={()=>delLeccion(l.idLeccion)} onChange={onChange} />)}
          {addLec
            ? <LeccionForm idModulo={modulo.idModulo} onDone={()=>{ setAddLec(false); onChange(); }} onCancel={()=>setAddLec(false)} />
            : <button onClick={()=>setAddLec(true)} className="text-xs text-vida-blue font-semibold flex items-center gap-1 px-2 py-1.5 hover:bg-vida-blue/5 rounded-lg w-full"><Plus size={13}/> Agregar lección</button>}
        </div>
      )}
    </div>
  );
}

function LeccionRow({ leccion, onDel, onChange }) {
  const [edit, setEdit] = useState(false);
  const Icon = TIPOS_LECCION.find(t=>t.v===leccion.TipoLeccion)?.icon || Video;
  if (edit) return <LeccionForm leccion={leccion} onDone={()=>{ setEdit(false); onChange(); }} onCancel={()=>setEdit(false)} />;
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-sm">
      <Icon size={15} className="text-gray-400 shrink-0"/>
      <span className="flex-1 text-gray-700 truncate">{leccion.Titulo}</span>
      <span className="text-[10px] text-gray-300">{leccion.TipoLeccion} · {leccion.DuracionMin}m</span>
      <button onClick={()=>setEdit(true)} className="text-gray-300 hover:text-vida-blue p-1"><Pencil size={13}/></button>
      <button onClick={onDel} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={13}/></button>
    </div>
  );
}

function LeccionForm({ idModulo, leccion, onDone, onCancel }) {
  const toast = useToast();
  const editando = !!leccion;
  const [f, setF] = useState(leccion ? { ...leccion } : { Titulo:'', TipoLeccion:'VIDEO', VideoUrl:'', ArchivoUrl:'', Contenido:'', DuracionMin:5, QuizAprob:70, Orden:0 });
  const [quiz, setQuiz] = useState(leccion?.quiz?.map(p=>({ Texto:p.Texto, opciones:p.opciones?.map(o=>({ Texto:o.Texto, EsCorrecta:!!o.EsCorrecta }))||[] })) || []);
  const [guardando, setGuardando] = useState(false);
  const fileRef = useRef();
  function up(k,v){ setF(s=>({ ...s, [k]:v })); }

  async function guardar() {
    if (!f.Titulo.trim()) { toast.warning('Título requerido'); return; }
    setGuardando(true);
    try {
      let idLec = leccion?.idLeccion;
      if (editando) { await api.put(`/academia/admin/lecciones/${idLec}`, f); }
      else { const r = await api.post(`/academia/admin/modulos/${idModulo}/lecciones`, f); idLec = r.data.idLeccion; }
      // Subir archivo si hay
      if (fileRef.current?.files?.[0]) {
        const fd = new FormData(); fd.append('file', fileRef.current.files[0]);
        await api.post(`/academia/admin/lecciones/${idLec}/video`, fd, { headers:{ 'Content-Type':'multipart/form-data' } });
      }
      // Quiz
      if (f.TipoLeccion==='QUIZ') {
        await api.put(`/academia/admin/lecciones/${idLec}/quiz`, { preguntas: quiz });
      }
      toast.success('Lección guardada');
      onDone();
    } catch { toast.error('No se pudo guardar la lección'); }
    finally { setGuardando(false); }
  }

  return (
    <div className="border border-vida-blue/30 rounded-xl p-3 bg-vida-blue/5 space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={f.Titulo} onChange={e=>up('Titulo',e.target.value)} placeholder="Título de la lección" className="inp"/>
        <select value={f.TipoLeccion} onChange={e=>up('TipoLeccion',e.target.value)} className="inp">{TIPOS_LECCION.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}</select>
      </div>

      {f.TipoLeccion==='VIDEO' && (
        <>
          <input value={f.VideoUrl||''} onChange={e=>up('VideoUrl',e.target.value)} placeholder="Enlace YouTube/Vimeo (o sube un archivo abajo)" className="inp"/>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/ogg" className="text-xs"/>
            {f.ArchivoUrl && <span className="text-[10px] text-vida-green">archivo cargado ✓</span>}
          </div>
        </>
      )}
      {f.TipoLeccion==='PDF' && (
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="application/pdf" className="text-xs"/>
          {f.ArchivoUrl && <span className="text-[10px] text-vida-green">PDF cargado ✓</span>}
        </div>
      )}
      {f.TipoLeccion==='TEXTO' && (
        <textarea value={f.Contenido||''} onChange={e=>up('Contenido',e.target.value)} rows={4} placeholder="Contenido del artículo…" className="inp"/>
      )}
      {f.TipoLeccion==='QUIZ' && <QuizEditor quiz={quiz} setQuiz={setQuiz} aprob={f.QuizAprob} setAprob={v=>up('QuizAprob',v)} />}

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-400">Duración (min)<input type="number" value={f.DuracionMin} onChange={e=>up('DuracionMin',e.target.value)} className="inp"/></label>
        <label className="text-xs text-gray-400">Orden<input type="number" value={f.Orden} onChange={e=>up('Orden',e.target.value)} className="inp"/></label>
      </div>

      <div className="flex gap-2">
        <button onClick={guardar} disabled={guardando} className="bg-vida-blue text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 disabled:opacity-60"><Save size={13}/> {guardando?'Guardando…':'Guardar'}</button>
        <button onClick={onCancel} className="text-gray-500 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-100">Cancelar</button>
      </div>
    </div>
  );
}

function QuizEditor({ quiz, setQuiz, aprob, setAprob }) {
  function addPreg(){ setQuiz([...quiz, { Texto:'', opciones:[{Texto:'',EsCorrecta:true},{Texto:'',EsCorrecta:false}] }]); }
  function upPreg(i,k,v){ setQuiz(quiz.map((p,idx)=>idx===i?{...p,[k]:v}:p)); }
  function delPreg(i){ setQuiz(quiz.filter((_,idx)=>idx!==i)); }
  function addOpc(pi){ setQuiz(quiz.map((p,idx)=>idx===pi?{...p,opciones:[...p.opciones,{Texto:'',EsCorrecta:false}]}:p)); }
  function upOpc(pi,oi,k,v){ setQuiz(quiz.map((p,idx)=>{ if(idx!==pi) return p; const opciones=p.opciones.map((o,j)=>{ if(k==='EsCorrecta'&&v) return {...o,EsCorrecta:j===oi}; if(j===oi) return {...o,[k]:v}; return o;}); return {...p,opciones}; })); }
  function delOpc(pi,oi){ setQuiz(quiz.map((p,idx)=>idx===pi?{...p,opciones:p.opciones.filter((_,j)=>j!==oi)}:p)); }

  return (
    <div className="space-y-2 bg-white rounded-lg p-2 border border-gray-100">
      <label className="text-xs text-gray-400 flex items-center gap-2">% mínimo para aprobar
        <input type="number" value={aprob} onChange={e=>setAprob(e.target.value)} className="w-20 border border-gray-200 rounded px-2 py-1 text-sm"/></label>
      {quiz.map((p,pi)=>(
        <div key={pi} className="border border-gray-100 rounded-lg p-2 space-y-1.5">
          <div className="flex gap-1 items-center">
            <input value={p.Texto} onChange={e=>upPreg(pi,'Texto',e.target.value)} placeholder={`Pregunta ${pi+1}`} className="inp flex-1"/>
            <button onClick={()=>delPreg(pi)} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={13}/></button>
          </div>
          {p.opciones.map((o,oi)=>(
            <div key={oi} className="flex items-center gap-1.5 pl-3">
              <input type="radio" name={`correcta-${pi}`} checked={!!o.EsCorrecta} onChange={()=>upOpc(pi,oi,'EsCorrecta',true)} title="Correcta"/>
              <input value={o.Texto} onChange={e=>upOpc(pi,oi,'Texto',e.target.value)} placeholder={`Opción ${oi+1}`} className="inp flex-1"/>
              <button onClick={()=>delOpc(pi,oi)} className="text-gray-300 hover:text-red-500"><X size={13}/></button>
            </div>
          ))}
          <button onClick={()=>addOpc(pi)} className="text-[11px] text-vida-blue font-semibold pl-3">+ opción</button>
        </div>
      ))}
      <button onClick={addPreg} className="text-xs text-vida-green font-semibold flex items-center gap-1"><Plus size={13}/> Pregunta</button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ANALÍTICA
// ════════════════════════════════════════════════════════════════════════════
export function Analitica() {
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [detalle, setDetalle] = useState(null); // idCurso

  useEffect(() => {
    (async () => {
      try { const r = await api.get('/academia/admin/analitica'); setData(r.data); }
      catch {} finally { setCargando(false); }
    })();
  }, []);

  if (cargando) return <p className="text-center text-gray-400 py-10 text-sm">Cargando analítica…</p>;
  if (!data) return <p className="text-center text-gray-400 py-10 text-sm">Sin datos.</p>;

  return (
    <div className="p-6 space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <MiniStat valor={data.totales.usuarios} label="Usuarios" color="#0A1E3F"/>
        <MiniStat valor={data.totales.cursos} label="Cursos activos" color="#54C4E0"/>
        <MiniStat valor={data.totales.obligatorios} label="Obligatorios" color="#E0574C"/>
        <MiniStat valor={data.totales.completaciones} label="Completaciones" color="#5BBE6A"/>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-400 text-xs">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">Curso</th>
              <th className="text-center px-4 py-2 font-semibold">Inscritos</th>
              <th className="text-center px-4 py-2 font-semibold">Completaron</th>
              <th className="text-center px-4 py-2 font-semibold">% avance</th>
              <th className="text-center px-4 py-2 font-semibold">Menor tiempo</th>
              <th className="text-center px-4 py-2 font-semibold">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.cursos.map(c => (
              <tr key={c.idCurso} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-4 py-2.5">
                  <p className="font-semibold text-gray-800">{c.Titulo}</p>
                  {c.Obligatorio ? <span className="text-[10px] text-amber-600 font-bold">Obligatorio{c.FechaLimite?` · límite ${new Date(c.FechaLimite).toLocaleDateString('es-VE')}`:''}</span> : null}
                </td>
                <td className="px-4 py-2.5 text-center text-gray-600">{c.Inscritos}</td>
                <td className="px-4 py-2.5 text-center text-gray-600">{c.Completaron}</td>
                <td className="px-4 py-2.5 text-center">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-vida-green" style={{width:`${c.PctCompletado}%`}}/></div>
                    <span className="text-xs text-gray-500 w-9 text-right">{c.PctCompletado}%</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-center text-gray-600">{fmtSeg(c.MenorTiempoSeg)}</td>
                <td className="px-4 py-2.5 text-center">
                  {c.Vencido ? <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 justify-center"><AlertTriangle size={10}/> Vencido</span> : <span className="text-[10px] text-gray-400">—</span>}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={()=>setDetalle(c.idCurso)} className="text-xs text-vida-blue font-semibold flex items-center gap-1"><Eye size={13}/> Ver</button>
                </td>
              </tr>
            ))}
            {data.cursos.length===0 && <tr><td colSpan={7} className="text-center text-gray-400 py-8">Sin cursos.</td></tr>}
          </tbody>
        </table>
      </div>

      {detalle != null && <AnaliticaCurso idCurso={detalle} onClose={()=>setDetalle(null)} />}
    </div>
  );
}

function MiniStat({ valor, label, color }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-2xl font-black" style={{ color }}>{valor}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

function AnaliticaCurso({ idCurso, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    (async () => { try { const r = await api.get(`/academia/admin/analitica/curso/${idCurso}`); setData(r.data); } catch {} })();
  }, [idCurso]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col">
        <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between">
          <p className="font-black text-gray-800">{data?.curso?.Titulo || 'Curso'} — por usuario</p>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><X size={20}/></button>
        </div>
        <div className="overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-400 text-xs sticky top-0">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Usuario</th>
                <th className="text-center px-4 py-2 font-semibold">Avance</th>
                <th className="text-center px-4 py-2 font-semibold">Tiempo</th>
                <th className="text-center px-4 py-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(data?.usuarios||[]).map(u => (
                <tr key={u.idUsuario} className="border-t border-gray-50">
                  <td className="px-4 py-2">
                    <p className="text-gray-700">{u.Nombre || `Usuario ${u.idUsuario}`}</p>
                    <span className="text-[10px] text-gray-400">{u.TipoUsuario}</span>
                  </td>
                  <td className="px-4 py-2 text-center text-gray-600">{u.Hechas}/{u.Total} ({u.ProgresoPct}%)</td>
                  <td className="px-4 py-2 text-center text-gray-600">{fmtSeg(u.TiempoSeg)}</td>
                  <td className="px-4 py-2 text-center">
                    {u.Completado ? <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">Completado</span>
                      : u.FueraDeTiempo ? <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">Fuera de tiempo</span>
                      : <span className="text-[10px] text-gray-400">En curso</span>}
                  </td>
                </tr>
              ))}
              {(!data || data.usuarios?.length===0) && <tr><td colSpan={4} className="text-center text-gray-400 py-6">Sin usuarios.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function fmtSeg(s) {
  if (s == null) return '—';
  const m = Math.floor(s/60), sec = s%60;
  if (m >= 60) { const h=Math.floor(m/60); return `${h}h ${m%60}m`; }
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}
