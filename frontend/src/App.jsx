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

function ProtectedRoute({ children, skipCambiarPass = false }) {
  const { accessToken, usuario } = useAuthStore();
  if (!accessToken) return <Navigate to="/login" replace />;
  if (!skipCambiarPass && usuario?.CambiarPass) {
    return <Navigate to="/cambiar-password" replace />;
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
          style={{ background: 'linear-gradient(135deg, #1A6A9A, #27AE60)' }}>
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
      <Routes>
        <Route path="/login"   element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/activar" element={<Activar />} />

        <Route path="/dashboard" element={
          <ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>
        } />

        <Route path="/admin" element={
          <ProtectedRoute><Layout><Usuarios /></Layout></ProtectedRoute>
        } />

        <Route path="/cambiar-password" element={
          <ProtectedRoute skipCambiarPass={true}><CambiarPassword /></ProtectedRoute>
        } />

        <Route path="/perfil" element={
          <ProtectedRoute><Layout><Perfil /></Layout></ProtectedRoute>
        } />

        <Route path="/inventarios" element={
          <ProtectedRoute><Layout><Inventario /></Layout></ProtectedRoute>
        } />

        <Route path="/proveedores" element={
          <ProtectedRoute><Layout><Proveedores /></Layout></ProtectedRoute>
        } />

        {[
          { path:'/catalogos',   nombre:'Catálogos' },
          { path:'/precios',     nombre:'Precios y Promociones' },
          // inventarios ya tiene ruta propia
          { path:'/sucursales',  nombre:'Puntos de Venta' },
          { path:'/pedidos',     nombre:'Pedidos' },
          { path:'/logistica',   nombre:'Repartidores y Logística' },
          { path:'/clientes',    nombre:'Consumidores Finales' },
          { path:'/reportes',    nombre:'Reportes y Estadísticas' },
        ].map(({ path, nombre }) => (
          <Route key={path} path={path} element={
            <ProtectedRoute><Layout><ComingSoon nombre={nombre} /></Layout></ProtectedRoute>
          } />
        ))}

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}