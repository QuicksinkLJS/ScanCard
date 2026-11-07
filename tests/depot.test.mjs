import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mid, changeOf, portfolio, setOf, pctText } from '../js/depot.js';

const list = [
  { name: 'A', price: { lo: 10, hi: 10, set: 'Set X' }, buy: { lo: 8, hi: 8 } },
  { name: 'B', price: { lo: 1, hi: 3, label: 'Set Y (2024) · 2 versions', set: 'Set Y' }, buy: { lo: 2, hi: 2 } },
  { name: 'C', price: { lo: 50, hi: 50, set: 'Set X' } },
];

test('middle of a range, change since added', () => {
  assert.equal(mid({ lo: 1, hi: 3 }), 2);
  assert.equal(changeOf(list[0]), 25);
  assert.equal(changeOf(list[2]), null);
});

test('portfolio: value change only over cards with a price when added; top and sets', () => {
  const p = portfolio(list);
  assert.equal(p.change, 2);
  assert.equal(p.pct, 20);
  assert.deepEqual(p.top.map((e) => e.name), ['C', 'A', 'B']);
  assert.deepEqual(p.bySet.map((s) => [s.set, s.value, s.count]), [['Set X', 60, 2], ['Set Y', 2, 1]]);
  assert.equal(setOf({ price: { label: 'no price found' } }), 'Version not chosen yet');
  assert.equal(pctText(20), '+20 %');
  assert.equal(pctText(-2.5), '−2.5 %');
});
