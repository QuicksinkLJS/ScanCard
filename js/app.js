// The boss: tabs, camera, and what happens when a button is pressed.

import { startI18n, lang, setLang } from './i18n.js';
import { $, esc, eur, range, toast, countTo, loadImage, canvasBlob, blobToDataURL, thumbOf } from './util.js';
import { parseManualCode, valueTier } from './parse.js';
import { baseOf } from './codematch.js';
import { createApi } from './api.js';
import { createOcr } from './ocr.js';
import { createRecognizer } from './recognize.js';
import { loadLearned, learned, learn } from './learn.js';
import { createDetector } from './detect.js';
import { createCamera } from './camera.js';
import { createScanner } from './scan.js';
import { initCardPage, openCardPage, closeCardPage, syncBody, searchNames, quickPrice } from './cardpage.js';
import { portfolio, changeOf, mid, pctText } from './depot.js';
import { versionImage, rarityRank } from './prices.js';
import { createMasters } from './masters.js';
import { createDecks } from './decks.js';
import { openHolo, closeHolo, holoKind, holoCardHTML } from './holo.js';
import { fanHTML } from './fan.js';
import { valueSeries } from './depot.js';
import { loadWatch, loadWish, removeWatch, belowTarget } from './lists.js';
import {
  loadCollection, saveCollection, newId, loadPack, savePack, putSample, updateSample, allSamples, countSamples,
} from './store.js';

startI18n();
{
  const segs = document.querySelectorAll('#bigmoment-seg [data-v]');
  const paint = () => { const on = localStorage.getItem('cardscan-bigmoment') !== 'off'; segs.forEach((b) => b.classList.toggle('on', (b.dataset.v === 'on') === on)); };
  segs.forEach((b) => b.addEventListener('click', () => { try { localStorage.setItem('cardscan-bigmoment', b.dataset.v); } catch { /* ignore */ } paint(); }));
  try { paint(); } catch { /* ignore */ }
}
document.querySelectorAll('#lang-seg [data-lang]').forEach((b) => {
  b.classList.toggle('on', b.dataset.lang === lang);
  b.addEventListener('click', () => { if (b.dataset.lang !== lang) setLang(b.dataset.lang); });
});

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
loadLearned();
const recognizer = createRecognizer({ onStatus: (t, p) => setStatus(t, false, p), learned });
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
  onCorrect: (c) => scanHooks.onChange(c),
  onAddAll: async (list) => {
    for (const c of list) await addScanned(c, false);
    scanner.renderList();
    toast(`${list.length} card${list.length > 1 ? 's' : ''} added to your collection`, 5000, undoAdd(list.map((c) => c.collId), list));
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
    thumb: (s.canvas ? thumbOf(s.canvas, 180, 0.8) : s.thumb) || null, sampleId: s.sampleId || null,
    price: s.price || null, added: Date.now(), ...extra,
  };
}

