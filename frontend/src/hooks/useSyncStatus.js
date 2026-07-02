import { useState, useEffect } from 'react';
import { onSyncChange } from '../services/syncEngine.js';

// Estado de conectividad y sincronización offline para la UI
export function useSyncStatus() {
  const [estado, setEstado] = useState({
    isOnline: navigator.onLine,
    isSyncing: false,
    pendingCount: 0,
    lastSyncAt: null,
    syncError: null,
  });

  useEffect(() => onSyncChange(setEstado), []);

  return estado;
}
