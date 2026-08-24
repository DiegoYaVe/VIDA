// src/pages/Corporativo.jsx
// Portal Corporativo (T-0052): tablero de expansión de la red + gestión de
// tiendas con estado de onboarding + alta guiada de tienda y empresario.
import { useState, useEffect, useCallback } from 'react';
import {
  Building2, Store, Target, TrendingUp, MapPin, Plus, X, Save,
  RefreshCw, ArrowRight, User, CheckCircle, Clock, Ban, Search, Rocket,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import api from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';

const ROLES_ESCRITURA = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN'];
const NUM = (v) => Number(v || 0).toLocaleString('es-VE');

const ONB = {
  PROSPECTO:  { label: 'Prospecto',  color: 'bg-gray-100 text-gray-600',    dot: 'bg-gray-400',   icon: Search },
  EN_PROCESO: { label: 'En proceso', color: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500',  icon: Clock },
  ACTIVA:     { label: 'Activa',     color: 'bg-green-100 text-green-700',  dot: 'bg-green-500',  icon: CheckCircle },
  SUSPENDIDA: { label: 'Suspendida', color: 'bg-red-100 text-red-600',      dot: 'bg-red-500',    icon: Ban },
};
const FLUJO = ['PROSPECTO', 'EN_PROCESO', 'ACTIVA', 'SUSPENDIDA'];

function Spinner() {
  return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-vida-blue/30 border-t-vida-blue rounded-full animate-spin" /></div>;
}

function OnbBadge({ estado }) {
  const c = ONB[estado] || { label: estado, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
  return <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${c.color}`}><span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />{c.label}</span>;
}

// ─── Medidor de avance hacia la meta ──────────────────────────────────────────
function MedidorMeta({ activas, meta, porcentaje }) {
  const pct = Math.min(100, porcentaje);
  return (
    <div className="rounded-2xl p-6 text-white shadow-md" style={{ background: 'linear-gradient(135deg, #0A1E3F, #16345E)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Target size={18} className="opacity-80" />
        <span className="text-xs font-semibold uppercase tracking-wide opacity-80">Avance hacia la meta 2035</span>
      </div>
      <div className="flex items-end gap-3">
        <span className="text-4xl font-black leading-none">{NUM(activas)}</span>
        <span className="text-lg opacity-70 mb-0.5">/ {NUM(meta)} tiendas</span>
      </div>
      <div className="mt-4 h-3 rounded-full bg-white/15 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0.5, pct)}%`, background: 'linear-gradient(90deg, #54C4E0, #5BBE6A)' }} />
      </div>
      <p className="text-xs opacity-80 mt-2">{porcentaje}% de la red desplegada · faltan {NUM(meta - activas)} tiendas</p>
    </div>
  );
}

