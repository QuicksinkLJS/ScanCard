// Masterset tracker: pick a set, see which versions you have (any language counts), what is missing and what it costs.
// One entry per Cardmarket product of the set = set x card x rarity x artwork.

import { $, esc, eur, toast } from './util.js';
import { cardmarketUrl, versionImage, rarityRank } from './prices.js';
import { syncBody } from './cardpage.js';
import { loadCollection } from './store.js';
import { progress } from './mastercalc.js';

const TRACK_KEY = 'cardscan-masters-v1';
const OWN_KEY = 'cardscan-owned-v1';

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full */ } };

export const loadTracked = () => load(TRACK_KEY, []);
const saveTracked = (t) => save(TRACK_KEY, t);
const loadManual = () => load(OWN_KEY, {});
const saveManual = (m) => save(OWN_KEY, m);

// Copies owned per Cardmarket product: cards in the collection with that version chosen, plus ticks made here.
export function ownedCounts() {
  const n = {};
  for (const e of loadCollection()) if (e.vkey) n[e.vkey] = (n[e.vkey] || 0) + 1;
  const fromColl = { ...n };
  for (const [k, v] of Object.entries(loadManual())) n[k] = (n[k] || 0) + v;
  return { all: n, fromColl };
}

export function createMasters({ api, openCard }) {
  let cur = null; // {exp, name, target, entries, filter, rarity}

  async function renderList() {
    const tracked = loadTracked();
    const ul = $('masters-list');
    $('masters-empty').hidden = tracked.length > 0;
    if (!tracked.length) { ul.innerHTML = ''; return; }
    const { all } = ownedCounts();
    const rows = await Promise.all(tracked.map(async (t) => {
      const entries = await api.setEntries(t.exp).catch(() => []);
      return { t, p: progress(entries, all, t.target || 1) };
    }));
    ul.innerHTML = rows.map(({ t, p }) => `
      <li><button type="button" data-exp="${t.exp}">
        <span class="what"><b>${esc(t.name)}</b>
          <span class="pbar"><span style="width:${p.total ? (p.have / p.total) * 100 : 0}%"></span></span>
          <small>${p.have}/${p.total}${t.target > 1 ? ` · ×${t.target}` : ''} · missing approx. ${eur(p.missingValue)}</small></span>
        <span class="eur">${p.total ? Math.floor((p.have / p.total) * 100) : 0} %</span>
      </button></li>`).join('');
    ul.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => openSet(Number(b.dataset.exp))));
  }

  // search to add a set
  let exps = null;
  async function search(q) {
    const ul = $('masters-results');
    q = q.trim().toLowerCase();
    if (q.length < 2) { ul.innerHTML = ''; return; }
    if (!exps) exps = await api.expansions().catch(() => []);
    const hits = exps.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 12);
    ul.innerHTML = hits.map((e) => `<li><button type="button" data-exp="${e.exp}"><span class="what"><b>${esc(e.name)}</b>
      <small>${e.date ? esc(e.date.slice(0, 7)) : ''} · ${e.count} versions</small></span><span class="eur">+</span></button></li>`).join('')
      || '<li><div class="row muted small">No set with that name.</div></li>';
    ul.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const e = hits.find((x) => x.exp === Number(b.dataset.exp));
      const t = loadTracked();
      if (!t.some((x) => x.exp === e.exp)) t.unshift({ exp: e.exp, name: e.name, target: 1 });
      saveTracked(t);
      $('masters-search').value = '';
      ul.innerHTML = '';
      renderList();
      openSet(e.exp);
    }));
  }
  $('masters-search').addEventListener('input', (e) => search(e.target.value));

  async function openSet(exp) {
    const t = loadTracked().find((x) => x.exp === exp);
    if (!t) return;
    const page = $('set-page');
    if (page.hidden) { page.hidden = false; syncBody(); history.pushState({ sheet: 'set' }, ''); }
    page.scrollTop = 0;
    $('set-title').textContent = t.name;
    $('set-body').innerHTML = '<p class="note">Loading…</p>';
    const entries = await api.setEntries(exp).catch(() => []);
    cur = { ...t, entries, filter: cur?.exp === exp ? cur.filter : 'missing', rarity: cur?.exp === exp ? cur.rarity : '' };
    renderSet();
  }

  function renderSet() {
    const { entries, target } = cur;
    const { all, fromColl } = ownedCounts();
    const p = progress(entries, all, target);
    const rarities = [...new Set(entries.map((e) => e.rarity || ''))].sort((a, b) => rarityRank(a) - rarityRank(b));
    let list = entries.filter((e) => !cur.rarity || (e.rarity || '') === cur.rarity);
    const have = (e) => Math.min(all[e.key] || 0, target);
    if (cur.filter === 'missing') list = list.filter((e) => have(e) < target);
    if (cur.filter === 'have') list = list.filter((e) => have(e) > 0);
    $('set-body').innerHTML = `
      <div class="mprog">
        <p class="big">${p.have}<span class="muted">/${p.total}</span></p>
        <span class="pbar big"><span style="width:${p.total ? (p.have / p.total) * 100 : 0}%"></span></span>
        <p class="small">${p.have === p.total ? 'Complete! 🎉' : `Missing ${p.total - p.have} · approx. <b>${eur(p.missingValue)}</b> on Cardmarket${p.unpriced ? ` <span class="muted">(${p.unpriced} without price)</span>` : ''}`}</p>
      </div>
      <div class="seg small" role="tablist">
        ${['missing', 'have', 'all'].map((f) => `<button type="button" data-f="${f}" class="${cur.filter === f ? 'on' : ''}">${{ missing: 'Missing', have: 'Have', all: 'All' }[f]}</button>`).join('')}
      </div>
      <div class="chips">
        <button type="button" class="chip ${!cur.rarity ? 'on' : ''}" data-r="">All rarities</button>
        ${rarities.map((r) => `<button type="button" class="chip ${cur.rarity === r ? 'on' : ''}" data-r="${esc(r)}">${esc(r || 'Rarity unknown')}</button>`).join('')}
      </div>
      <p class="muted small">Tap ○ to tick a card you have (any language counts). Cards in your collection with this exact version are ticked automatically.</p>
      <ul class="rows mlist">${list.map((e) => {
        const h = have(e), auto = Math.min(fromColl[e.key] || 0, target);
        return `<li class="${h >= target ? 'have' : ''}">
          <div class="row">
            <button type="button" class="tick" data-key="${e.key}" aria-label="I have this">${h >= target ? '✓' : target > 1 ? `${h}/${target}` : '○'}</button>
            ${e.image ? `<img class="vimg" loading="lazy" src="${esc(versionImage(e, 'preview'))}" alt="" onerror="this.remove()">` : ''}
            <button type="button" class="what plain" data-open="${e.key}"><b>${esc(e.name)}</b><small>${esc([e.code, e.label || 'Rarity unknown'].filter(Boolean).join(' · '))}${auto ? ' · in collection' : ''}</small></button>
            <a class="eur" href="${esc(cardmarketUrl(e, e.name))}" target="_blank" rel="noopener">${eur(e.trend)}<small>Cardmarket ↗</small></a>
          </div></li>`;
      }).join('') || '<li><div class="row muted small">Nothing here.</div></li>'}</ul>
      <div class="actions">
        <button type="button" class="btn" id="set-target">Collect ×${target === 1 ? 2 : 1} instead</button>
        <button type="button" class="btn danger" id="set-untrack">Stop tracking</button>
      </div>`;
    const body = $('set-body');
    body.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { cur.filter = b.dataset.f; renderSet(); }));
    body.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => { cur.rarity = b.dataset.r; renderSet(); }));
    body.querySelectorAll('.tick').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.key;
      const m = loadManual();
      const total = (fromColl[k] || 0) + (m[k] || 0);
      if (total >= cur.target) m[k] = 0; // full: clear the ticks (collection copies stay)
      else m[k] = (m[k] || 0) + 1;
      if (!m[k]) delete m[k];
      saveManual(m);
      renderSet();
    }));
    body.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
      const e = cur.entries.find((x) => x.key === b.dataset.open);
      if (e) openCard({ name: e.name, vkey: e.key });
    }));
    $('set-target').addEventListener('click', () => {
      cur.target = cur.target === 1 ? 2 : 1;
      saveTracked(loadTracked().map((x) => (x.exp === cur.exp ? { ...x, target: cur.target } : x)));
      renderSet();
    });
    $('set-untrack').addEventListener('click', () => {
      if (!window.confirm(`Stop tracking ${cur.name}? Your ticks stay saved.`)) return;
      saveTracked(loadTracked().filter((x) => x.exp !== cur.exp));
      history.back();
      renderList();
      toast('Set removed');
    });
  }

  function closeSet() { $('set-page').hidden = true; syncBody(); renderList(); }
  $('set-back').addEventListener('click', () => history.back());

  return { renderList, openSet, closeSet, refresh: () => { if (cur && !$('set-page').hidden) renderSet(); } };
}
