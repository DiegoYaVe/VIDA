// src/components/Layout.jsx
import Sidebar from './Sidebar.jsx';

export default function Layout({ children }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      {/* El área de contenido hace scroll por sí misma: antes era overflow-hidden y
          cada pantalla debía crear su propia zona con scroll; las que no lo hacían
          (Pedidos, Inventario, Proveedores, Ventas, Cuentas) no bajaban con el mouse.
          overflow-x-hidden: lo ancho (tablas) se desplaza dentro de su propio contenedor. */}
      <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden flex flex-col">
        {children}
      </main>
    </div>
  );
}
