// Import screen: read a CSV from another app, match every row, show what will happen, then add the cards.
// A copy of all data is taken before (safestore.js), the import can be undone, and the same file is noticed.

import { $, esc, eur, toast } from './util.js';
import { syncBody } from './cardpage.js';
import { readImport, matchAll, summary, entriesFrom, fileId, MAX_COPIES } from './importer.js';
import { takeCopy } from './safestore.js';
import { LANGS } from './copy.js';

const DONE_KEY = 'cardscan-imports';   // [{id, t, n, format, name}] – files imported before
const loadDone = () => { try { return JSON.parse(localStorage.getItem(DONE_KEY) || '[]'); } catch { return []; } };
const SKIP_TEXT = { 'other game': 'other games', watchlist: 'watchlist entries', 'no copies': 'rows with quantity 0', empty: 'empty rows' };

let cur = null;   // {run, file, format, matches, sum}
let deps = null;  // {api, quickPrice, loadCollection, saveCollection, newId, onDone}

export function bindImport(d) {
  deps = d;
  $('imp-back').addEventListener('click', () => history.back());
  $('imp-file').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (file) await openImport(file);
  });
}

export function importOnBack() {
  if ($('import-page').hidden) return false;
  $('import-page').hidden = true;
  if (cur) cur.run = -1;
  cur = null;
  syncBody();
  return true;
}

const langName = (l) => (LANGS.find((x) => x[0] === l)?.[1] || l || '').replace(/ \(OCG\)$/, '');

async function openImport(file) {
  let text;
  try { text = await file.text(); } catch { toast('The file could not be read'); return; }
  let data;
  try { data = readImport(text); } catch { toast('No card list found in this file – it needs a header row with e.g. "Name" or "Card Number"'); return; }
  const page = $('import-page');
  page.hidden = false;
  syncBody();
  history.pushState({ sheet: 'import' }, '');
  page.scrollTop = 0;
  const run = Date.now();
  cur = { run, file: file.name, format: data.format, id: fileId(text), matches: null };
  $('imp-title').textContent = `${data.format} file`;
  const body = $('imp-body');
  body.innerHTML = `<p class="note">Finding ${data.items.length} rows in Curio's card list… <b id="imp-prog">0</b></p>`;
  const matches = await matchAll(data.items, deps.api, { onProgress: (i, n) => { const p = $('imp-prog'); if (p) p.textContent = `${i} / ${n}`; } });
  if (cur?.run !== run) return;
  // the price (and the version Curio itself can prove) – the same as for scanned cards
  let k = 0;
  for (const m of matches) {
    if (m.status !== 'ok') continue;
    const s = { name: m.name, vkey: m.vkey, vby: m.vby, code: m.code ? { code: m.code.code, base: m.code.base, language: m.code.language } : null, lang: m.lang };
    m.price = await deps.quickPrice(deps.api, s).catch(() => null);
    if (s.vkey !== m.vkey) { m.vkey = s.vkey; m.vby = s.vkey ? m.vby : null; }
    if (++k % 25 === 0) { const p = $('imp-prog'); if (p) p.textContent = `prices ${k}`; if (cur?.run !== run) return; }
  }
  if (cur?.run !== run) return;
  cur.matches = matches;
  cur.sum = summary(matches);
  render();
}

