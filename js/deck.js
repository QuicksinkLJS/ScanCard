// Decks: read .ydk files, ydke:// links and plain lists; count what you have; pick versions to buy.
// No browser APIs except atob (also in Node 16+), tested in Node.

import { rarityRank } from './prices.js';
import { isOcgOption as isOcg } from './copy.js';

// .ydk: "#main", "#extra", "!side", one passcode per line
export function parseYdk(text) {
  const deck = { main: [], extra: [], side: [] };
  let part = 'main';
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (/^#main/i.test(line)) part = 'main';
    else if (/^#extra/i.test(line)) part = 'extra';
    else if (/^!side/i.test(line)) part = 'side';
    else if (/^\d{3,10}$/.test(line)) deck[part].push(line.replace(/^0+(?=\d)/, ''));
  }
  return deck;
}

// ydke://<main>!<extra>!<side>! – each part is base64 of little-endian uint32 passcodes
export function parseYdke(url) {
  const m = /ydke:\/\/([^!]*)!([^!]*)!([^!]*)!?/.exec(String(url).trim());
  if (!m) return null;
  const ids = (b64) => {
    if (!b64) return [];
    const bin = atob(b64);
    const out = [];
    for (let i = 0; i + 3 < bin.length; i += 4) {
      out.push(String((bin.charCodeAt(i) | (bin.charCodeAt(i + 1) << 8) | (bin.charCodeAt(i + 2) << 16) | (bin.charCodeAt(i + 3) << 24)) >>> 0));
    }
    return out;
  };
  return { main: ids(m[1]), extra: ids(m[2]), side: ids(m[3]) };
}

// Plain list: "3 Ash Blossom & Joyous Spring", "3x Ash Blossom", "Ash Blossom"; headers Main/Extra/Side switch parts.
export function parseList(text) {
  const deck = { main: [], extra: [], side: [] };
  let part = 'main';
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const h = /^(?:[#!/=-]*\s*)(main|extra|side)(?:\s*deck)?\s*:?\s*(?:\(\d+\))?$/i.exec(line);
    if (h) { part = h[1].toLowerCase(); continue; }
    const m = /^(\d{1,2})\s*x?\s+(.+)$/i.exec(line);
    const n = m ? Number(m[1]) : 1;
    let name = (m ? m[2] : line).trim();
    for (let k = 0; k < 3; k++) name = name.replace(/\s*\([^)]*\)\s*$/, '').trim(); // "(V.2) (Expansion)"
    
    if (!name || /^\d+$/.test(name)) continue;
    for (let i = 0; i < Math.min(n, 3); i++) deck[part].push({ name });
  }
  return deck;
}

// Any of the three. Returns {main, extra, side} with entries as passcode strings or {name}.
export function parseDeck(text) {
  const t = String(text || '').trim();
  if (/^ydke:\/\//i.test(t)) return parseYdke(t);
  if (/^(#main|#created|#extra|!side)/im.test(t) && /^\d{5,10}\s*$/m.test(t)) return parseYdk(t);
  return parseList(t);
}

// -> {main: [{name, need}], extra, side} with names resolved and duplicates counted
export function resolveDeck(deck, passcodes) {
  const out = {};
  const unknown = [];
  for (const part of ['main', 'extra', 'side']) {
    const counts = new Map();
    for (const x of deck[part] || []) {
      const name = typeof x === 'string' ? passcodes[x] : x.name;
      if (!name) { unknown.push(x); continue; }
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    out[part] = [...counts].map(([name, need]) => ({ name, need }));
  }
  return { ...out, unknown };
}

// Owned copies are shared over Main, Extra and Side (in that order). owned: {normName: copies}
export function allocate(resolved, owned, norm) {
  const left = { ...owned };
  const res = {};
  let need = 0, have = 0;
  for (const part of ['main', 'extra', 'side']) {
    res[part] = (resolved[part] || []).map((r) => {
      const k = norm(r.name);
      const h = Math.min(r.need, left[k] || 0);
      left[k] = (left[k] || 0) - h;
      need += r.need; have += h;
      return { ...r, have: h, missing: r.need - h };
    });
  }
  return { ...res, need, have };
}

// The version to buy. prefs: {mode: 'cheap' | 'max', lang: 'any' | 'JP' | 'EN' | ...}
// opts: version options of the card ({set, trend, rarity, rarities, codes, ...}).
export function pickVersion(opts, prefs = {}) {
  let pool = opts.filter((o) => o.trend != null);
  // Japanese prints: OCG expansions, or sets whose only codes are Japanese/Korean prints
  if (prefs.lang === 'JP') { const j = pool.filter(isOcg); if (j.length) pool = j; }
  else if (prefs.lang && prefs.lang !== 'any') {
    const l = pool.filter((o) => !isOcg(o) && o.codes.some((c) => new RegExp(`-${prefs.lang}\\d`).test(c)));
    pool = l.length ? l : pool.filter((o) => !isOcg(o));
  }
  if (!pool.length) return null;
  const rar = (o) => rarityRank(o.rarity || (o.variants <= 1 && o.rarities.length === 1 ? o.rarities[0] : ''));
  if (prefs.mode === 'max') {
    const known = pool.filter((o) => rar(o) < 50);
    const p = known.length ? known : pool;
    return [...p].sort((a, b) => rar(b) - rar(a) || a.trend - b.trend)[0];
  }
  return [...pool].sort((a, b) => a.trend - b.trend)[0];
}

// One line per missing card for Cardmarket's wants list ("Add a decklist"):
//   "2x Ash Blossom & Joyous Spring"                  any version (cheapest)
//   "1x Dark Magician (V.2) (Legend of Blue Eyes ...)" exact version
export function wantsLines(rows) {
  return rows.filter((r) => r.missing > 0).map((r) => {
    const v = r.pick && r.exact ? /-V(\d+)-/.exec(r.pick.path || '') : null;
    const exp = r.pick && r.exact ? r.expName : '';
    return `${r.missing}x ${r.name}${v ? ` (V.${v[1]})` : ''}${exp ? ` (${exp})` : ''}`;
  }).join('\n');
}
