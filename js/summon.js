// Summon (prototype): your card lies on a duel field, a column of light shoots up and the monster climbs out of
// the card – cut out of the artwork with the depth map and given a body (front + back) – and stands above it.
// Drag (or tilt the phone) to walk around it. Your own photo only (official pictures can't be read, no CORS).

import { $ } from './util.js';
import { depthOf, MODEL_MB } from './depth.js';
import { artWindow } from './livemath.js';
import { cutOut, buildBody, perspective, lookAt, multiply, orbitEye, summonTimeline } from './summonmath.js';
import { CARD_MM } from './holomath.js';
import { syncBody } from './cardpage.js';

const CW = CARD_MM.w, CH = CARD_MM.h;   // 59 × 86

// ---------- shaders ----------
const BODY_VS = `attribute vec3 aPos; attribute vec2 aUv; attribute float aAlpha; attribute vec3 aNormal; attribute float aSide;
uniform mat4 uMvp; uniform vec3 uOffset; varying vec2 vUv; varying float vAlpha; varying vec3 vN; varying float vSide; varying float vY; varying vec3 vP;
void main() { vec3 p = aPos + uOffset; vUv = aUv; vAlpha = aAlpha; vN = aNormal; vSide = aSide; vY = p.y; vP = p; gl_Position = uMvp * vec4(p, 1.0); }`;
const BODY_FS = `precision mediump float;
uniform sampler2D uImg; uniform vec4 uArt; uniform vec3 uLight; uniform vec3 uEye; uniform float uRise; uniform float uTime;
varying vec2 vUv; varying float vAlpha; varying vec3 vN; varying float vSide; varying float vY; varying vec3 vP;
void main() {
  if (vAlpha < 0.5 || vY < 0.0) discard;                     // outline of the monster; below the card = still inside
  vec3 col = texture2D(uImg, uArt.xy + vUv * (uArt.zw - uArt.xy)).rgb;
  vec3 n = normalize(vN);
  vec3 v = normalize(uEye - vP);
  if (dot(n, v) < 0.0) n = -n;
  float lambert = max(dot(n, normalize(uLight)), 0.0);
  float light = mix(0.62, 1.12, lambert);
  if (vSide < 0.5) { light *= 0.55; col = mix(col, vec3(dot(col, vec3(0.3, 0.55, 0.15))), 0.35); }   // the back: in its own shadow
  col *= light;
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col += rim * vec3(0.35, 0.6, 1.0) * 0.35;
  float band = smoothstep(7.0, 0.0, vY) * (1.0 - uRise) * 1.6;  // where it comes out of the card: glowing
  col += band * vec3(0.4, 0.8, 1.0);
  gl_FragColor = vec4(col, 1.0);
}`;
const CARD_VS = `attribute vec3 aPos; attribute vec2 aUv; uniform mat4 uMvp; varying vec2 vUv; varying vec3 vP;
void main() { vUv = aUv; vP = aPos; gl_Position = uMvp * vec4(aPos, 1.0); }`;
const CARD_FS = `precision mediump float;
uniform sampler2D uImg; uniform sampler2D uMask; uniform vec4 uArt; uniform float uEmpty; uniform float uGlow; uniform float uTime;
varying vec2 vUv; varying vec3 vP;
void main() {
  vec3 col = texture2D(uImg, vUv).rgb;
  vec2 a = (vUv - uArt.xy) / (uArt.zw - uArt.xy);
  if (a.x > 0.0 && a.x < 1.0 && a.y > 0.0 && a.y < 1.0) {
    float m = texture2D(uMask, a).r * uEmpty;                     // the monster has left: its place is dark and glows a little
    col = mix(col, col * 0.18 + vec3(0.05, 0.12, 0.25), m);
  }
  vec2 e = min(vUv, 1.0 - vUv);
  float edge = smoothstep(0.035, 0.0, min(e.x, e.y * 0.69));
  col += uGlow * (edge * 1.2 + 0.18) * vec3(0.35, 0.7, 1.0);
  gl_FragColor = vec4(col, 1.0);
}`;
const FIELD_FS = `precision mediump float; varying vec2 vUv; varying vec3 vP; uniform float uTime; uniform float uGlow;
void main() {
  float r = clamp(length(vP.xz) / 420.0, 0.0, 1.0);
  float fade = 1.0 - smoothstep(0.0, 1.0, r);                     // melts into the background, no horizon edge
  vec2 g = abs(fract(vP.xz / 18.0) - 0.5);
  float line = smoothstep(0.47, 0.5, max(g.x, g.y));
  float ring = smoothstep(1.2, 0.0, abs(length(vP.xz) - 70.0 - 4.0 * sin(uTime))) * 0.8;
  vec3 bg = vec3(0.02, 0.03, 0.06);
  vec3 col = mix(bg, vec3(0.05, 0.08, 0.16), fade) + (line * vec3(0.12, 0.3, 0.6) * 0.7 + ring * vec3(0.3, 0.6, 1.0) * (0.3 + uGlow)) * fade;
  gl_FragColor = vec4(col, 1.0);
}`;
const FX_VS = `attribute vec3 aPos; attribute vec2 aUv; uniform mat4 uMvp; varying vec2 vUv; void main() { vUv = aUv; gl_Position = uMvp * vec4(aPos, 1.0); }`;
const BEAM_FS = `precision mediump float; varying vec2 vUv; uniform float uBeam; uniform float uTime;
void main() {
  float x = abs(vUv.x - 0.5) * 2.0;
  float core = pow(1.0 - x, 3.0);
  float fade = (1.0 - vUv.y) * smoothstep(0.0, 0.05, vUv.y);
  float flick = 0.85 + 0.15 * sin(uTime * 30.0 + vUv.y * 20.0);
  gl_FragColor = vec4(vec3(0.45, 0.8, 1.0) * core * fade * uBeam * flick * 1.4, 1.0);
}`;
const SHADOW_FS = `precision mediump float; varying vec2 vUv; uniform float uRise;
void main() { float d = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(0.0, 0.0, 0.0, smoothstep(1.0, 0.2, d) * 0.55 * uRise); }`;
const SPARK_VS = `attribute vec3 aSeed; uniform mat4 uMvp; uniform float uTime; uniform float uOn; varying float vA;
void main() {
  float life = fract(aSeed.z + uTime * 0.35);
  float ang = aSeed.x * 6.2832, rad = 6.0 + aSeed.y * 30.0;
  vec3 p = vec3(cos(ang) * rad * (1.0 - life * 0.5), life * 120.0, sin(ang) * rad * 0.6 * (1.0 - life * 0.5) - 5.0);
  vA = (1.0 - life) * uOn;
  gl_Position = uMvp * vec4(p, 1.0);
  gl_PointSize = (2.0 + aSeed.y * 4.0) * (1.0 - life * 0.6);
}`;
const SPARK_FS = `precision mediump float; varying float vA;
void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.55, 0.85, 1.0) * smoothstep(0.5, 0.0, d) * vA, 1.0); }`;

