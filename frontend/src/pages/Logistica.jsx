// src/pages/Logistica.jsx
// Panel de Logística / Repartidores (T-0033, T-0034, T-0036)
// 3 tabs: Repartidores (CRUD + liquidar), Mapa en vivo, Configuración de delivery.
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Truck, MapPin, Settings, RefreshCw, Plus, Pencil, Wallet,
  Phone, Star, X, Save, AlertTriangle, DollarSign, Bike, Car,
  CheckCircle, Circle, Package,
} from 'lucide-react';
import api from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';
import { useWebSocket } from '../hooks/useWebSocket.js';

const USD = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ROLES_ESCRITURA = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN'];

const STATUS_REP = {
  DISPONIBLE: { label: 'Disponible', dot: 'bg-green-500',  text: 'text-green-700',  bg: 'bg-green-50' },
  OCUPADO:    { label: 'Ocupado',    dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50' },
  INACTIVO:   { label: 'Inactivo',   dot: 'bg-gray-300',   text: 'text-gray-500',   bg: 'bg-gray-50' },
};

function IconVehiculo({ vehiculo, size = 14 }) {
  const v = (vehiculo || '').toLowerCase();
  if (v.includes('carro') || v.includes('auto')) return <Car size={size} />;
  if (v.includes('bici')) return <Bike size={size} />;
  return <Truck size={size} />;
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-vida-blue/30 border-t-vida-blue rounded-full animate-spin" />
    </div>
  );
}

