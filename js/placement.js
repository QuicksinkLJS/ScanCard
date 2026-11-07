// Where does a scanned card go? Binder assistant for the sorting piles:
//   1. a tracked masterset still misses this version -> "Binder <set>, page 4, pocket 7" (in the set's sort order)
//   2. a deck still misses this card                 -> "Deck <name>"
//   3. otherwise the value piles (bulk / keep / sell) from sortpile.js
// The pure helpers are tested in Node; createPlacer needs the API and the phone's data.
import { sortEntries, fillCodes } from './mastercalc.js';
import { rarityRank, fairTrend } from './prices.js';

// Pocket of an entry in a binder of 9-pocket pages: page and pocket counted from 1, row/column too.
export function binderSpot(entries, key, perPage = 9) {
  const i = entries.findIndex((e) => e.key === String(key));
  if (i < 0) return null;
  const pocket = (i % perPage) + 1;
  return { index: i, page: Math.floor(i / perPage) + 1, pocket, row: Math.ceil(pocket / 3), col: ((pocket - 1) % 3) + 1 };
}

// Copies a deck still misses, by card name: need minus copies owned (any version), spread over the decks in order.
export function deckNeeds(decks, ownedByName) {
  const left = { ...ownedByName };
  const out = new Map(); // name -> [deck names]
  for (const d of decks) {
    const rows = ['main', 'extra', 'side'].flatMap((p) => d.cards?.[p] || []);
    for (const r of rows) {
      const k = r.name.toLowerCase();
      const have = Math.min(left[k] || 0, r.need);
      left[k] = (left[k] || 0) - have;
      if (have < r.need) { if (!out.has(k)) out.set(k, []); if (!out.get(k).includes(d.name)) out.get(k).push(d.name); }
    }
  }
  return out;
}

export function createPlacer({ api, loadTracked, ownedCounts, loadDecks, loadCollection }) {
  const setCache = new Map();
  async function setOrder(t) {
    const key = `${t.exp}|${t.sort || 'number'}|${(t.hidden || []).join(',')}`;
    if (!setCache.has(key)) {
      setCache.set(key, (async () => {
        let entries = await api.setEntries(t.exp).catch(() => []);
        if (entries.some((e) => !e.code)) {
          const names = [...new Set(entries.filter((e) => !e.code).map((e) => e.name))];
          const infos = new Map(await Promise.all(names.map(async (n) => [n, await api.nameInfo(n).catch(() => null)])));
          entries = fillCodes(entries, infos);
        }
        const hid = new Set(t.hidden || []);
        const rank = (r) => { const k = rarityRank(r); return k >= 99 ? -1 : k; };
        return sortEntries(entries.filter((e) => !hid.has(e.key)), t.sort || 'number', { rank, value: (e) => fairTrend(e).v ?? e.trend });
      })());
    }
    return setCache.get(key);
  }

  // cards: scanned cards ({name, vkey}). Cards of the same photo count against each other (two copies of a
  // version that is missing once: only the first goes to the binder).
  async function place(cards) {
    const tracked = loadTracked();
    const { all } = ownedCounts();
    const taken = {};
    const owned = {};
    for (const e of loadCollection()) owned[e.name.toLowerCase()] = (owned[e.name.toLowerCase()] || 0) + 1;
    const needs = deckNeeds(loadDecks(), owned);
    const deckTaken = {};
    const out = new Map();
    const orders = await Promise.all(tracked.map((t) => setOrder(t)));
    for (const c of cards) {
      let spot = null;
      if (c.vkey) {
        for (let i = 0; i < tracked.length && !spot; i++) {
          const t = tracked[i];
          const s = binderSpot(orders[i], c.vkey);
          if (!s) continue;
          const k = String(c.vkey);
          if ((all[k] || 0) + (taken[k] || 0) < (t.target || 1)) {
            taken[k] = (taken[k] || 0) + 1;
            spot = { kind: 'binder', exp: t.exp, set: t.name, key: k, ...s };
          }
        }
      } else {
        // version not known yet: is the card in a tracked set at all?
        for (let i = 0; i < tracked.length && !spot; i++) {
          const cands = orders[i].filter((e) => e.name === c.name && (all[e.key] || 0) < (tracked[i].target || 1));
          if (cands.length) spot = { kind: 'binder?', exp: tracked[i].exp, set: tracked[i].name, count: cands.length };
        }
      }
      if (!spot) {
        const k = c.name.toLowerCase();
        const decks = needs.get(k);
        if (decks?.length && !(deckTaken[k] >= decks.length)) {
          spot = { kind: 'deck', deck: decks[deckTaken[k] || 0] };
          deckTaken[k] = (deckTaken[k] || 0) + 1;
        }
      }
      out.set(c, spot);
    }
    return out;
  }
  return { place, clear: () => setCache.clear() };
}

// Short set label for a tag: the set code if there is one in the name's entries, else the first word(s)
export function shortSet(name) {
  const n = String(name || '').replace(/\s*\(OCG\)\s*/, '');
  return n.length <= 16 ? n : n.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 6);
}
