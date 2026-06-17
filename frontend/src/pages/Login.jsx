// src/pages/Login.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User, Package, ShoppingCart, Truck, BarChart2, Shield } from 'lucide-react';
import { useAuthStore } from '../store/authStore.js';

export default function Login() {
  const [cve, setCve]         = useState('');
  const [pass, setPass]       = useState('');
  const [showPass, setShowPass] = useState(false);
  const [recuerdame, setRecuerdame] = useState(false);

  const { login, loading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    const ok = await login(cve, pass);
    if (ok) {
      const estado = useAuthStore.getState();
      console.log('Usuario en store:', estado.usuario);
      console.log('CambiarPass:', estado.usuario?.CambiarPass);
      if (estado.usuario?.CambiarPass) {
        navigate('/cambiar-password');
      } else {
        navigate('/dashboard');
      }
    }
  };

  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'Nunito', sans-serif" }}>

      {/* Panel izquierdo — branding */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden flex-col justify-between p-12"
        style={{ background: 'linear-gradient(135deg, #1A6A9A 0%, #27AE60 100%)' }}>

        {/* Formas decorativas */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-white/5 rounded-full" />
          <div className="absolute top-1/3 -right-20 w-64 h-64 bg-white/5 rounded-full" />
          <div className="absolute bottom-1/3 left-1/3 w-48 h-48 bg-white/5 rounded-full" />
          {/* Ola decorativa */}
          <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 200" preserveAspectRatio="none">
            <path d="M0,100 C360,180 1080,20 1440,100 L1440,200 L0,200 Z" fill="rgba(255,255,255,0.07)" />
            <path d="M0,140 C480,60 960,180 1440,140 L1440,200 L0,200 Z" fill="rgba(255,255,255,0.05)" />
          </svg>
        </div>

        {/* Logo */}
        <div className="relative z-10">
          {/* Logo imagen — guarda el archivo como /public/logo-login.png (logo blanco sobre fondo oscuro) */}
          <img
            src="/logo-login.png"
            alt="Comercializadora VIDA"
            className="h-24 w-auto object-contain drop-shadow-lg"
            onError={e => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'block';
            }}
          />
          {/* Fallback si no existe la imagen */}
          <div style={{ display: 'none' }}>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
                <span className="text-white font-black text-2xl">V</span>
              </div>
              <div>
                <p className="text-white/70 text-xs font-semibold tracking-widest uppercase">Comercializadora</p>
                <p className="text-white font-black text-3xl leading-none">VIDA</p>
              </div>
            </div>
            <div className="mt-2 bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1 inline-block">
              <p className="text-white text-xs font-semibold tracking-wider">PLATAFORMA DE DESARROLLO EMPRESARIAL</p>
            </div>
            <p className="text-white/60 text-xs mt-1">Por Venezuela, sus productos y su gente</p>
          </div>
        </div>

        {/* Tagline */}
        <div className="relative z-10">
          <h2 className="text-white text-4xl font-black leading-tight mb-4">
            Gestiona tu negocio<br />de forma{' '}
            <span className="text-yellow-300">inteligente</span>{' '}
            y <span className="text-yellow-300">eficiente</span>
          </h2>
          <p className="text-white/70 text-sm leading-relaxed max-w-md">
            Conecta la MATRIZ, PUNTOS DE VENTA, REPARTIDORES y CONSUMIDORES FINALES en una sola plataforma.
          </p>
        </div>

        {/* Features */}
        <div className="relative z-10 grid grid-cols-4 gap-4">
          {[
            { icon: Package,      label: 'Control de\ninventario' },
            { icon: ShoppingCart, label: 'Gestión de\npedidos' },
            { icon: Truck,        label: 'Seguimiento\nen tiempo real' },
            { icon: BarChart2,    label: 'Reportes\ninteligentes' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-2 bg-white/10 backdrop-blur rounded-xl p-3 text-center">
              <Icon className="text-white" size={24} />
              <p className="text-white/80 text-xs font-semibold whitespace-pre-line">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">

          {/* Logo mobile */}
          <div className="lg:hidden flex items-center justify-center mb-8">
            <img
              src="/logo-sidebar.png"
              alt="Comercializadora VIDA"
              className="h-16 w-auto object-contain"
              onError={e => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            {/* Fallback mobile */}
            <div style={{ display: 'none' }} className="items-center gap-3">
              <div className="w-10 h-10 bg-vida-green rounded-xl flex items-center justify-center">
                <span className="text-white font-black text-lg">V</span>
              </div>
              <div>
                <p className="text-gray-400 text-xs font-semibold tracking-wider uppercase">Comercializadora</p>
                <p className="text-vida-green font-black text-xl">VIDA</p>
              </div>
            </div>
          </div>

          <h1 className="text-2xl font-black text-gray-800 mb-1">Bienvenido de nuevo</h1>
          <p className="text-gray-400 text-sm mb-8">Ingresa tus credenciales para continuar</p>

          {error && (
            <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
              <Shield size={18} className="text-red-500 shrink-0" />
              <p className="text-red-600 text-sm font-semibold">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Usuario */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                Usuario o correo electrónico
              </label>
              <div className="relative">
                <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={cve}
                  onChange={e => setCve(e.target.value)}
                  placeholder="Ingresa tu usuario o correo"
                  className="input-field pl-10"
                  required
                />
              </div>
            </div>

            {/* Contraseña */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">Contraseña</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={pass}
                  onChange={e => setPass(e.target.value)}
                  placeholder="Ingresa tu contraseña"
                  className="input-field pl-10 pr-10"
                  required
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Recordarme */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={recuerdame} onChange={e => setRecuerdame(e.target.checked)}
                  className="w-4 h-4 accent-vida-green rounded" />
                <span className="text-sm text-gray-600 font-semibold">Recordarme</span>
              </label>
              <button type="button" className="text-sm text-vida-green font-bold hover:underline">
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            {/* Botón */}
            <button type="submit" disabled={loading} className="btn-primary w-full text-base py-3">
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Iniciando sesión...
                </span>
              ) : 'Iniciar sesión'}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-400 font-semibold">o continúa con</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            {/* Google (UI only por ahora) */}
            <button type="button"
              className="w-full border border-gray-200 rounded-lg py-2.5 flex items-center justify-center gap-3 hover:bg-gray-50 transition-colors font-semibold text-sm text-gray-700">
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/>
                <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"/>
              </svg>
              Continuar con Google
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            ¿No tienes una cuenta?{' '}
            <a href="#" className="text-vida-green font-bold hover:underline">Contáctanos</a>
          </p>

          {/* Footer de seguridad */}
          <div className="mt-10 pt-6 border-t border-gray-100 grid grid-cols-2 gap-4">
            {[
              { icon: Shield, title: 'Seguridad ante todo', desc: 'Tu información protegida con los más altos estándares.' },
              { icon: Lock,   title: 'Acceso seguro',       desc: 'Sesiones protegidas y encriptadas para tu tranquilidad.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-2">
                <Icon size={18} className="text-vida-green shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-gray-700">{title}</p>
                  <p className="text-xs text-gray-400 leading-tight">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