// ─── Modal alta/edición de repartidor ─────────────────────────────────────────
function ModalRepartidor({ repartidor, onClose, onGuardado }) {
  const esEdicion = !!repartidor;
  const [form, setForm] = useState({
    Nombre:        repartidor?.Nombre        || '',
    Telefono:      repartidor?.Telefono      || '',
    Vehiculo:      repartidor?.Vehiculo      || 'Moto',
    PlacaVehiculo: repartidor?.PlacaVehiculo || '',
    ComisionPct:   repartidor?.ComisionPct   ?? '',
    Status:        repartidor?.Status        || 'ACTIVO',
    Contrasena:    '',
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function guardar() {
    if (!form.Nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setGuardando(true); setError('');
    try {
      const payload = {
        Nombre: form.Nombre.trim(),
        Telefono: form.Telefono.trim() || null,
        Vehiculo: form.Vehiculo || null,
        PlacaVehiculo: form.PlacaVehiculo.trim() || null,
        ComisionPct: form.ComisionPct === '' ? null : Number(form.ComisionPct),
      };
      if (esEdicion) {
        await api.put(`/delivery/admin/repartidores/${repartidor.idRepartidor}`, { ...payload, Status: form.Status });
        // Cambiar contraseña solo si el admin escribió una nueva
        if (form.Contrasena.trim()) {
          if (form.Contrasena.trim().length < 6) { setError('La contraseña debe tener mínimo 6 caracteres'); setGuardando(false); return; }
          await api.patch(`/delivery/admin/repartidores/${repartidor.idRepartidor}/contrasena`, { Contrasena: form.Contrasena.trim() });
        }
      } else {
        await api.post('/delivery/admin/repartidores', payload);
      }
      onGuardado();
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar');
    } finally { setGuardando(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-bold text-gray-800">{esEdicion ? 'Editar repartidor' : 'Nuevo repartidor'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-3">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Nombre *</label>
            <input value={form.Nombre} onChange={e => set('Nombre', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Nombre completo" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Teléfono</label>
              <input value={form.Telefono} onChange={e => set('Telefono', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="0412-0000000" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Comisión %</label>
              <input type="number" value={form.ComisionPct} onChange={e => set('ComisionPct', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="15 (global si vacío)" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Vehículo</label>
              <select value={form.Vehiculo} onChange={e => set('Vehiculo', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                {['Moto', 'Bicicleta', 'Carro'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Placa</label>
              <input value={form.PlacaVehiculo} onChange={e => set('PlacaVehiculo', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="ABC-123" />
            </div>
          </div>
          {esEdicion && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Estado</label>
              <select value={form.Status} onChange={e => set('Status', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="ACTIVO">Activo</option>
                <option value="INACTIVO">Inactivo</option>
              </select>
            </div>
          )}
          {esEdicion && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Nueva contraseña</label>
              <input type="password" value={form.Contrasena} onChange={e => set('Contrasena', e.target.value)}
                autoComplete="new-password"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Mínimo 6 caracteres" />
              <p className="text-xs text-gray-400 mt-1">Déjalo vacío para no cambiarla. El repartidor la usará en su próximo inicio de sesión.</p>
            </div>
          )}
        </div>
        <div className="p-5 border-t flex gap-2 justify-end">
          <button onClick={onClose} className="border border-gray-200 text-gray-600 rounded-xl px-4 py-2 text-sm hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando}
            className="flex items-center gap-2 bg-vida-blue text-white rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
            <Save size={15} /> {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TAB: Repartidores ─────────────────────────────────────────────────────────
function TabRepartidores({ puedeEscribir }) {
  const [reps, setReps]       = useState(null);
  const [cargando, setCarg]   = useState(true);
  const [modal, setModal]     = useState(null); // null | {} (nuevo) | repartidor (editar)
  const [liquidando, setLiq]  = useState(null);

  const cargar = useCallback(async () => {
    setCarg(true);
    try {
      const r = await api.get('/delivery/admin/repartidores');
      setReps(r.data);
    } catch { setReps([]); }
    finally { setCarg(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function liquidar(rep) {
    if (!window.confirm(`Liquidar a ${rep.Nombre}? Se registrará el saldo de ${USD(rep.SaldoPendiente)} y se pondrá en cero.`)) return;
    setLiq(rep.idRepartidor);
    try {
      await api.post(`/delivery/admin/liquidar/${rep.idRepartidor}`, {});
      await cargar();
    } catch (e) {
      alert(e.response?.data?.error || 'Error al liquidar');
    } finally { setLiq(null); }
  }

  if (cargando) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{reps.length} repartidores registrados</p>
        <div className="flex gap-2">
          <button onClick={cargar} className="flex items-center gap-2 text-sm text-gray-500 hover:text-vida-blue border border-gray-200 px-3 py-2 rounded-xl">
            <RefreshCw size={14} /> Actualizar
          </button>
          {puedeEscribir && (
            <button onClick={() => setModal({})}
              className="flex items-center gap-2 bg-vida-blue text-white text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-90">
              <Plus size={15} /> Nuevo repartidor
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                {['Repartidor', 'Vehículo', 'Comisión', 'Estado', 'Saldo pendiente', ''].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {reps.map(r => {
                const st = STATUS_REP[r.StatusRepartidor] || STATUS_REP.INACTIVO;
                return (
                  <tr key={r.idRepartidor} className={`hover:bg-gray-50/50 ${r.Status !== 'ACTIVO' ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-800">{r.Nombre}</p>
                      {r.Telefono && <p className="text-xs text-gray-400 flex items-center gap-1"><Phone size={10} />{r.Telefono}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-gray-600">
                        <IconVehiculo vehiculo={r.Vehiculo} />
                        {r.Vehiculo || '—'} {r.PlacaVehiculo ? `· ${r.PlacaVehiculo}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.ComisionPct != null ? `${Number(r.ComisionPct)}%` : <span className="text-gray-300">global</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${Number(r.SaldoPendiente) > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                        {USD(r.SaldoPendiente)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {puedeEscribir && (
                        <div className="flex items-center gap-1 justify-end">
                          {Number(r.SaldoPendiente) > 0 && (
                            <button onClick={() => liquidar(r)} disabled={liquidando === r.idRepartidor}
                              className="flex items-center gap-1 bg-emerald-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50">
                              <Wallet size={12} /> Liquidar
                            </button>
                          )}
                          <button onClick={() => setModal(r)}
                            className="p-1.5 text-gray-400 hover:text-vida-blue hover:bg-gray-100 rounded-lg">
                            <Pencil size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {reps.length === 0 && <p className="text-center text-gray-400 py-10 text-sm">Sin repartidores. Crea el primero con "Nuevo repartidor".</p>}
        </div>
      </div>

      {modal && (
        <ModalRepartidor
          repartidor={modal.idRepartidor ? modal : null}
          onClose={() => setModal(null)}
          onGuardado={() => { setModal(null); cargar(); }}
        />
      )}
    </div>
  );
}

// ─── TAB: Mapa en vivo ─────────────────────────────────────────────────────────
// Key web de Google Maps (Maps JavaScript API). Si no está, cae a Leaflet gratis.
const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';

// Mapa con Google Maps JavaScript API
function mapaHTMLGoogle(key) {
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%;background:#eef2f6;}</style>
</head><body><div id="map"></div>
<script>
var map, capas=[], info;
function svg(color,size){
  return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="'+size+'" height="'+size+'"><circle cx="'+(size/2)+'" cy="'+(size/2)+'" r="'+(size/2-3)+'" fill="'+color+'" stroke="#fff" stroke-width="3"/></svg>');
}
function pin(pos,color,size,emoji,titulo,html){
  var m=new google.maps.Marker({position:pos,map:map,title:titulo,
    icon:{url:svg(color,size),scaledSize:new google.maps.Size(size,size),anchor:new google.maps.Point(size/2,size/2),labelOrigin:new google.maps.Point(size/2,size/2)},
    label:{text:emoji,fontSize:(size*0.45)+'px'}});
  if(html){ m.addListener('click',function(){ info.setContent(html); info.open(map,m); }); }
  capas.push(m); return m;
}
window.pintar = function(data){
  capas.forEach(function(c){ c.setMap(null); }); capas=[];
  var b=new google.maps.LatLngBounds(), n=0;
  (data.repartidores||[]).forEach(function(r){
    if(r.UltimaLatitud==null) return;
    var pos={lat:+r.UltimaLatitud,lng:+r.UltimaLongitud};
    pin(pos, r.PedidosActivos>0?'#E67E22':'#5BBE6A', 36, '🛵', r.Nombre,
      '<b>'+r.Nombre+'</b><br>'+(r.PedidosActivos>0?r.PedidosActivos+' pedido(s) activos':'disponible'));
    b.extend(pos); n++;
  });
  (data.pedidos||[]).forEach(function(p){
    if(p.SucursalLat!=null){ var s={lat:+p.SucursalLat,lng:+p.SucursalLon}; pin(s,'#0A1E3F',28,'🏪','Sucursal','Sucursal: '+(p.NombreSucursal||'')); b.extend(s); n++; }
    if(p.EntregaLat!=null){ var e={lat:+p.EntregaLat,lng:+p.EntregaLon};
      var eta = (p.MinutosRestantes!=null && p.MinutosRestantes>=0) ? '<br>⏱ llega en ~'+p.MinutosRestantes+' min' : '';
      pin(e,'#8E44AD',28,'🏠','Entrega','<b>Pedido #'+p.idPedido+'</b><br>'+(p.NombreCliente||'')+'<br>'+(p.DireccionEntrega||'')+(p.NombreRepartidor?'<br>🛵 '+p.NombreRepartidor:'')+eta); b.extend(e); n++; }
    if(p.SucursalLat!=null && p.EntregaLat!=null){
      var l=new google.maps.Polyline({path:[{lat:+p.SucursalLat,lng:+p.SucursalLon},{lat:+p.EntregaLat,lng:+p.EntregaLon}],
        strokeColor:'#94A3B8',strokeOpacity:0.8,strokeWeight:2,map:map}); capas.push(l);
    }
  });
  if(n>=2 && (data.reajustar || !window._ajustado)){ map.fitBounds(b,60); window._ajustado=true; }
  else if(n===1 && data.reajustar){ map.setCenter(b.getCenter()); map.setZoom(15); }
};
window.initMap = function(){
  map=new google.maps.Map(document.getElementById('map'),{center:{lat:10.4806,lng:-66.9036},zoom:12,disableDefaultUI:false,streetViewControl:false,mapTypeControl:false});
  info=new google.maps.InfoWindow();
  window.parent.postMessage({tipo:'mapa-listo'},'*');
};
</script>
<script async src="https://maps.googleapis.com/maps/api/js?key=${key}&callback=initMap"></script>
</body></html>`;
}

// Mapa gratis (Leaflet + OpenStreetMap) — fallback cuando no hay key de Google
function mapaHTMLLeaflet() {
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%;background:#eef2f6;}</style>
</head><body><div id="map"></div>
<script>
var map = L.map('map',{zoomControl:true,attributionControl:false}).setView([10.4806,-66.9036],12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
var capas = [];
function icono(html){ return L.divIcon({html:html,className:'',iconAnchor:[16,16]}); }
function pinRep(activos){ var color=activos>0?'#E67E22':'#5BBE6A'; return icono('<div style="background:'+color+';width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35)">🛵</div>'); }
function pinSuc(){ return icono('<div style="background:#0A1E3F;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)">🏪</div>'); }
function pinEnt(){ return icono('<div style="background:#8E44AD;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)">🏠</div>'); }
window.pintar = function(data){
  capas.forEach(function(c){ map.removeLayer(c); }); capas = [];
  var puntos = [];
  (data.repartidores||[]).forEach(function(r){
    if(r.UltimaLatitud==null) return;
    var m = L.marker([r.UltimaLatitud,r.UltimaLongitud],{icon:pinRep(r.PedidosActivos)}).bindPopup('<b>'+r.Nombre+'</b><br>'+(r.PedidosActivos>0?r.PedidosActivos+' pedido(s) activos':'disponible'));
    m.addTo(map); capas.push(m); puntos.push([r.UltimaLatitud,r.UltimaLongitud]);
  });
  (data.pedidos||[]).forEach(function(p){
    if(p.SucursalLat!=null){ var s=L.marker([p.SucursalLat,p.SucursalLon],{icon:pinSuc()}).bindPopup('Sucursal: '+(p.NombreSucursal||'')); s.addTo(map); capas.push(s); puntos.push([p.SucursalLat,p.SucursalLon]); }
    if(p.EntregaLat!=null){ var eta=(p.MinutosRestantes!=null&&p.MinutosRestantes>=0)?'<br>⏱ llega en ~'+p.MinutosRestantes+' min':''; var e=L.marker([p.EntregaLat,p.EntregaLon],{icon:pinEnt()}).bindPopup('<b>Pedido #'+p.idPedido+'</b><br>'+(p.NombreCliente||'')+'<br>'+(p.DireccionEntrega||'')+eta); e.addTo(map); capas.push(e); puntos.push([p.EntregaLat,p.EntregaLon]); }
    if(p.SucursalLat!=null && p.EntregaLat!=null){ var l=L.polyline([[p.SucursalLat,p.SucursalLon],[p.EntregaLat,p.EntregaLon]],{color:'#94A3B8',weight:2,dashArray:'4,6'}); l.addTo(map); capas.push(l); }
  });
  if(puntos.length>=2 && (data.reajustar || !window._ajustado)){ map.fitBounds(L.latLngBounds(puntos).pad(0.25)); window._ajustado=true; }
  else if(puntos.length===1 && data.reajustar){ map.setView(puntos[0],15); }
};
window.parent.postMessage({tipo:'mapa-listo'},'*');
</script></body></html>`;
}

function TabMapa() {
  const iframeRef = useRef(null);
  const [data, setData] = useState(null);
  const [cargando, setCarg] = useState(true);
  const [ultAct, setUltAct] = useState(null);
  const [foco, setFoco] = useState('GENERAL'); // 'GENERAL' | idPedido
  const listoRef = useRef(false);

  // Filtra los datos según el foco (un pedido concreto o toda la red)
  const dataParaMapa = useCallback((d, focoActual, reajustar) => {
    if (!d) return { repartidores: [], pedidos: [], reajustar };
    if (focoActual === 'GENERAL') return { ...d, reajustar };
    const ped = (d.pedidos || []).find(p => String(p.idPedido) === String(focoActual));
    if (!ped) return { ...d, reajustar };
    const rep = (d.repartidores || []).filter(r => String(r.idRepartidor) === String(ped.idRepartidor));
    return { repartidores: rep, pedidos: [ped], reajustar };
  }, []);

  const cargar = useCallback(async () => {
    try {
      const r = await api.get('/delivery/admin/mapa-vivo');
      setData(r.data);
      setUltAct(new Date());
      if (listoRef.current && iframeRef.current) {
        iframeRef.current.contentWindow.pintar(dataParaMapa(r.data, foco, false));
      }
    } catch { /* silencioso */ }
    finally { setCarg(false); }
  }, [foco, dataParaMapa]);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 20_000);
    return () => clearInterval(t);
  }, [cargar]);

  // Al cambiar el foco, repinta y reajusta el encuadre
  useEffect(() => {
    if (listoRef.current && iframeRef.current && data) {
      iframeRef.current.contentWindow.pintar(dataParaMapa(data, foco, true));
    }
  }, [foco]);

  useEffect(() => {
    function onMsg(e) {
      if (e.data?.tipo === 'mapa-listo') {
        listoRef.current = true;
        if (data && iframeRef.current) iframeRef.current.contentWindow.pintar(dataParaMapa(data, foco, true));
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [data, foco, dataParaMapa]);

  const handleWs = useCallback((msg) => {
    if (msg.tipo === 'repartidor_ubicacion' || msg.tipo === 'pedido_status' || msg.tipo === 'pedido_asignado') cargar();
  }, [cargar]);
  useWebSocket(handleWs, true);

  const totalRep = data?.repartidores?.length || 0;
  const enRuta   = (data?.repartidores || []).filter(r => r.PedidosActivos > 0).length;
  const pedidos  = data?.pedidos || [];
  const pedidoFoco = foco !== 'GENERAL' ? pedidos.find(p => String(p.idPedido) === String(foco)) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><Truck size={18} className="text-green-600" /></div>
          <div><p className="text-xs text-gray-400 font-semibold uppercase">En línea</p><p className="text-xl font-black text-gray-900">{totalRep}</p></div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center"><Bike size={18} className="text-orange-600" /></div>
          <div><p className="text-xs text-gray-400 font-semibold uppercase">En ruta</p><p className="text-xl font-black text-gray-900">{enRuta}</p></div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center"><Package size={18} className="text-purple-600" /></div>
          <div><p className="text-xs text-gray-400 font-semibold uppercase">Pedidos en curso</p><p className="text-xl font-black text-gray-900">{pedidos.length}</p></div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-gray-800 flex items-center gap-2"><MapPin size={16} className="text-vida-blue" /> Mapa en vivo</h3>
            {/* Selector General / por pedido */}
            <select value={foco} onChange={e => setFoco(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5">
              <option value="GENERAL">🌐 General (toda la red)</option>
              {pedidos.map(p => (
                <option key={p.idPedido} value={p.idPedido}>
                  #{p.idPedido} · {p.NombreCliente || 'cliente'}{p.MinutosRestantes != null && p.MinutosRestantes >= 0 ? ` · ~${p.MinutosRestantes} min` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {!MAPS_KEY && <span className="text-amber-500 font-semibold">mapa gratis (sin key de Google)</span>}
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> disponible</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /> en ruta</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-vida-blue" /> sucursal</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500" /> entrega</span>
            {ultAct && <span>· {ultAct.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
          </div>
        </div>

        {/* Panel de detalle del pedido enfocado */}
        {pedidoFoco && (
          <div className="px-5 py-2.5 bg-vida-blue-light border-b border-gray-100 flex items-center gap-4 text-sm flex-wrap">
            <span className="font-bold text-vida-blue">Pedido #{pedidoFoco.idPedido}</span>
            {pedidoFoco.NombreCliente && <span className="text-gray-600">👤 {pedidoFoco.NombreCliente}</span>}
            {pedidoFoco.NombreRepartidor && <span className="text-gray-600">🛵 {pedidoFoco.NombreRepartidor}</span>}
            {pedidoFoco.MinutosRestantes != null && pedidoFoco.MinutosRestantes >= 0 && (
              <span className="font-semibold text-vida-blue">⏱ llega en ~{pedidoFoco.MinutosRestantes} min</span>
            )}
            {pedidoFoco.DireccionEntrega && <span className="text-gray-500 text-xs truncate max-w-[280px]">📍 {pedidoFoco.DireccionEntrega}</span>}
          </div>
        )}

        {cargando && !data ? <Spinner /> : (
          <iframe
            ref={iframeRef}
            title="Mapa en vivo"
            srcDoc={MAPS_KEY ? mapaHTMLGoogle(MAPS_KEY) : mapaHTMLLeaflet()}
            style={{ width: '100%', height: '520px', border: 'none' }}
          />
        )}
      </div>
    </div>
  );
}

// ─── TAB: Configuración ────────────────────────────────────────────────────────
const GRUPOS_CFG = {
  'Ruteo y despacho': ['RadioBusquedaKm', 'RadioMaxKm', 'IncrementoRadioKm', 'IntervaloEscaladaMin', 'MaxPedidosPorRepartidor', 'VelocidadPromedioKmH', 'MinutosPorParada'],
  'Tiempos de búsqueda': ['TiempoAvisoClienteMin', 'TiempoCancelacionBusquedaMin', 'ExtensionBusquedaMin', 'TiempoEsperaRepartidorMin'],
  'Comisión': ['ComisionRepartidorPct'],
  'Datos de Pago Móvil': ['PagoMovilBanco', 'PagoMovilCedula', 'PagoMovilTelefono', 'PagoMovilTitular'],
};

function TabConfig({ puedeEscribir }) {
  const [cfg, setCfg]       = useState(null); // { Clave: {Valor, Descripcion} }
  const [cargando, setCarg] = useState(true);
  const [guardando, setG]   = useState(false);
  const [msg, setMsg]       = useState('');

  const cargar = useCallback(async () => {
    setCarg(true);
    try {
      const r = await api.get('/delivery/admin/config');
      const map = {};
      r.data.forEach(x => { map[x.Clave] = { Valor: x.Valor, Descripcion: x.Descripcion }; });
      setCfg(map);
    } catch { setCfg({}); }
    finally { setCarg(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const set = (clave, valor) => setCfg(c => ({ ...c, [clave]: { ...c[clave], Valor: valor } }));

  async function guardar() {
    setG(true); setMsg('');
    try {
      const items = Object.entries(cfg).map(([Clave, v]) => ({ Clave, Valor: String(v.Valor) }));
      await api.post('/delivery/admin/config', items);
      setMsg('Configuración guardada ✓');
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setMsg(e.response?.data?.error || 'Error al guardar');
    } finally { setG(false); }
  }

  if (cargando) return <Spinner />;

  // Claves conocidas agrupadas + cualquier clave extra al final
  const conocidas = new Set(Object.values(GRUPOS_CFG).flat());
  const extras = Object.keys(cfg).filter(k => !conocidas.has(k));
  const grupos = { ...GRUPOS_CFG, ...(extras.length ? { 'Otros': extras } : {}) };

  return (
    <div className="space-y-4 max-w-3xl">
      {Object.entries(grupos).map(([grupo, claves]) => {
        const presentes = claves.filter(k => cfg[k] !== undefined);
        if (!presentes.length) return null;
        const esPago = grupo === 'Datos de Pago Móvil';
        return (
          <div key={grupo} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="font-bold text-gray-800 text-sm">{grupo}</h3>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {presentes.map(k => (
                <div key={k}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{cfg[k].Descripcion || k}</label>
                  <input
                    type={esPago ? 'text' : 'number'}
                    value={cfg[k].Valor}
                    disabled={!puedeEscribir}
                    onChange={e => set(k, e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400" />
                  <p className="text-[10px] text-gray-300 mt-0.5 font-mono">{k}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {puedeEscribir && (
        <div className="flex items-center gap-3">
          <button onClick={guardar} disabled={guardando}
            className="flex items-center gap-2 bg-vida-blue text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
            <Save size={15} /> {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
          {msg && <span className={`text-sm font-semibold ${msg.includes('✓') ? 'text-green-600' : 'text-red-600'}`}>{msg}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
const TABS = [
  { id: 'repartidores', label: 'Repartidores', icon: Truck },
  { id: 'mapa',         label: 'Mapa en vivo',  icon: MapPin },
  { id: 'config',       label: 'Configuración', icon: Settings },
];

export default function Logistica() {
  const { usuario } = useAuthStore();
  const puedeEscribir = ROLES_ESCRITURA.includes(usuario?.TipoUsuario);
  const [tab, setTab] = useState('repartidores');

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
          <Truck size={22} className="text-vida-blue" /> Repartidores y Logística
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">Gestión de repartidores, monitoreo en vivo y parámetros del delivery</p>
      </div>

      <div className="bg-white border-b border-gray-100 px-6">
        <div className="flex gap-1">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-3.5 text-sm font-semibold border-b-2 transition-all
                  ${tab === t.id ? 'border-vida-blue text-vida-blue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-6">
        {tab === 'repartidores' && <TabRepartidores puedeEscribir={puedeEscribir} />}
        {tab === 'mapa'         && <TabMapa />}
        {tab === 'config'       && <TabConfig puedeEscribir={puedeEscribir} />}
      </div>
    </div>
  );
}
