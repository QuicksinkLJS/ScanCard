// Card passport sheet (prototype): record ONE copy of a card – a sharp straight photo (cut edges, centering,
// edge wear, fine texture) plus a short tilt (how the foil shines) – and later check whether a card in front
// of the camera is that same copy. Recordings stay on the phone (passstore.js).
// Steps on screen: hold still (sharp photo) → tilt in four directions, in a random order (so an old video
// can't simply be played back) → result.

import { $, esc, toast } from './util.js';
import { syncBody } from './cardpage.js';
import { analyzeTilt, guessRarity, GRID_W, GRID_H, MARGIN, CAP_W, CAP_H } from './tilt.js';
import { grayOf, sharpness, findCardQuad, rectify, passFeatures, comparePass, centeringText, foilCheck, packFeatures, unpackFeatures, passId, PASS_W, PASS_H, PX_PER_MM, EDGE_SEGS } from './passport.js';
import { savePass, getPass, deletePass, allPasses } from './passstore.js';
import { shareCanvas } from './share.js';
import { blobToDataURL } from './util.js';

const STILL_MS = 1500, STILL_EVERY = 150, TILT_FRAMES = 24, TILT_EVERY = 100;
let stream = null, ctx = null, busy = false, timer = null, viewUrl = null, torch = false;

// ---------- camera ----------
// card frame in video pixels: 80 % of the height, at most 86 % of the width
function guideBox(vw, vh) {
  let h = vh * 0.8, w = h * GRID_W / GRID_H;
  if (w > vw * 0.86) { w = vw * 0.86; h = w * GRID_H / GRID_W; }
  return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
}
function layoutGuide() {
  const v = $('pass-video');
  if (!v.videoWidth) return;
  const g = guideBox(v.videoWidth, v.videoHeight);
  const st = $('pass-stage');
  st.style.aspectRatio = `${v.videoWidth} / ${v.videoHeight}`;
  st.style.width = `min(100%, calc(56vh * ${(v.videoWidth / v.videoHeight).toFixed(4)}))`;
  Object.assign($('pass-guide').style, {
    left: `${g.x / v.videoWidth * 100}%`, top: `${g.y / v.videoHeight * 100}%`, width: `${g.w / v.videoWidth * 100}%`, height: `${g.h / v.videoHeight * 100}%`,
  });
}
async function startCamera() {
  stopCamera();
  setStatus('Opening the camera…');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false });
    const v = $('pass-video');
    v.srcObject = stream;
    await v.play().catch(() => {});
    if (!v.videoWidth) await new Promise((r) => { v.addEventListener('loadedmetadata', r, { once: true }); setTimeout(r, 2000); });
    layoutGuide();
    const [track] = stream.getVideoTracks();
    try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { /* not supported */ }
    $('pass-light').hidden = !track.getCapabilities?.().torch;
    $('pass-go').disabled = false;
    setStatus('Card out of its sleeve, on a plain dark surface, fully inside the frame. Phone straight above it, one lamp. Then press Start.');
  } catch {
    setStatus('The camera could not be opened. Allow camera access and try again.');
  }
}
function stopCamera() {
  clearTimeout(timer);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  busy = false;
  const v = $('pass-video'); if (v) v.srcObject = null;
}
async function toggleLight() {
  const [track] = stream?.getVideoTracks() || [];
  if (!track) return;
  torch = !torch;
  try { await track.applyConstraints({ advanced: [{ torch }] }); } catch { torch = false; }
  $('pass-light').classList.toggle('on', torch);
}

const setStatus = (t) => { $('pass-status').innerHTML = t || ''; };
const setStep = (t) => { $('pass-step').textContent = t || ''; $('pass-step').hidden = !t; };
const progress = (p) => { $('pass-prog').style.width = `${Math.round(p * 100)}%`; };

