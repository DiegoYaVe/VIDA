// src/components/Sidebar.jsx
// Barra lateral del panel. Se colapsa a un riel de íconos (con nombre al pasar
// el mouse) para dar espacio a la pantalla: botón en el borde o Ctrl+B. La
// preferencia se recuerda en este navegador; en pantallas angostas arranca
// colapsada.
import { useState, useEffect, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { LogOut, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import * as Icons from 'lucide-react';
import { portalDeUsuario, PORTAL_LABEL, PORTAL_BADGE } from '../config/portales.js';

const CLAVE = 'vida_sidebar_colapsada';

function leerPreferencia() {
  try {
    const v = localStorage.getItem(CLAVE);
    if (v != null) return v === '1';
  } catch { /* sin almacenamiento: se usa el ancho */ }
  return typeof window !== 'undefined' && window.innerWidth < 1280;
}

// Mapeo de nombre de ícono (string de BD) → componente Lucide
function DynamicIcon({ name, size = 18 }) {
  const Icon = Icons[name] || Icons.Circle;
  return <Icon size={size} />;
}

function Avatar({ nombre, apellidos, imagen }) {
  if (imagen) return (
    <img src={imagen} alt={nombre}
      className="w-9 h-9 rounded-full object-cover border-2 border-white shadow shrink-0" />
  );
  const initials = `${nombre?.[0] || ''}${apellidos?.[0] || ''}`.toUpperCase();
  return (
    <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-vida-aqua to-vida-green
                    flex items-center justify-center text-white font-bold text-sm shadow">
      {initials}
    </div>
  );
}

// Nombre flotante a la derecha del riel. Va con position:fixed para que no lo
// recorte el scroll del menú.
function Tooltip({ texto, visible, children }) {
  const [pos, setPos] = useState(null);
  const mostrar = (e) => {
    if (!visible) return;
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ top: r.top + r.height / 2, left: r.right + 12 });
  };
  return (
    <div onMouseEnter={mostrar} onMouseLeave={() => setPos(null)} onFocus={mostrar} onBlur={() => setPos(null)}>
      {children}
      {visible && pos && (
        <div role="tooltip" className="fixed z-[100] -translate-y-1/2 pointer-events-none" style={{ top: pos.top, left: pos.left }}>
          <div className="relative bg-gray-900 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
            {texto}
            <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45" />
          </div>
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const { usuario, pantallas, logout } = useAuthStore();
  const navigate = useNavigate();
  const portal = portalDeUsuario(usuario);
  const [colapsada, setColapsada] = useState(leerPreferencia);

  const alternar = useCallback(() => {
    setColapsada((c) => {
      try { localStorage.setItem(CLAVE, c ? '0' : '1'); } catch { /* opcional */ }
      return !c;
    });
  }, []);

  // Atajo: Ctrl+B (⌘+B en Mac)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        alternar();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [alternar]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const etiqueta = `transition-[opacity,width] duration-200 whitespace-nowrap overflow-hidden ${colapsada ? 'opacity-0 w-0' : 'opacity-100'}`;

  return (
    <aside
      className={`shrink-0 bg-white border-r border-gray-100 flex flex-col h-screen sticky top-0 z-30
                  transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${colapsada ? 'w-[76px]' : 'w-64'}`}
      aria-label="Menú principal">

      {/* Botón para colapsar / expandir, sobre el borde */}
      <button onClick={alternar}
        className="absolute -right-3.5 top-[74px] z-40 w-7 h-7 rounded-full bg-white border border-gray-200 shadow-md
                   flex items-center justify-center text-gray-500 hover:text-vida-blue hover:border-vida-blue hover:scale-110
                   transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-vida-blue"
        title={colapsada ? 'Expandir menú (Ctrl+B)' : 'Colapsar menú (Ctrl+B)'}
        aria-label={colapsada ? 'Expandir menú' : 'Colapsar menú'} aria-expanded={!colapsada}>
        {colapsada ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
      </button>

      {/* Logo: completo o el símbolo de la gota */}
      <div className={`border-b border-gray-100 h-[86px] flex items-center overflow-hidden transition-[padding] duration-300 ${colapsada ? 'px-0 justify-center' : 'px-4'}`}>
        {colapsada ? (
          <img src="/logo-simbolo.png" alt="Comercializadora VIDA" className="h-11 w-auto object-contain" />
        ) : (
          <img src="/logo-sidebar.png" alt="Comercializadora VIDA" className="h-14 w-auto object-contain"
            onError={e => { e.target.src = '/logo-simbolo.png'; }} />
        )}
      </div>

      {/* Portal actual: en el riel queda como un punto de color */}
      {portal && (
        <div className={`pt-3 pb-1 ${colapsada ? 'flex justify-center' : 'px-4'}`}>
          <Tooltip texto={`Portal ${PORTAL_LABEL[portal] || portal}`} visible={colapsada}>
            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide rounded-full
                              ${colapsada ? 'p-1.5' : 'px-2.5 py-1'} ${PORTAL_BADGE[portal] || 'bg-gray-100 text-gray-600'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
              {!colapsada && <>Portal {PORTAL_LABEL[portal] || portal}</>}
            </span>
          </Tooltip>
        </div>
      )}

      {/* Navegación dinámica desde BD */}
      <nav className={`flex-1 overflow-y-auto overflow-x-hidden space-y-1 transition-[padding] duration-300 ${colapsada ? 'px-3 py-3' : 'p-3'}`}>
        {pantallas.map(p => (
          <Tooltip key={p.idPantalla} texto={p.Nombre} visible={colapsada}>
            <NavLink
              to={p.Link}
              aria-label={colapsada ? p.Nombre : undefined}
              className={({ isActive }) =>
                `sidebar-item ${isActive ? 'active' : ''} ${colapsada ? '!px-0 justify-center !gap-0 h-11' : ''}`
              }
            >
              <span className="shrink-0"><DynamicIcon name={p.Icono} size={colapsada ? 20 : 18} /></span>
              <span className={`flex-1 ${etiqueta}`}>{p.Nombre}</span>
              {!colapsada && <ChevronRight size={14} className="opacity-40 shrink-0" />}
            </NavLink>
          </Tooltip>
        ))}
      </nav>

      {/* Usuario */}
      <div className={`border-t border-gray-100 transition-[padding] duration-300 ${colapsada ? 'px-3 py-3' : 'p-4'}`}>
        <Tooltip texto={`${usuario?.Nombre || ''} ${usuario?.Apellidos || ''} · ${usuario?.TipoUsuario || ''}`} visible={colapsada}>
          <NavLink to="/perfil"
            className={`flex items-center gap-3 mb-2 hover:bg-gray-50 rounded-xl p-2 transition-colors cursor-pointer ${colapsada ? 'justify-center' : ''}`}>
            <Avatar nombre={usuario?.Nombre} apellidos={usuario?.Apellidos} imagen={usuario?.ImagenUsuario} />
            <div className={`min-w-0 ${etiqueta}`}>
              <p className="text-sm font-bold text-gray-800 truncate">{usuario?.Nombre} {usuario?.Apellidos}</p>
              <p className="text-xs text-gray-400 truncate">Rol: {usuario?.TipoUsuario}</p>
            </div>
          </NavLink>
        </Tooltip>
        <Tooltip texto="Cerrar sesión" visible={colapsada}>
          <button onClick={handleLogout} aria-label="Cerrar sesión"
            className={`w-full flex items-center gap-2 text-sm text-gray-500 hover:text-red-500 hover:bg-red-50 py-2 rounded-lg transition-all font-semibold
                        ${colapsada ? 'justify-center px-0' : 'px-3'}`}>
            <LogOut size={colapsada ? 17 : 15} className="shrink-0" />
            <span className={etiqueta}>Cerrar sesión</span>
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
