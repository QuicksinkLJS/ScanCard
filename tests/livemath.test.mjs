import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toTensor, quantile, normalizeDepth, blur, dilate, cleanDepth, artWindow, shiftFor, introTilt, tiltFromOrientation, DEPTH_SIZE } from '../js/livemath.js';

test('tensor: CHW, ImageNet-normalised', () => {
  const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 124, 116, 104, 255]);
  const t = toTensor(rgba, 2);
  assert.equal(t.length, 12);
  assert.ok(Math.abs(t[0] - (1 - 0.485) / 0.229) < 1e-6);            // R of pixel 0
  assert.ok(Math.abs(t[4 + 1] - (1 - 0.456) / 0.224) < 1e-6);        // G of pixel 1
  assert.ok(Math.abs(t[3]) < 0.02 && Math.abs(t[7]) < 0.02 && Math.abs(t[11]) < 0.02); // grey ≈ mean -> ~0
});

test('normalise: robust to outliers, 0..1', () => {
  const raw = new Float32Array(1000).map((_, i) => i);
  raw[999] = 1e6;                                                     // one wild value
  const d = normalizeDepth(raw);
  assert.ok(d.every((v) => v >= 0 && v <= 1));
  assert.ok(d[500] > 0.4 && d[500] < 0.6);
  assert.ok(Math.abs(quantile(Array.from({ length: 101 }, (_, i) => i), 0.5) - 50) < 1);
});

test('dilate grows the near area, blur keeps the sum', () => {
  const w = 9, h = 9, d = new Float32Array(81);
  d[40] = 1;                                                          // one near pixel in the middle
  const g = dilate(d, w, h, 1);
  assert.equal(g.filter((v) => v === 1).length, 9);
  const b = blur(g, w, h, 1);
  assert.ok(Math.abs(b.reduce((a, v) => a + v, 0) - 9) < 0.5);
  assert.ok(b[40] > b[0]);
});

test('clean-up: a figure in front of a background -> figure near, focus at the background', () => {
  const n = DEPTH_SIZE, raw = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) raw[y * n + x] = (x - n / 2) ** 2 + (y - n / 2) ** 2 < (n / 4) ** 2 ? 10 : 1;
  const { map, focus, spread } = cleanDepth(raw);
  assert.equal(map.length, n * n);
  assert.ok(map[(n / 2) * n + n / 2] > 240);                          // centre = near
  assert.ok(map[5 * n + 5] < 15);                                     // corner = far
  assert.ok(focus < 0.2);                                             // the background stays in the card's plane
  assert.ok(spread > 0.5);
});

test('artwork window, tilt shift, intro, orientation', () => {
  const a = artWindow('normal');
  assert.ok(a.x1 > 0.1 && a.x2 < 0.9 && a.y1 > 0.17 && a.y2 < 0.71);
  assert.deepEqual(shiftFor({ x: 1, y: 0 }, 0.05), { x: -0.05, y: -0 });
  assert.equal(introTilt(0).done, false);
  assert.equal(introTilt(3).done, true);
  assert.ok(Math.abs(introTilt(0.65).x) > 0.5);                       // a clear look to one side
  assert.deepEqual(tiltFromOrientation({ beta: 50, gamma: -40 }, { beta: 40, gamma: 0 }), { x: -1, y: 0.5 });
});
