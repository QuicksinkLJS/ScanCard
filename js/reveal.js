// Pack opening: the scanned cards face down, tap to turn one after the other, the most valuable last.
// A hit gets a golden light sweep, a frame in its rarity colour and a "ba-dum" buzz;
// a card that is missing in a tracked masterset gets a longer pulse (longest when it completes the set).

import { esc, range } from './util.js';
import { versionImage } from './prices.js';
import { holoKind } from './holo.js';
import { loadTracked, ownedCounts } from './masters.js';

const RCLASS = { rainbow: 'r-rainbow', starlight: 'r-rainbow', qcsr: 'r-rainbow', prismatic: 'r-rainbow', collector: 'r-rainbow', secret: 'r-secret', ghost: 'r-secret', ultra: 'r-ultra', relief: 'r-ultra', super: 'r-super', rare: 'r-rare', common: 'r-common', plain: 'r-common' };
const HIT = 10; // € (lowest price) that counts as a hit

const buzz = (p) => { try { navigator.vibrate?.(p); } catch { /* ignore */ } };

// What the card means for the tracked mastersets: {set, complete} or null
async function masterNews(api, c) {
  if (!c.vkey) return null;
  const tracked = loadTracked();
  if (!tracked.length) return null;
  const { all } = ownedCounts();
  for (const t of tracked) {
    const entries = await api.setEntries(t.exp).catch(() => []);
    const e = entries.find((x) => x.key === String(c.vkey));
    if (!e) continue;
    const target = t.target || 1;
    if ((all[e.key] || 0) >= target) continue;
    const missing = entries.reduce((n, x) => n + Math.max(0, target - (all[x.key] || 0)), 0);
    return { set: t.name, complete: missing === 1 };
  }
  return null;
}

function pictureOf(c) {
  if (c.price?.exact && c.price?.image) return versionImage({ image: c.price.image }, 'show');
  if (c.canvas && !c.bigPic) { try { c.bigPic = c.canvas.toDataURL('image/jpeg', 0.9); } catch { /* ignore */ } }
  return c.bigPic || c.thumb || '';
}

export async function openReveal(api, cards, { onDone = () => {} } = {}) {
  const order = [...cards].sort((a, b) => (a.price?.hi ?? 0) - (b.price?.hi ?? 0)); // most valuable last
  if (!order.length) return;
  const news = await Promise.all(order.map((c) => masterNews(api, c)));
  const wrap = document.createElement('div');
  wrap.className = 'reveal';
  wrap.innerHTML = `<button type="button" class="btn reveal-skip">Skip</button>
    <p class="reveal-count"></p>
    <div class="reveal-stage"></div>
    <div class="reveal-info"></div>
    <p class="muted small reveal-hint">Tap the card</p>`;
  document.body.append(wrap);
  document.body.classList.add('sheet-open');
  let i = -1, turned = false;
  const stage = wrap.querySelector('.reveal-stage');
  const info = wrap.querySelector('.reveal-info');

  function close() {
    wrap.remove();
    document.body.classList.toggle('sheet-open', !!document.querySelector('.sheet:not([hidden])'));
    onDone();
  }

  function next() {
    i++;
    turned = false;
    if (i >= order.length) return summary();
    const c = order[i];
    const kind = c.price?.exact ? holoKind(c.price.rarity) : 'plain';
    stage.innerHTML = `<div class="rv-card enter">
        <div class="rv-face rv-back"><span>CardScan</span></div>
        <div class="rv-face rv-front ${RCLASS[kind] || ''}">${pictureOf(c) ? `<img src="${esc(pictureOf(c))}" alt="" draggable="false">` : `<span class="rv-noimg">${esc(c.name)}</span>`}<i class="rv-sweep"></i></div>
      </div>`;
    info.innerHTML = '';
    wrap.querySelector('.reveal-count').textContent = `${i + 1} / ${order.length}`;
    wrap.querySelector('.reveal-hint').textContent = i === order.length - 1 && order.length > 1 ? 'The last one – your best card' : 'Tap the card';
  }

  function turn() {
    const c = order[i];
    const card = stage.querySelector('.rv-card');
    turned = true;
    card.classList.remove('enter');
    card.classList.add('turned');
    // a sure hit, or the best card of the pack when it could be one (version still open)
    const hit = (c.price?.lo ?? 0) >= HIT || (i === order.length - 1 && (c.price?.hi ?? 0) >= HIT * 2);
    const n = news[i];
    setTimeout(() => {
      if (n || hit) card.classList.add('hit');
      if (n?.complete) { card.classList.add('complete'); buzz([60, 60, 60, 60, 60, 60, 400]); }
      else if (n) buzz([60, 70, 160, 70, 60]);
      else if (hit) buzz([45, 70, 110]); // ba-dum
      else buzz(15);
    }, 380);
    info.innerHTML = `<b>${esc(c.name)}</b><span class="eur">${range(c.price?.lo, c.price?.hi)}</span>
      ${c.price?.exact && c.price?.rarity ? `<span class="muted small">${esc(c.price.rarity)}</span>` : ''}
      ${n ? `<span class="rv-news ${n.complete ? 'done' : ''}">${n.complete ? `Masterset complete: ${esc(n.set)}!` : `Missing in your masterset ${esc(n.set)}`}</span>` : ''}`;
    wrap.querySelector('.reveal-hint').textContent = i < order.length - 1 ? 'Tap for the next card' : 'Tap to finish';
  }

  function summary() {
    const lo = order.reduce((s, c) => s + (c.price?.lo || 0), 0);
    const hi = order.reduce((s, c) => s + (c.price?.hi || 0), 0);
    const best = order[order.length - 1];
    stage.innerHTML = `<div class="rv-sum"><p class="muted">${order.length} card${order.length > 1 ? 's' : ''} opened</p>
      <p class="big">${range(lo, hi)}</p><p class="small">Best: <b>${esc(best.name)}</b> ${range(best.price?.lo, best.price?.hi)}</p></div>`;
    info.innerHTML = '';
    wrap.querySelector('.reveal-count').textContent = '';
    wrap.querySelector('.reveal-hint').textContent = 'Tap to close';
    i = order.length + 1;
  }

  wrap.addEventListener('click', (e) => {
    if (e.target.closest('.reveal-skip')) { close(); return; }
    if (i > order.length) { close(); return; }
    if (!turned) turn(); else next();
  });
  next();
  return { close };
}