function program(gl, vs, fs) {
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = new Proxy({}, { get: (c, k) => (k in c ? c[k] : (c[k] = gl.getUniformLocation(p, k))) });
  const a = new Proxy({}, { get: (c, k) => (k in c ? c[k] : (c[k] = gl.getAttribLocation(p, k))) });
  return { p, u, a };
}
function buffer(gl, data, target = gl.ARRAY_BUFFER) {
  const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b;
}
function attr(gl, loc, buf, size) {
  if (loc < 0) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
}
function tex(gl, unit, upload) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  upload(); return t;
}
// a flat quad: corners p0..p3 (counter-clockwise from bottom-left), uvs
function quad(gl, pts, uvs = [0, 1, 1, 1, 1, 0, 0, 0]) {
  return { pos: buffer(gl, new Float32Array(pts.flat())), uv: buffer(gl, new Float32Array(uvs)), idx: buffer(gl, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.ELEMENT_ARRAY_BUFFER) };
}

let st = null;

function setMsg(text, pct = null) {
  $('sm-msg').textContent = text;
  $('sm-bar').style.setProperty('--p', pct == null ? '0%' : `${Math.round(pct * 100)}%`);
  $('sm-bar').hidden = pct == null;
}

// src: your photo (data: URL); layout: normal | pendulum | manga
export async function openSummon({ src, layout = 'normal', name = '' }) {
  if (st) return;
  const page = $('summon');
  page.hidden = false;
  syncBody();
  history.pushState({ sheet: 'summon' }, '');
  $('sm-title').textContent = name;
  $('sm-wait').hidden = false;
  $('sm-fallback').hidden = true;
  page.dataset.state = 'loading';
  const s = st = { raf: 0, yaw: 0, pitch: 0.3, goal: { yaw: 0, pitch: 0.3 }, touched: 0, gyro: null, t0: 0, off: [] };
  const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); s.off.push(() => el.removeEventListener(ev, fn, opt)); };
  try { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().catch(() => {}); } catch { /* ignore */ }
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    if (st !== s) return;
    const box = artWindow(layout);
    setMsg(`Loading the depth model (${MODEL_MB} MB, only the first time)…`, 0);
    const depth = await depthOf(img, box, {
      key: `${src.length}:${src.slice(-64)}:${layout}`,
      onProgress: (p) => { if (st === s) setMsg(p < 1 ? `Loading the depth model (${MODEL_MB} MB, only the first time)…` : 'Calling the monster…', p < 1 ? p : null); },
    });
    if (st !== s) return;
    setMsg('Calling the monster…');
    const cut = cutOut(depth.map, depth.size);
    if (!cut.ok) {
      page.dataset.state = 'nofigure';
      setMsg("Curio couldn't find a figure in this artwork that could step out.");
      $('sm-fallback').hidden = false;
      return;
    }
    // the body: as tall as about 85 % of the card, never wider than ~1.6 cards
    const artAspect = ((box.x2 - box.x1) * CW) / ((box.y2 - box.y1) * CH);
    const bw = cut.box.x2 - cut.box.x1, bh = cut.box.y2 - cut.box.y1;
    let height = 74;
    if ((bw / bh) * artAspect * height > 96) height = 96 / ((bw / bh) * artAspect);
    const body = buildBody(depth.map, cut.mask, depth.size, cut.box, { height, artAspect });
    s.height = height;

    const canvas = $('sm-canvas');
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(canvas.clientWidth * dpr); canvas.height = Math.round(canvas.clientHeight * dpr);
    const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('no webgl');
    s.gl = gl;
    const big = gl.getExtension('OES_element_index_uint');
    if (body.index instanceof Uint32Array && !big) throw new Error('no uint index');
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    tex(gl, 0, () => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img));
    tex(gl, 1, () => gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, depth.size, depth.size, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, cut.mask));

    const P = {
      body: program(gl, BODY_VS, BODY_FS), card: program(gl, CARD_VS, CARD_FS), field: program(gl, CARD_VS, FIELD_FS),
      beam: program(gl, FX_VS, BEAM_FS), shadow: program(gl, FX_VS, SHADOW_FS), spark: program(gl, SPARK_VS, SPARK_FS),
    };
    const B = {
      pos: buffer(gl, body.pos), uv: buffer(gl, body.uv), alpha: buffer(gl, body.alpha), normal: buffer(gl, body.normal), side: buffer(gl, body.side),
      idx: buffer(gl, body.index, gl.ELEMENT_ARRAY_BUFFER), n: body.index.length, type: body.index instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
    };
    const hw = CW / 2, hh = CH / 2;
    const card = quad(gl, [[-hw, 0, hh], [hw, 0, hh], [hw, 0, -hh], [-hw, 0, -hh]]);
    const field = quad(gl, [[-700, -0.4, 700], [700, -0.4, 700], [700, -0.4, -700], [-700, -0.4, -700]]);
    // where the artwork is on the card (the monster stands there)
    const artZ = -hh + ((box.y1 + box.y2) / 2) * CH;
    const shadow = quad(gl, [[-body.width * 0.45, 0.15, artZ + 16], [body.width * 0.45, 0.15, artZ + 16], [body.width * 0.45, 0.15, artZ - 12], [-body.width * 0.45, 0.15, artZ - 12]]);
    const seeds = new Float32Array(240 * 3).map(() => Math.random());
    const sparks = buffer(gl, seeds);

    page.dataset.state = 'ready';
    page._info = { share: Math.round(cut.share * 100) / 100, verts: body.pos.length / 3, tris: body.index.length / 3, ms: depth.ms };
    $('sm-wait').hidden = true;

    // input: drag = walk around it; the phone's tilt; otherwise it turns a little by itself
    const stage = $('sm-stage');
    let drag = null;
    on(stage, 'pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw: s.goal.yaw, pitch: s.goal.pitch }; s.touched = Date.now(); stage.setPointerCapture?.(e.pointerId); });
    on(stage, 'pointermove', (e) => {
      if (!drag) return;
      s.touched = Date.now();
      s.goal.yaw = Math.max(-1.25, Math.min(1.25, drag.yaw - (e.clientX - drag.x) / 160));
      s.goal.pitch = Math.max(0.05, Math.min(1.0, drag.pitch + (e.clientY - drag.y) / 220));
    });
    on(window, 'pointerup', () => { drag = null; });
    on(window, 'deviceorientation', (e) => {
      if (e.beta == null) return;
      if (!s.gyro) s.gyro = { beta: e.beta, gamma: e.gamma };
      if (Date.now() - s.touched < 2500 || performance.now() - s.t0 < 2600) return;
      s.goal.yaw = Math.max(-1.1, Math.min(1.1, (e.gamma - s.gyro.gamma) / 30));
      s.goal.pitch = Math.max(0.05, Math.min(0.9, 0.3 + (e.beta - s.gyro.beta) / 60));
    });

    const maxA = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    // one program at a time with exactly its own attributes switched on
    const use = (prog, binds) => {
      gl.useProgram(prog.p);
      for (let l = 0; l < maxA; l++) gl.disableVertexAttribArray(l);
      for (const [name, buf, size] of binds) attr(gl, prog.a[name], buf, size);
      return prog.u;
    };
    const drawQuad = (prog, q, uniforms) => {
      uniforms(use(prog, [['aPos', q.pos, 3], ['aUv', q.uv, 2]]));
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, q.idx);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };
    const beam = quad(gl, [[-1, 0, 0], [1, 0, 0], [1, 1, 0], [-1, 1, 0]], [0, 0, 1, 0, 1, 1, 0, 1]);
    s.t0 = performance.now();
    const frame = (now) => {
      if (st !== s) return;
      const t = (now - s.t0) / 1000;
      const tl = summonTimeline(t);
      if (tl.done && Date.now() - s.touched > 3000 && !s.gyro) { s.goal.yaw = Math.sin((t - 2.6) * 0.35) * 0.55; s.goal.pitch = 0.28 + Math.sin((t - 2.6) * 0.23) * 0.06; }
      s.yaw += (s.goal.yaw - s.yaw) * 0.08; s.pitch += (s.goal.pitch - s.pitch) * 0.08;
      const target = [0, s.height * 0.42, artZ];
      const eye = orbitEye(s.yaw, s.pitch, 175 + s.height * 0.6, target);
      const mvp = multiply(perspective(0.68, canvas.width / canvas.height, 2, 2000), lookAt(eye, target));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.02, 0.03, 0.06, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
      const glow = Math.max(tl.glow, 0.15 + 0.05 * Math.sin(t * 2));
      drawQuad(P.field, field, (u) => { gl.uniformMatrix4fv(u.uMvp, false, mvp); gl.uniform1f(u.uTime, t); gl.uniform1f(u.uGlow, glow); });
      drawQuad(P.card, card, (u) => {
        gl.uniformMatrix4fv(u.uMvp, false, mvp); gl.uniform1i(u.uImg, 0); gl.uniform1i(u.uMask, 1);
        gl.uniform4f(u.uArt, box.x1, box.y1, box.x2, box.y2); gl.uniform1f(u.uEmpty, tl.rise); gl.uniform1f(u.uGlow, glow); gl.uniform1f(u.uTime, t);
      });
      // shadow under the monster
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      drawQuad(P.shadow, shadow, (u) => { gl.uniformMatrix4fv(u.uMvp, false, mvp); gl.uniform1f(u.uRise, tl.rise); });
      gl.depthMask(true); gl.disable(gl.BLEND);
      // the monster: rises out of the card (what is still below the card is cut away), breathes a little at the end
      if (tl.rise > 0) {
        const u = use(P.body, [['aPos', B.pos, 3], ['aUv', B.uv, 2], ['aAlpha', B.alpha, 1], ['aNormal', B.normal, 3], ['aSide', B.side, 1]]);
        gl.uniformMatrix4fv(u.uMvp, false, mvp);
        const bob = tl.done ? Math.sin(t * 1.6) * 0.8 : 0;
        gl.uniform3f(u.uOffset, 0, -(1 - tl.rise) * s.height + tl.settle * s.height + bob + 0.2, artZ);
        gl.uniform1i(u.uImg, 0); gl.uniform4f(u.uArt, box.x1, box.y1, box.x2, box.y2);
        gl.uniform3f(u.uLight, -0.4, 0.8, 0.9); gl.uniform3fv(u.uEye, eye); gl.uniform1f(u.uRise, tl.rise); gl.uniform1f(u.uTime, t);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.idx);
        gl.drawElements(gl.TRIANGLES, B.n, B.type, 0);
      }
      // light: the column (always facing you) and the sparks – added on top, no depth writes
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
      if (tl.beam > 0.01) {
        const w = CW * 0.62, h = 190, c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
        const model = new Float32Array([c * w, 0, -sn * w, 0, 0, h, 0, 0, sn, 0, c, 0, 0, 0, artZ, 1]);
        drawQuad(P.beam, beam, (u) => { gl.uniformMatrix4fv(u.uMvp, false, multiply(mvp, model)); gl.uniform1f(u.uBeam, tl.beam); gl.uniform1f(u.uTime, t); });
      }
      const su = use(P.spark, [['aSeed', sparks, 3]]);
      gl.uniformMatrix4fv(su.uMvp, false, multiply(mvp, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, artZ + 5, 1])));
      gl.uniform1f(su.uTime, t); gl.uniform1f(su.uOn, Math.max(tl.beam, 0.25));
      gl.drawArrays(gl.POINTS, 0, 240);
      gl.depthMask(true); gl.disable(gl.BLEND);
      s.raf = requestAnimationFrame(frame);
    };
    s.raf = requestAnimationFrame(frame);
    $('sm-again').onclick = () => { s.t0 = performance.now(); s.touched = 0; s.goal = { yaw: 0, pitch: 0.3 }; };
  } catch (e) {
    console.warn('summon', e);
    if (st !== s) return;
    page.dataset.state = 'error';
    $('sm-wait').hidden = false;
    setMsg(/no webgl|uint index/.test(String(e)) ? "This phone can't draw it (no WebGL)." : 'The monster could not be summoned – check the connection and try again.');
  }
}

export function summonOnBack() {
  if ($('summon').hidden) return false;
  const s = st;
  st = null;
  if (s) {
    cancelAnimationFrame(s.raf);
    s.off.forEach((f) => f());
    try { s.gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* ignore */ }
  }
  $('summon').hidden = true;
  const old = $('sm-canvas');
  const c = document.createElement('canvas');
  c.id = 'sm-canvas'; c.className = old.className;
  old.replaceWith(c);
  syncBody();
  return true;
}

export function bindSummon() {
  $('sm-back').addEventListener('click', () => history.back());
}
