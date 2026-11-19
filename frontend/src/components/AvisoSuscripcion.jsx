// src/components/AvisoSuscripcion.jsx
// Lo que ve la tienda de su mensualidad (sql/63): un aviso arriba si está por
// vencer o vencida, y una pantalla completa si quedó suspendida por falta de
// pago (con lo que debe y cómo pagarle a VIDA). El servidor es quien bloquea
// (responde 423); esto solo lo explica. Al registrarse el pago se reactiva.
import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Lock, RefreshCw, LogOut } from 'lucide-react';
import api from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';

const ROLES_TIENDA = ['ADMIN', 'SUPERVISOR', 'CAJERO', 'CASHIER'];
const USD = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const FECHA = (f) => f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-VE', { day: 'numeric', month: 'long' }) : '';
export const EVENTO_SUSPENDIDA = 'vida:tienda-suspendida';

export default function AvisoSuscripcion() {
  const { usuario, logout } = useAuthStore();
  const [s, setS] = useState(null);
  const [revisando, setRevisando] = useState(false);
  const esTienda = ROLES_TIENDA.includes(usuario?.TipoUsuario) && !!usuario?.idPuntoVenta;

  const cargar = useCallback(async () => {
    if (!esTienda) return;
    setRevisando(true);
    try { setS((await api.get('/suscripcion/mia', { silencioso: true })).data); } catch { /* sin aviso */ }
    finally { setRevisando(false); }
  }, [esTienda]);

  useEffect(() => { cargar(); }, [cargar]);
  // Si el servidor rechaza una acción por suspensión, se muestra la pantalla
  useEffect(() => {
    const alBloquear = () => cargar();
    window.addEventListener(EVENTO_SUSPENDIDA, alBloquear);
    return () => window.removeEventListener(EVENTO_SUSPENDIDA, alBloquear);
  }, [cargar]);

  if (!esTienda || !s) return null;

  if (s.estado === 'SUSPENDIDA') {
    return (
      <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="susp-titulo">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6 sm:p-8">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4"><Lock size={30} className="text-red-600" /></div>
          <h2 id="susp-titulo" className="text-xl sm:text-2xl font-black text-gray-900 text-center">Tu tienda está suspendida</h2>
          <p className="text-gray-500 text-center mt-2">La mensualidad de VIDA no se pagó a tiempo. Paga lo pendiente y el sistema se reactiva solo en cuanto VIDA registre tu pago.</p>
          <div className="mt-5 rounded-2xl border border-gray-100 divide-y divide-gray-50">
            {s.cargos.map(c => (
              <div key={c.idDocumento} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="text-gray-600">{c.Notas}</span>
                <span className="font-bold text-gray-900 whitespace-nowrap">{USD(c.Saldo)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-b-2xl">
              <span className="font-bold text-gray-700">Total a pagar</span>
              <span className="text-xl font-black text-red-600">{USD(s.deudaUSD)}</span>
            </div>
          </div>
          {s.DatosPagoVida
            ? <p className="mt-4 text-sm text-gray-700 whitespace-pre-line bg-blue-50 rounded-xl px-4 py-3"><b>Cómo pagar:</b> {s.DatosPagoVida}</p>
            : <p className="mt-4 text-sm text-gray-500 text-center">Comunícate con VIDA para pagar.</p>}
          <div className="mt-6 flex flex-col sm:flex-row gap-2">
            <button onClick={cargar} disabled={revisando} className="flex-1 flex items-center justify-center gap-2 bg-vida-blue text-white font-bold rounded-xl py-3 disabled:opacity-60">
              <RefreshCw size={16} /> Ya pagué, revisar
            </button>
            <button onClick={logout} className="flex items-center justify-center gap-2 border border-gray-200 text-gray-600 font-semibold rounded-xl px-4 py-3">
              <LogOut size={16} /> Salir
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (s.estado === 'VENCIDA' || s.estado === 'POR_VENCER') {
    const vencida = s.estado === 'VENCIDA';
    return (
      <div role="status" className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm border-b ${vencida ? 'bg-orange-50 border-orange-100 text-orange-900' : 'bg-amber-50 border-amber-100 text-amber-900'}`}>
        <AlertTriangle size={16} className="shrink-0" />
        <span className="flex-1 min-w-[12rem]">
          {vencida
            ? <>Tu mensualidad de VIDA está vencida: debes <b>{USD(s.deudaUSD)}</b>.{s.diasParaCorte != null && <> Si no pagas, el sistema se corta en <b>{s.diasParaCorte} día{s.diasParaCorte === 1 ? '' : 's'}</b>.</>}</>
            : <>Tu mensualidad de VIDA (<b>{USD(s.deudaUSD)}</b>) vence el <b>{FECHA(s.vencimiento)}</b>.</>}
        </span>
        {s.DatosPagoVida && <span className="text-xs opacity-80">{s.DatosPagoVida}</span>}
      </div>
    );
  }
  return null;
}
