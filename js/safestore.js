// Automatic copies of the app's data on this phone (see safety.js for when and which).
// Own IndexedDB database "curio-safe" (not the app's "cardscan" one, so an older app version never sees a
// version change). Two stores: "meta" {id, t, reason, cards, fp, bytes} for the list, "data" {id, text}
// with the backup JSON (only read when restoring).

import { makeBackup, readBackup, restoreBackup } from './backup.js';
import { fingerprint, dailyDue, toDelete } from './safety.js';

const DB = 'curio-safe';
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('meta', { keyPath: 'id' });
        req.result.createObjectStore('data', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbp.catch(() => { dbp = null; });
  }
  return dbp;
}
function run(stores, mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(stores, mode);
    const out = fn(...stores.map((s) => t.objectStore(s)));
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const listCopies = () => run(['meta'], 'readonly', (m) => m.getAll()).then((l) => l.sort((a, b) => b.t - a.t)).catch(() => []);

const cardsIn = (b) => { try { return JSON.parse(b.data['cardscan-collection-v1'] || '[]').length; } catch { return 0; } };

// Takes a copy of everything now. reason: 'daily' (only when due), or an event ('import', 'restore', 'clear', 'manual').
// Returns the copy's meta (a new one, or the latest when it holds the same data), or null (daily copy not due /
// storage refused).
export async function takeCopy(reason = 'daily', now = Date.now()) {
  try {
    const b = makeBackup();
    const text = JSON.stringify(b);
    const fp = fingerprint(JSON.stringify(b.data));
    const metas = await listCopies();
    if (reason === 'daily' && !dailyDue(metas, now, fp)) return null;
    // the same data was just copied: that copy serves (no duplicate)
    if (reason !== 'daily' && metas[0]?.fp === fp) return metas[0];
    const meta = { id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`, t: now, reason, cards: cardsIn(b), fp, bytes: text.length };
    await run(['meta', 'data'], 'readwrite', (m, d) => { m.put(meta); d.put({ id: meta.id, text }); });
    const gone = toDelete([...metas, meta], now);
    if (gone.length) await run(['meta', 'data'], 'readwrite', (m, d) => { for (const id of gone) { m.delete(id); d.delete(id); } });
    return meta;
  } catch (e) {
    console.warn('safety copy failed', e);
    return null;
  }
}

// Puts a copy back (after taking a copy of the current state). Returns the backup that was replaced.
export async function restoreCopy(id) {
  const rec = await run(['data'], 'readonly', (d) => d.get(id));
  if (!rec?.text) throw new Error('copy not found');
  const b = readBackup(rec.text);
  await takeCopy('restore');
  return restoreBackup(b);
}

// Ask the browser to keep this site's data even when space runs low (Chrome grants it to installed apps
// and sites used often; no prompt there). -> true | false | null (not supported)
export async function keepData() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}
export async function isKept() {
  try { return navigator.storage?.persisted ? await navigator.storage.persisted() : null; } catch { return null; }
}
