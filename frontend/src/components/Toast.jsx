// src/components/Toast.jsx
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// ── Store global de toasts ─────────────────────────────────────────────────
export const useToastStore = create((set) => ({
  toasts: [],
  push: (toast) => set((s) => ({
    toasts: [...s.toasts, { id: Date.now() + Math.random(), ...toast }],
  })),
  remove: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));

// ── Hook de conveniencia ───────────────────────────────────────────────────
export function useToast() {
  const push = useToastStore(s => s.push);
  return {
    success: (msg, detail) => push({ type: 'success', msg, detail }),
    error:   (msg, detail) => push({ type: 'error',   msg, detail }),
    warning: (msg, detail) => push({ type: 'warning', msg, detail }),
    info:    (msg, detail) => push({ type: 'info',    msg, detail }),
  };
}

// ── Config visual por tipo ─────────────────────────────────────────────────
const CFG = {
  success: {
    icon:  CheckCircle,
    bar:   'bg-vida-green',
    ring:  'ring-green-200',
    bg:    'bg-white',
    icon_color: 'text-vida-green',
    title_color: 'text-green-800',
  },
  error: {
    icon:  XCircle,
    bar:   'bg-red-500',
    ring:  'ring-red-200',
    bg:    'bg-white',
    icon_color: 'text-red-500',
    title_color: 'text-red-800',
  },
  warning: {
    icon:  AlertTriangle,
    bar:   'bg-yellow-400',
    ring:  'ring-yellow-200',
    bg:    'bg-white',
    icon_color: 'text-yellow-500',
    title_color: 'text-yellow-800',
  },
  info: {
    icon:  Info,
    bar:   'bg-vida-blue',
    ring:  'ring-blue-200',
    bg:    'bg-white',
    icon_color: 'text-vida-blue',
    title_color: 'text-blue-800',
  },
};

const DURATION = 3500; // ms

// ── Toast individual ───────────────────────────────────────────────────────
function ToastItem({ toast }) {
  const remove  = useToastStore(s => s.remove);
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const cfg = CFG[toast.type] || CFG.info;
  const Icon = cfg.icon;

  useEffect(() => {
    // Entrada
    requestAnimationFrame(() => setVisible(true));

    // Auto-cerrar
    const t1 = setTimeout(() => {
      setLeaving(true);
      setTimeout(() => remove(toast.id), 350);
    }, DURATION);

    return () => clearTimeout(t1);
  }, [toast.id, remove]);

  function cerrar() {
    setLeaving(true);
    setTimeout(() => remove(toast.id), 350);
  }

  return (
    <div
      onClick={cerrar}
      className={`
        relative flex items-start gap-3 w-80 cursor-pointer select-none
        rounded-2xl shadow-lg ring-1 overflow-hidden px-4 py-3
        transition-all duration-350 ease-in-out
        ${cfg.bg} ${cfg.ring}
        ${visible && !leaving
          ? 'opacity-100 translate-x-0'
          : 'opacity-0 translate-x-12'}
      `}
      style={{ transitionDuration: '350ms' }}
    >
      {/* Barra de color izquierda */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.bar} rounded-l-2xl`}/>

      {/* Ícono */}
      <div className={`shrink-0 mt-0.5 ${cfg.icon_color}`}>
        <Icon size={20}/>
      </div>

      {/* Texto */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold leading-tight ${cfg.title_color}`}>{toast.msg}</p>
        {toast.detail && (
          <p className="text-xs text-gray-400 mt-0.5 leading-tight">{toast.detail}</p>
        )}
      </div>

      {/* Cerrar */}
      <button onClick={e => { e.stopPropagation(); cerrar(); }}
        className="shrink-0 text-gray-300 hover:text-gray-500 mt-0.5 transition-colors">
        <X size={14}/>
      </button>

      {/* Barra de progreso */}
      <div className={`absolute bottom-0 left-0 h-0.5 ${cfg.bar} opacity-30`}
        style={{
          width: '100%',
          animation: `shrink ${DURATION}ms linear forwards`,
        }}
      />

      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  );
}

// ── Contenedor global (va en App.jsx) ─────────────────────────────────────
export function ToastContainer() {
  const toasts = useToastStore(s => s.toasts);

  return (
    <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t}/>
        </div>
      ))}
    </div>
  );
}
