// src/pages/Sucursales.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../store/authStore.js';
import api from '../services/api.js';
import { useToast } from '../components/Toast.jsx';
import {
  Plus, Edit2, Power, Store, MapPin, Phone, Mail,
  User, X, CheckCircle, FileText,
} from 'lucide-react';
import ModalDatosFiscales from '../components/DatosFiscales.jsx';

const ROLES_ESCRITURA = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO', 'ADMIN'];
const TIPOS = ['TIENDA', 'ALMACEN', 'KIOSCO', 'FRANQUICIA', 'OTRO'];

const FORM_VACIO = {
  Nombre: '', NomComercial: '', TipoPuntoVenta: 'TIENDA',
  Correo: '', Telefono: '', Encargado: '',
  Calle: '', NumExt: '', NumInt: '', Colonia: '', CP: '',
  Ciudad: '', idPais: '', idEstado: '',
  Latitud: '', Longitud: '',
};

// ── Carga de Google Maps JS API (una sola vez) ──────────────────────────────
// La key viene de frontend/.env → VITE_GOOGLE_MAPS_KEY (Maps JavaScript API).
// Se usa para fijar la ubicación (lat/lng) de la tienda, que el repartidor toma
// como destino.
const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;
let gmapsPromise = null;
function cargarGoogleMaps() {
  if (window.google && window.google.maps) return Promise.resolve(window.google.maps);
  if (gmapsPromise) return gmapsPromise;
  gmapsPromise = new Promise((resolve, reject) => {
    if (!GMAPS_KEY) { reject(new Error('sinkey')); return; }
    window.__vidaGmapsReady = () => resolve(window.google.maps);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GMAPS_KEY)}&callback=__vidaGmapsReady&loading=async`;
    s.async = true;
    s.onerror = () => reject(new Error('error'));
    document.head.appendChild(s);
  });
  return gmapsPromise;
}

// Selector de ubicación en Google Maps. lat/lng son strings del form; onChange(lat,lng).
function MapaPicker({ lat, lng, onChange }) {
  const contRef = useRef(null);
  const mapRef  = useRef(null);
  const markRef = useRef(null);
  const [estado, setEstado] = useState(GMAPS_KEY ? 'cargando' : 'sinkey'); // cargando | ok | error | sinkey

  const tieneCoords = lat !== '' && lng !== '' && !isNaN(Number(lat)) && !isNaN(Number(lng));

  useEffect(() => {
    if (!GMAPS_KEY) { setEstado('sinkey'); return; }
    let cancelado = false;
    cargarGoogleMaps().then((maps) => {
      if (cancelado || !contRef.current || mapRef.current) return;
      const centro = tieneCoords ? { lat: Number(lat), lng: Number(lng) } : { lat: 8.0, lng: -66.0 }; // Venezuela
      const map = new maps.Map(contRef.current, {
        center: centro, zoom: tieneCoords ? 15 : 6,
        streetViewControl: false, mapTypeControl: false, fullscreenControl: false,
      });
      const poner = (la, ln, pan) => {
        if (markRef.current) markRef.current.setPosition({ lat: la, lng: ln });
        else {
          markRef.current = new maps.Marker({ position: { lat: la, lng: ln }, map, draggable: true });
          markRef.current.addListener('dragend', () => {
            const p = markRef.current.getPosition();
            onChange(+p.lat().toFixed(6), +p.lng().toFixed(6));
          });
        }
        if (pan) map.panTo({ lat: la, lng: ln });
      };
      if (tieneCoords) poner(Number(lat), Number(lng));
      map.addListener('click', (e) => {
        const la = e.latLng.lat(), ln = e.latLng.lng();
        poner(la, ln); onChange(+la.toFixed(6), +ln.toFixed(6));
      });
      map.__poner = poner; // para el botón "Mi ubicación"
      mapRef.current = map;
      setEstado('ok');
    }).catch((err) => { if (!cancelado) setEstado(err.message === 'sinkey' ? 'sinkey' : 'error'); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const miUbicacion = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const la = pos.coords.latitude, ln = pos.coords.longitude;
      mapRef.current.setCenter({ lat: la, lng: ln });
      mapRef.current.setZoom(16);
      mapRef.current.__poner(la, ln, true);
      onChange(+la.toFixed(6), +ln.toFixed(6));
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-bold text-gray-600">Ubicación en el mapa</label>
        {estado === 'ok' && (
          <button type="button" onClick={miUbicacion}
            className="text-xs font-semibold text-vida-blue hover:underline">Usar mi ubicación</button>
        )}
      </div>
      {estado === 'sinkey' ? (
        <div className="w-full rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-500">
          Falta configurar <code className="bg-gray-200 px-1 rounded">VITE_GOOGLE_MAPS_KEY</code> en <code className="bg-gray-200 px-1 rounded">frontend/.env</code> y reiniciar el servidor para ver el mapa de Google.
        </div>
      ) : (
        <div ref={contRef} style={{ height: 220 }}
          className="w-full rounded-xl overflow-hidden border border-gray-200 bg-gray-100 z-0" />
      )}
      {estado !== 'sinkey' && (
        <p className="text-[11px] text-gray-400 mt-1">
          {estado === 'error'
            ? 'No se pudo cargar Google Maps (revisa la API key, su facturación y las restricciones de dominio).'
            : tieneCoords
              ? `Pin en ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)} — arrástralo o toca el mapa para ajustar. El repartidor llega a este punto.`
              : 'Toca el mapa para colocar el pin donde está la tienda. El repartidor usará ese punto como destino.'}
        </p>
      )}
    </div>
  );
}

// ── Modal Alta / Edición ───────────────────────────────────────────────────
function ModalSucursal({ data, onClose, onSaved }) {
  const toast  = useToast();
  const isEdit = !!data?.idPuntoVenta;

  const [form, setForm] = useState(isEdit ? {
    Nombre:         data.Nombre         || '',
    NomComercial:   data.NomComercial   || '',
    TipoPuntoVenta: data.TipoPuntoVenta || 'TIENDA',
    Correo:         data.Correo         || '',
    Telefono:       data.Telefono       || '',
    Encargado:      data.Encargado      || '',
    Calle:          data.Calle          || '',
    NumExt:         data.NumExt         || '',
    NumInt:         data.NumInt         || '',
    Colonia:        data.Colonia        || '',
    CP:             data.CP             || '',
    Ciudad:         data.Ciudad         || '',
    idPais:         data.idPais         || '',
    idEstado:       data.idEstado       || '',
    Latitud:        data.Latitud ?? '',
    Longitud:       data.Longitud ?? '',
  } : { ...FORM_VACIO });

  const [paises,  setPaises]  = useState([]);
  const [estados, setEstados] = useState([]);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Cargar catálogo de países al montar
  useEffect(() => {
    api.get('/paises').then(r => setPaises(r.data)).catch(() => {});
  }, []);

  const handlePaisChange = (idPais) => {
    setForm(p => ({ ...p, idPais, idEstado: '' }));
    setEstados([]);
    if (!idPais) return;
    api.get(`/estados?idPais=${idPais}`)
      .then(r => setEstados(r.data))
      .catch(err => console.error('[Sucursales] Error estados:', err?.response?.status));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.Nombre.trim()) { setError('El nombre es requerido'); return; }
    if (!form.idPais)        { setError('El país es requerido');   return; }
    if (!form.idEstado)      { setError('El estado es requerido'); return; }
    setSaving(true); setError('');
    try {
      if (isEdit) {
        await api.put(`/sucursales/puntos-venta/${data.idPuntoVenta}`, form);
        toast.success('Sucursal actualizada', form.NomComercial || form.Nombre);
      } else {
        await api.post('/sucursales/puntos-venta', form);
        toast.success('Sucursal creada', form.NomComercial || form.Nombre);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vida-blue bg-white';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-bold text-gray-800 text-lg">
            {isEdit ? 'Editar tienda' : 'Nueva tienda'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-xl">{error}</p>}

          {/* Identificación */}
          <div className="space-y-3">
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Identificación</p>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Nombre interno *</label>
              <input value={form.Nombre} onChange={e => f('Nombre', e.target.value)}
                className={inputCls} placeholder="Ej: Sucursal Centro" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Nombre comercial</label>
                <input value={form.NomComercial} onChange={e => f('NomComercial', e.target.value)}
                  className={inputCls} placeholder="Nombre para el cliente" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Tipo</label>
                <select value={form.TipoPuntoVenta} onChange={e => f('TipoPuntoVenta', e.target.value)} className={inputCls}>
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Contacto */}
          <div className="space-y-3">
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Contacto</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Teléfono</label>
                <input value={form.Telefono} onChange={e => f('Telefono', e.target.value)}
                  className={inputCls} placeholder="+58 000 0000000" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Correo</label>
                <input type="email" value={form.Correo} onChange={e => f('Correo', e.target.value)}
                  className={inputCls} placeholder="tienda@correo.com" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Encargado</label>
              <input value={form.Encargado} onChange={e => f('Encargado', e.target.value)}
                className={inputCls} placeholder="Nombre del responsable" />
            </div>
          </div>

          {/* Dirección */}
          <div className="space-y-3">
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Dirección</p>

            {/* País → Estado (catálogos) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">País *</label>
                <select value={form.idPais} onChange={e => handlePaisChange(e.target.value)} className={inputCls}>
                  <option value="">— Seleccionar —</option>
                  {paises.map(p => (
                    <option key={p.idPais} value={p.idPais}>{p.NombrePais}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Estado *</label>
                <select value={form.idEstado} onChange={e => f('idEstado', e.target.value)}
                  className={inputCls} disabled={!form.idPais}>
                  <option value="">— Seleccionar —</option>
                  {estados.map(e => (
                    <option key={e.idEstado} value={e.idEstado}>{e.NombreEstado}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-600 mb-1">Calle</label>
                <input value={form.Calle} onChange={e => f('Calle', e.target.value)} className={inputCls}/>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Núm. Ext</label>
                <input value={form.NumExt} onChange={e => f('NumExt', e.target.value)} className={inputCls}/>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Núm. Int</label>
                <input value={form.NumInt} onChange={e => f('NumInt', e.target.value)} className={inputCls}/>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-600 mb-1">Colonia / Urb.</label>
                <input value={form.Colonia} onChange={e => f('Colonia', e.target.value)} className={inputCls}/>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">C.P.</label>
                <input value={form.CP} onChange={e => f('CP', e.target.value)} className={inputCls}/>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Ciudad</label>
                <input value={form.Ciudad} onChange={e => f('Ciudad', e.target.value)} className={inputCls}/>
              </div>
            </div>

            <MapaPicker
              lat={form.Latitud}
              lng={form.Longitud}
              onChange={(la, ln) => setForm(p => ({ ...p, Latitud: la, Longitud: ln }))}
            />
          </div>
        </form>

        <div className="p-5 border-t flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 text-white rounded-xl py-2.5 text-sm font-bold disabled:opacity-50 hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #54C4E0, #5BBE6A)' }}>
            {saving ? 'Guardando...' : (isEdit ? 'Actualizar' : 'Crear tienda')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────
export default function Sucursales() {
  const { usuario } = useAuthStore();
  const toast = useToast();
  const puedeEscribir = ROLES_ESCRITURA.includes(usuario?.TipoUsuario);
  // Crear, activar y desactivar tiendas es de la red (cada rol en su región)
  const esRed = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN_ESTADO'].includes(usuario?.TipoUsuario);

  const [sucursales, setSucursales] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(null);
  const [fiscal, setFiscal]         = useState(null); // idPuntoVenta

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/sucursales/puntos-venta');
      setSucursales(r.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function toggleStatus(s) {
    const nuevo = s.StatusPuntoVenta === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    try {
      await api.patch(`/sucursales/puntos-venta/${s.idPuntoVenta}/toggle`, { status: nuevo });
      toast.success(
        nuevo === 'ACTIVO' ? 'Sucursal activada' : 'Sucursal desactivada',
        s.NomComercial || s.Nombre
      );
      cargar();
    } catch (err) {
      toast.error('Error al cambiar status', err.response?.data?.error);
    }
  }

  function buildDireccion(s) {
    const partes = [
      s.Calle && s.NumExt ? `${s.Calle} ${s.NumExt}` : s.Calle,
      s.Colonia,
      [s.Ciudad, s.NombreEstado, s.NombrePais].filter(Boolean).join(', '),
    ].filter(Boolean);
    return partes.join(', ');
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Tiendas</h1>
          <p className="text-gray-500 text-sm mt-1">Gestiona las tiendas y sus datos de contacto</p>
        </div>
        {esRed && (
          <button onClick={() => setModal({})}
            className="flex items-center gap-2 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition"
            style={{ background: 'linear-gradient(135deg, #54C4E0, #5BBE6A)' }}>
            <Plus size={16}/> Nueva tienda
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-16">Cargando...</p>
      ) : sucursales.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Store size={52} className="mx-auto mb-3 opacity-20"/>
          <p className="font-bold text-gray-500">No hay tiendas registradas</p>
          {esRed && (
            <button onClick={() => setModal({})} className="mt-4 text-vida-blue text-sm underline">
              Crear la primera tienda
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sucursales.map(s => (
            <div key={s.idPuntoVenta}
              className={`bg-white rounded-2xl border-2 p-5 shadow-sm transition-all ${
                s.StatusPuntoVenta === 'ACTIVO' ? 'border-gray-100 hover:shadow-md' : 'border-gray-100 opacity-60'
              }`}>
              {/* Cabecera */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
                    style={{ background: 'linear-gradient(135deg, #54C4E0, #5BBE6A)' }}>
                    <Store size={18}/>
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 leading-tight">
                      {s.NomComercial || s.Nombre}
                    </p>
                    <p className="text-xs text-gray-400">{s.TipoPuntoVenta}</p>
                  </div>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  s.StatusPuntoVenta === 'ACTIVO' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                }`}>
                  {s.StatusPuntoVenta === 'ACTIVO' ? 'Activa' : 'Inactiva'}
                </span>
              </div>

              {/* Geo badge */}
              {(s.NombreEstado || s.NombrePais) && (
                <div className="flex items-center gap-1 mb-2">
                  <MapPin size={11} className="text-vida-blue shrink-0"/>
                  <span className="text-xs text-vida-blue font-semibold">
                    {[s.NombreEstado, s.NombrePais].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}

              {/* Info */}
              <div className="space-y-1.5 text-xs text-gray-500">
                {buildDireccion(s) && (
                  <div className="flex items-start gap-1.5">
                    <MapPin size={12} className="text-gray-300 shrink-0 mt-0.5"/>
                    <span className="line-clamp-2">{buildDireccion(s)}</span>
                  </div>
                )}
                {s.Encargado && (
                  <div className="flex items-center gap-1.5">
                    <User size={12} className="text-gray-300 shrink-0"/>
                    <span>{s.Encargado}</span>
                  </div>
                )}
                {s.Telefono && (
                  <div className="flex items-center gap-1.5">
                    <Phone size={12} className="text-gray-300 shrink-0"/>
                    <span>{s.Telefono}</span>
                  </div>
                )}
                {s.Correo && (
                  <div className="flex items-center gap-1.5">
                    <Mail size={12} className="text-gray-300 shrink-0"/>
                    <span className="truncate">{s.Correo}</span>
                  </div>
                )}
              </div>

              {/* Acciones */}
              {puedeEscribir && (
                <div className="flex gap-2 mt-4 pt-3 border-t border-gray-50">
                  <button onClick={() => setModal({ data: s })}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-vida-blue hover:bg-blue-50 rounded-lg py-1.5 transition">
                    <Edit2 size={13}/> Editar
                  </button>
                  <button onClick={() => setFiscal(s.idPuntoVenta)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-vida-blue hover:bg-blue-50 rounded-lg py-1.5 transition">
                    <FileText size={13}/> Fiscal
                  </button>
                  {esRed && <button onClick={() => toggleStatus(s)}
                    className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg py-1.5 transition ${
                      s.StatusPuntoVenta === 'ACTIVO'
                        ? 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                        : 'text-green-600 hover:bg-green-50'
                    }`}>
                    {s.StatusPuntoVenta === 'ACTIVO'
                      ? <><Power size={13}/> Desactivar</>
                      : <><CheckCircle size={13}/> Activar</>
                    }
                  </button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </div>

      {fiscal !== null && <ModalDatosFiscales idPuntoVenta={fiscal} onCerrar={() => setFiscal(null)} />}

      {modal !== null && (
        <ModalSucursal
          data={modal.data}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); cargar(); }}
        />
      )}
    </div>
  );
}
