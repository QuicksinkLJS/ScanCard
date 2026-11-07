// Decks: import a deck, see which cards you have (any version or language counts) and what the rest costs.

import { $, esc, eur, toast, countTo } from './util.js';
import { fanHTML, drawHand } from './fan.js';
import { holoKind } from './holo.js';
import { normName } from './parse.js';
import { versionOptions, cardmarketUrl, versionLabel, versionImage } from './prices.js';
import { syncBody } from './cardpage.js';
import { loadCollection, newId } from './store.js';
import { parseDeck, resolveDeck, allocate, pickVersion, wantsLines } from './deck.js';

const KEY = 'cardscan-decks-v1';
const loadDecks = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const saveDecks = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* full */ } };
const DEFAULT_PREFS = { mode: 'cheap', lang: 'any', cond: 'EX', first: false };
const LANGS = [['any', 'Any language'], ['EN', 'English'], ['DE', 'German'], ['FR', 'French'], ['IT', 'Italian'], ['SP', 'Spanish'], ['PT', 'Portuguese'], ['JP', 'Japanese (OCG)'], ['KR', 'Korean']];
const CONDS = [['MT', 'Mint'], ['NM', 'Near Mint'], ['EX', 'Excellent'], ['GD', 'Good'], ['LP', 'Light Played'], ['PL', 'Played'], ['PO', 'Poor']];

function ownedByName() {
  const n = {};
  for (const e of loadCollection()) { const k = normName(e.name); n[k] = (n[k] || 0) + 1; }
  return n;
}

