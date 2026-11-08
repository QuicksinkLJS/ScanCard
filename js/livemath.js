// Living artwork – the maths (no browser APIs, tested in Node): the depth model's input, cleaning up its output
// (robust range, smoothing, foreground grown a little so the monster carries its own edge), where the artwork
// sits in the card, and how far each depth moves when the card is tilted.

import { ART_BOX } from './holomath.js';

export const DEPTH_SIZE = 252;                       // model input (multiple of 14 for the ViT)
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

// RGBA pixels (size × size) -> Float32 CHW tensor data, ImageNet-normalised.
export function toTensor(rgba, size = DEPTH_SIZE) {
  const n = size * size;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) out[c * n + i] = (rgba[i * 4 + c] / 255 - MEAN[c]) / STD[c];
  }
  return out;
}

// Value at quantile q of an array (sorted copy; 63k values sort in a few ms).
export function quantile(a, q) {
  const s = Float32Array.from(a).sort();
  if (!s.length) return 0;
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
}

// Model output (relative inverse depth: bigger = nearer) -> 0 (far) … 1 (near), robust to outliers.
export function normalizeDepth(raw) {
  const lo = quantile(raw, 0.02), hi = quantile(raw, 0.98);
  const out = new Float32Array(raw.length);
  const k = hi > lo ? 1 / (hi - lo) : 0;
  for (let i = 0; i < raw.length; i++) out[i] = Math.min(1, Math.max(0, (raw[i] - lo) * k));
  return out;
}

// Box blur (separable), radius r.
export function blur(d, w, h, r = 2) {
  const tmp = new Float32Array(d.length), out = new Float32Array(d.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += d[y * w + xx]; n++; } }
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; n++; } }
      out[y * w + x] = s / n;
    }
  }
  return out;
}

// Grow near areas by r pixels (max filter): at an edge the monster's own pixels move, the background is not
// smeared across it.
export function dilate(d, w, h, r = 1) {
  const out = new Float32Array(d.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx >= 0 && xx < w && d[yy * w + xx] > m) m = d[yy * w + xx]; }
      }
      out[y * w + x] = m;
    }
  }
  return out;
}

// The whole clean-up: normalise, grow the foreground, smooth. -> {map: Uint8Array (0 far … 255 near), focus 0..1}
// focus: the depth that stays in the card's plane (the background's typical depth, so the background stays
// put a little behind and the figure comes forward).
export function cleanDepth(raw, size = DEPTH_SIZE) {
  let d = normalizeDepth(raw);
  d = dilate(d, size, size, 1);
  d = blur(d, size, size, 2);
  const map = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i++) map[i] = Math.round(d[i] * 255);
  return { map, focus: Math.round(quantile(d, 0.35) * 1000) / 1000, spread: Math.round((quantile(d, 0.9) - quantile(d, 0.1)) * 1000) / 1000 };
}

// The artwork window in the card picture (0..1), slightly inside so the frame never moves.
export function artWindow(layout = 'normal', inset = 0.004) {
  const b = ART_BOX[layout] || ART_BOX.normal;
  return { x1: b.x1 + inset, y1: b.y1 + inset, x2: b.x2 - inset, y2: b.y2 - inset };
}

// Tilt (-1..1 each) -> shift of the nearest depth in artwork units. strength: share of the artwork's width.
export function shiftFor(tilt, strength = 0.045) {
  return { x: -tilt.x * strength, y: -tilt.y * strength * 0.8 };
}

// Phone orientation relative to how it was held at the start -> tilt -1..1 (±20° = full).
export function tiltFromOrientation(e, base, range = 20) {
  const c = (v) => Math.max(-1, Math.min(1, v));
  return { x: c((e.gamma - base.gamma) / range), y: c((e.beta - base.beta) / range) };
}

// The intro: a slow look from the left to the right and back, t in seconds -> tilt. Ends at rest after `dur`.
export function introTilt(t, dur = 2.6) {
  if (t >= dur) return { x: 0, y: 0, done: true };
  const p = t / dur;
  const ease = Math.sin(p * Math.PI);                 // 0 -> 1 -> 0
  return { x: Math.sin(p * Math.PI * 2) * 0.9 * (0.4 + 0.6 * ease), y: -0.25 * ease, done: false };
}
