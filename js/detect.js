// Finds all cards in a photo (YOLO with rotated boxes, trained on synthetic table photos)
// and cuts each one out as an upright card image.

import { CARD_W, CARD_H } from './camera.js';

const ORT_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/ort.min.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}

// ---- geometry: corners of a rotated box, polygon overlap (for removing duplicates) ----
function corners(b) {
  const c = Math.cos(b.angle), s = Math.sin(b.angle);
  const hw = b.w / 2, hh = b.h / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [b.cx + x * c - y * s, b.cy + x * s + y * c]);
}

function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function clip(subject, clipPoly) { // Sutherland-Hodgman, both convex
  let out = subject;
  for (let i = 0; i < clipPoly.length && out.length; i++) {
    const [ax, ay] = clipPoly[i], [bx, by] = clipPoly[(i + 1) % clipPoly.length];
    const inside = ([x, y]) => (bx - ax) * (y - ay) - (by - ay) * (x - ax) >= 0;
    const cross = ([x1, y1], [x2, y2]) => {
      const dx = x2 - x1, dy = y2 - y1;
      const t = ((ax - x1) * (by - ay) - (ay - y1) * (bx - ax)) / (dx * (by - ay) - dy * (bx - ax));
      return [x1 + t * dx, y1 + t * dy];
    };
    const input = out;
    out = [];
    for (let k = 0; k < input.length; k++) {
      const cur = input[k], prev = input[(k + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cross(prev, cur));
        out.push(cur);
      } else if (inside(prev)) {
        out.push(cross(prev, cur));
      }
    }
  }
  return out;
}

function orient(p) { // make the polygon counter-clockwise for clip()
  let s = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; s += (x2 - x1) * (y2 + y1); }
  return s > 0 ? p.slice().reverse() : p;
}

function iou(a, b) {
  const pa = orient(corners(a)), pb = orient(corners(b));
  const inter = polyArea(clip(pa, pb));
  return inter / (a.w * a.h + b.w * b.h - inter);
}

function nms(boxes, thr = 0.4) {
  boxes.sort((p, q) => q.score - p.score);
  const keep = [];
  for (const b of boxes) if (keep.every((k) => iou(k, b) < thr)) keep.push(b);
  return keep;
}

// ---- cut out an upright card ----
export function cutCard(img, b) {
  // make the long side vertical
  let { w, h, angle } = b;
  if (w > h) { [w, h] = [h, w]; angle += Math.PI / 2; }
  const c = document.createElement('canvas');
  c.width = CARD_W; c.height = CARD_H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(CARD_W / 2, CARD_H / 2);
  ctx.scale(CARD_W / w, CARD_H / h);
  ctx.rotate(-angle);
  ctx.drawImage(img, -b.cx, -b.cy);
  return c;
}

export function createDetector({ base = 'models/ygo', size = 1024, onStatus = () => {} } = {}) {
  let loading = null;

  async function load() {
    if (!window.ort) await loadScript(ORT_URL);
    onStatus('Downloading the card finder (first time only)…');
    const session = await window.ort.InferenceSession.create(`${base}/detector.onnx`, { executionProviders: ['wasm'] });
    return { ort: window.ort, session };
  }

  function ready() {
    if (!loading) { loading = load(); loading.catch(() => { loading = null; }); }
    return loading;
  }

  // Returns rotated boxes in photo pixels: {cx, cy, w, h, angle, score}
  async function find(img, minScore = 0.35) {
    const { ort, session } = await ready();
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const r = Math.min(size / W, size / H);
    const nw = Math.round(W * r), nh = Math.round(H * r);
    const px = (size - nw) / 2, py = (size - nh) / 2;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = 'rgb(114,114,114)';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, px, py, nw, nh);
    const data = ctx.getImageData(0, 0, size, size).data;
    const plane = size * size;
    const input = new Float32Array(3 * plane);
    for (let i = 0, j = 0; i < plane; i++, j += 4) {
      input[i] = data[j] / 255; input[plane + i] = data[j + 1] / 255; input[2 * plane + i] = data[j + 2] / 255;
    }
    const name = session.inputNames[0];
    const out = (await session.run({ [name]: new ort.Tensor('float32', input, [1, 3, size, size]) }))[session.outputNames[0]];
    const [, ch, n] = out.dims;
    const o = out.data;
    const boxes = [];
    for (let i = 0; i < n; i++) {
      const score = o[4 * n + i];
      if (score < minScore) continue;
      boxes.push({
        cx: (o[i] - px) / r, cy: (o[n + i] - py) / r, w: o[2 * n + i] / r, h: o[3 * n + i] / r,
        angle: o[(ch - 1) * n + i], score,
      });
    }
    return nms(boxes);
  }

  return { ready, find };
}

export { corners };
