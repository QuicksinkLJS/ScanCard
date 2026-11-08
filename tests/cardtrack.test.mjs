import test from 'node:test';
import assert from 'node:assert/strict';
import { quadMetrics, quadMove, createTiltGuide, TILT_STEPS, STEADY_MOVE } from '../js/cardtrack.js';

const card = (yaw = 0, pitch = 0, dx = 0) => {
  // a 600 px tall card; yaw makes the right side longer, pitch the bottom wider
  const h = 600, w = 412, hl = h * (1 - yaw), hr = h * (1 + yaw), wt = w * (1 - pitch), wb = w * (1 + pitch);
  return [[200 - wt / 2 + dx, 300 - hl / 2], [200 + wt / 2 + dx, 300 - hr / 2], [200 + wb / 2 + dx, 300 + hr / 2], [200 - wb / 2 + dx, 300 + hl / 2]];
};

test('quadMetrics reads size and tilt from the shape', () => {
  const m = quadMetrics(card());
  assert.ok(Math.abs(m.h - 600) < 1 && Math.abs(m.w - 412) < 1);
  assert.ok(Math.abs(m.yaw) < 1e-9 && Math.abs(m.pitch) < 1e-9);
  assert.ok(quadMetrics(card(0.05)).yaw > 0.045);
  assert.ok(quadMetrics(card(0, -0.06)).pitch < -0.055);
});

test('quadMove: still vs moved', () => {
  assert.ok(quadMove(card(), card(0, 0, 3)) < STEADY_MOVE);
  assert.ok(quadMove(card(), card(0, 0, 20)) > STEADY_MOVE);
  assert.equal(quadMove(null, card()), Infinity);
});

test('tilt guide: one side, the other side, forwards, backwards – signs as they come', () => {
  const g = createTiltGuide();
  const feed = (yaw, pitch, n = 2) => { let u; for (let i = 0; i < n; i++) u = g.update(quadMetrics(card(yaw, pitch))); return u; };
  feed(0, 0);
  assert.equal(feed(0.02, 0).step, 0, 'not far enough');
  assert.equal(feed(-0.05, 0).step, 1, 'first side (negative) taken');
  assert.equal(feed(-0.05, 0).step, 1, 'same side again does not count');
  assert.equal(feed(0.05, 0).step, 2, 'other side');
  const u = feed(0, 0.07);
  assert.equal(u.step, 3);
  assert.ok(feed(0, 0.07).progress === 0, 'same direction: no progress for "the other way"');
  const end = feed(0, -0.07);
  assert.ok(end.done);
  assert.equal(TILT_STEPS.length, 4);
});

test('tilt guide: progress grows with the tilt', () => {
  const g = createTiltGuide();
  g.update(quadMetrics(card()));
  const a = g.update(quadMetrics(card(0.01))).progress, b = g.update(quadMetrics(card(0.03))).progress;
  assert.ok(a > 0 && b > a && b < 1);
});
