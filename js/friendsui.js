// Friends screens: my QR code (one or a carousel of codes), scanning a friend's code, the friends list and a
// friend's page – everything they have: trade matches, cards, binders (mastersets), wishlist, decks.
import { $, esc, eur, toast, countTo } from './util.js';
import { lang } from './i18n.js';
import { syncBody } from './cardpage.js';
import { quickPrice } from './cardpage.js';
import { versionImage } from './prices.js';
import { holoKind, openHolo } from './holo.js';
import { fanHTML } from './fan.js';
import { copyText, langOf } from './copy.js';
import { loadCollection } from './store.js';
import { loadWish } from './lists.js';
import { loadTracked, ownedCounts } from './masters.js';
import { progress } from './mastercalc.js';
import { collectorStats, bestMaster } from './quartet.js';
import { quartetLoading, showQuartet, quartetOnBack } from './quartetui.js';
import { gameKey, GAME } from './game.js';
import {
  buildSnapshot, encodeSnapshot, decodeSnapshot, splitParts, createCollector, readSnapshot, friendOwned,
  matchTrades, suggestOffer, loadMe, saveMe, loadFriends, addFriend, removeFriend, restoreFriend, renameFriend,
} from './friends.js';

const DE = lang === 'de';
const loadScript = (src) => new Promise((ok, fail) => {
  const s = document.createElement('script');
  s.src = src; s.onload = ok; s.onerror = () => fail(new Error(`Could not load ${src}`));
  document.head.appendChild(s);
});

