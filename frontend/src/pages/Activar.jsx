// src/pages/Activar.jsx
import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, Check, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import api from '../services/api.js';

export default function Activar() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const token      = params.get('token');

  const [password,   setPassword]   = useState('');
  const [confirmar,  setConfirmar]  = useState('');
  const [showPass,   setShowPass]   = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [exitoso,    setExitoso]    = useState(false);

  const requisitos = [
    { label: 'Al menos 8 caracteres',      ok: password.length >= 8 },
    { label: 'Al menos una mayúscula',      ok: /[A-Z]/.test(password) },
    { label: 'Al menos un número',          ok: /[0-9]/.test(password) },
    { label: 'Las contraseñas coinciden',   ok: password === confirmar && confirmar.length > 0 },
  ];

  const todoOk = requisitos.every(r => r.ok);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!todoOk) return;
    setError('');
    setLoading(true);
    try {
      await api.post('/usuarios/activar', { token, password });
      setExitoso(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al activar la cuenta');
    } finally {
      setLoading(false);
    }
  };

  if (!token) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-black text-gray-700">Link inválido</h2>
        <p className="text-gray-400 text-sm mt-2">Este link de activación no es válido.</p>
      </div>
    </div>
  );

  if (exitoso) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldCheck size={36} className="text-green-500" />
        </div>
        <h2 className="text-2xl font-black text-gray-700">¡Cuenta activada!</h2>
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
          <h1 className="text-2xl font-black text-gray-800">Activa tu cuenta</h1>
          <p className="text-gray-400 text-sm mt-1">Establece tu contraseña para comenzar</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

          {error && (
            <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
              <AlertCircle size={18} className="text-red-500 shrink-0" />
              <p className="text-red-600 text-sm font-semibold">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Nueva contraseña */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">
                Nueva contraseña
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
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
                Confirmar contraseña
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={confirmar}
                  onChange={e => setConfirmar(e.target.value)}
                  placeholder="Repite tu contraseña"
                  className="input-field pl-10"
                  required
                />
              </div>
            </div>

            {/* Requisitos */}
            {password.length > 0 && (
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
                  Activando cuenta...
                </span>
              ) : 'Activar mi cuenta'}
            </button>

          </form>
        </div>
      </div>
    </div>
  );
}
