// Wishlist (cards you want – one tap, no price) and watchlist (price tracking, optional target price).
// Stored on the phone. Live and beta share this storage: only add fields, never rename or drop them.
import { newId } from './store.js';
import { gameKey } from './game.js';

const WATCH = gameKey('cardscan-watch-v1');
const WISH = gameKey('cardscan-wish-v1');
const MIGRATED = gameKey('cardscan-lists-mig1');
const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full */ } };
const same = (a, b) => a.name === b.name && (a.vkey || null) === (b.vkey || null);

export const loadWatch = () => load(WATCH);
export const loadWish = () => load(WISH);
export const findWatch = (s) => loadWatch().find((x) => same(x, s)) || null;
export const findWish = (s) => loadWish().find((x) => same(x, s)) || null;

// ---------- watchlist ----------
// price: {lo, hi, label}
export function toggleWatch(s, price) {
  const l = loadWatch();
  const i = l.findIndex((x) => same(x, s));
  if (i >= 0) { l.splice(i, 1); save(WATCH, l); return false; }
  l.unshift(watchEntry(s, price));
  save(WATCH, l);
  return true;
}
const watchEntry = (s, price, target = null) => ({ id: newId(), name: s.name, vkey: s.vkey || null, label: price?.label || '', at: price?.lo ?? null, atHi: price?.hi ?? null, date: Date.now(), target });

// Target price on the watchlist (adds the card to the watchlist if needed). target null = no target.
export function setWatchTarget(s, target, price) {
  const l = loadWatch();
  const w = l.find((x) => same(x, s));
  if (w) w.target = target;
  else l.unshift(watchEntry(s, price, target));
  save(WATCH, l);
}
export function removeWatch(id) { save(WATCH, loadWatch().filter((x) => x.id !== id)); }
export function restoreWatch(entry) { const l = loadWatch().filter((x) => !same(x, entry)); l.unshift(entry); save(WATCH, l); }

// ---------- wishlist ----------
// extra: {group, deck, cond, lang, first} (group: 'single' | 'deck'; deck: {id, name})
export function addWish(s, price, extra = {}) {
  const l = loadWish().filter((x) => !same(x, s));
  const entry = { id: newId(), name: s.name, vkey: s.vkey || null, label: price?.label || '', at: price?.lo ?? null, date: Date.now(), group: 'single', ...extra };
  l.unshift(entry);
  save(WISH, l);
  return entry;
}
export function toggleWish(s, price, extra) {
  const w = findWish(s);
  if (w) { removeWish(s); return null; }
  return addWish(s, price, extra);
}
export function updateWish(id, patch) {
  save(WISH, loadWish().map((x) => (x.id === id ? { ...x, ...patch } : x)));
}
export function restoreWish(entry) { const l = loadWish().filter((x) => !same(x, entry)); l.unshift(entry); save(WISH, l); }
export function removeWish(s) { save(WISH, loadWish().filter((x) => !same(x, s))); }
export function removeWishId(id) { save(WISH, loadWish().filter((x) => x.id !== id)); }

// Below target? Uses the lowest price of the range (any fitting version).
export const belowTarget = (w, price) => price?.lo != null && w.target != null && price.lo <= w.target;

// Once: wishlist entries with a target price (old wishlist) also go to the watchlist with that target.
// The wishlist entry stays as it is (the old app version still reads its target).
export function migrateLists() {
  try { if (localStorage.getItem(MIGRATED)) return 0; } catch { return 0; }
  const watch = loadWatch();
  let n = 0;
  for (const w of loadWish()) {
    if (w.target == null) continue;
    const x = watch.find((y) => same(y, w));
    if (x) { if (x.target == null) { x.target = w.target; n++; } } else {
      watch.push({ id: newId(), name: w.name, vkey: w.vkey || null, label: w.label || '', at: w.at ?? null, atHi: null, date: w.date || Date.now(), target: w.target });
      n++;
    }
  }
  if (n) save(WATCH, watch);
  try { localStorage.setItem(MIGRATED, '1'); } catch { /* ignore */ }
  return n;
}
