// Kleiner Promise-Wrapper um IndexedDB. Alles bleibt lokal im Browser.
// Stores: items (Metadaten), images (Bilder als ArrayBuffer), outfits, settings.

const DB_NAME = 'kleiderschrank';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('outfits')) db.createObjectStore('outfits', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const done = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const txDone = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

export async function getAll(store) {
  const db = await open();
  return done(db.transaction(store).objectStore(store).getAll());
}
export async function get(store, key) {
  const db = await open();
  return done(db.transaction(store).objectStore(store).get(key));
}
export async function put(store, value) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  return txDone(tx);
}
export async function putMany(store, values) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  values.forEach((v) => os.put(v));
  return txDone(tx);
}
export async function del(store, key) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return txDone(tx);
}
export async function clear(store) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  return txDone(tx);
}
export async function getAllKeys(store) {
  const db = await open();
  return done(db.transaction(store).objectStore(store).getAllKeys());
}

// Bilder werden als ArrayBuffer gespeichert (robuster als Blobs in Safari).
// key = "<itemId>:image" | "<itemId>:thumb" | "<itemId>:orig"
export async function putImage(key, blob) {
  const buf = await blob.arrayBuffer();
  return put('images', { key, type: blob.type || 'image/png', buf });
}
export async function getImage(key) {
  const rec = await get('images', key);
  return rec ? new Blob([rec.buf], { type: rec.type }) : null;
}
export async function deleteImages(itemId) {
  await Promise.all(['image', 'thumb', 'orig'].map((k) => del('images', `${itemId}:${k}`)));
}

// Speicher dauerhaft machen (Browser darf dann nicht einfach aufräumen).
export async function requestPersist() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}
export async function isPersisted() {
  try { return navigator.storage?.persisted ? await navigator.storage.persisted() : null; } catch { return null; }
}
export async function estimate() {
  try { return navigator.storage?.estimate ? await navigator.storage.estimate() : null; } catch { return null; }
}

// Eindeutige ID (crypto.randomUUID gibt es nur über HTTPS, daher eigene Variante)
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
