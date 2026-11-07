// Hologram (stage 1): lay the card on the table, point the camera at it – the card finder spots it once, a
// light beam rises from the card and the artwork floats above it, translucent and bluish with scan lines.
// Turning the phone moves the scene the other way (gyro), so the hologram stays above the real card.
// Without a camera (or when it is refused) the card lies on a glowing floor and the hologram floats above it.
// No sound, no confetti. Later stages: real tracking (walk around the card), the monster cut out of the artwork.

import { $, eur } from './util.js';
import { syncBody } from './cardpage.js';
import { layoutOf } from './holo.js';
import { artCrop, coverMap, boxToScreen, pickCard, sceneLayout, angleDelta, focalPx, worldShift, holoTilt, CARD_MM } from './holomath.js';

let detector = null;
let stream = null, mode = 'off', seekId = 0, raf = 0, item = null;
let ori = null, ref = null, focal = 800, pointer = null, placed = null;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function setStatus(t) { $('hg-status').textContent = t || ''; }

// ---------- camera ----------
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch { stream = null; return false; }
  const v = $('hg-video');
  v.srcObject = stream;
  try { await v.play(); } catch { /* autoplay muted is fine */ }
  const [track] = stream.getVideoTracks();
  try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { /* not supported */ }
  if (!v.videoWidth) await new Promise((r) => { v.addEventListener('loadedmetadata', r, { once: true }); setTimeout(r, 1500); });
  return mode !== 'off';
}

function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  const v = $('hg-video');
  if (v) v.srcObject = null;
}

// a smaller copy of the current video frame for the card finder
const grabCanvas = document.createElement('canvas');
function grab(v) {
  const s = Math.min(1, 960 / Math.max(v.videoWidth, v.videoHeight));
  grabCanvas.width = Math.round(v.videoWidth * s); grabCanvas.height = Math.round(v.videoHeight * s);
  grabCanvas.getContext('2d', { willReadFrequently: true }).drawImage(v, 0, 0, grabCanvas.width, grabCanvas.height);
  return { canvas: grabCanvas, s };
}

// look for the card until it is found (or the user taps it / leaves)
async function seek() {
  const id = ++seekId;
  setStatus('Lay the card on the table and point the camera at it');
  document.querySelector('#hg').classList.add('seeking');
  try { await detector.ready(); } catch {
    if (id === seekId) setStatus('The card finder could not be loaded – tap the card on the screen');
    return;
  }
  let tries = 0;
  while (id === seekId && mode === 'cam') {
    const v = $('hg-video');
    if (!v.videoWidth) { await wait(200); continue; }
    const at = ori ? { ...ori } : null;
    const { canvas, s } = grab(v);
    const boxes = await detector.find(canvas, 0.5).catch(() => []);
    if (id !== seekId || mode !== 'cam') return;
    const b = pickCard(boxes, canvas.width, canvas.height);
    if (b) {
      const map = coverMap(v.videoWidth, v.videoHeight, innerWidth, innerHeight);
      const vb = { cx: b.cx / s, cy: b.cy / s, w: b.w / s, h: b.h / s, angle: b.angle };
      place(boxToScreen(vb, map), at);
      return;
    }
    if (++tries === 6) setStatus('Not found yet – hold the phone above the card, or tap the card on the screen');
    await wait(250);
  }
}

// ---------- the scene ----------
function place(card, at = null) {
  seekId++;
  placed = card;
  ref = at || (ori ? { ...ori } : null);
  const hg = $('hg');
  hg.classList.remove('seeking', 'up');
  void hg.offsetWidth;   // restart the animations
  const L = sceneLayout(card, innerWidth, innerHeight);
  Object.assign($('hg-lock').style, {
    left: `${card.cx}px`, top: `${card.cy}px`, width: `${card.w}px`, height: `${card.h}px`,
  });
  $('hg-lock').style.setProperty('--a', `${(card.angle * 180 / Math.PI).toFixed(1)}deg`);
  const beam = $('hg-beam');
  Object.assign(beam.style, { left: `${L.beam.left}px`, top: `${L.beam.top}px`, width: `${L.beam.width}px`, height: `${L.beam.height}px` });
  beam.style.clipPath = `polygon(${L.beam.poly.map(([x, y]) => `${x}px ${y}px`).join(',')})`;
  Object.assign($('hg-holo').style, { left: `${L.art.left}px`, top: `${L.art.top}px`, width: `${L.art.size}px` });
  Object.assign($('hg-motes').style, { left: `${L.beam.left}px`, top: `${L.beam.top}px`, width: `${L.beam.width}px`, height: `${L.beam.height}px` });
  hg.classList.add('locked');
  setTimeout(() => {
    if (placed !== card) return;
    hg.classList.add('up');
    setStatus(mode === 'cam' ? 'Turn your phone slowly – the hologram stays above the card' : 'Tilt your phone or move your finger');
  }, 380);
  $('hg-again').hidden = mode !== 'cam';
}

function placeRoom() {
  // virtual table: the card lies flat low on the screen, the hologram floats above it
  const w = Math.min(innerWidth * 0.36, 190), h = w * CARD_MM.h / CARD_MM.w;
  const card = { cx: innerWidth / 2, cy: innerHeight * 0.74, w, h: h * 0.42, angle: 0 };
  Object.assign($('hg-base').style, { left: `${card.cx - w / 2}px`, top: `${card.cy - h / 2}px`, width: `${w}px`, height: `${h}px` });
  place(card);
}

