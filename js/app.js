// The boss: tabs, camera, and what happens when a button is pressed.

import { $, esc, eur, range, toast, loadImage, canvasBlob, blobToDataURL } from './util.js';
import { parseManualCode, valueTier } from './parse.js';
import { baseOf } from './codematch.js';
import { createApi } from './api.js';
import { createOcr } from './ocr.js';
import { createRecognizer } from './recognize.js';
import { createDetector } from './detect.js';
import { createCamera } from './camera.js';
import { createScanner } from './scan.js';
import { initCardPage, openCardPage, closeCardPage, syncBody, searchNames, quickPrice } from './cardpage.js';
import {
  loadCollection, saveCollection, newId, loadPack, savePack, putSample, updateSample, allSamples, countSamples,
} from './store.js';

const api = createApi();
initCardPage(api);

// ---------- status line on the scan screen ----------
function setStatus(text, isError = false, progress = null) {
  const el = $('status');
  if (!text) { el.hidden = true; return; }
  el.hidden = false;
  el.classList.toggle('error', isError);
  el.innerHTML = `${esc(text)}${progress != null ? `<div class="bar"><div style="width:${Math.round(progress * 100)}%"></div></div>` : ''}`;
}

// ---------- engines ----------
const recognizer = createRecognizer({ onStatus: (t, p) => setStatus(t, false, p) });
const detector = createDetector({ onStatus: (t) => setStatus(t) });
let ocrPromise = null;
function getOcr() {
  if (!ocrPromise) {
    if (!window.Tesseract) return Promise.reject(new Error('Text scanner not loaded'));
    ocrPromise = createOcr(window.Tesseract);
    ocrPromise.catch(() => { ocrPromise = null; });
  }
  return ocrPromise;
}

// ---------- pack mode ----------
let pack = loadPack();
function setPack(p) {
  pack = p;
  savePack(p);
  const chip = $('pack-chip');
  chip.textContent = !p ? 'Pack mode: off' : p.auto ? 'Pack mode: detect' : `Pack: ${p.prefix.startsWith('#') ? (p.name || '').slice(0, 22) : p.prefix}`;
  chip.classList.toggle('pack-on', !!p);
}
setPack(pack);

// ---------- scanning ----------
let mode = 'multi';
const scanner = createScanner({
  api, recognizer, detector, getOcr, setStatus,
  getPack: () => pack,
  setPack,
  onOpen: (c) => openCardPage(c, scanHooks),
  onAddAll: async (list) => {
    for (const c of list) await addScanned(c, false);
    scanner.renderList();
    toast(`${list.length} card${list.length > 1 ? 's' : ''} added to your collection`);
  },
});

const camera = createCamera({
  root: $('cam'), video: $('cam-video'), frame: $('cam-frame'), hint: $('cam-hint'),
  onPhoto: (img) => scanner.scanPhoto(img, 'multi'),
  onCard: (card) => scanner.scanCard(card),
  onError: () => setStatus('The camera could not be opened. Allow camera access, or use "Choose photo".', true),
});

function warmUp() {
  recognizer.ready().catch(() => {});
  if (mode === 'multi') detector.ready().catch(() => {});
}

$('scan').addEventListener('click', () => { warmUp(); camera.open(mode); });
$('cam-shot').addEventListener('click', () => camera.capture());
$('cam-cancel').addEventListener('click', () => camera.close());
$('gallery').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  warmUp();
  const img = await loadImage(file);
  scanner.scanPhoto(img, mode);
});
$('scan-again').addEventListener('click', () => { scanner.clear(); warmUp(); camera.open(mode); });
document.querySelectorAll('.modes [data-mode]').forEach((b) => b.addEventListener('click', () => {
  mode = b.dataset.mode;
  document.querySelectorAll('.modes [data-mode]').forEach((x) => {
    x.classList.toggle('on', x === b);
    x.setAttribute('aria-checked', String(x === b));
  });
  $('scan-hint').textContent = mode === 'multi'
    ? 'Put 2–9 cards on a table, side by side, and take one photo. Works with any language.'
    : 'Hold one card inside the frame. Works with any language.';
}));

// ---------- collection ----------
function entryFromSubject(s, extra = {}) {
  return {
    id: s.collId || newId(),
    name: s.name, vkey: s.vkey || null,
    code: s.code ? { code: s.code.code, base: s.code.base, lang: s.code.lang, language: s.code.language } : null,
    language: s.language || null, ocrText: s.ocrText ?? null,
    pack: s.pack || null, top: s.top || null, confident: s.confident ?? true,
    thumb: s.thumb || null, sampleId: s.sampleId || null,
    price: s.price || null, added: Date.now(), ...extra,
  };
}

function upsertEntry(entry) {
  const list = loadCollection();
  const i = list.findIndex((e) => e.id === entry.id);
  if (i >= 0) list[i] = { ...list[i], ...entry, added: list[i].added };
  else list.unshift(entry);
  saveCollection(list);
}

