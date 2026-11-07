// Masterset numbers (no browser APIs, tested in Node).
// entries: [{key, trend}], owned: {key: copies}, target: copies wanted per entry
// Only trend prices count: the lowest offer of a rarely sold card is often a placeholder (€999…).
import { fairTrend } from './prices.js';

export function progress(entries, owned, target = 1) {
  let have = 0, missingValue = 0, unpriced = 0;
  for (const e of entries) {
    const n = Math.min(owned[e.key] || 0, target);
    have += n;
    if (n < target) {
      const v = fairTrend(e).v;
      if (v == null) unpriced++;
      else missingValue += (target - n) * v;
    }
  }
  return { have, total: entries.length * target, missingValue, unpriced };
}

// Sorting a set: by set number (natural: JP001 < JP010 < JP100), name, value (fair trend), rarity, missing first.
// have(e) = copies you have, target = copies wanted. Cards without a value or code go last. Stable.
export const SET_SORTS = ['number', 'value', 'value-asc', 'name', 'rarity', 'missing'];
export function sortEntries(list, by = 'number', { have = () => 0, target = 1, rank = () => 0, value = (e) => e.trend } = {}) {
  const num = (e) => e.code || '';
  // without codes (very new sets): Cardmarket's order (product id), which follows the set list as well as anything
  const byNumber = (a, b) => (!num(a) - !num(b)) || num(a).localeCompare(num(b), 'en', { numeric: true }) || ((a.id ?? 0) - (b.id ?? 0)) || a.name.localeCompare(b.name);
  const val = (e) => { const v = value(e); return v == null || Number.isNaN(v) ? null : v; };
  const byValue = (dir) => (a, b) => {
    const x = val(a), y = val(b);
    if (x == null || y == null) return (x == null) - (y == null) || byNumber(a, b);
    return dir * (x - y) || byNumber(a, b);
  };
  const cmp = {
    number: byNumber,
    value: byValue(-1),
    'value-asc': byValue(1),
    name: (a, b) => a.name.localeCompare(b.name) || byNumber(a, b),
    rarity: (a, b) => rank(b.rarity) - rank(a.rarity) || byNumber(a, b),
    missing: (a, b) => ((have(a) >= target) - (have(b) >= target)) || byNumber(a, b),
  }[by] || byNumber;
  return [...list].sort(cmp);
}

// Sets whose Cardmarket entries have no set numbers (older sets): take them from the card data – the code prefix
// that most cards of this set share (e.g. LOB) – so the set can be sorted by number. infos: name -> {bases}.
export function fillCodes(entries, infos) {
  const open = entries.filter((e) => !e.code);
  if (!open.length) return entries;
  const names = [...new Set(open.map((e) => e.name))];
  const count = {};
  for (const n of names) for (const p of new Set((infos.get(n)?.bases || []).map((b) => b.split('-')[0]))) count[p] = (count[p] || 0) + 1;
  const [prefix, n] = Object.entries(count).sort((a, b) => b[1] - a[1])[0] || [];
  if (!prefix || n < names.length * 0.5) return entries;
  const code = (name) => (infos.get(name)?.bases || []).filter((b) => b.startsWith(`${prefix}-`)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))[0] || '';
  return entries.map((e) => (e.code ? e : { ...e, code: code(e.name), codeFromData: true }));
}
