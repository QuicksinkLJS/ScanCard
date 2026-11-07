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
        key, set: r.set, year: r.year, date: r.date, rarities: r.rarities, codes: [...r.codes],
        variant: r.products.length > 1 ? i + 1 : 0, variants: r.products.length, ...p,
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
      || (b.date || '').localeCompare(a.date || '') || ((a.trend ?? 1e9) - (b.trend ?? 1e9)));
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
