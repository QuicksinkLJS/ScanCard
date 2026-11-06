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
let current = null; // { parsed, card, firstEdition, printIndex }

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (v) => (v == null ? '–' : `€${v.toFixed(2)}`);
const usd = (v) => (v == null || Number.isNaN(v) ? '–' : `$${v.toFixed(2)}`);

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
        current = { parsed, card, firstEdition, printIndex: 0 };
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

// Colour follows this exact print when we know its price, otherwise the cheapest version.
function tierFor(card, print) {
  return valueTier(Number.isFinite(print?.usd) ? print.usd : card.cardmarketFromEur);
}

function render() {
  const { parsed, card, firstEdition, printIndex } = current;
  const print = card.prints[printIndex];
  const tier = tierFor(card, print);
  const el = $('result');

  const edition = firstEdition === null ? ''
    : firstEdition ? '<span class="badge">1st Edition detected</span>'
      : '<span class="badge">1st Edition not detected – check the card</span>';

  const rarityPicker = card.prints.length > 1
    ? `<p class="warn">This code exists in ${card.prints.length} rarities. Which one is it?</p>
       <div class="rarities">${card.prints.map((p, i) => `<button type="button" class="rarity${i === printIndex ? ' on' : ''}" data-i="${i}">${esc(p.rarity)}</button>`).join('')}</div>`
    : '';

  el.innerHTML = `
    <div class="card ${tier}">
      <p class="name">${esc(card.localName || card.name)}</p>
      <p class="sub">${card.localName && card.localName !== card.name ? `${esc(card.name)} · ` : ''}${esc(card.setName)}</p>
      <div class="badges">
        <span class="badge">${esc(parsed.code)}</span>
        <span class="badge">${esc(parsed.language.name)}</span>
        <span class="badge">${esc(print.rarity)}</span>
        ${edition}
      </div>
      ${rarityPicker}
      <p class="price">This print: ${usd(print.usd)}</p>
      <p class="price-note">Reference price for the English ${esc(card.dbCode)} ${esc(print.rarity)} (TCGplayer). Cheapest version of this card on Cardmarket: ${eur(card.cardmarketFromEur)}. Check your language and condition on Cardmarket.</p>
      <div class="actions">
        <a class="btn" href="${cardmarketSearchUrl(card.name)}" target="_blank" rel="noopener">Open on Cardmarket</a>
        <button class="btn primary" type="button" id="add">Add to session</button>
      </div>
    </div>`;
  el.hidden = false;

  el.querySelectorAll('.rarity').forEach((b) => b.addEventListener('click', () => {
    current.printIndex = Number(b.dataset.i);
    render();
  }));
  $('add').addEventListener('click', addToSession);
}

function addToSession() {
  const { parsed, card, printIndex } = current;
  const print = card.prints[printIndex];
  const list = loadList();
  list.unshift({
    name: card.localName || card.name,
    code: parsed.code,
    lang: parsed.language.code,
    rarity: print.rarity,
    usd: Number.isFinite(print.usd) ? print.usd : null,
    eur: card.cardmarketFromEur,
    tier: tierFor(card, print),
  });
  saveList(list);
  renderList();
  $('result').hidden = true;
  $('preview').hidden = true;
  $('ocr-debug').hidden = true;
  setStatus('Added. Scan the next card.');
}

function renderList() {
  const list = loadList();
  $('list').innerHTML = list.map((c) => `
    <li><span class="dot ${c.tier}"></span>
      <span class="what">${esc(c.name)}<small>${esc(c.code)} · ${esc(c.lang)} · ${esc(c.rarity)}</small></span>
      <span class="eur">${c.usd != null ? usd(c.usd) : eur(c.eur)}</span></li>`).join('');
  const total = list.reduce((s, c) => s + (c.usd ?? 0), 0);
  const n = list.length;
  $('total').textContent = n ? `${n} ${n === 1 ? 'card' : 'cards'} · about ${usd(total)} in print reference prices` : 'Scanned cards show up here.';
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
