// src/pages/Constancia.jsx
// Vista imprimible de una constancia de Academia VIDA (folio + QR de
// verificación). Se abre en una pestaña nueva desde la Academia y trae su
// propio botón de imprimir. Requiere sesión (usa el token del panel).
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, ShieldCheck, AlertCircle } from 'lucide-react';
import api from '../services/api.js';

export default function Constancia() {
  const { folio } = useParams();
  const [d, setD] = useState(null);
  const [error, setError] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await api.get(`/academia/constancia/${encodeURIComponent(folio)}`);
        if (vivo) setD(r.data);
      } catch { if (vivo) setError(true); }
      finally { if (vivo) setCargando(false); }
    })();
    return () => { vivo = false; };
  }, [folio]);

  if (cargando) return <div className="min-h-screen flex items-center justify-center text-gray-400">Cargando constancia…</div>;
  if (error || !d) return (
    <div className="min-h-screen flex flex-col items-center justify-center text-gray-500 gap-2">
      <AlertCircle size={40} className="text-red-400" />
      <p>Constancia no encontrada o folio inválido.</p>
    </div>
  );

  const fecha = d.FechaEmision ? new Date(d.FechaEmision).toLocaleDateString('es-VE', { day:'2-digit', month:'long', year:'numeric' }) : '';

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:p-0">
      <style>{`@media print { .no-print { display:none !important; } @page { size: landscape; margin: 12mm; } }`}</style>

      <div className="max-w-3xl mx-auto mb-4 flex justify-end no-print">
        <button onClick={() => window.print()} className="flex items-center gap-2 bg-vida-blue text-white px-4 py-2 rounded-xl font-semibold hover:opacity-90">
          <Printer size={16} /> Imprimir / Guardar PDF
        </button>
      </div>

      {/* Lámina */}
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-lg print:shadow-none overflow-hidden">
        <div className="h-3" style={{ background: 'linear-gradient(90deg,#54C4E0,#5BBE6A)' }} />
        <div className="p-10 text-center relative" style={{ border: '2px solid #0A1E3F', margin: 16, borderRadius: 16 }}>
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#54C4E0,#5BBE6A)' }}>
              <span className="text-white font-black text-lg">V</span>
            </div>
            <span className="font-black text-vida-blue text-lg tracking-wide">ACADEMIA VIDA</span>
          </div>
          <p className="text-xs uppercase tracking-[0.3em] text-gray-400 mt-4">Constancia de finalización</p>
          <p className="text-gray-500 mt-6 text-sm">Se otorga la presente constancia a</p>
          <h1 className="text-3xl font-black text-vida-blue mt-2">{d.NombreUsuario}</h1>
          <p className="text-gray-500 mt-4 text-sm">por haber completado satisfactoriamente el curso</p>
          <h2 className="text-xl font-bold text-gray-800 mt-2">“{d.TituloCurso}”</h2>

          <div className="flex items-end justify-between mt-10">
            <div className="text-left">
              <p className="text-xs text-gray-400">Fecha de emisión</p>
              <p className="text-sm font-semibold text-gray-700">{fecha}</p>
              <p className="text-xs text-gray-400 mt-3">Folio de verificación</p>
              <p className="text-sm font-mono font-semibold text-vida-blue">{d.Folio}</p>
            </div>
            <div className="text-center">
              {d.qrDataUrl ? <img src={d.qrDataUrl} alt="QR de verificación" className="w-28 h-28 mx-auto" /> : null}
              <p className="text-[10px] text-gray-400 mt-1 flex items-center justify-center gap-1"><ShieldCheck size={11} /> Verificable por QR</p>
            </div>
          </div>
        </div>
        <div className="h-3" style={{ background: 'linear-gradient(90deg,#5BBE6A,#54C4E0)' }} />
      </div>
    </div>
  );
}
