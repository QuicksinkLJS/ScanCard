// Friends: share your whole collection as a QR code (or a link) and visit the collections of friends.
// No server yet: what a friend shows you is a snapshot from the moment they shared it. Later the same
// snapshot can come from an account instead.
//
// Snapshot (v1), kept small for QR codes – cards by their passcode (or name if there is none) and the
// Cardmarket product id of the version:
//   { v: 1, id, n: name, t: time,
//     c: [[card, vkey, count, cond, lang, first]]          collection (same copies grouped; sorted by vkey and
//                                                          vkey stored as the step from the row before – compresses well)
//     w: [[card, vkey, deckName, cond, lang, first]]        wishlist ('' = single cards)
//     m: [[exp, setName, target, [hidden keys]]]            tracked mastersets
//     o: {vkey: n}                                          ticks made in the masterset lists
//     d: [[deckName, [[card, need]]]] }                     decks (main + extra + side together)
// Encoded: JSON -> deflate-raw -> base64url. A QR code holds one part; long snapshots are split into parts
// ("CSF1/<id>/<i>/<n>/<data>") that the scanner collects. A link holds the whole thing after #friend=.

import { gameKey, GAME } from './game.js';

export const QR_PREFIX = 'CSF1/';
export const PART_SIZE = 1200; // characters of base64 per QR code – small enough to scan from a phone screen

// ---------- encoding ----------
const b64url = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
export async function encodeSnapshot(snap) {
  const raw = new TextEncoder().encode(JSON.stringify(snap));
  return b64url(await pipe(raw, new CompressionStream('deflate-raw')));
}
export async function decodeSnapshot(text) {
  const raw = await pipe(unb64url(text), new DecompressionStream('deflate-raw'));
  const snap = JSON.parse(new TextDecoder().decode(raw));
  if (!snap || snap.v !== 1 || !snap.id) throw new Error('Not a CardScan collection');
  return snap;
}

// ---------- QR parts ----------
export function splitParts(data, id, size = PART_SIZE) {
  const n = Math.max(1, Math.ceil(data.length / size));
  return Array.from({ length: n }, (_, i) => `${QR_PREFIX}${id}/${i + 1}/${n}/${data.slice(i * size, (i + 1) * size)}`);
}
// Collects scanned parts; returns {done, have, total, data}
export function createCollector() {
  let id = null, total = 0;
  const parts = new Map();
  return function add(text) {
    const m = /^CSF1\/([\w-]+)\/(\d+)\/(\d+)\/([\w-]*)$/.exec(String(text || '').trim());
    if (!m) return null;
    const [, pid, i, n, data] = m;
    if (pid !== id) { id = pid; total = Number(n); parts.clear(); }
    parts.set(Number(i), data);
    const done = parts.size === total;
    return { done, have: parts.size, total, data: done ? Array.from({ length: total }, (_, k) => parts.get(k + 1)).join('') : null };
  };
}

// ---------- building a snapshot from this phone ----------
// toCode(name) -> passcode or the name itself
export function buildSnapshot({ me, collection, wish, tracked, ticks, decks, toCode = (n) => n }) {
  const groups = new Map();
  for (const e of collection) {
    const row = [toCode(e.name), Number(e.vkey) || 0, 1, e.cond || '', e.lang || e.language?.code || '', e.first == null ? '' : e.first ? 1 : 0];
    const k = JSON.stringify([row[0], row[1], row[3], row[4], row[5]]);
    if (groups.has(k)) groups.get(k)[2]++; else groups.set(k, row);
  }
  const trim = (row) => { const r = [...row]; while (r.length > 2 && (r[r.length - 1] === '' || r[r.length - 1] == null)) r.pop(); return r; };
  let prev = 0;
  const rows = [...groups.values()].sort((a, b) => a[1] - b[1]).map((r) => { const d = r[1] ? r[1] - prev : 0; if (r[1]) prev = r[1]; return [r[0], d, ...r.slice(2)]; });
  return {
    v: 1, g: GAME.id, id: me.id, n: me.name || 'Friend', t: Date.now(),
    c: rows.map(trim),
    w: wish.map((w) => trim([toCode(w.name), Number(w.vkey) || 0, w.group === 'deck' ? (w.deck?.name || 'Deck') : '', w.cond || '', w.lang && w.lang !== 'any' ? w.lang : '', w.first ? 1 : ''])),
    m: tracked.map((t) => trim([t.exp, t.name, t.target || 1, t.hidden?.length ? t.hidden.map(Number) : ''])),
    o: Object.fromEntries(Object.entries(ticks || {}).filter(([, v]) => v)),
    d: (decks || []).map((d) => [d.name, ['main', 'extra', 'side'].flatMap((p) => (d.cards?.[p] || []).map((c) => [toCode(c.name), c.need]))]),
  };
}

