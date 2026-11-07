// Holo cards: a card picture that tilts with the phone (or the finger) and, for your own cards,
// shines the way its rarity does. Used big on the card page, full screen, and in the showcase.
//
// The shine sits where the foil is on a real card (artwork window, name bar, whole card – soft edges), and is
// laid on the picture with color-dodge: bright parts of the artwork light up in the foil's colours, dark parts
// stay calm – like real foil. Each rarity has its own pattern (rainbow, fine lines, glitter, prism, relief).

import { $, esc, eur } from './util.js';
import { versionImage } from './prices.js';

// Which effect a rarity gets.
export function holoKind(rarity) {
  const r = (rarity || '').toLowerCase();
  if (!r) return 'plain';
  if (/quarter century|25th/.test(r)) return 'qcsr';
  if (/starlight/.test(r)) return 'starlight';
  if (/prismatic/.test(r)) return 'prismatic';
  if (/grand master|pharaoh/.test(r)) return 'rainbow';
  if (/ultimate/.test(r)) return 'relief';
  if (/ghost/.test(r)) return 'ghost';
  if (/collector/.test(r)) return 'collector';
  if (/secret/.test(r)) return 'secret';
  if (/ultra|gold|platinum/.test(r)) return 'ultra';
  if (/super|parallel|starfoil|shatterfoil|mosaic/.test(r)) return 'super';
  if (/^rare$|short print/.test(r)) return 'rare';
  if (/common/.test(r)) return 'common';
  return 'plain';
}

// Where on the card each rarity shines, and how: [area, effect]. Areas have soft edges (CSS masks) and follow
// the real card layout (artwork window, name bar, whole card).
//   Rare: silver name · Super: rainbow foil artwork · Ultra: rainbow foil artwork + gold name
//   Secret: fine diagonal lines with rainbow + sparkle in the artwork, silver name · Ultimate: raised (emboss that
//   follows the light) with a matte gold metal sheen, no rainbow · Ghost: hologram shimmer on the pale picture · Starlight: the whole card glitters
//   QCSR: secret lines + glitter over the whole card · Collector's: fine prism texture · Prismatic: coarse prism texture
// 'tint' is a soft iridescent multiply layer: color-dodge cannot show on pure white or black (manga cards, ghost
// rares), the tint can.
const LOOK = {
  rare: [['name', 'silver']],
  super: [['art', 'tint'], ['art', 'rainbow']],
  ultra: [['art', 'tint'], ['art', 'rainbow'], ['name', 'gold']],
  secret: [['art', 'tint'], ['art', 'secret'], ['name', 'silver']],
  relief: [['all', 'relief'], ['all', 'gold-metal'], ['all', 'glitter-soft']],
  ghost: [['art', 'tint'], ['art', 'ghost'], ['art', 'glitter-soft']],
  starlight: [['all', 'tint'], ['all', 'glitter'], ['all', 'rainbow-soft']],
  qcsr: [['all', 'tint'], ['all', 'secret'], ['all', 'glitter']],
  rainbow: [['all', 'tint'], ['all', 'glitter'], ['all', 'rainbow-soft']],
  collector: [['art', 'tint'], ['art', 'prism-fine'], ['all', 'glitter-soft'], ['name', 'silver']],
  prismatic: [['art', 'tint'], ['art', 'prism-coarse'], ['name', 'silver']],
};
const NEEDS_PICTURE = new Set(['relief']);

// Card layouts: normal (also Link/Spell/Trap), pendulum (wider artwork), manga (Original Artwork Collection / YAC1:
// black-and-white manga style, bigger artwork window, small name top left). Manga cards are recognised from the picture.
export function layoutOf(src, layout = 'normal') {
  return /original-artwork-collection|yac1/i.test(src || '') ? 'manga' : layout;
}

// src: picture URL; kind: holoKind(); shine: false = tilt only (cards that are not yours)
// prev: picture shown before (fades out, for a soft change when a version is picked)
// layout: 'normal' | 'pendulum' | 'manga'
export function holoCardHTML({ src, kind = 'plain', shine = true, alt = '', prev = '', layout = 'normal' }) {
  const look = shine ? (LOOK[kind] || []) : [];
  return `<div class="holo-card k-${kind} lay-${layoutOf(src, layout)} ${shine ? 'shiny' : ''}">
      <img class="h-base" src="${esc(src)}" alt="${esc(alt)}" draggable="false">
      ${look.map(([area, fx]) => `<div class="h-shine a-${area} fx-${fx}">${NEEDS_PICTURE.has(fx) ? `<img class="h-pic" src="${esc(src)}" alt="" draggable="false">` : ''}<div class="h-fx"></div></div>`).join('')}
      <div class="h-glare"></div>
      ${prev && prev !== src ? `<img class="h-prev" src="${esc(prev)}" alt="" draggable="false">` : ''}
    </div>`;
}

