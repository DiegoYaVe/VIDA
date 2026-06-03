// src/App.jsx
import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Layout from './components/Layout.jsx';

function ProtectedRoute({ children }) {
  const { usuario, accessToken } = useAuthStore();
  if (!usuario && !accessToken) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { usuario } = useAuthStore();
  if (usuario) return <Navigate to="/dashboard" replace />;
  return children;
}

// Placeholder para módulos futuros
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
    // Al cargar la app, intentar recuperar sesión con refresh token guardado
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
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />

        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Layout><Dashboard /></Layout>
          </ProtectedRoute>
        } />

        {/* Módulos futuros — placeholder */}
        {[
          { path:'/catalogos',   nombre:'Catálogos' },
          { path:'/precios',     nombre:'Precios y Promociones' },
          { path:'/proveedores', nombre:'Proveedores' },
          { path:'/inventarios', nombre:'Inventarios' },
          { path:'/sucursales',  nombre:'Puntos de Venta' },
          { path:'/pedidos',     nombre:'Pedidos' },
          { path:'/logistica',   nombre:'Repartidores y Logística' },
          { path:'/clientes',    nombre:'Consumidores Finales' },
          { path:'/reportes',    nombre:'Reportes y Estadísticas' },
          { path:'/admin',       nombre:'Seguridad y Admin' },
        ].map(({ path, nombre }) => (
          <Route key={path} path={path} element={
            <ProtectedRoute>
              <Layout><ComingSoon nombre={nombre} /></Layout>
            </ProtectedRoute>
          } />
        ))}

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
