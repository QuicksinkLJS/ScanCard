// Import a collection from another app: Dragon Shield, Collectr, TCGplayer, Curio's own CSV / sell list,
// or any spreadsheet with a header row. Columns are recognised by their names. Each row is matched to a
// card by its set code (best) or its name; the version is only taken over when the set code, set name or
// rarity make it unambiguous – otherwise it stays open (Curio never guesses, see sure.js).
// No browser APIs (tested in Node with a fake api).

import { parseManualCode, normName } from './parse.js';
import { versionOptions, rankOptions, rarityQuery } from './prices.js';
import { candidates, narrow, rarityInfo } from './sure.js';

export const MAX_COPIES = 5000;   // one import; localStorage would run full beyond that
const MAX_QTY = 99;               // copies from one row

// ---------- CSV ----------
// Handles a BOM, Excel's "sep=," first line, quotes, and , ; or tab as separator.
export function parseCsv(text) {
  let t = String(text || '').replace(/^﻿/, '');
  let sep = null;
  const m = /^"?sep=(.)"?\r?\n/i.exec(t);
  if (m) { sep = m[1]; t = t.slice(m[0].length); }
  if (!sep) {
    const first = t.split(/\r?\n/, 1)[0];
    const n = (c) => first.split(c).length - 1;
    sep = [',', ';', '\t'].sort((a, b) => n(b) - n(a))[0];
  }
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return { rows, sep };
}

// ---------- columns ----------
const key = (h) => String(h || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
// field -> header names (normalised) that mean it
const ALIASES = {
  name: ['cardname', 'name', 'productname', 'card', 'simplename', 'englishcardname', 'englishname', 'kartenname', 'karte', 'title'],
  number: ['cardnumber', 'number', 'collectornumber', 'printnumber', 'cardno', 'nummer', 'setnumber'],
  setCode: ['setcode', 'code', 'setid', 'cardcode', 'printcode'],
  set: ['setname', 'set', 'expansion', 'expansionname', 'edition', 'series'],
  rarity: ['rarity', 'version', 'seltenheit', 'rarityname'],
  printing: ['printing', 'variance', 'variant', 'finish', 'foil', 'firstedition', '1stedition', 'auflage'],
  qty: ['quantity', 'qty', 'count', 'amount', 'qtyowned', 'anzahl', 'menge', 'copies', 'owned'],
  cond: ['condition', 'cardcondition', 'zustand', 'cond'],
  lang: ['language', 'lang', 'sprache', 'languagecode'],
  paid: ['pricebought', 'averagecostpaid', 'purchaseprice', 'pricepaid', 'paid', 'cost', 'buyprice', 'costbasis', 'kaufpreis'],
  date: ['datebought', 'dateadded', 'added', 'date', 'purchasedate', 'datum'],
  folder: ['foldername', 'portfolioname', 'binder', 'bindername', 'collection', 'collectionname', 'listname', 'folder', 'portfolio', 'location'],
  grade: ['grade'],
  grader: ['gradingcompany', 'grader'],
  cmid: ['cardmarketid', 'cardmarketproductid', 'idproduct', 'cardmarket', 'cmid', 'mkmid'],
  category: ['category', 'game', 'productline'],
  watch: ['watchlist'],
};

// Which app made the file (for the preview line) and which column holds what.
export function detect(head) {
  const keys = head.map(key);
  const map = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) { const i = keys.indexOf(n); if (i >= 0 && !Object.values(map).includes(i)) { map[field] = i; break; } }
  }
  const has = (k) => keys.includes(k);
  const format = has('foldername') && has('tradequantity') ? 'Dragon Shield'
    : has('portfolioname') || (has('productname') && (has('averagecostpaid') || has('watchlist'))) ? 'Collectr'
      : has('simplename') || (has('productid') && has('sku')) ? 'TCGplayer'
        : has('cardmarketid') && (has('firstedition') || has('version') || has('1stedition')) ? 'Curio'
          : 'Spreadsheet';
  return { format, map, ok: map.name != null || map.number != null || map.setCode != null || map.cmid != null };
}

