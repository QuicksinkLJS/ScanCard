// Masterset tracker: pick a set, see which versions you have (any language counts), what is missing and what it costs.
// One entry per Cardmarket product of the set = set x card x rarity x artwork.

import { $, esc, eur, toast, choose } from './util.js';
import { cardmarketUrl, versionImage, rarityRank, fairTrend } from './prices.js';
import { syncBody } from './cardpage.js';
import { loadCollection, saveCollection } from './store.js';
import { progress, sortEntries, SET_SORTS, fillCodes } from './mastercalc.js';
import { holoKind } from './holo.js';
import { progressImage, shareCanvas } from './share.js';
import { gameKey } from './game.js';

const TRACK_KEY = gameKey('cardscan-masters-v1');
const OWN_KEY = gameKey('cardscan-owned-v1');

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
  // manual values may be negative: "don't count these collection copies for the set"
  for (const [k, v] of Object.entries(loadManual())) n[k] = Math.max(0, (n[k] || 0) + v);
  return { all: n, fromColl };
}

export function createMasters({ api, openCard, onCollectionChange = () => {} }) {
  let cur = null; // {exp, name, target, entries, filter, rarity}

  // progress of every tracked set: [{t, p: {have, total, missingValue}}]
  async function summaries() {
    const tracked = loadTracked();
    const { all } = ownedCounts();
    return Promise.all(tracked.map(async (t) => {
      const entries = await api.setEntries(t.exp).catch(() => []);
      const hid = new Set(t.hidden || []);
      return { t, p: progress(entries.filter((e) => !hid.has(e.key)), all, t.target || 1) };
    }));
  }

  async function renderList() {
    const tracked = loadTracked();
    const ul = $('masters-list');
    $('masters-empty').hidden = tracked.length > 0;
    if (!tracked.length) { ul.innerHTML = ''; return; }
    const rows = await summaries();
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

  // highlight: a version key to show in the binder (from the binder assistant)
  async function openSet(exp, { highlight = null } = {}) {
    const t = loadTracked().find((x) => x.exp === exp);
    if (!t) return;
    const page = $('set-page');
    if (page.hidden) { page.hidden = false; syncBody(); history.pushState({ sheet: 'set' }, ''); }
    page.scrollTop = 0;
    $('set-title').textContent = t.name;
    $('set-body').innerHTML = '<p class="note">Loading…</p>';
    let entries = await api.setEntries(exp).catch(() => []);
    if (entries.some((e) => !e.code)) {
      const names = [...new Set(entries.filter((e) => !e.code).map((e) => e.name))];
      const infos = new Map(await Promise.all(names.map(async (n) => [n, await api.nameInfo(n).catch(() => null)])));
      entries = fillCodes(entries, infos);
    }
    cur = { ...t, entries, filter: cur?.exp === exp ? cur.filter : 'missing', rarity: cur?.exp === exp ? cur.rarity : '', view: cur?.exp === exp ? cur.view : 'list', showHidden: false, sort: t.sort || 'number' };
    if (highlight) { cur.view = 'binder'; cur.rarity = ''; }
    renderSet();
    if (highlight) showPocket(String(highlight));
  }

  const saveHidden = (keys) => {
    cur.hidden = keys;
    saveTracked(loadTracked().map((x) => (x.exp === cur.exp ? { ...x, hidden: keys } : x)));
  };
  // Long press on an entry: leave it out of this set (e.g. collect only the manga-style artworks).
  function toggleHidden(key) {
    const before = [...(cur.hidden || [])];
    const on = before.includes(key);
    saveHidden(on ? before.filter((k) => k !== key) : [...before, key]);
    navigator.vibrate?.(25);
    renderSet();
    const e = cur.entries.find((x) => x.key === key);
    toast(on ? `Counts again: ${e?.name || ''}` : `Left out of this set: ${e?.name || ''}`, 5000, { label: 'Undo', run: () => { saveHidden(before); renderSet(); } });
  }
  function bindLongPress(root, sel, onLong) {
    root.querySelectorAll(sel).forEach((el) => {
      let timer = null, fired = false, start = null;
      el.addEventListener('pointerdown', (ev) => {
        fired = false; start = [ev.clientX, ev.clientY];
        timer = setTimeout(() => { fired = true; onLong(el.dataset.key); }, 550);
      });
      const stop = () => clearTimeout(timer);
      el.addEventListener('pointerup', stop);
      el.addEventListener('pointercancel', stop);
      el.addEventListener('pointermove', (ev) => { if (start && Math.hypot(ev.clientX - start[0], ev.clientY - start[1]) > 10) stop(); });
      el.addEventListener('contextmenu', (ev) => ev.preventDefault());
      el.addEventListener('click', (ev) => { if (fired) { ev.stopImmediatePropagation(); ev.preventDefault(); } }, true);
    });
  }

  function setCode(entries) {
    const n = {};
    for (const e of entries) { const p = (e.code || '').split('-')[0]; if (p) n[p] = (n[p] || 0) + 1; }
    return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }

  const SORT_LABEL = { number: 'Set number', value: 'Value (high → low)', 'value-asc': 'Value (low → high)', name: 'Name (A–Z)', rarity: 'Rarity (highest first)', missing: 'Missing first' };

  function renderSet() {
    const { target } = cur;
    const hidden = new Set(cur.hidden || []);
    const entries = cur.entries.filter((e) => !hidden.has(e.key));
    const { all, fromColl } = ownedCounts();
    const p = progress(entries, all, target);
    const rarities = [...new Set(entries.map((e) => e.rarity || ''))].sort((a, b) => rarityRank(a) - rarityRank(b));
    const have = (e) => Math.min(all[e.key] || 0, target);
    const byRarity = (e) => !cur.rarity || (cur.rarity === '__none' ? !e.rarity : (e.rarity || '') === cur.rarity);
    const sortOpts = { have, target, rank: (r) => { const k = rarityRank(r); return k >= 99 ? -1 : k; }, value: (e) => fairTrend(e).v ?? e.trend };
    const sorted = (l) => sortEntries(l, cur.sort, sortOpts);
    let list = sorted((cur.showHidden ? cur.entries : entries).filter(byRarity));
    if (cur.view === 'list') {
      if (cur.filter === 'missing') list = list.filter((e) => have(e) < target || hidden.has(e.key));
      if (cur.filter === 'have') list = list.filter((e) => have(e) > 0);
    }
    const binderList = sorted(entries.filter(byRarity));
    const pages = [];
    for (let i = 0; i < binderList.length; i += 9) pages.push(binderList.slice(i, i + 9));
    const pocket = (e) => {
      const h = have(e) > 0;
      const kind = holoKind(e.rarity);
      return `<button type="button" class="pocket ${h ? 'have' : 'miss'} k-${kind}" data-key="${e.key}" title="${esc(e.name)}">
        ${e.image ? `<img loading="lazy" src="${esc(versionImage(e, 'preview'))}" alt="" draggable="false" onerror="this.remove()">` : `<span class="pname">${esc(e.name)}</span>`}
        ${h && target > 1 ? `<span class="pcount">${have(e)}/${target}</span>` : ''}</button>`;
    };
    $('set-body').innerHTML = `
      <div class="mprog">
        <p class="big">${p.have}<span class="muted">/${p.total}</span></p>
        <span class="pbar big"><span style="width:${p.total ? (p.have / p.total) * 100 : 0}%"></span></span>
        <p class="small">${p.have === p.total ? 'Complete! 🎉' : `Missing ${p.total - p.have} · approx. <b>${eur(p.missingValue)}</b> on Cardmarket${p.unpriced ? ` <span class="muted">(${p.unpriced} without price)</span>` : ''}`}</p>
        <button type="button" class="link" id="set-share">Share progress</button>
      </div>
      <div class="seg small" role="tablist">
        <button type="button" data-v="list" class="${cur.view === 'list' ? 'on' : ''}">List</button>
        <button type="button" data-v="binder" class="${cur.view === 'binder' ? 'on' : ''}">Binder</button>
      </div>
      ${cur.view === 'list' ? `<div class="seg small" role="tablist">
        ${['missing', 'have', 'all'].map((f) => `<button type="button" data-f="${f}" class="${cur.filter === f ? 'on' : ''}">${{ missing: 'Missing', have: 'Have', all: 'All' }[f]}</button>`).join('')}
      </div>` : ''}
      <label class="sortby small">Sort by
        <select id="set-sort" class="field small-field">${SET_SORTS.map((k) => `<option value="${k}" ${cur.sort === k ? 'selected' : ''}>${SORT_LABEL[k]}</option>`).join('')}</select>
      </label>
      <div class="chips">
        <button type="button" class="chip ${!cur.rarity ? 'on' : ''}" data-r="">All rarities</button>
        ${rarities.map((r) => { const v = r || '__none'; return `<button type="button" class="chip ${cur.rarity === v ? 'on' : ''}" data-r="${esc(v)}">${esc(r || 'Rarity unknown')}</button>`; }).join('')}
        ${hidden.size ? `<button type="button" class="chip ${cur.showHidden ? 'on' : ''}" id="set-hidden">Left out ${hidden.size}</button>` : ''}
      </div>
      ${cur.view === 'binder' ? `
      <p class="muted small">Swipe through the pages. Tap a card for details, hold it to leave it out of this set.</p>
      <div class="binder" id="binder">${pages.map((pg, i) => `<div class="bpage" data-page="${i}">${pg.map(pocket).join('')}${'<span class="pocket empty"></span>'.repeat(9 - pg.length)}</div>`).join('') || '<p class="muted small">Nothing here.</p>'}</div>
      <p class="small muted bpager" id="bpager">${pages.length ? `Page 1 / ${pages.length}` : ''}</p>` : `
      <p class="muted small">Tap ○ to tick a card you have (any language counts). Cards in your collection with this exact version are ticked automatically. Hold a card to leave it out of this set.</p>
      <ul class="rows mlist">${list.map((e) => {
        const h = have(e), auto = Math.min(fromColl[e.key] || 0, target);
        const off = hidden.has(e.key);
        return `<li class="${h >= target ? 'have' : ''} ${off ? 'off' : ''}" data-key="${e.key}">
          <div class="row">
            <button type="button" class="tick" data-key="${e.key}" aria-label="I have this" ${off ? 'disabled' : ''}>${h >= target ? '✓' : target > 1 ? `${h}/${target}` : '○'}</button>
            ${e.image ? `<img class="vimg" loading="lazy" src="${esc(versionImage(e, 'preview'))}" alt="" onerror="this.remove()">` : ''}
            <button type="button" class="what plain" data-open="${e.key}" data-key="${e.key}"><b>${esc(e.name)}</b><small>${esc([e.code, e.label || 'Rarity unknown'].filter(Boolean).join(' · '))}${auto ? ' · in collection' : ''}${off ? ' · left out' : ''}</small></button>
            <a class="eur" href="${esc(cardmarketUrl(e, e.name))}" target="_blank" rel="noopener">${eur(e.trend)}<small>${fairTrend(e).odd ? '⚠ unusual · ' : ''}Cardmarket ↗</small></a>
          </div></li>`;
      }).join('') || '<li><div class="row muted small">Nothing here.</div></li>'}</ul>`}
      <div class="actions">
        <button type="button" class="btn" id="set-target">Collect ×${target === 1 ? 2 : 1} instead</button>
        <button type="button" class="btn danger" id="set-untrack">Stop tracking</button>
      </div>`;
    const body = $('set-body');
    body.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { cur.filter = b.dataset.f; renderSet(); }));
    body.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { cur.view = b.dataset.v; renderSet(); }));
    $('set-hidden')?.addEventListener('click', () => { cur.showHidden = !cur.showHidden; if (cur.showHidden) { cur.view = 'list'; cur.filter = 'all'; } renderSet(); });
    bindLongPress(body, '[data-open], .pocket[data-key]', toggleHidden);
    body.querySelectorAll('.pocket[data-key]').forEach((b) => b.addEventListener('click', () => {
      const e = cur.entries.find((x) => x.key === b.dataset.key);
      if (e) openCard({ name: e.name, vkey: e.key });
    }));
    const binder = $('binder');
    binder?.addEventListener('scroll', () => {
      const i = Math.round(binder.scrollLeft / binder.clientWidth);
      $('bpager').textContent = `Page ${i + 1} / ${binder.children.length}`;
    }, { passive: true });
    $('set-share').addEventListener('click', async () => {
      const cells = [];
      for (const e of entries) for (let k = 0; k < target; k++) cells.push(have(e) > k);
      const canvas = progressImage({ name: cur.name, code: setCode(entries), have: p.have, total: p.total, cells });
      const r = await shareCanvas(canvas, `cardscan-masterset-${cur.exp}.png`, cur.name);
      if (r === 'downloaded') toast('Picture saved');
    });
    $('set-sort').addEventListener('change', (ev) => {
      cur.sort = ev.target.value;
      saveTracked(loadTracked().map((x) => (x.exp === cur.exp ? { ...x, sort: cur.sort } : x)));
      renderSet();
    });
    body.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => { cur.rarity = b.dataset.r; renderSet(); }));
    body.querySelectorAll('.tick').forEach((b) => b.addEventListener('click', async () => {
      const k = b.dataset.key;
      const before = loadManual();
      const m = { ...before };
      const coll = fromColl[k] || 0;
      const total = Math.max(0, coll + (m[k] || 0));
      if (total < cur.target) m[k] = (m[k] || 0) + 1;
      else if ((m[k] || 0) > 0) m[k] = 0; // full by own ticks: clear them (collection copies stay)
      else {
        // the tick comes from the collection: ask what to do
        const e = cur.entries.find((x) => x.key === k);
        const v = await choose(e?.name || 'This card', [
          { label: 'Remove from collection', value: 'coll', danger: true },
          { label: "Don't count for this set", value: 'set' },
        ], 'This tick comes from a card in your collection.');
        if (v === 'coll') {
          const list = loadCollection();
          const i = list.findIndex((x) => x.vkey === k);
          if (i < 0) return;
          const [gone] = list.splice(i, 1);
          saveCollection(list);
          onCollectionChange();
          renderSet();
          toast('Removed from your collection', 5000, { label: 'Undo', run: () => {
            const l = loadCollection(); l.splice(i, 0, gone); saveCollection(l); onCollectionChange(); renderSet();
          } });
          return;
        }
        if (v !== 'set') return;
        m[k] = -coll;
      }
      if (!m[k]) delete m[k];
      saveManual(m);
      renderSet();
      toast(total < cur.target ? 'Ticked' : 'Tick removed', 5000, { label: 'Undo', run: () => { saveManual(before); renderSet(); } });
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

  function showPocket(key) {
    const el = $('set-body').querySelector(`.pocket[data-key="${key}"]`);
    const binder = $('binder');
    if (!el || !binder) return;
    const page = el.closest('.bpage');
    binder.scrollTo({ left: page.offsetLeft - binder.offsetLeft, behavior: 'instant' });
    el.classList.add('spot');
    setTimeout(() => el.classList.remove('spot'), 4000);
  }

  function closeSet() { $('set-page').hidden = true; syncBody(); renderList(); }
  $('set-back').addEventListener('click', () => history.back());

  return { renderList, summaries, openSet, closeSet, refresh: () => { if (cur && !$('set-page').hidden) renderSet(); } };
}
