import { test } from 'node:test';
import assert from 'node:assert/strict';
import { otsu, largestComponent, fillHoles, cutOut, buildBody, perspective, lookAt, multiply, transform, orbitEye, summonTimeline } from '../js/summonmath.js';

// a figure (near disc with a hole and a stray near speck) in front of a far background
function scene(n = 64) {
  const d = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.hypot(x - n / 2, y - n / 2);
    d[y * n + x] = r < n / 4 ? 200 + Math.round(40 * (1 - r / (n / 4))) : 30;
    if (r < 3) d[y * n + x] = 30;                       // a hole in the figure
  }
  d[2 * n + 2] = 250;                                    // a stray near speck in the corner
  return d;
}

test('otsu splits far and near', () => {
  const t = otsu(scene());
  assert.ok(t >= 30 && t < 200);   // far = up to t
});

test('largest piece kept, holes filled', () => {
  const n = 8, bin = new Uint8Array(n * n);
  bin[0] = 1;                                            // stray pixel
  for (let y = 2; y < 7; y++) for (let x = 2; x < 7; x++) bin[y * n + x] = 1;
  bin[4 * n + 4] = 0;                                    // hole
  const l = largestComponent(bin, n, n);
  assert.equal(l[0], 0);
  assert.equal(l[4 * n + 4], 0);
  const f = fillHoles(l, n, n);
  assert.equal(f[4 * n + 4], 1);
  assert.equal(f.reduce((a, v) => a + v, 0), 25);
});

test('cut-out: the figure, without the speck, hole filled, soft edge, box', () => {
  const n = 64, c = cutOut(scene(n), n);
  assert.ok(c.ok);
  assert.equal(c.mask[2 * n + 2], 0);                    // speck gone
  assert.equal(c.mask[(n / 2) * n + n / 2], 255);        // hole filled
  assert.ok(c.share > 0.15 && c.share < 0.25);           // ~ π/16
  assert.ok(Math.abs(c.box.x1 - 0.26) < 0.05 && Math.abs(c.box.x2 - 0.74) < 0.05);
  const edge = c.mask[(n / 2) * n + Math.round(n / 4) + 1];
  assert.ok(edge > 0 && edge < 255);                     // soft
  const flat = cutOut(new Uint8Array(n * n).fill(100), n);
  assert.equal(flat.ok, false);                          // nothing stands out
});

test('body: stands on the ground, front forward, back behind, only around the figure', () => {
  const n = 64, d = scene(n), c = cutOut(d, n);
  const b = buildBody(d, c.mask, n, c.box, { height: 70, cols: 24, rows: 24 });
  const nV = 25 * 25;
  let minY = Infinity, maxY = -Infinity, maxZ = -Infinity, minZ = Infinity;
  for (let i = 0; i < nV * 2; i++) {
    minY = Math.min(minY, b.pos[i * 3 + 1]); maxY = Math.max(maxY, b.pos[i * 3 + 1]);
    maxZ = Math.max(maxZ, b.pos[i * 3 + 2]); minZ = Math.min(minZ, b.pos[i * 3 + 2]);
  }
  assert.equal(minY, 0);
  assert.equal(maxY, 70);
  assert.ok(maxZ > 3 && minZ < -1);                      // volume both ways
  assert.ok(b.index.length > 0 && b.index.length < 24 * 24 * 12);   // corners left out
  const mid = 12 * 25 + 12;
  assert.ok(Math.abs(b.normal[mid * 3 + 2]) > 0.5);      // the centre faces forward
  assert.ok(b.side[mid] === 1 && b.side[nV + mid] === 0);
});

test('matrices: a point in front of the camera lands in the middle of the screen', () => {
  const m = multiply(perspective(Math.PI / 4, 1, 1, 1000), lookAt([0, 0, 100], [0, 0, 0]));
  const c = transform(m, [0, 0, 0]);
  assert.ok(Math.abs(c[0] / c[3]) < 1e-6 && Math.abs(c[1] / c[3]) < 1e-6 && c[3] > 0);
  const up = transform(m, [0, 10, 0]);
  assert.ok(up[1] / up[3] > 0);                          // up stays up
  const e = orbitEye(0, 0, 100, [0, 0, 0]);
  assert.deepEqual(e.map((v) => Math.round(v)), [0, 0, 100]);
});

test('summoning: glow, beam, rise in order, then done', () => {
  assert.equal(summonTimeline(0).rise, 0);
  assert.ok(summonTimeline(0.3).glow > 0.5);
  assert.ok(summonTimeline(0.5).beam > 0.5);
  assert.ok(summonTimeline(1.2).rise > 0.4 && summonTimeline(1.2).rise < 1);
  assert.ok(summonTimeline(2.0).rise > 0.99);
  assert.equal(summonTimeline(3).done, true);
});

test('insideDistance: grows towards the middle, 0 outside', async () => {
  const { insideDistance } = await import('../js/summonmath.js');
  const n = 21, m = new Uint8Array(n * n);
  for (let y = 5; y < 16; y++) for (let x = 5; x < 16; x++) m[y * n + x] = 255;
  const d = insideDistance(m, n);
  assert.equal(d[0], 0);
  assert.equal(d[5 * n + 5], 0.5);
  assert.ok(d[10 * n + 10] > 5 && d[10 * n + 10] < 6.5);
  assert.ok(d[10 * n + 10] > d[10 * n + 7]);
});
