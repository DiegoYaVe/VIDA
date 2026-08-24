// src/pages/Proveedores.jsx
import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore.js';
import api from '../services/api.js';
import {
  Plus, Search, Edit2, Power, Package, ShoppingCart,
  ChevronLeft, ChevronRight, X, Check, AlertCircle,
  Truck, ClipboardList, Eye, ArrowRight, FileText,
} from 'lucide-react';

const ROLES_ESCRITURA = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN'];

// ── Helpers ────────────────────────────────────────────────────────────────
const STATUS_ORDEN_LABEL = {
  BORRADOR:           { label: 'Borrador',          color: 'bg-gray-100 text-gray-700' },
  ENVIADA:            { label: 'Enviada',            color: 'bg-blue-100 text-blue-700' },
  RECIBIDA_PARCIAL:   { label: 'Parcial',            color: 'bg-yellow-100 text-yellow-700' },
  RECIBIDA_COMPLETA:  { label: 'Completa',           color: 'bg-green-100 text-green-700' },
  CANCELADA:          { label: 'Cancelada',          color: 'bg-red-100 text-red-700' },
};

const TRANSICIONES = {
  BORRADOR:          ['ENVIADA', 'CANCELADA'],
  ENVIADA:           ['RECIBIDA_PARCIAL', 'RECIBIDA_COMPLETA', 'CANCELADA'],
  RECIBIDA_PARCIAL:  ['RECIBIDA_COMPLETA', 'CANCELADA'],
  RECIBIDA_COMPLETA: [],
  CANCELADA:         [],
};