// x, y in -1..1 (finger or phone tilt)
export function setTilt(c, x, y) {
  if (!c) return;
  c.style.setProperty('--rx', `${(-y * 14).toFixed(2)}deg`);
  c.style.setProperty('--ry', `${(x * 18).toFixed(2)}deg`);
  // the light point moves against the tilt, like a lamp above the card
  c.style.setProperty('--mx', `${(50 - x * 42).toFixed(1)}%`);
  c.style.setProperty('--my', `${(50 - y * 42).toFixed(1)}%`);
  c.style.setProperty('--pos', `${(50 + x * 40 + y * 20).toFixed(1)}%`);
  c.style.setProperty('--hyp', Math.min(1, Math.hypot(x, y)).toFixed(3));
  c.style.setProperty('--sx', `${(-x * 18).toFixed(1)}px`);
  c.style.setProperty('--sy', `${(26 - y * 12).toFixed(1)}px`);
}

// Tilt a card with the phone (only while it is on screen) and the finger. Returns a cleanup function.
// onTap: called on a short tap without dragging. onSwipe(dir): horizontal swipe (-1 / +1).
export function attachTilt(stage, { getCard = () => stage.querySelector('.holo-card'), onTap = null, onSwipe = null } = {}) {
  let base = null, lastTouch = 0, down = null, visible = false, listening = false, raf = 0, pending = null;
  const apply = () => { raf = 0; if (pending) setTilt(getCard(), pending[0], pending[1]); };
  const set = (x, y) => { pending = [x, y]; if (!raf) raf = requestAnimationFrame(apply); };
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const onOrient = (e) => {
    if (Date.now() - lastTouch < 1500 || e.beta == null) return;
    if (!base) base = { b: e.beta, g: e.gamma };
    // slowly follow the way the phone is held, so the card settles back to straight
    base.b += (e.beta - base.b) * 0.01; base.g += (e.gamma - base.g) * 0.01;
    set(clamp((e.gamma - base.g) / 22), clamp((e.beta - base.b) / 22));
  };
  const listen = (on) => {
    if (on === listening) return;
    listening = on;
    if (on) window.addEventListener('deviceorientation', onOrient);
    else { window.removeEventListener('deviceorientation', onOrient); base = null; }
  };
  const pos = (e) => {
    const r = stage.getBoundingClientRect();
    return [clamp(((e.clientX - r.left) / r.width) * 2 - 1), clamp(((e.clientY - r.top) / r.height) * 2 - 1)];
  };
  const onMove = (e) => { lastTouch = Date.now(); if (e.pointerType === 'mouse' || down) set(...pos(e)); };
  const onDown = (e) => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; lastTouch = Date.now(); set(...pos(e)); };
  const onUp = (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (onSwipe && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy)) onSwipe(dx < 0 ? 1 : -1);
    else if (onTap && Math.hypot(dx, dy) < 12 && Date.now() - down.t < 400) onTap();
    down = null;
  };
  const onLeave = () => { down = null; };
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onLeave);
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
    visible = es.some((x) => x.isIntersecting);
    listen(visible && !document.hidden);
  }) : null;
  if (io) io.observe(stage); else listen(true);
  const onVis = () => listen(visible && !document.hidden);
  document.addEventListener('visibilitychange', onVis);
  set(0, 0);
  return () => {
    listen(false);
    io?.disconnect();
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVis);
    stage.removeEventListener('pointermove', onMove);
    stage.removeEventListener('pointerdown', onDown);
    stage.removeEventListener('pointerup', onUp);
    stage.removeEventListener('pointercancel', onLeave);
  };
}

// ---------- full screen / showcase ----------
let items = [], idx = 0, cleanup = null;

// list: [{name, rarity, image (CardTrader path) | src (any picture URL), price, shine}]
export function openHolo(list, start = 0) {
  items = list.filter((x) => x.image || x.src);
  if (!items.length) return;
  idx = Math.min(start, items.length - 1);
  const el = $('holo');
  el.hidden = false;
  document.body.classList.add('sheet-open');
  history.pushState({ sheet: 'holo' }, '');
  show();
  cleanup?.();
  cleanup = attachTilt($('holo-stage'), {
    onSwipe: items.length > 1 ? (d) => { idx = (idx + d + items.length) % items.length; show(); } : null,
  });
}

export function closeHolo() {
  $('holo').hidden = true;
  cleanup?.();
  cleanup = null;
  document.body.classList.toggle('sheet-open', !!document.querySelector('.sheet:not([hidden])'));
}

function show() {
  const it = items[idx];
  const kind = it.kind || holoKind(it.rarity);
  $('holo-stage').innerHTML = holoCardHTML({ src: it.src || versionImage(it, 'show'), kind, shine: it.shine !== false, alt: it.name });
  $('holo-info').innerHTML = `<b>${esc(it.name)}</b><span>${esc(it.rarity || '')}${it.price != null ? ` · ${eur(it.price)}` : ''}</span>
    ${items.length > 1 ? `<span class="muted">${idx + 1} / ${items.length} · swipe for the next</span>` : '<span class="muted">Tilt your phone or move your finger</span>'}`;
}

$('holo-close').addEventListener('click', () => history.back());