// ---------- values ----------
const CODE_RE = /\b([A-Z0-9]{2,5})-([A-Z]{0,2})(\d{3})\b/;
export function fullCode({ number = '', setCode = '' } = {}) {
  const n = String(number).trim().toUpperCase(), s = String(setCode).trim().toUpperCase();
  for (const x of [n, s]) { const m = CODE_RE.exec(x); if (m) return m[0]; }
  // Dragon Shield style: set code "LOB" + card number "EN001" (or "001")
  if (/^[A-Z0-9]{2,5}$/.test(s) && /[A-Z]/.test(s) && /^[A-Z]{0,2}\d{3}$/.test(n)) return `${s}-${n}`;
  return '';
}

const CONDS = {
  mint: 'MT', mt: 'MT', m: 'MT', gemmint: 'MT', nearmint: 'NM', nm: 'NM', nmm: 'NM', excellent: 'EX', ex: 'EX', good: 'GD', gd: 'GD',
  lightlyplayed: 'LP', lightplayed: 'LP', lp: 'LP', slightlyplayed: 'LP', sp: 'LP', moderatelyplayed: 'PL', mp: 'PL', played: 'PL', pl: 'PL',
  heavilyplayed: 'PL', hp: 'PL', damaged: 'PO', dmg: 'PO', poor: 'PO', po: 'PO',
};
// "Near Mint 1st Edition" (TCGplayer), "NearMint" (Dragon Shield), "NM" -> {cond, first}
export function normCond(s) {
  let t = String(s || '').toLowerCase();
  let first = null;
  if (/1st|first/.test(t)) first = true; else if (/unlimited/.test(t)) first = false;
  t = t.replace(/1st edition|first edition|unlimited|limited|foil|holofoil/g, '');
  return { cond: CONDS[key(t)] || null, first };
}
const LANGS = {
  en: 'EN', english: 'EN', eng: 'EN', englisch: 'EN', de: 'DE', german: 'DE', deutsch: 'DE', ger: 'DE', fr: 'FR', french: 'FR', francais: 'FR', franzosisch: 'FR',
  it: 'IT', italian: 'IT', italiano: 'IT', italienisch: 'IT', sp: 'SP', es: 'SP', spanish: 'SP', espanol: 'SP', spanisch: 'SP', pt: 'PT', portuguese: 'PT', portugues: 'PT',
  jp: 'JP', ja: 'JP', japanese: 'JP', japanisch: 'JP', jpn: 'JP', kr: 'KR', ko: 'KR', korean: 'KR', koreanisch: 'KR', kor: 'KR', ae: 'AE', asianenglish: 'AE',
  japaneseocg: 'JP', koreanocg: 'KR', asianenglishocg: 'AE',
};
export const normLang = (s) => LANGS[key(s)] || null;
export function normFirst(s) {
  const t = String(s || '').toLowerCase().trim();
  if (/1st|first|^yes$|^ja$|^true$|^1$/.test(t)) return true;
  if (/unlimited|^no$|^nein$|^false$|^0$/.test(t)) return false;
  return null;
}
const num = (s) => { const v = parseFloat(String(s || '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(v) ? v : null; };
export function normDate(s, now = Date.now()) {
  const t = String(s || '').trim();
  if (!t) return null;
  let d = null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) d = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  else if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/.exec(t))) d = Date.UTC(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(t))) d = Date.UTC(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[1] - 1, +m[2]);   // US
  else { const p = Date.parse(t); d = Number.isFinite(p) ? p : null; }
  return d != null && d > Date.UTC(1999, 0, 1) && d <= now + 86400000 ? d : null;
}

