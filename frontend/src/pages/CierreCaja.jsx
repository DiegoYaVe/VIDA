/*
 * ============================================================
 * MIGRACIÓN SQL — ejecutar manualmente en SQL Server
 * ============================================================
 *
 * CREATE TABLE VIDA_CAJA_TURNOS (
 *   idBranch              BIGINT          NOT NULL,
 *   idCuenta              BIGINT          NOT NULL,
 *   idTurno               BIGINT          NOT NULL,
 *   idPuntoVenta          BIGINT          NOT NULL,
 *   idUsuario             BIGINT          NOT NULL,
 *   NombreUsuario         VARCHAR(200)    NULL,
 *   NombreSucursal        VARCHAR(200)    NULL,
 *   FechaApertura         DATETIME        NOT NULL DEFAULT GETDATE(),
 *   FechaCierre           DATETIME        NULL,
 *   MontoApertura         DECIMAL(18,4)   NOT NULL DEFAULT 0,
 *   TotalVentasEfectivo   DECIMAL(18,4)   NOT NULL DEFAULT 0,
 *   TotalVentasTarjeta    DECIMAL(18,4)   NOT NULL DEFAULT 0,
 *   TotalVentas           DECIMAL(18,4)   NOT NULL DEFAULT 0,
 *   NumTransacciones      INT             NOT NULL DEFAULT 0,
 *   MontoCierre           DECIMAL(18,4)   NULL,
 *   Diferencia            DECIMAL(18,4)   NULL,
 *   Observaciones         VARCHAR(500)    NULL,
 *   Status                VARCHAR(20)     NOT NULL DEFAULT 'ABIERTO',
 *   UsuAlta               VARCHAR(10)     NULL,
 *   FechaAlta             DATETIME        NOT NULL DEFAULT GETDATE(),
 *   CONSTRAINT PK_VIDA_CAJA_TURNOS PRIMARY KEY (idBranch, idCuenta, idTurno)
 * );
 *
 * ============================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wallet, Clock, DollarSign, CreditCard, ShoppingCart,
  RefreshCw, X, CheckCircle, AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore.js';
import api from '../services/api.js';
import { useToast } from '../components/Toast.jsx';

// ── Utilidades ─────────────────────────────────────────────────────────────

const fmt = (n) =>
  `$${parseFloat(n || 0).toFixed(2)}`;

function tiempoTranscurrido(fechaStr) {
  const diff = Math.floor((Date.now() - new Date(fechaStr).getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (h > 0) return `hace ${h}h ${m}min`;
  if (m > 0) return `hace ${m}min`;
  return 'recién abierto';
}

function formatHora(fechaStr) {
  if (!fechaStr) return '—';
  return new Date(fechaStr).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
}

function formatFecha(fechaStr) {
  if (!fechaStr) return '—';
  return new Date(fechaStr).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Badges ─────────────────────────────────────────────────────────────────

const METODO_CFG = {
  EFECTIVO: { label: 'Efectivo', cls: 'bg-green-100 text-green-700' },
  TARJETA:  { label: 'Tarjeta',  cls: 'bg-blue-100 text-blue-700' },
  MIXTO:    { label: 'Mixto',    cls: 'bg-purple-100 text-purple-700' },
};

function MetodoBadge({ metodo }) {
  const cfg = METODO_CFG[metodo] || { label: metodo || '—', cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const cfg = status === 'ABIERTO'
    ? 'bg-green-100 text-green-700'
    : 'bg-gray-100 text-gray-500';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${cfg}`}>
      {status}
    </span>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, color = 'text-[#1A6A9A]', sub }) {
  return (
    <div className="card p-5 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-gray-500 text-sm font-medium">
        <Icon size={16} />
        {label}
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Modal de Cierre
// ══════════════════════════════════════════════════════════════════════════════

function ModalCierre({ turno, ventas, efectivoEsperado, onClose, onCerrado }) {
  const [montoCierre, setMontoCierre] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [turnoCerrado, setTurnoCerrado] = useState(null);

  const diferencia = montoCierre !== '' ? parseFloat(montoCierre) - (efectivoEsperado || 0) : null;

  async function handleConfirmar() {
    if (montoCierre === '' || isNaN(parseFloat(montoCierre))) {
      toast.error('Ingresa el monto contado en caja');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/caja/cierre', {
        idTurno: turno.idTurno,
        MontoCierre: parseFloat(montoCierre),
        Observaciones: observaciones || null,
      });
      setTurnoCerrado(res.data.turno);
      setConfirmado(true);
      toast.success('Caja cerrada correctamente');
      onCerrado();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al cerrar caja');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-gray-800">
            {confirmado ? 'Turno Cerrado' : 'Cerrar Turno de Caja'}
          </h2>
          {!confirmado && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {confirmado && turnoCerrado ? (
            /* ── Resumen final ── */
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600 font-semibold">
                <CheckCircle size={20} />
                Turno #{turnoCerrado.idTurno} cerrado
              </div>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <Row label="Cajero"              value={turnoCerrado.NombreUsuario || '—'} />
                <Row label="Sucursal"            value={turnoCerrado.NombreSucursal || '—'} />
                <Row label="Apertura"            value={formatHora(turnoCerrado.FechaApertura)} />
                <Row label="Cierre"              value={formatHora(turnoCerrado.FechaCierre)} />
                <hr />
                <Row label="Efectivo inicial"    value={fmt(turnoCerrado.MontoApertura)} />
                <Row label="Ventas efectivo"     value={fmt(turnoCerrado.TotalVentasEfectivo)} />
                <Row label="Ventas tarjeta"      value={fmt(turnoCerrado.TotalVentasTarjeta)} />
                <Row label="Total ventas"        value={fmt(turnoCerrado.TotalVentas)} bold />
                <Row label="Transacciones"       value={turnoCerrado.NumTransacciones} />
                <hr />
                <Row label="Efectivo contado"    value={fmt(turnoCerrado.MontoCierre)} />
                <Row
                  label="Diferencia"
                  value={fmt(turnoCerrado.Diferencia)}
                  valueColor={parseFloat(turnoCerrado.Diferencia) < 0 ? 'text-red-600' : 'text-green-600'}
                  bold
                />
              </div>
              <button onClick={onClose} className="btn-primary w-full">
                Listo
              </button>
            </div>
          ) : (
            /* ── Formulario de cierre ── */
            <>
              <div className="bg-blue-50 rounded-xl p-4 text-sm space-y-1">
                <p className="text-gray-600">Efectivo esperado en caja:</p>
                <p className="text-2xl font-bold text-[#1A6A9A]">{fmt(efectivoEsperado)}</p>
                <p className="text-xs text-gray-400">
                  Inicial {fmt(turno.MontoApertura)} + Ventas en efectivo {fmt(ventas?.TotalEfectivo)}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Efectivo contado en caja (USD) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input-field"
                  placeholder="0.00"
                  value={montoCierre}
                  onChange={(e) => setMontoCierre(e.target.value)}
                />
                {diferencia !== null && (
                  <p className={`mt-1 text-sm font-semibold ${diferencia < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    Diferencia: {diferencia >= 0 ? '+' : ''}{fmt(diferencia)}
                    {diferencia < 0 && <AlertTriangle className="inline ml-1" size={14} />}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Observaciones (opcional)
                </label>
                <textarea
                  className="input-field resize-none"
                  rows={3}
                  placeholder="Notas sobre el cierre..."
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmar}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 font-medium transition disabled:opacity-50"
                >
                  {loading ? 'Cerrando...' : 'Confirmar Cierre'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold = false, valueColor = 'text-gray-800' }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`${bold ? 'font-bold' : ''} ${valueColor}`}>{value}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Página principal: CierreCaja
// ══════════════════════════════════════════════════════════════════════════════

export default function CierreCaja() {
  const { usuario } = useAuthStore();
  const toast = useToast();

  // Estado de turno
  const [turno, setTurno]               = useState(null);
  const [ventas, setVentas]             = useState(null);
  const [pedidos, setPedidos]           = useState([]);
  const [efectivoEsperado, setEfectivoEsperado] = useState(0);

  // Estado apertura
  const [montoApertura, setMontoApertura]       = useState('');
  const [obsApertura, setObsApertura]           = useState('');
  const [loadingApertura, setLoadingApertura]   = useState(false);

  // Historial
  const [historial, setHistorial]   = useState([]);
  const [histTotal, setHistTotal]   = useState(0);
  const [histPage, setHistPage]     = useState(1);
  const HIST_LIMIT = 10;

  // UI
  const [tab, setTab]               = useState('turno'); // 'turno' | 'historial'
  const [loadingResumen, setLoadingResumen] = useState(false);
  const [modalCierre, setModalCierre]       = useState(false);
  const [tiempo, setTiempo]         = useState('');

  const refreshRef = useRef(null);

  // ── Cargar turno activo ──────────────────────────────────────────────────

  const cargarTurnoActivo = useCallback(async () => {
    try {
      const res = await api.get('/caja/turno-activo');
      setTurno(res.data.turno);
      if (res.data.turno) {
        cargarResumen(res.data.turno.idTurno);
      }
    } catch (err) {
      // sin turno activo es válido
    }
  }, []);

  // ── Cargar resumen ───────────────────────────────────────────────────────

  const cargarResumen = useCallback(async (idTurnoParam) => {
    setLoadingResumen(true);
    try {
      const params = idTurnoParam ? { idTurno: idTurnoParam } : {};
      const res = await api.get('/caja/resumen', { params });
      if (res.data.turno) {
        setTurno(res.data.turno);
        setVentas(res.data.ventas);
        setPedidos(res.data.pedidos || []);
        setEfectivoEsperado(res.data.efectivoEsperado || 0);
      }
    } catch (err) {
      toast.error('Error al cargar resumen');
    } finally {
      setLoadingResumen(false);
    }
  }, []);

  // ── Cargar historial ─────────────────────────────────────────────────────

  const cargarHistorial = useCallback(async (page = 1) => {
    try {
      const res = await api.get('/caja/historial', {
        params: { page, limit: HIST_LIMIT },
      });
      setHistorial(res.data.data || []);
      setHistTotal(res.data.total || 0);
      setHistPage(page);
    } catch (err) {
      toast.error('Error al cargar historial');
    }
  }, []);

  // ── Efectos ──────────────────────────────────────────────────────────────

  useEffect(() => {
    cargarTurnoActivo();
    cargarHistorial(1);
  }, [cargarTurnoActivo, cargarHistorial]);

  // Actualizar tiempo transcurrido cada minuto
  useEffect(() => {
    if (!turno?.FechaApertura) return;
    setTiempo(tiempoTranscurrido(turno.FechaApertura));
    const id = setInterval(() => setTiempo(tiempoTranscurrido(turno.FechaApertura)), 60000);
    return () => clearInterval(id);
  }, [turno?.FechaApertura]);

  // Auto-refresh del resumen cada 30 segundos si hay turno abierto
  useEffect(() => {
    if (!turno || turno.Status !== 'ABIERTO') {
      if (refreshRef.current) clearInterval(refreshRef.current);
      return;
    }
    refreshRef.current = setInterval(() => cargarResumen(turno.idTurno), 30000);
    return () => clearInterval(refreshRef.current);
  }, [turno, cargarResumen]);

  // ── Abrir caja ───────────────────────────────────────────────────────────

  async function handleAbrirCaja(e) {
    e.preventDefault();
    if (montoApertura === '' || isNaN(parseFloat(montoApertura))) {
      toast.error('Ingresa el monto inicial en caja');
      return;
    }
    setLoadingApertura(true);
    try {
      await api.post('/caja/apertura', {
        MontoApertura: parseFloat(montoApertura),
        Observaciones: obsApertura || null,
      });
      toast.success('Caja abierta correctamente');
      setMontoApertura('');
      setObsApertura('');
      cargarTurnoActivo();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al abrir caja');
    } finally {
      setLoadingApertura(false);
    }
  }

  function handleCajaCerrada() {
    setModalCierre(false);
    setTurno(null);
    setVentas(null);
    setPedidos([]);
    cargarHistorial(1);
  }

  const histPages = Math.ceil(histTotal / HIST_LIMIT);

  // ══════════════════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1A6A9A] to-[#27AE60] px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-bold">Cierre de Caja</h1>
            <p className="text-white/70 text-sm mt-0.5">Control de turnos y arqueo</p>
          </div>
          {turno?.Status === 'ABIERTO' && (
            <div className="flex items-center gap-2 bg-white/20 text-white px-4 py-2 rounded-full text-sm font-semibold">
              <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
              TURNO ABIERTO — {tiempo}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl shadow-sm p-1 w-fit">
          {[
            { id: 'turno',    label: 'Turno Actual' },
            { id: 'historial', label: 'Historial' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); if (t.id === 'historial') cargarHistorial(1); }}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition ${
                tab === t.id
                  ? 'bg-[#1A6A9A] text-white shadow'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Turno Actual ── */}
        {tab === 'turno' && (
          <>
            {!turno || turno.Status !== 'ABIERTO' ? (
              /* Estado 1: Sin turno abierto */
              <div className="space-y-6">
                <div className="card p-8 max-w-md mx-auto text-center space-y-5">
                  <div className="flex justify-center">
                    <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                      <Wallet size={32} className="text-[#1A6A9A]" />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">No hay turno abierto</h2>
                    <p className="text-gray-500 text-sm mt-1">Abre la caja para comenzar a registrar ventas POS</p>
                  </div>

                  <form onSubmit={handleAbrirCaja} className="text-left space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Monto inicial en caja (USD efectivo) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input-field"
                        placeholder="0.00"
                        value={montoApertura}
                        onChange={(e) => setMontoApertura(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Observaciones (opcional)
                      </label>
                      <textarea
                        className="input-field resize-none"
                        rows={2}
                        placeholder="Notas de apertura..."
                        value={obsApertura}
                        onChange={(e) => setObsApertura(e.target.value)}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loadingApertura}
                      className="btn-primary w-full"
                    >
                      {loadingApertura ? 'Abriendo...' : 'Abrir Caja'}
                    </button>
                  </form>
                </div>

                {/* Mini historial debajo */}
                {historial.length > 0 && (
                  <div className="card overflow-hidden">
                    <div className="px-5 py-4 border-b">
                      <h3 className="font-semibold text-gray-700">Últimos turnos</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                          <tr>
                            <th className="px-4 py-3 text-left">Fecha</th>
                            <th className="px-4 py-3 text-left">Cajero</th>
                            <th className="px-4 py-3 text-right">Ventas</th>
                            <th className="px-4 py-3 text-right">Diferencia</th>
                            <th className="px-4 py-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {historial.slice(0, 5).map((t) => (
                            <tr key={t.idTurno} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-gray-600">{formatFecha(t.FechaApertura)}</td>
                              <td className="px-4 py-3 text-gray-800">{t.NombreUsuario || '—'}</td>
                              <td className="px-4 py-3 text-right font-medium">{fmt(t.TotalVentas)}</td>
                              <td className={`px-4 py-3 text-right font-medium ${parseFloat(t.Diferencia) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {t.Diferencia !== null ? (parseFloat(t.Diferencia) >= 0 ? '+' : '') + fmt(t.Diferencia) : '—'}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <StatusBadge status={t.Status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Estado 2: Turno abierto — pantalla principal */
              <div className="space-y-5">
                {/* Info del turno */}
                <div className="card p-5 flex flex-wrap gap-4 items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-gray-500 text-sm">Cajero</p>
                    <p className="font-semibold text-gray-800">{turno.NombreUsuario || '—'}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-gray-500 text-sm">Sucursal</p>
                    <p className="font-semibold text-gray-800">{turno.NombreSucursal || '—'}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-gray-500 text-sm">Apertura</p>
                    <p className="font-semibold text-gray-800">{formatHora(turno.FechaApertura)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => cargarResumen(turno.idTurno)}
                      className="p-2 border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 transition"
                      title="Actualizar"
                    >
                      <RefreshCw size={16} className={loadingResumen ? 'animate-spin' : ''} />
                    </button>
                    <button
                      onClick={() => setModalCierre(true)}
                      className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 font-medium text-sm transition"
                    >
                      Cerrar Caja
                    </button>
                  </div>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <KpiCard
                    icon={DollarSign}
                    label="Ventas del turno"
                    value={fmt(ventas?.TotalVentas)}
                    color="text-[#1A6A9A]"
                  />
                  <KpiCard
                    icon={Wallet}
                    label="Efectivo recibido"
                    value={fmt(ventas?.TotalEfectivo)}
                    color="text-[#27AE60]"
                  />
                  <KpiCard
                    icon={CreditCard}
                    label="Tarjeta"
                    value={fmt(ventas?.TotalTarjeta)}
                    color="text-purple-600"
                  />
                  <KpiCard
                    icon={ShoppingCart}
                    label="Transacciones"
                    value={ventas?.NumTransacciones ?? 0}
                    color="text-orange-500"
                  />
                </div>

                {/* Resumen de caja */}
                <div className="card p-5 space-y-3">
                  <h3 className="font-semibold text-gray-700 mb-1">Resumen de Caja</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Efectivo inicial</span>
                      <span>{fmt(turno.MontoApertura)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Ventas en efectivo</span>
                      <span>{fmt(ventas?.TotalEfectivo)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 font-bold text-gray-800 text-base">
                      <span>Efectivo esperado en caja</span>
                      <span className="text-[#1A6A9A]">{fmt(efectivoEsperado)}</span>
                    </div>
                  </div>
                </div>

                {/* Tabla de transacciones */}
                <div className="card overflow-hidden">
                  <div className="px-5 py-4 border-b flex items-center gap-2">
                    <Clock size={16} className="text-gray-400" />
                    <h3 className="font-semibold text-gray-700">Últimas transacciones del turno</h3>
                  </div>
                  <div className="overflow-y-auto max-h-72">
                    {pedidos.length === 0 ? (
                      <p className="text-center text-gray-400 py-8 text-sm">Sin transacciones aún</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 uppercase text-xs sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left">#Pedido</th>
                            <th className="px-4 py-3 text-left">Hora</th>
                            <th className="px-4 py-3 text-left">Método</th>
                            <th className="px-4 py-3 text-right">Monto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {pedidos.slice(0, 10).map((p) => (
                            <tr key={p.idPedido} className="hover:bg-gray-50">
                              <td className="px-4 py-2.5 text-gray-600">#{p.idPedido}</td>
                              <td className="px-4 py-2.5 text-gray-500">{formatHora(p.FechaAlta)}</td>
                              <td className="px-4 py-2.5"><MetodoBadge metodo={p.MetodoPago} /></td>
                              <td className="px-4 py-2.5 text-right font-medium text-gray-800">{fmt(p.TotalUSD)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Tab: Historial ── */}
        {tab === 'historial' && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h3 className="font-semibold text-gray-700">Historial de Turnos</h3>
            </div>
            <div className="overflow-x-auto">
              {historial.length === 0 ? (
                <p className="text-center text-gray-400 py-12 text-sm">Sin historial disponible</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                    <tr>
                      <th className="px-4 py-3 text-left">Fecha</th>
                      <th className="px-4 py-3 text-left">Cajero</th>
                      <th className="px-4 py-3 text-left">Sucursal</th>
                      <th className="px-4 py-3 text-right">Apertura</th>
                      <th className="px-4 py-3 text-right">Ventas</th>
                      <th className="px-4 py-3 text-right">Contado</th>
                      <th className="px-4 py-3 text-right">Diferencia</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {historial.map((t) => (
                      <tr key={t.idTurno} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {formatFecha(t.FechaApertura)}
                          <span className="block text-xs text-gray-400">{formatHora(t.FechaApertura)}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-800">{t.NombreUsuario || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{t.NombreSucursal || '—'}</td>
                        <td className="px-4 py-3 text-right">{fmt(t.MontoApertura)}</td>
                        <td className="px-4 py-3 text-right font-medium">{fmt(t.TotalVentas)}</td>
                        <td className="px-4 py-3 text-right">{t.MontoCierre !== null ? fmt(t.MontoCierre) : '—'}</td>
                        <td className={`px-4 py-3 text-right font-medium ${
                          t.Diferencia === null ? 'text-gray-400'
                          : parseFloat(t.Diferencia) < 0 ? 'text-red-600'
                          : 'text-green-600'
                        }`}>
                          {t.Diferencia !== null
                            ? (parseFloat(t.Diferencia) >= 0 ? '+' : '') + fmt(t.Diferencia)
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={t.Status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Paginación */}
            {histPages > 1 && (
              <div className="px-5 py-4 border-t flex items-center justify-between text-sm text-gray-500">
                <span>Página {histPage} de {histPages} — {histTotal} turnos</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => cargarHistorial(histPage - 1)}
                    disabled={histPage <= 1}
                    className="p-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => cargarHistorial(histPage + 1)}
                    disabled={histPage >= histPages}
                    className="p-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de Cierre */}
      {modalCierre && turno && (
        <ModalCierre
          turno={turno}
          ventas={ventas}
          efectivoEsperado={efectivoEsperado}
          onClose={() => setModalCierre(false)}
          onCerrado={handleCajaCerrada}
        />
      )}
    </div>
  );
}