// ---------- reading a friend's snapshot ----------
// fromCode(code) -> card name. Returns plain lists the UI can use.
export function readSnapshot(snap, fromCode = (c) => String(c)) {
  const name = (c) => (typeof c === 'number' ? fromCode(c) : c) || String(c);
  const first = (f) => (f === 1 ? true : f === 0 ? false : null);
  return {
    id: snap.id, name: snap.n, time: snap.t, game: snap.g || 'ygo',
    collection: (() => { let prev = 0; return (snap.c || []).map(([c, dv, count = 1, cond = '', lang = '', f = '']) => {
      const vkey = dv ? (prev += dv) : 0;
      return { name: name(c), vkey: vkey ? String(vkey) : null, count, cond, lang, first: first(f) };
    }); })(),
    wish: (snap.w || []).map(([c, vkey, deck = '', cond = '', lang = '', f = '']) => ({ name: name(c), vkey: vkey ? String(vkey) : null, deck, cond, lang: lang || 'any', first: f === 1 ? true : null })),
    sets: (snap.m || []).map(([exp, setName, target = 1, hidden = []]) => ({ exp, name: setName, target, hidden: (hidden || []).map(String) })),
    ticks: snap.o || {},
    decks: (snap.d || []).map(([deckName, cards]) => ({ name: deckName, cards: cards.map(([c, need]) => ({ name: name(c), need })) })),
  };
}

// Copies per version (collection + masterset ticks), like ownedCounts() for your own phone
export function friendOwned(f) {
  const n = {};
  for (const e of f.collection) if (e.vkey) n[e.vkey] = (n[e.vkey] || 0) + e.count;
  for (const [k, v] of Object.entries(f.ticks)) n[k] = Math.max(0, (n[k] || 0) + v);
  return n;
}

// What fits between you and a friend: cards they have that you wish for, cards you have that they wish for.
// Names compared case-insensitively; a wished version (vkey) must match exactly.
export function matchTrades({ mine, myWish, theirs, theirWish }) {
  const key = (n) => String(n || '').toLowerCase();
  const fits = (wish, card) => key(wish.name) === key(card.name) && (!wish.vkey || wish.vkey === card.vkey);
  const pick = (cards, wishes) => {
    const out = [];
    for (const w of wishes) {
      const c = cards.find((x) => fits(w, x));
      if (c && !out.some((o) => o.card === c)) out.push({ wish: w, card: c });
    }
    return out;
  };
  return { forMe: pick(theirs, myWish), forThem: pick(mine, theirWish) };
}

// A fair offer: from the cards they want of yours, pick a set close in value to what you ask for.
// value(card) -> euro. Greedy from the most valuable down, never more than 25 % over.
export function suggestOffer(askValue, candidates, value) {
  const sorted = [...candidates].sort((a, b) => (value(b) || 0) - (value(a) || 0));
  const out = [];
  let sum = 0;
  for (const c of sorted) {
    const v = value(c) || 0;
    if (!v) continue;
    if (sum + v <= askValue * 1.25 || (!out.length && v <= askValue * 1.6)) { out.push(c); sum += v; }
    if (sum >= askValue * 0.9) break;
  }
  return { cards: out, value: Math.round(sum * 100) / 100 };
}

// ---------- storage ----------
const FRIENDS = gameKey('cardscan-friends-v1');
const ME = 'cardscan-me-v1';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
export function loadMe() {
  let me = load(ME, null);
  if (!me) { me = { id: Math.random().toString(36).slice(2, 10), name: '' }; save(ME, me); }
  return me;
}
export const saveMe = (me) => save(ME, me);
export const loadFriends = () => load(FRIENDS, []);
// The same friend again (same id) replaces the old snapshot; your nickname for them stays.
export function addFriend(snap) {
  const list = loadFriends();
  const i = list.findIndex((f) => f.id === snap.id);
  const entry = { id: snap.id, name: i >= 0 && list[i].nick ? list[i].name : snap.n, nick: i >= 0 ? list[i].nick : false, at: Date.now(), snap };
  if (i >= 0) list[i] = entry; else list.unshift(entry);
  return save(FRIENDS, list) ? { entry, updated: i >= 0 } : null;
}
export const removeFriend = (id) => save(FRIENDS, loadFriends().filter((f) => f.id !== id));
export const restoreFriend = (f) => { const l = loadFriends().filter((x) => x.id !== f.id); l.unshift(f); save(FRIENDS, l); };
export const renameFriend = (id, name) => save(FRIENDS, loadFriends().map((f) => (f.id === id ? { ...f, name, nick: true } : f)));