export function createDecks({ api, openCard }) {
  let cur = null;

  function renderList() {
    const decks = loadDecks();
    $('decks-empty').hidden = decks.length > 0;
    const owned = ownedByName();
    $('decks-list').innerHTML = decks.map((d) => {
      const a = allocate(d.cards, owned, normName);
      return `<li><button type="button" data-id="${esc(d.id)}"><span class="what"><b>${esc(d.name)}</b>
        <span class="pbar"><span style="width:${a.need ? (a.have / a.need) * 100 : 0}%"></span></span>
        <small>${a.have}/${a.need} cards · Main ${count(d.cards.main)} · Extra ${count(d.cards.extra)} · Side ${count(d.cards.side)}</small></span>
        <span class="eur">${a.need - a.have ? `${a.need - a.have} missing` : '✓'}</span></button></li>`;
    }).join('');
    $('decks-list').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => openDeck(b.dataset.id)));
  }
  const count = (rows) => (rows || []).reduce((s, r) => s + r.need, 0);

  async function importText(text, fileName) {
    const parsed = parseDeck(text);
    if (!parsed) { toast("That doesn't look like a deck."); return; }
    const needsCodes = [...parsed.main, ...parsed.extra, ...parsed.side].some((x) => typeof x === 'string');
    const pcs = needsCodes ? await api.passcodes().catch(() => null) : {};
    if (!pcs) { toast('Card list not available – try again online.'); return; }
    const cards = resolveDeck(parsed, pcs);
    const total = count(cards.main) + count(cards.extra) + count(cards.side);
    if (!total) { toast('No cards found in that deck.'); return; }
    const name = (fileName || '').replace(/\.ydk$/i, '').trim() || `Deck ${loadDecks().length + 1}`;
    const deck = { id: newId(), name, cards: { main: cards.main, extra: cards.extra, side: cards.side }, prefs: { ...DEFAULT_PREFS }, added: Date.now() };
    saveDecks([deck, ...loadDecks()]);
    $('deck-input').value = '';
    renderList();
    if (cards.unknown.length) toast(`${cards.unknown.length} card${cards.unknown.length > 1 ? 's' : ''} not recognised (too new?)`, 4000);
    openDeck(deck.id);
  }
  $('deck-import').addEventListener('click', () => importText($('deck-input').value));
  $('deck-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) importText(await f.text(), f.name);
  });

  async function openDeck(id) {
    const d = loadDecks().find((x) => x.id === id);
    if (!d) return;
    const page = $('deck-page');
    if (page.hidden) { page.hidden = false; syncBody(); history.pushState({ sheet: 'deck' }, ''); }
    page.scrollTop = 0;
    $('deck-title').textContent = d.name;
    $('deck-body').innerHTML = '<p class="note">Loading prices…</p>';
    cur = { deck: d, info: new Map(), hand: null };
    const names = [...new Set(['main', 'extra', 'side'].flatMap((p) => d.cards[p].map((r) => r.name)))];
    const [exps] = await Promise.all([
      api.expansions().catch(() => []),
      ...names.map(async (n) => { cur.info.set(n, versionOptions(await api.cardDetail(n).catch(() => []))); }),
    ]);
    cur.expName = new Map(exps.map((e) => [e.exp, e.name]));
    renderDeck();
  }

  function renderDeck() {
    const { deck, info } = cur;
    const prefs = { ...DEFAULT_PREFS, ...deck.prefs };
    const a = allocate(deck.cards, ownedByName(), normName);
    let missingValue = 0, unpriced = 0;
    const rowsOf = (part) => a[part].map((r) => {
      const pick = pickVersion(info.get(r.name) || [], prefs);
      if (r.missing) { if (pick) missingValue += pick.trend * r.missing; else unpriced++; }
      return { ...r, pick, exact: prefs.mode === 'max', expName: pick ? cur.expName.get(pick.expansion) : '' };
    });
    const parts = { main: rowsOf('main'), extra: rowsOf('extra'), side: rowsOf('side') };
    cur.rows = [...parts.main, ...parts.extra, ...parts.side];
    const section = (part, title) => (parts[part].length ? `
      <h2>${title} <span class="muted small">${count(deck.cards[part])}</span></h2>
      <ul class="rows dlist">${parts[part].map((r) => `
        <li class="${r.missing ? '' : 'have'}"><div class="row">
          <span class="cnt ${r.missing ? '' : 'ok'}">${r.have}/${r.need}</span>
          <button type="button" class="what plain" data-name="${esc(r.name)}"><b>${esc(r.name)}</b>
            <small>${r.pick ? esc([r.pick.set, prefs.mode === 'max' ? versionLabel(r.pick) : 'cheapest version'].join(' · ')) : 'no price found'}</small></button>
          ${r.pick ? `<a class="eur" href="${esc(prefs.mode === 'max' ? cardmarketUrl(r.pick, r.name) : cardmarketUrl({ expansion: null }, r.name))}" target="_blank" rel="noopener">${eur(r.pick.trend)}${r.missing ? `<small>× ${r.missing}</small>` : '<small>↗</small>'}</a>` : ''}
        </div></li>`).join('')}</ul>` : '');
    const sel = (id, list, v) => `<select id="${id}" class="field small-field">${list.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    // value and the most valuable cards (picture of the picked version, or any official one)
    const all = [...parts.main, ...parts.extra, ...parts.side];
    const deckValue = all.reduce((v, r) => v + (r.pick?.trend || 0) * r.need, 0);
    const picOf = (name, pick) => {
      const o = pick?.image ? pick : (info.get(name) || []).find((x) => x.image);
      return o ? { src: versionImage(o, 'show'), kind: holoKind(o.rarity || (o.rarities?.length === 1 ? o.rarities[0] : '')) } : null;
    };
    cur.picOf = picOf;
    const best = all.filter((r) => r.pick?.trend != null).sort((x, y) => y.pick.trend - x.pick.trend)
      .map((r) => ({ ...picOf(r.name, r.pick), name: r.name })).filter((x) => x.src).slice(0, 5);
    $('deck-body').innerHTML = `
      ${best.length >= 2 ? fanHTML(best, { cls: 'deck-fan' }) : ''}
      <div class="summary deck-sum">
        <p class="muted small">Deck value (${prefs.mode === 'max' ? 'max rarity' : 'cheapest versions'})</p>
        <p class="result-total" id="deck-value">€0.00</p>
      </div>
      <div class="actions"><button type="button" class="btn" id="deck-draw">🂠 Draw test hand</button></div>
      <div id="deck-hand"></div>
      <div class="mprog">
        <p class="big">${a.have}<span class="muted">/${a.need}</span></p>
        <span class="pbar big"><span style="width:${a.need ? (a.have / a.need) * 100 : 0}%"></span></span>
        <p class="small">${a.need === a.have ? 'You have every card of this deck 🎉' : `Missing ${a.need - a.have} · approx. <b>${eur(missingValue)}</b>${unpriced ? ` <span class="muted">(${unpriced} without price)</span>` : ''}`}</p>
      </div>
      <details class="fold" id="deck-prefs" ${cur.prefsOpen ?? !deck.prefs?.touched ? 'open' : ''}><summary>What to buy</summary>
        <div class="seg small">
          <button type="button" data-mode="cheap" class="${prefs.mode === 'cheap' ? 'on' : ''}">Cheapest</button>
          <button type="button" data-mode="max" class="${prefs.mode === 'max' ? 'on' : ''}">Max rarity</button>
        </div>
        <div class="prefs">
          <label>Language ${sel('p-lang', LANGS, prefs.lang)}</label>
          <label>Condition at least ${sel('p-cond', CONDS, prefs.cond)}</label>
          <label class="check"><input type="checkbox" id="p-first" ${prefs.first ? 'checked' : ''}> 1st Edition only</label>
        </div>
      </details>
      ${section('main', 'Main deck')}${section('extra', 'Extra deck')}${section('side', 'Side deck')}
      <p class="muted small">You count as having a card when your collection has it in any version or language. Prices are Cardmarket trend prices of the version – they don't depend on language or condition, so take them as a guide.</p>
      <button type="button" class="btn wide primary" id="deck-wants">Copy as Cardmarket wants list</button>
      <p class="muted small" id="deck-wants-note"></p>
      <button type="button" class="btn wide danger" id="deck-delete">Delete deck</button>`;
    const body = $('deck-body');
    countTo($('deck-value'), deckValue, deckValue, 900);
    body.querySelectorAll('.deck-fan .fan-card').forEach((b) => b.addEventListener('click', () => openCard({ name: best[Number(b.dataset.i)].name })));
    $('deck-draw').addEventListener('click', () => drawTest(parts.main));
    if (cur.hand) showHand();
    $('deck-prefs').addEventListener('toggle', (e) => { cur.prefsOpen = e.target.open; });
    const setPref = (patch) => {
      const decks = loadDecks().map((x) => (x.id === deck.id ? { ...x, prefs: { ...prefs, ...patch, touched: true } } : x));
      saveDecks(decks);
      cur.deck = decks.find((x) => x.id === deck.id);
      renderDeck();
    };
    body.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setPref({ mode: b.dataset.mode })));
    $('p-lang').addEventListener('change', (e) => setPref({ lang: e.target.value }));
    $('p-cond').addEventListener('change', (e) => setPref({ cond: e.target.value }));
    $('p-first').addEventListener('change', (e) => setPref({ first: e.target.checked }));
    body.querySelectorAll('[data-name]').forEach((b) => b.addEventListener('click', () => {
      const r = cur.rows.find((x) => x.name === b.dataset.name);
      openCard({ name: b.dataset.name, vkey: r?.pick && prefs.mode === 'max' ? r.pick.key : null });
    }));
    $('deck-wants').addEventListener('click', async () => {
      const text = wantsLines(cur.rows);
      if (!text) { toast('Nothing missing'); return; }
      try { await navigator.clipboard.writeText(text); toast('Wants list copied'); } catch { window.prompt('Copy this list:', text); }
      const l = LANGS.find((x) => x[0] === prefs.lang)?.[1];
      const c = CONDS.find((x) => x[0] === prefs.cond)?.[1];
      $('deck-wants-note').innerHTML = `On Cardmarket: Wants → create a list → paste into “Add a decklist”. Then set <b>${esc(l)}</b>, at least <b>${esc(c)}</b>${prefs.first ? ', <b>1st Edition</b>' : ''} for all cards with the list's bulk modification.`;
    });
    $('deck-delete').addEventListener('click', () => {
      if (!window.confirm(`Delete ${deck.name}?`)) return;
      saveDecks(loadDecks().filter((x) => x.id !== deck.id));
      history.back();
    });
  }

  // Test hand: 5 random cards of the main deck (copies count), draw again or one more.
  function drawTest(main) {
    const pool = main.map((r) => ({ name: r.name, need: r.need }));
    if (!pool.length) { toast('No main deck'); return; }
    cur.handPool = pool;
    cur.hand = drawHand(pool, 5);
    showHand();
  }
  function showHand() {
    const el = $('deck-hand');
    const total = cur.handPool.reduce((s, r) => s + r.need, 0);
    el.innerHTML = `
      <h2>Test hand <span class="muted small">${cur.hand.length} of ${total}</span></h2>
      ${fanHTML(cur.hand.map((name) => ({ ...(cur.picOf(name) || { src: '', kind: 'plain' }), name })), { cls: 'hand-fan' })}
      <ol class="hand-names small muted">${cur.hand.map((n) => `<li>${esc(n)}</li>`).join('')}</ol>
      <div class="actions">
        <button type="button" class="btn" id="hand-again">Draw again</button>
        <button type="button" class="btn" id="hand-more" ${cur.hand.length >= Math.min(total, 10) ? 'disabled' : ''}>+1 card</button>
      </div>`;
    $('deck-draw').textContent = '🂠 New test hand';
    $('hand-again').addEventListener('click', () => { cur.hand = drawHand(cur.handPool, 5); showHand(); });
    $('hand-more').addEventListener('click', () => {
      // one more from what is left in the deck
      const left = {};
      for (const r of cur.handPool) left[r.name] = r.need;
      for (const n of cur.hand) left[n]--;
      const rest = Object.entries(left).filter(([, k]) => k > 0).map(([name, need]) => ({ name, need }));
      const [next] = drawHand(rest, 1);
      if (next) { cur.hand = [...cur.hand, next]; showHand(); }
    });
    el.querySelectorAll('.fan-card').forEach((b) => b.addEventListener('click', () => openCard({ name: cur.hand[Number(b.dataset.i)] })));
  }

  function closeDeck() { $('deck-page').hidden = true; syncBody(); renderList(); }
  $('deck-back').addEventListener('click', () => history.back());
  return { renderList, closeDeck, refresh: () => { if (cur && !$('deck-page').hidden) renderDeck(); } };
}
