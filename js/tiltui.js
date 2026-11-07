// Tilt scan sheet (prototype): camera with a card frame, ~2.4 s of tilting, then where it shines
// and the rarity it looks like. The result goes back to the card page (versions ordered by it).

import { $, esc } from './util.js';
import { syncBody } from './cardpage.js';
import { analyzeTilt, guessRarity, GRID_W, GRID_H, MARGIN, CAP_W, CAP_H, CELL } from './tilt.js';

const FRAMES = 24, EVERY = 100;   // ms between frames

let stream = null, busy = false, onResult = null, last = null, timer = null, deliver = null;

// Card frame in video pixels: 72 % of the height, never wider than 80 % of the width.
function guideBox(vw, vh) {
  let h = vh * 0.72, w = h * GRID_W / GRID_H;
  if (w > vw * 0.8) { w = vw * 0.8; h = w * GRID_H / GRID_W; }
  return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
}

function layoutGuide() {
  const v = $('tilt-video');
  if (!v.videoWidth) return;
  const g = guideBox(v.videoWidth, v.videoHeight);
  const st = $('tilt-stage');
  st.style.aspectRatio = `${v.videoWidth} / ${v.videoHeight}`;
  st.style.width = `min(100%, calc(58vh * ${(v.videoWidth / v.videoHeight).toFixed(4)}))`;
  Object.assign($('tilt-guide').style, {
    left: `${g.x / v.videoWidth * 100}%`, top: `${g.y / v.videoHeight * 100}%`,
    width: `${g.w / v.videoWidth * 100}%`, height: `${g.h / v.videoHeight * 100}%`,
  });
}

// The card frame plus a margin, scaled down in two steps (a camera-like average, no flicker of fine print).
const big = document.createElement('canvas'), small = document.createElement('canvas');
function grab(video) {
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

function setStatus(t) { $('tilt-status').innerHTML = t; }
function progress(p) { $('tilt-prog').style.width = `${Math.round(p * 100)}%`; }

async function startCamera() {
  stop();
  setStatus('Opening the camera…');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    const v = $('tilt-video');
    v.srcObject = stream;
    await v.play();
    layoutGuide();
    const [track] = stream.getVideoTracks();
    try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { /* not supported */ }
    $('tilt-light').hidden = !track.getCapabilities?.().torch;
    $('tilt-go').disabled = false;
    setStatus('Hold the card inside the frame – out of its sleeve, under one lamp. Press Start and tilt it slowly.');
  } catch {
    setStatus('The camera could not be opened. Allow camera access and try again.');
  }
}

function stop() {
  clearTimeout(timer);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  busy = false;
}

let torch = false;
async function toggleLight() {
  const [track] = stream?.getVideoTracks() || [];
  if (!track) return;
  torch = !torch;
  try { await track.applyConstraints({ advanced: [{ torch }] }); } catch { torch = false; }
  $('tilt-light').classList.toggle('on', torch);
}

const STEPS = ['Tilt left ←', 'Tilt right →', 'Tilt towards you ↓', 'Tilt away ↑'];
function capture() {
  if (busy || !stream) return;
  busy = true;
  $('tilt-go').disabled = true;
  $('tilt-result').innerHTML = '';
  $('tilt-map').hidden = true;
  const frames = [], video = $('tilt-video');
  const shot = () => {
    if ($('tilt-page').hidden) return;
    frames.push(grab(video));
    progress(frames.length / FRAMES);
    setStatus(`<b>${STEPS[Math.min(STEPS.length - 1, Math.floor(frames.length / FRAMES * STEPS.length))]}</b> <span>slowly, keep the card in the frame</span>`);
    if (frames.length < FRAMES) { timer = setTimeout(shot, EVERY); return; }
    setStatus('Looking at the shine…');
    setTimeout(() => finish(frames), 30);   // let the status paint first
  };
  shot();
}

