// Turning the printings of a card into a version list and prices. No browser APIs (tested in Node).

import { baseOf } from './codematch.js';
import { valueTier } from './parse.js';

// One option per Cardmarket product (that is what has a price).
// rows: api.cardDetail(name)
export function versionOptions(rows) {
  const byId = new Map();
  for (const r of rows) {
    r.products.forEach((p, i) => {
      const key = String(p.id);
      const have = byId.get(key);
      if (have) {
        for (const c of r.codes) if (!have.codes.includes(c)) have.codes.push(c);
        return;
      }
      byId.set(key, {
        key, set: r.set, year: r.year, date: r.date, rarities: r.rarities, codes: [...r.codes], expansion: r.expansion ?? null,
        variant: r.products.length > 1 ? i + 1 : 0, variants: r.products.length,
        label: '', rarity: '', image: '', path: '', ...p,
      });
    });
  }
  const order = (c) => { const m = /-([A-Z]{0,2})\d{3}$/.exec(c); return CODE_ORDER.indexOf(m ? m[1] : '') >>> 0; };
  for (const o of byId.values()) o.codes.sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  return [...byId.values()];
}

// Codes shown first: English, other European languages, then Asian prints.
const CODE_ORDER = ['EN', 'E', '', 'DE', 'G', 'FR', 'F', 'IT', 'I', 'SP', 'S', 'PT', 'P', 'AE', 'KR', 'K', 'JP'];

// How likely is each option the card in hand? Printed code > pack set > language; the rest newest release first.
// ctx: {code: {code, base}, pack: {prefix, name}, lang: 'JP' | 'DE' | ..., vkey}
export function rankOptions(opts, ctx = {}) {
  const score = (o) => {
    let s = 0;
    if (ctx.code) {
      if (o.codes.includes(ctx.code.code)) s += 100;
      else if (o.codes.some((c) => baseOf(c) === ctx.code.base)) s += 60;
    }
    if (ctx.pack) {
      if (ctx.pack.name && o.set === ctx.pack.name) s += 40;
      else if (o.codes.some((c) => c.startsWith(`${ctx.pack.prefix}-`))) s += 30;
    }
    // Japanese card: the OCG versions on Cardmarket fit better than the European ones
    if (ctx.lang && ['JP', 'JA'].includes(ctx.lang) && /\(OCG\)/.test(o.set)) s += 20;
    return s;
  };
  return opts
    .map((o) => ({ ...o, likely: score(o) }))
    .sort((a, b) => ((b.key === ctx.vkey) - (a.key === ctx.vkey)) || (b.likely - a.likely)
      || (b.date || '').localeCompare(a.date || '') || a.set.localeCompare(b.set)
      || (rarityRank(a.rarity) - rarityRank(b.rarity)) || (a.variant - b.variant));
}

// Rarity order inside a set, lowest first. Unknown rarities go last.
const RARITY_ORDER = [
  'common', 'short print', 'super short print', 'rare', 'super rare', 'ultra rare', 'ultra parallel rare', 'parallel rare',
  'gold rare', 'premium gold rare', 'mosaic rare', 'starfoil rare', 'shatterfoil rare', 'duel terminal',
  'secret rare', 'prismatic secret rare', 'ultra secret rare', 'extra secret rare', 'gold secret rare', 'platinum rare',
  'platinum secret rare', 'collectors rare', 'prismatic collectors rare', 'ultimate rare', 'prismatic ultimate rare',
  'ghost rare', 'starlight rare', 'quarter century secret rare', 'grand master rare', 'special',
];
export function rarityRank(r) {
  if (!r) return 99;
  const k = r.toLowerCase().replace(/['’]/g, '').replace(/\s+/g, ' ').trim();
  const i = RARITY_ORDER.indexOf(k);
  if (i >= 0) return i;
  const j = RARITY_ORDER.findIndex((x) => k.includes(x)); // "Duel Terminal Ultra Rare" etc.
  return j >= 0 ? j + 0.5 : 50;
}

// What the version is called: "Ultra Rare", "Quarter Century Secret Rare · 7th Art", or the set's rarities if unknown.
export function versionLabel(o) {
  if (o.label) return o.label;
  if (o.variants <= 1 && o.rarities.length === 1) return o.rarities[0];
  return 'Rarity unknown';
}

// Cardmarket page of this exact version; else a search for the card (in its expansion when known).
export function cardmarketUrl(o, name) {
  const base = 'https://www.cardmarket.com/en/YuGiOh/Products';
  if (o?.path) return `${base}/Singles/${o.path.split('/').map(encodeURIComponent).join('/')}`;
  const q = `searchString=${encodeURIComponent(name)}`;
  return o?.expansion ? `${base}/Search?${q}&idExpansion=${o.expansion}` : `${base}/Search?${q}`;
}

// Picture of this version on CardTrader (bigger "show_" size), or ''.
export function versionImage(o, size = 'show') {
  if (!o?.image) return '';
  const i = o.image.lastIndexOf('/');
  const file = `${size ? `${size}_` : ''}${o.image.slice(i + 1)}`;
  return `https://www.cardtrader.com/uploads/blueprints/image/${o.image.slice(0, i + 1)}${encodeURI(file)}`;
}

// The options that fit the evidence best (all with the top score), or [] if there is no evidence.
export function bestOptions(ranked) {
  if (!ranked.length || !ranked[0].likely) return [];
  return ranked.filter((o) => o.likely === ranked[0].likely);
}

export function priceOf(opts) {
  const t = opts.map((o) => o.trend).filter((v) => v != null);
  if (!t.length) return { lo: null, hi: null, exact: false };
  return { lo: Math.min(...t), hi: Math.max(...t), exact: opts.length === 1 };
}

export const tierOfPrice = (p) => valueTier(p?.hi ?? p?.lo);

// Values that are far from the others, e.g. one odd sale yesterday.
export function oddValues(o) {
  const vals = ['avg1', 'avg7', 'avg30', 'trend'].map((k) => o[k]).filter((v) => v != null).sort((a, b) => a - b);
  if (vals.length < 3) return new Set();
  const mid = vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
  const odd = new Set();
  for (const k of ['avg1', 'avg7', 'avg30', 'trend']) {
    const v = o[k];
    if (v == null || !mid) continue;
    if (Math.abs(v - mid) / mid > 0.5 && Math.abs(v - mid) > 0.5) odd.add(k);
  }
  return odd;
}

// Short label for an option: "Supreme Darkness (2025) · SUDA-EN014"
export function optionCode(o, lang) {
  if (lang) {
    const own = o.codes.find((c) => new RegExp(`-${lang}\\d`).test(c));
    if (own) return own;
  }
  return o.codes[0] || '';
}

// Version filter on the card page: set code ("MP19", "tn09-en", "LOB-EN001"), set name or rarity.
export function filterOptions(opts, q) {
  const t = String(q || '').trim().toLowerCase();
  if (!t) return opts;
  const code = t.toUpperCase().replace(/\s+/g, '');
  return opts.filter((o) => o.codes.some((c) => c.startsWith(code) || c.replace('-', '').startsWith(code.replace('-', '')))
    || (o.set || '').toLowerCase().includes(t)
    || `${o.rarity} ${o.label} ${(o.rarities || []).join(' ')}`.toLowerCase().includes(t));
}
