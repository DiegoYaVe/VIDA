// src/pages/Usuarios.jsx
import { useState, useEffect } from 'react';
import {
  Users, Plus, Search, Edit2, ToggleLeft, ToggleRight,
  Shield, Mail, Phone, Building, ChevronLeft, ChevronRight,
  X, Check, AlertCircle, Loader2, Eye, EyeOff
} from 'lucide-react';
import api from '../services/api.js';

// ── Badges de rol ──────────────────────────────────────────────────────────
const ROL_CONFIG = {
  SUPER_ADMIN:  { label: 'Super Admin',   bg: 'bg-purple-100',  text: 'text-purple-700'  },
  ADMIN_PAIS:   { label: 'Admin País',    bg: 'bg-blue-100',    text: 'text-blue-700'    },
  ADMIN:        { label: 'Administrador', bg: 'bg-indigo-100',  text: 'text-indigo-700'  },
  SUPERVISOR:   { label: 'Supervisor',    bg: 'bg-yellow-100',  text: 'text-yellow-700'  },
  CAJERO:       { label: 'Cajero',        bg: 'bg-green-100',   text: 'text-green-700'   },
};

const STATUS_CONFIG = {
  ACTIVO:    { label: 'Activo',    bg: 'bg-green-100',  text: 'text-green-700'  },
  INACTIVO:  { label: 'Inactivo', bg: 'bg-red-100',    text: 'text-red-600'    },
  PENDIENTE: { label: 'Pendiente', bg: 'bg-yellow-100', text: 'text-yellow-700' },
};

