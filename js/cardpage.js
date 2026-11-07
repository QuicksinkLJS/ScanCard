// The card page: prices of one card, its versions, corrections.
//
// subject = {
//   name, thumb, top: [{name, score}], confident, score,
//   code: {code, base, lang, language, read} | null   (set code read on the card)
//   language: {code, name, supported} | null           (language read on the card)
//   ocrText, vkey (chosen version = Cardmarket product id), pack: {prefix, name} | null, collId
// }
// hooks = { onChange(subject), onAdd(subject), onRemove(subject), addLabel }

import { $, esc, eur, range } from './util.js';
import { cardmarketSearchUrl, normName } from './parse.js';
import { matchCode } from './codematch.js';
import { versionOptions, rankOptions, bestOptions, priceOf, tierOfPrice, oddValues, optionCode } from './prices.js';

let api = null;
let current = null; // {subject, hooks, info, ranked, showAll}
let allNamesCache = null;

export function initCardPage(theApi) {
  api = theApi;
  $('card-back').addEventListener('click', () => history.back());
}

export function closeCardPage() {
  $('card-page').hidden = true;
  current = null;
  syncBody();
}

export function syncBody() {
  document.body.classList.toggle('sheet-open', !$('card-page').hidden || !$('pack-page').hidden);
}

export async function openCardPage(subject, hooks = {}) {
  const page = $('card-page');
  const wasOpen = !page.hidden;
  page.hidden = false;
  syncBody();
  if (!wasOpen) history.pushState({ sheet: 'card' }, '');
  page.scrollTop = 0;
  $('card-body').innerHTML = '<p class="note">Loading prices…</p>';
  current = { subject, hooks, showAll: false };
  await loadCard();
}

// (Re)load everything that depends on the card name.
async function loadCard() {
  const cur = current;
  const s = cur.subject;
  const [info, rows] = await Promise.all([
    api.nameInfo(s.name).catch(() => null),
    api.cardDetail(s.name).catch(() => []),
  ]);
  if (cur !== current) return;
  cur.info = info;
  // the code read on the card may belong to the new name now
  if (s.ocrText && info?.bases?.length) {
    const m = matchCode(s.ocrText, info.bases);
    s.code = m;
  } else if (s.ocrText) {
    s.code = null;
  }
  cur.ranked = rankOptions(versionOptions(rows), { code: s.code, pack: s.pack, vkey: s.vkey });
  if (s.vkey && !cur.ranked.some((o) => o.key === s.vkey)) s.vkey = null;
  if (!s.vkey) {
    const best = bestOptions(cur.ranked);
    if (best.length === 1) s.vkey = best[0].key;
  }
  render();
}

// What the price box shows: the chosen version, else the likely ones, else everything.
export function summarise(ranked, vkey) {
  const chosen = vkey ? ranked.find((o) => o.key === vkey) : null;
  if (chosen) return { chosen, price: priceOf([chosen]) };
  const best = bestOptions(ranked);
  return { chosen: null, best, price: priceOf(best.length ? best : ranked) };
}

function banBadges(info) {
  if (!info) return '';
  const b = info.ban || {};
  const one = (game, v) => (v ? `<span class="badge ban-${esc(v.replace(/\s+/g, '-'))}">${game}: ${esc(v)}</span>` : `<span class="badge ok">${game}: Unlimited</span>`);
  return one('TCG', b.tcg) + one('OCG', b.ocg);
}

