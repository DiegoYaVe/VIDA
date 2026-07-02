// src/pages/Perfil.jsx
import { useState, useEffect, useRef } from 'react';
import {
  User, Mail, Phone, Briefcase, Calendar, Shield,
  Camera, Save, Lock, Eye, EyeOff, Check,
  AlertCircle, Loader2, Building, Globe
} from 'lucide-react';
import { useAuthStore } from '../store/authStore.js';
import api, { API_ORIGIN } from '../services/api.js';

const ROL_CONFIG = {
  SUPER_ADMIN:  { label: 'Super Admin',   color: 'bg-purple-100 text-purple-700' },
  ADMIN_PAIS:   { label: 'Admin País',    color: 'bg-blue-100 text-blue-700'     },
  ADMIN:        { label: 'Administrador', color: 'bg-indigo-100 text-indigo-700' },
  SUPERVISOR:   { label: 'Supervisor',    color: 'bg-yellow-100 text-yellow-700' },
  CAJERO:       { label: 'Cajero',        color: 'bg-green-100 text-green-700'   },
};

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, []);
  return (
    <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg font-semibold text-sm flex items-center gap-2 ${
      type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
    }`}>
      {type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
      {msg}
    </div>
  );
}

export default function Perfil() {
  const { usuario: usuarioStore, logout } = useAuthStore();
  const [perfil,      setPerfil]      = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [toast,       setToast]       = useState(null);
  const [tabActiva,   setTabActiva]   = useState('datos');
  const fileRef = useRef();

  // Form datos
  const [form, setForm] = useState({
    Nombre: '', Apellidos: '', NomComercial: '',
    Telefono: '', Puesto: '', FechaNacimiento: '',
  });

  // Form password
  const [passForm, setPassForm]   = useState({ passwordActual: '', passwordNueva: '', confirmar: '' });
  const [showPass,  setShowPass]  = useState(false);
  const [savingPass,setSavingPass]= useState(false);

  const showToast = (msg, type = 'success') => setToast({ msg, type });

  useEffect(() => {
    api.get('/perfil')
      .then(r => {
        setPerfil(r.data);
        setForm({
          Nombre:          r.data.Nombre          || '',
          Apellidos:       r.data.Apellidos       || '',
          NomComercial:    r.data.NomComercial    || '',
          Telefono:        r.data.Telefono        || '',
          Puesto:          r.data.Puesto          || '',
          FechaNacimiento: r.data.FechaNacimiento?.split('T')[0] || '',
        });
      })
      .catch(() => showToast('Error al cargar perfil', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const handleSaveDatos = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/perfil', form);
      setPerfil(p => ({ ...p, ...form }));
      showToast('Perfil actualizado correctamente');
    } catch (err) {
      showToast(err.response?.data?.error || 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleFotoChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('La imagen no debe superar 5MB', 'error');
      return;
    }
    setUploadingFoto(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const r = await api.post('/perfil/foto', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPerfil(p => ({ ...p, ImagenUsuario: r.data.url }));
      showToast('Foto actualizada correctamente');
    } catch (err) {
      showToast(err.response?.data?.error || 'Error al subir foto', 'error');
    } finally {
      setUploadingFoto(false);
    }
  };

  const handleSavePass = async (e) => {
    e.preventDefault();
    if (passForm.passwordNueva !== passForm.confirmar) {
      showToast('Las contraseñas no coinciden', 'error');
      return;
    }
    setSavingPass(true);
    try {
      await api.post('/perfil/cambiar-pass', {
        passwordActual: passForm.passwordActual,
        passwordNueva:  passForm.passwordNueva,
      });
      setPassForm({ passwordActual: '', passwordNueva: '', confirmar: '' });
      showToast('Contraseña actualizada correctamente');
    } catch (err) {
      showToast(err.response?.data?.error || 'Error al cambiar contraseña', 'error');
    } finally {
      setSavingPass(false);
    }
  };

  const requisitos = [
    { label: 'Al menos 8 caracteres',    ok: passForm.passwordNueva.length >= 8 },
    { label: 'Al menos una mayúscula',   ok: /[A-Z]/.test(passForm.passwordNueva) },
    { label: 'Al menos un número',       ok: /[0-9]/.test(passForm.passwordNueva) },
    { label: 'Las contraseñas coinciden', ok: passForm.passwordNueva === passForm.confirmar && passForm.confirmar.length > 0 },
  ];

  const rolConfig = ROL_CONFIG[perfil?.TipoUsuario] || { label: perfil?.TipoUsuario, color: 'bg-gray-100 text-gray-600' };
  const fotoUrl = perfil?.ImagenUsuario
    ? `${API_ORIGIN}${perfil.ImagenUsuario}`
    : null;

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 size={28} className="animate-spin text-vida-green" />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-gray-800 flex items-center gap-3">
          <User size={24} className="text-vida-green" />
          Mi Perfil
        </h1>
        <p className="text-gray-400 text-sm mt-1">Gestiona tu información personal y configuración de cuenta</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Columna izquierda — avatar + info básica */}
        <div className="space-y-4">

          {/* Card avatar */}
          <div className="card text-center">
            <div className="relative inline-block mb-4">
              {fotoUrl ? (
                <img src={fotoUrl} alt="Avatar"
                  className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg mx-auto" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-vida-blue to-vida-green
                                flex items-center justify-center text-white font-black text-3xl shadow-lg mx-auto">
                  {perfil?.Nombre?.[0]}{perfil?.Apellidos?.[0]}
                </div>
              )}
              <button onClick={() => fileRef.current.click()}
                disabled={uploadingFoto}
                className="absolute bottom-0 right-0 w-8 h-8 bg-vida-green rounded-full flex items-center
                           justify-center text-white shadow-md hover:bg-vida-green-dark transition-colors">
                {uploadingFoto
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Camera size={14} />
                }
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={handleFotoChange} />
            </div>

            <h2 className="font-black text-gray-800 text-lg">
              {perfil?.Nombre} {perfil?.Apellidos}
            </h2>
            {perfil?.NomComercial && (
              <p className="text-gray-400 text-sm">{perfil.NomComercial}</p>
            )}
            <span className={`inline-flex mt-2 px-3 py-1 rounded-full text-xs font-bold ${rolConfig.color}`}>
              {rolConfig.label}
            </span>

            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2 text-left">
              {perfil?.Correo && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Mail size={13} className="text-gray-400 shrink-0" />
                  <span className="truncate">{perfil.Correo}</span>
                </div>
              )}
              {perfil?.Telefono && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Phone size={13} className="text-gray-400 shrink-0" />
                  {perfil.Telefono}
                </div>
              )}
              {perfil?.Puesto && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Briefcase size={13} className="text-gray-400 shrink-0" />
                  {perfil.Puesto}
                </div>
              )}
            </div>
          </div>

          {/* Card organización */}
          <div className="card">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Organización</p>
            <div className="space-y-3">
              {perfil?.NombrePais && (
                <div className="flex items-center gap-2">
                  <Globe size={14} className="text-vida-green shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">País</p>
                    <p className="text-sm font-semibold text-gray-700">{perfil.NombrePais}</p>
                  </div>
                </div>
              )}
              {perfil?.NombreEstado && (
                <div className="flex items-center gap-2">
                  <Building size={14} className="text-vida-green shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">Estado / Cuenta</p>
                    <p className="text-sm font-semibold text-gray-700">{perfil.NombreEstado}</p>
                  </div>
                </div>
              )}
              {perfil?.NombreSucursal && (
                <div className="flex items-center gap-2">
                  <Building size={14} className="text-vida-green shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">Sucursal</p>
                    <p className="text-sm font-semibold text-gray-700">{perfil.NombreSucursal}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-vida-green shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Miembro desde</p>
                  <p className="text-sm font-semibold text-gray-700">
                    {perfil?.FechaAlta ? new Date(perfil.FechaAlta).toLocaleDateString('es-VE') : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Card módulos */}
          <div className="card">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Accesos ({perfil?.pantallas?.length || 0} módulos)
            </p>
            <div className="space-y-1.5">
              {(perfil?.pantallas || []).map(p => (
                <div key={p.idPantalla} className="flex items-center gap-2 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-vida-green shrink-0" />
                  <span className="text-gray-600 font-semibold">{p.Nombre}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Columna derecha — tabs */}
        <div className="lg:col-span-2">

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
            {[
              { id: 'datos', label: 'Datos personales', icon: User },
              { id: 'seguridad', label: 'Contraseña', icon: Lock },
            ].map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTabActiva(id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
                  tabActiva === id
                    ? 'bg-white text-vida-green shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}>
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          {/* Tab: Datos personales */}
          {tabActiva === 'datos' && (
            <div className="card">
              <h3 className="font-black text-gray-700 mb-5">Información personal</h3>
              <form onSubmit={handleSaveDatos} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Nombre *</label>
                    <input value={form.Nombre}
                      onChange={e => setForm(f => ({ ...f, Nombre: e.target.value }))}
                      className="input-field text-sm" placeholder="Tu nombre" required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Apellidos</label>
                    <input value={form.Apellidos}
                      onChange={e => setForm(f => ({ ...f, Apellidos: e.target.value }))}
                      className="input-field text-sm" placeholder="Tus apellidos" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Nombre para mostrar</label>
                    <input value={form.NomComercial}
                      onChange={e => setForm(f => ({ ...f, NomComercial: e.target.value }))}
                      className="input-field text-sm" placeholder="Ej: Diego Y." />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Teléfono</label>
                    <div className="relative">
                      <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input value={form.Telefono}
                        onChange={e => setForm(f => ({ ...f, Telefono: e.target.value }))}
                        className="input-field text-sm pl-9" placeholder="+58 424 000 0000" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Puesto</label>
                    <div className="relative">
                      <Briefcase size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input value={form.Puesto}
                        onChange={e => setForm(f => ({ ...f, Puesto: e.target.value }))}
                        className="input-field text-sm pl-9" placeholder="Tu puesto o cargo" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Fecha de nacimiento</label>
                    <div className="relative">
                      <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="date" value={form.FechaNacimiento}
                        onChange={e => setForm(f => ({ ...f, FechaNacimiento: e.target.value }))}
                        className="input-field text-sm pl-9" />
                    </div>
                  </div>
                </div>

                {/* Campo no editable */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">Correo electrónico</label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={perfil?.Correo || ''} disabled
                      className="input-field text-sm pl-9 bg-gray-50 text-gray-400 cursor-not-allowed" />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">El correo no se puede cambiar desde aquí.</p>
                </div>

                <div className="flex justify-end pt-2">
                  <button type="submit" disabled={saving} className="btn-primary text-sm px-6">
                    {saving ? (
                      <span className="flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" /> Guardando...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Save size={14} /> Guardar cambios
                      </span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tab: Contraseña */}
          {tabActiva === 'seguridad' && (
            <div className="card">
              <h3 className="font-black text-gray-700 mb-2">Cambiar contraseña</h3>
              <p className="text-gray-400 text-sm mb-5">
                Por seguridad, usa una contraseña que no uses en otros sitios.
              </p>
              <form onSubmit={handleSavePass} className="space-y-4 max-w-md">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">Contraseña actual</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type={showPass ? 'text' : 'password'}
                      value={passForm.passwordActual}
                      onChange={e => setPassForm(f => ({ ...f, passwordActual: e.target.value }))}
                      className="input-field text-sm pl-9 pr-9" placeholder="Tu contraseña actual" required />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">Nueva contraseña</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type={showPass ? 'text' : 'password'}
                      value={passForm.passwordNueva}
                      onChange={e => setPassForm(f => ({ ...f, passwordNueva: e.target.value }))}
                      className="input-field text-sm pl-9" placeholder="Nueva contraseña" required />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">Confirmar contraseña</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type={showPass ? 'text' : 'password'}
                      value={passForm.confirmar}
                      onChange={e => setPassForm(f => ({ ...f, confirmar: e.target.value }))}
                      className="input-field text-sm pl-9" placeholder="Confirma tu nueva contraseña" required />
                  </div>
                </div>

                {passForm.passwordNueva.length > 0 && (
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

                <div className="flex justify-end pt-2">
                  <button type="submit" disabled={savingPass || !requisitos.every(r => r.ok)}
                    className="btn-primary text-sm px-6">
                    {savingPass ? (
                      <span className="flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" /> Actualizando...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Shield size={14} /> Actualizar contraseña
                      </span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}