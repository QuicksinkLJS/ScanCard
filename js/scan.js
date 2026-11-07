// The scan screen: photo -> find cards -> recognise -> read set codes -> list, most valuable first.

import { $, esc, range, thumbOf, rotate180, toast } from './util.js';
import { cutCard, corners } from './detect.js';
import { cardsFromPhoto } from './camera.js';
import { prepare } from './ocr.js';
import { matchCode, languageFromText } from './codematch.js';
import { valueTier } from './parse.js';
import { quickPrice } from './cardpage.js';
import { sharePulls } from './share.js';
import { pileOf, PILES } from './sortpile.js';
import { versionImage } from './prices.js';

const SHOW_MAX = 1600; // longest side of the photo shown on screen

export function createScanner({ api, recognizer, detector, getOcr, getPack, setPack, onOpen, onAddAll, setStatus, onCorrect = () => {} }) {
  let scanId = 0;
  let cards = [];   // the cards of the current photo
  let photoSize = null;
  let packs = 1;          // packs in this photo (pack balance)
  let piles = false;      // show the sort suggestion
  const celebrated = new Set();

  // ---------- entry points ----------
  async function scanPhoto(image, mode) {
    const id = ++scanId;
    packs = 1;
    showPhoto(image);
    scanning(true);
    cards = [];
    renderList();
    try {
      let found = null;
      if (mode === 'multi') {
        setStatus('Looking for cards in the photo…');
        try {
          const boxes = await detector.find(image);
          if (boxes.length) found = boxes.map((b) => ({ box: b, canvas: cutCard(image, b), source: image }));
        } catch (e) {
          console.warn('card finder not available', e);
        }
        if (id !== scanId) return;
      }
      if (!found) {
        // one card filling the photo: try upright and sideways, keep the better one
        setStatus('Recognising the card…');
        const cands = cardsFromPhoto(image);
        const res = await recognizer.identifyMany(cands.map((c) => c.canvas), { allow: await allowed() });
        const k = res[0].top[0].score >= res[1].top[0].score ? 0 : 1;
        if (id !== scanId) return;
        if (mode === 'multi') toast('No separate cards found – read the photo as one card.');
        await finish(id, [{ ...cands[k], result: res[k] }]);
        return;
      }
      await recogniseAll(id, found);
    } catch (err) {
      console.error(err);
      if (id === scanId) { setStatus(`Recognition failed: ${err.message || err}`, true); scanning(false); }
    }
  }

  // A card cut out by the camera frame.
  async function scanCard(canvas) {
    const id = ++scanId;
    showPhoto(canvas);
    scanning(true);
    cards = [];
    renderList();
    try {
      setStatus('Recognising the card…');
      const W = canvas.width, H = canvas.height;
      await recogniseAll(id, [{ canvas, box: { cx: W / 2, cy: H / 2, w: W * 0.98, h: H * 0.98, angle: 0 } }]);
    } catch (err) {
      console.error(err);
      if (id === scanId) { setStatus(`Recognition failed: ${err.message || err}`, true); scanning(false); }
    }
  }

  function scanning(on) {
    $('scan-result').querySelector('.photo-wrap').classList.toggle('scanning', on);
    if (!on) navigator.vibrate?.(35);
  }

  async function allowed() {
    const pack = getPack();
    if (!pack?.prefix) return null;
    try { return await api.setCardNames(pack.prefix, pack.name); } catch { return null; }
  }

  async function recogniseAll(id, found) {
    const n = found.length;
    setStatus(`Recognising ${n} card${n > 1 ? 's' : ''}…`, false, 0);
    const res = await recognizer.identifyMany(found.map((f) => f.canvas), {
      allow: await allowed(),
      onEach: (i) => { if (id === scanId) setStatus(`Recognising ${n} card${n > 1 ? 's' : ''}…`, false, (i + 1) / n); },
    });
    if (id !== scanId) return;
    // Unsure cards: the box may include a sleeve or toploader. Try tighter cuts, keep the best.
    const unsure = found.map((f, i) => i).filter((i) => !res[i].confident && found[i].source);
    if (unsure.length) {
      setStatus('Taking a closer look at the unsure cards…');
      for (const shrink of [0.9, 0.8]) {
        const tries = unsure.map((i) => {
          const b = found[i].box;
          const box = { ...b, w: b.w * shrink, h: b.h * shrink };
          return { i, box, canvas: cutCard(found[i].source, box) };
        });
        const more = await recognizer.identifyMany(tries.map((t) => t.canvas), { allow: await allowed(), closer: false });
        if (id !== scanId) return;
        tries.forEach((t, k) => {
          if (more[k].top[0].score > res[t.i].top[0].score + 0.02) {
            res[t.i] = more[k];
            found[t.i] = { ...found[t.i], canvas: t.canvas };
          }
        });
      }
    }
    await finish(id, found.map((f, i) => ({ ...f, result: res[i] })));
  }

  async function finish(id, found) {
    const pack = getPack();
    cards = found.map((f, i) => {
      const canvas = f.result.upsideDown ? rotate180(f.canvas) : f.canvas;
      const top = f.result.top.map((t) => ({ name: t.name, score: Math.round(t.score * 1000) / 1000 }));
      return {
        n: i + 1, box: f.box, canvas, thumb: thumbOf(canvas),
        name: top[0].name, top, score: top[0].score, confident: f.result.confident,
        code: null, language: null, ocrText: null, codeStatus: 'waiting',
        pack: pack?.prefix ? { prefix: pack.prefix, name: pack.name } : null,
        emb: f.result.embedding || null,
        vkey: null, price: null, sampleId: `s${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 5)}`,
      };
    });
    await Promise.all(cards.map(async (c) => { c.price = await quickPrice(api, c); }));
    if (id !== scanId) return;
    setStatus('');
    scanning(false);
    renderList();
    readCodes(id);
  }

  // ---------- set codes (one card after the other, list updates as they come in) ----------
  async function readCodes(id) {
    let engine;
    try { engine = await getOcr(); } catch (e) { console.warn('no OCR', e); }
    for (const c of [...cards].sort((a, b) => (b.price?.hi ?? 0) - (a.price?.hi ?? 0))) {
      if (id !== scanId) return;
      if (!engine) { c.codeStatus = 'none'; continue; }
      c.codeStatus = 'reading';
      renderList();
      const info = await api.nameInfo(c.name).catch(() => null);
      let text = '';
      const passes = [
        { region: { x: 0.40, y: 0.69, w: 0.58, h: 0.085 }, binarize: true },
        { region: { x: 0.0, y: 0.66, w: 1, h: 0.15 }, binarize: true },
        { region: { x: 0.40, y: 0.69, w: 0.58, h: 0.085 } },
      ];
      for (const opts of passes) {
        try { text += `${await engine.read(prepare(c.canvas, opts))}\n`; } catch (e) { console.warn(e); break; }
        if (id !== scanId) return;
        if (matchCode(text, info?.bases)) break;
      }
      c.ocrText = text;
      c.code = matchCode(text, info?.bases);
      c.language = c.code?.language || languageFromText(text);
      c.codeStatus = c.code ? 'done' : 'none';
      c.price = await quickPrice(api, c);
      if (id !== scanId) return;
      renderList();
    }
    if (id === scanId) autoPack();
  }

  // Pack mode "detect": two cards from the same set decide it.
  async function autoPack() {
    const pack = getPack();
    if (!pack?.auto) return;
    const counts = {};
    for (const c of cards) if (c.code) { const p = c.code.base.split('-')[0]; counts[p] = (counts[p] || 0) + 1; }
    const [prefix, k] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
    if (!prefix || (k < 2 && cards.length > 1)) return;
    const sets = await api.sets().catch(() => []);
    const set = sets.filter((s) => s.prefix === prefix).sort((a, b) => b.count - a.count)[0];
    setPack({ prefix, name: set?.name || null, year: set?.year || null });
    toast(`Pack mode: ${set?.name || prefix}`);
  }

  // ---------- drawing ----------
  function showPhoto(image) {
    const W = image.naturalWidth || image.width, H = image.naturalHeight || image.height;
    const r = Math.min(1, SHOW_MAX / Math.max(W, H));
    const cv = $('photo');
    cv.width = Math.round(W * r); cv.height = Math.round(H * r);
    cv.getContext('2d').drawImage(image, 0, 0, cv.width, cv.height);
    photoSize = { W, H };
    $('scan-result').hidden = false;
    $('marks').innerHTML = '';
  }

  const tierOf = (c) => valueTier(c.price?.hi ?? c.price?.lo);
  const COLORS = { high: '#e24b4a', mid: '#ef9f27', low: '#9c9a91', unknown: '#9c9a91' };

  function renderMarks() {
    const svg = $('marks');
    if (!photoSize) return;
    svg.setAttribute('viewBox', `0 0 ${photoSize.W} ${photoSize.H}`);
    const r = Math.max(photoSize.W, photoSize.H) / 45;
    const best = [...cards].filter((c) => c.price?.hi != null).sort((a, b) => b.price.hi - a.price.hi)[0];
    const tag = (c) => {
      const p = c.price;
      if (!p || p.lo == null) return '';
      const f = (v) => (v >= 10 ? `€${Math.round(v)}` : `€${v.toFixed(2)}`);
      return Math.abs(p.hi - p.lo) < 0.005 ? f(p.lo) : `${f(p.lo)}–${f(p.hi)}`;
    };
    svg.innerHTML = cards.map((c) => {
      if (!c.box) return '';
      const pts = corners(c.box).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
      const col = COLORS[tierOf(c)];
      const t = tag(c);
      const fs = r * 1.05, tw = t.length * fs * 0.6 + fs, th = fs * 1.7;
      const ty = c.box.cy + r * 1.4;
      return `<g data-n="${c.n}" style="cursor:pointer" class="${c === best && (c.price.hi ?? 0) >= 1 ? 'best' : ''}">
        <polygon points="${pts}" stroke="${col}"/>
        <circle cx="${c.box.cx}" cy="${c.box.cy}" r="${r}" fill="${col}" stroke="#fff" stroke-width="${r / 6}"/>
        <text class="num" x="${c.box.cx}" y="${c.box.cy}" style="font-size:${r * 1.2}px">${c.n}</text>
        ${t ? `<rect class="ptag" x="${c.box.cx - tw / 2}" y="${ty}" width="${tw}" height="${th}" rx="${th / 2}"/>
        <text class="ptxt" x="${c.box.cx}" y="${ty + th / 2}" style="font-size:${fs}px">${t}</text>` : ''}</g>`;
    }).join('');
    svg.querySelectorAll('g').forEach((g) => g.addEventListener('click', () => open(Number(g.dataset.n))));
  }

  function renderList() {
    renderMarks();
    const sorted = [...cards].sort((a, b) => (b.price?.hi ?? -1) - (a.price?.hi ?? -1));
    $('found').innerHTML = sorted.map((c) => {
      const codeLine = {
        waiting: '', reading: 'reading set code…', none: 'set code not readable', done: '',
      }[c.codeStatus];
      const sub = [c.price?.label, codeLine].filter(Boolean).join(' · ');
      return `<li><button type="button" data-n="${c.n}">
        <span class="badge-num ${tierOf(c)}">${c.n}</span>
        <img class="thumb" src="${c.thumb}" alt="">
        <span class="what"><b>${esc(c.name)}</b><small>${piles ? `<span class="pile p-${pileOf(c.price)}">${PILES[pileOf(c.price)].label}</span> ` : ''}${c.confident ? '' : '<span class="unsure">check</span> '}${esc(sub)}</small></span>
        <span class="eur">${range(c.price?.lo, c.price?.hi)}${c.added ? '<small>added ✓</small>' : ''}</span>
      </button>${!c.confident && c.top?.length > 1 ? `<div class="dym"><small>Did you mean…?</small><div class="dym-row">${c.top.slice(0, 3).map((t, k) => `
        <button type="button" class="dym-c" data-n="${c.n}" data-name="${esc(t.name)}"><img data-pic="${esc(t.name)}" alt=""><span>${esc(t.name)}</span>${k === 0 ? '<em>current guess</em>' : ''}</button>`).join('')}</div></div>` : ''}</li>`;
    }).join('');
    $('found').querySelectorAll('.dym-c').forEach((b) => b.addEventListener('click', () => pick(Number(b.dataset.n), b.dataset.name)));
    fillPictures();
    $('found').querySelectorAll('li > button').forEach((b) => b.addEventListener('click', () => open(Number(b.dataset.n))));
    const lo = cards.reduce((s, c) => s + (c.price?.lo || 0), 0);
    const hi = cards.reduce((s, c) => s + (c.price?.hi || 0), 0);
    $('result-total').textContent = cards.length ? range(lo, hi) : '';
    const unsure = cards.filter((c) => !c.confident).length;
    $('result-sub').textContent = cards.length
      ? `${cards.length} card${cards.length > 1 ? 's' : ''}${unsure ? ` · ${unsure} to check` : ''} · tap a card for details`
      : '';
    $('add-all').hidden = !cards.length || cards.every((c) => c.added);
    $('share-pulls').hidden = !cards.length;
    $('sort-piles').hidden = !cards.length;
    $('sort-piles').textContent = piles ? 'Hide piles' : 'Sort into piles';
    const ps = $('pile-sum');
    ps.hidden = !piles || !cards.length;
    if (piles) {
      const n = {};
      for (const c of cards) { const k = pileOf(c.price); n[k] = (n[k] || 0) + 1; }
      ps.innerHTML = ['sell', 'keep', 'bulk', 'check'].filter((k) => n[k]).map((k) => `<span class="pile p-${k}">${n[k]} ${PILES[k].label}</span> <span>${PILES[k].hint}</span>`).join(' · ');
    }
    renderBalance(lo, hi);
    celebrate();
  }

  // Pack mode: what the pulled cards are worth against what the packs cost.
  let balanceId = 0;
  async function renderBalance(lo, hi) {
    const el = $('pack-balance');
    const pack = getPack();
    const my = ++balanceId;
    if (!cards.length || !pack?.name) { el.hidden = true; return; }
    const bp = await api.boosterPrice(pack.name).catch(() => null);
    if (my !== balanceId) return;
    if (!bp) { el.hidden = true; return; }
    const cost = bp.booster * packs;
    const pct = (v) => Math.round((v - cost) / cost * 100);
    const exact = Math.abs(hi - lo) < 0.005;
    const p = pct(lo), q = pct(hi);
    const fmt = (x) => `${x >= 0 ? '+' : ''}${x} %`;
    el.hidden = false;
    el.className = `balance ${p >= 0 ? 'win' : q >= 0 ? 'maybe' : 'loss'}`;
    el.innerHTML = `
      <div class="bal-main">
        <span class="bal-pct">${exact ? fmt(p) : `${fmt(p)} … ${fmt(q)}`}</span>
        <span class="small">pulled ${range(lo, hi)} · ${packs} pack${packs > 1 ? 's' : ''} ${eurS(cost)}</span>
      </div>
      <div class="stepper" aria-label="Packs in this photo">
        <button type="button" data-d="-1" aria-label="One pack less">−</button><b>${packs}</b><button type="button" data-d="1" aria-label="One pack more">+</button>
      </div>
      <p class="small muted bal-note">Booster ${eurS(bp.booster)}${bp.box ? ` · box ${eurS(bp.box)}` : ''} on Cardmarket (${esc(pack.name)})</p>`;
    el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
      packs = Math.max(1, Math.min(99, packs + Number(b.dataset.d)));
      renderBalance(lo, hi);
    }));
  }
  const eurS = (v) => (v == null ? '–' : `€${v.toFixed(2)}`);

  // A hit worth more than €10: let the row shine, buzz once.
  function celebrate() {
    let buzz = false;
    for (const c of cards) {
      const v = c.price?.lo ?? 0;
      if (v < 10 || celebrated.has(c.sampleId)) continue;
      celebrated.add(c.sampleId);
      buzz = true;
      const row = $('found').querySelector(`button[data-n="${c.n}"]`);
      row?.classList.add('hit');
    }
    for (const c of cards) if (celebrated.has(c.sampleId)) $('found').querySelector(`button[data-n="${c.n}"]`)?.classList.add('hit-glow');
    if (buzz && getPack()) navigator.vibrate?.([60, 40, 120]);
  }

  // "Did you mean …?": small official pictures of the candidates; one tap fixes the card.
  const pics = new Map();
  function fillPictures() {
    $('found').querySelectorAll('img[data-pic]').forEach((img) => {
      const name = img.dataset.pic;
      if (!pics.has(name)) {
        pics.set(name, api.cardDetail(name).then((rows) => {
          for (const r of rows) for (const p of r.products) if (p.image) return versionImage(p, 'preview');
          return '';
        }).catch(() => ''));
      }
      pics.get(name).then((src) => { if (src) img.src = src; else img.classList.add('none'); });
    });
  }

  async function pick(n, name) {
    const c = cards.find((x) => x.n === n);
    if (!c) return;
    const renamed = c.name !== name;
    c.name = name; c.confident = true; c.corrected = true;
    if (renamed) {
      c.vkey = null;
      const info = await api.nameInfo(name).catch(() => null);
      if (c.ocrText != null) {
        c.code = matchCode(c.ocrText, info?.bases);
        c.language = c.code?.language || languageFromText(c.ocrText);
        c.codeStatus = c.code ? 'done' : 'none';
      }
    }
    c.price = await quickPrice(api, c);
    renderList();
    navigator.vibrate?.(20);
    await onCorrect(c);
  }

  function open(n) {
    const c = cards.find((x) => x.n === n);
    if (c) onOpen(c);
  }

  // after the card page changed a card
  async function refresh(c) {
    c.price = await quickPrice(api, c);
    renderList();
  }

  function remove(c) {
    cards = cards.filter((x) => x !== c);
    renderList();
  }

  function clear() {
    scanId++;
    cards = [];
    photoSize = null;
    $('scan-result').querySelector('.photo-wrap').classList.remove('scanning');
    $('scan-result').hidden = true;
    setStatus('');
  }

  $('add-all').addEventListener('click', () => onAddAll(cards.filter((c) => !c.added)));
  $('sort-piles').addEventListener('click', () => { piles = !piles; renderList(); });
  $('share-pulls').addEventListener('click', async () => {
    if (!cards.length) return;
    const pack = getPack();
    const bal = $('pack-balance');
    const pct = !bal.hidden ? bal.querySelector('.bal-pct')?.textContent.split(' … ')[0].replace(/\s/g, ' ') : '';
    const day = new Date().toLocaleDateString(document.documentElement.lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const r = await sharePulls(cards, { title: 'My pulls', sub: pack?.name ? `${pack.name} · ${day}` : day, balance: pct || '' });
    if (r === 'downloaded') toast('Picture saved');
  });

  return { scanPhoto, scanCard, refresh, renderList, clear, remove, cards: () => cards };
}
