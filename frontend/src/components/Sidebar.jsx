// src/components/Sidebar.jsx
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { LogOut, ChevronRight } from 'lucide-react';
import * as Icons from 'lucide-react';
import { portalDeUsuario, PORTAL_LABEL, PORTAL_BADGE } from '../config/portales.js';

// Mapeo de nombre de ícono (string de BD) → componente Lucide
function DynamicIcon({ name, size = 18 }) {
  const Icon = Icons[name] || Icons.Circle;
  return <Icon size={size} />;
}

function Avatar({ nombre, apellidos, imagen }) {
  if (imagen) return (
    <img src={imagen} alt={nombre}
      className="w-9 h-9 rounded-full object-cover border-2 border-white shadow" />
  );
  const initials = `${nombre?.[0] || ''}${apellidos?.[0] || ''}`.toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-vida-aqua to-vida-green
                    flex items-center justify-center text-white font-bold text-sm shadow">
      {initials}
    </div>
  );
}

export default function Sidebar() {
  const { usuario, pantallas, logout } = useAuthStore();
  const navigate = useNavigate();
  const portal = portalDeUsuario(usuario);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-gray-100 flex flex-col h-screen sticky top-0">

      {/* Logo */}
      <div className="px-4 py-3 border-b border-gray-100">
        <img
          src="/logo-sidebar.png"
          alt="Comercializadora VIDA"
          className="h-14 w-auto object-contain"
          onError={e => {
            // Fallback si no está el archivo de imagen
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'flex';
          }}
        />
        {/* Fallback texto (se muestra si no hay imagen) */}
        <div className="items-center gap-3 hidden">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #54C4E0, #5BBE6A)' }}>
            <span className="text-white font-black text-lg">V</span>
          </div>
          <div>
            <p className="text-gray-400 text-[10px] font-bold tracking-widest uppercase leading-none">Comercializadora</p>
            <p className="font-black text-vida-green text-lg leading-tight">VIDA</p>
          </div>
        </div>
      </div>

      {/* Portal actual */}
      {portal && (
        <div className="px-4 pt-3 pb-1">
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${PORTAL_BADGE[portal] || 'bg-gray-100 text-gray-600'}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
            Portal {PORTAL_LABEL[portal] || portal}
          </span>
        </div>
      )}

      {/* Navegación dinámica desde BD */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {pantallas.map(p => (
          <NavLink
            key={p.idPantalla}
            to={p.Link}
            className={({ isActive }) =>
              `sidebar-item ${isActive ? 'active' : ''}`
            }
          >
            <DynamicIcon name={p.Icono} size={18} />
            <span className="flex-1">{p.Nombre}</span>
            <ChevronRight size={14} className="opacity-40" />
          </NavLink>
        ))}
      </nav>

      {/* Usuario */}
      <div className="p-4 border-t border-gray-100">
        <NavLink to="/perfil" className="flex items-center gap-3 mb-3 hover:bg-gray-50 rounded-xl p-2 transition-colors cursor-pointer">
          <Avatar nombre={usuario?.Nombre} apellidos={usuario?.Apellidos} />
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-800 truncate">{usuario?.Nombre} {usuario?.Apellidos}</p>
            <p className="text-xs text-gray-400 truncate">Rol: {usuario?.TipoUsuario}</p>
          </div>
        </NavLink>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-2 text-sm text-gray-500 hover:text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg transition-all font-semibold">
          <LogOut size={15} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
