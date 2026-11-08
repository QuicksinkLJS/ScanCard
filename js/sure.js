// Version certainty: how sure Curio is about the exact version (Cardmarket product) of a card in hand,
// which 2–3 versions it offers when it is not sure, and the quick picks (language, rarity, 1st Edition).
// Rule: Curio never guesses a version by itself – it picks one only when the set code or the pack proves it,
// otherwise the version stays open until you tap yours. No browser APIs (tested in Node).
//
// subject fields used: vkey (chosen version), vby ('user' = you picked it), code {code, base}, pack {prefix, name},
// language / code.language (read on the card), lang (your copy's language, set by hand), first (1st Edition)

import { baseOf } from './codematch.js';
import { bestOptions, rarityRank, versionLabel, optionHasLang, langsOf } from './prices.js';
import { langOf, isOcgOption } from './copy.js';

// Evidence a version needs before Curio picks it by itself: pack set (30/40) or set code (60/100).
// The card's language alone (20) only sorts the list.
export const AUTO_FROM = 30;

// The version Curio may pick by itself, or null.
export function autoPick(ranked) {
  const best = bestOptions(ranked);
  return best.length === 1 && best[0].likely >= AUTO_FROM ? best[0].key : null;
}

// Short rarity names for chips and small tiles.
const SHORT = {
  'quarter century secret rare': 'QCSR', 'prismatic secret rare': 'PSR', 'platinum secret rare': 'PlSR', 'starlight rare': 'Starlight',
  'ultimate rare': 'Ultimate', 'ghost rare': 'Ghost', "collector's rare": 'CR', 'collectors rare': 'CR', 'secret rare': 'Secret',
  'ultra rare': 'Ultra', 'super rare': 'Super', 'rare': 'Rare', 'common': 'Common', 'gold rare': 'Gold', 'premium gold rare': 'Premium Gold',
  'ultra parallel rare': 'Ultra Parallel', 'extra secret rare': 'Extra Secret', 'ultra secret rare': 'Ultra Secret',
  'gold secret rare': 'Gold Secret', 'short print': 'Short Print', 'super short print': 'Super Short Print',
};
export function shortRarity(r) {
  if (!r) return '';
  const k = r.toLowerCase().replace(/[’]/g, "'").trim();
  return SHORT[k] || (r.length > 16 ? r.replace(/ Rare$/, '') : r);
}