// One row -> what it says about the card. skip: reason the row is left out ('other game', 'watchlist', 'no copies').
export function rowToItem(cells, map, line = 0) {
  const get = (f) => (map[f] != null ? String(cells[map[f]] ?? '').trim() : '');
  const it = { line, name: get('name'), set: get('set'), rarity: get('rarity'), folder: get('folder') };
  it.code = fullCode({ number: get('number'), setCode: get('setCode') });
  // a "set" column that holds codes / editions, a "rarity" column that holds Curio's "not chosen"
  if (!it.code && CODE_RE.test(it.set.toUpperCase())) { it.code = CODE_RE.exec(it.set.toUpperCase())[0]; it.set = ''; }
  if (/^not chosen$|^rarity unknown$/i.test(it.rarity)) it.rarity = '';
  const qtyRaw = get('qty');
  const q = qtyRaw === '' ? 1 : Math.floor(num(qtyRaw) ?? 1);
  it.qty = Math.max(0, Math.min(MAX_QTY, q));
  const c = normCond(get('cond'));
  it.cond = c.cond;
  it.first = normFirst(get('printing')) ?? c.first;
  if (map.set != null && it.first == null && /^(1st edition|unlimited|limited)$/i.test(it.set)) { it.first = normFirst(it.set); it.set = ''; }
  it.lang = normLang(get('lang'));
  it.paid = num(get('paid'));
  if (it.paid != null && !(it.paid > 0)) it.paid = null;
  it.date = normDate(get('date'));
  it.grade = [get('grader'), get('grade')].filter(Boolean).join(' ');
  const cm = num(get('cmid'));
  it.cmid = cm && cm > 0 ? String(Math.round(cm)) : '';
  const cat = get('category').toLowerCase();
  if (cat && !/yu-?gi-?oh|ygo/.test(cat)) it.skip = 'other game';
  else if (/^(true|yes|1)$/i.test(get('watch'))) it.skip = 'watchlist';
  else if (!it.qty) it.skip = 'no copies';
  else if (!it.name && !it.code && !it.cmid) it.skip = 'empty';
  return it;
}

// Text of a file -> {format, items, columns}. Throws when there is no usable header.
export function readImport(text) {
  const { rows } = parseCsv(text);
  if (rows.length < 2) throw new Error('empty');
  // the header is the first row that names a card column (some exports start with a title line)
  let h = 0;
  while (h < Math.min(rows.length - 1, 5) && !detect(rows[h]).ok) h++;
  const d = detect(rows[h]);
  if (!d.ok) throw new Error('no header');
  const items = rows.slice(h + 1).map((r, i) => rowToItem(r, d.map, h + i + 2));
  return { format: d.format, items, columns: Object.keys(d.map) };
}

// ---------- matching ----------
// A rarity as the other app writes it ("QCSR", "Quarter Century Secret Rare", "Secret") -> the rarity name
// used by these versions, or ''.
function rarityAmong(r, opts) {
  if (!r) return '';
  const all = [...new Set(opts.flatMap((o) => [o.rarity, ...(o.rarities || [])]).filter(Boolean))];
  const low = r.toLowerCase().trim();
  const same = all.find((x) => x.toLowerCase() === low);
  if (same) return same;
  const test = rarityQuery(low);
  return test ? all.find((x) => test.test(x.toLowerCase())) || '' : '';
}

