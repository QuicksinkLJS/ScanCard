// Collector quartet sheet: your card against a friend's card. You pick a category on your card, their value
// flips over, the round goes to the better value. All seven categories → final score. No sound, no confetti.

import { $, esc, eur } from './util.js';
import { syncBody } from './cardpage.js';
import { CATS, compare, score, cardCode } from './quartet.js';
import { artCrop } from './holomath.js';
import { layoutOf } from './holo.js';

let game = null;   // {me: {name, stats, pic}, them: {...}, picked: []}

const show = (cat, x) => {
  const v = x?.v;
  if (v == null) return '–';
  if (cat.fmt === 'eur') return eur(v);
  if (cat.fmt === 'pct') return `${v} %`;
  return String(v);
};

function art(src) {
  if (!src) return '<div class="qt-art empty"><span>🂠</span></div>';
  const c = artCrop(layoutOf(src));
  return `<div class="qt-art" style="aspect-ratio:${c.aspect}"><img src="${esc(src)}" alt="" draggable="false"
    style="width:${c.width}%;height:${c.height}%;left:${c.left}%;top:${c.top}%" onerror="this.remove()"></div>`;
}

function cardHTML(side, who) {
  const { stats } = side;
  const mine = who === 'me';
  const rows = CATS.map((cat) => {
    const used = game.picked.includes(cat.k);
    const r = used ? compare(cat, game.me.stats, game.them.stats) * (mine ? 1 : -1) : 0;
    const res = used ? (r > 0 ? 'win' : r < 0 ? 'lose' : 'draw') : '';
    const val = mine || used ? show(cat, stats[cat.k]) : '?';
    const sub = (mine || used) && stats[cat.k]?.name ? `<small>${esc(stats[cat.k].name)}</small>` : '';
    const inner = `<span class="qt-l">${esc(cat.label)}</span><span class="qt-v">${esc(val)}</span>${sub}`;
    return mine
      ? `<li><button type="button" class="qt-row ${res}" data-k="${cat.k}" ${used || score(game.picked, game.me.stats, game.them.stats).done ? 'disabled' : ''}>${inner}</button></li>`
      : `<li><div class="qt-row ${res} ${used ? 'flip' : ''}">${inner}</div></li>`;
  }).join('');
  return `<div class="qt-card ${who}">
      <div class="qt-head"><b>${esc(side.name)}</b><span class="qt-code">${esc(cardCode(stats.value.v || 0))}</span></div>
      ${art(side.pic)}
      <ul class="qt-rows">${rows}</ul>
    </div>`;
}

function render() {
  const s = score(game.picked, game.me.stats, game.them.stats);
  const verdict = s.done ? (s.me > s.them ? 'You win!' : s.me < s.them ? `${game.them.name} wins` : "It's a draw") : '';
  $('qt-score').innerHTML = `<span>You</span> <b>${s.me} : ${s.them}</b> <span>${esc(game.them.name)}</span>`;
  $('qt-verdict').textContent = verdict;
  $('qt-verdict').hidden = !s.done;
  $('qt-table').className = `qt-table ${s.done ? (s.me > s.them ? 'won' : s.me < s.them ? 'lost' : 'tie') : ''}`;
  $('qt-table').innerHTML = cardHTML(game.me, 'me') + cardHTML(game.them, 'them');
  $('qt-hint').textContent = s.done ? '' : game.picked.length ? `Round ${game.picked.length + 1} of ${CATS.length} – pick the next category` : 'Pick a category on your card – the better value wins the round';
  $('qt-again').hidden = !s.done;
  $('qt-table').querySelectorAll('.qt-card.me button.qt-row').forEach((b) => b.addEventListener('click', () => {
    if (game.picked.includes(b.dataset.k)) return;
    game.picked.push(b.dataset.k);
    render();
  }));
}

export function quartetLoading(name) {
  game = null;
  $('qt-title').textContent = `vs ${name}`;
  $('qt-score').innerHTML = '';
  $('qt-verdict').hidden = true;
  $('qt-again').hidden = true;
  $('qt-table').className = 'qt-table';
  $('qt-table').innerHTML = '<p class="note">Dealing the cards…</p>';
  $('qt-hint').textContent = '';
  const page = $('quartet-page');
  if (page.hidden) { page.hidden = false; syncBody(); history.pushState({ sheet: 'quartet' }, ''); }
}

// me / them: {name, stats (quartet.collectorStats), pic (picture URL of their top card)}
export function showQuartet(me, them) {
  if ($('quartet-page').hidden) return;
  game = { me, them, picked: [] };
  render();
}

// Browser back: close the sheet. Returns true when it handled the back.
export function quartetOnBack() {
  if ($('quartet-page').hidden) return false;
  $('quartet-page').hidden = true;
  game = null;
  syncBody();
  return true;
}

export function bindQuartet() {
  $('qt-back').addEventListener('click', () => history.back());
  $('qt-again').addEventListener('click', () => { if (game) { game.picked = []; render(); } });
}
