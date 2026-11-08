// Rarity teacher on screen: "About this rarity" (your version), "How to tell them apart" (version still open),
// both with simulated foil side by side, and the rarity guide (More › Rarity guide).

import { $, esc } from './util.js';
import { holoCardHTML, setTilt, layoutOf } from './holo.js';
import { RARITIES, GROUPS, rarityOf, rarityByKey, compareRarities, standing, standingText } from './rarities.js';
import { rarityRank } from './prices.js';
import { syncBody } from './cardpage.js';

// A plain made-up card (frame, artwork window, name bar, text box) for the guide when there is no picture.
export const BLANK_CARD = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 590 860">
<defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b2a6b"/><stop offset=".5" stop-color="#7a4fbf"/><stop offset="1" stop-color="#e0a85a"/></linearGradient>
<radialGradient id="b" cx=".5" cy=".45" r=".5"><stop offset="0" stop-color="#fff6d8"/><stop offset=".35" stop-color="#f2b25c"/><stop offset="1" stop-color="#5a2f8a" stop-opacity="0"/></radialGradient></defs>
<rect width="590" height="860" rx="18" fill="#b9733a"/><rect x="22" y="22" width="546" height="816" rx="8" fill="#c9844a"/>
<rect x="44" y="38" width="502" height="56" rx="6" fill="#e8c9a0"/><rect x="62" y="56" width="300" height="20" rx="4" fill="#6b4a2a"/>
<rect x="68" y="154" width="454" height="454" fill="url(#a)"/><circle cx="295" cy="370" r="170" fill="url(#b)"/>
<path d="M200 520 L295 250 L390 520 Z" fill="#fff" opacity=".35"/>
<rect x="44" y="632" width="502" height="180" rx="6" fill="#efdcc0"/>
<g fill="#b49a78"><rect x="64" y="660" width="420" height="12"/><rect x="64" y="690" width="460" height="12"/><rect x="64" y="720" width="380" height="12"/><rect x="64" y="750" width="300" height="12"/></g></svg>`)}`;

