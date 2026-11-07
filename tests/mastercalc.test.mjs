import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progress } from '../js/mastercalc.js';

test('masterset progress counts each version once per wanted copy; no trend price = not counted', () => {
  const entries = [{ key: '1', trend: 10 }, { key: '2', trend: 2 }, { key: '3', trend: null, low: 999 }];
  assert.deepEqual(progress(entries, { 1: 3, 3: 1 }), { have: 2, total: 3, missingValue: 2, unpriced: 0 });
  assert.deepEqual(progress(entries, { 1: 3 }, 2), { have: 2, total: 6, missingValue: 4, unpriced: 1 });
});
