// Capa de datos: IndexedDB (todo se guarda en el teléfono, sin servidor).
const DB_NAME = 'biblioteca-alejandria';
const DB_VERSION = 1;
export const STORES = ['works', 'patterns', 'teams', 'settings', 'cache'];

let dbPromise;
function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('works')) db.createObjectStore('works', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('patterns')) db.createObjectStore('patterns', { keyPath: 'host' });
      if (!db.objectStoreNames.contains('teams')) db.createObjectStore('teams', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const db = {
  all: (store) => tx(store, 'readonly', (s) => wrap(s.getAll())),
  get: (store, key) => tx(store, 'readonly', (s) => wrap(s.get(key))),
  put: (store, value) => tx(store, 'readwrite', (s) => { s.put(value); return value; }),
  putMany: (store, values) => tx(store, 'readwrite', (s) => { values.forEach((v) => s.put(v)); return values.length; }),
  del: (store, key) => tx(store, 'readwrite', (s) => { s.delete(key); }),
  clear: (store) => tx(store, 'readwrite', (s) => { s.clear(); }),
};

// Ajustes: pares clave/valor
export async function getSetting(key, fallback = null) {
  const row = await db.get('settings', key);
  return row ? row.value : fallback;
}
export function setSetting(key, value) {
  return db.put('settings', { key, value });
}

// Caché con caducidad (para respuestas de APIs, p. ej. partidos)
export async function cacheGet(key, maxAgeMs = Infinity) {
  const row = await db.get('cache', key);
  if (!row) return null;
  return { data: row.data, fresh: Date.now() - row.t < maxAgeMs, t: row.t };
}
export function cacheSet(key, data) {
  return db.put('cache', { key, data, t: Date.now() });
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