// ---------- recording ----------
const full = document.createElement('canvas'), best = document.createElement('canvas');
const big = document.createElement('canvas'), small = document.createElement('canvas');
function tiltGrab(video) {   // like the tilt scan: card + margin, scaled down in two steps
  const g = guideBox(video.videoWidth, video.videoHeight), s = g.w / GRID_W;
  big.width = CAP_W * 3; big.height = CAP_H * 3;
  const bx = big.getContext('2d', { willReadFrequently: true });
  bx.imageSmoothingQuality = 'high';
  bx.drawImage(video, g.x - MARGIN * s, g.y - MARGIN * s, CAP_W * s, CAP_H * s, 0, 0, big.width, big.height);
  small.width = CAP_W; small.height = CAP_H;
  const sx = small.getContext('2d', { willReadFrequently: true });
  sx.imageSmoothingQuality = 'high';
  sx.drawImage(big, 0, 0, CAP_W, CAP_H);
  return { data: sx.getImageData(0, 0, CAP_W, CAP_H).data };
}

const DIRS = [['Tilt left ←', 'l'], ['Tilt right →', 'r'], ['Tilt towards you ↓', 'd'], ['Tilt away ↑', 'u']];
function shuffled(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

function record() {
  if (busy || !stream) return;
  busy = true;
  $('pass-go').disabled = true;
  $('pass-view').innerHTML = '';
  const video = $('pass-video');
  if (!video.videoWidth) { busy = false; $('pass-go').disabled = false; return; }
  const vw = video.videoWidth, vh = video.videoHeight, g = guideBox(vw, vh);
  full.width = best.width = vw; full.height = best.height = vh;
  const fx = full.getContext('2d', { willReadFrequently: true });
  let bestSharp = -1, t0 = performance.now();
  const order = shuffled(DIRS);
  const frames = [];
  setStep('Hold still');
  const still = () => {
    if ($('pass-page').hidden) return;
    fx.drawImage(video, 0, 0, vw, vh);
    const region = fx.getImageData(Math.round(g.x), Math.round(g.y), Math.round(g.w), Math.round(g.h));
    const sh = sharpness(grayOf(region.data, region.width, region.height), region.width, region.height, { step: 3 });
    if (sh > bestSharp) { bestSharp = sh; best.getContext('2d').drawImage(full, 0, 0); }
    const el = performance.now() - t0;
    progress(Math.min(0.4, el / STILL_MS * 0.4));
    if (el < STILL_MS) { timer = setTimeout(still, STILL_EVERY); return; }
    tilt();
  };
  const tilt = () => {
    if ($('pass-page').hidden) return;
    frames.push(tiltGrab(video));
    progress(0.4 + 0.6 * frames.length / TILT_FRAMES);
    const step = order[Math.min(3, Math.floor(frames.length / (TILT_FRAMES / 4)))];
    setStep(step[0]);
    if (frames.length < TILT_FRAMES) { timer = setTimeout(tilt, TILT_EVERY); return; }
    setStep('');
    setStatus('Reading the card…');
    setTimeout(() => finish(best, g, frames, order.map((d) => d[1]).join('')), 40);
  };
  still();
}

async function finish(canvas, guide, frames, order) {
  busy = false;
  $('pass-go').disabled = false;
  progress(0);
  const fxc = canvas.getContext('2d', { willReadFrequently: true });
  const img = fxc.getImageData(0, 0, canvas.width, canvas.height);
  const gray = grayOf(img.data, img.width, img.height);
  const found = findCardQuad(gray, img.width, img.height, guide);
  if (!found) {
    setStatus('<b>The card edges were not found.</b> Lay the card on a plain, darker surface (or a lighter one for a dark card), out of the sleeve, completely inside the frame – and keep the phone still at the start.');
    return;
  }
  const flat = rectify(img.data, img.width, img.height, found.quad);
  const feat = passFeatures(flat, { layout: ctx.layout || 'normal' });
  let tilt = null;
  try { const r = analyzeTilt(frames); if (r?.ok) tilt = guessRarity(r); } catch { tilt = null; }
  const c = document.createElement('canvas');
  c.width = PASS_W; c.height = PASS_H;
  c.getContext('2d').putImageData(new ImageData(flat, PASS_W, PASS_H), 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
  const rec = {
    id: passId(), kind: ctx.mode === 'check' ? 'check' : 'pass', entryId: ctx.entryId || null, name: ctx.name || '', version: ctx.version || '', holo: ctx.kind || '',
    t: Date.now(), label: ($('pass-label').value || '').trim().slice(0, 40), order, sharp: Math.round(sharpness(grayOf(flat, PASS_W, PASS_H), PASS_W, PASS_H)),
    feat: packFeatures(feat), cent: feat.cent,
    tilt: tilt ? { list: tilt.list.slice(0, 3).map(({ key, label }) => ({ key, label })), why: tilt.why, clear: tilt.clear } : null,
    foil: foilCheck(tilt, ctx.kind), img: blob,
  };
  setStatus('');
  if (ctx.mode === 'check') {
    const pass = ctx.pass;
    rec.against = pass.id;
    rec.result = comparePass(unpackFeatures(pass.feat), feat);
    await savePass(rec).catch(() => {});
    showCheck(rec, pass);
  } else {
    if (!feat.cent) toast('Centering could not be measured – the passport is saved without it');
    await savePass(rec).catch(() => toast('Could not save the passport on this phone'));
    ctx.onCreated?.(rec);
    show(rec);
  }
}

// ---------- showing a passport ----------
const dateText = (t) => new Date(t).toLocaleDateString(document.documentElement.lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export function edgeText(edges) {
  if (!edges?.length) return '';
  const sides = ['top', 'right', 'bottom', 'left'];
  const worst = sides.map((s, i) => Math.max(...edges.slice(i * EDGE_SEGS, (i + 1) * EDGE_SEGS)));
  const spots = sides.filter((s, i) => worst[i] > 14), light = sides.filter((s, i) => worst[i] > 7 && worst[i] <= 14);
  if (!spots.length && !light.length) return 'clean';
  return [spots.length ? `white spots: ${spots.join(', ')}` : '', light.length ? `light wear: ${light.join(', ')}` : ''].filter(Boolean).join(' · ');
}
const FOIL_ICON = { ok: '🟢', unsure: '🟡', odd: '🔴', none: '⚪' };

function cardFigure(rec, url) {
  const c = rec.cent;
  const lines = c ? `<i class="pl v" style="left:${(c.l * PX_PER_MM / PASS_W * 100).toFixed(2)}%"></i><i class="pl v" style="left:${(100 - c.r * PX_PER_MM / PASS_W * 100).toFixed(2)}%"></i>
    <i class="pl h" style="top:${(c.t * PX_PER_MM / PASS_H * 100).toFixed(2)}%"></i><i class="pl h" style="top:${(100 - c.b * PX_PER_MM / PASS_H * 100).toFixed(2)}%"></i>` : '';
  return `<figure class="pass-img"><img src="${url}" alt="">${lines}</figure>`;
}

function show(rec) {
  showCapture(false);
  if (viewUrl) URL.revokeObjectURL(viewUrl);
  viewUrl = rec.img ? URL.createObjectURL(rec.img) : '';
  const c = rec.cent;
  $('pass-view').innerHTML = `
    <div class="pass-card">
      ${cardFigure(rec, viewUrl)}
      <div class="pass-info">
        <p class="pass-id">${esc(rec.id)}</p>
        <p class="pass-name"><b>${esc(rec.name)}</b>${rec.version ? `<small>${esc(rec.version)}</small>` : ''}</p>
        <dl>
          <dt>Recorded</dt><dd>${esc(dateText(rec.t))}${rec.label ? ` · ${esc(rec.label)}` : ''}</dd>
          <dt>Centering</dt><dd>${c ? `${esc(centeringText(c, ctx.layout))}<small>${c.l.toFixed(2)} / ${c.r.toFixed(2)} / ${c.t.toFixed(2)} / ${c.b.toFixed(2)} mm</small>` : 'not measured'}</dd>
          <dt>Edges</dt><dd>${esc(edgeText(unpackFeatures(rec.feat)?.edges))}</dd>
          <dt>Shine</dt><dd><span>${FOIL_ICON[rec.foil?.state] || '⚪'} <span>${esc(rec.foil?.text || '')}</span></span></dd>
          <dt>Fingerprint</dt><dd>print position, edges, ${rec.feat?.tex?.length || 0} detail areas</dd>
        </dl>
      </div>
    </div>
    <div class="actions">
      <button class="btn primary" type="button" id="pass-check">Check a card against this passport</button>
      <button class="btn" type="button" id="pass-share">Share passport</button>
    </div>
    <button class="btn wide danger" type="button" id="pass-del">Delete passport</button>
    <p class="small muted">Prototype: centering is measured to the printed artwork window. The same card should give nearly the same numbers every time – that is what the check compares.</p>`;
  $('pass-check').addEventListener('click', () => startCheck(rec));
  $('pass-share').addEventListener('click', () => sharePass(rec));
  $('pass-del').addEventListener('click', async () => {
    await deletePass(rec.id).catch(() => {});
    ctx.onDeleted?.(rec);
    history.back();
    toast('Passport deleted', 5000, { label: 'Undo', run: async () => { await savePass(rec); ctx?.onCreated?.(rec, true); toast('Restored'); } });
  });
}

function showCheck(rec, pass) {
  showCapture(false);
  const r = rec.result;
  const big = { same: ['✓', 'Same card', 'ok'], other: ['✗', 'Another copy', 'odd'], unsure: ['?', 'Not sure', 'unsure'] }[r.verdict];
  $('pass-view').innerHTML = `
    <div class="pass-verdict ${big[2]}"><span>${big[0]}</span><b>${esc(big[1])}</b><small>${esc(r.why)}</small></div>
    <dl class="pass-nums">
      <dt>Print position</dt><dd>${r.cent == null ? '–' : `${r.cent.toFixed(2)} mm difference`}</dd>
      <dt>Fine details</dt><dd>${r.tex == null ? '–' : `${Math.round(r.tex * 100)} % alike`}</dd>
      <dt>Edge wear</dt><dd>${r.edge == null ? '–' : `${Math.round(r.edge * 100)} % alike`}</dd>
      <dt>Shine</dt><dd><span>${FOIL_ICON[rec.foil?.state] || '⚪'} <span>${esc(rec.foil?.text || '')}</span></span></dd>
    </dl>
    <p class="small muted">Compared with passport ${esc(pass.id)} from ${esc(dateText(pass.t))}. Prototype – the limits are still being tuned.</p>
    <p class="small"><b>Was it really the same card?</b> Your answer helps tune the check.</p>
    <div class="actions">
      <button class="btn" type="button" data-truth="same">Yes, the same card</button>
      <button class="btn" type="button" data-truth="other">No, another copy</button>
    </div>
    <div class="actions"><button class="btn primary" type="button" id="pass-again">Check again</button></div>`;
  $('pass-view').querySelectorAll('[data-truth]').forEach((b) => b.addEventListener('click', async () => {
    rec.truth = b.dataset.truth;
    await savePass(rec).catch(() => {});
    $('pass-view').querySelectorAll('[data-truth]').forEach((x) => x.classList.toggle('on', x === b));
    toast('Thanks – noted for tuning');
  }));
  $('pass-again').addEventListener('click', () => startCheck(pass));
}

function showCapture(on) {
  $('pass-cap').hidden = !on;
  if (!on) stopCamera();
}

function startCheck(pass) {
  ctx = { ...ctx, mode: 'check', pass };
  $('pass-go').disabled = true;
  $('pass-name').textContent = `${pass.name} – check against ${pass.id}`;
  $('pass-label').value = '';
  showCapture(true);
  $('pass-view').innerHTML = '';
  $('pass-go').textContent = 'Start';
  startCamera();
}

// ---------- share picture ----------
async function sharePass(rec) {
  const W = 1080, H = 1500, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const grad = x.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#16131f'); grad.addColorStop(1, '#0b0a10');
  x.fillStyle = grad; x.fillRect(0, 0, W, H);
  const img = await createImageBitmap(rec.img);
  const ch = 1100, cw = ch * PASS_W / PASS_H;
  x.drawImage(img, 70, 200, cw, ch);
  x.fillStyle = '#ffd76a'; x.font = '700 30px system-ui, sans-serif';
  x.fillText('CARD PASSPORT', 70, 90);
  x.fillStyle = '#fff'; x.font = '750 46px system-ui, sans-serif';
  x.fillText(rec.name.slice(0, 34), 70, 150);
  const tx = 70 + cw + 50, line = (label, val, y) => {
    x.fillStyle = '#9b9aa8'; x.font = '400 26px system-ui, sans-serif'; x.fillText(label, tx, y);
    x.fillStyle = '#fff'; x.font = '600 30px system-ui, sans-serif';
    String(val).split('\n').forEach((v, i) => x.fillText(v.slice(0, 22), tx, y + 40 + i * 36));
  };
  line('ID', rec.id, 260);
  line('Recorded', dateText(rec.t), 380);
  line('Centering', rec.cent ? centeringText(rec.cent, rec.feat?.layout).replace(' · ', '\n') : '–', 500);
  line('Edges', edgeText(unpackFeatures(rec.feat)?.edges).replace(' · ', '\n'), 660);
  line('Shine', rec.foil?.state === 'ok' ? 'fits the version' : rec.foil?.state === 'odd' ? 'check' : '–', 800);
  x.fillStyle = '#6d6c78'; x.font = '400 24px system-ui, sans-serif';
  x.fillText('Curio · card passport (prototype) · recorded on the owner\'s phone', 70, H - 60);
  await shareCanvas(c, `curio-passport-${rec.id}.png`, rec.name);
}

// ---------- open / close ----------
// opts: {entryId, name, version, kind (holo kind of the version), layout, mode: 'create' | 'view', pass?, onCreated, onDeleted}
export function openPassport(opts) {
  ctx = { mode: 'create', ...opts };
  const page = $('pass-page');
  page.hidden = false;
  syncBody();
  history.pushState({ sheet: 'pass' }, '');
  page.scrollTop = 0;
  $('pass-go').textContent = 'Start';
  if (ctx.mode === 'view' && ctx.pass) {
    $('pass-name').textContent = ctx.name || ctx.pass.name;
    show(ctx.pass);
    return;
  }
  $('pass-name').textContent = ctx.name || '';
  $('pass-label').value = '';
  $('pass-view').innerHTML = '';
  $('pass-go').disabled = true;
  progress(0); setStep('');
  showCapture(true);
  startCamera();
}

export function passOnBack() {
  if ($('pass-page').hidden) return false;
  stopCamera();
  $('pass-page').hidden = true;
  if (viewUrl) { URL.revokeObjectURL(viewUrl); viewUrl = null; }
  syncBody();
  ctx?.onClose?.();
  return true;
}

// Everything recorded, as one file for the twin test (pictures included)
export async function exportPasses() {
  const list = await allPasses();
  const records = [];
  for (const r of list) records.push({ ...r, img: r.img ? await blobToDataURL(r.img) : null });
  return { app: 'Curio', kind: 'passports', v: 1, t: Date.now(), records };
}

export function bindPassport() {
  $('pass-back').addEventListener('click', () => history.back());
  $('pass-go').addEventListener('click', record);
  $('pass-light').addEventListener('click', toggleLight);
  $('pass-video').addEventListener('loadedmetadata', layoutGuide);
}
export { getPass };
