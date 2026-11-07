// Backup and export. Everything the app keeps lives in localStorage on this phone only – a backup file
// protects it (new phone, cleared browser data). CSV for spreadsheets, and a sell list keyed by the
// Cardmarket product id (the format seller tools such as TCG PowerTools read).

export const BACKUP_APP = 'CardScan';
const SKIP = new Set(['cardscan-lang']); // settings of this phone, not your data

// ---------- backup ----------
export function makeBackup(storage = localStorage) {
  const data = {};
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith('cardscan-') && !SKIP.has(k)) data[k] = storage.getItem(k);
  }
  return { app: BACKUP_APP, v: 1, date: new Date().toISOString(), data };
}
export function readBackup(text) {
  const b = JSON.parse(text);
  if (!b || b.app !== BACKUP_APP || b.v !== 1 || typeof b.data !== 'object') throw new Error('Not a CardScan backup');
  for (const [k, v] of Object.entries(b.data)) if (!k.startsWith('cardscan-') || typeof v !== 'string') throw new Error('Not a CardScan backup');
  let cards = 0;
  try { cards = JSON.parse(b.data['cardscan-collection-v1'] || '[]').length; } catch { /* ignore */ }
  return { ...b, cards };
}
// Replaces this phone's data with the backup; returns what was there before (for undo).
export function restoreBackup(b, storage = localStorage) {
  const before = makeBackup(storage);
  for (const k of Object.keys(before.data)) storage.removeItem(k);
  for (const [k, v] of Object.entries(b.data)) storage.setItem(k, v);
  return before;
}

// ---------- CSV ----------
const cell = (v, sep) => {
  const s = v == null ? '' : String(v);
  return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const csv = (rows, sep = ',') => rows.map((r) => r.map((v) => cell(v, sep)).join(sep)).join('\r\n');

const COND = { MT: 'Mint', NM: 'Near Mint', EX: 'Excellent', GD: 'Good', LP: 'Light Played', PL: 'Played', PO: 'Poor' };
const LANG = { EN: 'English', DE: 'German', FR: 'French', IT: 'Italian', SP: 'Spanish', PT: 'Portuguese', JP: 'Japanese', KR: 'Korean', AE: 'English' };
const langOf = (e) => e.lang || e.language?.code || e.code?.language?.code || '';

// Readable list for Excel / Numbers (semicolon, as German Excel expects; BOM added when saving)
export function collectionCsv(list) {
  const head = ['Name', 'Set', 'Version', 'Set code', 'Language', 'Condition', '1st Edition', 'Price (EUR)', 'Cardmarket ID', 'Added'];
  const rows = list.map((e) => [
    e.name, e.price?.set || '', e.price?.exact ? (e.price.rarity || '') : 'not chosen', e.code?.code || '', LANG[langOf(e)] || langOf(e), COND[e.cond] || '',
    e.first === true ? 'yes' : e.first === false ? 'no' : '', e.price?.lo != null ? e.price.lo.toFixed(2).replace('.', ',') : '',
    e.vkey || '', e.added ? new Date(e.added).toISOString().slice(0, 10) : '',
  ]);
  return csv([head, ...rows], ';');
}

// Sell list: one row per product + language + condition + 1st, with count. Only cards with a known version
// (the Cardmarket product id). onlyDoubles: keep one of each product, list the rest.
export function sellCsv(list, { onlyDoubles = false } = {}) {
  const groups = new Map();
  const perProduct = {};
  let skipped = 0;
  for (const e of list) {
    if (!e.vkey) { skipped++; continue; }
    perProduct[e.vkey] = (perProduct[e.vkey] || 0) + 1;
    if (onlyDoubles && perProduct[e.vkey] === 1) continue;
    const lang = LANG[langOf(e)] || (/\(OCG\)/.test(e.price?.set || '') ? 'Japanese' : 'English'); // unknown: OCG sets are Japanese
    const cond = e.cond || 'NM';
    const first = e.first === true ? 'true' : 'false';
    const k = `${e.vkey}|${lang}|${cond}|${first}`;
    if (!groups.has(k)) groups.set(k, { e, lang, cond, first, n: 0 });
    groups.get(k).n++;
  }
  const head = ['cardmarketId', 'quantity', 'name', 'set', 'language', 'condition', 'firstEdition', 'trendPrice'];
  const rows = [...groups.values()].map(({ e, lang, cond, first, n }) => [e.vkey, n, e.name, e.price?.set || '', lang, cond, first, e.price?.lo != null ? e.price.lo.toFixed(2) : '']);
  return { text: csv([head, ...rows]), rows: rows.length, skipped };
}

// ---------- saving a file ----------
// Share sheet with the file where possible (phone: Drive, WhatsApp, Files…), else a download.
export async function saveFile(text, filename, type) {
  const blob = new Blob([type.includes('csv') ? '﻿' + text : text], { type });
  const file = new File([blob], filename, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return 'downloaded';
}