// The price when a card is added is kept as "buy" (for "since added ±%"). A corrected name or version
// starts over, since the old price belonged to another card.
function upsertEntry(entry) {
  const list = loadCollection();
  const i = list.findIndex((e) => e.id === entry.id);
  const snap = entry.price ? { lo: entry.price.lo, hi: entry.price.hi, date: Date.now() } : null;
  if (i >= 0) {
    const old = list[i];
    const same = old.name === entry.name && (old.vkey || null) === (entry.vkey || null);
    list[i] = { ...old, ...entry, added: old.added, buy: same && old.buy ? old.buy : snap };
  } else list.unshift({ ...entry, buy: snap });
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

function undoAdd(ids, subjects = []) {
  return { label: 'Undo', run: () => {
    saveCollection(loadCollection().filter((e) => !ids.includes(e.id)));
    for (const x of subjects) { x.added = false; x.collId = null; }
    scanner.renderList();
    renderCollection();
    toast('Undone');
  } };
}

async function addScanned(c, notify = true) {
  c.price = await quickPrice(api, c);
  c.collId = c.collId || newId();
  upsertEntry(entryFromSubject(c, { id: c.collId }));
  c.added = true;
  await saveSample(c);
  if (notify) toast('Added to your collection', 5000, undoAdd([c.collId], [c]));
}

const scanHooks = {
  own: true,
  addLabel: (s) => (s.added ? 'Saved ✓ – save again' : 'Add to collection'),
  onAdd: async (s) => { await addScanned(s); scanner.renderList(); },
  removeLabel: 'Not a card – remove from this scan',
  onRemove: (s) => scanner.remove(s),
  onChange: async (s) => {
    if (s.corrected && s.emb) learn(s.sampleId, s.name, s.emb);
    await scanner.refresh(s);
    if (s.added) { upsertEntry(entryFromSubject(s, { id: s.collId })); saveSample(s); }
  },
};

const collHooks = {
  own: true,
  onChange: async (s) => {
    s.price = await quickPrice(api, s);
    upsertEntry(entryFromSubject(s, { id: s.collId }));
    saveSample(s);
    renderCollection();
  },
  onRemove: (s) => {
    const list = loadCollection();
    const i = list.findIndex((e) => e.id === s.collId);
    const gone = list[i];
    saveCollection(list.filter((e) => e.id !== s.collId));
    renderCollection();
    toast('Removed', 5000, gone ? { label: 'Undo', run: () => {
      const l = loadCollection(); l.splice(i, 0, gone); saveCollection(l); renderCollection(); toast('Undone');
    } } : null);
  },
};

const plainHooks = {
  addLabel: (s) => (s.collId ? 'Added ✓' : 'Add to collection'),
  onAdd: async (s) => {
    if (s.collId) return;
    s.price = await quickPrice(api, s);
    s.collId = newId();
    upsertEntry(entryFromSubject(s, { id: s.collId }));
    toast('Added to your collection', 5000, undoAdd([s.collId], [s]));
  },
};

let collSort = 'value';
let collRarity = '';
// Rarity badge of a collection card: colour by kind, short name; no exact version yet -> "choose rarity".
const RCLASS = { rainbow: 'r-rainbow', starlight: 'r-rainbow', qcsr: 'r-rainbow', prismatic: 'r-rainbow', collector: 'r-rainbow', secret: 'r-secret', ghost: 'r-secret', ultra: 'r-ultra', relief: 'r-ultra', super: 'r-super', rare: 'r-rare', common: 'r-common', plain: 'r-common' };
function shortRarity(r) {
  return ({ 'quarter century secret rare': 'QCSR', 'prismatic secret rare': 'PSR', "collector's rare": 'CR', 'starlight rare': 'Starlight', 'ultimate rare': 'Ultimate', 'ghost rare': 'Ghost', 'platinum secret rare': 'PlSR' })[r.toLowerCase()]
    || (r.length > 14 ? r.replace(/ Rare$/, '') : r);
}
function rarityOf(e) {
  if (!e.price) return null;
  if (!e.price.exact || !e.price.rarity) return { key: '~open', cls: 'r-open', label: 'choose rarity' };
  return { key: e.price.rarity, cls: RCLASS[holoKind(e.price.rarity)] || 'r-common', label: shortRarity(e.price.rarity) };
}
// Official picture: of your version, or of the likeliest version while it is open; your own photo only if there is none.
// (Your photo stays stored – for learning and for comparing on the card page.)
const pictureOf = (e, size = 'preview') => {
  const img = (e.price?.exact && e.price?.image) || e.price?.guess || e.price?.image;
  return (img ? versionImage({ image: img }, size) : '') || e.thumb || '';
};
const holoKindOf = (e) => (e.price?.exact && e.price?.rarity ? holoKind(e.price.rarity) : 'plain');
function renderCollection() {
  const list = loadCollection();
  const pf = portfolio(list);
  $('coll-empty').hidden = list.length > 0;
  const chg = (p) => (p == null || Math.abs(p) < 0.05 ? '' : `<small class="${p >= 0 ? 'up' : 'down'}">${pctText(p)}</small>`);
  // rarity filter chips (with counts)
  const rcount = new Map();
  for (const e of list) { const r = rarityOf(e); if (r) { const x = rcount.get(r.key) || { ...r, n: 0 }; x.n++; rcount.set(r.key, x); } }
  if (collRarity && !rcount.has(collRarity)) collRarity = '';
  const rlist = [...rcount.values()].sort((a, b) => (a.key === '~open') - (b.key === '~open') || rarityRank(a.key) - rarityRank(b.key));
  $('coll-rchips').hidden = rlist.length < 2;
  $('coll-rchips').innerHTML = `<button type="button" class="chip ${!collRarity ? 'on' : ''}" data-rar="">All ${list.length}</button>`
    + rlist.map((r) => `<button type="button" class="chip rchip ${r.cls} ${collRarity === r.key ? 'on' : ''}" data-rar="${esc(r.key)}"><i></i>${esc(r.label)} ${r.n}</button>`).join('');
  $('coll-rchips').querySelectorAll('[data-rar]').forEach((b) => b.addEventListener('click', () => { collRarity = b.dataset.rar; renderCollection(); }));
  const shown = collRarity ? list.filter((e) => rarityOf(e)?.key === collRarity) : list;
  const sorted = collSort === 'value' ? [...shown].sort((a, b) => (mid(b.price) ?? -1) - (mid(a.price) ?? -1)) : shown;
  $('coll-list').innerHTML = sorted.map((e) => {
    const r = rarityOf(e);
    return `
    <li><button type="button" data-id="${esc(e.id)}">
      ${pictureOf(e) ? `<span class="tframe ${r?.cls || ''}"><img class="thumb" src="${esc(pictureOf(e))}" alt=""></span>` : `<span class="dot ${valueTier(e.price?.hi)}"></span>`}
      <span class="what"><b>${esc(e.name)}</b><small>${r ? `<span class="rbadge ${r.cls}">${esc(r.label)}</span> ` : ''}${esc(e.price?.label || '')}</small></span>
      <span class="eur">${range(e.price?.lo, e.price?.hi)}${chg(changeOf(e))}</span>
    </button></li>`;
  }).join('');
  $('coll-list').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => openEntry(b.dataset.id)));
  const open = list.filter((e) => e.price && !e.price.exact).length;
  countTo($('coll-total'), pf.lo, pf.hi);
  $('coll-change').innerHTML = pf.pct != null && list.length && Math.abs(pf.change) < 0.005 ? '<span class="muted">Unchanged since added</span>'
    : pf.pct != null && list.length
    ? `<span class="${pf.change >= 0 ? 'up' : 'down'}">${pctText(pf.pct)} (${pf.change >= 0 ? '+' : '−'}${eur(Math.abs(pf.change)).slice(0)})</span> since added`
    : '';
  $('coll-sub').textContent = list.length
    ? `${list.length} card${list.length > 1 ? 's' : ''}${open ? ` · ${open} without exact version (shown as a range)` : ''}`
    : '';
  // Showcase: the most valuable cards with a known version, big, to swipe through
  const show = [...list].filter((e) => e.price?.exact && e.price?.image).sort((a, b) => (b.price.lo ?? 0) - (a.price.lo ?? 0)).slice(0, 20);
  $('showcase').hidden = !show.length;
  $('showcase').onclick = () => openHolo(show.map((e) => ({ name: e.name, rarity: e.price.rarity, image: e.price.image, price: e.price.lo })));
  renderValueChart(list);
  // Opening: the most valuable cards as a fanned hand (replayed only when they change)
  const fanCards = pf.top.filter((e) => pictureOf(e, 'show'));
  const fanKey = fanCards.map((e) => `${e.id}:${pictureOf(e, 'show')}:${holoKindOf(e)}`).join('|');
  const fanEl = $('coll-fan');
  if (fanEl._key !== fanKey) {
    fanEl._key = fanKey;
    fanEl.innerHTML = fanCards.length >= 2 ? fanHTML(fanCards.map((e) => ({ src: pictureOf(e, 'show'), kind: holoKindOf(e), name: e.name }))) : '';
    fanEl.querySelectorAll('.fan-card').forEach((b) => b.addEventListener('click', () => openHolo(
      fanCards.map((e) => ({ name: e.name, rarity: e.price?.exact ? e.price.rarity : '', src: pictureOf(e, 'show'), kind: holoKindOf(e), price: e.price?.lo })), Number(b.dataset.i))));
  }
  // Top 5
  $('coll-top-wrap').hidden = pf.top.length < 2;
  $('coll-top').innerHTML = pf.top.map((e, i) => `
    <button type="button" class="topcard" data-id="${esc(e.id)}">
      <span class="rank">${i + 1}</span>
      ${pictureOf(e, 'show') ? `<span class="topholo">${holoCardHTML({ src: pictureOf(e, 'show'), kind: holoKindOf(e), alt: e.name, shine: false })}</span>` : '<span class="noimg"></span>'}
      <b>${esc(e.name)}</b><span class="eur">${range(e.price?.lo, e.price?.hi)}</span>${chg(changeOf(e))}
    </button>`).join('');
  $('coll-top').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => openEntry(b.dataset.id)));
  // Value per set
  $('coll-sets-wrap').hidden = pf.bySet.length < 2;
  $('coll-sets').innerHTML = pf.bySet.map((s) => `
    <li><div class="row"><span class="what"><b>${esc(s.set)}</b><small>${s.count} card${s.count > 1 ? 's' : ''}</small></span>
    <span class="eur">${eur(s.value)}</span></div></li>`).join('');
}
// Value chart like a stock app: ≈30 days from the price averages of each card (real daily history comes later).
function renderValueChart(list) {
  const el = $('coll-chart');
  const vals = valueSeries(list);
  if (!vals || vals.every((v) => !v)) { el.innerHTML = ''; el._key = ''; return; }
  const key = vals.join('|');
  if (el._key === key) return;
  el._key = key;
  const W = 320, H = 96, pad = 6;
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || hi * 0.1 || 1;
  const xs = vals.map((_, i) => pad + i * (W - 2 * pad) / (vals.length - 1));
  const ys = vals.map((v) => pad + (H - 2 * pad) * (1 - (v - lo + span * 0.15) / (span * 1.3)));
  // smooth line through the points (Catmull-Rom as Bézier)
  let d = `M${xs[0]},${ys[0].toFixed(1)}`;
  for (let i = 0; i < xs.length - 1; i++) {
    const p0 = [xs[Math.max(0, i - 1)], ys[Math.max(0, i - 1)]], p1 = [xs[i], ys[i]], p2 = [xs[i + 1], ys[i + 1]], p3 = [xs[Math.min(xs.length - 1, i + 2)], ys[Math.min(xs.length - 1, i + 2)]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1].toFixed(1)}`;
  }
  const first = vals[0], last = vals[vals.length - 1];
  const up = last >= first;
  const pct = first ? (last - first) / first * 100 : null;
  el.innerHTML = `
    <div class="vchart ${up ? 'up' : 'down'}">
      <div class="vc-head"><span class="small muted">Value · approx. last 30 days</span>
        <span class="vc-chg">${pct == null ? '' : `${pctText(pct)} (${up ? '+' : '−'}${eur(Math.abs(last - first))})`}</span></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="vc-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
        <path class="vc-area" d="${d} L${xs[xs.length - 1]},${H} L${xs[0]},${H} Z" fill="url(#vc-fill)"/>
        <path class="vc-line" d="${d}" pathLength="1"/>
        <circle class="vc-dot" cx="${xs[xs.length - 1]}" cy="${ys[ys.length - 1].toFixed(1)}" r="3.5"/>
      </svg>
      <div class="vc-x small muted"><span>30-day avg.</span><span>7-day avg.</span><span>yesterday</span><span>today</span></div>
      <div class="vc-v small">${vals.map((v) => `<span>${eur(v)}</span>`).join('')}</div>
    </div>`;
}

function openEntry(id) {
  const e = loadCollection().find((x) => x.id === id);
  if (e) openCardPage({ ...e, collId: e.id }, collHooks);
}
document.querySelectorAll('#view-collection [data-sort]').forEach((b) => b.addEventListener('click', () => {
  collSort = b.dataset.sort;
  document.querySelectorAll('#view-collection [data-sort]').forEach((x) => x.classList.toggle('on', x === b));
  renderCollection();
}));

// Refresh the stored prices with today's data once per app start.
let refreshed = false;
async function refreshCollectionPrices() {
  if (refreshed) return;
  refreshed = true;
  const list = loadCollection();
  let changed = false;
  for (const e of list) {
    const p = await quickPrice(api, e).catch(() => null);
    if (p && (p.lo !== e.price?.lo || p.hi !== e.price?.hi || p.label !== e.price?.label || p.set !== e.price?.set || p.guess !== e.price?.guess || JSON.stringify(p.hist) !== JSON.stringify(e.price?.hist))) { e.price = p; changed = true; }
    if (!e.buy && (e.price || p)) { const q = e.price || p; e.buy = { lo: q.lo, hi: q.hi, date: e.added || Date.now() }; changed = true; }
  }
  if (changed) { saveCollection(list); renderCollection(); }
}

// ---------- mastersets ----------
const masters = createMasters({ api, openCard: (s) => openCardPage(s, plainHooks), onCollectionChange: () => renderCollection() });
const decks = createDecks({ api, openCard: (s) => openCardPage(s, plainHooks) });
let collTab = 'cards';
document.querySelectorAll('#coll-tabs [data-ctab]').forEach((b) => b.addEventListener('click', () => {
  collTab = b.dataset.ctab;
  document.querySelectorAll('#coll-tabs [data-ctab]').forEach((x) => x.classList.toggle('on', x === b));
  $('masters').hidden = collTab !== 'masters';
  $('decks').hidden = collTab !== 'decks';
  $('wish').hidden = collTab !== 'wish';
  if (collTab === 'wish') renderWish();
  $('coll-cards').hidden = collTab !== 'cards';
  if (collTab === 'masters') masters.renderList();
  if (collTab === 'decks') decks.renderList();
}));

// ---------- wishlist and watchlist ----------
async function renderWish() {
  const list = loadWish();
  $('wish-empty').hidden = list.length > 0;
  const rows = await Promise.all(list.map(async (w) => ({ w, p: await quickPrice(api, { name: w.name, vkey: w.vkey }).catch(() => null) })));
  rows.sort((a, b) => belowTarget(b.w, b.p) - belowTarget(a.w, a.p));
  $('wish-list').innerHTML = rows.map(({ w, p }) => {
    const hit = belowTarget(w, p);
    return `<li class="${hit ? 'deal' : ''}"><button type="button" data-name="${esc(w.name)}" data-vkey="${esc(w.vkey || '')}">
      <span class="what"><b>${esc(w.name)}</b><small>${hit ? '<span class="dealtag">At your price!</span> ' : ''}${esc(w.label || '')} · target ${eur(w.target)}</small></span>
      <span class="eur">${range(p?.lo, p?.hi)}</span></button></li>`;
  }).join('');
  $('wish-list').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => openCardPage({ name: b.dataset.name, vkey: b.dataset.vkey || null }, plainHooks)));
  return rows.filter((r) => belowTarget(r.w, r.p)).length;
}

async function renderWatch() {
  const list = loadWatch();
  $('watch-empty').hidden = list.length > 0;
  const rows = await Promise.all(list.map(async (w) => ({ w, p: await quickPrice(api, { name: w.name, vkey: w.vkey }).catch(() => null) })));
  $('watch-list').innerHTML = rows.map(({ w, p }, i) => {
    const now = p?.lo, then = w.at;
    const pct = now != null && then ? (now - then) / then * 100 : null;
    const since = new Date(w.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `<li><button type="button" data-i="${i}">
      <span class="what"><b>${esc(w.name)}</b><small>${esc(w.label || '')} · ${eur(then)} on ${since}</small></span>
      <span class="eur">${range(p?.lo, p?.hi)}${pct != null && Math.abs(pct) >= 0.05 ? `<small class="${pct >= 0 ? 'up' : 'down'}">${pctText(pct)}</small>` : '<small>±0 %</small>'}</span>
    </button></li>`;
  }).join('');
  $('watch-list').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const w = rows[Number(b.dataset.i)].w;
    openCardPage({ name: w.name, vkey: w.vkey }, plainHooks);
  }));
}
let marketTab = 'movers';
document.querySelectorAll('#market-tabs [data-mtab]').forEach((b) => b.addEventListener('click', () => {
  marketTab = b.dataset.mtab;
  document.querySelectorAll('#market-tabs [data-mtab]').forEach((x) => x.classList.toggle('on', x === b));
  $('watch').hidden = marketTab !== 'watch';
  $('movers').hidden = marketTab !== 'movers';
  if (marketTab === 'watch') renderWatch(); else renderMarket();
}));
// once per start: tell when a wished card is at the target price
setTimeout(async () => {
  if (!loadWish().length) return;
  const n = await renderWish().catch(() => 0);
  if (n) toast(`${n} card${n > 1 ? 's' : ''} on your wishlist at your price – see Collection › Wishlist`, 4500);
}, 2500);

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
  if (!$('holo').hidden) { closeHolo(); return; }
  if (!$('card-page').hidden) {
    closeCardPage(); masters.refresh(); decks.refresh();
    if (!$('view-collection').hidden && collTab === 'wish') renderWish();
    if (!$('view-market').hidden && marketTab === 'watch') renderWatch();
  }
  else if (!$('deck-page').hidden) decks.closeDeck();
  else if (!$('set-page').hidden) masters.closeSet();
  else if (!$('pack-page').hidden) { $('pack-page').hidden = true; syncBody(); }
});

// ---------- tabs ----------
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${name}`; });
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
  window.scrollTo(0, 0);
  if (name === 'collection') { $('coll-total')._val = null; $('coll-total')._now = null; renderCollection(); refreshCollectionPrices(); if (collTab === 'masters') masters.renderList(); if (collTab === 'decks') decks.renderList(); }
  if (name === 'market') { if (marketTab === 'watch') renderWatch(); else renderMarket(); }
  if (name === 'more') renderMore();
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