// OCG products often come without their rarity ("one of: Ultra, Secret, QCSR"). When a set has exactly as many
// products as rarities, the cheapest is most likely the lowest rarity – a guess by price, shown as "probably",
// never picked by itself. -> Map(key -> rarity)
export function rarityGuesses(opts) {
  const groups = new Map();
  for (const o of opts) {
    if (o.rarity || !(o.variants > 1) || !(o.rarities?.length > 1)) continue;
    const k = `${o.set}|${o.rarities.join('/')}|${o.codes.join(',')}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o);
  }
  const out = new Map();
  for (const g of groups.values()) {
    const rar = [...g[0].rarities].sort((a, b) => rarityRank(a) - rarityRank(b));
    const ranks = rar.map(rarityRank);
    if (g.length !== rar.length || g.length !== g[0].variants) continue;
    if (new Set(ranks).size !== ranks.length || ranks.some((x) => x >= 50)) continue;   // unknown or equal rank: no order
    if (g.some((o) => o.trend == null)) continue;
    const byPrice = [...g].sort((a, b) => a.trend - b.trend);
    if (new Set(byPrice.map((o) => o.trend)).size !== byPrice.length) continue;        // same price: no order
    byPrice.forEach((o, i) => out.set(o.key, rar[i]));
  }
  return out;
}

// The rarity of a version for the quick pick: known, guessed by price, or the set's possible rarities.
// -> {exact: 'Secret Rare' | '', guess: 'Secret Rare' | '', maybe: [...]}
export function rarityInfo(o, guesses = new Map()) {
  if (o.rarity) return { exact: o.rarity, guess: '', maybe: [o.rarity] };
  if (o.variants <= 1 && o.rarities?.length === 1) return { exact: o.rarities[0], guess: '', maybe: o.rarities };
  return { exact: '', guess: guesses.get(o.key) || '', maybe: o.rarities || [] };
}
const sameRar = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

// Quick pick: narrow the versions by language and rarity. Rarity: exact first, then guessed by price,
// then "could be" (one of the set's rarities). A filter that would leave nothing is ignored (noted in .ignored).
// -> {list, byRarity: 'exact' | 'guess' | 'maybe' | '', ignored: []}
export function narrow(ranked, { lang = '', rarity = '' } = {}, guesses = rarityGuesses(ranked)) {
  let list = ranked;
  const ignored = [];
  if (lang) {
    const l = list.filter((o) => optionHasLang(o, lang));
    if (l.length) list = l; else ignored.push('lang');
  }
  let byRarity = '';
  if (rarity) {
    const info = (o) => rarityInfo(o, guesses);
    const exact = list.filter((o) => sameRar(info(o).exact, rarity));
    const guess = list.filter((o) => !info(o).exact && sameRar(info(o).guess, rarity));
    const maybe = list.filter((o) => !info(o).exact && !info(o).guess && info(o).maybe.some((r) => sameRar(r, rarity)));
    if (exact.length) { list = [...exact, ...guess]; byRarity = 'exact'; }
    else if (guess.length) { list = [...guess, ...maybe]; byRarity = 'guess'; }
    else if (maybe.length) { list = maybe; byRarity = 'maybe'; }
    else ignored.push('rarity');
  }
  return { list, byRarity, ignored };
}

// The versions in question: those the set code / pack points to, else all.
export function candidates(ranked) {
  const best = bestOptions(ranked).filter((o) => o.likely >= AUTO_FROM);
  return best.length ? best : ranked;
}

// The chips of the quick pick. Languages: those the versions are printed in. Rarities: those of the versions left
// after the language pick, lowest first. 1st Edition: only when a non-OCG print is possible.
export function quickChoices(ranked, { lang = '', chosen = null } = {}) {
  const base = candidates(ranked);
  const langs = langsOf(base);
  const pool = lang ? narrow(base, { lang }).list : base;
  const g = rarityGuesses(ranked);
  const rar = new Map();
  for (const o of pool) {
    const r = rarityInfo(o, g);
    for (const x of r.exact ? [r.exact] : r.maybe) if (x && !rar.has(x.toLowerCase())) rar.set(x.toLowerCase(), x);
  }
  let rarities = [...rar.values()].sort((a, b) => rarityRank(a) - rarityRank(b));
  if (rarities.length > 6) rarities = rarities.filter((r) => rarityRank(r) < 50);   // odd names from the data ("commonparallel")
  rarities = rarities.slice(0, 10);
  const ocgLang = ['JP', 'KR', 'AE'].includes(lang);
  const first = !ocgLang && (chosen ? !isOcgOption(chosen) : pool.some((o) => !isOcgOption(o)));
  return { langs, rarities, first };
}

// Why Curio thinks a version fits (texts for the card page).
function reasons(o, s) {
  const out = [];
  if (s.code && o.codes.includes(s.code.code)) out.push(`Set code ${s.code.code} read on the card`);
  else if (s.code && o.codes.some((c) => baseOf(c) === s.code.base)) out.push(`Set code ${s.code.code} read on the card (same set and number)`);
  if (s.pack && ((s.pack.name && o.set === s.pack.name) || o.codes.some((c) => c.startsWith(`${s.pack.prefix}-`)))) out.push(`From the pack you are opening (${s.pack.name || s.pack.prefix})`);
  return out;
}

// How sure is Curio about the version?
// level: 'none'   no versions known
//        'picked' you picked it (or confirmed it)
//        'sure'   the set code / pack proves it, only one version fits
//        'check'  a version is set, but nothing proves it (picked automatically by an older Curio) – please confirm
//        'few'    2–3 versions left – tap yours
//        'open'   more than 3 – Curio does not guess
// -> {level, chosen, why, picks (up to 3 versions to tap), left (versions after the quick pick), byRarity, ignored}
export function certainty(ranked, s = {}, { rarity = '', max = 3 } = {}) {
  const chosen = s.vkey ? ranked.find((o) => o.key === s.vkey) || null : null;
  const base = { chosen, why: '', picks: [], left: ranked.length, byRarity: '', ignored: [] };
  if (!ranked.length) return { ...base, level: 'none', why: 'No version on Cardmarket' };
  if (chosen) {
    if (s.vby === 'user') return { ...base, level: 'picked', why: 'You picked this version' };
    if (s.vby === 'import') return { ...base, level: 'picked', why: 'Taken over from your import (set code, set and rarity fit)' };
    const best = bestOptions(ranked);
    const proof = reasons(chosen, s);
    if (best.length === 1 && best[0].key === chosen.key && chosen.likely >= AUTO_FROM && proof.length) {
      return { ...base, level: 'sure', why: proof.join(' · ') };
    }
    return { ...base, level: 'check', why: 'Picked automatically – nothing on the card proves it' };
  }
  // open: the versions that fit the evidence (set code / pack), narrowed by your quick pick
  const pool = candidates(ranked);
  const best = pool === ranked ? [] : pool;
  const lang = langOf(s);
  const n = narrow(pool, { lang, rarity });
  const left = n.list;
  const level = left.length <= max ? 'few' : 'open';
  let why;
  if (best.length && !rarity && !(lang && s.lang)) why = `${reasons(best[0], s)[0] || 'The set code'} – ${best.length} versions fit`;
  else if (rarity || s.lang) why = left.length === 1 ? '1 version left' : `${left.length} versions left`;
  else if (lang && left.length < ranked.length) why = `${left.length} versions in this language`;
  else why = `${ranked.length} versions – Curio won't guess`;
  // with evidence of the language only, the matching prints come first (ranked does that); otherwise newest first
  return { ...base, level, why, picks: left.slice(0, max), left: left.length, byRarity: n.byRarity, ignored: n.ignored };
}

// What a tile / list shows as the rarity: "Secret Rare", "probably Secret Rare", or "Rarity unknown".
export function pickLabel(o, guesses = new Map()) {
  const r = rarityInfo(o, guesses);
  if (r.exact) return versionLabel(o);
  if (r.guess) return `probably ${r.guess}`;
  return 'Rarity unknown';
}

// Is the language chip consistent with the chosen version? (picking Japanese for a European print clears it)
export const fitsLang = (o, lang) => !o || !lang || optionHasLang(o, lang);