function finish(frames) {
  let r = null;
  try { r = analyzeTilt(frames); } catch { r = null; }
  busy = false;
  $('tilt-go').disabled = false;
  $('tilt-go').textContent = 'Again';
  progress(0);
  if (!r?.ok) {
    last = null;
    setStatus('The card moved too much or left the frame. Keep it inside the frame and tilt it slowly – just the angle, not the place.');
    return;
  }
  const g = guessRarity(r);
  last = g;
  $('tilt-page')._last = { area: r.area, frames: r.frames, moved: r.moved, guess: g };   // for tests
  drawMap(frames[frames.length >> 1], r);
  const [first, ...rest] = g.list;
  const bar = (label, v, t) => `<div class="tilt-bar"><span>${label}</span><i style="--v:${Math.min(1, v / (t * 2)).toFixed(2)}"></i></div>`;
  const a = r.area;
  $('tilt-result').innerHTML = `
    <p class="tilt-guess">${g.clear ? 'Looks like' : 'Maybe'} <b>${esc(first.label)}</b></p>
    <p class="small muted"><span>${esc(g.why)}</span>${rest.length ? ` · <span>or ${esc(rest.map((x) => x.label).join(', '))}</span>` : ''}</p>
    ${g.clear ? '' : '<p class="note">Not sure. Try again under one bright lamp (or with the light on), tilting a bit more.</p>'}
    <div class="tilt-bars">
      ${bar('Artwork colour', a.art.colour, 0.14)}${bar('Glitter', a.art.sparkle, 0.55)}
      ${bar('Name shine', Math.max(a.name.sheen, a.name.colour * 0.097 / 0.12), 0.097)}${bar('Whole card', a.text.colour, 0.085)}
    </div>
    <div class="actions"><button class="btn primary" type="button" id="tilt-use">Show matching versions</button></div>
    <p class="small muted">Prototype: the guess only orders the versions, nothing is changed without you.</p>`;
  setStatus('');
  // the result is handed over when the back step closes the sheet (tiltOnBack)
  $('tilt-use').addEventListener('click', () => { deliver = last; history.back(); });
}

// The middle frame with glowing cells where the card shines.
function drawMap(frame, r) {
  const c = $('tilt-map'), S = 4;
  c.width = GRID_W * S; c.height = GRID_H * S;
  const x = c.getContext('2d');
  const img = new ImageData(new Uint8ClampedArray(frame.data), CAP_W, CAP_H);
  const tmp = document.createElement('canvas');
  tmp.width = CAP_W; tmp.height = CAP_H;
  tmp.getContext('2d').putImageData(img, 0, 0);
  x.imageSmoothingQuality = 'high';
  x.drawImage(tmp, MARGIN, MARGIN, GRID_W, GRID_H, 0, 0, c.width, c.height);
  x.fillStyle = 'rgba(0,0,0,.45)';
  x.fillRect(0, 0, c.width, c.height);
  const cw = CELL * S, ch = CELL * S;
  x.globalCompositeOperation = 'lighter';
  r.map.forEach((v, i) => {
    if (v < 0.08) return;
    const cx = (i % r.cols) * cw, cy = Math.floor(i / r.cols) * ch;
    const hue = (cx / c.width * 200 + cy / c.height * 160) % 360;
    x.fillStyle = `hsla(${hue}, 95%, 60%, ${(v * 0.85).toFixed(2)})`;
    x.fillRect(cx, cy, cw, ch);
  });
  x.globalCompositeOperation = 'source-over';
  c.hidden = false;
}

export function openTiltScan({ name, onResult: cb }) {
  onResult = cb;
  last = null; deliver = null;
  const page = $('tilt-page');
  $('tilt-name').textContent = name || '';
  $('tilt-result').innerHTML = '';
  $('tilt-map').hidden = true;
  $('tilt-go').textContent = 'Start';
  $('tilt-go').disabled = true;
  progress(0);
  page.hidden = false;
  syncBody();
  history.pushState({ sheet: 'tilt' }, '');
  startCamera();
}

function close() {
  stop();
  if (torch) torch = false;
  const v = $('tilt-video');
  v.srcObject = null;
  $('tilt-page').hidden = true;
  syncBody();
}

// Browser back while the sheet is open: close it. Returns true when it handled the back.
export function tiltOnBack() {
  if ($('tilt-page').hidden) return false;
  close();
  const g = deliver, cb = onResult;
  deliver = null; onResult = null;
  if (g) cb?.(g);
  return true;
}

export function bindTiltScan() {
  $('tilt-back').addEventListener('click', () => history.back());
  $('tilt-go').addEventListener('click', capture);
  $('tilt-light').addEventListener('click', toggleLight);
  $('tilt-video').addEventListener('loadedmetadata', layoutGuide);
}