// Offline: a band on top – scanning works without network, prices are those of the last visit.
const offBand = document.createElement('div');
offBand.className = 'offline-band';
offBand.textContent = "You're offline – scanning still works, prices are from your last visit.";
document.querySelector('main').prepend(offBand);
const onNet = () => { offBand.hidden = navigator.onLine !== false; };
window.addEventListener('online', () => { onNet(); toast('Back online'); });
window.addEventListener('offline', onNet);
onNet();

// Start loading the recogniser in the background so the first scan is quick.
setTimeout(() => recognizer.ready().then(() => {
  if (/first time|Starting/.test($('status').textContent)) setStatus('');
  detector.ready().then(() => setStatus('')).catch(() => setStatus(''));
}).catch(() => {}), 500);

// Installable app + offline start
// A new deploy installs a new service worker; then offer a reload.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch((e) => console.warn('no service worker', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) showUpdate(); });
}
function showUpdate() {
  const b = $('update');
  b.hidden = false;
  b.onclick = () => location.reload();
}

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('install').hidden = false;
});
$('install').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => null);
  installPrompt = null;
  $('install').hidden = true;
});
// inside the Android app: no need to offer the download
if (/CardScanApp/.test(navigator.userAgent) || window.matchMedia('(display-mode: standalone)').matches) {
  $('apk-link').hidden = true;
  $('install-note').hidden = true;
}

// for tests
window.cardscan = { scanner, api, setPack, showView };
