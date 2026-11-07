import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTilt, guessRarity, tiltRank, findMotion, gradMap, CAP_W, CAP_H } from '../js/tilt.js';
import { rarityQuery } from '../js/prices.js';
import { synthFrames, SYNTH_KINDS } from './tiltsynth.mjs';

test('tilt scan: lines up a moved and squeezed frame', () => {
  const f = synthFrames('common', { T: 12 });
  const g = f.map((x) => gradMap(x.data, CAP_W, CAP_H));
  // frame 6 is the reference; frame 3 is moved by about (+2.6, +3.0) px and 2-4 % squeezed relative to it
  const m = findMotion(g[6], g[3]);
  const truth = (k) => ({ dx: 4 * Math.sin(k * 0.5), dy: 3 * Math.cos(k * 0.37), sx: 1 - 0.05 * Math.abs(Math.sin(k * 0.4)), sy: 1 - 0.03 * Math.abs(Math.cos(k * 0.3)) });
  const A = truth(6), B = truth(3);
  assert.ok(Math.abs(m.dx - (B.dx - A.dx * B.sx / A.sx)) <= 1, `dx ${m.dx}`);
  assert.ok(Math.abs(m.dy - (B.dy - A.dy * B.sy / A.sy)) <= 1, `dy ${m.dy}`);
});

test('tilt scan: guesses the rarity from the foil pattern (synthetic cards)', () => {
  for (const seed of [1, 2]) {
    for (const kind of SYNTH_KINDS) {
      const g = guessRarity(analyzeTilt(synthFrames(kind, { seed })));
      assert.equal(g.list[0].key, kind, `seed ${seed}: ${kind} guessed as ${g.list.map((x) => x.key)}`);
    }
  }
});

test('tilt scan: a card held still without foil is a common', () => {
  const g = guessRarity(analyzeTilt(synthFrames('common', { still: true })));
  assert.equal(g.list[0].key, 'common');
});

test('tilt scan: too few frames or a card that left the frame', () => {
  assert.equal(analyzeTilt(synthFrames('ultra', { T: 4 })), null);
  const f = synthFrames('ultra', { T: 10 });
  // most frames show only noise (the card was moved out of the frame)
  for (let i = 0; i < 10; i++) {
    if (i === 5) continue;
    const d = f[i].data;
    for (let p = 0; p < d.length; p += 4) { d[p] = d[p + 1] = d[p + 2] = (p * 7919) % 255; }
  }
  const r = analyzeTilt(f);
  assert.equal(r.ok, false);
  assert.deepEqual(guessRarity(r).list, []);
});

test('tilt scan: versions with the guessed rarity come first, nothing is dropped', () => {
  const opts = [
    { key: 'a', rarity: 'Common' },
    { key: 'b', rarity: 'Secret Rare' },
    { key: 'c', rarity: 'Ultra Rare' },
    { key: 'd', rarity: '', rarities: ['Super Rare', 'Ultra Rare'] },
    { key: 'e', rarity: 'Quarter Century Secret Rare' },
  ];
  const guess = { list: [{ q: 'ur' }, { q: 'scr' }] };
  const r = tiltRank(opts, guess, rarityQuery);
  assert.deepEqual(r.map((o) => o.key), ['c', 'd', 'b', 'a', 'e']);
  assert.deepEqual(r.filter((o) => o.tiltMatch).map((o) => o.key), ['c', 'd']);
  assert.equal(tiltRank(opts, { list: [] }, rarityQuery), opts);
});
