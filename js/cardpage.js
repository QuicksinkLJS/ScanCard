// The card page: prices of one card, its versions, corrections.
//
// subject = {
//   name, thumb, top: [{name, score}], confident, score,
//   code: {code, base, lang, language, read} | null   (set code read on the card)
//   language: {code, name, supported} | null           (language read on the card)
//   ocrText, vkey (chosen version = Cardmarket product id), pack: {prefix, name} | null, collId
// }
// hooks = { onChange(subject), onAdd(subject), onRemove(subject), addLabel }

import { $, esc, eur, range, toast } from './util.js';
import { cardmarketSearchUrl, normName } from './parse.js';
import { matchCode } from './codematch.js';
import { openHolo, holoCardHTML, holoKind, attachTilt, layoutOf } from './holo.js';
import { findWatch, toggleWatch, findWish, toggleWish, restoreWish, restoreWatch, setWatchTarget, updateWish } from './lists.js';
import { CONDS, LANGS, hasFirstEdition, copyText, langOf } from './copy.js';
import { openTiltScan } from './tiltui.js';
import { openHologram } from './hologram.js';
import { openLiving, livingPicture } from './living.js';
import { openSummon } from './summon.js';
import { lifeOf, TAGS, NOTE_MAX } from './life.js';
import { openPassport } from './passui.js';
import { passesFor } from './passstore.js';
import { tiltRank } from './tilt.js';
import { autoPick, certainty, quickChoices, narrow, pickLabel, rarityGuesses, shortRarity, fitsLang } from './sure.js';
import { rarityBoxHTML, bindRarityBox } from './rarityui.js';
import { rarityOf } from './rarities.js';
import { rarityQuery, fairTrend, filterOptions, versionOptions, rankOptions, bestOptions, priceOf, tierOfPrice, oddValues, optionCode, versionLabel, cardmarketUrl, versionImage, historyOf } from './prices.js';

let api = null;
let current = null; // {subject, hooks, info, ranked, showAll}
let allNamesCache = null;

export function initCardPage(theApi) {
  api = theApi;
  $('card-back').addEventListener('click', () => history.back());
}

let holoCleanup = null, lastHolo = null;

// The official version that fits best (for pictures while the version is still open).
export function likeliest(chosen, best, ranked) {
  return chosen?.image ? chosen : [...(best || []), ...(ranked || [])].find((o) => o.image) || null;
}

// The picture for the big tilting card: the official one of your version, or of the likeliest version; else your photo.
function holoOf(s, chosen, own, guess = null) {
  if (chosen?.image) return { src: versionImage(chosen, 'show'), kind: holoKind(chosen.rarity || versionLabel(chosen)), shine: own, official: true };
  if (guess?.image) return { src: versionImage(guess, 'show'), kind: 'plain', shine: own, official: true };
  if (!own) return null;
  if (s.canvas && !s.bigPic) { try { s.bigPic = s.canvas.toDataURL('image/jpeg', 0.9); } catch { /* tainted */ } }
  const src = s.bigPic || s.thumb;
  return src ? { src, kind: 'plain', shine: true, official: false } : null;
}

// ---------- your copy / what you look for: condition, language, 1st Edition ----------
let openBox = null; // keeps a box open across re-renders
const opt = (list, v, first) => `${first}${list.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}`;
const NOTE_PRICE = '<p class="small muted">Prices are per version – condition and language don\'t change them.</p>';
const NOTE_OCG = '<p class="small muted">OCG prints (Japanese, Korean, Asian English) have no 1st Edition.</p>';
function copyBoxes(s, chosen, hooks) {
  let out = '';
  if (hooks.own) {
    const lang = langOf(s);
    const first = hasFirstEdition({ lang, option: chosen });
    out += `<details class="fold copy-box" id="copy-own" ${openBox === 'own' ? 'open' : ''}>
      <summary>Your copy <span class="muted small">${esc(copyText(s) || 'condition, language, 1st Edition')}</span></summary>
      <div class="prefs">
        <label>Condition <select id="own-cond" class="field small-field">${opt(CONDS, s.cond || '', '<option value="">Not set</option>')}</select></label>
        <label>Language <select id="own-lang" class="field small-field">${opt(LANGS, lang, '<option value="">Not set</option>')}</select></label>
        ${first ? `<label>Edition <select id="own-first" class="field small-field">
          <option value="" ${s.first == null ? 'selected' : ''}>Not set</option><option value="1" ${s.first === true ? 'selected' : ''}>1st Edition</option><option value="0" ${s.first === false ? 'selected' : ''}>Unlimited</option></select></label>` : NOTE_OCG}
      </div>${NOTE_PRICE}</details>`;
  }
  const w = findWish(s);
  if (w) {
    const first = hasFirstEdition({ lang: w.lang, option: chosen });
    out += `<details class="fold copy-box" id="copy-wish" ${openBox === 'wish' ? 'open' : ''}>
      <summary>Looking for <span class="muted small">${esc(copyText(w, { wish: true }) || 'any copy')}</span></summary>
      <div class="prefs">
        <label>Condition at least <select id="wish-cond" class="field small-field">${opt(CONDS, w.cond || '', '<option value="">Any</option>')}</select></label>
        <label>Language <select id="wish-lang" class="field small-field">${opt(LANGS, w.lang || 'any', '<option value="any">Any language</option>')}</select></label>
        ${first ? `<label class="check"><input type="checkbox" id="wish-first" ${w.first === true ? 'checked' : ''}> 1st Edition only</label>` : NOTE_OCG}
      </div>${NOTE_PRICE}</details>`;
  }
  return out;
}

