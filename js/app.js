// The boss: tabs, camera, and what happens when a button is pressed.

import { startI18n, lang, setLang } from './i18n.js';
import { $, esc, eur, range, toast, countTo, loadImage, canvasBlob, blobToDataURL, thumbOf, choose } from './util.js';
import { parseManualCode, valueTier, normName } from './parse.js';
import { baseOf } from './codematch.js';
import { createApi } from './api.js';
import { createOcr, createLineReader } from './ocr.js';
import { createTextIndex } from './readtext.js';
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
import { createPlacer } from './placement.js';
import { loadTracked, ownedCounts } from './masters.js';
import { makeBackup, readBackup, restoreBackup, collectionCsv, sellCsv, saveFile } from './backup.js';
import { createFriends } from './friendsui.js';
import { loadDecks } from './decks.js';
import { copyText } from './copy.js';
import { valueSeries } from './depot.js';
import { bindTiltScan, tiltOnBack } from './tiltui.js';
import { bindHologram, hologramOnBack } from './hologram.js';
import { bindQuartet } from './quartetui.js';
import { bindPassport, passOnBack, exportPasses } from './passui.js';
import { loadWatch, loadWish, removeWatch, belowTarget, migrateLists, removeWishId, restoreWish } from './lists.js';
import { GAME, applyGameStyle } from './game.js';
import { addLife, addEvent, removeNote } from './life.js';
import { bindImport, importOnBack } from './importui.js';
import { bindRarityGuide, rarityGuideOnBack } from './rarityui.js';
import { takeCopy, restoreCopy, listCopies, keepData, isKept } from './safestore.js';
import { backupReminder, REASONS, SNOOZE } from './safety.js';
import {
  loadCollection, saveCollection, newId, loadPack, savePack, putSample, updateSample, allSamples, countSamples,
} from './store.js';

// The BETA channel marker only on the beta site (/beta/), the live app shows the normal tag.
if (/\/beta\//.test(location.pathname)) {
  document.querySelector('.beta-flag')?.removeAttribute('hidden');
  document.querySelector('.live-flag')?.setAttribute('hidden', '');
}
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

// Reading names: one line reader per OCR language, made when first needed
const lineReaders = new Map();
function getLineOcr(lang) {
  if (!lineReaders.has(lang)) {
    if (!window.Tesseract) return Promise.reject(new Error('Text scanner not loaded'));
    const p = createLineReader(window.Tesseract, lang);
    p.catch(() => lineReaders.delete(lang));
    lineReaders.set(lang, p);
  }
  return lineReaders.get(lang);
}
applyGameStyle();
const textIndex = createTextIndex(GAME.data);

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
  api, recognizer, detector, getOcr, getLineOcr, textIndex, setStatus,
  placer: createPlacer({ api, loadTracked, ownedCounts, loadDecks, loadCollection }),
  onSpot: (sp, c) => {
    if (sp.kind === 'binder' || sp.kind === 'binder?') { showView('collection'); masters.openSet(sp.exp, { highlight: sp.key || null }); }
  },
  getPack: () => pack,
  setPack,
  onOpen: (c) => openCardPage(c, scanHooks),
  onCorrect: (c) => scanHooks.onChange(c),
  onAddAll: async (list) => {
    for (const c of list) await addScanned(c, false);
    scanner.renderList();
    // honest about open versions: they are saved without a version (Collection › "choose rarity"), not with a guess
    const open = list.filter((c) => !c.price?.exact).length;
    toast(`${list.length} card${list.length > 1 ? 's' : ''} added to your collection${open ? ` · ${open} with the version still open – pick it later` : ''}`, 6000, undoAdd(list.map((c) => c.collId), list));
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
    name: s.name, vkey: s.vkey || null, vby: s.vkey ? s.vby || null : null,
    code: s.code ? { code: s.code.code, base: s.code.base, lang: s.code.lang, language: s.code.language } : null,
    language: s.language || null, ocrText: s.ocrText ?? null,
    pack: s.pack || null, top: s.top || null, confident: s.confident ?? true,
    thumb: (s.canvas ? thumbOf(s.canvas, 180, 0.8) : s.thumb) || null, sampleId: s.sampleId || null,
    price: s.price ? { ...s.price, picks: undefined } : null, added: Date.now(),
    // your copy, when set on the card page before adding (quick pick); missing = keep what the entry has
    ...(s.lang !== undefined ? { lang: s.lang || null } : {}), ...(s.first !== undefined ? { first: s.first ?? null } : {}),
    ...extra,
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
    // life story: a newly picked version (or a corrected name) is a moment of its own
    if (!same && entry.vkey && entry.price?.exact) addLife(list[i], { k: 'ver', v: entry.price.label });
  } else {
    const e = { ...entry, buy: snap };
    addLife(e, addEvent(e));
    if (e.vkey && e.price?.exact) addLife(e, { k: 'ver', v: e.price.label });
    list.unshift(e);
  }
  saveCollection(list);
}

