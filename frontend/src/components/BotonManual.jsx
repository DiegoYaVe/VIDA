// src/components/BotonManual.jsx
// Enlace al manual en PDF de una pantalla (los PDF viven en public/manuales y
// se generan con docs/manuales/generar-pdf.mjs).
import { BookOpen } from 'lucide-react';

export const MANUAL_PLUS_ESTRELLA = '/manuales/manual-plus-estrella.pdf';

export default function BotonManual({ href = MANUAL_PLUS_ESTRELLA, texto = 'Manual PLUS y Estrella' }) {
  return (
    <div className="flex justify-end">
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-vida-blue hover:bg-vida-blue-light">
        <BookOpen size={15} /> {texto} <span className="text-[10px] font-black text-gray-400">PDF</span>
      </a>
    </div>
  );
}
