// Holo view: the official picture of your card's version, tilting with the phone (or your finger),
// with a shine that depends on the rarity. Also the showcase: your most valuable cards, one per swipe.

import { $, esc, eur } from './util.js';
import { versionImage } from './prices.js';

// Which effect a rarity gets.
export function holoKind(rarity) {
  const r = (rarity || '').toLowerCase();
  if (!r) return 'plain';
  if (/starlight|quarter century|25th|prismatic|grand master|pharaoh/.test(r)) return 'rainbow';
  if (/ultimate/.test(r)) return 'relief';
  if (/ghost/.test(r)) return 'ghost';
  if (/collector/.test(r)) return 'rainbow';
  if (/secret/.test(r)) return 'secret';
  if (/ultra|gold|platinum/.test(r)) return 'ultra';
  if (/super|parallel|starfoil|shatterfoil|mosaic/.test(r)) return 'super';
  if (/^rare$|short print/.test(r)) return 'rare';
  if (/common/.test(r)) return 'common';
  return 'plain';
}

let items = [], idx = 0, cleanup = null;

// list: [{name, rarity, image (CardTrader path), price}]
export function openHolo(list, start = 0) {
  items = list.filter((x) => x.image);
  if (!items.length) return;
  idx = Math.min(start, items.length - 1);
  const el = $('holo');
  el.hidden = false;
  document.body.classList.add('sheet-open');
  history.pushState({ sheet: 'holo' }, '');
  show();
  bindMotion();
}

export function closeHolo() {
  $('holo').hidden = true;
  cleanup?.();
  cleanup = null;
  document.body.classList.toggle('sheet-open', !!document.querySelector('.sheet:not([hidden])'));
}

function show() {
  const it = items[idx];
  const kind = holoKind(it.rarity);
  $('holo-stage').innerHTML = `
    <div class="holo-card k-${kind}" id="holo-card">
      <img src="${esc(versionImage(it, 'show'))}" alt="${esc(it.name)}" draggable="false">
      <div class="h-name"></div><div class="h-art"></div><div class="h-full"></div><div class="h-glare"></div>
    </div>`;
  $('holo-info').innerHTML = `<b>${esc(it.name)}</b><span>${esc(it.rarity || '')}${it.price != null ? ` · ${eur(it.price)}` : ''}</span>
    ${items.length > 1 ? `<span class="muted">${idx + 1} / ${items.length} · swipe for the next</span>` : '<span class="muted">Tilt your phone or move your finger</span>'}`;
  set(0, 0);
}

function set(x, y) { // x, y in -1..1
  const c = $('holo-card');
  if (!c) return;
  c.style.setProperty('--rx', `${(-y * 14).toFixed(2)}deg`);
  c.style.setProperty('--ry', `${(x * 18).toFixed(2)}deg`);
  c.style.setProperty('--mx', `${(50 + x * 50).toFixed(1)}%`);
  c.style.setProperty('--my', `${(50 + y * 50).toFixed(1)}%`);
  c.style.setProperty('--pos', `${(50 + x * 40 + y * 20).toFixed(1)}%`);
  c.style.setProperty('--hyp', Math.min(1, Math.hypot(x, y)).toFixed(3));
}

function bindMotion() {
  cleanup?.();
  const stage = $('holo-stage');
  let base = null, dragX = null, lastTouch = 0;
  const onOrient = (e) => {
    if (Date.now() - lastTouch < 1500 || e.beta == null) return;
    if (!base) base = { b: e.beta, g: e.gamma };
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    set(clamp((e.gamma - base.g) / 25), clamp((e.beta - base.b) / 25));
  };
  const onMove = (e) => {
    lastTouch = Date.now();
    const r = stage.getBoundingClientRect();
    set(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
  };
  const onDown = (e) => { dragX = e.clientX; };
  const onUp = (e) => {
    if (dragX != null && items.length > 1 && Math.abs(e.clientX - dragX) > 70) {
      idx = (idx + (e.clientX < dragX ? 1 : -1) + items.length) % items.length;
      show();
    }
    dragX = null;
  };
  window.addEventListener('deviceorientation', onOrient);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointerup', onUp);
  cleanup = () => {
    window.removeEventListener('deviceorientation', onOrient);
    stage.removeEventListener('pointermove', onMove);
    stage.removeEventListener('pointerdown', onDown);
    stage.removeEventListener('pointerup', onUp);
  };
}

$('holo-close').addEventListener('click', () => history.back());