// Life story hooks for the card page (your collection's copy of the card)
const storyHooks = {
  story: (s) => (s.collId ? loadCollection().find((e) => e.id === s.collId) || null : null),
  onNote: (s, note) => {
    const list = loadCollection();
    const e = list.find((x) => x.id === s.collId);
    if (!e) return;
    addLife(e, { ...note, k: 'note' });
    saveCollection(list);
  },
  onPass: (s, rec) => {
    const list = loadCollection();
    const e = list.find((x) => x.id === s.collId);
    if (!e) return;
    addLife(e, { k: 'pass', id: rec.id });
    saveCollection(list);
  },
  onNoteRemove: (s, t) => {
    const list = loadCollection();
    const e = list.find((x) => x.id === s.collId);
    if (!e) return;
    removeNote(e, t);
    saveCollection(list);
  },
};

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
  ...storyHooks,
  story: (s) => (s.added ? storyHooks.story(s) : null),
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
  ...storyHooks,
  // condition / language / 1st Edition of your copy
  onCopy: (s, patch) => {
    const list = loadCollection();
    const e = list.find((x) => x.id === s.collId);
    if (!e) return;
    Object.assign(e, patch);
    const c = copyText(e);
    if (c) addLife(e, { k: 'copy', c });
    saveCollection(list);
    renderCollection();
  },
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
      <span class="what"><b>${esc(e.name)}</b><small>${r ? `<span class="rbadge ${r.cls}">${esc(r.label)}</span> ` : ''}${esc(e.price?.label || '')}${copyText(e) ? ` · <span class="copytag">${esc(copyText(e))}</span>` : ''}</small></span>
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
bindTiltScan();
bindHologram({ detector });
bindQuartet();
bindRarityGuide();
bindPassport();
const friends = createFriends({ api, openCard: (s) => openCardPage(s, plainHooks), loadDecks });
friends.fromLink();
window.addEventListener('hashchange', () => friends.fromLink());
let collTab = 'cards';
document.querySelectorAll('#coll-tabs [data-ctab]').forEach((b) => b.addEventListener('click', () => {
  collTab = b.dataset.ctab;
  document.querySelectorAll('#coll-tabs [data-ctab]').forEach((x) => x.classList.toggle('on', x === b));
  $('masters').hidden = collTab !== 'masters';
  $('decks').hidden = collTab !== 'decks';
  $('wish').hidden = collTab !== 'wish';
  $('friends').hidden = collTab !== 'friends';
  if (collTab === 'friends') friends.renderList();
  if (collTab === 'wish') renderWish();
  $('coll-cards').hidden = collTab !== 'cards';
  renderRemind();
  if (collTab === 'masters') masters.renderList();
  if (collTab === 'decks') decks.renderList();
}));