// One item -> {status: 'ok' | 'missing' | 'skip', name, code, lang, vkey, vby, by}
//   by: how the version was decided – 'id' (Cardmarket id), 'code', 'set', 'rarity', 'only' (printed once), '' (open)
export async function matchItem(it, api) {
  if (it.skip) return { item: it, status: 'skip' };
  let name = null, code = null;
  if (it.code) {
    code = parseManualCode(it.code);
    if (code) code = { ...code, base: `${code.prefix}-${code.num}` };
    if (code) { const hit = await api.lookup(code).catch(() => null); if (hit?.name) name = hit.name; }
  }
  let conflict = false;
  if (it.name && (!name || normName(name) !== normName(it.name))) {
    const info = await api.nameInfo(it.name).catch(() => null);
    // name and set code disagree (a typo in the other app's file): the name wins, the code is dropped
    if (info && name) { conflict = true; code = null; }
    if (info) name = info.name;
  }
  if (!name) return { item: it, status: 'missing' };
  const lang = it.lang || code?.language?.code || null;
  const ranked = rankOptions(versionOptions(await api.cardDetail(name).catch(() => [])), { code: code ? { code: code.code, base: code.base } : null, lang });
  let vkey = null, by = '';
  if (it.cmid && ranked.some((o) => o.key === it.cmid)) { vkey = it.cmid; by = 'id'; }
  if (!vkey && ranked.length) {
    const fromCode = candidates(ranked);
    let pool = fromCode;
    let proof = fromCode !== ranked ? 'code' : '';
    if (it.set) {
      const s = it.set.toLowerCase();
      const bySet = pool.filter((o) => o.set.toLowerCase() === s);
      const loose = bySet.length ? bySet : pool.filter((o) => o.set.toLowerCase().includes(s) || s.includes(o.set.toLowerCase()));
      if (loose.length) { pool = loose; proof = proof || 'set'; }
    }
    const rar = rarityAmong(it.rarity, pool);
    if (rar) {
      const n = narrow(pool, { rarity: rar });
      if (n.byRarity === 'exact') { pool = n.list.filter((o) => rarityInfo(o).exact); if (!proof) proof = 'rarity'; }
    }
    if (pool.length === 1 && (proof || ranked.length === 1)) { vkey = pool[0].key; by = proof || 'only'; }
  }
  return { item: it, status: 'ok', name, code, lang, vkey, vby: vkey ? 'import' : null, by, conflict };
}

export async function matchAll(items, api, { onProgress = () => {} } = {}) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    out.push(await matchItem(items[i], api));
    if (i % 20 === 19 || i === items.length - 1) onProgress(i + 1, items.length);
  }
  return out;
}

// What the preview shows: rows, copies, found / sure / open / not found / skipped.
export function summary(matches) {
  const ok = matches.filter((m) => m.status === 'ok');
  const copies = (l) => l.reduce((s, m) => s + m.item.qty, 0);
  const skipped = {};
  for (const m of matches) if (m.status === 'skip') skipped[m.item.skip] = (skipped[m.item.skip] || 0) + 1;
  return {
    rows: matches.length, found: ok.length, copies: copies(ok),
    sure: copies(ok.filter((m) => m.vkey)), open: copies(ok.filter((m) => !m.vkey)),
    missing: matches.filter((m) => m.status === 'missing'), skipped, conflicts: ok.filter((m) => m.conflict),
    tooMany: copies(ok) > MAX_COPIES,
  };
}

// Collection entries for the matched rows (one per copy). price: (match) -> the price object (quickPrice).
export function entriesFrom(matches, { source, now = Date.now(), newId, price = () => null }) {
  const out = [];
  for (const m of matches) {
    if (m.status !== 'ok') continue;
    const it = m.item;
    const p = price(m);
    for (let i = 0; i < it.qty && out.length < MAX_COPIES; i++) {
      const added = it.date || now;
      const from = [source, it.folder].filter(Boolean).join(' · ');
      const e = {
        id: newId(), name: m.name, vkey: m.vkey, vby: m.vby,
        code: m.code ? { code: m.code.code, base: m.code.base, lang: m.code.lang, language: m.code.language } : null,
        language: null, ocrText: null, pack: null, top: null, confident: true, thumb: null, sampleId: null,
        price: p, added, lang: m.lang || null, cond: it.cond || null, first: it.first ?? null, src: 'import',
        buy: p ? { lo: p.lo, hi: p.hi, date: now } : null,
        life: [{ t: added, k: 'add', how: 'import', from, ...(it.paid != null ? { paid: it.paid } : {}),
          ...(p?.lo != null ? { value: Math.round((p.hi != null ? (p.lo + p.hi) / 2 : p.lo) * 100) / 100 } : {}) }],
      };
      if (it.grade) e.life.push({ t: added, k: 'note', x: `Graded: ${it.grade}`.slice(0, 140) });
      out.push(e);
    }
  }
  return out;
}

// The same file imported twice: a fingerprint of its text.
export function fileId(text) {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${(h >>> 0).toString(16)}-${s.length}`;
}

export const sameName = (a, b) => normName(a) === normName(b);
