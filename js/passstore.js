// Card passports on this phone: own IndexedDB database (not the app's "cardscan" one, so its version
// never changes under an older app). Records:
//   {id, kind: 'pass' | 'check', entryId, name, version, kind2 (holo kind), t, label, feat (packed), cent,
//    tilt: {list, why, clear}, foil: {state, text}, img (Blob JPEG, straightened card), against?, result?, truth?}
// 'check' records are re-scans compared against a passport – kept for calibrating the comparison.

const DB = 'curio-pass', STORE = 'records';
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('entry', 'entryId');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbp.catch(() => { dbp = null; });
  }
  return dbp;
}
function run(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  }));
}

export const savePass = (rec) => run('readwrite', (s) => s.put(rec));
export const getPass = (id) => run('readonly', (s) => s.get(id));
export const deletePass = (id) => run('readwrite', (s) => s.delete(id));
export const allPasses = () => run('readonly', (s) => s.getAll()).catch(() => []);
export async function passesFor(entryId) {
  if (!entryId) return [];
  const list = await run('readonly', (s) => s.index('entry').getAll(entryId)).catch(() => []);
  return list.filter((r) => r.kind === 'pass').sort((a, b) => b.t - a.t);
}