// Foil demo: one small tilting card per rarity, all moving together (finger, or a slow sway by themselves).
function demoHTML(list, src) {
  const pic = src || BLANK_CARD;
  return `<div class="rar-demo" data-n="${list.length}">${list.map((r) => `<figure class="rar-d">
    <div class="rar-stage">${holoCardHTML({ src: pic, kind: r.look, shine: true, alt: '', layout: layoutOf(pic) })}</div>
    <figcaption>${esc(r.short)}</figcaption></figure>`).join('')}</div>
    <p class="small muted rar-sim">Simulated foil – tilt or touch. The real card looks a little different.</p>`;
}
function animateDemos(root) {
  root.querySelectorAll('.rar-demo').forEach((row) => {
    if (row._anim) return;
    row._anim = true;
    let touched = 0;
    const cards = () => row.querySelectorAll('.holo-card');
    const move = (e) => {
      const r = row.getBoundingClientRect();
      touched = Date.now();
      const x = ((e.clientX - r.left) / r.width) * 2 - 1, y = ((e.clientY - r.top) / r.height) * 2 - 1;
      cards().forEach((c) => setTilt(c, Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y))));
    };
    row.addEventListener('pointermove', move);
    row.addEventListener('pointerdown', move);
    const t0 = performance.now();
    const tick = (now) => {
      if (!row.isConnected) return;
      if (Date.now() - touched > 1500) {
        const s = (now - t0) / 1000;
        cards().forEach((c) => setTilt(c, Math.sin(s * 0.9) * 0.8, Math.cos(s * 0.7) * 0.35));
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const facts = (r) => `<dl class="rar-facts">
  <dt>Name</dt><dd>${esc(r.name_)}</dd>
  <dt>Artwork</dt><dd>${esc(r.art)}</dd>
  ${r.more ? `<dt>Also</dt><dd>${esc(r.more)}</dd>` : ''}
  <dt>Quick check</dt><dd><b>${esc(r.tell)}</b></dd>
  <dt>Where</dt><dd>${esc(r.since)}${r.ocg ? ' · Japanese / Asian prints' : ''}</dd>
</dl>`;

let openState = { about: false, tell: true };   // stays across re-renders of the card page

// The box on the card page. chosen: the version (or null); ranked: all versions; open: rarity names still in
// question (version not picked); src: the card picture for the demo.
export function rarityBoxHTML({ chosen, ranked, open = [], src = '' }) {
  if (chosen) {
    const name = chosen.rarity || (chosen.variants <= 1 && chosen.rarities?.length === 1 ? chosen.rarities[0] : '');
    const r = rarityOf(name);
    if (!r) return '';
    const st = standingText(standing(ranked, chosen, rarityRank));
    const mixed = r.confuse.map(rarityByKey).filter(Boolean);
    return `<details class="fold rar-box" id="rar-box" ${openState.about ? 'open' : ''}>
      <summary><span class="rar-badge k-${esc(r.look)}">${esc(r.short)}</span> About this rarity: <b>${esc(r.name)}</b>${st ? `<small class="rar-st">${esc(st)}</small>` : ''}</summary>
      ${facts(r)}
      ${mixed.length ? `<p class="small">Often mixed up with: ${mixed.map((m) => `<button type="button" class="chip rar-cmp" data-k="${esc(m.key)}">${esc(m.name)}</button>`).join(' ')}</p>
        <div id="rar-cmp-box"></div>` : ''}
      ${demoHTML([r], src)}
      <button type="button" class="link rar-guide-open">All rarities ›</button>
    </details>`;
  }
  const c = compareRarities(open);
  if (c.list.length < 2 || c.list.length > 4) return '';
  // "Mine is this one" passes the rarity name as the data writes it (that is what the quick pick filters by)
  c.dataName = new Map(open.map((n) => [rarityOf(n)?.key, n]));
  return `<details class="fold rar-box rar-tell" id="rar-box" ${openState.tell ? 'open' : ''}>
    <summary>How to tell ${c.list.map((r) => esc(r.short)).join(' / ')} apart</summary>
    ${tableHTML(c, true)}
    ${demoHTML(c.list, src)}
    <button type="button" class="link rar-guide-open">All rarities ›</button>
  </details>`;
}
function tableHTML(c, pick) {
  return `<div class="rar-table" style="--n:${c.list.length}">
    <div class="rt-h"></div>${c.list.map((r) => `<div class="rt-h"><span class="rar-badge k-${esc(r.look)}">${esc(r.short)}</span><b>${esc(r.name)}</b></div>`).join('')}
    ${c.rows.map((row) => `<div class="rt-l">${esc(row.label)}</div>${row.values.map((v) => `<div class="rt-v">${esc(v)}</div>`).join('')}`).join('')}
    ${pick ? `<div class="rt-l"></div>${c.list.map((r) => `<div class="rt-v"><button type="button" class="btn small-btn rar-mine" data-name="${esc(c.dataName?.get(r.key) || r.name)}">Mine is this one</button></div>`).join('')}` : ''}
  </div>`;
}

// onPick(rarityName): "Mine is this one"
export function bindRarityBox({ onPick, src = '' } = {}) {
  const box = $('rar-box');
  if (!box) return;
  box.addEventListener('toggle', () => { if (box.classList.contains('rar-tell')) openState.tell = box.open; else openState.about = box.open; if (box.open) animateDemos(box); });
  if (box.open) animateDemos(box);
  box.querySelectorAll('.rar-mine').forEach((b) => b.addEventListener('click', () => onPick?.(b.dataset.name)));
  box.querySelectorAll('.rar-guide-open').forEach((b) => b.addEventListener('click', () => openRarityGuide(src)));
  box.querySelectorAll('.rar-cmp').forEach((b) => b.addEventListener('click', () => {
    const r = rarityOf(box.querySelector('summary b')?.textContent || '');
    const other = rarityByKey(b.dataset.k);
    const on = b.classList.toggle('on');
    box.querySelectorAll('.rar-cmp').forEach((x) => { if (x !== b) x.classList.remove('on'); });
    const c = compareRarities([r?.name, other?.name].filter(Boolean));
    $('rar-cmp-box').innerHTML = on ? tableHTML(c, false) + demoHTML(c.list, src) : '';
    animateDemos($('rar-cmp-box'));
  }));
}

// ---------- the guide ----------
export function openRarityGuide(src = '') {
  const page = $('rarity-page');
  if (!page.hidden) return;
  const pic = src || BLANK_CARD;
  $('rg-body').innerHTML = `<p class="small muted">What each rarity looks like and how to tell it apart. Tap one to see its foil – simulated on ${src ? 'this card' : 'a sample card'}.</p>
    ${Object.entries(GROUPS).map(([g, title]) => `<h2>${esc(title)}</h2>
      <div class="rg-list">${RARITIES.filter((r) => r.group === g).map((r) => `<details class="fold rg-item" data-k="${esc(r.key)}">
        <summary><span class="rar-badge k-${esc(r.look)}">${esc(r.short)}</span> ${esc(r.name)}${r.ocg ? ' <small class="muted">Japan</small>' : ''}</summary>
        ${facts(r)}
        ${r.confuse.length ? `<p class="small muted">Often mixed up with: ${esc(r.confuse.map((k) => rarityByKey(k)?.name).filter(Boolean).join(', '))}</p>` : ''}
        <div class="rg-demo"></div>
      </details>`).join('')}</div>`).join('')}
    <p class="small muted">Sources: TCGplayer, Yugipedia and collector guides (Nov 2026). Details can differ between sets and years.</p>`;
  $('rg-body').querySelectorAll('.rg-item').forEach((d) => d.addEventListener('toggle', () => {
    if (!d.open) return;
    const slot = d.querySelector('.rg-demo');
    if (!slot.innerHTML) { slot.innerHTML = demoHTML([rarityByKey(d.dataset.k)], pic); animateDemos(slot); }
  }));
  page.hidden = false;
  page.scrollTop = 0;
  syncBody();
  history.pushState({ sheet: 'rarity' }, '');
}
export function rarityGuideOnBack() {
  if ($('rarity-page').hidden) return false;
  $('rarity-page').hidden = true;
  $('rg-body').innerHTML = '';
  syncBody();
  return true;
}
export function bindRarityGuide() {
  $('rg-back').addEventListener('click', () => history.back());
  $('rg-open')?.addEventListener('click', () => openRarityGuide());
}