// ---------- wishlist and watchlist ----------
migrateLists(); // once: old wishlist target prices move to the watchlist
// Wishlist in sections: single cards, one per deck (missing cards added from the deck page), mastersets (summary).
async function renderWish() {
  const list = loadWish();
  const sets = await masters.summaries().catch(() => []);
  $('wish-empty').hidden = list.length > 0 || sets.length > 0;
  const owned = new Set(loadCollection().map((e) => normName(e.name)));
  const prices = new Map(await Promise.all(list.map(async (w) => [w.id, await quickPrice(api, { name: w.name, vkey: w.vkey }).catch(() => null)])));
  const row = (w) => {
    const p = prices.get(w.id);
    const have = w.group === 'deck' && owned.has(normName(w.name));
    const want = copyText(w, { wish: true });
    return `<li class="${have ? 'have' : ''}"><button type="button" data-name="${esc(w.name)}" data-vkey="${esc(w.vkey || '')}">
      <span class="what"><b>${esc(w.name)}</b><small>${have ? '<span class="dealtag">✓ in your collection</span> ' : ''}${esc(w.label || p?.label || '')}${want ? ` · <span class="copytag">looking for ${esc(want)}</span>` : ''}</small></span>
      <span class="eur">${range(p?.lo, p?.hi)}</span></button></li>`;
  };
  const singles = list.filter((w) => w.group !== 'deck');
  const decks = new Map();
  for (const w of list) if (w.group === 'deck') { const k = w.deck?.id || '?'; if (!decks.has(k)) decks.set(k, { deck: w.deck, items: [] }); decks.get(k).items.push(w); }
  const sum = (items) => items.reduce((v, w) => v + (prices.get(w.id)?.lo || 0), 0);
  let html = '';
  if (singles.length) html += `<h2 class="wsec">Singles <span class="muted small">${singles.length}</span></h2><ul class="rows">${singles.map(row).join('')}</ul>`;
  for (const [id, g] of decks) {
    const open = g.items.filter((w) => !owned.has(normName(w.name))).length;
    html += `<h2 class="wsec">${esc(g.deck?.name || 'Deck')} <span class="muted small">${open ? `${open} missing · from ${eur(sum(g.items))}` : 'complete ✓'}</span>
      <button type="button" class="link wsec-clear" data-deck="${esc(id)}">Remove</button></h2><ul class="rows">${g.items.map(row).join('')}</ul>`;
  }
  if (sets.length) {
    html += `<h2 class="wsec">Mastersets <span class="muted small">${sets.length}</span></h2><ul class="rows">${sets.map(({ t, p }) => `
      <li><button type="button" data-exp="${t.exp}"><span class="what"><b>${esc(t.name)}</b>
        <small>${p.total - p.have} missing · approx. ${eur(p.missingValue)}</small></span>
        <span class="eur">${p.have}/${p.total}</span></button></li>`).join('')}</ul>`;
  }
  const el = $('wish-list');
  el.innerHTML = html;
  el.querySelectorAll('button[data-name]').forEach((b) => b.addEventListener('click', () => openCardPage({ name: b.dataset.name, vkey: b.dataset.vkey || null }, plainHooks)));
  el.querySelectorAll('button[data-exp]').forEach((b) => b.addEventListener('click', () => masters.openSet(Number(b.dataset.exp))));
  el.querySelectorAll('.wsec-clear').forEach((b) => b.addEventListener('click', () => {
    const gone = loadWish().filter((w) => w.group === 'deck' && (w.deck?.id || '?') === b.dataset.deck);
    for (const w of gone) removeWishId(w.id);
    renderWish();
    toast(`${gone.length} card${gone.length > 1 ? 's' : ''} removed from your wishlist`, 5000, { label: 'Undo', run: () => { for (const w of gone.reverse()) restoreWish(w); renderWish(); } });
  }));
}

