import test from 'node:test';
import assert from 'node:assert/strict';
import { artCrop, coverMap, boxToScreen, pickCard, sceneLayout, angleDelta, focalPx, worldShift, holoTilt } from '../js/holomath.js';

test('artCrop: the artwork window is (nearly) square and the picture is moved into it', () => {
  const c = artCrop('normal');
  assert.ok(Math.abs(c.aspect - 1) < 0.02, `aspect ${c.aspect}`);
  assert.ok(c.width > 100 && c.height > 100 && c.left < 0 && c.top < 0);
  // left edge of the artwork lands on the box's left edge: left + x1 * width = 0
  assert.ok(Math.abs(c.left + 11.6 / 76.8 * 100) < 0.05);
  const m = artCrop('manga');
  assert.ok(m.width < c.width, 'manga artwork is bigger, less zoom');
  assert.deepEqual(artCrop('unknown'), c);
});

test('coverMap / boxToScreen: video pixels to screen, long side upright, small angle', () => {
  const map = coverMap(720, 1280, 412, 900);
  assert.ok(Math.abs(map.scale - 900 / 1280) < 1e-9);
  assert.ok(map.ox < 0 && map.oy === 0);
  const s = boxToScreen({ cx: 360, cy: 640, w: 400, h: 280, angle: 0.1 }, map);
  assert.ok(s.h > s.w, 'long side becomes h');
  assert.ok(Math.abs(s.cx - 206) < 1 && Math.abs(s.cy - 450) < 1);
  assert.ok(Math.abs(s.angle) <= Math.PI / 2);
  const flipped = boxToScreen({ cx: 0, cy: 0, w: 280, h: 400, angle: 3.1 }, map);
  assert.ok(Math.abs(flipped.angle) < 0.1, `upside-down read as upright: ${flipped.angle}`);
});

test('pickCard: big card in the middle wins over a small one at the edge', () => {
  const mid = { cx: 500, cy: 400, w: 200, h: 290, score: 0.9 };
  const edge = { cx: 60, cy: 60, w: 210, h: 300, score: 0.9 };
  assert.equal(pickCard([edge, mid], 1000, 800), mid);
  assert.equal(pickCard([], 1000, 800), null);
});

test('sceneLayout: artwork above the card, inside the screen, beam from card to artwork', () => {
  const card = { cx: 206, cy: 600, w: 120, h: 175, angle: 0 };
  const L = sceneLayout(card, 412, 900);
  assert.ok(L.art.top + L.art.size < card.cy - card.h / 2, 'artwork floats above the card');
  assert.ok(L.art.left >= 0 && L.art.left + L.art.size <= 412);
  assert.ok(L.beam.top < L.art.top + L.art.size, 'beam starts under the artwork');
  assert.ok(L.beam.top + L.beam.height > card.cy - card.h / 2, 'beam reaches into the card');
  assert.equal(L.beam.poly.length, 4);
  // card near the top: the artwork is pushed down but stays visible
  const hi = sceneLayout({ ...card, cy: 150 }, 412, 900);
  assert.ok(hi.art.top >= 900 * 0.12 - 0.1);
  // card at the right edge: artwork kept inside
  const side = sceneLayout({ ...card, cx: 400 }, 412, 900);
  assert.ok(side.art.left + side.art.size <= 404.1);
});

test('angleDelta wraps around', () => {
  assert.equal(angleDelta(10, 350), 20);
  assert.equal(angleDelta(350, 10), -20);
  assert.equal(angleDelta(5, 5), 0);
});

test('worldShift: turning moves the card the right way, limited', () => {
  const f = focalPx(720, 1280, coverMap(720, 1280, 412, 900));
  assert.ok(f > 700 && f < 1300, `focal ${f}`);
  assert.deepEqual(worldShift({ b: 0, g: 0 }, f), { dx: 0, dy: 0 });
  const s = worldShift({ b: 5, g: -5 }, f);
  assert.ok(s.dy > 0 && s.dx < 0);
  assert.ok(Math.abs(s.dy - f * Math.tan(5 * Math.PI / 180)) < 1e-6);
  const big = worldShift({ b: 89, g: 0 }, f);
  assert.ok(big.dy <= f * 0.9 + 1e-9);
});

test('holoTilt: turns with the phone, never edge-on', () => {
  assert.deepEqual(holoTilt({ b: 0, g: 0 }), { rx: 0, ry: 0 });
  const t = holoTilt({ b: 90, g: -90 });
  assert.equal(t.rx, -22); assert.equal(t.ry, -30);
});