function render() {
  const { matches, sum } = cur;
  const owned = new Set(deps.loadCollection().map((e) => e.name));
  const already = matches.filter((m) => m.status === 'ok' && owned.has(m.name)).length;
  const before = loadDone().find((x) => x.id === cur.id);
  const skipped = Object.entries(sum.skipped).map(([k, n]) => `${n} ${SKIP_TEXT[k] || k}`).join(' · ');
  const n = Math.min(sum.copies, MAX_COPIES);
  const rows = matches.filter((m) => m.status === 'ok');
  $('imp-body').innerHTML = `
    <p class="small muted">${esc(cur.file)} · ${sum.rows} rows</p>
    ${before ? `<p class="note warn">⚠ You imported this file on ${esc(new Date(before.t).toLocaleDateString(document.documentElement.lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))} – importing it again adds the cards a second time.</p>` : ''}
    <div class="imp-tiles">
      <div><b>${sum.copies}</b><small>cards found</small></div>
      <div class="ok"><b>${sum.sure}</b><small>version sure</small></div>
      <div class="open"><b>${sum.open}</b><small>version open</small></div>
      <div class="${sum.missing.length ? 'bad' : ''}"><b>${sum.missing.length}</b><small>rows not found</small></div>
    </div>
    ${sum.open ? '<p class="small muted">Open versions come in without a version – Curio doesn\'t guess. Pick them later on the card page (Collection › filter "choose rarity").</p>' : ''}
    ${already ? `<p class="small muted">${already} of these cards are already in your collection – they are added as extra copies.</p>` : ''}
    ${skipped ? `<p class="small muted">Left out: ${esc(skipped)}</p>` : ''}
    ${sum.conflicts.length ? `<p class="small muted">${sum.conflicts.length} row${sum.conflicts.length === 1 ? '' : 's'}: name and set code don't belong together – taken by the name, version open (${esc(sum.conflicts.slice(0, 3).map((m) => `${m.item.name} / ${m.item.code}`).join(', '))}${sum.conflicts.length > 3 ? ' …' : ''})</p>` : ''}
    ${sum.tooMany ? `<p class="note warn">Only the first ${MAX_COPIES} cards are imported – more would not fit on this phone.</p>` : ''}
    ${sum.missing.length ? `<details class="fold"><summary>Not found (${sum.missing.length})</summary><ul class="rows compact">${sum.missing.slice(0, 100).map((m) => `<li><div class="row"><span class="what"><b>${esc(m.item.name || m.item.code || '?')}</b><small>line ${m.item.line}${m.item.code && m.item.name ? ` · ${esc(m.item.code)}` : ''}${m.item.set ? ` · ${esc(m.item.set)}` : ''}</small></span></div></li>`).join('')}</ul>
      <p class="small muted">Usually cards with a name Curio doesn't know (e.g. Japanese names) or sealed products. Add them by scanning.</p></details>` : ''}
    <div class="actions">
      <button type="button" class="btn primary" id="imp-go" ${n ? '' : 'disabled'}>Import ${n} card${n === 1 ? '' : 's'}</button>
      <button type="button" class="btn" id="imp-cancel">Cancel</button>
    </div>
    <p class="small muted">Before importing, Curio saves a copy of your current data – you can go back any time (More › Your data).</p>
    <h2>Preview</h2>
    <ul class="rows compact imp-list">${rows.slice(0, 60).map((m) => `<li><div class="row"><span class="what"><b>${esc(m.name)}</b>
      <small>${m.vkey ? '<span class="vs-tag ok">✓ version</span> ' : '<span class="vs-tag open">version open</span> '}${esc(m.price?.label || '')}${[m.item.cond, langName(m.lang), m.item.first === true ? '1st' : ''].filter(Boolean).length ? ` · ${esc([m.item.cond, langName(m.lang), m.item.first === true ? '1st' : ''].filter(Boolean).join(' · '))}` : ''}</small></span>
      <span class="eur">${m.item.qty > 1 ? `×${m.item.qty} ` : ''}${m.price?.lo != null ? eur(m.price.lo) : ''}</span></div></li>`).join('')}</ul>
    ${rows.length > 60 ? `<p class="small muted">… and ${rows.length - 60} more</p>` : ''}`;
  $('imp-cancel').addEventListener('click', () => history.back());
  $('imp-go').addEventListener('click', go);
}

async function go() {
  const fid = cur.id;
  const btn = $('imp-go');
  btn.disabled = true;
  btn.textContent = 'Saving a copy first…';
  const copy = await takeCopy('import');
  const list = deps.loadCollection();
  const added = entriesFrom(cur.matches, { source: cur.format === 'Spreadsheet' ? 'a spreadsheet' : cur.format, newId: deps.newId, price: (m) => m.price || null });
  const next = [...added, ...list];
  deps.saveCollection(next);
  // saveCollection swallows a full storage: check that the cards really arrived
  if (deps.loadCollection().length !== next.length) {
    deps.saveCollection(list);
    toast('Not enough space on this phone for that many cards – nothing was imported');
    btn.disabled = false; btn.textContent = 'Try again';
    return;
  }
  try { localStorage.setItem(DONE_KEY, JSON.stringify([{ id: cur.id, t: Date.now(), n: added.length, format: cur.format, name: cur.file }, ...loadDone()].slice(0, 20))); } catch { /* ignore */ }
  const ids = new Set(added.map((e) => e.id));
  const open = added.filter((e) => !e.vkey).length;
  history.back();
  deps.onDone();
  toast(`${added.length} card${added.length === 1 ? '' : 's'} imported${open ? ` · ${open} with the version still open` : ''}${copy ? '' : ' (no safety copy – storage full?)'}`, 8000, { label: 'Undo', run: () => {
    deps.saveCollection(deps.loadCollection().filter((e) => !ids.has(e.id)));
    try { localStorage.setItem(DONE_KEY, JSON.stringify(loadDone().filter((x) => x.id !== fid))); } catch { /* ignore */ }
    deps.onDone();
    toast('Import undone');
  } });
}