function render() {
  const { subject: s, info, ranked, hooks } = current;
  const { chosen, best, price } = summarise(ranked, s.vkey);
  const tier = tierOfPrice(price);
  const lang = s.code?.language || s.language;

  let priceBox;
  if (chosen) {
    const odd = oddValues(chosen);
    const cell = (k, label) => `<div class="${odd.has(k) ? 'odd' : ''}"><small>${label}</small><b>${eur(chosen[k])}</b></div>`;
    priceBox = `
      <div class="pricebox ${tier}">
        <p class="what">${esc(chosen.set)}${chosen.year ? ` (${chosen.year})` : ''} · ${esc(optionCode(chosen, lang?.code))}${chosen.variants > 1 ? ` · version ${chosen.variant} of ${chosen.variants}` : ''}</p>
        <p class="big">${eur(chosen.trend)}</p>
        <p class="what">Cardmarket trend price · offers from ${eur(chosen.low)}</p>
        <div class="pgrid">${cell('avg1', 'Yesterday')}${cell('avg7', '7 days')}${cell('avg30', '30 days')}${cell('trend', 'Trend')}</div>
        ${odd.size ? '<p class="note warn">⚠ marks a value far from the others – usually one unusual sale.</p>' : ''}
      </div>`;
  } else if (ranked.length) {
    const n = best.length || ranked.length;
    priceBox = `
      <div class="pricebox ${tier}">
        <p class="what">${best.length ? `${n} version${n > 1 ? 's' : ''} fit${n > 1 ? '' : 's'} the set code` : `${n} versions on Cardmarket`}</p>
        <p class="big">${range(price.lo, price.hi)}</p>
        <p class="what">Pick your version below for the exact price.</p>
      </div>`;
  } else {
    priceBox = '<div class="pricebox"><p class="what">No Cardmarket price found. This is often a card only printed in Japan or Korea.</p></div>';
  }

  const notes = [];
  if (s.code) notes.push(`Set code read on the card: <b>${esc(s.code.code)}</b>${s.code.distance ? ` (read as ${esc(s.code.read)})` : ''}.`);
  else if (s.ocrText != null) notes.push('Set code not readable on the photo – choose the version yourself.');
  if (lang && !lang.supported) notes.push(`${esc(lang.name)} print. Cardmarket sells almost only European prints, so the prices are those of the European print of the same card – check before buying or selling.`);
  if (s.pack) notes.push(`Pack mode: ${esc(s.pack.name || s.pack.prefix)}.`);

  const list = current.showAll ? ranked : ranked.slice(0, 8);
  const versions = list.map((o) => `
    <li class="${o.key === s.vkey ? 'on' : ''}"><button type="button" data-key="${esc(o.key)}">
      <span class="radio"></span>
      <span class="what">${esc(o.set)}${o.year ? ` (${o.year})` : ''}${o.likely ? '<span class="likely">LIKELY</span>' : ''}
        <small>${esc(optionCode(o, lang?.code))}${o.rarities.length ? ` · ${esc(o.rarities.join(' / '))}` : ''}${o.variants > 1 ? ` · version ${o.variant} of ${o.variants}` : ''}</small></span>
      <span class="eur">${eur(o.trend)}</span>
    </button></li>`).join('');

  const alts = (s.top || []).filter((a) => normName(a.name) !== normName(s.name)).slice(0, 5);
  const sub = s.top ? (s.confident === false ? '<span class="unsure">Not sure</span> – check the name, or pick the right card below' : 'Recognised from the artwork') : '';

  $('card-bar-title').textContent = s.name;
  $('card-body').innerHTML = `
    <div class="card-head">
      ${s.thumb ? `<img src="${s.thumb}" alt="">` : ''}
      <div>
        <p class="name">${esc(info?.name || s.name)}</p>
        <p class="small muted">${sub}</p>
        <div class="badges">${lang ? `<span class="badge">${esc(lang.name)}</span>` : ''}${banBadges(info)}</div>
      </div>
    </div>
    ${priceBox}
    ${notes.map((n) => `<p class="note">${n}</p>`).join('')}
    ${ranked.length ? `<h2>Which version do you have?</h2><ul class="versions">${versions}</ul>` : ''}
    ${ranked.length > 8 && !current.showAll ? `<button type="button" class="link more-btn" id="show-all">Show all ${ranked.length} versions</button>` : ''}
    <h2>Wrong card?</h2>
    ${alts.length ? `<div class="alts">${alts.map((a) => `<button type="button" class="chip alt" data-name="${esc(a.name)}">${esc(a.name)}</button>`).join('')}</div>` : ''}
    <input id="fix-name" class="field" type="search" placeholder="Type the right name" autocomplete="off" spellcheck="false">
    <ul id="fix-results" class="rows compact"></ul>
    <div class="actions">
      <a class="btn" href="${cardmarketSearchUrl(info?.name || s.name)}" target="_blank" rel="noopener">Open on Cardmarket</a>
      ${hooks.onAdd ? `<button class="btn primary" type="button" id="card-add">${esc(hooks.addLabel?.(s) || 'Add to collection')}</button>` : ''}
    </div>
    ${hooks.onRemove ? '<button class="btn wide danger" type="button" id="card-remove">Remove from collection</button>' : ''}
  `;

  $('card-body').querySelectorAll('.versions button').forEach((b) => b.addEventListener('click', () => {
    s.vkey = s.vkey === b.dataset.key ? null : b.dataset.key;
    hooks.onChange?.(s, current);
    render();
  }));
  $('show-all')?.addEventListener('click', () => { current.showAll = true; render(); });
  $('card-body').querySelectorAll('.alt').forEach((b) => b.addEventListener('click', () => rename(b.dataset.name)));
  $('card-add')?.addEventListener('click', () => { hooks.onAdd(s, current); render(); });
  $('card-remove')?.addEventListener('click', () => { hooks.onRemove(s); history.back(); });
  const input = $('fix-name');
  input.addEventListener('input', () => searchNames(input.value, $('fix-results'), (name) => rename(name)));
}

