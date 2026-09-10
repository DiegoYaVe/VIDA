// src/pages/Academia.jsx
// Academia VIDA — capacitación del empresario. Cursos/videos; al completar
// suma puntos de academia. (T-Club Vida empresario)
import { useState, useEffect, useCallback } from 'react';
import {
  GraduationCap, PlayCircle, CheckCircle2, Clock, Star, Award, RefreshCw,
} from 'lucide-react';
import api from '../services/api.js';

const CAT_COLOR = {
  Ventas: '#5BBE6A', Servicio: '#54C4E0', Marketing: '#7B3FBE', Finanzas: '#0A1E3F',
};

export default function Academia() {
  const [cursos, setCursos]     = useState([]);
  const [resumen, setResumen]   = useState({ total: 0, completados: 0, puntos: 0 });
  const [cargando, setCargando] = useState(true);
  const [proc, setProc]         = useState(null); // idCurso en proceso

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await api.get('/academia/cursos');
      setCursos(r.data?.cursos || []);
      setResumen(r.data?.resumen || { total: 0, completados: 0, puntos: 0 });
    } catch { setCursos([]); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function completar(c) {
    setProc(c.idCurso);
    try {
      if (c.VideoUrl) window.open(c.VideoUrl, '_blank', 'noopener');
      const r = await api.post(`/academia/cursos/${c.idCurso}/completar`);
      setResumen(r.data?.resumen || resumen);
      setCursos(prev => prev.map(x => x.idCurso === c.idCurso ? { ...x, Completado: true } : x));
    } catch {} finally { setProc(null); }
  }

  const pct = resumen.total > 0 ? Math.round((resumen.completados / resumen.total) * 100) : 0;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <GraduationCap size={22} className="text-vida-blue" /> Academia VIDA
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Capacítate y gana puntos como empresario VIDA</p>
        </div>
        <button onClick={cargar} className="flex items-center gap-2 text-sm text-gray-500 hover:text-vida-blue border border-gray-200 px-3 py-2 rounded-xl">
          <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="p-6 space-y-5">
        {/* Resumen */}
        <div className="bg-vida-blue rounded-2xl p-5 text-white flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center"><Award size={24} /></div>
            <div>
              <p className="text-2xl font-black">{resumen.puntos.toLocaleString('es-VE')} pts</p>
              <p className="text-xs opacity-80">Puntos de Academia</p>
            </div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="flex justify-between text-xs opacity-90 mb-1">
              <span>Progreso</span><span>{resumen.completados}/{resumen.total} cursos</span>
            </div>
            <div className="h-2.5 bg-white/25 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        {/* Cursos */}
        {cargando ? (
          <p className="text-center text-gray-400 py-10 text-sm">Cargando cursos…</p>
        ) : cursos.length === 0 ? (
          <div className="text-center text-gray-400 py-16">
            <GraduationCap size={44} className="mx-auto mb-3 opacity-20" />
            <p>Aún no hay cursos publicados.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cursos.map(c => {
              const color = CAT_COLOR[c.Categoria] || '#0A1E3F';
              return (
                <div key={c.idCurso} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                  <div className="h-28 flex items-center justify-center relative" style={{ background: `${color}14` }}>
                    <PlayCircle size={44} style={{ color }} />
                    {c.Completado ? (
                      <span className="absolute top-2 right-2 flex items-center gap-1 bg-vida-green text-white text-[11px] font-bold px-2 py-0.5 rounded-lg">
                        <CheckCircle2 size={12} /> Completado
                      </span>
                    ) : null}
                    {c.Categoria ? (
                      <span className="absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-lg text-white" style={{ backgroundColor: color }}>{c.Categoria}</span>
                    ) : null}
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <p className="font-bold text-gray-800 text-sm">{c.Titulo}</p>
                    <p className="text-xs text-gray-400 mt-1 flex-1">{c.Descripcion}</p>
                    <div className="flex items-center gap-3 mt-3 text-[11px] text-gray-400">
                      <span className="flex items-center gap-1"><Clock size={12} /> {c.DuracionMin} min</span>
                      <span className="flex items-center gap-1"><Star size={12} /> {c.Puntos} pts</span>
                    </div>
                    <button
                      onClick={() => completar(c)}
                      disabled={proc === c.idCurso || c.Completado}
                      className={`mt-3 w-full rounded-xl px-3 py-2 text-sm font-semibold transition disabled:opacity-60
                        ${c.Completado ? 'bg-gray-100 text-gray-400' : 'bg-vida-blue text-white hover:opacity-90'}`}>
                      {c.Completado ? 'Completado ✓' : proc === c.idCurso ? 'Guardando…' : (c.VideoUrl ? 'Ver y completar' : 'Marcar como completado')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
