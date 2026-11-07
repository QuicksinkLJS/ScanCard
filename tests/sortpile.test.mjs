import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pileOf } from '../js/sortpile.js';

test('piles', () => {
  assert.equal(pileOf({ lo: 0.1, hi: 0.1 }), 'bulk');
  assert.equal(pileOf({ lo: 0.1, hi: 0.4 }), 'bulk');
  assert.equal(pileOf({ lo: 2, hi: 2 }), 'keep');
  assert.equal(pileOf({ lo: 0.6, hi: 4 }), 'keep');
  assert.equal(pileOf({ lo: 6, hi: 90 }), 'sell');
  assert.equal(pileOf({ lo: 0.1, hi: 12 }), 'check');
  assert.equal(pileOf(null), 'check');
});
