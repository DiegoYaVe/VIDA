// Cola offline de ventas POS sobre IndexedDB.
// Persiste aunque se cierre el navegador o se reinicie la PC — ese es el punto.
import { openDB } from 'idb';

const DB_NAME = 'pos_venezuela';
const DB_VERSION = 1;
const STORE_VENTAS = 'ventas_pendientes';
const STORE_DESCARTADAS = 'ventas_descartadas';
const STORE_CATALOGO = 'catalogo_productos';

const MAX_INTENTOS = 5;

// crypto.randomUUID solo existe en contextos seguros (https/localhost) —
// fallback para el POS servido por IP LAN en http
export function genUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_VENTAS)) {
          db.createObjectStore(STORE_VENTAS, { keyPath: 'ClienteUUID' });
        }
        if (!db.objectStoreNames.contains(STORE_DESCARTADAS)) {
          db.createObjectStore(STORE_DESCARTADAS, { keyPath: 'ClienteUUID' });
        }
        if (!db.objectStoreNames.contains(STORE_CATALOGO)) {
          const store = db.createObjectStore(STORE_CATALOGO, { keyPath: 'idProducto' });
          store.createIndex('porSKU', 'SKU');
        }
      },
    });
  }
  return dbPromise;
}

// ── Cola de ventas ──────────────────────────────────────────────────────────

export async function addToQueue(venta) {
  const db = await getDB();
  await db.put(STORE_VENTAS, { ...venta, intentos: 0, encoladaEn: new Date().toISOString() });
}

export async function getQueue() {
  const db = await getDB();
  const todas = await db.getAll(STORE_VENTAS);
  return todas.sort((a, b) => (a.encoladaEn || '').localeCompare(b.encoladaEn || ''));
}

export async function removeFromQueue(clienteUUID) {
  const db = await getDB();
  await db.delete(STORE_VENTAS, clienteUUID);
}

export async function countQueue() {
  const db = await getDB();
  return db.count(STORE_VENTAS);
}

// Venta rechazada por el servidor (motivo permanente): incrementa intentos y
// tras MAX_INTENTOS la mueve a descartadas para que no bloquee la cola
export async function marcarFallo(clienteUUID, motivo) {
  const db = await getDB();
  const venta = await db.get(STORE_VENTAS, clienteUUID);
  if (!venta) return;
  venta.intentos = (venta.intentos || 0) + 1;
  venta.ultimoError = motivo;
  if (venta.intentos >= MAX_INTENTOS) {
    await db.put(STORE_DESCARTADAS, { ...venta, descartadaEn: new Date().toISOString() });
    await db.delete(STORE_VENTAS, clienteUUID);
    console.error(`[offline] Venta ${clienteUUID} descartada tras ${MAX_INTENTOS} intentos: ${motivo}`);
  } else {
    await db.put(STORE_VENTAS, venta);
  }
}

export async function getDescartadas() {
  const db = await getDB();
  return db.getAll(STORE_DESCARTADAS);
}

// ── Catálogo offline (búsqueda de productos sin red) ────────────────────────

export async function guardarCatalogo(productos) {
  const db = await getDB();
  const tx = db.transaction(STORE_CATALOGO, 'readwrite');
  await tx.store.clear();
  for (const p of productos) await tx.store.put(p);
  await tx.done;
}

export async function buscarEnCatalogo(termino, limit = 20) {
  const db = await getDB();
  const todos = await db.getAll(STORE_CATALOGO);
  const t = termino.trim().toLowerCase();
  if (!t) return [];
  // Mismo criterio que el backend: SKU exacto primero, luego nombre/código parcial
  const porSKU = todos.filter(p => String(p.SKU || '').toLowerCase() === t);
  if (porSKU.length) return porSKU;
  return todos
    .filter(p =>
      String(p.Nombre || '').toLowerCase().includes(t) ||
      String(p.SKU || '').toLowerCase().includes(t) ||
      String(p.CodigoBarras || '').toLowerCase().includes(t))
    .slice(0, limit);
}

export async function countCatalogo() {
  const db = await getDB();
  return db.count(STORE_CATALOGO);
}
