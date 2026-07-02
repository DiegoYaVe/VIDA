// Motor de sincronización de ventas offline.
// Estrategia: toda venta POS se encola SIEMPRE en IndexedDB y se sincroniza
// vía POST /pedidos/sync (idempotente por ClienteUUID). Si hay red, sincroniza
// al instante; si no, el polling de 30s + el evento 'online' la recuperan.
import api from './api.js';
import {
  getQueue, removeFromQueue, countQueue, marcarFallo, guardarCatalogo,
} from './offlineQueue.js';

const INTERVALO_SYNC_MS = 30_000;
const INTERVALO_CATALOGO_MS = 5 * 60_000;
const LOTE_MAX = 25;

const listeners = new Set();
let syncing = false;
let lastSyncAt = null;
let syncError = null;
let intervalId = null;
let catalogoIntervalId = null;

// ── Suscripción para la UI ──────────────────────────────────────────────────

export function onSyncChange(fn) {
  listeners.add(fn);
  emit();
  return () => listeners.delete(fn);
}

async function emit() {
  const pendingCount = await countQueue().catch(() => 0);
  const estado = { isSyncing: syncing, pendingCount, lastSyncAt, syncError, isOnline: navigator.onLine };
  listeners.forEach(fn => { try { fn(estado); } catch {} });
}

// ── Sincronización ──────────────────────────────────────────────────────────

export async function syncNow() {
  if (syncing) return null;
  const queue = await getQueue();
  if (queue.length === 0) { await emit(); return { synced: [], failed: [] }; }

  syncing = true;
  syncError = null;
  await emit();

  try {
    const lote = queue.slice(0, LOTE_MAX).map(({ intentos, encoladaEn, ultimoError, ...venta }) => venta);
    const res = await api.post('/pedidos/sync', { ventas: lote });

    for (const s of res.data.synced || []) {
      await removeFromQueue(s.ClienteUUID);
    }
    // Rechazos del servidor (motivo permanente, ej. items inválidos):
    // se reintentan hasta 5 veces y luego se descartan para no bloquear la cola
    for (const f of res.data.failed || []) {
      if (f.ClienteUUID) await marcarFallo(f.ClienteUUID, f.motivo);
    }

    lastSyncAt = new Date();
    syncing = false;
    await emit();

    // Si quedan más de LOTE_MAX pendientes, seguir con el siguiente lote
    if ((await countQueue()) > 0 && (res.data.synced || []).length > 0) {
      return syncNow();
    }
    return res.data;
  } catch (err) {
    // Sin red o servidor caído: la cola queda intacta, se reintenta después
    syncing = false;
    syncError = err.response?.data?.error || 'Sin conexión con el servidor';
    await emit();
    return null;
  }
}

// ── Catálogo offline ────────────────────────────────────────────────────────

export async function refrescarCatalogo() {
  if (!navigator.onLine) return;
  try {
    const r = await api.get('/inventario/productos', { params: { limit: 1000, page: 1 } });
    const productos = r.data.data || [];
    if (productos.length) await guardarCatalogo(productos);
  } catch {
    // sin red o sin permiso — el catálogo cacheado anterior sigue sirviendo
  }
}

// ── Arranque ────────────────────────────────────────────────────────────────

export function startSyncEngine() {
  if (intervalId) return;

  window.addEventListener('online', () => { syncNow(); refrescarCatalogo(); });
  window.addEventListener('offline', () => emit());

  intervalId = setInterval(() => {
    if (navigator.onLine) syncNow();
  }, INTERVALO_SYNC_MS);

  catalogoIntervalId = setInterval(refrescarCatalogo, INTERVALO_CATALOGO_MS);

  // Primer ciclo al arrancar (recupera ventas de sesiones anteriores)
  syncNow();
  refrescarCatalogo();
}

export function stopSyncEngine() {
  clearInterval(intervalId);
  clearInterval(catalogoIntervalId);
  intervalId = null;
  catalogoIntervalId = null;
}
