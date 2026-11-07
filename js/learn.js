// Learning from corrections: when you fix a card's name, the fingerprint of your photo is kept
// on the phone and compared along with the official ones next time (same card, same light, same sleeve).

import { gameKey } from './game.js';

const DB = gameKey('cardscan-learn');
const MAX = 400; // newest first; older ones drop out
let cache = [];
let dbp = null;

function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('prints', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbp.catch(() => { dbp = null; });
  }
  return dbp;
}

export async function loadLearned() {
  try {
    const d = await db();
    const all = await new Promise((resolve, reject) => {
      const r = d.transaction('prints').objectStore('prints').getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
    cache = all.sort((a, b) => b.time - a.time).slice(0, MAX).map((x) => ({ ...x, emb: new Float32Array(x.emb) }));
  } catch (e) { console.warn('learned prints not available', e); }
  return cache;
}

export const learned = () => cache;

// id: one per scanned card (the sample id), so correcting twice keeps only the last name
export async function learn(id, name, emb) {
  if (!id || !name || !emb?.length) return;
  const rec = { id, name, emb: Array.from(emb), time: Date.now() };
  cache = [{ ...rec, emb: Float32Array.from(emb) }, ...cache.filter((x) => x.id !== id)].slice(0, MAX);
  try {
    const d = await db();
    await new Promise((resolve, reject) => {
      const t = d.transaction('prints', 'readwrite');
      t.objectStore('prints').put(rec);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  } catch (e) { console.warn('learned print not saved', e); }
}

export async function forgetLearned() {
  cache = [];
  try { const d = await db(); d.transaction('prints', 'readwrite').objectStore('prints').clear(); } catch { /* ignore */ }
}