// ---------- version certainty: how sure, 2–3 versions to tap, quick pick (language, rarity, 1st Edition) ----------
const LANG_CHIP = { EN: 'EN', DE: 'DE', FR: 'FR', IT: 'IT', SP: 'ES', PT: 'PT', JP: 'JP', KR: 'KR', AE: 'AE' };
const LEVEL = {
  picked: ['✓ Version: your pick', 3], sure: ['✓ Version: sure', 3], check: ['Version: please confirm', 2],
  few: ['Version: tap yours', 2], open: ['Version: not sure', 1],
};
function versionBox(s, ranked, rq) {
  const c = certainty(ranked, s, { rarity: rq });
  if (c.level === 'none') return '';
  const [title, bars] = LEVEL[c.level];
  const lang = langOf(s);
  const g = rarityGuesses(ranked);
  const tile = (o) => `<button type="button" class="vs-pick" data-key="${esc(o.key)}">
      ${o.image ? `<img loading="lazy" src="${esc(versionImage(o, 'preview'))}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'vs-noimg',textContent:'?'}))">` : `<span class="vs-noimg">${esc(shortRarity(o.rarity || g.get(o.key) || '') || '?')}</span>`}
      <span class="vs-set">${esc(o.set)}${o.year ? ` (${o.year})` : ''}</span>
      <small>${esc(optionCode(o, lang) || '')}</small>
      <small class="vs-rar">${esc(pickLabel(o, g))}</small>
      <b>${eur(o.trend)}</b></button>`;
  const quick = c.level === 'few' || c.level === 'open' || c.level === 'check';
  const qc = quick ? quickChoices(ranked, { lang, chosen: c.level === 'check' ? c.chosen : null }) : null;
  const chip = (cls, val, label, on, title = '') => `<button type="button" class="chip ${cls} ${on ? 'on' : ''}" data-v="${esc(val)}"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</button>`;
  const langName = (l) => LANGS.find((x) => x[0] === l)?.[1] || l;
  return `<div class="vsure lv-${c.level}" id="vsure">
    <div class="vs-head"><span class="vs-meter" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= bars ? 'on' : ''}"></i>`).join('')}</span>
      <b>${esc(title)}</b></div>
    <p class="small vs-why">${esc(c.why)}</p>
    ${c.level === 'check' ? `<div class="actions"><button type="button" class="btn primary" id="vs-yes">✓ Yes, that's mine</button><button type="button" class="btn" id="vs-no">No, choose again</button></div>` : ''}
    ${c.picks.length ? `<div class="vs-picks">${c.picks.map(tile).join('')}</div>
      ${c.left > c.picks.length ? `<p class="small muted">${c.left - c.picks.length} more in the list below</p>` : ''}
      ${c.byRarity === 'guess' ? '<p class="small muted">Cardmarket doesn\'t say which product has which rarity – "probably" is a guess by price (cheapest = lowest rarity).</p>' : ''}
      ${c.byRarity === 'maybe' ? '<p class="small muted">Cardmarket doesn\'t say which of these has that rarity – compare the prices or the pictures.</p>' : ''}` : ''}
    ${quick ? `<div class="vs-quick">
      ${qc.langs.length > 1 ? `<div class="qrow"><small>Language</small><div class="chips">${qc.langs.map((l) => chip('vs-lang', l, LANG_CHIP[l] || l, lang === l, langName(l))).join('')}</div></div>` : ''}
      ${qc.rarities.length > 1 ? `<div class="qrow"><small>Rarity</small><div class="chips">${qc.rarities.map((r) => chip('vs-rar', r, shortRarity(r), sameText(rq, r), r)).join('')}</div></div>` : ''}
      ${qc.first ? `<div class="qrow"><small>Edition</small><div class="chips">${chip('vs-first', '1', '1st Edition', s.first === true)}${chip('vs-first', '0', 'Unlimited', s.first === false)}</div></div>` : ''}
    </div>` : ''}
  </div>`;
}
const sameText = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

function bindVersionBox(s, hooks, render) {
  const box = $('vsure');
  if (!box) return;
  const cur = current;
  const pickVersion = (key) => {
    s.vkey = key; s.vby = key ? 'user' : null;
    hooks.onChange?.(s, cur);
  };
  const copy = (patch) => {
    Object.assign(s, patch);
    if (hooks.onCopy) hooks.onCopy(s, patch); else hooks.onChange?.(s, cur);
  };
  // a quick pick that leaves exactly one version (with a known rarity) picks it
  const settle = () => {
    const c = certainty(cur.ranked, s, { rarity: cur.rq });
    if (!s.vkey && c.left === 1 && c.byRarity !== 'guess' && c.byRarity !== 'maybe') {
      pickVersion(c.picks[0].key);
      toast('Only one version left – picked it');
    }
    render();
  };
  box.querySelectorAll('.vs-pick').forEach((b) => b.addEventListener('click', () => {
    pickVersion(b.dataset.key);
    render();
    toast('Version saved');
  }));
  $('vs-yes')?.addEventListener('click', () => { s.vby = 'user'; hooks.onChange?.(s, cur); render(); });
  $('vs-no')?.addEventListener('click', () => { pickVersion(null); render(); });
  box.querySelectorAll('.vs-lang').forEach((b) => b.addEventListener('click', () => {
    const v = langOf(s) === b.dataset.v && s.lang ? null : b.dataset.v;
    const chosen = s.vkey ? cur.ranked.find((o) => o.key === s.vkey) : null;
    const patch = { lang: v };
    if (v && !hasFirstEdition({ lang: v })) patch.first = null;
    // a European version can't be your Japanese copy (and the other way round)
    if (v && chosen && !fitsLang(chosen, v)) { s.vkey = null; s.vby = null; hooks.onChange?.(s, cur); }
    copy(patch);
    settle();
  }));
  // a rarity picked (chip, or "Mine is this one" in the rarity teacher); the same rarity again clears it
  cur.pickRarity = (r, toggle = true) => {
    cur.rq = toggle && sameText(cur.rq, r) ? '' : r;
    if (cur.rq && s.vkey && s.vby !== 'user') { s.vkey = null; s.vby = null; hooks.onChange?.(s, cur); }
    settle();
  };
  box.querySelectorAll('.vs-rar').forEach((b) => b.addEventListener('click', () => cur.pickRarity(b.dataset.v)));
  box.querySelectorAll('.vs-first').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.v === '1';
    copy({ first: s.first === v ? null : v });
    render();
  }));
}

// ---------- life story of your copy ----------
let storyOpen = false;   // the story box stays open across re-renders (own flag: the copy boxes share openBox)
const dayText = (t) => new Date(t).toLocaleDateString(document.documentElement.lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
function storyBox(s, hooks, value) {
  const entry = hooks.story?.(s);
  if (!entry) return '';
  const lines = lifeOf(entry, { value, eur });
  const moments = lines.filter((l) => l.k !== 'now').length;
  const now = lines[lines.length - 1];
  return `<details class="fold story-box" id="story" ${storyOpen ? 'open' : ''}>
    <summary>Story of this card <span class="muted small">${esc(now.sub.split(' · ')[0])}</span></summary>
    <ol class="story">${lines.map((l) => `<li class="st-${l.k}${l.own ? ' own' : ''}">
      <span class="st-dot"></span>
      <div>${l.k === 'now' ? '' : `<small class="muted">${esc(dayText(l.t))}</small>`}
        <b>${esc(l.text)}</b>${l.sub ? `<small>${esc(l.sub)}</small>` : ''}</div>
      ${l.own ? `<button type="button" class="link st-del" data-t="${l.t}" aria-label="Remove this moment">×</button>` : ''}
    </li>`).join('')}</ol>
    <form id="story-form" class="story-form" autocomplete="off">
      <div class="chips">${Object.entries(TAGS).map(([k, label]) => `<button type="button" class="chip st-tag" data-tag="${k}">${esc(label)}</button>`).join('')}</div>
      <div class="inline-form"><input id="story-text" class="field" maxlength="${NOTE_MAX}" placeholder="Add a moment, e.g. pulled at the Regional with Max">
        <button class="btn primary" type="submit">Add</button></div>
    </form>
    <p class="small muted">${moments} moment${moments === 1 ? '' : 's'} · stays on this phone (in your backup)</p>
  </details>`;
}
function bindStory(s, hooks, render) {
  $('story')?.addEventListener('toggle', (e) => { storyOpen = e.target.open; });
  let tag = '';
  $('card-body').querySelectorAll('.st-tag').forEach((b) => b.addEventListener('click', () => {
    tag = tag === b.dataset.tag ? '' : b.dataset.tag;
    $('card-body').querySelectorAll('.st-tag').forEach((x) => x.classList.toggle('on', x.dataset.tag === tag));
  }));
  $('story-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const x = $('story-text').value.trim();
    if (!x && !tag) { toast('Write a moment or pick one'); return; }
    hooks.onNote?.(s, { x, tag });
    storyOpen = true;
    render();
  });
  $('card-body').querySelectorAll('.st-del').forEach((b) => b.addEventListener('click', () => {
    const t = Number(b.dataset.t);
    const gone = hooks.story?.(s)?.life?.find((x) => x.k === 'note' && x.t === t);
    hooks.onNoteRemove?.(s, t);
    render();
    if (gone) toast('Moment removed', 2600, { label: 'Undo', run: () => { hooks.onNote?.(s, gone); render(); } });
  }));
}

// ---------- card passport (your copy, cards from about €50) ----------
export const PASS_FROM = 50;
// Parked 8 Nov (Christian: not reliable enough with a hand-held phone). Code stays; switch on for tests with
// localStorage 'cardscan-lab' = '1'.
const LAB = (() => { try { return localStorage.getItem('cardscan-lab') === '1'; } catch { return false; } })();
function passBox(s, hooks, value) {
  const entry = hooks.story?.(s);
  if (!entry) return '';
  const rec = value != null && value >= PASS_FROM;
  return `<div class="pass-box ${rec ? 'rec' : ''}" id="pass-box">
    <div class="pass-head"><b>🛡 Card passport</b> <span class="proto-tag">PROTOTYPE</span>
      <small class="muted">${rec ? `Recommended – this card is worth ${eur(value)}` : `Worth it for cards from ${eur(PASS_FROM)}`}</small></div>
    <ul class="rows compact" id="pass-list"></ul>
    <button type="button" class="btn wide" id="pass-new">Record a passport of this copy</button>
  </div>`;
}
async function fillPassBox(s, hooks, ctxFor) {
  const entry = hooks.story?.(s);
  const ul = $('pass-list');
  if (!entry || !ul) return;
  const list = await passesFor(entry.id);
  if ($('pass-list') !== ul) return;
  ul.innerHTML = list.map((p) => `<li><button type="button" data-pid="${esc(p.id)}"><span class="what"><b>${esc(p.id)}</b>
    <small>${esc(new Date(p.t).toLocaleDateString(document.documentElement.lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}${p.label ? ` · ${esc(p.label)}` : ''}</small></span>
    <span class="eur">›</span></button></li>`).join('');
  ul.querySelectorAll('button[data-pid]').forEach((b) => b.addEventListener('click', () => {
    const pass = list.find((p) => p.id === b.dataset.pid);
    openPassport({ ...ctxFor(), mode: 'view', pass });
  }));
  if (list.length) $('pass-new').textContent = 'Record another passport';
}

function bindCopyBoxes(s, chosen, hooks, render) {
  const keep = (id, name) => $(id)?.addEventListener('toggle', (e) => { if (e.target.open) openBox = name; else if (openBox === name) openBox = null; });
  keep('copy-own', 'own'); keep('copy-wish', 'wish');
  const own = (patch) => {
    if (patch.lang && !hasFirstEdition({ lang: patch.lang, option: chosen })) patch.first = null;
    Object.assign(s, patch);
    hooks.onCopy?.(s, patch);
    render();
  };
  $('own-cond')?.addEventListener('change', (e) => own({ cond: e.target.value || null }));
  $('own-lang')?.addEventListener('change', (e) => own({ lang: e.target.value || null }));
  $('own-first')?.addEventListener('change', (e) => own({ first: e.target.value === '' ? null : e.target.value === '1' }));
  const wish = (patch) => {
    const w = findWish(s);
    if (!w) return;
    if (patch.lang && !hasFirstEdition({ lang: patch.lang, option: chosen })) patch.first = null;
    updateWish(w.id, patch);
    render();
  };
  $('wish-cond')?.addEventListener('change', (e) => wish({ cond: e.target.value || null }));
  $('wish-lang')?.addEventListener('change', (e) => wish({ lang: e.target.value }));
  $('wish-first')?.addEventListener('change', (e) => wish({ first: e.target.checked ? true : null }));
}

export function closeCardPage() {
  openBox = null;
  holoCleanup?.(); holoCleanup = null; lastHolo = null;
  $('card-page').hidden = true;
  current = null;
  syncBody();
}

export function syncBody() {
  document.body.classList.toggle('sheet-open', !!document.querySelector('.sheet:not([hidden])'));
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
  cur.ranked = rankOptions(versionOptions(rows), { code: s.code, pack: s.pack, vkey: s.vkey, lang: langOf(s) || null });
  if (s.vkey && !cur.ranked.some((o) => o.key === s.vkey)) { s.vkey = null; s.vby = null; }
  // Curio picks a version by itself only when the set code / pack proves it (versions-sicherheit)
  if (!s.vkey) s.vkey = autoPick(cur.ranked);
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
        <p class="what">${esc([`${chosen.set}${chosen.year ? ` (${chosen.year})` : ''}`, optionCode(chosen, lang?.code)].filter(Boolean).join(' · '))}</p>
        <p class="rarity">${esc(versionLabel(chosen))}</p>
        <p class="big">${eur(chosen.trend)}${fairTrend(chosen).odd ? ' <span class="warn-dot" title="Unusual">⚠</span>' : ''}</p>
        ${fairTrend(chosen).odd ? `<p class="note warn">⚠ This trend is far above the recent averages – probably one unusual listing. Totals use ${eur(fairTrend(chosen).v)} instead.</p>` : ''}
        <p class="what">Cardmarket trend price · offers from ${eur(chosen.low)}</p>
        <div class="pgrid">${cell('avg1', 'Yesterday')}${cell('avg7', '7 days')}${cell('avg30', '30 days')}${cell('trend', 'Trend')}</div>
        ${odd.size ? '<p class="note warn">⚠ marks a value far from the others – usually one unusual sale.</p>' : ''}
      </div>`;
  } else if (ranked.length) {
    const n = best.length || ranked.length;
    priceBox = `
      <div class="pricebox ${tier}">
        <p class="what">${best.length ? `${n} version${n > 1 ? 's' : ''} fit${n > 1 ? '' : 's'} ${s.code ? 'the set code' : s.pack ? 'the pack' : 'the card\'s language'}` : `${n} versions on Cardmarket`}</p>
        <p class="big">${range(price.lo, price.hi)}</p>
        <p class="what">Pick your version below for the exact price.</p>
      </div>`;
  } else {
    priceBox = '<div class="pricebox"><p class="what">No Cardmarket price found. This is often a card only printed in Japan or Korea.</p></div>';
  }

  const notes = [];
  if (s.code) notes.push(`Set code read on the card: <b>${esc(s.code.code)}</b>${s.code.distance ? ` (read as ${esc(s.code.read)})` : ''}.`);
  else if (s.ocrText != null) notes.push('Set code not readable on the photo – choose the version yourself.');
  const hasOcg = ranked.some((o) => /\(OCG\)/.test(o.set));
  if (lang && ['JP', 'JA'].includes(lang.code) && hasOcg) notes.push('Japanese print: the OCG versions on Cardmarket are listed first.');
  else if (lang && !lang.supported) notes.push(`${esc(lang.name)} print. Cardmarket has no separate listing for it, so the prices are those of the European print of the same card – check before buying or selling.`);
  if (s.pack) notes.push(`Pack mode: ${esc(s.pack.name || s.pack.prefix)}.`);

  // tilt scan: versions with the guessed rarity first
  const tilted = tiltRank(ranked, current.tilt, rarityQuery);
  const rarityCount = new Set(ranked.flatMap((o) => [o.rarity, ...(o.rarities || [])]).filter(Boolean)).size;
  if (current.tilt) {
    const [first, ...rest] = current.tilt.list;
    notes.push(`<span>✨ Tilt scan: looks like</span> <b>${esc(first.label)}</b>${rest.length ? ` <span class="muted">or ${esc(rest.slice(0, 2).map((g) => g.label).join(', '))}</span>` : ''}<br><span class="small">Matching versions are listed first. Prototype – please check.</span>`);
  }
  const versionsHTML = (opts) => opts.map((o) => `
    <li class="${o.key === s.vkey ? 'on' : ''}"><button type="button" data-key="${esc(o.key)}">
      <span class="radio"></span>
      ${o.image ? `<img class="vimg" loading="lazy" src="${esc(versionImage(o, 'preview'))}" alt="" onerror="this.remove()">` : ''}
      <span class="what">${esc(o.set)}${o.year ? ` (${o.year})` : ''}${o.likely ? '<span class="likely">LIKELY</span>' : ''}${o.tiltMatch ? '<span class="likely foil-match">✨ FOIL</span>' : ''}
        <small>${esc([optionCode(o, lang?.code), versionLabel(o)].filter(Boolean).join(' · '))}${!o.label && o.variants > 1 && o.rarities.length ? `<span class="muted"> (one of: ${esc(o.rarities.join(', '))})</span>` : ''}</small></span>
      <span class="eur">${eur(o.trend)}${fairTrend(o).odd ? '<small class="warn-dot">⚠ unusual</small>' : ''}</span>
    </button></li>`).join('') || '<li><div class="row muted small">No version matches.</div></li>';
  // the quick pick (your language, a rarity chip) narrows the list too – "Show all" undoes it
  const quickOn = hooks.own && !current.showAll && (current.rq || s.lang);
  const narrowed = quickOn ? narrow(tilted, { lang: s.lang || '', rarity: current.rq || '' }).list : tilted;
  const filtered = filterOptions(narrowed, current.vq);
  const list = current.showAll || current.vq ? filtered : filtered.slice(0, 8);
  const versions = versionsHTML(list);

  const alts = (s.top || []).filter((a) => normName(a.name) !== normName(s.name)).slice(0, 5);
  const sub = s.top ? (s.confident === false ? '<span class="unsure">Not sure</span> – check the name, or pick the right card below' : 'Recognised from the artwork') : '';

  holoCleanup?.(); holoCleanup = null;
  const holo = holoOf(s, chosen, !!hooks.own, likeliest(chosen, best, ranked));
  const prev = lastHolo && lastHolo.subject === s ? lastHolo.src : '';
  lastHolo = holo ? { subject: s, src: holo.src } : null;
  $('card-bar-title').textContent = s.name;
  $('card-body').innerHTML = `
    ${holo ? `<div class="card-holo" id="card-holo">${holoCardHTML({ ...holo, alt: s.name, prev })}</div>
      <p class="small muted card-holo-hint">${holo.official ? (hooks.own ? 'Tilt your phone · tap for full screen' : 'Official picture · tap for full screen') : 'Your photo – pick your version below for the official picture'}</p>
      <div class="actions hg-row"><button type="button" class="btn hg-open" id="hg-open">◈ Hologram</button>
        ${hooks.own && livingPicture(s) ? '<button type="button" class="btn hg-open live-open" id="live-open">✦ Living artwork</button><button type="button" class="btn hg-open sm-open" id="sm-open">⚔ Summon</button>' : ''}</div>` : ''}
    <div class="card-head">
      ${s.thumb && !holo ? `<img src="${s.thumb}" alt="">` : ''}
      <div>
        <p class="name">${esc(info?.name || s.name)}</p>
        <p class="small muted">${sub}</p>
        <div class="badges">${lang ? `<span class="badge">${esc(lang.name)}</span>` : ''}${banBadges(info)}</div>
      </div>
    </div>
    ${priceBox}
    ${hooks.own ? versionBox(s, ranked, current.rq || '') : ''}
    ${rarityBoxHTML({ chosen, ranked, open: hooks.own && !chosen && !current.rq ? quickChoices(ranked, { lang: langOf(s) }).rarities.filter((r) => rarityOf(r)) : [], src: holo?.src || '' })}
    ${s.thumb && chosen?.image ? `<div class="compare"><figure><img src="${s.thumb}" alt=""><figcaption>Your photo</figcaption></figure>
      <figure><img src="${esc(versionImage(chosen, 'show'))}" alt="" onerror="this.closest('figure').remove()"><figcaption>${esc(versionLabel(chosen))} (official)</figcaption></figure></div>` : ''}
    ${notes.map((n) => `<p class="note">${n}</p>`).join('')}
    ${ranked.length ? `<h2>Which version do you have?</h2>
      ${LAB && rarityCount > 1 ? `<button type="button" class="btn tilt-btn ${current.tilt ? 'on' : ''}" id="tilt-btn">✨ ${current.tilt ? 'Tilt scan again' : 'Tilt scan: find the rarity by the shine'}</button>` : ''}
      ${ranked.length > 4 ? `<input id="ver-filter" class="field ver-filter" type="search" placeholder="Set code, set or rarity, e.g. MP19 or QCSR" autocomplete="off" spellcheck="false" value="${esc(current.vq || '')}">` : ''}
      <ul class="versions">${versions}</ul>` : ''}
    ${(filtered.length > 8 || narrowed.length < ranked.length) && !current.showAll && !current.vq ? `<button type="button" class="link more-btn" id="show-all">Show all ${ranked.length} versions</button>` : ''}
    <h2>Wrong card?</h2>
    ${alts.length ? `<div class="alts">${alts.map((a) => `<button type="button" class="chip alt" data-name="${esc(a.name)}">${esc(a.name)}</button>`).join('')}</div>` : ''}
    <input id="fix-name" class="field" type="search" placeholder="Type the right name" autocomplete="off" spellcheck="false">
    <ul id="fix-results" class="rows compact"></ul>
    <div class="actions">
      <a class="btn" href="${esc(chosen ? cardmarketUrl(chosen, info?.name || s.name) : cardmarketSearchUrl(info?.name || s.name))}" target="_blank" rel="noopener">${chosen ? (chosen.path ? 'This version on Cardmarket' : 'Find in this set on Cardmarket') : 'Open on Cardmarket'}</a>
      ${hooks.onAdd ? `<button class="btn primary" type="button" id="card-add">${esc(hooks.addLabel?.(s) || 'Add to collection')}</button>` : ''}
    </div>
    <div class="actions">
      <button class="btn ${findWish(s) ? 'on' : ''}" type="button" id="card-wish">${findWish(s) ? '♥ On your wishlist' : '♡ Wishlist'}</button>
      <button class="btn ${findWatch(s) ? 'on' : ''}" type="button" id="card-watch">${findWatch(s) ? '★ Watching' : '☆ Watch price'}</button>
    </div>
    ${findWatch(s) ? `<form id="watch-form" class="inline-form target-form" autocomplete="off">
      <label class="small muted" for="watch-target">Target price${chosen ? '' : ' (any version)'}</label>
      <input id="watch-target" class="field" type="number" inputmode="decimal" step="0.01" min="0" placeholder="e.g. ${price.lo != null ? (Math.floor(price.lo * 0.9 * 100) / 100).toFixed(2) : '10.00'}" value="${findWatch(s).target ?? ''}">
      <button class="btn primary" type="submit">Save</button>
      ${findWatch(s).target != null ? '<button class="btn" type="button" id="watch-target-clear">No target</button>' : ''}
    </form>` : ''}
    ${copyBoxes(s, chosen, hooks)}
    ${storyBox(s, hooks, chosen && price.lo != null ? (price.hi != null ? (price.lo + price.hi) / 2 : price.lo) : null)}
    ${LAB ? passBox(s, hooks, chosen && price.lo != null ? (price.hi != null ? (price.lo + price.hi) / 2 : price.lo) : price.lo ?? null) : ''}
    ${hooks.onRemove ? `<button class="btn wide danger" type="button" id="card-remove">${esc(hooks.removeLabel || 'Remove from collection')}</button>` : ''}
  `;
  const priceNow = () => ({ lo: price.lo, hi: price.hi, label: chosen ? [`${chosen.set}`, versionLabel(chosen)].join(' · ') : 'any version' });
  if (holo) {
    holoCleanup = attachTilt($('card-holo'), {
      onTap: () => openHolo([{ name: info?.name || s.name, rarity: chosen ? (chosen.rarity || versionLabel(chosen)) : '', src: holo.src, kind: holo.kind, shine: holo.shine, price: chosen?.trend }]),
    });
  }
  $('live-open')?.addEventListener('click', () => {
    const pic = livingPicture(s);
    if (pic) openLiving({ src: pic.src, low: pic.low, layout: layoutOf(holo?.src || ''), name: info?.name || s.name });
  });
  $('sm-open')?.addEventListener('click', () => {
    const pic = livingPicture(s);
    if (pic) openSummon({ src: pic.src, layout: layoutOf(holo?.src || ''), name: info?.name || s.name });
  });
  $('hg-open')?.addEventListener('click', () => openHologram({ src: holo.src, name: info?.name || s.name, rarity: chosen ? (chosen.rarity || versionLabel(chosen)) : '', price: chosen?.trend }));
  $('card-watch').addEventListener('click', () => {
    const before = findWatch(s);
    const on = toggleWatch(s, priceNow());
    if (on) toast('Watching the price (Market › Watchlist) – set a target price below if you like');
    else toast('Removed from your watchlist', 2600, { label: 'Undo', run: () => { restoreWatch(before); render(); } });
    render();
  });
  $('card-wish').addEventListener('click', () => {
    const before = findWish(s);
    const added = toggleWish(s, priceNow());
    if (added) toast('On your wishlist (Collection › Wishlist)');
    else toast('Removed from your wishlist', 2600, { label: 'Undo', run: () => { restoreWish(before); render(); } });
    render();
  });
  $('watch-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = String($('watch-target').value).trim().replace(',', '.');
    const t = raw === '' ? null : parseFloat(raw);
    if (t != null && !(t >= 0)) { toast('Enter a target price'); return; }
    setWatchTarget(s, t, priceNow());
    toast(t == null ? 'No target price' : `Marked when it is ${eur(t)} or less`);
    render();
  });
  bindCopyBoxes(s, chosen, hooks, render);
  bindVersionBox(s, hooks, render);
  bindRarityBox({ src: holo?.src || '', onPick: (r) => {
    if (current.pickRarity) current.pickRarity(r, false); else { current.rq = r; render(); }
    $('vsure')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } });
  bindStory(s, hooks, render);
  const passCtx = () => ({
    entryId: hooks.story?.(s)?.id, name: info?.name || s.name, version: chosen ? [chosen.set, versionLabel(chosen)].filter(Boolean).join(' · ') : '',
    kind: chosen ? holoKind(chosen.rarity || versionLabel(chosen)) : '', layout: layoutOf(holo?.src || ''),
    onCreated: (rec, restored) => { if (!restored) hooks.onPass?.(s, rec); fillPassBox(s, hooks, passCtx); },
    onDeleted: () => fillPassBox(s, hooks, passCtx),
  });
  if ($('pass-box')) {
    fillPassBox(s, hooks, passCtx);
    $('pass-new').addEventListener('click', () => openPassport({ ...passCtx(), mode: 'create' }));
  }
  $('watch-target-clear')?.addEventListener('click', () => { setWatchTarget(s, null, priceNow()); toast('No target price'); render(); });

  const bindVersions = () => $('card-body').querySelectorAll('.versions button').forEach((b) => b.addEventListener('click', () => {
    s.vkey = s.vkey === b.dataset.key ? null : b.dataset.key;
    s.vby = s.vkey ? 'user' : null;
    hooks.onChange?.(s, current);
    render();
  }));
  bindVersions();
  $('ver-filter')?.addEventListener('input', (e) => {
    current.vq = e.target.value;
    const f = filterOptions(narrowed, current.vq);
    $('card-body').querySelector('.versions').innerHTML = versionsHTML(current.vq || current.showAll ? f : f.slice(0, 8));
    $('show-all')?.toggleAttribute('hidden', !!current.vq);
    bindVersions();
  });
  $('show-all')?.addEventListener('click', () => { current.showAll = true; render(); });
  $('tilt-btn')?.addEventListener('click', () => {
    const cur = current;
    openTiltScan({
      name: info?.name || s.name,
      onResult: (guess) => {
        if (cur !== current) return;
        cur.tilt = guess;
        // a clear result pre-selects the first version with exactly that rarity, when none was chosen yet
        const test = rarityQuery(guess.list[0]?.q);
        const top = guess.clear && test && cur.ranked.find((o) => o.rarity && test.test(o.rarity.toLowerCase()));
        if (!s.vkey && top) { s.vkey = top.key; cur.hooks.onChange?.(s, cur); }
        render();
        $('card-body').querySelector('.versions')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      },
    });
  });
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
  s.vby = null;
  current.rq = '';
  s.confident = true;
  s.corrected = true;
  current.showAll = false;
  current.tilt = null;
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
  const ranked = rankOptions(versionOptions(rows), { code: s.code, pack: s.pack, lang: langOf(s) || null });
  if (s.vkey && !ranked.some((o) => o.key === s.vkey)) { s.vkey = null; s.vby = null; }
  if (!s.vkey) s.vkey = autoPick(ranked);
  const { chosen, best, price } = summarise(ranked, s.vkey);
  // how sure the version is; for 2–3 open versions also the tiles to tap (scan list)
  const sure = certainty(ranked, s);
  const g = sure.level === 'few' ? rarityGuesses(ranked) : null;
  const picks = sure.level === 'few' ? sure.picks.map((o) => ({ key: o.key, set: o.set, code: optionCode(o, langOf(s)), label: pickLabel(o, g), short: shortRarity(o.rarity || g.get(o.key) || ''), image: o.image || '', trend: o.trend ?? null })) : null;
  const lang = s.code?.language || s.language;
  const label = chosen
    ? [`${chosen.set}${chosen.year ? ` (${chosen.year})` : ''}`, optionCode(chosen, lang?.code), chosen.label || (chosen.variants <= 1 ? chosen.rarities[0] : '')].filter(Boolean).join(' · ')
    : best?.length ? `${best[0].set} · ${best.length} versions` : (ranked.length ? `${ranked.length} version${ranked.length > 1 ? 's' : ''}` : 'no price found');
  return { ...price, label, exact: !!chosen, rarity: chosen ? (chosen.rarity || (chosen.variants <= 1 ? chosen.rarities[0] : '') || '') : '',
    image: chosen?.image || '', guess: likeliest(chosen, best, ranked)?.image || '', hist: historyOf(chosen ? [chosen] : (best?.length ? best : ranked)), set: chosen?.set || (best?.length && best.every((o) => o.set === best[0].set) ? best[0].set : ''),
    year: chosen ? chosen.year || null : (best?.length && best.every((o) => o.year === best[0].year) ? best[0].year || null : null), pid: chosen ? Number(chosen.key) : null,
    sure: sure.level, ...(picks ? { picks } : {}) };
}