// ─── Wizard de onboarding: tienda + empresario ────────────────────────────────
function WizardOnboarding({ onClose, onListo }) {
  const { pantallas } = useAuthStore();
  const [paso, setPaso] = useState(1);
  const [tienda, setTienda] = useState({ NomComercial: '', RazonSocial: '', Encargado: '', Telefono: '', Correo: '', idPais: '', idEstado: '', idCiudad: '', Ciudad: '', Calle: '' });
  const [emp, setEmp] = useState({ Nombre: '', Apellidos: '', Correo: '', Cve: '' });
  const [idPuntoVenta, setIdPV] = useState(null);
  const [proc, setProc] = useState(false);
  const [error, setError] = useState('');
  const [paises, setPaises]   = useState([]);
  const [estados, setEstados] = useState([]);
  const [ciudades, setCiudades] = useState([]);

  useEffect(() => {
    api.get('/paises').then(r => {
      setPaises(r.data);
      // País por defecto: Venezuela
      const ve = r.data.find(p => /venezuela/i.test(p.NombrePais));
      if (ve) {
        setTienda(s => ({ ...s, idPais: String(ve.idPais) }));
        api.get(`/estados?idPais=${ve.idPais}`).then(er => setEstados(er.data)).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const setT = (k, v) => setTienda(s => ({ ...s, [k]: v }));
  const setE = (k, v) => setEmp(s => ({ ...s, [k]: v }));

  // Lada telefónica del país elegido (ej. +58). Sirve de prefijo en Teléfono.
  const ladaActual = paises.find(p => String(p.idPais) === String(tienda.idPais))?.LadaTelefono || '';

  // País → carga estados en cascada y limpia estado/ciudad elegidos
  const cambiarPais = (idPais) => {
    setTienda(s => ({ ...s, idPais, idEstado: '', idCiudad: '', Ciudad: '' }));
    setEstados([]); setCiudades([]);
    if (idPais) api.get(`/estados?idPais=${idPais}`).then(r => setEstados(r.data)).catch(() => {});
  };

  // Estado → carga ciudades del estado y limpia la ciudad elegida
  const cambiarEstado = (idEstado) => {
    setTienda(s => ({ ...s, idEstado, idCiudad: '', Ciudad: '' }));
    setCiudades([]);
    if (idEstado) api.get(`/ciudades?idEstado=${idEstado}`).then(r => setCiudades(r.data)).catch(() => {});
  };

  // Ciudad (select) → guarda id + nombre (para display sin JOIN)
  const cambiarCiudad = (idCiudad) => {
    const c = ciudades.find(x => String(x.idCiudad) === String(idCiudad));
    setTienda(s => ({ ...s, idCiudad, Ciudad: c ? c.NombreCiudad : '' }));
  };

  // Paso 1 → 2: solo valida los datos de la tienda (aún NO se crea nada)
  function irAEmpresario() {
    if (!tienda.NomComercial.trim()) { setError('El nombre comercial es obligatorio'); return; }
    if (!tienda.idPais)   { setError('Selecciona el país'); return; }
    if (!tienda.idEstado) { setError('Selecciona el estado'); return; }
    setError('');
    setPaso(2);
  }

  // Paso 2: crea la tienda y su empresario juntos (hasta el final, para poder
  // regresar sin duplicar). Si la tienda ya se creó (reintento), no la duplica.
  async function crearTodo() {
    if (!emp.Nombre.trim() || !emp.Correo.trim() || !emp.Cve.trim()) { setError('Nombre, correo y usuario son obligatorios'); return; }
    setProc(true); setError('');
    try {
      let idPV = idPuntoVenta;
      if (!idPV) {
        const r = await api.post('/corporativo/tiendas', {
          ...tienda,
          // Guarda el teléfono con su lada (ej. +58 424...) si el usuario capturó número
          Telefono: tienda.Telefono?.trim() ? `${ladaActual} ${tienda.Telefono.trim()}`.trim() : null,
          idPais:   tienda.idPais   ? Number(tienda.idPais)   : null,
          idEstado: tienda.idEstado ? Number(tienda.idEstado) : null,
          idCiudad: tienda.idCiudad ? Number(tienda.idCiudad) : null,
        });
        idPV = r.data.idPuntoVenta;
        setIdPV(idPV);
      }
      await api.post('/usuarios', {
        Nombre: emp.Nombre.trim(), Apellidos: emp.Apellidos.trim(),
        Correo: emp.Correo.trim(), Cve: emp.Cve.trim(),
        TipoUsuario: 'ADMIN', idPuntoVenta: idPV,
        // El empresario es admin de SU tienda: recibe las pantallas operativas
        // pero NO el Portal Corporativo (no debe ver toda la red ni todas las tiendas)
        pantallas: (pantallas || []).filter(p => p.Link !== '/corporativo').map(p => p.idPantalla),
      });
      setPaso(3);
      onListo?.();
    } catch (e) {
      setError(e.response?.data?.error || 'Error al crear la tienda o el empresario');
    } finally { setProc(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-2">
            <Rocket size={18} className="text-vida-blue" />
            <h3 className="font-bold text-gray-800">Dar de alta una tienda</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {/* Progreso de pasos */}
        <div className="flex items-center gap-2 px-5 pt-4">
          {['Tienda', 'Empresario', 'Listo'].map((lbl, i) => (
            <div key={i} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${paso > i ? 'bg-vida-green text-white' : paso === i + 1 ? 'bg-vida-blue text-white' : 'bg-gray-100 text-gray-400'}`}>{i + 1}</div>
              <span className={`text-xs font-semibold ${paso === i + 1 ? 'text-vida-blue' : 'text-gray-400'}`}>{lbl}</span>
              {i < 2 && <div className="flex-1 h-0.5 bg-gray-100" />}
            </div>
          ))}
        </div>

        <div className="p-5 space-y-3">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          {paso === 1 && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Nombre comercial *</label>
                <input value={tienda.NomComercial} onChange={e => setT('NomComercial', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Ej. VIDA Chacao" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Razón social</label>
                <input value={tienda.RazonSocial} onChange={e => setT('RazonSocial', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Ej. Comercializadora VIDA Chacao, C.A." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Encargado</label>
                  <input value={tienda.Encargado} onChange={e => setT('Encargado', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Teléfono</label>
                  <div className="flex">
                    {ladaActual && <span className="inline-flex items-center px-2 border border-r-0 border-gray-200 rounded-l-lg bg-gray-50 text-sm text-gray-500 font-semibold">{ladaActual}</span>}
                    <input value={tienda.Telefono} onChange={e => setT('Telefono', e.target.value)}
                      className={`w-full border border-gray-200 px-3 py-2 text-sm ${ladaActual ? 'rounded-r-lg' : 'rounded-lg'}`}
                      placeholder="424 000 0000" /></div></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">País *</label>
                  <select value={tienda.idPais} onChange={e => cambiarPais(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">— Seleccionar —</option>
                    {paises.map(p => <option key={p.idPais} value={p.idPais}>{p.NombrePais}</option>)}
                  </select></div>
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Estado *</label>
                  <select value={tienda.idEstado} onChange={e => cambiarEstado(e.target.value)} disabled={!tienda.idPais}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-50">
                    <option value="">— Seleccionar —</option>
                    {estados.map(e => <option key={e.idEstado} value={e.idEstado}>{e.NombreEstado}</option>)}
                  </select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Ciudad</label>
                  {ciudades.length > 0 ? (
                    <select value={tienda.idCiudad} onChange={e => cambiarCiudad(e.target.value)} disabled={!tienda.idEstado}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-50">
                      <option value="">— Seleccionar —</option>
                      {ciudades.map(c => <option key={c.idCiudad} value={c.idCiudad}>{c.NombreCiudad}</option>)}
                    </select>
                  ) : (
                    // El estado no tiene ciudades en el catálogo: se captura a mano
                    <input value={tienda.Ciudad} onChange={e => setT('Ciudad', e.target.value)} disabled={!tienda.idEstado}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
                      placeholder={tienda.idEstado ? 'Escribe la ciudad' : 'Elige un estado primero'} />
                  )}
                </div>
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Correo de la tienda</label>
                  <input value={tienda.Correo} onChange={e => setT('Correo', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Dirección</label>
                <input value={tienda.Calle} onChange={e => setT('Calle', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></div>
              <p className="text-xs text-gray-400">La tienda arranca en estado <b>En proceso</b> hasta que la actives.</p>
            </>
          )}

          {paso === 2 && (
            <>
              <p className="text-xs text-gray-500 bg-blue-50 rounded-lg px-3 py-2">Ahora crea al empresario (dueño) que administrará la tienda. Al confirmar se crearán la tienda y su empresario.</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Nombre *</label>
                  <input value={emp.Nombre} onChange={e => setE('Nombre', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Apellidos</label>
                  <input value={emp.Apellidos} onChange={e => setE('Apellidos', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Correo *</label>
                <input value={emp.Correo} onChange={e => setE('Correo', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="empresario@correo.com" /></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Usuario (cve) *</label>
                <input value={emp.Cve} onChange={e => setE('Cve', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="empresario1" /></div>
              <p className="text-xs text-gray-400">Se le enviará un correo con su contraseña temporal. Rol: <b>ADMIN</b> de su tienda.</p>
            </>
          )}

          {paso === 3 && (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <CheckCircle size={28} className="text-green-600" />
              </div>
              <p className="font-bold text-gray-800">¡Tienda y empresario creados!</p>
              <p className="text-sm text-gray-500 mt-1">La tienda quedó en <b>En proceso</b>. Actívala cuando complete su onboarding.</p>
            </div>
          )}
        </div>

        <div className="p-5 border-t flex justify-between gap-2">
          {/* Botón Atrás (paso 2) */}
          {paso === 2
            ? <button onClick={() => { setError(''); setPaso(1); }} disabled={proc}
                className="flex items-center gap-2 border border-gray-200 text-gray-600 rounded-xl px-4 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">
                ← Atrás
              </button>
            : <span />}
          {paso === 1 && <button onClick={irAEmpresario} className="flex items-center gap-2 bg-vida-blue text-white rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90"><ArrowRight size={15} /> Siguiente</button>}
          {paso === 2 && <button onClick={crearTodo} disabled={proc} className="flex items-center gap-2 bg-vida-green text-white rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"><Save size={15} /> {proc ? 'Creando…' : 'Crear tienda y empresario'}</button>}
          {paso === 3 && <button onClick={onClose} className="ml-auto bg-vida-blue text-white rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90">Cerrar</button>}
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function Corporativo() {
  const { usuario } = useAuthStore();
  const puedeEscribir = ROLES_ESCRITURA.includes(usuario?.TipoUsuario);
  const [tablero, setTablero] = useState(null);
  const [tiendas, setTiendas] = useState([]);
  const [cargando, setCarg] = useState(true);
  const [wizard, setWizard] = useState(false);
  const [q, setQ] = useState('');

  const cargar = useCallback(async () => {
    setCarg(true);
    try {
      const [t, ts] = await Promise.all([
        api.get('/corporativo/tablero'),
        api.get('/corporativo/tiendas'),
      ]);
      setTablero(t.data);
      setTiendas(ts.data);
    } catch { /* sin datos */ }
    finally { setCarg(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function avanzarEstado(t, nuevo) {
    try { await api.patch(`/corporativo/tiendas/${t.idPuntoVenta}/onboarding`, { EstadoOnboarding: nuevo }); cargar(); }
    catch { alert('Error al cambiar el estado'); }
  }

  const grafData = (tablero?.crecimientoMensual || []).map(r => ({
    mes: r.Mes.slice(5), tiendas: r.Total,
  }));
  const filtradas = tiendas.filter(t => !q.trim() || (t.NomComercial || '').toLowerCase().includes(q.toLowerCase()) || (t.Ciudad || '').toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2"><Building2 size={22} className="text-vida-blue" /> Portal Corporativo</h1>
          <p className="text-xs text-gray-400 mt-0.5">Expansión de la red y gestión de tiendas</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={cargar} className="flex items-center gap-2 text-sm text-gray-500 hover:text-vida-blue border border-gray-200 px-3 py-2 rounded-xl"><RefreshCw size={14} /></button>
          {puedeEscribir && (
            <button onClick={() => setWizard(true)} className="flex items-center gap-2 bg-vida-blue text-white text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-90"><Plus size={15} /> Dar de alta tienda</button>
          )}
        </div>
      </div>

      {cargando ? <Spinner /> : (
        <div className="p-6 space-y-5">
          {/* Fila superior: meta + estados */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              {tablero && <MedidorMeta activas={tablero.activas} meta={tablero.meta} porcentaje={tablero.porcentajeMeta} />}
            </div>
            <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {FLUJO.map(e => {
                const cfg = ONB[e]; const Icon = cfg.icon;
                return (
                  <div key={e} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${cfg.color}`}><Icon size={17} /></div>
                    <p className="text-2xl font-black text-gray-900">{NUM(tablero?.porEstado?.[e] || 0)}</p>
                    <p className="text-xs text-gray-400">{cfg.label}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Crecimiento + geografía */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-vida-blue" /> Crecimiento de la red (12 meses)</h3>
              {grafData.length === 0 ? <div className="h-48 flex items-center justify-center text-gray-300 text-sm">Sin altas en el período</div> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={grafData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={v => [v, 'Tiendas nuevas']} />
                    <Bar dataKey="tiendas" fill="#0A1E3F" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><MapPin size={16} className="text-vida-blue" /> Por geografía</h3>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {(tablero?.porGeografia || []).map((g, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 truncate">{g.Estado}{g.Pais !== '—' ? `, ${g.Pais}` : ''}</span>
                    <span className="font-bold text-gray-900">{g.Total}</span>
                  </div>
                ))}
                {(!tablero?.porGeografia?.length) && <p className="text-gray-300 text-sm text-center py-6">Sin datos</p>}
              </div>
            </div>
          </div>

          {/* Tiendas de la red */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-bold text-gray-800 flex items-center gap-2"><Store size={16} className="text-vida-blue" /> Tiendas de la red ({tiendas.length})</h3>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar tienda o ciudad…" className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-xl w-56" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    {['Tienda', 'Empresario', 'Ciudad', 'Estado', 'Acción'].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtradas.map(t => {
                    // Siguiente acción de onboarding sugerida
                    const siguiente = t.EstadoOnboarding === 'PROSPECTO' ? 'EN_PROCESO'
                                    : t.EstadoOnboarding === 'EN_PROCESO' ? 'ACTIVA' : null;
                    return (
                      <tr key={t.idPuntoVenta} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-800">{t.NomComercial} {t.EsMatriz ? <span className="text-[10px] bg-vida-blue text-white px-1.5 py-0.5 rounded-full ml-1">MATRIZ</span> : null}</p>
                          {t.Telefono && <p className="text-xs text-gray-400">{t.Telefono}</p>}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{t.Empresario?.trim() || <span className="text-gray-300">sin asignar</span>}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{t.Ciudad || '—'}{t.Estado ? `, ${t.Estado}` : ''}</td>
                        <td className="px-4 py-3"><OnbBadge estado={t.EstadoOnboarding} /></td>
                        <td className="px-4 py-3">
                          {puedeEscribir && (
                            <div className="flex items-center gap-1">
                              {siguiente && (
                                <button onClick={() => avanzarEstado(t, siguiente)}
                                  className="text-xs font-semibold bg-vida-blue text-white px-2.5 py-1 rounded-lg hover:opacity-90">
                                  {siguiente === 'EN_PROCESO' ? 'Iniciar' : 'Activar'}
                                </button>
                              )}
                              {t.EstadoOnboarding === 'ACTIVA' && (
                                <button onClick={() => avanzarEstado(t, 'SUSPENDIDA')} className="text-xs text-red-500 px-2 py-1 rounded-lg hover:bg-red-50">Suspender</button>
                              )}
                              {t.EstadoOnboarding === 'SUSPENDIDA' && (
                                <button onClick={() => avanzarEstado(t, 'ACTIVA')} className="text-xs text-green-600 px-2 py-1 rounded-lg hover:bg-green-50">Reactivar</button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtradas.length === 0 && <p className="text-center text-gray-400 py-10 text-sm">Sin tiendas</p>}
            </div>
          </div>
        </div>
      )}

      {wizard && <WizardOnboarding onClose={() => setWizard(false)} onListo={cargar} />}
    </div>
  );
}
