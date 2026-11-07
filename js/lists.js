// Watchlist (price change since marked) and wishlist (target price). Stored on the phone.
import { newId } from './store.js';

const WATCH = 'cardscan-watch-v1';
const WISH = 'cardscan-wish-v1';
const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full */ } };
const same = (a, b) => a.name === b.name && (a.vkey || null) === (b.vkey || null);

export const loadWatch = () => load(WATCH);
export const loadWish = () => load(WISH);
export const findWatch = (s) => loadWatch().find((x) => same(x, s)) || null;
export const findWish = (s) => loadWish().find((x) => same(x, s)) || null;

// price: {lo, hi, label}
export function toggleWatch(s, price) {
  const l = loadWatch();
  const i = l.findIndex((x) => same(x, s));
  if (i >= 0) { l.splice(i, 1); save(WATCH, l); return false; }
  l.unshift({ id: newId(), name: s.name, vkey: s.vkey || null, label: price?.label || '', at: price?.lo ?? null, atHi: price?.hi ?? null, date: Date.now() });
  save(WATCH, l);
  return true;
}
export function removeWatch(id) { save(WATCH, loadWatch().filter((x) => x.id !== id)); }

export function setWish(s, target, price) {
  const l = loadWish().filter((x) => !same(x, s));
  l.unshift({ id: newId(), name: s.name, vkey: s.vkey || null, label: price?.label || '', target, at: price?.lo ?? null, date: Date.now() });
  save(WISH, l);
}
export function removeWish(s) { save(WISH, loadWish().filter((x) => !same(x, s))); }
export function removeWishId(id) { save(WISH, loadWish().filter((x) => x.id !== id)); }

// Below target? Uses the lowest price of the range (any fitting version).
export const belowTarget = (w, price) => price?.lo != null && w.target != null && price.lo <= w.target;