// every frame: move the scene against the phone's turn, tilt the floating artwork
function frame() {
  raf = requestAnimationFrame(frame);
  if (!placed) return;
  let d = { b: 0, g: 0 };
  if (pointer) d = pointer;
  else if (ori && ref) d = { b: ori.b - ref.b, g: angleDelta(ori.g, ref.g) };
  const hg = $('hg');
  if (mode === 'cam' && !pointer) {
    const s = worldShift(d, focal);
    hg.style.setProperty('--wx', `${s.dx.toFixed(1)}px`);
    hg.style.setProperty('--wy', `${s.dy.toFixed(1)}px`);
  } else {
    hg.style.setProperty('--wx', '0px'); hg.style.setProperty('--wy', '0px');
    if (mode === 'room' && ori && ref && !pointer) ref = { b: ref.b + (ori.b - ref.b) * 0.01, g: ref.g + angleDelta(ori.g, ref.g) * 0.01 };   // settle back slowly
  }
  const t = holoTilt(d);
  hg.style.setProperty('--hx', `${t.rx}deg`);
  hg.style.setProperty('--hy', `${t.ry}deg`);
  hg.style.setProperty('--fl', `${(-d.g * 0.6).toFixed(1)}px`);
}

function onOrient(e) {
  if (e.beta == null) return;
  if (!ori) { ori = { b: e.beta, g: e.gamma }; if (!ref && placed) ref = { ...ori }; return; }
  // light smoothing against sensor jitter
  ori.b += (e.beta - ori.b) * 0.35;
  ori.g += angleDelta(e.gamma, ori.g) * 0.35;
}

// ---------- open / close ----------
// it: { src (card picture), name, rarity, price }
export async function openHologram(it) {
  if (!it?.src) return;
  item = it;
  const hg = $('hg');
  const crop = artCrop(layoutOf(it.src));
  const img = $('hg-img');
  img.src = it.src;
  Object.assign(img.style, { width: `${crop.width}%`, height: `${crop.height}%`, left: `${crop.left}%`, top: `${crop.top}%` });
  $('hg-art').style.aspectRatio = String(crop.aspect);
  $('hg-base-img').src = it.src;
  $('hg-name').textContent = it.name || '';
  $('hg-sub').textContent = [it.rarity, it.price != null ? eur(it.price) : ''].filter(Boolean).join(' · ');
  hg.className = 'hg';
  hg.style.removeProperty('--wx'); hg.style.removeProperty('--wy');
  hg.hidden = false;
  syncBody();
  history.pushState({ sheet: 'hologram' }, '');
  placed = null; ref = null; ori = null; pointer = null;
  // iOS asks before giving the gyro (needs this tap)
  try { if (typeof DeviceOrientationEvent?.requestPermission === 'function') await DeviceOrientationEvent.requestPermission(); } catch { /* no gyro */ }
  window.addEventListener('deviceorientation', onOrient);
  cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  mode = 'cam';
  setStatus('Opening the camera…');
  $('hg-again').hidden = true;
  $('hg-nocam').hidden = false;
  if (!(await startCamera())) { if (mode !== 'off') toRoom(true); return; }
  const v = $('hg-video');
  focal = focalPx(v.videoWidth || 1280, v.videoHeight || 720, coverMap(v.videoWidth || 1280, v.videoHeight || 720, innerWidth, innerHeight));
  hg.classList.add('cam');
  seek();
}

function toRoom(noCamera = false) {
  seekId++;
  stopCamera();
  mode = 'room';
  const hg = $('hg');
  hg.classList.remove('cam');
  hg.classList.add('room');
  $('hg-nocam').hidden = true;
  placeRoom();
  if (noCamera) setTimeout(() => { if (mode === 'room') setStatus('No camera – here is the hologram on a virtual table'); }, 400);
}

function close() {
  mode = 'off';
  seekId++;
  stopCamera();
  cancelAnimationFrame(raf);
  window.removeEventListener('deviceorientation', onOrient);
  placed = null; item = null;
  $('hg').hidden = true;
  $('hg-img').removeAttribute('src');
  syncBody();
}

// Browser back while the hologram is open: close it. Returns true when it handled the back.
export function hologramOnBack() {
  if ($('hg').hidden) return false;
  close();
  return true;
}

export function bindHologram({ detector: d }) {
  detector = d;
  $('hg-close').addEventListener('click', () => history.back());
  $('hg-nocam').addEventListener('click', () => toRoom());
  $('hg-again').addEventListener('click', () => { placed = null; $('hg').classList.remove('locked', 'up'); seek(); });
  const stage = $('hg-touch');
  // camera: tap the card to put the hologram there (when the finder does not see it)
  // virtual table: drag to look at it from the side
  stage.addEventListener('pointerdown', (e) => {
    if (mode === 'cam') {
      const w = Math.min(innerWidth * 0.32, 200);
      place({ cx: e.clientX, cy: e.clientY, w, h: w * CARD_MM.h / CARD_MM.w, angle: 0 });
      return;
    }
    if (mode === 'room') { pointer = drag(e); stage.setPointerCapture?.(e.pointerId); }
  });
  stage.addEventListener('pointermove', (e) => { if (pointer) pointer = drag(e); });
  const end = () => { pointer = null; if (ori) ref = { ...ori }; };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  addEventListener('resize', () => { if (mode === 'room' && placed) placeRoom(); });
}

function drag(e) {
  const x = e.clientX / innerWidth * 2 - 1, y = e.clientY / innerHeight * 2 - 1;
  return { g: x * 34, b: -y * 30 };
}

// for tests
export const _hologram = { state: () => ({ mode, placed, item: item && { ...item } }) };
