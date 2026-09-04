// src/App.jsx
import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore.js';
import Login     from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Usuarios  from './pages/Usuarios.jsx';
import Activar   from './pages/Activar.jsx';
import Layout    from './components/Layout.jsx';
import CambiarPassword from './pages/CambiarPassword.jsx';
import Perfil      from './pages/Perfil.jsx';
import Inventario   from './pages/Inventario.jsx';
import Proveedores  from './pages/Proveedores.jsx';
import Pedidos      from './pages/Pedidos.jsx';
import POS          from './pages/POS.jsx';
import Sucursales   from './pages/Sucursales.jsx';
import Ventas       from './pages/Ventas.jsx';
import Reportes     from './pages/Reportes.jsx';
import CierreCaja   from './pages/CierreCaja.jsx';
import Logistica    from './pages/Logistica.jsx';
import Clientes      from './pages/Clientes.jsx';
import Precios       from './pages/Precios.jsx';
import Matriz        from './pages/Matriz.jsx';
import Corporativo   from './pages/Corporativo.jsx';
import Catalogos     from './pages/Catalogos.jsx';
import Tienda        from './pages/Tienda.jsx';
import { ToastContainer } from './components/Toast.jsx';

function ProtectedRoute({ children, skipCambiarPass = false, modulo = null }) {
  const { accessToken, usuario, pantallas } = useAuthStore();
  if (!accessToken) return <Navigate to="/login" replace />;
  if (!skipCambiarPass && usuario?.CambiarPass) {
    return <Navigate to="/cambiar-password" replace />;
  }
  // Ruteo por rol/portal (T-0032): si la ruta es un módulo con pantalla,
  // el usuario solo entra si su rol tiene acceso a esa pantalla. Evita que
  // alguien navegue por URL a un módulo fuera de su portal.
  if (modulo && Array.isArray(pantallas) && pantallas.length > 0) {
    const tieneAcceso = pantallas.some(p => p.Link === modulo);
    if (!tieneAcceso) return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function PublicRoute({ children }) {
  const { accessToken, usuario } = useAuthStore();
  if (accessToken) {
    if (usuario?.CambiarPass) return <Navigate to="/cambiar-password" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function ComingSoon({ nombre }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <p className="text-6xl mb-4">🚧</p>
        <h2 className="text-xl font-black text-gray-700">{nombre}</h2>
        <p className="text-gray-400 text-sm mt-2">Este módulo se desarrollará próximamente</p>
      </div>
    </div>
  );
}

export default function App() {
  const [checking, setChecking] = useState(true);
  const { refreshSession } = useAuthStore();

  useEffect(() => {
    const stored = localStorage.getItem('pos_refresh');
    if (!stored) {
      setChecking(false);
      return;
    }
    refreshSession().finally(() => setChecking(false));
  }, []);

  if (checking) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #54C4E0, #5BBE6A)' }}>
          <span className="text-white font-black text-xl">V</span>
        </div>
        <svg className="animate-spin h-6 w-6 text-vida-green mx-auto" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    </div>
  );

  return (
    <BrowserRouter>
      <ToastContainer />
      <Routes>
        <Route path="/login"   element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/activar" element={<Activar />} />

        {/* Publica y sin sesion: la abre quien escanea el QR de un flyer.
            No va dentro de PublicRoute porque un empresario logueado tambien
            tiene que poder abrir el enlace para revisar como se ve. */}
        <Route path="/t/:idPuntoVenta" element={<Tienda />} />

        <Route path="/dashboard" element={
          <ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>
        } />

        <Route path="/admin" element={
          <ProtectedRoute modulo="/admin"><Layout><Usuarios /></Layout></ProtectedRoute>
        } />

        <Route path="/cambiar-password" element={
          <ProtectedRoute skipCambiarPass={true}><CambiarPassword /></ProtectedRoute>
        } />

        <Route path="/perfil" element={
          <ProtectedRoute><Layout><Perfil /></Layout></ProtectedRoute>
        } />

        <Route path="/inventarios" element={
          <ProtectedRoute modulo="/inventarios"><Layout><Inventario /></Layout></ProtectedRoute>
        } />

        <Route path="/proveedores" element={
          <ProtectedRoute modulo="/proveedores"><Layout><Proveedores /></Layout></ProtectedRoute>
        } />

        <Route path="/pedidos" element={
          <ProtectedRoute modulo="/pedidos"><Layout><Pedidos /></Layout></ProtectedRoute>
        } />

        <Route path="/pos" element={
          <ProtectedRoute modulo="/pos"><Layout><POS /></Layout></ProtectedRoute>
        } />

        <Route path="/sucursales" element={
          <ProtectedRoute modulo="/sucursales"><Layout><Sucursales /></Layout></ProtectedRoute>
        } />

        <Route path="/ventas" element={
          <ProtectedRoute modulo="/ventas"><Layout><Ventas /></Layout></ProtectedRoute>
        } />

        <Route path="/reportes" element={
          <ProtectedRoute modulo="/reportes"><Layout><Reportes /></Layout></ProtectedRoute>
        } />

        <Route path="/caja" element={
          <ProtectedRoute modulo="/caja"><Layout><CierreCaja /></Layout></ProtectedRoute>
        } />

        <Route path="/logistica" element={
          <ProtectedRoute modulo="/logistica"><Layout><Logistica /></Layout></ProtectedRoute>
        } />

        <Route path="/clientes" element={
          <ProtectedRoute modulo="/clientes"><Layout><Clientes /></Layout></ProtectedRoute>
        } />

        <Route path="/precios" element={
          <ProtectedRoute modulo="/precios"><Layout><Precios /></Layout></ProtectedRoute>
        } />

        <Route path="/matriz" element={
          <ProtectedRoute modulo="/matriz"><Layout><Matriz /></Layout></ProtectedRoute>
        } />

        <Route path="/corporativo" element={
          <ProtectedRoute modulo="/corporativo"><Layout><Corporativo /></Layout></ProtectedRoute>
        } />

        <Route path="/catalogos" element={
          <ProtectedRoute modulo="/catalogos"><Layout><Catalogos /></Layout></ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}