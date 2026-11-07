import test from 'node:test';
import assert from 'node:assert/strict';
// simple stand-in for holo.js holoKind (that module needs the DOM)
const holoKind = (r) => (/secret/i.test(r) ? 'secret' : 'common');
import { collectorStats, compare, score, bestMaster, cardCode, CATS } from '../js/quartet.js';

const rows = [
  { name: 'Blue-Eyes', count: 2, lang: 'JP', p: { lo: 10, hi: 30, exact: true, rarity: 'Secret Rare', year: 2002, image: 'a/b.jpg' } },
  { name: 'Kuriboh', count: 1, lang: 'DE', p: { lo: 1, hi: 1, exact: true, rarity: 'Common', year: 1999 } },
  { name: 'Mystery', count: 1, lang: '', p: null },
];

test('collectorStats from a collection', () => {
  const s = collectorStats(rows, { kindOf: holoKind, master: { pct: 40, name: 'YAC1' } });
  assert.equal(s.value.v, 41);           // 2 × 20 + 1
  assert.equal(s.cards.v, 4);
  assert.deepEqual(s.top, { v: 20, name: 'Blue-Eyes', image: 'a/b.jpg' });
  assert.equal(s.shiny.v, 2);
  assert.deepEqual(s.oldest, { v: 1999, name: 'Kuriboh' });
  assert.equal(s.langs.v, 2);
  assert.deepEqual(s.master, { v: 40, name: 'YAC1' });
  const empty = collectorStats([]);
  assert.equal(empty.top.v, null); assert.equal(empty.master.v, null);
});

test('compare: higher wins, oldest: lower wins, missing loses', () => {
  const a = collectorStats(rows, { kindOf: holoKind });
  const b = collectorStats([{ name: 'X', count: 9, lang: 'EN', p: { lo: 2, hi: 2, year: 2010 } }]);
  assert.equal(compare('value', a, b), 1);
  assert.equal(compare('cards', a, b), -1);
  assert.equal(compare('oldest', a, b), 1);
  assert.equal(compare('master', a, b), 0);
  assert.equal(compare('master', collectorStats([], { master: { pct: 1 } }), b), 1);
  const s = score(CATS.map((c) => c.k), a, b);
  assert.ok(s.done);
  assert.equal(s.me + s.them + s.draws, CATS.length);
});

test('bestMaster and cardCode', () => {
  assert.deepEqual(bestMaster([{ name: 'A', have: 5, total: 10 }, { name: 'B', have: 99, total: 100 }, { name: 'C', have: 0, total: 0 }]), { pct: 99, name: 'B' });
  assert.equal(bestMaster([]), null);
  assert.match(cardCode(0), /^D[1-4]$/);
  assert.match(cardCode(6000), /^A[1-4]$/);
});
