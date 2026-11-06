import {
  findSetCodes, parseManualCode, detectFirstEdition, valueTier, cardmarketSearchUrl, normName,
} from './parse.js';
import { createApi } from './api.js';
import { prepare, createOcr } from './ocr.js';
import { createRecognizer } from './recognize.js';
import { createCamera, cardsFromPhoto } from './camera.js';

const $ = (id) => document.getElementById(id);
const api = createApi();
const LIST_KEY = 'cardscan-session-v2';

let ocrEngine = null;
let scanId = 0;      // ignore results of an older scan when a new one started
let current = null;  // what the result card shows

// ---------- small helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (v) => (v == null ? '–' : `€${v.toFixed(2)}`);
const range = (lo, hi) => (lo == null ? '–' : lo === hi ? eur(lo) : `${eur(lo)} – ${eur(hi)}`);

function setStatus(text, isError = false, progress = null) {
  const el = $('status');
  if (!text) { el.hidden = true; return; }
  el.hidden = false;
  el.classList.toggle('error', isError);
  el.innerHTML = `${esc(text)}${progress != null ? `<div class="bar"><div style="width:${Math.round(progress * 100)}%"></div></div>` : ''}`;
}

function loadList() {
  try { return JSON.parse(localStorage.getItem(LIST_KEY) || '[]'); } catch { return []; }
}
function saveList(list) {
  try { localStorage.setItem(LIST_KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ---------- engines ----------
const recognizer = createRecognizer({ onStatus: (t, p) => setStatus(t, false, p) });

async function getOcr() {
  if (ocrEngine) return ocrEngine;
  if (!window.Tesseract) throw new Error('Text scanner not loaded');
  ocrEngine = await createOcr(window.Tesseract);
  return ocrEngine;
}

const camera = createCamera({
  root: $('cam'),
  video: $('cam-video'),
  frame: $('cam-frame'),
  onCapture: (card) => scanCards([card]),
  onError: () => setStatus('The camera could not be opened. Allow camera access, or use "Choose photo".', true),
});

// ---------- scanning ----------
async function scanCards(candidates) {
  const id = ++scanId;
  $('result').hidden = true;
  $('ocr-debug').hidden = true;
  const preview = $('preview');
  preview.src = candidates[0].toDataURL('image/jpeg', 0.8);
  preview.hidden = false;
  try {
    setStatus('Recognising the card…');
    let best = null, bestCard = null;
    for (const card of candidates) {
      const r = await recognizer.identify(card);
      if (!best || r.top[0].score > best.top[0].score) { best = r; bestCard = card; }
    }
    if (id !== scanId) return;
    preview.src = bestCard.toDataURL('image/jpeg', 0.8);
    setStatus('');
    await showCard(best.top[0].name, { alternatives: best.top, confident: best.confident });
    readSetCode(bestCard, id);
  } catch (err) {
    console.error(err);
    setStatus(`Recognition failed: ${err.message || err}`, true);
  }
}

// Second opinion: read the printed set code. If it belongs to the recognised card,
// show the exact price of that printing.
async function readSetCode(card, id) {
  try {
    current.codeStatus = 'reading';
    render();
    const engine = await getOcr();
    const lower = { region: { x: 0.3, y: 0.62, w: 0.7, h: 0.16 } }; // set code: right, just under the artwork
    let text = '';
    for (const opts of [{ ...lower, binarize: true }, { region: { x: 0, y: 0.55, w: 1, h: 0.45 }, binarize: true }]) {
      text += `${await engine.read(prepare(card, opts))}\n`;
      if (id !== scanId) return;
      const codes = findSetCodes(text);
      for (const parsed of codes) {
        if (!parsed.language.supported) {
          current.code = { parsed, unsupported: true };
          current.codeStatus = 'done';
          render();
          return;
        }
        const hit = await api.lookup(parsed);
        if (hit && normName(hit.name) === normName(current.name)) {
          current.code = { parsed, hit, firstEdition: detectFirstEdition(text) };
          current.codeStatus = 'done';
          render();
          return;
        }
      }
    }
    current.ocrText = text;
    current.codeStatus = 'none';
    render();
  } catch (err) {
    console.warn('set code reading failed', err);
    if (current) { current.codeStatus = 'none'; render(); }
  }
}

async function showCard(name, extra = {}) {
  const info = await api.nameInfo(name).catch(() => null);
  current = { name, info, code: null, codeStatus: null, ...extra };
  render();
}

// ---------- result card ----------
function tierOf(cur) {
  if (cur.code?.hit) return valueTier(cur.code.hit.max);
  return valueTier(cur.info?.max);
}

function render() {
  if (!current) return;
  const c = current;
  const el = $('result');
  const tier = tierOf(c);
  const alts = (c.alternatives || []).filter((a) => a.name !== c.name).slice(0, 4);

  let price;
  if (c.code?.hit) {
    const h = c.code.hit;
    const p = h.exact ? h.versions[0].products[0] : null;
    price = `<p class="price">${p ? eur(p.trend) : range(h.min, h.max)}</p>
      <p class="price-note">Exact printing ${esc(c.code.parsed.code)} (${esc(h.versions[0].set)}${h.versions[0].year ? `, ${h.versions[0].year}` : ''}). Cardmarket trend${p ? `, 30-day average ${eur(p.avg30)}` : ''}.</p>`;
  } else if (c.info) {
    const rows = c.info.versions.slice(0, 6).map((v) => `<li><span class="what">${esc(v.set)}${v.year ? ` (${v.year})` : ''}</span><span class="eur">${range(v.min, v.max)}</span></li>`).join('');
    price = `<p class="price">${range(c.info.min, c.info.max)}</p>
      <p class="price-note">Depends on which printing you have (${c.info.versions.length} on Cardmarket). Most valuable first:</p>
      <ul class="versions">${rows}</ul>`;
  } else {
    price = '<p class="price-note">No Cardmarket price found. This is often a card only printed in Japan or Korea.</p>';
  }

  const codeLine = {
    reading: '<p class="price-note">Reading the set code for the exact printing…</p>',
    none: '<p class="price-note">Set code not readable. Take a close-up of the code under the artwork for the exact price.</p>',
    done: c.code?.unsupported ? `<p class="price-note">Set code ${esc(c.code.parsed.code)}: ${esc(c.code.parsed.language.name)} printing. Showing prices of the European versions.</p>` : '',
  }[c.codeStatus] || '';

  const badges = [];
  if (c.code?.parsed) badges.push(c.code.parsed.code, c.code.parsed.language.name);
  if (c.code?.firstEdition) badges.push('1st Edition');

  el.innerHTML = `
    <div class="card ${tier}">
      <p class="name">${esc(c.name)}</p>
      <p class="sub">${c.confident === false ? 'Not sure – check the suggestions below' : 'Recognised from the artwork'}</p>
      ${badges.length ? `<div class="badges">${badges.map((b) => `<span class="badge">${esc(b)}</span>`).join('')}</div>` : ''}
      ${price}
      ${codeLine}
      ${alts.length ? `<p class="price-note">Not this card?</p><div class="rarities">${alts.map((a) => `<button type="button" class="rarity alt" data-name="${esc(a.name)}">${esc(a.name)}</button>`).join('')}</div>` : ''}
      <div class="actions">
        <a class="btn" href="${cardmarketSearchUrl(c.name)}" target="_blank" rel="noopener">Open on Cardmarket</a>
        <button class="btn primary" type="button" id="add">Add to session</button>
      </div>
    </div>`;
  el.hidden = false;
  el.querySelectorAll('.alt').forEach((b) => b.addEventListener('click', () => {
    scanId++; // stop the running set-code check, it belonged to the other card
    showCard(b.dataset.name, { alternatives: c.alternatives, confident: true });
  }));
  $('add').addEventListener('click', addToSession);
}

function addToSession() {
  const c = current;
  const lo = c.code?.hit ? c.code.hit.min : c.info?.min ?? null;
  const hi = c.code?.hit ? c.code.hit.max : c.info?.max ?? null;
  const list = loadList();
  list.unshift({ name: c.name, code: c.code?.parsed?.code || '', lang: c.code?.parsed?.language?.code || '', min: lo, max: hi, tier: tierOf(c) });
  saveList(list);
  renderList();
  $('result').hidden = true;
  $('preview').hidden = true;
  setStatus('Added. Scan the next card.');
}

function renderList() {
  const list = loadList();
  $('list').innerHTML = list.map((c) => `
    <li><span class="dot ${c.tier}"></span>
      <span class="what">${esc(c.name)}<small>${esc([c.code, c.lang].filter(Boolean).join(' · ') || 'printing unknown')}</small></span>
      <span class="eur">${range(c.min, c.max)}</span></li>`).join('');
  const lo = list.reduce((s, c) => s + (c.min || 0), 0);
  const hi = list.reduce((s, c) => s + (c.max || 0), 0);
  const n = list.length;
  $('total').textContent = n ? `${n} ${n === 1 ? 'card' : 'cards'} · ${range(lo, hi)} on Cardmarket` : 'Scanned cards show up here.';
}

// ---------- manual set code ----------
async function manualLookup(input) {
  const parsed = parseManualCode(input);
  if (!parsed) { setStatus("That doesn't look like a set code. Example: LOB-EN001", true); return; }
  scanId++;
  $('preview').hidden = true;
  setStatus(`Looking up ${parsed.code}…`);
  const hit = await api.lookup(parsed).catch(() => null);
  if (!hit) { setStatus(`No card found for ${parsed.code}.`, true); return; }
  setStatus('');
  await showCard(hit.name, { confident: true });
  current.code = { parsed, hit };
  current.codeStatus = 'done';
  render();
}

// ---------- wiring ----------
$('scan').addEventListener('click', () => { recognizer.ready().catch(() => {}); camera.open(); });
$('cam-shot').addEventListener('click', () => camera.capture());
$('cam-cancel').addEventListener('click', () => camera.close());
$('gallery').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const img = await loadImage(file);
  scanCards(cardsFromPhoto(img));
});
$('manual').addEventListener('submit', (e) => { e.preventDefault(); manualLookup($('manual-code').value); });
$('clear').addEventListener('click', () => { saveList([]); renderList(); });
renderList();
// Start loading the recogniser in the background so the first scan is quick.
setTimeout(() => recognizer.ready().then(() => {
  if (/first time|Starting/.test($('status').textContent)) setStatus('');
}).catch(() => {}), 500);