function Badge({ value, config }) {
  const c = config[value] || { label: value, bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

// ── Avatar ─────────────────────────────────────────────────────────────────
function Avatar({ nombre, apellidos, imagen }) {
  if (imagen) return (
    <img src={imagen} alt={nombre}
      className="w-9 h-9 rounded-full object-cover border-2 border-white shadow" />
  );
  const initials = `${nombre?.[0] || ''}${apellidos?.[0] || ''}`.toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-vida-blue to-vida-green
                    flex items-center justify-center text-white font-bold text-sm shadow">
      {initials}
    </div>
  );
}

// ── Modal Crear/Editar ─────────────────────────────────────────────────────
function ModalUsuario({ usuario, pantallas, sucursales, onClose, onSaved }) {
  const esEdicion = !!usuario;
  const [form, setForm] = useState({
    Nombre:          usuario?.Nombre          || '',
    Apellidos:       usuario?.Apellidos       || '',
    NomComercial:    usuario?.NomComercial    || '',
    Correo:          usuario?.Correo          || '',
    Telefono:        usuario?.Telefono        || '',
    Cve:             usuario?.Cve             || '',
    TipoUsuario:     usuario?.TipoUsuario     || 'CAJERO',
    Puesto:          usuario?.Puesto          || '',
    FechaNacimiento: usuario?.FechaNacimiento?.split('T')[0] || '',
    idPuntoVenta:    usuario?.idPuntoVenta    || '',
    pantallas:       [],
  });
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [loadingAccesos, setLoadingAccesos] = useState(false);

  // Cargar accesos actuales si es edición
  useEffect(() => {
    if (esEdicion && usuario.idUsuario) {
      setLoadingAccesos(true);
      api.get('/usuarios')
        .then(() => {})
        .catch(() => {})
        .finally(() => setLoadingAccesos(false));

      // Obtener accesos del usuario
      api.get(`/usuarios/${usuario.idUsuario}/accesos`)
        .then(r => setForm(f => ({ ...f, pantallas: r.data.map(p => p.idPantalla) })))
        .catch(() => {})
        .finally(() => setLoadingAccesos(false));
    }
  }, []);

  const togglePantalla = (idPantalla) => {
    setForm(f => ({
      ...f,
      pantallas: f.pantallas.includes(idPantalla)
        ? f.pantallas.filter(p => p !== idPantalla)
        : [...f.pantallas, idPantalla],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (esEdicion) {
        await api.put(`/usuarios/${usuario.idUsuario}`, form);
        onSaved();
      } else {
        const res = await api.post('/usuarios', form);
        // Si no se pudo enviar email, mostrar la contraseña temporal al admin
        if (res.data.passwordTemporal) {
          const pass = res.data.passwordTemporal;
          setTimeout(() => {
            alert(
              `✅ Usuario creado exitosamente.\n\n` +
              `⚠️ No se configuró correo, así que la contraseña NO se envió por email.\n\n` +
              `🔑 Contraseña temporal:\n${pass}\n\n` +
              `Compártela manualmente con el usuario. Deberá cambiarla al primer inicio de sesión.`
            );
          }, 100);
        }
        onSaved();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar usuario');
    } finally {
      setLoading(false);
    }
  };

  // Agrupar pantallas por módulo
  const modulos = pantallas.reduce((acc, p) => {
    if (!acc[p.Modulo]) acc[p.Modulo] = [];
    acc[p.Modulo].push(p);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-vida-green-light flex items-center justify-center">
              <Users size={18} className="text-vida-green" />
            </div>
            <div>
              <h2 className="font-black text-gray-800 text-lg">
                {esEdicion ? 'Editar Usuario' : 'Nuevo Usuario'}
              </h2>
              <p className="text-xs text-gray-400">
                {esEdicion ? `Modificando: ${usuario.Nombre} ${usuario.Apellidos}` : 'Completa los datos del nuevo usuario'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
              <AlertCircle size={16} className="text-red-500 shrink-0" />
              <p className="text-red-600 text-sm font-semibold">{error}</p>
            </div>
          )}

          {/* Datos personales */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Datos Personales
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Nombre *</label>
                <input value={form.Nombre} onChange={e => setForm(f=>({...f,Nombre:e.target.value}))}
                  className="input-field text-sm" placeholder="Nombre" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Apellidos</label>
                <input value={form.Apellidos} onChange={e => setForm(f=>({...f,Apellidos:e.target.value}))}
                  className="input-field text-sm" placeholder="Apellidos" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Nombre Comercial</label>
                <input value={form.NomComercial} onChange={e => setForm(f=>({...f,NomComercial:e.target.value}))}
                  className="input-field text-sm" placeholder="Nombre para mostrar" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Fecha Nacimiento</label>
                <input type="date" value={form.FechaNacimiento}
                  onChange={e => setForm(f=>({...f,FechaNacimiento:e.target.value}))}
                  className="input-field text-sm" />
              </div>
            </div>
          </div>

          {/* Contacto */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Contacto</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Correo *</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="email" value={form.Correo}
                    onChange={e => setForm(f=>({...f,Correo:e.target.value}))}
                    className="input-field text-sm pl-9" placeholder="correo@ejemplo.com" required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Teléfono</label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={form.Telefono}
                    onChange={e => setForm(f=>({...f,Telefono:e.target.value}))}
                    className="input-field text-sm pl-9" placeholder="+58 424 000 0000" />
                </div>
              </div>
            </div>
          </div>

          {/* Acceso */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Acceso al Sistema</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Usuario *</label>
                <input value={form.Cve} onChange={e => setForm(f=>({...f,Cve:e.target.value}))}
                  className="input-field text-sm" placeholder="nombre.usuario"
                  required disabled={esEdicion} />
                {esEdicion && <p className="text-xs text-gray-400 mt-1">El usuario no se puede cambiar</p>}
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Rol *</label>
                <select value={form.TipoUsuario}
                  onChange={e => setForm(f=>({...f,TipoUsuario:e.target.value}))}
                  className="input-field text-sm" required>
                  <option value="ADMIN">Administrador</option>
                  <option value="ADMIN_PAIS">Admin País</option>
                  <option value="SUPERVISOR">Supervisor</option>
                  <option value="CAJERO">Cajero</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Puesto</label>
                <input value={form.Puesto} onChange={e => setForm(f=>({...f,Puesto:e.target.value}))}
                  className="input-field text-sm" placeholder="Ej: Gerente de Sucursal" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Sucursal</label>
                <div className="relative">
                  <Building size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <select value={form.idPuntoVenta}
                    onChange={e => setForm(f=>({...f,idPuntoVenta:e.target.value}))}
                    className="input-field text-sm pl-9">
                    <option value="">— Sin sucursal asignada —</option>
                    {sucursales.map(s => (
                      <option key={s.idPuntoVenta} value={s.idPuntoVenta}>
                        {s.NomComercial || s.Nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Accesos a módulos */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Shield size={13} />
              Accesos a Módulos
            </p>
            {loadingAccesos ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <Loader2 size={14} className="animate-spin" /> Cargando accesos...
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(modulos).map(([modulo, items]) => (
                  <div key={modulo}>
                    <p className="text-xs font-bold text-gray-500 mb-2">{modulo}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {items.map(p => {
                        const activo = form.pantallas.includes(p.idPantalla);
                        return (
                          <button key={p.idPantalla} type="button"
                            onClick={() => togglePantalla(p.idPantalla)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                              activo
                                ? 'bg-vida-green text-white border-vida-green'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-vida-green'
                            }`}>
                            {activo ? <Check size={12} /> : <X size={12} className="opacity-40" />}
                            {p.Nombre}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </form>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={loading}
            className="btn-primary text-sm px-6">
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                {esEdicion ? 'Guardando...' : 'Creando...'}
              </span>
            ) : (
              esEdicion ? 'Guardar cambios' : 'Crear y enviar invitación'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ────────────────────────────────────────────────────────
export default function Usuarios() {
  const [usuarios,   setUsuarios]   = useState([]);
  const [pantallas,  setPantallas]  = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [rolFiltro,  setRolFiltro]  = useState('');
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total,      setTotal]      = useState(0);
  const [modal,      setModal]      = useState(null); // null | 'crear' | usuario
  const [toast,      setToast]      = useState(null);
  const [toggling,   setToggling]   = useState(null);

  const cargarUsuarios = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 15 };
      if (search)    params.search = search;
      if (rolFiltro) params.rol    = rolFiltro;
      const r = await api.get('/usuarios', { params });
      setUsuarios(r.data.data);
      setTotalPages(r.data.pages);
      setTotal(r.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const cargarPantallas = async () => {
    try {
      const r = await api.get('/usuarios/pantallas');
      setPantallas(r.data);
    } catch {}
  };

  const cargarSucursales = async () => {
    try {
      const r = await api.get('/sucursales/puntos-venta');
      setSucursales(r.data.sucursales || r.data || []);
    } catch {}
  };

  useEffect(() => { cargarPantallas(); cargarSucursales(); }, []);
  useEffect(() => { cargarUsuarios(); }, [page, rolFiltro]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    cargarUsuarios();
  };

  const handleSaved = () => {
    setModal(null);
    cargarUsuarios();
    showToast('Usuario guardado correctamente', 'success');
  };

  const handleToggle = async (u) => {
    const nuevoStatus = u.Status === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    setToggling(u.idUsuario);
    try {
      await api.patch(`/usuarios/${u.idUsuario}/status`, { status: nuevoStatus });
      cargarUsuarios();
      showToast(`Usuario ${nuevoStatus === 'ACTIVO' ? 'activado' : 'desactivado'}`, 'success');
    } catch {
      showToast('Error al cambiar status', 'error');
    } finally {
      setToggling(null);
    }
  };

  const showToast = (msg, type) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg font-semibold text-sm flex items-center gap-2 transition-all ${
          toast.type === 'success'
            ? 'bg-green-500 text-white'
            : 'bg-red-500 text-white'
        }`}>
          {toast.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-800 flex items-center gap-3">
            <Users size={24} className="text-vida-green" />
            Usuarios y Seguridad
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {total} usuario{total !== 1 ? 's' : ''} registrado{total !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => setModal('crear')} className="btn-primary">
          <Plus size={16} />
          Nuevo Usuario
        </button>
      </div>

      {/* Filtros */}
      <div className="card mb-5">
        <form onSubmit={handleSearch} className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre, correo o usuario..."
              className="input-field text-sm pl-9 w-full" />
          </div>
          <select value={rolFiltro} onChange={e => { setRolFiltro(e.target.value); setPage(1); }}
            className="input-field text-sm w-44">
            <option value="">Todos los roles</option>
            <option value="ADMIN">Administrador</option>
            <option value="ADMIN_PAIS">Admin País</option>
            <option value="SUPERVISOR">Supervisor</option>
            <option value="CAJERO">Cajero</option>
          </select>
          <button type="submit" className="btn-primary text-sm px-5">
            Buscar
          </button>
        </form>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['Usuario','Contacto','Rol','Sucursal','Módulos','Estado','Acciones'].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <Loader2 size={24} className="animate-spin text-vida-green mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">Cargando usuarios...</p>
                  </td>
                </tr>
              ) : usuarios.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <Users size={32} className="text-gray-200 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm font-semibold">No hay usuarios registrados</p>
                    <button onClick={() => setModal('crear')}
                      className="mt-3 text-vida-green text-sm font-bold hover:underline">
                      Crear el primero
                    </button>
                  </td>
                </tr>
              ) : usuarios.map(u => (
                <tr key={u.idUsuario}
                  className="border-b border-gray-50 hover:bg-gray-50 transition-colors">

                  {/* Usuario */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <Avatar nombre={u.Nombre} apellidos={u.Apellidos} imagen={u.ImagenUsuario} />
                      <div>
                        <p className="font-bold text-gray-800 text-sm">
                          {u.Nombre} {u.Apellidos}
                        </p>
                        <p className="text-xs text-gray-400">@{u.Cve}</p>
                        {u.Puesto && <p className="text-xs text-gray-400">{u.Puesto}</p>}
                      </div>
                    </div>
                  </td>

                  {/* Contacto */}
                  <td className="py-3 px-4">
                    <p className="text-xs text-gray-600 flex items-center gap-1">
                      <Mail size={11} className="text-gray-400" />
                      {u.Correo}
                    </p>
                    {u.Telefono && (
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <Phone size={11} />
                        {u.Telefono}
                      </p>
                    )}
                  </td>

                  {/* Rol */}
                  <td className="py-3 px-4">
                    <Badge value={u.TipoUsuario} config={ROL_CONFIG} />
                  </td>

                  {/* Sucursal */}
                  <td className="py-3 px-4">
                    <p className="text-xs text-gray-600">
                      {u.NombreSucursal || <span className="text-gray-300">—</span>}
                    </p>
                  </td>

                  {/* Módulos */}
                  <td className="py-3 px-4">
                    <span className="text-xs font-bold text-vida-green bg-vida-green-light
                                     px-2 py-1 rounded-lg">
                      {u.totalAccesos} módulos
                    </span>
                  </td>

                  {/* Estado */}
                  <td className="py-3 px-4">
                    <Badge value={u.Status} config={STATUS_CONFIG} />
                  </td>

                  {/* Acciones */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setModal(u)}
                        className="p-1.5 hover:bg-blue-50 text-blue-500 rounded-lg transition-colors"
                        title="Editar">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleToggle(u)}
                        disabled={toggling === u.idUsuario}
                        className={`p-1.5 rounded-lg transition-colors ${
                          u.Status === 'ACTIVO'
                            ? 'hover:bg-red-50 text-red-400'
                            : 'hover:bg-green-50 text-green-500'
                        }`}
                        title={u.Status === 'ACTIVO' ? 'Desactivar' : 'Activar'}>
                        {toggling === u.idUsuario
                          ? <Loader2 size={14} className="animate-spin" />
                          : u.Status === 'ACTIVO'
                            ? <ToggleRight size={14} />
                            : <ToggleLeft size={14} />
                        }
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Página {page} de {totalPages}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p-1))}
                disabled={page === 1}
                className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30 transition-colors">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))}
                disabled={page === totalPages}
                className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30 transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <ModalUsuario
          usuario={modal === 'crear' ? null : modal}
          pantallas={pantallas}
          sucursales={sucursales}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
