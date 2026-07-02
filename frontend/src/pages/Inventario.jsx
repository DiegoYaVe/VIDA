// src/pages/Inventario.jsx
import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore.js';
import api, { API_ORIGIN } from '../services/api.js';
import { useToast } from '../components/Toast.jsx';
import {
  Plus, Search, Package, Tag, ArrowDownCircle, ArrowUpCircle,
  SlidersHorizontal, ChevronLeft, ChevronRight, X, AlertTriangle,
  Pencil, PowerOff, CheckCircle, LayoutGrid,
} from 'lucide-react';
import * as Icons from 'lucide-react';

function DynamicIcon({ name, size = 20 }) {
  const Icon = Icons[name] || Tag;
  return <Icon size={size} />;
}

// ── Constantes ─────────────────────────────────────────────────────────────
const UNIDADES = [
  { value: 'Pieza', label: 'Pieza' },
  { value: 'Kg',    label: 'Kilogramo (Kg)' },
  { value: 'Litro', label: 'Litro' },
  { value: 'Caja',  label: 'Caja' },
];
const ROLES_ESCRITURA = ['SUPER_ADMIN', 'ADMIN_PAIS', 'ADMIN'];

// ── Helpers visuales ────────────────────────────────────────────────────────
function Badge({ children, color = 'gray' }) {
  const colors = {
    green:  'bg-green-100 text-green-700',
    red:    'bg-red-100 text-red-600',
    blue:   'bg-blue-100 text-blue-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    gray:   'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors[color]}`}>
      {children}
    </span>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-black text-gray-800 text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </div>
    </div>
  );
}

function InputField({ label, error, ...props }) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-600 mb-1">{label}</label>
      <input
        className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vida-blue transition
          ${error ? 'border-red-400' : 'border-gray-200'}`}
        {...props}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function SelectField({ label, children, ...props }) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-600 mb-1">{label}</label>
      <select
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vida-blue transition bg-white"
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MODAL — CATEGORÍA
// ══════════════════════════════════════════════════════════════════════════
function ModalCategoria({ data, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    Nombre: data?.Nombre || '',
    Descripcion: data?.Descripcion || '',
    Icono: data?.Icono || '',
    OrdenCategoria: data?.OrdenCategoria ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.Nombre.trim()) { setError('El nombre es requerido'); return; }
    setSaving(true);
    try {
      if (data?.idCategoria) {
        await api.put(`/inventario/categorias/${data.idCategoria}`, form);
        toast.success('Categoría actualizada', form.Nombre);
      } else {
        await api.post('/inventario/categorias', form);
        toast.success('Categoría creada', form.Nombre);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={data?.idCategoria ? 'Editar Categoría' : 'Nueva Categoría'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <InputField label="Nombre *" value={form.Nombre} error={error}
          onChange={e => { setForm(f => ({ ...f, Nombre: e.target.value })); setError(''); }} />
        <InputField label="Descripción" value={form.Descripcion}
          onChange={e => setForm(f => ({ ...f, Descripcion: e.target.value }))} />
        <InputField label="Ícono (nombre Lucide, ej: ShoppingCart)" value={form.Icono}
          onChange={e => setForm(f => ({ ...f, Icono: e.target.value }))} />
        <InputField label="Orden" type="number" value={form.OrdenCategoria}
          onChange={e => setForm(f => ({ ...f, OrdenCategoria: parseInt(e.target.value) || 0 }))} />
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 border border-gray-200 rounded-xl py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button type="submit" disabled={saving}
            className="flex-1 rounded-xl py-2 text-sm font-bold text-white transition"
            style={{ background: 'linear-gradient(135deg, #1A6A9A, #27AE60)' }}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MODAL — PRODUCTO
// ══════════════════════════════════════════════════════════════════════════
function ModalProducto({ data, categorias, onClose, onSaved }) {
  const toast = useToast();
  const [imagenFile, setImagenFile] = useState(null);
  const [preview, setPreview] = useState(
    data?.ImagenProducto ? `${API_ORIGIN}${data.ImagenProducto}` : null
  );
  const [form, setForm] = useState({
    idCategoria:     data?.idCategoria     || '',
    Nombre:          data?.Nombre          || '',
    Descripcion:     data?.Descripcion     || '',
    SKU:             data?.SKU             || '',
    CodigoBarras:    data?.CodigoBarras    || '',
    UnidadMedida:    data?.UnidadMedida    || 'Pieza',
    UnidadesPorCaja: data?.UnidadesPorCaja ?? '',
    PrecioUSD:       data?.PrecioUSD       ?? '',
    CostoUSD:        data?.CostoUSD        ?? '',
    StockMinimo:     data?.StockMinimo     ?? 0,
    Notas:           data?.Notas           || '',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.Nombre.trim())    e.Nombre = 'Requerido';
    if (!form.idCategoria)      e.idCategoria = 'Selecciona una categoría';
    if (!form.UnidadMedida)     e.UnidadMedida = 'Requerido';
    if (form.PrecioUSD === '')  e.PrecioUSD = 'Requerido';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const e2 = validate();
    if (Object.keys(e2).length) { setErrors(e2); return; }
    setSaving(true);
    try {
      const body = {
        ...form,
        PrecioUSD:       parseFloat(form.PrecioUSD),
        CostoUSD:        form.CostoUSD !== '' ? parseFloat(form.CostoUSD) : null,
        UnidadesPorCaja: form.UnidadMedida === 'Caja' && form.UnidadesPorCaja !== ''
                           ? parseInt(form.UnidadesPorCaja) : null,
      };
      let idProducto = data?.idProducto;
      if (idProducto) {
        await api.put(`/inventario/productos/${idProducto}`, body);
        toast.success('Producto actualizado', form.Nombre);
      } else {
        const res = await api.post('/inventario/productos', body);
        idProducto = res.data?.idProducto;
        toast.success('Producto creado', form.Nombre);
      }

      // Subir la foto si se seleccionó una nueva
      if (imagenFile && idProducto) {
        const fd = new FormData();
        fd.append('file', imagenFile);
        try {
          await api.post(`/inventario/productos/${idProducto}/imagen`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch {
          toast.error('Producto guardado, pero la imagen no se pudo subir');
        }
      }
      onSaved();
    } catch (err) {
      setErrors({ general: err.response?.data?.error || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  const f = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <Modal title={data?.idProducto ? 'Editar Producto' : 'Nuevo Producto'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {errors.general && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
            {errors.general}
          </div>
        )}

        {/* Foto del producto — es lo que ven los clientes en la app */}
        <div className="flex items-center gap-4">
          <label className="relative w-24 h-24 rounded-2xl border-2 border-dashed border-gray-300 hover:border-[#1A6A9A] cursor-pointer overflow-hidden flex items-center justify-center bg-gray-50 transition shrink-0">
            {preview ? (
              <img src={preview} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl text-gray-300">📷</span>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) {
                  setErrors(p => ({ ...p, general: 'La imagen no debe superar 5MB' }));
                  return;
                }
                setImagenFile(file);
                setPreview(URL.createObjectURL(file));
              }}
            />
          </label>
          <div className="text-xs text-gray-400">
            <p className="font-semibold text-gray-600 text-sm mb-0.5">Foto del producto</p>
            <p>JPG, PNG o WebP · máx 5MB.</p>
            <p>Se muestra en la app de clientes — una buena foto vende más.</p>
          </div>
        </div>

        <SelectField label="Categoría *" value={form.idCategoria} error={errors.idCategoria}
          onChange={e => f('idCategoria', e.target.value)}>
          <option value="">Selecciona...</option>
          {categorias.map(c => <option key={c.idCategoria} value={c.idCategoria}>{c.Nombre}</option>)}
        </SelectField>

        <InputField label="Nombre *" value={form.Nombre} error={errors.Nombre}
          onChange={e => { f('Nombre', e.target.value); setErrors(p => ({ ...p, Nombre: '' })); }} />

        <div className="grid grid-cols-2 gap-3">
          <InputField label="SKU" value={form.SKU}
            onChange={e => f('SKU', e.target.value)} placeholder="Ej: PROD-001" />
          <InputField label="Código de Barras" value={form.CodigoBarras}
            onChange={e => f('CodigoBarras', e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Unidad de Medida *" value={form.UnidadMedida}
            onChange={e => f('UnidadMedida', e.target.value)}>
            {UNIDADES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
          </SelectField>
          <InputField label="Stock Mínimo (alerta)" type="number" step="0.01"
            value={form.StockMinimo} onChange={e => f('StockMinimo', e.target.value)} />
        </div>

        {form.UnidadMedida === 'Caja' && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <InputField
              label="¿Cuántas unidades tiene cada caja? *"
              type="number" min="1" step="1"
              value={form.UnidadesPorCaja}
              placeholder="Ej: 24"
              onChange={e => f('UnidadesPorCaja', e.target.value)}
            />
            <p className="text-xs text-blue-400 mt-1">
              Esto permite calcular el equivalente en piezas al registrar movimientos.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <InputField label="Precio Venta USD *" type="number" step="0.0001"
            value={form.PrecioUSD} error={errors.PrecioUSD}
            onChange={e => { f('PrecioUSD', e.target.value); setErrors(p => ({ ...p, PrecioUSD: '' })); }}
            placeholder="0.00" />
          <InputField label="Costo USD" type="number" step="0.0001"
            value={form.CostoUSD} onChange={e => f('CostoUSD', e.target.value)}
            placeholder="0.00 (opcional)" />
        </div>

        <InputField label="Descripción" value={form.Descripcion}
          onChange={e => f('Descripcion', e.target.value)} />
        <InputField label="Notas" value={form.Notas}
          onChange={e => f('Notas', e.target.value)} />

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 border border-gray-200 rounded-xl py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button type="submit" disabled={saving}
            className="flex-1 rounded-xl py-2 text-sm font-bold text-white transition"
            style={{ background: 'linear-gradient(135deg, #1A6A9A, #27AE60)' }}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MODAL — MOVIMIENTO
// ══════════════════════════════════════════════════════════════════════════
function ModalMovimiento({ producto, puntoVentaInicial, onClose, onSaved }) {
  const toast = useToast();

  const [sucursales,    setSucursales]    = useState([]);
  const [loadingSucs,   setLoadingSucs]   = useState(true);
  const [stockActual,   setStockActual]   = useState(null);  // stock en la sucursal elegida
  const [loadingStock,  setLoadingStock]  = useState(false);

  const [form, setForm] = useState({
    idPuntoVenta:   puntoVentaInicial || '',
    TipoMovimiento: 'ENTRADA',
    Cantidad:       '',
    Motivo:         '',
    Referencia:     '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // Cargar lista de sucursales al abrir
  useEffect(() => {
    api.get('/sucursales/puntos-venta')
      .then(r => {
        setSucursales(r.data.filter(s => s.StatusPuntoVenta === 'ACTIVO'));
        // Si no viene puntoVentaInicial y hay sucursales, pre-seleccionar la primera
        if (!puntoVentaInicial && r.data.length > 0) {
          setForm(f => ({ ...f, idPuntoVenta: r.data[0].idPuntoVenta }));
        }
      })
      .finally(() => setLoadingSucs(false));
  }, []);

  // Cada vez que cambia la sucursal seleccionada, obtener el stock de ese producto ahí
  useEffect(() => {
    if (!form.idPuntoVenta) { setStockActual(null); return; }
    setLoadingStock(true);
    api.get('/inventario/stock', {
      params: { idPuntoVenta: form.idPuntoVenta },
    })
      .then(r => {
        const fila = r.data.find(p => p.idProducto === producto.idProducto);
        setStockActual(fila ? fila.Cantidad : 0);
      })
      .catch(() => setStockActual(null))
      .finally(() => setLoadingStock(false));
  }, [form.idPuntoVenta, producto.idProducto]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.idPuntoVenta) { setError('Selecciona una sucursal'); return; }
    if (!form.Cantidad || parseFloat(form.Cantidad) <= 0) {
      setError('La cantidad debe ser mayor a 0'); return;
    }
    setSaving(true);
    try {
      await api.post('/inventario/movimientos', {
        idPuntoVenta:   form.idPuntoVenta,
        idProducto:     producto.idProducto,
        TipoMovimiento: form.TipoMovimiento,
        Cantidad:       parseFloat(form.Cantidad),
        Motivo:         form.Motivo   || null,
        Referencia:     form.Referencia || null,
      });
      const labels = { ENTRADA: 'Entrada registrada', SALIDA: 'Salida registrada', AJUSTE: 'Stock ajustado' };
      toast.success(labels[form.TipoMovimiento], producto.Nombre);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar movimiento');
    } finally {
      setSaving(false);
    }
  };

  const tipoConfig = {
    ENTRADA: { label: 'Entrada',  bg: 'border-green-400 bg-green-50 text-green-700' },
    SALIDA:  { label: 'Salida',   bg: 'border-red-400 bg-red-50 text-red-600'       },
    AJUSTE:  { label: 'Ajuste',   bg: 'border-blue-400 bg-blue-50 text-blue-700'    },
  };
  const inactivo = 'border-gray-200 text-gray-500 hover:bg-gray-50';

  const sucursalElegida = sucursales.find(s => String(s.idPuntoVenta) === String(form.idPuntoVenta));

  return (
    <Modal title="Registrar Movimiento" onClose={onClose}>
      {/* Producto */}
      <div className="bg-gray-50 rounded-xl p-3 mb-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #1A6A9A22, #27AE6022)' }}>
          <Package size={16} className="text-vida-blue" />
        </div>
        <div>
          <p className="font-bold text-gray-800 text-sm leading-tight">{producto.Nombre}</p>
          {producto.SKU && <p className="text-xs text-gray-400">SKU: {producto.SKU}</p>}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Selector de sucursal */}
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">Sucursal *</label>
          {loadingSucs ? (
            <div className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-400">
              Cargando sucursales...
            </div>
          ) : sucursales.length === 0 ? (
            <div className="border border-red-200 bg-red-50 rounded-xl px-3 py-2 text-sm text-red-500">
              No hay sucursales activas
            </div>
          ) : (
            <select
              value={form.idPuntoVenta}
              onChange={e => { setForm(f => ({ ...f, idPuntoVenta: e.target.value })); setError(''); }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vida-blue bg-white">
              <option value="">— Selecciona sucursal —</option>
              {sucursales.map(s => (
                <option key={s.idPuntoVenta} value={s.idPuntoVenta}>
                  {s.NomComercial || s.Nombre}
                </option>
              ))}
            </select>
          )}

          {/* Stock actual en esa sucursal */}
          {sucursalElegida && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-gray-400">Stock actual en</span>
              <span className="font-bold text-gray-700">{sucursalElegida.NomComercial || sucursalElegida.Nombre}:</span>
              {loadingStock ? (
                <span className="text-gray-400">cargando...</span>
              ) : (
                <span className={`font-black ${stockActual <= 0 ? 'text-red-500' : 'text-green-600'}`}>
                  {stockActual ?? 0} {producto.UnidadMedida}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Tipo de movimiento */}
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-2">Tipo de Movimiento</label>
          <div className="grid grid-cols-3 gap-2">
            {['ENTRADA', 'SALIDA', 'AJUSTE'].map(tipo => (
              <button key={tipo} type="button"
                onClick={() => { setForm(f => ({ ...f, TipoMovimiento: tipo })); setError(''); }}
                className={`py-2 rounded-xl text-xs font-bold border transition
                  ${form.TipoMovimiento === tipo ? tipoConfig[tipo].bg : inactivo}`}>
                {tipoConfig[tipo].label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {form.TipoMovimiento === 'ENTRADA' && 'Suma unidades al stock existente'}
            {form.TipoMovimiento === 'SALIDA'  && 'Resta unidades del stock existente'}
            {form.TipoMovimiento === 'AJUSTE'  && 'Reemplaza el stock con el valor que ingreses'}
          </p>
        </div>

        <InputField
          label={form.TipoMovimiento === 'AJUSTE' ? 'Nuevo stock total' : 'Cantidad'}
          type="number" step="0.01" min="0.01" value={form.Cantidad} error={error}
          onChange={e => { setForm(f => ({ ...f, Cantidad: e.target.value })); setError(''); }}
          placeholder="0" />

        <InputField label="Motivo"
          value={form.Motivo}
          onChange={e => setForm(f => ({ ...f, Motivo: e.target.value }))}
          placeholder="Ej: Compra a proveedor, merma, inventario físico..." />

        <InputField label="Referencia (folio / factura)"
          value={form.Referencia}
          onChange={e => setForm(f => ({ ...f, Referencia: e.target.value }))}
          placeholder="Opcional" />

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 border border-gray-200 rounded-xl py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button type="submit" disabled={saving || loadingSucs}
            className="flex-1 rounded-xl py-2 text-sm font-bold text-white transition disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #1A6A9A, #27AE60)' }}>
            {saving ? 'Guardando...' : 'Confirmar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PESTAÑA — CATEGORÍAS
// ══════════════════════════════════════════════════════════════════════════
function TabCategorias({ puedeEscribir }) {
  const toast = useToast();
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(null); // null | { data? }

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/inventario/categorias');
      setCategorias(r.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const toggleStatus = async (cat) => {
    const nuevoStatus = cat.Status === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    await api.patch(`/inventario/categorias/${cat.idCategoria}/status`, { status: nuevoStatus });
    toast.success(
      nuevoStatus === 'ACTIVO' ? 'Categoría activada' : 'Categoría desactivada',
      cat.Nombre
    );
    cargar();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{categorias.length} categorías</p>
        {puedeEscribir && (
          <button onClick={() => setModal({})}
            className="flex items-center gap-2 text-sm font-bold text-white px-4 py-2 rounded-xl transition"
            style={{ background: 'linear-gradient(135deg, #1A6A9A, #27AE60)' }}>
            <Plus size={16} /> Nueva Categoría
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : categorias.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Tag size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-bold">Sin categorías aún</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {categorias.map(cat => (
            <div key={cat.idCategoria}
              className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #1A6A9A, #27AE60)' }}>
                <DynamicIcon name={cat.Icono} size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-800 text-sm truncate">{cat.Nombre}</p>
                {cat.Descripcion && <p className="text-xs text-gray-400 truncate">{cat.Descripcion}</p>}
              </div>
              {puedeEscribir && (
                <div className="flex gap-1">
                  <button onClick={() => setModal({ data: cat })}
                    className="p-1.5 text-gray-400 hover:text-vida-blue hover:bg-blue-50 rounded-lg transition">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => toggleStatus(cat)}
                    className={`p-1.5 rounded-lg transition ${cat.Status === 'ACTIVO'
                      ? 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                      : 'text-green-500 hover:bg-green-50'}`}>
                    {cat.Status === 'ACTIVO' ? <PowerOff size={14} /> : <CheckCircle size={14} />}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modal !== null && (
        <ModalCategoria
          data={modal.data}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); cargar(); }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PESTAÑA — PRODUCTOS
// ══════════════════════════════════════════════════════════════════════════
function TabProductos({ puedeEscribir }) {
  const toast = useToast();
  const [productos,   setProductos]   = useState([]);
  const [categorias,  setCategorias]  = useState([]);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [pages,       setPages]       = useState(1);
  const [search,      setSearch]      = useState('');
  const [catFiltro,   setCatFiltro]   = useState('');
  const [loading,     setLoading]     = useState(true);
  const [modal,       setModal]       = useState(null);

  const cargarCats = useCallback(async () => {
    const r = await api.get('/inventario/categorias');
    setCategorias(r.data);
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 15, search, idCategoria: catFiltro };
      const r = await api.get('/inventario/productos', { params });
      setProductos(r.data.data);
      setTotal(r.data.total);
      setPages(r.data.pages);
    } finally {
      setLoading(false);
    }
  }, [page, search, catFiltro]);

  useEffect(() => { cargarCats(); }, [cargarCats]);
  useEffect(() => { setPage(1); }, [search, catFiltro]);
  useEffect(() => { cargar(); }, [cargar]);

  const toggleStatus = async (prod) => {
    const nuevoStatus = prod.Status === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    await api.patch(`/inventario/productos/${prod.idProducto}/status`, { status: nuevoStatus });
    toast.success(
      nuevoStatus === 'ACTIVO' ? 'Producto activado' : 'Producto desactivado',
      prod.Nombre
    );
    cargar();
  };

  return (
    <div>
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, SKU o código..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-vida-blue" />
        </div>
        <select value={catFiltro} onChange={e => setCatFiltro(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vida-blue bg-white">
          <option value="">Todas las categorías</option>
          {categorias.map(c => <option key={c.idCategoria} value={c.idCategoria}>{c.Nombre}</option>)}
        </select>
        {puedeEscribir && (
          <button onClick={() => setModal({})}
            className="flex items-center gap-2 text-sm font-bold text-white px-4 py-2 rounded-xl transition"
            style={{ background: 'linear-gradient(135deg, #1A6A9A, #27AE60)' }}>
            <Plus size={16} /> Nuevo Producto
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400 mb-3">{total} productos encontrados</p>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : productos.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Package size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-bold">Sin productos</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Producto</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">SKU</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Categoría</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Unidad</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Precio USD</th>
                <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase">Status</th>
                {puedeEscribir && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {productos.map(p => (
                <tr key={p.idProducto} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.ImagenProducto ? (
                        <img src={`${API_ORIGIN}${p.ImagenProducto}`} alt=""
                          className="w-10 h-10 rounded-lg object-cover shrink-0 border border-gray-100" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 shrink-0 text-lg">📷</div>
                      )}
                      <div>
                        <p className="font-bold text-gray-800">{p.Nombre}</p>
                        {p.Descripcion && <p className="text-xs text-gray-400 truncate max-w-48">{p.Descripcion}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.SKU || '—'}</td>
                  <td className="px-4 py-3">
                    <Badge color="blue">{p.NombreCategoria || '—'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.UnidadMedida}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-800">
                    ${parseFloat(p.PrecioUSD).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge color={p.Status === 'ACTIVO' ? 'green' : 'red'}>
                      {p.Status}
                    </Badge>
                  </td>
                  {puedeEscribir && (
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setModal({ data: p })}
                          className="p-1.5 text-gray-400 hover:text-vida-blue hover:bg-blue-50 rounded-lg transition">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => toggleStatus(p)}
                          className={`p-1.5 rounded-lg transition ${p.Status === 'ACTIVO'
                            ? 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                            : 'text-green-500 hover:bg-green-50'}`}>
                          {p.Status === 'ACTIVO' ? <PowerOff size={14} /> : <CheckCircle size={14} />}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Paginación */}
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-400">Página {page} de {pages}</p>
              <div className="flex gap-2">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition">
                  <ChevronLeft size={16} />
                </button>
                <button disabled={page === pages} onClick={() => setPage(p => p + 1)}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {modal !== null && (
        <ModalProducto
          data={modal.data}
          categorias={categorias}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); cargar(); }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PESTAÑA — STOCK / MOVIMIENTOS
// ══════════════════════════════════════════════════════════════════════════
function TabStock({ puedeEscribir, usuario }) {
  const [stock,         setStock]         = useState([]);
  const [puntoVenta,    setPuntoVenta]     = useState(usuario?.idPuntoVenta || '');
  const [puntosVenta,   setPuntosVenta]    = useState([]);
  const [soloStockBajo, setSoloStockBajo] = useState(false);
  const [search,        setSearch]        = useState('');
  const [loading,       setLoading]       = useState(false);
  const [modal,         setModal]         = useState(null); // { producto }

  // Cargar puntos de venta
  useEffect(() => {
    api.get('/sucursales/puntos-venta').then(r => {
      setPuntosVenta(r.data);
      if (!puntoVenta && r.data.length > 0) setPuntoVenta(r.data[0].idPuntoVenta);
    }).catch(() => {
      // Si no existe el endpoint aún, usar el del usuario
    });
  }, []);

  const cargar = useCallback(async () => {
    if (!puntoVenta) return;
    setLoading(true);
    try {
      const r = await api.get('/inventario/stock', {
        params: { idPuntoVenta: puntoVenta, soloStockBajo },
      });
      setStock(r.data);
    } finally {
      setLoading(false);
    }
  }, [puntoVenta, soloStockBajo]);

  useEffect(() => { cargar(); }, [cargar]);

  const stockFiltrado = stock.filter(p =>
    p.Nombre.toLowerCase().includes(search.toLowerCase()) ||
    (p.SKU || '').toLowerCase().includes(search.toLowerCase())
  );

  const stockBajoCount = stock.filter(p => p.StockBajo).length;

  return (
    <div>
      {/* Controles */}
      <div className="flex flex-wrap gap-3 mb-4">
        {puntosVenta.length > 0 && (
          <select value={puntoVenta} onChange={e => setPuntoVenta(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vida-blue bg-white">
            {puntosVenta.map(pv => (
              <option key={pv.idPuntoVenta} value={pv.idPuntoVenta}>{pv.NomComercial}</option>
            ))}
          </select>
        )}
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-vida-blue" />
        </div>
        <button onClick={() => setSoloStockBajo(v => !v)}
          className={`flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl border transition
            ${soloStockBajo ? 'bg-yellow-50 border-yellow-400 text-yellow-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          <AlertTriangle size={15} />
          Stock bajo {stockBajoCount > 0 && <span className="bg-yellow-400 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{stockBajoCount}</span>}
        </button>
      </div>

      {!puntoVenta ? (
        <div className="text-center py-12 text-gray-400">
          <SlidersHorizontal size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-bold">Selecciona un punto de venta</p>
        </div>
      ) : loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : stockFiltrado.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Package size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-bold">Sin productos</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Producto</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Categoría</th>
                <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase">Stock</th>
                <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase">Mínimo</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Precio USD</th>
                {puedeEscribir && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stockFiltrado.map(p => (
                <tr key={p.idProducto} className={`hover:bg-gray-50 transition-colors ${p.StockBajo ? 'bg-yellow-50/40' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {p.StockBajo && <AlertTriangle size={14} className="text-yellow-500 flex-shrink-0" />}
                      <div>
                        <p className="font-bold text-gray-800">{p.Nombre}</p>
                        {p.SKU && <p className="text-xs text-gray-400 font-mono">{p.SKU}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge color="blue">{p.NombreCategoria || '—'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-black text-base ${p.StockBajo ? 'text-yellow-600' : 'text-gray-800'}`}>
                      {parseFloat(p.Cantidad).toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-400 ml-1">{p.UnidadMedida}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-400">
                    {parseFloat(p.StockMinimo).toLocaleString()} {p.UnidadMedida}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-800">
                    ${parseFloat(p.PrecioUSD).toFixed(2)}
                  </td>
                  {puedeEscribir && (
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setModal({ producto: p, tipo: 'ENTRADA' })}
                          className="p-1.5 text-green-500 hover:bg-green-50 rounded-lg transition" title="Entrada">
                          <ArrowDownCircle size={16} />
                        </button>
                        <button onClick={() => setModal({ producto: p, tipo: 'SALIDA' })}
                          className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition" title="Salida">
                          <ArrowUpCircle size={16} />
                        </button>
                        <button onClick={() => setModal({ producto: p, tipo: 'AJUSTE' })}
                          className="p-1.5 text-blue-400 hover:bg-blue-50 rounded-lg transition" title="Ajuste">
                          <SlidersHorizontal size={16} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ModalMovimiento
          producto={modal.producto}
          puntoVentaInicial={puntoVenta}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); cargar(); }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════
const TABS = [
  { key: 'productos',   label: 'Productos',   icon: Package },
  { key: 'categorias',  label: 'Categorías',  icon: Tag },
  { key: 'stock',       label: 'Stock',       icon: LayoutGrid },
];

export default function Inventario() {
  const { usuario } = useAuthStore();
  const [tab, setTab] = useState('productos');

  const puedeEscribir = ROLES_ESCRITURA.includes(usuario?.TipoUsuario);

  return (
    <div className="flex-1 p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-gray-800">Inventario</h1>
        <p className="text-sm text-gray-400 mt-1">Gestión de productos, categorías y stock por sucursal</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-gray-100 rounded-2xl p-1 mb-6 w-fit shadow-sm">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition
              ${tab === key
                ? 'text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
            style={tab === key ? { background: 'linear-gradient(135deg, #1A6A9A, #27AE60)' } : {}}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === 'productos'  && <TabProductos  puedeEscribir={puedeEscribir} />}
      {tab === 'categorias' && <TabCategorias puedeEscribir={puedeEscribir} />}
      {tab === 'stock'      && <TabStock      puedeEscribir={puedeEscribir} usuario={usuario} />}
    </div>
  );
}