// Training example: the cut-out card and the final answer. Saving again replaces it (last choice counts).
async function saveSample(s) {
  if (!s.sampleId) return;
  const final = { name: s.name, version: s.vkey || null, code: s.code?.code || null };
  if (s.canvas) {
    const blob = await canvasBlob(s.canvas);
    await putSample({
      id: s.sampleId, image: blob, time: Date.now(), final,
      predicted: { name: s.top?.[0]?.name, score: s.top?.[0]?.score, top: (s.top || []).slice(0, 3) },
      corrected: !!s.corrected,
    });
  } else {
    await updateSample(s.sampleId, { final, corrected: !!s.corrected });
  }
}

async function addScanned(c, notify = true) {
  c.price = await quickPrice(api, c);
  c.collId = c.collId || newId();
  upsertEntry(entryFromSubject(c, { id: c.collId }));
  c.added = true;
  await saveSample(c);
  if (notify) toast('Added to your collection');
}

const scanHooks = {
  addLabel: (s) => (s.added ? 'Saved ✓ – save again' : 'Add to collection'),
  onAdd: async (s) => { await addScanned(s); scanner.renderList(); },
  removeLabel: 'Not a card – remove from this scan',
  onRemove: (s) => scanner.remove(s),
  onChange: async (s) => {
    await scanner.refresh(s);
    if (s.added) { upsertEntry(entryFromSubject(s, { id: s.collId })); saveSample(s); }
  },
};

const collHooks = {
  onChange: async (s) => {
    s.price = await quickPrice(api, s);
    upsertEntry(entryFromSubject(s, { id: s.collId }));
    saveSample(s);
    renderCollection();
  },
  onRemove: (s) => {
    saveCollection(loadCollection().filter((e) => e.id !== s.collId));
    renderCollection();
    toast('Removed');
  },
};

const plainHooks = {
  addLabel: (s) => (s.collId ? 'Added ✓' : 'Add to collection'),
  onAdd: async (s) => {
    if (s.collId) return;
    s.price = await quickPrice(api, s);
    s.collId = newId();
    upsertEntry(entryFromSubject(s, { id: s.collId }));
    toast('Added to your collection');
  },
};

function renderCollection() {
  const list = loadCollection();
  $('coll-empty').hidden = list.length > 0;
  $('coll-list').innerHTML = list.map((e) => `
    <li><button type="button" data-id="${esc(e.id)}">
      ${e.thumb ? `<img class="thumb" src="${e.thumb}" alt="">` : `<span class="dot ${valueTier(e.price?.hi)}"></span>`}
      <span class="what"><b>${esc(e.name)}</b><small>${esc(e.price?.label || '')}</small></span>
      <span class="eur">${range(e.price?.lo, e.price?.hi)}</span>
    </button></li>`).join('');
  $('coll-list').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const e = loadCollection().find((x) => x.id === b.dataset.id);
    if (!e) return;
    openCardPage({ ...e, collId: e.id }, collHooks);
  }));
  const lo = list.reduce((s, e) => s + (e.price?.lo || 0), 0);
  const hi = list.reduce((s, e) => s + (e.price?.hi || 0), 0);
  const open = list.filter((e) => e.price && !e.price.exact).length;
  $('coll-total').textContent = range(lo, hi);
  $('coll-sub').textContent = list.length
    ? `${list.length} card${list.length > 1 ? 's' : ''}${open ? ` · ${open} without exact version (shown as a range)` : ''}`
    : '';
}

// Refresh the stored prices with today's data once per app start.
let refreshed = false;
async function refreshCollectionPrices() {
  if (refreshed) return;
  refreshed = true;
  const list = loadCollection();
  let changed = false;
  for (const e of list) {
    const p = await quickPrice(api, e).catch(() => null);
    if (p && (p.lo !== e.price?.lo || p.hi !== e.price?.hi || p.label !== e.price?.label)) { e.price = p; changed = true; }
  }
  if (changed) { saveCollection(list); renderCollection(); }
}

// ---------- market ----------
let marketKind = 'short', marketDir = 'up';
async function renderMarket() {
  const ul = $('market-list');
  let m;
  try { m = await api.movers(); } catch { ul.innerHTML = '<li><div class="row muted small">Market data not available.</div></li>'; return; }
  const day = m.date ? new Date(m.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  $('market-note').textContent = marketKind === 'short'
    ? `Yesterday's average sale against the last 7 days. Fast, but one odd sale can show up here. Prices of ${day}, cards from €2.`
    : `Cardmarket trend against the 30-day average – the steadier movers. Prices of ${day}, cards from €2.`;
  const rows = m[marketKind][marketDir];
  const now = marketKind === 'short' ? 'avg1' : 'trend';
  ul.innerHTML = rows.map((r, i) => `
    <li><button type="button" data-i="${i}">
      <span class="what"><b>${esc(r.name)}</b><small>${esc(r.set)}${r.year ? ` (${r.year})` : ''}</small></span>
      <span class="eur">${eur(r[now])}<small class="${r.change >= 0 ? 'up' : 'down'}">${r.change >= 0 ? '+' : ''}${r.change.toFixed(0)} %</small></span>
    </button></li>`).join('');
  ul.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const r = rows[Number(b.dataset.i)];
    openCardPage({ name: r.name, vkey: String(r.id) }, plainHooks);
  }));
}
document.querySelectorAll('#view-market [data-kind]').forEach((b) => b.addEventListener('click', () => {
  marketKind = b.dataset.kind;
  document.querySelectorAll('#view-market [data-kind]').forEach((x) => x.classList.toggle('on', x === b));
  renderMarket();
}));
document.querySelectorAll('#view-market [data-dir]').forEach((b) => b.addEventListener('click', () => {
  marketDir = b.dataset.dir;
  document.querySelectorAll('#view-market [data-dir]').forEach((x) => x.classList.toggle('on', x === b));
  renderMarket();
}));

