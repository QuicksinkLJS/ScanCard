import {
  findSetCodes, parseManualCode, detectFirstEdition, valueTier, cardmarketSearchUrl,
} from './parse.js';
import { createApi } from './api.js';
import { prepare, PASSES, createOcr } from './ocr.js';

const $ = (id) => document.getElementById(id);
const api = createApi();
const LIST_KEY = 'cardscan-session-v1';

let ocrEngine = null;
let currentLabel = '';
let current = null; // { parsed, card, firstEdition }

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (v) => (v == null ? '–' : `€${v.toFixed(2)}`);

function setStatus(text, isError = false) {
  const el = $('status');
  if (!text) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle('error', isError);
}

function loadList() {
  try { return JSON.parse(localStorage.getItem(LIST_KEY) || '[]'); } catch { return []; }
}
function saveList(list) {
  try { localStorage.setItem(LIST_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

// ---------- image prep + OCR ----------
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function getOcr() {
  if (ocrEngine) return ocrEngine;
  if (!window.Tesseract) throw new Error('The text scanner could not be loaded. Check your connection and reload.');
  setStatus('Loading the text scanner (first time only)…');
  ocrEngine = await createOcr(window.Tesseract, {
    onProgress: (p) => setStatus(`${currentLabel}… ${Math.round(p * 100)}%`),
  });
  return ocrEngine;
}

// ---------- flow ----------
async function handleFile(file) {
  if (!file) return;
  $('result').hidden = true;
  $('ocr-debug').hidden = true;
  const preview = $('preview');
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;

  try {
    const img = await loadImage(file);
    const engine = await getOcr();
    let allText = '';
    const tried = new Set();
    let outcome = { status: 'nocode' };

    // Read the photo in several ways until a code is found that exists in the database.
    for (const pass of PASSES) {
      currentLabel = pass.label;
      setStatus(`${pass.label}…`);
      const text = await engine.read(prepare(img, pass.opts));
      allText += `${text}\n`;
      const codes = findSetCodes(text).filter((c) => !tried.has(c.code));
      codes.forEach((c) => tried.add(c.code));
      if (!codes.length) continue;
      outcome = await tryCodes(codes, detectFirstEdition(allText));
      if (outcome.status !== 'notfound') break;
    }

    $('ocr-text').textContent = allText.trim() || '(nothing readable)';
    $('ocr-debug').hidden = false;
    report(outcome, [...tried]);
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Something went wrong while reading the photo.', true);
  }
}

// Try each code until one is found. Returns { status: found | unsupported | notfound | error }.
async function tryCodes(codes, firstEdition) {
  for (const parsed of codes) {
    if (!parsed.language.supported) return { status: 'unsupported', parsed };
    setStatus(`Looking up ${parsed.code}…`);
    try {
      const card = await api.lookup(parsed);
      if (card) {
        current = { parsed, card, firstEdition };
        return { status: 'found' };
      }
    } catch (err) {
      console.error(err);
      return { status: 'error' };
    }
  }
  return { status: 'notfound' };
}

function report(outcome, tried) {
  switch (outcome.status) {
    case 'found':
      setStatus('');
      render();
      break;
    case 'unsupported':
      setStatus(`Found ${outcome.parsed.code}: ${outcome.parsed.language.name}. These cards aren't supported in this prototype yet.`, true);
      break;
    case 'error':
      setStatus("Couldn't reach the card database. Check your connection and try again.", true);
      break;
    case 'notfound':
      setStatus(`No card found for ${tried.join(', ')}. If the code was misread, type it in above.`, true);
      break;
    default:
      setStatus('No set code found. Take a closer, sharper photo of the code under the artwork, or type it in above.', true);
  }
}

// Colour = what the card could be worth at most (the "might be worth something" signal).
const tierFor = (card) => valueTier(card.max);

const range = (min, max) => (min == null ? '–' : min === max ? eur(min) : `${eur(min)} – ${eur(max)}`);

function versionRows(card) {
  return card.versions.map((v) => {
    const prices = v.products.map((p) => p.trend).filter((t) => t != null).sort((a, b) => a - b);
    const what = v.products.length > 1
      ? `${v.products.length} versions on Cardmarket (${esc(v.rarities.join(', ') || 'different rarities')})`
      : esc(v.rarities.join(', '));
    return `<li><span class="what">${esc(v.set)}${v.year ? ` (${v.year})` : ''}<small>${what}</small></span>
      <span class="eur">${prices.length ? range(prices[0], prices[prices.length - 1]) : '–'}</span></li>`;
  }).join('');
}

function render() {
  const { parsed, card, firstEdition } = current;
  const tier = tierFor(card);
  const el = $('result');
  const p = card.exact ? card.versions[0].products[0] : null;

  const edition = firstEdition === null ? ''
    : firstEdition ? '<span class="badge">1st Edition detected</span>'
      : '<span class="badge">1st Edition not detected – check the card</span>';

  const priceBlock = card.exact
    ? `<p class="price">${eur(p.trend)}</p>
       <p class="price-note">Cardmarket trend price. 30-day average ${eur(p.avg30)}, cheapest offer ${eur(p.low)}. Prices from ${esc((card.pricesDate || '').slice(0, 10))}.</p>`
    : `<p class="price">${range(card.min, card.max)}</p>
       <p class="price-note">Cardmarket trend prices. This code exists in more than one version, so the price depends on which one you have.</p>
       <ul class="versions">${versionRows(card)}</ul>`;

  el.innerHTML = `
    <div class="card ${tier}">
      <p class="name">${esc(card.name)}</p>
      <p class="sub">${esc(card.versions[0].set)}${card.versions[0].year ? ` · ${card.versions[0].year}` : ''}</p>
      <div class="badges">
        <span class="badge">${esc(parsed.code)}</span>
        <span class="badge">${esc(parsed.language.name)}</span>
        ${card.exact ? `<span class="badge">${esc(card.versions[0].rarities.join(', '))}</span>` : ''}
        ${edition}
      </div>
      ${priceBlock}
      <p class="price-note">Price for any language and condition. Check yours on Cardmarket.</p>
      <div class="actions">
        <a class="btn" href="${cardmarketSearchUrl(card.name)}" target="_blank" rel="noopener">Open on Cardmarket</a>
        <button class="btn primary" type="button" id="add">Add to session</button>
      </div>
    </div>`;
  el.hidden = false;
  $('add').addEventListener('click', addToSession);
}

function addToSession() {
  const { parsed, card } = current;
  const list = loadList();
  list.unshift({
    name: card.name,
    code: parsed.code,
    lang: parsed.language.code,
    min: card.min,
    max: card.max,
    tier: tierFor(card),
  });
  saveList(list);
  renderList();
  $('result').hidden = true;
  $('preview').hidden = true;
  $('ocr-debug').hidden = true;
  setStatus('Added. Scan the next card.');
}

function renderList() {
  const list = loadList().filter((c) => 'min' in c); // drop entries from older app versions
  $('list').innerHTML = list.map((c) => `
    <li><span class="dot ${c.tier}"></span>
      <span class="what">${esc(c.name)}<small>${esc(c.code)} · ${esc(c.lang)}</small></span>
      <span class="eur">${range(c.min, c.max)}</span></li>`).join('');
  const lo = list.reduce((s, c) => s + (c.min || 0), 0);
  const hi = list.reduce((s, c) => s + (c.max || 0), 0);
  const n = list.length;
  $('total').textContent = n ? `${n} ${n === 1 ? 'card' : 'cards'} · ${range(lo, hi)} on Cardmarket` : 'Scanned cards show up here.';
}

// ---------- wiring ----------
$('camera').addEventListener('change', (e) => { handleFile(e.target.files[0]); e.target.value = ''; });
$('gallery').addEventListener('change', (e) => { handleFile(e.target.files[0]); e.target.value = ''; });
$('manual').addEventListener('submit', (e) => {
  e.preventDefault();
  const parsed = parseManualCode($('manual-code').value);
  if (!parsed) { setStatus('That doesn\'t look like a set code. Example: LOB-EN001', true); return; }
  $('preview').hidden = true;
  $('ocr-debug').hidden = true;
  $('result').hidden = true;
  tryCodes([parsed], null).then((outcome) => report(outcome, [parsed.code]));
});
$('clear').addEventListener('click', () => { saveList([]); renderList(); });
renderList();
