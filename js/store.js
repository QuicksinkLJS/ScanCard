// Everything the app keeps on the phone.
//  * collection: localStorage (small JSON list)
//  * training samples: IndexedDB (card cut-outs as JPEG + what the user finally chose)

import { gameKey } from './game.js';

const COLL_KEY = gameKey('cardscan-collection-v1');
const PACK_KEY = gameKey('cardscan-pack-v1');

export function loadCollection() {
  try { return JSON.parse(localStorage.getItem(COLL_KEY) || '[]'); } catch { return []; }
}
export function saveCollection(list) {
  try { localStorage.setItem(COLL_KEY, JSON.stringify(list)); } catch { /* storage full or blocked */ }
}
export function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function loadPack() {
  try { return JSON.parse(localStorage.getItem(PACK_KEY) || 'null'); } catch { return null; }
}
export function savePack(pack) {
  try {
    if (pack) localStorage.setItem(PACK_KEY, JSON.stringify(pack));
    else localStorage.removeItem(PACK_KEY);
  } catch { /* ignore */ }
}

// ---------- training samples ----------
let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('cardscan', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('samples', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction('samples', mode);
    const store = t.objectStore('samples');
    const out = fn(store);
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  }));
}

// sample: {id, image (Blob), predicted: {name, score, top}, final: {name, version, code}, time}
// Writing the same id again replaces it: only the last choice counts.
export function putSample(sample) {
  return tx('readwrite', (s) => s.put(sample)).catch((e) => console.warn('sample not saved', e));
}
export function updateSample(id, patch) {
  return tx('readwrite', (s) => {
    const req = s.get(id);
    req.onsuccess = () => { if (req.result) s.put({ ...req.result, ...patch, time: Date.now() }); };
  }).catch(() => {});
}
export function deleteSample(id) {
  return tx('readwrite', (s) => s.delete(id)).catch(() => {});
}
export function allSamples() {
  return tx('readonly', (s) => s.getAll()).catch(() => []);
}
export function countSamples() {
  return tx('readonly', (s) => s.count()).catch(() => 0);
}
