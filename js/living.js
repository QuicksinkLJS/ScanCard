// Living artwork (prototype): your photo of the card, and inside the artwork window the picture gets depth –
// tilt the phone (or drag) and the monster stands in front of its background, lit from where you tilt it.
// Depth comes from Depth Anything V2 Small on the phone (depth.js); drawing with WebGL. Works on pictures
// whose pixels may be read: your own photos (official CardTrader pictures don't allow that – no CORS).

import { $ } from './util.js';
import { depthOf, MODEL_MB } from './depth.js';
import { artWindow, shiftFor, tiltFromOrientation, introTilt } from './livemath.js';
import { syncBody } from './cardpage.js';

const VS = `attribute vec2 p; varying vec2 vUv;
void main() { vUv = vec2((p.x + 1.0) * 0.5, 1.0 - (p.y + 1.0) * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `precision mediump float;
uniform sampler2D uImg; uniform sampler2D uDep;
uniform vec4 uArt; uniform vec2 uShift; uniform float uFocus; uniform float uOn; uniform vec2 uTilt;
varying vec2 vUv;
float dep(vec2 a) { return texture2D(uDep, a).r; }
void main() {
  vec2 size = uArt.zw - uArt.xy;
  vec2 a = (vUv - uArt.xy) / size;
  if (a.x < 0.0 || a.x > 1.0 || a.y < 0.0 || a.y > 1.0) { gl_FragColor = texture2D(uImg, vUv); return; }
  vec2 e = min(a, 1.0 - a);
  float w = smoothstep(0.0, 0.07, min(e.x, e.y)) * uOn;      // no movement at the frame
  vec2 a0 = a;
  for (int i = 0; i < 10; i++) { a0 = clamp(a - uShift * w * (dep(a0) - uFocus), 0.0, 1.0); }
  vec4 col = texture2D(uImg, uArt.xy + a0 * size);
  float d = dep(a0);
  float px = 1.0 / 252.0;
  float dx = dep(a0 + vec2(px, 0.0)) - dep(a0 - vec2(px, 0.0));
  float dy = dep(a0 + vec2(0.0, px)) - dep(a0 - vec2(0.0, px));
  vec3 n = normalize(vec3(-dx * 7.0, -dy * 7.0, 1.0));
  vec3 L = normalize(vec3(-uTilt.x, -uTilt.y, 0.85));
  float near = smoothstep(uFocus, uFocus + 0.3, d);
  col.rgb += pow(max(dot(n, L), 0.0), 16.0) * 0.2 * near * w;  // light on the raised figure
  col.rgb *= 1.0 - 0.1 * (1.0 - smoothstep(0.0, uFocus + 0.15, d)) * w;  // the far back a touch darker
  gl_FragColor = col;
}`;

let st = null;   // the open viewer

function gl3(canvas) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('no webgl');
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
  gl.useProgram(pr);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (n) => gl.getUniformLocation(pr, n);
  return { gl, u: { img: u('uImg'), dep: u('uDep'), art: u('uArt'), shift: u('uShift'), focus: u('uFocus'), on: u('uOn'), tilt: u('uTilt') } };
}
function texture(gl, unit, setup) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  setup();
  return t;
}

function setMsg(text, pct = null) {
  $('live-msg').textContent = text;
  $('live-bar').style.setProperty('--p', pct == null ? '0%' : `${Math.round(pct * 100)}%`);
  $('live-bar').hidden = pct == null;
}

// src: picture URL with readable pixels (data: URL of your photo); layout: normal | pendulum | manga
export async function openLiving({ src, layout = 'normal', name = '', low = false }) {
  if (st) return;
  const page = $('live');
  page.hidden = false;
  syncBody();
  history.pushState({ sheet: 'live' }, '');
  $('live-title').textContent = name;
  $('live-low').hidden = !low;
  $('live-wait').hidden = false;
  page.dataset.state = 'loading';
  const s = st = { raf: 0, tilt: { x: 0, y: 0 }, target: { x: 0, y: 0 }, on: 1, onTarget: 1, strength: 0.05, touched: 0, gyro: null, t0: 0, off: [] };
  const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); s.off.push(() => el.removeEventListener(ev, fn, opt)); };
  // iOS asks before giving the phone's tilt (needs this tap)
  try { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().catch(() => {}); } catch { /* ignore */ }
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    if (st !== s) return;
    const canvas = $('live-canvas');
    const ar = img.naturalWidth / img.naturalHeight;
    canvas.style.aspectRatio = String(ar);
    const box = artWindow(layout);
    setMsg(`Loading the depth model (${MODEL_MB} MB, only the first time)…`, 0);
    const depth = await depthOf(img, box, {
      key: `${src.length}:${src.slice(-64)}:${layout}`,
      onProgress: (p) => { if (st === s) setMsg(p < 1 ? `Loading the depth model (${MODEL_MB} MB, only the first time)…` : 'Waking up the artwork…', p < 1 ? p : null); },
    });
    if (st !== s) return;
    setMsg('Waking up the artwork…');
    // the canvas at the screen's resolution (max. the photo's)
    const cw = Math.min(img.naturalWidth, Math.round(canvas.clientWidth * Math.min(2, devicePixelRatio || 1)) || 600);
    canvas.width = cw; canvas.height = Math.round(cw / ar);
    const { gl, u } = gl3(canvas);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    texture(gl, 0, () => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img));
    texture(gl, 1, () => gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, depth.size, depth.size, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, depth.map));
    gl.uniform1i(u.img, 0); gl.uniform1i(u.dep, 1);
    gl.uniform4f(u.art, box.x1, box.y1, box.x2, box.y2);
    gl.uniform1f(u.focus, depth.focus);
    s.gl = gl; s.u = u;
    page.dataset.state = 'ready';
    page._info = { ms: depth.ms, focus: depth.focus, spread: depth.spread };
    $('live-wait').hidden = true;
    // input: the phone's tilt, or a finger on the card
    on(window, 'deviceorientation', (e) => {
      if (e.beta == null) return;
      if (!s.gyro) s.gyro = { beta: e.beta, gamma: e.gamma };
      s.gyro.beta += (e.beta - s.gyro.beta) * 0.01; s.gyro.gamma += (e.gamma - s.gyro.gamma) * 0.01;   // follows how you hold it
      if (Date.now() - s.touched > 1200 && s.t0 && performance.now() - s.t0 > 2600) s.target = tiltFromOrientation(e, s.gyro);
    });
    const stage = $('live-stage');
    const point = (e) => {
      const r = stage.getBoundingClientRect();
      s.touched = Date.now();
      s.target = { x: Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)), y: Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1)) };
    };
    on(stage, 'pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) point(e); });
    on(stage, 'pointerdown', point);
    s.t0 = performance.now();
    const frame = (now) => {
      if (st !== s) return;
      const t = (now - s.t0) / 1000;
      const intro = introTilt(t);
      let goal = s.target;
      if (!intro.done) goal = intro;
      else if (!s.gyro && Date.now() - s.touched > 2500) goal = { x: Math.sin(t * 0.7) * 0.35, y: Math.cos(t * 0.5) * 0.15 };   // breathing when nothing moves it
      s.tilt.x += (goal.x - s.tilt.x) * 0.12; s.tilt.y += (goal.y - s.tilt.y) * 0.12;
      s.on += (s.onTarget - s.on) * 0.15;
      const sh = shiftFor(s.tilt, s.strength);
      gl.uniform2f(u.shift, sh.x, sh.y);
      gl.uniform2f(u.tilt, s.tilt.x, s.tilt.y);
      gl.uniform1f(u.on, s.on);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      canvas.style.transform = `rotateY(${(s.tilt.x * 9).toFixed(2)}deg) rotateX(${(-s.tilt.y * 7).toFixed(2)}deg)`;
      s.raf = requestAnimationFrame(frame);
    };
    s.raf = requestAnimationFrame(frame);
  } catch (e) {
    console.warn('living artwork', e);
    if (st !== s) return;
    page.dataset.state = 'error';
    $('live-wait').hidden = false;
    setMsg(/no webgl/.test(String(e)) ? 'This phone can\'t draw it (no WebGL).' : 'The artwork could not be brought to life – check the connection and try again.');
  }
}

export function livingOnBack() {
  if ($('live').hidden) return false;
  const s = st;
  st = null;
  if (s) {
    cancelAnimationFrame(s.raf);
    s.off.forEach((f) => f());
    try { s.gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* ignore */ }
  }
  $('live').hidden = true;
  // a fresh canvas next time (a lost context can't be reused)
  const old = $('live-canvas');
  const c = document.createElement('canvas');
  c.id = 'live-canvas'; c.className = old.className;
  old.replaceWith(c);
  syncBody();
  return true;
}

export function bindLiving() {
  $('live-back').addEventListener('click', () => history.back());
  const flat = $('live-flat');
  const down = (e) => { e.preventDefault(); if (st) st.onTarget = 0; flat.classList.add('on'); };
  const up = () => { if (st) st.onTarget = 1; flat.classList.remove('on'); };
  flat.addEventListener('pointerdown', down);
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) flat.addEventListener(ev, up);
  $('live-depth').addEventListener('input', (e) => { if (st) st.strength = 0.015 + (Number(e.target.value) / 100) * 0.075; });
}

// Pictures Curio may read: your own photos (data: URLs) – the big one from this scan, else the collection's
// small one. -> {src, low} or null
export function livingPicture(s) {
  let src = s?.bigPic || '';
  if (!src && s?.canvas) { try { src = s.canvas.toDataURL('image/jpeg', 0.92); } catch { src = ''; } }
  if (src.startsWith('data:')) return { src, low: false };
  if (s?.thumb?.startsWith('data:')) return { src: s.thumb, low: true };
  return null;
}
