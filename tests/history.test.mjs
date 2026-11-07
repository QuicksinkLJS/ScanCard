import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyOf } from '../js/prices.js';
import { valueSeries } from '../js/depot.js';

test('price history of a version: averages, odd sale replaced by the fair trend', () => {
  assert.deepEqual(historyOf([{ avg30: 10, avg7: 12, avg1: 13, trend: 14 }]), { avg30: 10, avg7: 12, avg1: 13, trend: 14 });
  assert.equal(historyOf([{ avg30: 10, avg7: 11, avg1: 900, trend: 12 }]).avg1, 12);
  // open version: middle of the range
  assert.equal(historyOf([{ avg30: 2, trend: 4 }, { avg30: 6, trend: 8 }]).avg30, 4);
});

test('collection value series sums the cards, cards without history count with today', () => {
  const list = [
    { price: { lo: 14, hi: 14, hist: { avg30: 10, avg7: 12, avg1: 13, trend: 14 } } },
    { price: { lo: 1, hi: 3 } },
  ];
  assert.deepEqual(valueSeries(list), [12, 14, 15, 16]);
  assert.equal(valueSeries([{ price: { lo: 1, hi: 1 } }]), null);
});
