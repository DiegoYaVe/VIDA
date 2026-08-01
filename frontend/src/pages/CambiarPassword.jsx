// src/pages/CambiarPassword.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, Check, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../store/authStore.js';
import api from '../services/api.js';

export default function CambiarPassword() {
  const navigate    = useNavigate();
  const { usuario, logout } = useAuthStore();
  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNueva,  setPasswordNueva]  = useState('');
  const [confirmar,      setConfirmar]      = useState('');
  const [showPass,       setShowPass]       = useState(false);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState('');
  const [exitoso,        setExitoso]        = useState(false);

  const requisitos = [
    { label: 'Al menos 8 caracteres',    ok: passwordNueva.length >= 8 },
    { label: 'Al menos una mayúscula',   ok: /[A-Z]/.test(passwordNueva) },
    { label: 'Al menos un número',       ok: /[0-9]/.test(passwordNueva) },
    { label: 'Las contraseñas coinciden', ok: passwordNueva === confirmar && confirmar.length > 0 },
  ];

  const todoOk = requisitos.every(r => r.ok) && passwordActual.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/usuarios/cambiar-pass', { passwordActual, passwordNueva });
      setExitoso(true);
      // Cerrar sesión para que vuelva a hacer login con la nueva contraseña
      setTimeout(async () => {
        await logout();
        navigate('/login');
      }, 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cambiar contraseña');
    } finally {
      setLoading(false);
    }
  };

  if (exitoso) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldCheck size={36} className="text-green-500" />
        </div>
        <h2 className="text-2xl font-black text-gray-700">¡Contraseña actualizada!</h2>
        <p className="text-gray-400 text-sm mt-2">Redirigiendo al login en 3 segundos...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #54C4E0, #5BBE6A)' }}>
            <span className="text-white font-black text-2xl">V</span>
          </div>
          <h1 className="text-2xl font-black text-gray-800">Cambia tu contraseña</h1>
          <p className="text-gray-400 text-sm mt-1">
            Hola <strong>{usuario?.Nombre}</strong>, por seguridad debes establecer una contraseña personal.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

          {/* Aviso */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle size={18} className="text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-yellow-700 text-sm font-semibold">
              Estás usando una contraseña temporal. Debes cambiarla antes de continuar.
            </p>
          </div>

          {error && (
            <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
              <AlertCircle size={18} className="text-red-500 shrink-0" />
              <p className="text-red-600 text-sm font-semibold">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Contraseña actual */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                Contraseña temporal (actual)
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={passwordActual}
                  onChange={e => setPasswordActual(e.target.value)}
                  placeholder="La que recibiste por email"
                  className="input-field pl-10"
                  required
                />
              </div>
            </div>

            {/* Nueva contraseña */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                Nueva contraseña
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={passwordNueva}
                  onChange={e => setPasswordNueva(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="input-field pl-10 pr-10"
                  required
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Confirmar */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                Confirmar nueva contraseña
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray.400" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={confirmar}
                  onChange={e => setConfirmar(e.target.value)}
                  placeholder="Repite tu nueva contraseña"
                  className="input-field pl-10"
                  required
                />
              </div>
            </div>

            {/* Requisitos */}
            {passwordNueva.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                {requisitos.map(r => (
                  <div key={r.label} className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                      r.ok ? 'bg-green-500' : 'bg-gray-200'
                    }`}>
                      {r.ok && <Check size={10} className="text-white" />}
                    </div>
                    <span className={`text-xs font-semibold ${r.ok ? 'text-green-600' : 'text-gray-400'}`}>
                      {r.label}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button type="submit" disabled={!todoOk || loading}
              className="btn-primary w-full text-base py-3">
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Actualizando...
                </span>
              ) : 'Cambiar contraseña'}
            </button>

          </form>
        </div>
      </div>
    </div>
  );
}