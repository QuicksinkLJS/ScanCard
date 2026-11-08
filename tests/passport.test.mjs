import test from 'node:test';
import assert from 'node:assert/strict';
import {
  homography, applyH, grayOf, findCardQuad, rectify, passFeatures, comparePass, centeringText, foilCheck,
  packFeatures, unpackFeatures, passId, sharpness, PASS_W, PASS_H,
} from '../js/passport.js';
import { makeCopy, photo, quadAt } from './passsynth.mjs';

const PW = 1080, PH = 1920;

// photo -> passport features, as the app does it (guide rectangle = rough card position)
function record(copy, quad, opts = {}) {
  const img = photo(copy, quad, { pw: PW, ph: PH, ...opts });
  const g = grayOf(img, PW, PH);
  const xs = quad.map((p) => p[0]), ys = quad.map((p) => p[1]);
  // the user puts the card roughly into the guide: rectangle a little off from the real card
  const rect = { x: Math.min(...xs) + 18, y: Math.min(...ys) - 22, w: Math.max(...xs) - Math.min(...xs) - 30, h: Math.max(...ys) - Math.min(...ys) + 30 };
  const found = findCardQuad(g, PW, PH, rect);
  assert.ok(found, 'card edges not found');
  const flat = rectify(img, PW, PH, found.quad);
  return { found, f: passFeatures(flat), flat };
}

test('homography maps the four points and inverts', () => {
  const src = [[0, 0], [100, 0], [100, 150], [0, 150]], dst = [[10, 20], [120, 18], [125, 190], [5, 170]];
  const H = homography(src, dst);
  for (let i = 0; i < 4; i++) {
    const [x, y] = applyH(H, ...src[i]);
    assert.ok(Math.hypot(x - dst[i][0], y - dst[i][1]) < 1e-6);
  }
});

test('finds the cut edges within a pixel, measures centering within 0.08 mm', () => {
  const copy = makeCopy({ shift: [0.3, -0.2], seed: 11 });
  const q = quadAt(540, 1000, { turn: 0.05, persp: 0.03, scale: 15 });
  const { found, f } = record(copy, q);
  const err = Math.max(...found.quad.map((p, i) => Math.hypot(p[0] - q[i][0], p[1] - q[i][1])));
  assert.ok(err < 1.2, `corner error ${err.toFixed(2)} px`);
  // the print moved 0.3 mm right / 0.2 mm up: left gap grows, right shrinks, top shrinks, bottom grows
  const ref = record(makeCopy({ shift: [0, 0], seed: 11 }), q).f.cent;
  const c = f.cent;
  assert.ok(Math.abs((c.l - ref.l) - 0.3) < 0.08, `left ${c.l} vs ${ref.l}`);
  assert.ok(Math.abs((ref.r - c.r) - 0.3) < 0.08, `right ${c.r} vs ${ref.r}`);
  assert.ok(Math.abs((ref.t - c.t) - 0.2) < 0.08, `top ${c.t} vs ${ref.t}`);
  assert.ok(Math.abs((c.b - ref.b) - 0.2) < 0.08, `bottom ${c.b} vs ${ref.b}`);
  assert.match(centeringText(c), /^L\/R \d+\/\d+ · T\/B \d+\/\d+$/);
});

test('same copy twice = same; a twin cut differently = other; a twin cut the same has less matching detail', () => {
  const a = makeCopy({ shift: [0.12, 0.05], seed: 21 });
  const twinCut = makeCopy({ shift: [0.55, -0.1], seed: 22 });
  const twinSame = makeCopy({ shift: [0.14, 0.06], seed: 23 });
  const r1 = record(a, quadAt(540, 960, { turn: 0.02, persp: 0.01 }), { seed: 1 });
  const r2 = record(a, quadAt(520, 1010, { turn: -0.04, persp: 0.03, scale: 16.8 }), { seed: 2, light: 0.9 });
  const r3 = record(twinCut, quadAt(560, 980, { turn: 0.01 }), { seed: 3 });
  const r4 = record(twinSame, quadAt(540, 990, { turn: -0.02 }), { seed: 4 });
  const same = comparePass(r1.f, r2.f), other = comparePass(r1.f, r3.f), close = comparePass(r1.f, r4.f);
  console.log('same', same, '\nother', other, '\nclose twin', close);
  assert.equal(same.verdict, 'same');
  assert.equal(other.verdict, 'other');
  assert.notEqual(close.verdict, 'same');
  assert.ok(same.tex > close.tex + 0.1, 'texture should separate the close twin');
  assert.ok(same.edge > close.edge, 'edge wear should separate the close twin');
});

test('no card / no contrast: edges not found', () => {
  const flat = new Uint8ClampedArray(PW * PH * 4).fill(120);
  assert.equal(findCardQuad(grayOf(flat, PW, PH), PW, PH, { x: 200, y: 300, w: 680, h: 1000 }), null);
});

test('sharpness: a blurred photo scores lower', () => {
  const copy = makeCopy({ seed: 3 });
  const g = grayOf(copy, PASS_W, PASS_H);
  const blur = new Float32Array(g.length);
  for (let y = 1; y < PASS_H - 1; y++) for (let x = 1; x < PASS_W - 1; x++) {
    const p = y * PASS_W + x;
    blur[p] = (g[p] + g[p - 1] + g[p + 1] + g[p - PASS_W] + g[p + PASS_W]) / 5;
  }
  assert.ok(sharpness(g, PASS_W, PASS_H) > 2 * sharpness(blur, PASS_W, PASS_H));
});

test('features survive packing to JSON', () => {
  const { f } = record(makeCopy({ seed: 9 }), quadAt(540, 960, { scale: 15 }));
  const back = unpackFeatures(JSON.parse(JSON.stringify(packFeatures(f))));
  assert.equal(comparePass(f, back).verdict, 'same');
  assert.match(passId(), /^CP-[0-9A-F]{4}-[0-9A-F]{4}$/);
});

test('foil check against the version', () => {
  const g = (key, clear = true) => ({ clear, list: [{ key, label: key }, { key: 'secret', label: 'secret' }] });
  assert.equal(foilCheck(g('ultra'), 'ultra').state, 'ok');
  assert.equal(foilCheck(g('common'), 'ultra').state, 'odd');
  assert.equal(foilCheck(g('common', false), 'ultra').state, 'unsure');
  assert.equal(foilCheck(g('qcsr'), 'secret').state, 'ok');
  assert.equal(foilCheck(null, 'ultra').state, 'none');
  assert.equal(foilCheck(g('ultra'), 'plain').state, 'none');
});