function StatusBadge({ status }) {
  const cfg = STATUS_ORDEN_LABEL[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>;
}

// ── Modal Proveedor ────────────────────────────────────────────────────────
function ModalProveedor({ proveedor, onClose, onSaved }) {
  const isEdit = !!proveedor?.idProveedor;
  const [form, setForm] = useState({
    Nombre:    proveedor?.Nombre    || '',
    RIF:       proveedor?.RIF       || '',
    Contacto:  proveedor?.Contacto  || '',
    Email:     proveedor?.Email     || '',
    Telefono:  proveedor?.Telefono  || '',
    Direccion: proveedor?.Direccion || '',
    Ciudad:    proveedor?.Ciudad    || '',
    Notas:     proveedor?.Notas     || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const campo = (key) => ({
    value:    form[key],
    onChange: (e) => setForm(f => ({ ...f, [key]: e.target.value })),
  });

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.Nombre.trim()) { setError('El nombre es requerido'); return; }
    setLoading(true); setError('');
    try {
      if (isEdit) {
        await api.put(`/proveedores/${proveedor.idProveedor}`, form);
      } else {
        await api.post('/proveedores', form);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-bold text-gray-800">{isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre / Razón social *</label>
              <input {...campo('Nombre')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">RIF / RFC</label>
              <input {...campo('RIF')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ciudad</label>
              <input {...campo('Ciudad')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Persona de contacto</label>
              <input {...campo('Contacto')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
              <input {...campo('Telefono')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input {...campo('Email')} type="email" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Dirección</label>
              <input {...campo('Direccion')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
              <textarea {...campo('Notas')} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-vida-blue text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {loading ? 'Guardando...' : (isEdit ? 'Actualizar' : 'Crear proveedor')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal Productos del proveedor ──────────────────────────────────────────
function ModalProductosProveedor({ proveedor, onClose }) {
  const [productos, setProductos]     = useState([]);
  const [catalogo, setCatalogo]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showAdd, setShowAdd]         = useState(false);
  const [selected, setSelected]       = useState('');
  const [precioCosto, setPrecioCosto] = useState('');
  const [codigoProv, setCodigoProv]   = useState('');
  const [error, setError]             = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [provProd, cats] = await Promise.all([
        api.get(`/proveedores/${proveedor.idProveedor}/productos`),
        api.get('/inventario/productos?limit=200&page=1'),
      ]);
      setProductos(provProd.data);
      const ligados = new Set(provProd.data.map(p => p.idProducto));
      setCatalogo((cats.data.data || []).filter(p => !ligados.has(p.idProducto)));
    } finally {
      setLoading(false);
    }
  }, [proveedor.idProveedor]);

  useEffect(() => { cargar(); }, [cargar]);

  async function ligar() {
    if (!selected) return;
    setError('');
    try {
      await api.post(`/proveedores/${proveedor.idProveedor}/productos`, {
        idProducto:      parseInt(selected),
        PrecioCosto:     precioCosto ? parseFloat(precioCosto) : null,
        CodigoProveedor: codigoProv || null,
      });
      setShowAdd(false); setSelected(''); setPrecioCosto(''); setCodigoProv('');
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al ligar producto');
    }
  }

  async function desligar(idProducto) {
    if (!confirm('¿Desligar este producto del proveedor?')) return;
    await api.delete(`/proveedores/${proveedor.idProveedor}/productos/${idProducto}`);
    cargar();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h3 className="font-bold text-gray-800">Productos — {proveedor.Nombre}</h3>
            <p className="text-xs text-gray-500 mt-0.5">Gestiona los productos que suministra este proveedor</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm text-gray-500">{productos.length} producto(s) ligado(s)</span>
            <button onClick={() => setShowAdd(v => !v)}
              className="flex items-center gap-1.5 bg-vida-blue text-white text-sm px-3 py-1.5 rounded-lg hover:opacity-90">
              <Plus size={14}/> Ligar producto
            </button>
          </div>

          {showAdd && (
            <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-3">
              {error && <p className="text-red-600 text-xs">{error}</p>}
              <select value={selected} onChange={e => setSelected(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Selecciona un producto...</option>
                {catalogo.map(p => (
                  <option key={p.idProducto} value={p.idProducto}>
                    {p.Nombre} — {p.SKU}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input value={precioCosto} onChange={e => setPrecioCosto(e.target.value)}
                  placeholder="Precio costo USD" type="number" step="0.01"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                <input value={codigoProv} onChange={e => setCodigoProv(e.target.value)}
                  placeholder="Código del proveedor"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <button onClick={ligar}
                className="w-full bg-vida-green text-white rounded-lg py-2 text-sm font-semibold hover:opacity-90">
                Confirmar
              </button>
            </div>
          )}

          {loading ? (
            <p className="text-center text-gray-400 py-6 text-sm">Cargando...</p>
          ) : productos.length === 0 ? (
            <p className="text-center text-gray-400 py-6 text-sm">No hay productos ligados</p>
          ) : (
            <div className="space-y-2">
              {productos.map(p => (
                <div key={p.idProducto}
                  className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{p.Nombre}</p>
                    <p className="text-xs text-gray-500">SKU: {p.SKU} · {p.UnidadMedida}</p>
                    {p.CodigoProveedor && (
                      <p className="text-xs text-gray-400">Código prov: {p.CodigoProveedor}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {p.PrecioCosto && (
                      <span className="text-sm font-semibold text-vida-blue">${p.PrecioCosto}</span>
                    )}
                    <button onClick={() => desligar(p.idProducto)}
                      className="text-red-400 hover:text-red-600 text-xs">
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Modal Cambiar Estado OC ────────────────────────────────────────────────
function ModalCambiarEstado({ orden, onClose, onSaved }) {
  const [statusNuevo, setStatusNuevo] = useState('');
  const [notas, setNotas]             = useState('');
  const [cantidades, setCantidades]   = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  const opciones = TRANSICIONES[orden.Status] || [];
  const necesitaCantidades = ['RECIBIDA_PARCIAL', 'RECIBIDA_COMPLETA'].includes(statusNuevo);

  useEffect(() => {
    if (necesitaCantidades) {
      setCantidades((orden.detalle || []).map(d => ({
        idDetalle:         d.idDetalle,
        NombreProducto:    d.NombreProducto,
        CantidadOrdenada:  d.CantidadOrdenada,
        CantidadRecibida:  d.CantidadOrdenada, // default: todo recibido
      })));
    }
  }, [statusNuevo, orden.detalle, necesitaCantidades]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!statusNuevo) { setError('Selecciona el nuevo estado'); return; }
    setLoading(true); setError('');
    try {
      await api.post(`/ordenes-compra/${orden.idOrden}/estado`, {
        StatusNuevo:          statusNuevo,
        Notas:                notas || null,
        cantidadesRecibidas:  necesitaCantidades ? cantidades : undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cambiar estado');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h3 className="font-bold text-gray-800">Cambiar estado de orden</h3>
            <p className="text-xs text-gray-500">Estado actual: <StatusBadge status={orden.Status} /></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nuevo estado *</label>
            <div className="flex gap-2 flex-wrap">
              {opciones.map(op => (
                <button key={op} type="button"
                  onClick={() => setStatusNuevo(op)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    statusNuevo === op
                      ? 'bg-vida-blue text-white border-vida-blue'
                      : 'border-gray-200 text-gray-600 hover:border-vida-blue hover:text-vida-blue'
                  }`}>
                  {STATUS_ORDEN_LABEL[op]?.label || op}
                </button>
              ))}
            </div>
          </div>

          {necesitaCantidades && cantidades.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Cantidades recibidas</label>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {cantidades.map((c, i) => (
                  <div key={c.idDetalle} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-sm flex-1 text-gray-700">{c.NombreProducto}</span>
                    <span className="text-xs text-gray-400">/ {c.CantidadOrdenada}</span>
                    <input
                      type="number" min="0" max={c.CantidadOrdenada} step="0.01"
                      value={c.CantidadRecibida}
                      onChange={e => setCantidades(arr => arr.map((x, j) =>
                        j === i ? { ...x, CantidadRecibida: parseFloat(e.target.value) || 0 } : x
                      ))}
                      className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas (opcional)</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)}
              rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
              placeholder="Comentario sobre el cambio de estado..." />
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={loading || !statusNuevo}
              className="flex-1 bg-vida-blue text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {loading ? 'Guardando...' : 'Confirmar cambio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal Crear Orden ──────────────────────────────────────────────────────
function ModalCrearOrden({ onClose, onSaved }) {
  const [proveedores, setProveedores] = useState([]);
  const [puntos, setPuntos]           = useState([]);
  const [catalogo, setCatalogo]       = useState([]);
  const [form, setForm] = useState({
    idProveedor: '', idPuntoVenta: '', Folio: '',
    Notas: '', FechaEstimada: '',
  });
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/proveedores?limit=200&page=1'),
      api.get('/sucursales/puntos-venta'),
      api.get('/inventario/productos?limit=500&page=1'),
    ]).then(([prov, pv, prod]) => {
      setProveedores(prov.data.data || []);
      setPuntos(pv.data);
      setCatalogo(prod.data.data || []);
    }).catch(() => {});
  }, []);

  function addItem() {
    setItems(arr => [...arr, { idProducto: '', NombreProducto: '', CantidadOrdenada: 1, PrecioUnitario: 0 }]);
  }

  function updateItem(i, key, value) {
    setItems(arr => arr.map((x, j) => {
      if (j !== i) return x;
      if (key === 'idProducto') {
        const prod = catalogo.find(p => String(p.idProducto) === String(value));
        return { ...x, idProducto: value, NombreProducto: prod?.Nombre || '', PrecioUnitario: prod?.CostoUSD || 0 };
      }
      return { ...x, [key]: value };
    }));
  }

  function removeItem(i) {
    setItems(arr => arr.filter((_, j) => j !== i));
  }

  const total = items.reduce((s, i) => s + (parseFloat(i.CantidadOrdenada) * parseFloat(i.PrecioUnitario)), 0);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.idProveedor) { setError('Selecciona un proveedor'); return; }
    if (!form.idPuntoVenta) { setError('Selecciona la tienda'); return; }
    if (items.length === 0) { setError('Agrega al menos un producto'); return; }
    if (items.some(i => !i.idProducto)) { setError('Todos los items deben tener un producto'); return; }
    setLoading(true); setError('');
    try {
      await api.post('/ordenes-compra', {
        ...form,
        idProveedor:  parseInt(form.idProveedor),
        idPuntoVenta: parseInt(form.idPuntoVenta),
        items: items.map(i => ({
          idProducto:       parseInt(i.idProducto),
          CantidadOrdenada: parseFloat(i.CantidadOrdenada),
          PrecioUnitario:   parseFloat(i.PrecioUnitario),
        })),
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear orden');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-bold text-gray-800">Nueva orden de compra</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Proveedor *</label>
              <select value={form.idProveedor} onChange={e => setForm(f => ({ ...f, idProveedor: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Selecciona...</option>
                {proveedores.map(p => <option key={p.idProveedor} value={p.idProveedor}>{p.Nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tienda *</label>
              <select value={form.idPuntoVenta} onChange={e => setForm(f => ({ ...f, idPuntoVenta: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Selecciona...</option>
                {puntos.map(p => <option key={p.idPuntoVenta} value={p.idPuntoVenta}>{p.NomComercial || p.Nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Folio / Referencia</label>
              <input value={form.Folio} onChange={e => setForm(f => ({ ...f, Folio: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="OC-001..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha estimada de entrega</label>
              <input type="date" value={form.FechaEstimada} onChange={e => setForm(f => ({ ...f, FechaEstimada: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
              <textarea value={form.Notas} onChange={e => setForm(f => ({ ...f, Notas: e.target.value }))}
                rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-medium text-gray-600">Productos *</label>
              <button type="button" onClick={addItem}
                className="flex items-center gap-1 text-xs text-vida-blue hover:underline">
                <Plus size={12}/> Agregar
              </button>
            </div>

            {items.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-xl py-6 text-center">
                <p className="text-sm text-gray-400">Agrega productos a la orden</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-xl p-2">
                    <div className="col-span-5">
                      <select value={item.idProducto} onChange={e => updateItem(i, 'idProducto', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                        <option value="">Producto...</option>
                        {catalogo.map(p => <option key={p.idProducto} value={p.idProducto}>{p.Nombre}</option>)}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <input type="number" min="0.01" step="0.01" placeholder="Cantidad"
                        value={item.CantidadOrdenada}
                        onChange={e => updateItem(i, 'CantidadOrdenada', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                    </div>
                    <div className="col-span-3">
                      <input type="number" min="0" step="0.01" placeholder="Precio USD"
                        value={item.PrecioUnitario}
                        onChange={e => updateItem(i, 'PrecioUnitario', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                    </div>
                    <div className="col-span-1 text-right">
                      <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600">
                        <X size={14}/>
                      </button>
                    </div>
                  </div>
                ))}
                <div className="text-right text-sm font-semibold text-gray-700 pr-1">
                  Total: <span className="text-vida-blue">${total.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        </form>

        <div className="p-5 border-t flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm hover:bg-gray-50">
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit} disabled={loading}
            className="flex-1 bg-vida-blue text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
            {loading ? 'Creando...' : 'Crear orden'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Detalle Orden ────────────────────────────────────────────────────
function ModalDetalleOrden({ orden, onClose, onCambioEstado }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h3 className="font-bold text-gray-800">
              Orden #{orden.Folio || orden.idOrden}
              <StatusBadge status={orden.Status} />
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{orden.NombreProveedor} · {orden.NombreSucursal}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Detalle productos */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Productos</h4>
            <div className="space-y-2">
              {(orden.detalle || []).map(d => (
                <div key={d.idDetalle} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{d.NombreProducto}</p>
                    <p className="text-xs text-gray-500">SKU: {d.SKU}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{d.CantidadRecibida ?? 0} / {d.CantidadOrdenada}</p>
                    <p className="text-xs text-gray-400">${(d.CantidadOrdenada * d.PrecioUnitario).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-right mt-2 text-sm font-bold text-gray-700">
              Total: <span className="text-vida-blue">${orden.TotalUSD?.toFixed(2)}</span>
            </div>
          </div>

          {/* Historial */}
          {(orden.historial || []).length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Historial de cambios</h4>
              <div className="space-y-1.5">
                {orden.historial.map(h => (
                  <div key={h.idHistorial} className="flex items-start gap-3 text-sm">
                    <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                      {h.StatusAnterior
                        ? <><StatusBadge status={h.StatusAnterior}/><ArrowRight size={12} className="text-gray-400"/></>
                        : null
                      }
                      <StatusBadge status={h.StatusNuevo}/>
                    </div>
                    <div className="min-w-0">
                      {h.Notas && <p className="text-xs text-gray-500 truncate">{h.Notas}</p>}
                      <p className="text-xs text-gray-400">{new Date(h.FechaAlta).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t flex gap-2">
          <button onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm hover:bg-gray-50">
            Cerrar
          </button>
          {(TRANSICIONES[orden.Status] || []).length > 0 && (
            <button onClick={onCambioEstado}
              className="flex-1 bg-vida-blue text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 flex items-center justify-center gap-2">
              <ArrowRight size={16}/> Cambiar estado
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// TAB: Proveedores
// ══════════════════════════════════════════════════════════════════════════
function TabProveedores({ puedeEscribir }) {
  const [data, setData]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null); // null | { tipo: 'form'|'productos', proveedor }

  const cargar = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const r = await api.get('/proveedores', { params: { page: p, limit: 15, search } });
      setData(r.data.data);
      setTotal(r.data.total);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { cargar(1); setPage(1); }, [search]);
  useEffect(() => { cargar(page); }, [page]);

  async function toggleStatus(p) {
    const nuevo = p.Status === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    await api.patch(`/proveedores/${p.idProveedor}/status`, { status: nuevo });
    cargar(page);
  }

  const pages = Math.ceil(total / 15);

  return (
    <div>
      {/* Barra superior */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, RIF, contacto..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm"/>
        </div>
        {puedeEscribir && (
          <button onClick={() => setModal({ tipo: 'form', proveedor: null })}
            className="flex items-center gap-2 bg-vida-blue text-white px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90">
            <Plus size={16}/> Nuevo proveedor
          </button>
        )}
      </div>

      {/* Tabla */}
      {loading ? (
        <p className="text-center text-gray-400 py-12">Cargando...</p>
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Truck size={40} className="mx-auto mb-3 opacity-30"/>
          <p>No hay proveedores registrados</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map(p => (
            <div key={p.idProveedor}
              className="flex items-center justify-between bg-white border border-gray-100 rounded-2xl px-5 py-4 hover:shadow-sm transition-shadow">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-800 truncate">{p.Nombre}</p>
                  {p.Status === 'INACTIVO' && (
                    <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Inactivo</span>
                  )}
                </div>
                <div className="flex gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                  {p.RIF       && <span>RIF: {p.RIF}</span>}
                  {p.Contacto  && <span>{p.Contacto}</span>}
                  {p.Email     && <span>{p.Email}</span>}
                  {p.Ciudad    && <span>{p.Ciudad}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <span className="text-xs text-gray-400">{p.totalProductos} prod.</span>
                {p.ordenesActivas > 0 && (
                  <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                    {p.ordenesActivas} OC activa{p.ordenesActivas > 1 ? 's' : ''}
                  </span>
                )}
                {puedeEscribir && (
                  <>
                    <button onClick={() => setModal({ tipo: 'productos', proveedor: p })}
                      title="Productos del proveedor"
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-vida-blue">
                      <Package size={16}/>
                    </button>
                    <button onClick={() => setModal({ tipo: 'form', proveedor: p })}
                      title="Editar"
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-vida-blue">
                      <Edit2 size={16}/>
                    </button>
                    <button onClick={() => toggleStatus(p)}
                      title={p.Status === 'ACTIVO' ? 'Desactivar' : 'Activar'}
                      className={`p-1.5 rounded-lg hover:bg-gray-100 ${
                        p.Status === 'ACTIVO' ? 'text-green-500' : 'text-gray-300'
                      }`}>
                      <Power size={16}/>
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Paginación */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>{total} proveedor(es)</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30">
              <ChevronLeft size={16}/>
            </button>
            <span className="px-2">{page} / {pages}</span>
            <button disabled={page === pages} onClick={() => setPage(p => p + 1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30">
              <ChevronRight size={16}/>
            </button>
          </div>
        </div>
      )}

      {/* Modales */}
      {modal?.tipo === 'form' && (
        <ModalProveedor
          proveedor={modal.proveedor}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); cargar(page); }}
        />
      )}
      {modal?.tipo === 'productos' && (
        <ModalProductosProveedor
          proveedor={modal.proveedor}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// TAB: Órdenes de compra
// ══════════════════════════════════════════════════════════════════════════
function TabOrdenes({ puedeEscribir }) {
  const [data, setData]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [filtStatus, setFiltStatus] = useState('');
  const [loading, setLoading]   = useState(true);
  const [ordenDetalle, setOrdenDetalle] = useState(null);
  const [modal, setModal]       = useState(null); // null | 'crear' | 'estado'

  const cargar = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const r = await api.get('/ordenes-compra', { params: { page: p, limit: 15, status: filtStatus } });
      setData(r.data.data);
      setTotal(r.data.total);
    } finally {
      setLoading(false);
    }
  }, [filtStatus]);

  useEffect(() => { cargar(1); setPage(1); }, [filtStatus]);
  useEffect(() => { cargar(page); }, [page]);

  async function verDetalle(orden) {
    try {
      const r = await api.get(`/ordenes-compra/${orden.idOrden}`);
      setOrdenDetalle(r.data);
    } catch {}
  }

  const pages = Math.ceil(total / 15);

  return (
    <div>
      {/* Barra superior */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="flex gap-2 flex-wrap flex-1">
          {['', 'BORRADOR', 'ENVIADA', 'RECIBIDA_PARCIAL', 'RECIBIDA_COMPLETA', 'CANCELADA'].map(s => (
            <button key={s} onClick={() => setFiltStatus(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                filtStatus === s
                  ? 'bg-vida-blue text-white border-vida-blue'
                  : 'border-gray-200 text-gray-600 hover:border-vida-blue'
              }`}>
              {s === '' ? 'Todos' : (STATUS_ORDEN_LABEL[s]?.label || s)}
            </button>
          ))}
        </div>
        {puedeEscribir && (
          <button onClick={() => setModal('crear')}
            className="flex items-center gap-2 bg-vida-blue text-white px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90">
            <Plus size={16}/> Nueva orden
          </button>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-center text-gray-400 py-12">Cargando...</p>
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <ClipboardList size={40} className="mx-auto mb-3 opacity-30"/>
          <p>No hay órdenes de compra</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map(o => (
            <div key={o.idOrden}
              className="flex items-center justify-between bg-white border border-gray-100 rounded-2xl px-5 py-4 hover:shadow-sm cursor-pointer transition-shadow"
              onClick={() => verDetalle(o)}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-800">
                    {o.Folio ? `#${o.Folio}` : `OC-${o.idOrden}`}
                  </p>
                  <StatusBadge status={o.Status}/>
                </div>
                <div className="flex gap-3 mt-0.5 text-xs text-gray-400">
                  <span>{o.NombreProveedor}</span>
                  {o.NombreSucursal && <span>· {o.NombreSucursal}</span>}
                  <span>· {o.totalItems} ítem(s)</span>
                  {o.FechaEstimada && <span>· Entrega: {new Date(o.FechaEstimada).toLocaleDateString()}</span>}
                </div>
              </div>
              <div className="text-right shrink-0 ml-4">
                <p className="font-bold text-vida-blue">${Number(o.TotalUSD).toFixed(2)}</p>
                <p className="text-xs text-gray-400">{new Date(o.FechaAlta).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>{total} orden(es)</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30">
              <ChevronLeft size={16}/>
            </button>
            <span className="px-2">{page} / {pages}</span>
            <button disabled={page === pages} onClick={() => setPage(p => p + 1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30">
              <ChevronRight size={16}/>
            </button>
          </div>
        </div>
      )}

      {/* Modales */}
      {modal === 'crear' && (
        <ModalCrearOrden
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); cargar(1); setPage(1); }}
        />
      )}
      {ordenDetalle && modal !== 'estado' && (
        <ModalDetalleOrden
          orden={ordenDetalle}
          onClose={() => setOrdenDetalle(null)}
          onCambioEstado={() => setModal('estado')}
        />
      )}
      {ordenDetalle && modal === 'estado' && puedeEscribir && (
        <ModalCambiarEstado
          orden={ordenDetalle}
          onClose={() => { setModal(null); setOrdenDetalle(null); }}
          onSaved={() => { setModal(null); setOrdenDetalle(null); cargar(page); }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════
export default function Proveedores() {
  const { usuario } = useAuthStore();
  const puedeEscribir = ROLES_ESCRITURA.includes(usuario?.TipoUsuario);
  const [tab, setTab] = useState('proveedores');

  const tabs = [
    { key: 'proveedores', label: 'Proveedores',      icon: Truck },
    { key: 'ordenes',     label: 'Órdenes de compra', icon: ClipboardList },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-gray-900">Proveedores</h1>
        <p className="text-gray-500 text-sm mt-1">Gestiona proveedores y órdenes de compra</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl w-fit mb-6">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                tab === t.key
                  ? 'bg-white text-vida-blue shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}>
              <Icon size={16}/> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'proveedores' && <TabProveedores puedeEscribir={puedeEscribir}/>}
      {tab === 'ordenes'     && <TabOrdenes     puedeEscribir={puedeEscribir}/>}
    </div>
  );
}
