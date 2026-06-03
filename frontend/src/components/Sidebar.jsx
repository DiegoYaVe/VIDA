// src/components/Sidebar.jsx
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { LogOut, ChevronRight } from 'lucide-react';
import * as Icons from 'lucide-react';

// Mapeo de nombre de ícono (string de BD) → componente Lucide
function DynamicIcon({ name, size = 18 }) {
  const Icon = Icons[name] || Icons.Circle;
  return <Icon size={size} />;
}

export default function Sidebar() {
  const { usuario, pantallas, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-gray-100 flex flex-col h-screen sticky top-0">

      {/* Logo */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #1A6A9A, #27AE60)' }}>
            <span className="text-white font-black text-lg">V</span>
          </div>
          <div>
            <p className="text-gray-400 text-[10px] font-bold tracking-widest uppercase leading-none">Comercializadora</p>
            <p className="font-black text-vida-green text-lg leading-tight">VIDA</p>
          </div>
        </div>
      </div>

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
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-vida-green flex items-center justify-center text-white font-bold text-sm shrink-0">
            {usuario?.Nombre?.[0]}{usuario?.Apellidos?.[0]}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-800 truncate">{usuario?.Nombre} {usuario?.Apellidos}</p>
            <p className="text-xs text-gray-400 truncate">Rol: {usuario?.TipoUsuario}</p>
          </div>
        </div>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-2 text-sm text-gray-500 hover:text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg transition-all font-semibold">
          <LogOut size={15} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