// Watchlist: price since you marked it; with a target price, cards at or below it come first and are marked.
async function renderWatch() {
  const list = loadWatch();
  $('watch-empty').hidden = list.length > 0;
  const rows = await Promise.all(list.map(async (w) => ({ w, p: await quickPrice(api, { name: w.name, vkey: w.vkey }).catch(() => null) })));
  rows.sort((a, b) => belowTarget(b.w, b.p) - belowTarget(a.w, a.p));
  $('watch-list').innerHTML = rows.map(({ w, p }, i) => {
    const now = p?.lo, then = w.at;
    const pct = now != null && then ? (now - then) / then * 100 : null;
    const since = new Date(w.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const hit = belowTarget(w, p);
    return `<li class="${hit ? 'deal' : ''}"><button type="button" data-i="${i}">
      <span class="what"><b>${esc(w.name)}</b><small>${hit ? '<span class="dealtag">At your price!</span> ' : ''}${esc(w.label || '')} · ${eur(then)} on ${since}${w.target != null ? ` · target ${eur(w.target)}` : ''}</small></span>
      <span class="eur">${range(p?.lo, p?.hi)}${pct != null && Math.abs(pct) >= 0.05 ? `<small class="${pct >= 0 ? 'up' : 'down'}">${pctText(pct)}</small>` : '<small>±0 %</small>'}</span>
    </button></li>`;
  }).join('');
  $('watch-list').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const w = rows[Number(b.dataset.i)].w;
    openCardPage({ name: w.name, vkey: w.vkey }, plainHooks);
  }));
  return rows.filter((r) => belowTarget(r.w, r.p)).length;
}
let marketTab = 'movers';
document.querySelectorAll('#market-tabs [data-mtab]').forEach((b) => b.addEventListener('click', () => {
  marketTab = b.dataset.mtab;
  document.querySelectorAll('#market-tabs [data-mtab]').forEach((x) => x.classList.toggle('on', x === b));
  $('watch').hidden = marketTab !== 'watch';
  $('movers').hidden = marketTab !== 'movers';
  if (marketTab === 'watch') renderWatch(); else renderMarket();
}));
// once per start: tell when a watched card is at its target price
setTimeout(async () => {
  if (!loadWatch().some((w) => w.target != null)) return;
  const n = await renderWatch().catch(() => 0);
  if (n) toast(`${n} card${n > 1 ? 's' : ''} on your watchlist at your target price – see Market › Watchlist`, 4500);
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
  a.download = `curio-training-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
});

$('clear-coll').addEventListener('click', () => {
  if (!loadCollection().length) return;
  if (!window.confirm('Remove all cards from your collection? Training examples stay.')) return;
  takeCopy('clear').finally(() => {
    saveCollection([]);
    renderCollection();
    toast('Collection cleared – a copy is kept under More › Your data');
  });
});

// ---------- backup & export ----------
const today = () => new Date().toISOString().slice(0, 10);
async function saveBackupFile() {
  const b = makeBackup();
  const r = await saveFile(JSON.stringify(b), `curio-backup-${today()}.json`, 'application/json');
  if (r !== 'cancelled') {
    try { localStorage.setItem('cardscan-lastbackup', String(Date.now())); localStorage.setItem('cardscan-lastbackup-cards', String(loadCollection().length)); } catch { /* ignore */ }
    toast(r === 'shared' ? 'Backup ready – keep it somewhere safe' : 'Backup saved');
    renderRemind(); renderSafety();
  }
}
$('bk-save').addEventListener('click', saveBackupFile);
$('bk-file').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  let b;
  try { b = readBackup(await file.text()); } catch { toast('That is not a Curio backup'); return; }
  const date = new Date(b.date).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const v = await choose('Restore backup?', [{ label: 'Replace everything', value: 'yes', danger: true }],
    `Backup from ${date} with ${b.cards} cards. Everything on this phone is replaced by it.`);
  if (v !== 'yes') return;
  await takeCopy('restore');
  const before = restoreBackup(b);
  toast('Backup restored', 6000, { label: 'Undo', run: () => { restoreBackup(before); location.reload(); } });
  setTimeout(() => location.reload(), 6200);
});
try { if (localStorage.getItem('cardscan-lab') === '1') $('bk-pass').hidden = false; } catch { /* no storage */ }
$('bk-pass').addEventListener('click', async () => {
  const data = await exportPasses();
  if (!data.records.length) { toast('No card passports yet'); return; }
  const r = await saveFile(JSON.stringify(data), `curio-passports-${today()}.json`, 'application/json');
  if (r !== 'cancelled') toast(`${data.records.length} recordings exported`);
});
$('bk-csv').addEventListener('click', async () => {
  const list = loadCollection();
  if (!list.length) { toast('Your collection is empty'); return; }
  await saveFile(collectionCsv(list), `curio-collection-${today()}.csv`, 'text/csv');
});
$('bk-sell').addEventListener('click', async () => {
  const list = loadCollection();
  if (!list.length) { toast('Your collection is empty'); return; }
  const which = await choose('Sell list', [{ label: 'Only doubles (keep one of each)', value: 'doubles' }, { label: 'All cards', value: 'all' }],
    'Cards without a chosen version are left out – pick the version on the card page first.');
  if (!which) return;
  const r = sellCsv(list, { onlyDoubles: which === 'doubles' });
  if (!r.rows) { toast(which === 'doubles' ? 'No doubles with a known version' : 'No cards with a known version yet'); return; }
  await saveFile(r.text, `curio-sell-${today()}.csv`, 'text/csv');
  if (r.skipped) toast(`${r.skipped} card${r.skipped > 1 ? 's' : ''} without a version left out`);
});

async function renderMore() {
  renderSafety();
  const n = await countSamples();
  $('export').textContent = `Export training data (${n})`;
  try {
    const ix = await api.index();
    const d = ix.prices ? new Date(ix.prices).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '?';
    $('data-info').textContent = `Prices of ${d} · ${ix.sets.length} set codes · ${loadCollection().length} cards in your collection`;
  } catch { $('data-info').textContent = 'Price data not available.'; }
}

// ---------- data safety: automatic copies, kept storage, backup reminder ----------
const dayTime = (t) => new Date(t).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const readNum = (k) => { try { const v = localStorage.getItem(k); return v == null ? null : Number(v); } catch { return null; } };
async function renderSafety() {
  const [copies, kept] = await Promise.all([listCopies(), isKept()]);
  const last = copies[0];
  $('safe-status').innerHTML = `${last ? `🛡 <b>Automatic copies on:</b> last ${esc(dayTime(last.t))} · ${copies.length} kept` : '🛡 <b>Automatic copies on</b> – the first one is made today'}<br>
    ${kept === true ? '✓ The browser keeps Curio\'s data, even when space runs low' : kept === false ? 'The browser may clear Curio\'s data when space runs low – install the app to prevent that' : ''}`;
  const lf = readNum('cardscan-lastbackup');
  $('safe-file').innerHTML = lf ? `Last backup file: ${esc(dayTime(lf))}` : '<b>No backup file yet</b> – save one to keep your cards safe on another device';
  $('safe-count').textContent = copies.length ? `(${copies.length})` : '';
  $('safe-list').innerHTML = copies.map((c) => `<li><div class="row"><span class="what"><b>${esc(dayTime(c.t))}</b>
    <small>${esc(REASONS[c.reason] || c.reason)} · ${c.cards} card${c.cards === 1 ? '' : 's'}</small></span>
    <button type="button" class="btn small-btn" data-copy="${esc(c.id)}">Go back</button></div></li>`).join('') || '<li><div class="row muted small">No copies yet.</div></li>';
  $('safe-list').querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const c = copies.find((x) => x.id === b.dataset.copy);
    const v = await choose('Go back to this state?', [{ label: 'Go back', value: 'yes', danger: true }],
      `${dayTime(c.t)} · ${c.cards} cards. Everything on this phone is replaced by it – the current state is kept as a copy first.`);
    if (v !== 'yes') return;
    try { await restoreCopy(c.id); } catch { toast('This copy could not be read'); return; }
    toast('Back to the earlier state');
    setTimeout(() => location.reload(), 1200);
  }));
}
function renderRemind() {
  const el = $('bk-remind');
  const r = collTab === 'cards' ? backupReminder({ cards: loadCollection().length, lastFile: readNum('cardscan-lastbackup'), cardsAtFile: readNum('cardscan-lastbackup-cards'), snoozeUntil: readNum('cardscan-backup-snooze') || 0 }) : null;
  el.hidden = !r;
  if (!r) return;
  el.innerHTML = `<p class="small"><b>🛡 ${r.never ? `Your ${r.cards} cards are only on this phone` : `Last backup ${r.days} days ago${r.newCards ? ` · ${r.newCards} new cards since` : ''}`}</b><br>
    <span class="muted">A backup file keeps them safe on a new phone or after clearing the browser – 10 seconds.</span></p>
    <div class="actions"><button type="button" class="btn primary" id="rm-save">Save backup</button><button type="button" class="btn" id="rm-later">Later</button></div>`;
  $('rm-save').addEventListener('click', saveBackupFile);
  $('rm-later').addEventListener('click', () => { try { localStorage.setItem('cardscan-backup-snooze', String(Date.now() + SNOOZE)); } catch { /* ignore */ } renderRemind(); });
}
// on start (after the first paint): keep the data, take the daily copy; again when the app goes to the background
setTimeout(() => { keepData(); takeCopy('daily'); }, 2500);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') takeCopy('daily'); });
bindImport({ api, quickPrice, loadCollection, saveCollection, newId, onDone: () => { renderCollection(); renderRemind(); renderSafety(); } });

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
  if (rarityGuideOnBack()) return;
  if (importOnBack()) return;
  if (hologramOnBack()) return;
  if (passOnBack()) return;
  if (tiltOnBack()) return;
  if (!$('holo').hidden) { closeHolo(); return; }
  if (!$('card-page').hidden) {
    closeCardPage(); masters.refresh(); decks.refresh(); friends.refresh();
    if (!$('view-collection').hidden && collTab === 'wish') renderWish();
    if (!$('view-market').hidden && marketTab === 'watch') renderWatch();
  }
  else if (friends.onBack()) { /* closed a friends sheet */ }
  else if (!$('deck-page').hidden) decks.closeDeck();
  else if (!$('set-page').hidden) masters.closeSet();
  else if (!$('pack-page').hidden) { $('pack-page').hidden = true; syncBody(); }
});

// ---------- tabs ----------
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${name}`; });
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
  window.scrollTo(0, 0);
  if (name === 'collection') { renderRemind(); $('coll-total')._val = null; $('coll-total')._now = null; renderCollection(); refreshCollectionPrices(); if (collTab === 'masters') masters.renderList(); if (collTab === 'decks') decks.renderList(); }
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
