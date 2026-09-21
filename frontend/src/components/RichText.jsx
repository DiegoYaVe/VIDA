// src/components/RichText.jsx
// Editor de texto enriquecido open-source (Quill, sin API key). Guarda HTML.
// El HTML se sanitiza al RENDERIZARLO en el visor (con DOMPurify), no aquí.
import { useEffect, useRef } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

const TOOLBAR = [
  [{ header: [2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['blockquote', 'code-block', 'link'],
  ['clean'],
];

export default function RichText({ value = '', onChange, placeholder = 'Escribe el contenido…' }) {
  const holder = useRef(null);
  const quillRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (quillRef.current || !holder.current) return;
    const q = new Quill(holder.current, {
      theme: 'snow',
      placeholder,
      modules: { toolbar: TOOLBAR },
    });
    quillRef.current = q;
    if (value) q.clipboard.dangerouslyPasteHTML(value);
    q.on('text-change', () => {
      const html = q.root.innerHTML;
      onChangeRef.current?.(html === '<p><br></p>' ? '' : html);
    });
  }, []); // eslint-disable-line

  // Sincroniza si el valor externo cambia y difiere del contenido actual
  // (p.ej. al abrir el editor de otra lección con el mismo componente montado).
  useEffect(() => {
    const q = quillRef.current;
    if (!q) return;
    const actual = q.root.innerHTML;
    const nuevo = value || '';
    if (nuevo !== actual && !(nuevo === '' && actual === '<p><br></p>')) {
      const sel = q.getSelection();
      q.clipboard.dangerouslyPasteHTML(nuevo || '<p><br></p>');
      if (sel) { try { q.setSelection(sel); } catch { /* noop */ } }
    }
  }, [value]);

  return (
    <div className="rich-text bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div ref={holder} style={{ minHeight: 160 }} />
    </div>
  );
}
