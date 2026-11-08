// Live card tracking for the camera sheets (card passport, tilt scan): about 8 times a second the
// card's four edges are looked for in a small copy of the camera picture. The frame on screen turns
// green when the card is found and held still – the user sees BEFORE a picture is taken whether it works.
// From the card's shape (one side looks longer when it is closer) we also read how far it is tilted,
// and each tilt-scan picture is straightened with the found corners (no guessing of the movement).

import { grayOf, findCardQuad, homography, warpPerspective } from './passport.js';
import { GRID_W, GRID_H, MARGIN, CAP_W, CAP_H } from './tilt.js';

// ---------- pure helpers (tested in Node) ----------
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// quad: [top-left, top-right, bottom-right, bottom-left]
// yaw > 0: the right side looks longer (closer); pitch > 0: the bottom looks wider (closer)
export function quadMetrics(q) {
  const wT = dist(q[0], q[1]), wB = dist(q[3], q[2]), hL = dist(q[0], q[3]), hR = dist(q[1], q[2]);
  return {
    w: (wT + wB) / 2, h: (hL + hR) / 2,
    yaw: (hR - hL) / (hR + hL), pitch: (wB - wT) / (wB + wT),
    cx: (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy: (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4,
  };
}

// how far the card moved between two looks, as share of its height
export function quadMove(a, b) {
  if (!a || !b) return Infinity;
  const h = quadMetrics(b).h || 1;
  return Math.max(...a.map((p, i) => dist(p, b[i]))) / h;
}

export const STEADY_MOVE = 0.012;   // less than 1.2 % of the card height between two looks = held still

// Guided tilting: to one side, to the other side, forwards/backwards, the other way. A step is done when
// the measured tilt (against the start) passes the target twice in a row. Signs are taken as they come,
// so it does not matter whether the card or the phone is tilted.
export const TILT_STEPS = [
  { axis: 'yaw', label: 'Tilt the card to one side', arrow: '⇆' },
  { axis: 'yaw', label: 'Now to the other side', arrow: '⇆', opposite: true },
  { axis: 'pitch', label: 'Tilt it forwards or backwards', arrow: '⇅' },
  { axis: 'pitch', label: 'Now the other way', arrow: '⇅', opposite: true },
];
export function createTiltGuide({ yaw = 0.04, pitch = 0.055 } = {}) {
  const target = { yaw, pitch };
  let step = 0, base = null, sign = {}, hits = 0;
  return {
    get step() { return step; },
    // m: quadMetrics of the current look → {step, progress 0..1, done}
    update(m) {
      if (step >= TILT_STEPS.length) return { step, progress: 1, done: true };
      if (!base) base = { yaw: m.yaw, pitch: m.pitch };
      const s = TILT_STEPS[step], d = m[s.axis] - base[s.axis], t = target[s.axis];
      const want = s.opposite ? -(sign[s.axis] || 1) : 0;
      const v = want ? d * want : Math.abs(d);
      const progress = Math.max(0, Math.min(1, v / t));
      if (progress >= 1) hits++; else hits = 0;
      if (hits >= 2) {
        if (!s.opposite) sign[s.axis] = Math.sign(d) || 1;
        step++; hits = 0;
      }
      return { step, progress, done: step >= TILT_STEPS.length };
    },
  };
}

// ---------- the tracker ----------
const SMALL_H = 460;   // height of the guide area in the small tracking picture

// video: <video>; overlay: <canvas> laid over it; guide(vw, vh) -> {x, y, w, h} card frame in video pixels;
// guideEl: the frame element (dimmed while the card is found)
// onTick({found, quad (video pixels), metrics, steady, steadyN, size (card height / frame height)})
export function createTracker({ video, overlay, guide, guideEl = null, every = 110, onTick = () => {} }) {
  const small = document.createElement('canvas');
  const sctx = small.getContext('2d', { willReadFrequently: true });
  let timer = 0, prev = null, steadyN = 0, running = false, last = null;

  function draw(quad, state) {
    if (!overlay) return;
    const vw = video.videoWidth, vh = video.videoHeight, k = 0.25;
    if (overlay.width !== Math.round(vw * k)) { overlay.width = Math.round(vw * k); overlay.height = Math.round(vh * k); }
    const x = overlay.getContext('2d');
    x.clearRect(0, 0, overlay.width, overlay.height);
    if (!quad) return;
    x.beginPath();
    quad.forEach(([px, py], i) => (i ? x.lineTo(px * k, py * k) : x.moveTo(px * k, py * k)));
    x.closePath();
    x.lineWidth = state === 'ok' ? 4 : 3;
    x.strokeStyle = state === 'ok' ? '#4fd18b' : 'rgba(255,255,255,.85)';
    x.shadowColor = state === 'ok' ? 'rgba(79,209,139,.8)' : 'transparent';
    x.shadowBlur = state === 'ok' ? 10 : 0;
    x.stroke();
  }

  function look() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw) return null;
    const g = guide(vw, vh);
    const pad = 0.2, rx = Math.max(0, g.x - g.w * pad), ry = Math.max(0, g.y - g.h * pad);
    const rw = Math.min(vw - rx, g.w * (1 + 2 * pad)), rh = Math.min(vh - ry, g.h * (1 + 2 * pad));
    const s = Math.min(1, SMALL_H / g.h);
    small.width = Math.round(rw * s); small.height = Math.round(rh * s);
    sctx.drawImage(video, rx, ry, rw, rh, 0, 0, small.width, small.height);
    const img = sctx.getImageData(0, 0, small.width, small.height);
    const gray = grayOf(img.data, small.width, small.height);
    const rect = { x: (g.x - rx) * s, y: (g.y - ry) * s, w: g.w * s, h: g.h * s };
    const f = findCardQuad(gray, small.width, small.height, rect, { lines: 24, band: 0.16 });
    if (!f) return { found: false, g };
    const quad = f.quad.map(([x, y]) => [rx + x / s, ry + y / s]);
    return { found: true, quad, g };
  }

  function tick() {
    if (!running) return;
    let r = null;
    try { r = look(); } catch { r = null; }
    if (r?.found) {
      const steady = quadMove(prev, r.quad) < STEADY_MOVE;
      steadyN = steady ? steadyN + 1 : 0;
      prev = r.quad;
      const metrics = quadMetrics(r.quad);
      last = { found: true, quad: r.quad, metrics, steady, steadyN, size: metrics.h / r.g.h };
      draw(r.quad, steadyN >= 2 ? 'ok' : 'seen');
      guideEl?.classList.add('locked');
    } else {
      prev = null; steadyN = 0;
      last = { found: false, quad: null, metrics: null, steady: false, steadyN: 0, size: 0 };
      draw(null);
      guideEl?.classList.remove('locked');
    }
    try { onTick(last); } catch (e) { console.warn(e); }
    if (running) timer = setTimeout(tick, every);
  }

  const mid = document.createElement('canvas');
  const mctx = mid.getContext('2d', { willReadFrequently: true });
  // The card at `quad` straightened into a tilt-scan picture (CAP_W × CAP_H: card + MARGIN on every side),
  // made at 3× size and averaged down (like a camera pixel).
  function tiltFrame(quad) {
    const m = quadMetrics(quad), s = Math.min(1, (GRID_H * 3 * 1.25) / m.h);
    const xs = quad.map((p) => p[0]), ys = quad.map((p) => p[1]);
    const pad = m.h * 0.15;
    const bx = Math.max(0, Math.min(...xs) - pad), by = Math.max(0, Math.min(...ys) - pad);
    const bw = Math.min(video.videoWidth - bx, Math.max(...xs) - Math.min(...xs) + 2 * pad), bh = Math.min(video.videoHeight - by, Math.max(...ys) - Math.min(...ys) + 2 * pad);
    mid.width = Math.max(1, Math.round(bw * s)); mid.height = Math.max(1, Math.round(bh * s));
    mctx.drawImage(video, bx, by, bw, bh, 0, 0, mid.width, mid.height);
    const img = mctx.getImageData(0, 0, mid.width, mid.height);
    const K = 3, W3 = CAP_W * K, H3 = CAP_H * K;
    const dst = [[MARGIN * K, MARGIN * K], [(MARGIN + GRID_W) * K, MARGIN * K], [(MARGIN + GRID_W) * K, (MARGIN + GRID_H) * K], [MARGIN * K, (MARGIN + GRID_H) * K]];
    const src = quad.map(([x, y]) => [(x - bx) * s, (y - by) * s]);
    const H = homography(dst, src);
    const big = warpPerspective(img.data, mid.width, mid.height, H, W3, H3);
    const data = new Uint8ClampedArray(CAP_W * CAP_H * 4);
    for (let y = 0; y < CAP_H; y++) {
      for (let x = 0; x < CAP_W; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let dy = 0; dy < K; dy++) for (let dx = 0; dx < K; dx++) sum += big[((y * K + dy) * W3 + x * K + dx) * 4 + c];
          data[(y * CAP_W + x) * 4 + c] = sum / (K * K);
        }
        data[(y * CAP_W + x) * 4 + 3] = 255;
      }
    }
    return { data };
  }

  return {
    start() { if (running) return; running = true; prev = null; steadyN = 0; tick(); },
    stop() { running = false; clearTimeout(timer); draw(null); guideEl?.classList.remove('locked'); },
    get last() { return last; },
    tiltFrame,
  };
}