// ---------- more ----------
const nameInput = $('name-search');
nameInput.addEventListener('input', () => searchNames(nameInput.value, $('name-results'), (name) => {
  nameInput.value = '';
  openCardPage({ name }, plainHooks);
}, 10));

$('manual').addEventListener('submit', async (e) => {
  e.preventDefault();
  const parsed = parseManualCode($('manual-code').value);
  if (!parsed) { toast("That doesn't look like a set code. Example: LOB-EN001"); return; }
  const hit = await api.lookup(parsed).catch(() => null);
  if (!hit) { toast(`No card found for ${parsed.code}.`); return; }
  openCardPage({
    name: hit.name,
    code: { code: parsed.code, base: baseOf(parsed.code), lang: parsed.lang, language: parsed.language, read: parsed.code, distance: 0 },
    language: parsed.language,
  }, plainHooks);
});

$('export').addEventListener('click', async () => {
  const samples = await allSamples();
  if (!samples.length) { toast('No training examples yet. Add scanned cards to your collection first.'); return; }
  toast(`Preparing ${samples.length} examples…`);
  const out = [];
  for (const s of samples) out.push({ ...s, image: s.image ? await blobToDataURL(s.image) : null });
  const blob = new Blob([JSON.stringify({ app: 'cardscan', version: 1, exported: new Date().toISOString(), samples: out })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cardscan-training-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
});

$('clear-coll').addEventListener('click', () => {
  if (!loadCollection().length) return;
  if (!window.confirm('Remove all cards from your collection? Training examples stay.')) return;
  saveCollection([]);
  renderCollection();
});

async function renderMore() {
  const n = await countSamples();
  $('export').textContent = `Export training data (${n})`;
  try {
    const ix = await api.index();
    const d = ix.prices ? new Date(ix.prices).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '?';
    $('data-info').textContent = `Prices of ${d} · ${ix.sets.length} set codes · ${loadCollection().length} cards in your collection`;
  } catch { $('data-info').textContent = 'Price data not available.'; }
}

// ---------- pack picker ----------
let allSets = null;
async function renderPackList() {
  if (!allSets) allSets = await api.sets().catch(() => []);
  const q = $('pack-search').value.trim().toLowerCase();
  const rows = allSets.filter((s) => !q || s.name.toLowerCase().includes(q) || s.prefix.toLowerCase().startsWith(q)).slice(0, 40);
  $('pack-list').innerHTML = rows.map((s, i) => `
    <li><button type="button" data-i="${i}"><span class="what"><b>${esc(s.name)}</b><small>${esc(s.prefix.startsWith('#') ? 'Cardmarket' : s.prefix)}${s.date ? ` · ${esc(s.date.slice(0, 7))}` : ''} · ${s.count} cards</small></span>
    ${pack?.prefix === s.prefix && pack?.name === s.name ? '<span class="eur">✓</span>' : ''}</button></li>`).join('');
  $('pack-list').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const s = rows[Number(b.dataset.i)];
    setPack({ prefix: s.prefix, name: s.name, year: s.year });
    toast(`Pack mode: ${s.name}`);
    history.back();
  }));
}
$('pack-chip').addEventListener('click', () => {
  $('pack-page').hidden = false;
  syncBody();
  history.pushState({ sheet: 'pack' }, '');
  $('pack-search').value = '';
  renderPackList();
});
$('pack-search').addEventListener('input', renderPackList);
$('pack-back').addEventListener('click', () => history.back());
$('pack-auto').addEventListener('click', () => { setPack({ auto: true }); toast('The set is taken from the first cards you scan'); history.back(); });
$('pack-off').addEventListener('click', () => { setPack(null); history.back(); });

// Android back button / browser back closes the open sheet.
window.addEventListener('popstate', () => {
  if (!$('card-page').hidden) closeCardPage();
  else if (!$('pack-page').hidden) { $('pack-page').hidden = true; syncBody(); }
});

// ---------- tabs ----------
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${name}`; });
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
  window.scrollTo(0, 0);
  if (name === 'collection') { renderCollection(); refreshCollectionPrices(); }
  if (name === 'market') renderMarket();
  if (name === 'more') renderMore();
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

// Start loading the recogniser in the background so the first scan is quick.
setTimeout(() => recognizer.ready().then(() => {
  if (/first time|Starting/.test($('status').textContent)) setStatus('');
  detector.ready().then(() => setStatus('')).catch(() => setStatus(''));
}).catch(() => {}), 500);

// for tests
window.cardscan = { scanner, api, setPack, showView };
