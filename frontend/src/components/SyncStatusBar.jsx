import { Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { useSyncStatus } from '../hooks/useSyncStatus.js';
import { syncNow } from '../services/syncEngine.js';

// Indicador persistente de conexión/sincronización para el POS.
// Informativo, no bloqueante: el cajero puede seguir cobrando en rojo.
export default function SyncStatusBar() {
  const { isOnline, isSyncing, pendingCount, syncError } = useSyncStatus();

  // Online, sin pendientes y sin errores: no estorbar
  if (isOnline && pendingCount === 0 && !isSyncing && !syncError) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-xs font-semibold">
        <Wifi size={13} />
        En línea
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-50 text-yellow-700 text-xs font-semibold">
        <RefreshCw size={13} className="animate-spin" />
        Sincronizando {pendingCount > 0 ? `(${pendingCount})` : ''}...
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 text-red-700 text-xs font-semibold">
        <WifiOff size={13} />
        Sin conexión
        {pendingCount > 0 && <span className="ml-1 bg-red-600 text-white rounded-full px-1.5">{pendingCount}</span>}
      </div>
    );
  }

  // Online pero con pendientes o error de sync
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 text-orange-700 text-xs font-semibold">
      {syncError ? <AlertTriangle size={13} /> : <CheckCircle size={13} />}
      {pendingCount} venta{pendingCount === 1 ? '' : 's'} pendiente{pendingCount === 1 ? '' : 's'}
      <button
        onClick={() => syncNow()}
        className="ml-1 underline hover:no-underline"
        title={syncError || 'Reintentar sincronización'}
      >
        Reintentar
      </button>
    </div>
  );
}