async function rename(name) {
  const s = current.subject;
  s.name = name;
  s.vkey = null;
  s.confident = true;
  s.corrected = true;
  current.showAll = false;
  $('card-body').innerHTML = '<p class="note">Loading prices…</p>';
  await loadCard();
  current?.hooks.onChange?.(s, current);
}

// Name search used on the card page and in "More".
export async function searchNames(q, ul, onPick, limit = 8) {
  const query = normName(q);
  if (query.length < 2) { ul.innerHTML = ''; return; }
  if (!allNamesCache) allNamesCache = (await api.allNames()).map((n) => [normName(n), n]);
  const starts = [], contains = [];
  for (const [k, n] of allNamesCache) {
    if (k.startsWith(query)) starts.push(n);
    else if (contains.length < 200 && k.includes(query)) contains.push(n);
  }
  const byLen = (a, b) => a.length - b.length || a.localeCompare(b);
  const hits = [...starts.sort(byLen), ...contains.sort(byLen)].slice(0, limit);
  ul.innerHTML = hits.map((n) => `<li><button type="button" data-name="${esc(n)}"><span class="what"><b>${esc(n)}</b></span></button></li>`).join('')
    || '<li><div class="row muted small">No card with that name.</div></li>';
  ul.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { ul.innerHTML = ''; onPick(b.dataset.name); }));
}

// Price of a subject without opening the page (used for lists): {lo, hi, exact, setName, code}
export async function quickPrice(theApi, s) {
  const rows = await theApi.cardDetail(s.name).catch(() => []);
  const ranked = rankOptions(versionOptions(rows), { code: s.code, pack: s.pack });
  if (s.vkey && !ranked.some((o) => o.key === s.vkey)) s.vkey = null;
  if (!s.vkey) {
    const best = bestOptions(ranked);
    if (best.length === 1) s.vkey = best[0].key;
  }
  const { chosen, best, price } = summarise(ranked, s.vkey);
  const lang = s.code?.language || s.language;
  const label = chosen
    ? `${chosen.set}${chosen.year ? ` (${chosen.year})` : ''} · ${optionCode(chosen, lang?.code)}`
    : best?.length ? `${best[0].set} · ${best.length} versions` : (ranked.length ? `${ranked.length} versions` : 'no price found');
  return { ...price, label, exact: !!chosen };
}
