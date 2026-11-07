// A hand of cards, fanned out like in a card game, each with its holo shine.
// Used for the collection (most valuable cards), decks (most valuable cards) and the test hand.

import { holoCardHTML } from './holo.js';

// items: [{src, kind, name}] – the first item is the best one and goes to the middle (on top).
export function fanHTML(items, { cls = '', shine = true } = {}) {
  const n = items.length;
  if (!n) return '';
  // positions of a symmetric hand; the best card gets the middle, the next ones alternate right / left.
  // Spacing, tilt and drop come from CSS and shrink with the number of cards and the screen width (never wider than the page).
  const pos = Array.from({ length: n }, (_, j) => j - (n - 1) / 2).sort((x, y) => Math.abs(x) - Math.abs(y) || y - x);
  return `<div class="fan ${cls}" style="--n1:${Math.max(n - 1, 1)}">${items.map((it, i) => {
    const k = pos[i];
    const a = Math.abs(k);
    return `<button type="button" class="fan-card" data-i="${i}" aria-label="${it.name ? String(it.name).replace(/"/g, '&quot;') : ''}"
      style="--k:${k};--a:${a};--z:${20 - Math.round(a * 2)};--d:${i * 70}ms">
      ${holoCardHTML({ src: it.src, kind: it.kind || 'plain', alt: it.name || '', shine })}</button>`;
  }).join('')}</div>`;
}

// Fisher–Yates on a copy
export function shuffled(list, rnd = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Main deck rows [{name, need}] -> every copy once, shuffled; the first `n` are the hand.
export function drawHand(rows, n = 5, rnd = Math.random) {
  const pool = rows.flatMap((r) => Array.from({ length: r.need }, () => r.name));
  return shuffled(pool, rnd).slice(0, n);
}
