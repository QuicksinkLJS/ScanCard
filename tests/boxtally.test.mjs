import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addToBox, boxResult } from '../js/boxtally.js';

test('box tally adds photos once and keeps the best pulls', () => {
  let { box } = addToBox(null, { photo: 1, packs: 3, booster: 4, lo: 10, hi: 14, pulls: [{ name: 'A', lo: 8, hi: 8 }, { name: 'B', lo: 1, hi: 1 }] });
  let r = addToBox(box, { photo: 1, packs: 3, booster: 4, lo: 10, hi: 14 });
  assert.equal(r.added, false);
  ({ box } = addToBox(box, { photo: 2, packs: 2, booster: 4, lo: 12, hi: 12, pulls: [{ name: 'C', lo: 11, hi: 11 }] }));
  assert.deepEqual([box.packs, box.cost, box.lo, box.hi], [5, 20, 22, 26]);
  assert.deepEqual(box.pulls.map((p) => p.name), ['C', 'A', 'B']);
  assert.deepEqual(boxResult(box), { lo: 10, hi: 30, win: true, maybe: false });
  assert.equal(boxResult(null), null);
});
