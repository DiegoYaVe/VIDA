// src/components/Layout.jsx
// En computadora: barra lateral + contenido. En teléfono (< 768 px) la barra
// lateral no cabe: se esconde y se abre como menú desde el botón de la barra
// superior.
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar.jsx';

export default function Layout({ children }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const { pathname } = useLocation();
  // Al cambiar de pantalla el menú del teléfono se cierra solo
  useEffect(() => { setMenuAbierto(false); }, [pathname]);

  return (
    // 100dvh: en el teléfono la barra de direcciones aparece y desaparece; con
    // h-screen el final de la pantalla quedaba tapado.
    <div className="flex h-screen h-[100dvh] overflow-hidden bg-gray-50">
      <Sidebar abiertoMovil={menuAbierto} onCerrarMovil={() => setMenuAbierto(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden flex items-center gap-3 h-14 px-3 bg-white border-b border-gray-100 shrink-0">
          <button onClick={() => setMenuAbierto(true)} aria-label="Abrir menú" aria-expanded={menuAbierto}
            className="w-10 h-10 -ml-1 rounded-xl flex items-center justify-center text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-vida-blue">
            <Menu size={22} />
          </button>
          <img src="/logo-sidebar.png" alt="Comercializadora VIDA" className="h-8 w-auto object-contain"
            onError={e => { e.target.src = '/logo-simbolo.png'; }} />
        </header>
        {/* El área de contenido hace scroll por sí misma: antes era overflow-hidden y
            cada pantalla debía crear su propia zona con scroll; las que no lo hacían
            (Pedidos, Inventario, Proveedores, Ventas, Cuentas) no bajaban con el mouse.
            overflow-x-hidden: lo ancho (tablas) se desplaza dentro de su propio contenedor. */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