export function createFriends({ api, openCard, loadDecks }) {
  // ---------- names <-> passcodes (small QR codes) ----------
  let codeMaps = null;
  async function codes() {
    if (!codeMaps) {
      const pc = await api.passcodes().catch(() => ({}));
      const toName = new Map(), toCode = new Map();
      for (const [code, name] of Object.entries(pc || {})) {
        const n = Array.isArray(name) ? name[0] : name;
        if (!toName.has(Number(code))) toName.set(Number(code), n);
        if (!toCode.has(n)) toCode.set(n, Number(code));
      }
      codeMaps = { toName, toCode };
    }
    return codeMaps;
  }

  // ---------- prices (cached) ----------
  const prices = new Map();
  const priceOf = (name, vkey) => {
    const k = `${name}|${vkey || ''}`;
    if (!prices.has(k)) prices.set(k, quickPrice(api, { name, vkey }).catch(() => null));
    return prices.get(k);
  };
  const picOf = (p) => (p?.image || p?.guess ? versionImage({ image: p.image || p.guess }, 'show') : '');
  const kindOf = (p) => (p?.exact && p?.rarity ? holoKind(p.rarity) : 'plain');

  function openSheet(id) {
    const page = $(id);
    if (page.hidden) { page.hidden = false; syncBody(); history.pushState({ sheet: id }, ''); }
    page.scrollTop = 0;
  }
  function closeSheet(id) { const p = $(id); if (p && !p.hidden) { p.hidden = true; syncBody(); } }

  // ---------- my code ----------
  let carousel = null;
  async function mySnapshot() {
    const { toCode } = await codes();
    let ticks = {};
    try { ticks = JSON.parse(localStorage.getItem(gameKey('cardscan-owned-v1')) || '{}'); } catch { /* ignore */ }
    return buildSnapshot({
      me: loadMe(), collection: loadCollection(), wish: loadWish(), tracked: loadTracked(), ticks,
      decks: loadDecks(), toCode: (n) => toCode.get(n) ?? n,
    });
  }
  async function showMyCode() {
    openSheet('qr-page');
    const me = loadMe();
    $('qr-name').value = me.name || '';
    $('qr-box').innerHTML = '<p class="note">Making your code…</p>';
    try {
      if (!window.qrcode) await loadScript(new URL('./vendor/qrcode.js', import.meta.url).href);
      const data = await encodeSnapshot(await mySnapshot());
      const parts = splitParts(data, me.id);
      const svgs = parts.map((text) => {
        const qr = window.qrcode(0, 'L');
        qr.addData(text, 'Byte');
        qr.make();
        return qr.createSvgTag({ cellSize: 4, margin: 3, scalable: true });
      });
      const n = loadCollection().length;
      $('qr-sum').textContent = `${n} card${n === 1 ? '' : 's'} · ${svgs.length === 1 ? 'one code' : `${svgs.length} codes in turn – let your friend hold the camera on it`}`;
      let i = 0;
      const show = () => {
        $('qr-box').innerHTML = svgs[i];
        $('qr-count').textContent = svgs.length > 1 ? `Code ${i + 1} of ${svgs.length}` : '';
        i = (i + 1) % svgs.length;
      };
      clearInterval(carousel);
      show();
      if (svgs.length > 1) carousel = setInterval(show, 650);
      $('qr-page')._link = `${location.origin}${location.pathname}#friend=${data}`;
      $('qr-page')._parts = parts; // (tests)
    } catch (e) {
      $('qr-box').innerHTML = `<p class="note">Could not make the code (${esc(e.message)}).</p>`;
    }
  }
  $('qr-name').addEventListener('change', () => { const me = loadMe(); me.name = $('qr-name').value.trim().slice(0, 30); saveMe(me); showMyCode(); });
  $('qr-link').addEventListener('click', async () => {
    const link = $('qr-page')._link;
    if (!link) return;
    const text = DE ? `Schau dir meine Yu-Gi-Oh-Sammlung in Curio an: ${link}` : `Have a look at my Yu-Gi-Oh! collection in Curio: ${link}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Curio', text });
      else { await navigator.clipboard.writeText(link); toast('Link copied'); }
    } catch { /* cancelled */ }
  });

  // ---------- scanning a friend's code ----------
  let stream = null, scanTimer = null;
  async function scanFriend() {
    openSheet('qrscan-page');
    $('qrscan-status').textContent = 'Hold the camera on your friend\'s code.';
    const add = createCollector();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
      const video = $('qrscan-video');
      video.srcObject = stream;
      await video.play();
      let detect;
      if ('BarcodeDetector' in window && (await window.BarcodeDetector.getSupportedFormats?.())?.includes('qr_code')) {
        const bd = new window.BarcodeDetector({ formats: ['qr_code'] });
        detect = async () => (await bd.detect(video)).map((c) => c.rawValue);
      } else {
        if (!window.jsQR) await loadScript(new URL('./vendor/jsQR.js', import.meta.url).href);
        const cv = document.createElement('canvas');
        const cx = cv.getContext('2d', { willReadFrequently: true });
        detect = async () => {
          const w = video.videoWidth, h = video.videoHeight;
          if (!w) return [];
          const s = Math.min(1, 900 / Math.max(w, h));
          cv.width = Math.round(w * s); cv.height = Math.round(h * s);
          cx.drawImage(video, 0, 0, cv.width, cv.height);
          const r = window.jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: 'dontInvert' });
          return r ? [r.data] : [];
        };
      }
      const tick = async () => {
        if ($('qrscan-page').hidden) return;
        try {
          for (const text of await detect()) {
            const r = add(text);
            if (!r) { $('qrscan-status').textContent = 'That is not a Curio code.'; continue; }
            $('qrscan-status').textContent = r.total > 1 ? `Got ${r.have} of ${r.total} codes – keep holding` : 'Got it';
            if (r.done) { navigator.vibrate?.([30, 50, 30]); await received(r.data); return; }
          }
        } catch { /* next frame */ }
        scanTimer = setTimeout(tick, 120);
      };
      tick();
    } catch (e) {
      $('qrscan-status').textContent = 'The camera could not be opened. Allow camera access, or ask your friend for the link.';
    }
  }
  function stopScan() {
    clearTimeout(scanTimer);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  async function received(data) {
    stopScan();
    try {
      const snap = await decodeSnapshot(data);
      if (snap.id === loadMe().id) { toast('That is your own code'); history.back(); return; }
      if ((snap.g || 'ygo') !== GAME.id) { toast('That code is from another card game'); history.back(); return; }
      const r = addFriend(snap);
      if (!r) { toast('Not enough space on this phone for this collection'); return; }
      toast(r.updated ? `${r.entry.name}'s collection updated` : `${r.entry.name} added to your friends`);
      closeSheet('qrscan-page');
      renderList();
      openFriend(r.entry.id, true);
    } catch {
      toast('That code could not be read – try again');
      history.back();
    }
  }

  // A link: …/#friend=<data>
  async function fromLink() {
    const m = /#friend=([\w-]+)/.exec(location.hash);
    if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);
    await received(m[1]);
  }

  // ---------- friends list ----------
  async function renderList() {
    const list = loadFriends();
    $('friends-empty').hidden = list.length > 0;
    const myWish = loadWish();
    const mine = loadCollection();
    const { toName } = await codes();
    $('friends-list').innerHTML = list.map((f) => {
      const fr = readSnapshot(f.snap, (c) => toName.get(c));
      const n = fr.collection.reduce((s, e) => s + e.count, 0);
      const m = matchTrades({ mine, myWish, theirs: fr.collection, theirWish: fr.wish });
      const date = new Date(f.snap.t).toLocaleDateString(DE ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short' });
      return `<li><button type="button" data-id="${esc(f.id)}"><span class="what"><b>${esc(f.name)}</b>
        <small>${n} cards · ${fr.sets.length} set${fr.sets.length === 1 ? '' : 's'} · shared ${date}</small></span>
        <span class="eur">${m.forMe.length || m.forThem.length ? `<span class="dealtag">${m.forMe.length + m.forThem.length} trade${m.forMe.length + m.forThem.length === 1 ? '' : 's'}</span>` : ''}</span></button></li>`;
    }).join('');
    $('friends-list').querySelectorAll('button[data-id]').forEach((b) => b.addEventListener('click', () => openFriend(b.dataset.id)));
  }

  // ---------- a friend's page ----------
  let cur = null;
  async function openFriend(id, fresh = false) {
    const f = loadFriends().find((x) => x.id === id);
    if (!f) return;
    const { toName } = await codes();
    cur = { f, fr: readSnapshot(f.snap, (c) => toName.get(c)), tab: null };
    const m = matchTrades({ mine: loadCollection(), myWish: loadWish(), theirs: cur.fr.collection, theirWish: cur.fr.wish });
    cur.m = m;
    cur.tab = m.forMe.length || m.forThem.length ? 'trade' : 'cards';
    $('friend-title').textContent = f.name;
    openSheet('friend-page');
    if (fresh) $('friend-page').scrollTop = 0;
    renderFriend();
  }

  async function renderFriend() {
    const { f, fr, m } = cur;
    const n = fr.collection.reduce((s, e) => s + e.count, 0);
    const date = new Date(f.snap.t).toLocaleDateString(DE ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long' });
    const tabs = [['trade', `Trade${m.forMe.length + m.forThem.length ? ` ${m.forMe.length + m.forThem.length}` : ''}`], ['cards', `Cards ${n}`], ['binders', `Binders ${fr.sets.length}`], ['wish', `Wishlist ${fr.wish.length}`], ['decks', `Decks ${fr.decks.length}`]];
    $('friend-body').innerHTML = `
      <div id="fr-fan"></div>
      <div class="summary deck-sum">
        <p class="muted small">Value of ${esc(f.name)}'s collection</p>
        <p class="result-total" id="fr-total">…</p>
        <p class="muted small">Shared on ${date} · prices of today</p>
      </div>
      <button type="button" class="btn wide qt-open" id="fr-quartet">🃏 Collector quartet vs ${esc(f.name)}</button>
      <div class="seg small fr-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" data-ft="${k}" class="${cur.tab === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
      <div id="fr-tab"></div>
      <div class="actions">
        <button type="button" class="btn" id="fr-rename">Rename</button>
        <button type="button" class="btn danger" id="fr-remove">Remove friend</button>
      </div>
      <p class="muted small">To see newer cards, ask ${esc(f.name)} to show you their code again.</p>`;
    $('friend-body').querySelectorAll('[data-ft]').forEach((b) => b.addEventListener('click', () => { cur.tab = b.dataset.ft; renderFriend(); }));
    $('fr-quartet').addEventListener('click', () => startQuartet());
    $('fr-remove').addEventListener('click', () => {
      removeFriend(f.id); history.back(); renderList();
      toast(`${f.name} removed`, 5000, { label: 'Undo', run: () => { restoreFriend(f); renderList(); } });
    });
    $('fr-rename').addEventListener('click', () => {
      const name = window.prompt(DE ? 'Name für diesen Freund' : 'Name for this friend', f.name);
      if (!name?.trim()) return;
      renameFriend(f.id, name.trim().slice(0, 30)); cur.f = { ...f, name: name.trim().slice(0, 30) };
      $('friend-title').textContent = cur.f.name; renderList(); renderFriend();
    });
    renderTab();
    // value + fan (prices of today, as they come in)
    const rows = await Promise.all(fr.collection.map(async (e) => ({ e, p: await priceOf(e.name, e.vkey) })));
    if (cur?.f.id !== f.id) return;
    const total = rows.reduce((s, r) => s + (r.p?.lo ?? 0) * r.e.count, 0);
    const hi = rows.reduce((s, r) => s + (r.p?.hi ?? r.p?.lo ?? 0) * r.e.count, 0);
    if ($('fr-total')) countTo($('fr-total'), total, hi, 900);
    const top = rows.filter((r) => picOf(r.p)).sort((a, b) => (b.p.lo ?? 0) - (a.p.lo ?? 0)).slice(0, 5);
    if ($('fr-fan') && top.length >= 2) {
      $('fr-fan').innerHTML = fanHTML(top.map((r) => ({ src: picOf(r.p), kind: kindOf(r.p), name: r.e.name })));
      $('fr-fan').querySelectorAll('.fan-card').forEach((b) => b.addEventListener('click', () => openHolo(
        top.map((r) => ({ name: r.e.name, rarity: r.p.exact ? r.p.rarity : '', src: picOf(r.p), kind: kindOf(r.p), price: r.p.lo })), Number(b.dataset.i))));
    }
  }

  // ---------- collector quartet: my collection against theirs ----------
  async function masterOf(sets, owned) {
    const list = await Promise.all(sets.map(async (t) => {
      const hid = new Set((t.hidden || []).map(String));
      const entries = (await api.setEntries(t.exp).catch(() => [])).filter((e) => !hid.has(String(e.key)));
      const p = progress(entries, owned, t.target || 1);
      return { name: t.name, have: p.have, total: p.total };
    }));
    return bestMaster(list);
  }
  async function startQuartet() {
    const { f, fr } = cur;
    quartetLoading(f.name);
    const rowsOf = (list, one) => Promise.all(list.map(async (e) => ({ name: e.name, count: one ? 1 : e.count, lang: one ? langOf(e) : e.lang, p: await priceOf(e.name, e.vkey) })));
    const [mine, theirs, myMaster, theirMaster] = await Promise.all([
      rowsOf(loadCollection(), true), rowsOf(fr.collection, false),
      masterOf(loadTracked(), ownedCounts().all), masterOf(fr.sets, friendOwned(fr)),
    ]);
    const side = (name, rows, master) => {
      const stats = collectorStats(rows, { kindOf: holoKind, master });
      return { name, stats, pic: stats.top.image ? versionImage({ image: stats.top.image }, 'show') : '' };
    };
    showQuartet(side(loadMe().name || (DE ? 'Ich' : 'Me'), mine, myMaster), side(f.name, theirs, theirMaster));
  }

  const cardRow = (e, p, extra = '') => `<li><button type="button" data-name="${esc(e.name)}" data-vkey="${esc(e.vkey || '')}">
      ${picOf(p) ? `<img class="vimg" loading="lazy" src="${esc(versionImage({ image: p.image || p.guess }, 'preview'))}" alt="">` : ''}
      <span class="what"><b>${e.count > 1 ? `${e.count}× ` : ''}${esc(e.name)}</b><small>${esc(p?.label || '')}${copyText(e, { wish: e.wish }) ? ` · <span class="copytag">${esc(copyText(e, { wish: e.wish }))}</span>` : ''}${extra}</small></span>
      <span class="eur">${p ? eur(p.lo) : '…'}</span></button></li>`;
  const bindOpen = (root) => root.querySelectorAll('button[data-name]').forEach((b) => b.addEventListener('click', () => openCard({ name: b.dataset.name, vkey: b.dataset.vkey || null })));

  async function renderTab() {
    const { fr, m, f } = cur;
    const el = $('fr-tab');
    const tab = cur.tab;
    if (tab === 'cards') {
      const rows = await Promise.all(fr.collection.map(async (e) => ({ e, p: await priceOf(e.name, e.vkey) })));
      if (cur.tab !== tab) return;
      rows.sort((a, b) => (b.p?.lo ?? 0) - (a.p?.lo ?? 0));
      el.innerHTML = rows.length ? `<ul class="rows">${rows.map(({ e, p }) => cardRow(e, p)).join('')}</ul>` : '<p class="empty">No cards yet.</p>';
      bindOpen(el);
    } else if (tab === 'wish') {
      const mineNames = new Set(loadCollection().map((x) => x.name.toLowerCase()));
      const groups = new Map();
      for (const w of fr.wish) { const g = w.deck || ''; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(w); }
      const parts = await Promise.all([...groups].map(async ([g, ws]) => {
        const rows = await Promise.all(ws.map(async (w) => ({ w, p: await priceOf(w.name, w.vkey) })));
        return `<h2 class="wsec">${esc(g || 'Singles')} <span class="muted small">${ws.length}</span></h2><ul class="rows">${rows.map(({ w, p }) =>
          cardRow({ ...w, count: 1, wish: true }, p, mineNames.has(w.name.toLowerCase()) ? ' · <span class="dealtag">you have it</span>' : '')).join('')}</ul>`;
      }));
      if (cur.tab !== tab) return;
      el.innerHTML = parts.join('') || '<p class="empty">Nothing on the wishlist.</p>';
      bindOpen(el);
    } else if (tab === 'decks') {
      el.innerHTML = fr.decks.length ? fr.decks.map((d, i) => `<details class="fold"><summary>${esc(d.name)} <span class="muted small">${d.cards.reduce((s, c) => s + c.need, 0)} cards</span></summary>
        <ul class="rows compact">${d.cards.map((c) => `<li><button type="button" data-name="${esc(c.name)}"><span class="what"><b>${c.need}× ${esc(c.name)}</b></span></button></li>`).join('')}</ul></details>`).join('') : '<p class="empty">No decks.</p>';
      bindOpen(el);
    } else if (tab === 'binders') {
      const owned = friendOwned(fr);
      const sets = await Promise.all(fr.sets.map(async (s) => {
        const hid = new Set(s.hidden);
        const entries = (await api.setEntries(s.exp).catch(() => [])).filter((e) => !hid.has(e.key));
        const have = entries.filter((e) => (owned[e.key] || 0) >= 1).length;
        return { s, entries, have };
      }));
      if (cur.tab !== tab) return;
      el.innerHTML = sets.length ? sets.map(({ s, entries, have }, i) => `
        <details class="fold fr-set" data-i="${i}"><summary>${esc(s.name)} <span class="muted small">${have}/${entries.length}${s.target > 1 ? ` · collects ×${s.target}` : ''}</span></summary>
          <span class="pbar"><span style="width:${entries.length ? have / entries.length * 100 : 0}%"></span></span>
          <div class="binder" data-binder="${i}"></div><p class="small muted bpager"></p></details>`).join('') : '<p class="empty">No mastersets tracked.</p>';
      // binder pages only when a set is opened (pictures)
      el.querySelectorAll('.fr-set').forEach((d) => d.addEventListener('toggle', () => {
        if (!d.open) return;
        const { entries } = sets[Number(d.dataset.i)];
        const box = d.querySelector('.binder');
        if (box.childElementCount) return;
        const pages = [];
        for (let k = 0; k < entries.length; k += 9) pages.push(entries.slice(k, k + 9));
        box.innerHTML = pages.map((pg) => `<div class="bpage">${pg.map((e) => {
          const h = (owned[e.key] || 0) >= 1;
          return `<button type="button" class="pocket ${h ? 'have' : 'miss'} k-${holoKind(e.rarity)}" data-key="${e.key}" title="${esc(e.name)}">
            ${e.image ? `<img loading="lazy" src="${esc(versionImage(e, 'preview'))}" alt="" draggable="false" onerror="this.remove()">` : `<span class="pname">${esc(e.name)}</span>`}</button>`;
        }).join('')}${'<span class="pocket empty"></span>'.repeat(9 - pg.length)}</div>`).join('');
        const pager = d.querySelector('.bpager');
        pager.textContent = `Page 1 / ${pages.length}`;
        box.addEventListener('scroll', () => { pager.textContent = `Page ${Math.round(box.scrollLeft / box.clientWidth) + 1} / ${pages.length}`; }, { passive: true });
        box.querySelectorAll('.pocket[data-key]').forEach((b) => b.addEventListener('click', () => {
          const e = entries.find((x) => x.key === b.dataset.key);
          if (e) openCard({ name: e.name, vkey: e.key });
        }));
      }));
    } else {
      // trade
      const forMe = await Promise.all(m.forMe.map(async (x) => ({ ...x, p: await priceOf(x.card.name, x.card.vkey) })));
      const forThem = await Promise.all(m.forThem.map(async (x) => ({ ...x, p: await priceOf(x.card.name, x.card.vkey) })));
      if (cur.tab !== tab) return;
      cur.forMe = forMe; cur.forThem = forThem;
      el.innerHTML = `
        <h2 class="wsec">${esc(f.name)} has ${forMe.length} from your wishlist</h2>
        ${forMe.length ? `<ul class="rows">${forMe.map(({ card, p }, i) => `<li><div class="row">
          ${picOf(p) ? `<img class="vimg" loading="lazy" src="${esc(versionImage({ image: p.image || p.guess }, 'preview'))}" alt="">` : ''}
          <button type="button" class="what plain" data-name="${esc(card.name)}" data-vkey="${esc(card.vkey || '')}"><b>${esc(card.name)}</b><small>${esc(p?.label || '')} · ${p ? eur(p.lo) : '…'}</small></button>
          <button type="button" class="btn small-btn" data-ask="${i}">Ask for trade</button></div></li>`).join('')}</ul>` : '<p class="muted small">Nothing from your wishlist – add cards you want with ♡.</p>'}
        <h2 class="wsec">You have ${forThem.length} that ${esc(f.name)} wants</h2>
        ${forThem.length ? `<ul class="rows">${forThem.map(({ card, p }) => cardRow({ ...card, count: 1 }, p)).join('')}</ul>` : '<p class="muted small">None of your cards are on their wishlist.</p>'}`;
      bindOpen(el);
      el.querySelectorAll('[data-ask]').forEach((b) => b.addEventListener('click', () => askTrade(forMe[Number(b.dataset.ask)])));
    }
  }

  // ---------- asking for a trade ----------
  async function askTrade({ card, p }) {
    const ask = p?.lo ?? 0;
    const offer = suggestOffer(ask, (cur.forThem || []).map((x) => ({ ...x.card, value: x.p?.lo ?? 0 })), (c) => c.value);
    const fmt = (c) => `${c.name}${c.value ? ` (~${eur(c.value)})` : ''}`;
    const name = cur.f.name;
    const many = offer.cards.length > 1;
    const diff = Math.round((ask - offer.value) * 100) / 100;
    const gap = offer.cards.length && diff >= Math.max(1, ask * 0.15) ? diff : 0; // offer clearly lower: say the difference
    const list = offer.cards.map(fmt).join(', ');
    const text = DE
      ? `Hey ${name}! Ich hab in Curio gesehen, dass du ${card.name}${p?.label ? ` (${p.label})` : ''} hast – die steht auf meiner Wunschliste (~${eur(ask)}).${offer.cards.length ? ` Ich könnte dir dafür ${list}${many ? ` (zusammen ~${eur(offer.value)})` : ''} anbieten – die suchst du ja${gap ? `, plus ~${eur(gap)} Ausgleich` : ''}.` : ' Hättest du Lust zu tauschen oder sie mir zu verkaufen?'} Was meinst du?`
      : `Hey ${name}! I saw in Curio that you have ${card.name}${p?.label ? ` (${p.label})` : ''} – it's on my wishlist (~${eur(ask)}).${offer.cards.length ? ` I could offer ${list}${many ? ` (together ~${eur(offer.value)})` : ''} – you're looking for ${many ? 'those' : 'that one'}${gap ? `, plus ~${eur(gap)} on top` : ''}.` : ' Would you like to trade or sell it?'} What do you think?`;
    try {
      if (navigator.share) await navigator.share({ text });
      else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    } catch { /* cancelled */ }
  }

  // ---------- wiring ----------
  $('fr-myqr').addEventListener('click', showMyCode);
  $('fr-scan').addEventListener('click', scanFriend);
  $('qr-back').addEventListener('click', () => history.back());
  $('qrscan-back').addEventListener('click', () => history.back());
  $('friend-back').addEventListener('click', () => history.back());

  // back button: which sheet was closed
  function onBack() {
    if (quartetOnBack()) return true;
    if (!$('qrscan-page').hidden) { stopScan(); closeSheet('qrscan-page'); return true; }
    if (!$('qr-page').hidden) { clearInterval(carousel); closeSheet('qr-page'); return true; }
    if (!$('friend-page').hidden) { closeSheet('friend-page'); cur = null; renderList(); return true; }
    return false;
  }

  return { renderList, fromLink, onBack, refresh: () => { if (cur && !$('friend-page').hidden) renderFriend(); } };
}
