// Collector quartet: your real collection as a top-trumps card against a friend's (from their QR code).
// Pick a category, their value flips over, the higher (or for "oldest card" the lower) wins the round.
// No browser APIs – tested in Node.

export const SHINY = new Set(['secret', 'qcsr', 'starlight', 'ghost', 'relief', 'prismatic', 'collector', 'rainbow']);

// better: 'high' or 'low' wins; fmt: how the value is shown
export const CATS = [
  { k: 'value', label: 'Collection value', better: 'high', fmt: 'eur' },
  { k: 'top', label: 'Most valuable card', better: 'high', fmt: 'eur' },
  { k: 'cards', label: 'Cards', better: 'high', fmt: 'n' },
  { k: 'shiny', label: 'Secret Rares & better', better: 'high', fmt: 'n' },
  { k: 'oldest', label: 'Oldest card', better: 'low', fmt: 'year' },
  { k: 'langs', label: 'Print languages', better: 'high', fmt: 'n' },
  { k: 'master', label: 'Best masterset', better: 'high', fmt: 'pct' },
];

const mid = (p) => (p?.lo != null ? (p.hi != null ? (p.lo + p.hi) / 2 : p.lo) : 0);

// rows: [{name, count, lang, p: {lo, hi, exact, rarity, year, image, guess}}]
// kindOf(rarity) -> holo kind (holo.js holoKind); master: {pct, name} best tracked set or null
// Returns {value, cards, top, shiny, oldest, langs, master} – each {v, name?} (v null = nothing to show)
export function collectorStats(rows, { kindOf = () => 'plain', master = null } = {}) {
  let value = 0, cards = 0, shiny = 0, top = null, oldest = null;
  const langs = new Set();
  for (const r of rows) {
    const n = r.count || 1, p = r.p || null;
    cards += n;
    // exact version: middle of its price range; open version: the cheapest one (a wide range would inflate it)
    const v = p ? (p.exact ? mid(p) : (p.lo ?? 0)) : 0;
    value += v * n;
    if (p && v > 0 && (!top || v > top.v)) top = { v, name: r.name, image: p.image || p.guess || '' };
    if (p?.exact && p.rarity && SHINY.has(kindOf(p.rarity))) shiny += n;
    if (p?.year && (!oldest || p.year < oldest.v)) oldest = { v: p.year, name: r.name };
    if (r.lang) langs.add(String(r.lang).toUpperCase() === 'AE' ? 'AE' : String(r.lang).toUpperCase());
  }
  return {
    value: { v: Math.round(value * 100) / 100 }, cards: { v: cards }, shiny: { v: shiny },
    top: top || { v: null }, oldest: oldest || { v: null }, langs: { v: langs.size },
    master: master && master.pct != null ? { v: master.pct, name: master.name } : { v: null },
  };
}

// 1: a wins, -1: b wins, 0: draw. A missing value always loses against a present one.
export function compare(cat, a, b) {
  const c = typeof cat === 'string' ? CATS.find((x) => x.k === cat) : cat;
  const x = a?.[c.k]?.v ?? null, y = b?.[c.k]?.v ?? null;
  if (x == null && y == null) return 0;
  if (x == null) return -1;
  if (y == null) return 1;
  if (Math.abs(x - y) < 1e-9) return 0;
  return (c.better === 'low' ? x < y : x > y) ? 1 : -1;
}

// Score after the categories picked so far: {me, them, draws, done}
export function score(picked, a, b) {
  const s = { me: 0, them: 0, draws: 0, done: picked.length >= CATS.length };
  for (const k of picked) {
    const r = compare(k, a, b);
    if (r > 0) s.me++; else if (r < 0) s.them++; else s.draws++;
  }
  return s;
}

// Best masterset in % (have / total, rounded down) from [{name, have, total}]
export function bestMaster(list) {
  let best = null;
  for (const m of list || []) {
    if (!m.total) continue;
    const pct = Math.floor((m.have / m.total) * 100);
    if (!best || pct > best.pct) best = { pct, name: m.name };
  }
  return best;
}

// A short card code like on a real quartet card (A1 … D4), by collection value
export function cardCode(value) {
  const tiers = [[5000, 'A'], [1000, 'B'], [200, 'C'], [0, 'D']];
  const letter = tiers.find(([min]) => value >= min)[1];
  const n = 1 + (Math.floor(value) % 4);
  return `${letter}${n}`;
}
