import { test } from 'node:test';
import assert from 'node:assert/strict';
import { versionOptions, rankOptions, bestOptions, priceOf, oddValues, optionCode } from '../js/prices.js';

const rows = [
  { set: '2025 Mega-Pack Tin', year: 2025, rarities: ['Ultra Rare'], codes: ['MP25-EN265', 'MP25-DE265'],
    products: [{ id: 846169, trend: 0.14, avg30: 0.21, low: 0.02, avg1: 0.05, avg7: 0.14 }] },
  { set: 'Supreme Darkness', year: 2025, rarities: ['Ultra Rare', 'Quarter Century Secret Rare'], codes: ['SUDA-KR014', 'SUDA-DE014'],
    products: [{ id: 806048, trend: 0.34 }, { id: 806154, trend: 12.12, avg1: 14, avg7: 12.21, avg30: 12.93 }] },
  { set: 'Supreme Darkness', year: 2025, rarities: [], codes: ['SUDA-EN014'], products: [{ id: 806048, trend: 0.34 }] },
];

test('one option per Cardmarket product, codes merged, English first', () => {
  const opts = versionOptions(rows);
  assert.equal(opts.length, 3);
  const suda = opts.find((o) => o.key === '806048');
  assert.deepEqual(suda.codes, ['SUDA-EN014', 'SUDA-DE014', 'SUDA-KR014']);
  assert.equal(suda.variants, 2);
});

test('printed code ranks its versions first; price range of the likely ones', () => {
  const ranked = rankOptions(versionOptions(rows), { code: { code: 'SUDA-DE014', base: 'SUDA-014' } });
  const best = bestOptions(ranked);
  assert.deepEqual(best.map((o) => o.key).sort(), ['806048', '806154']);
  assert.deepEqual(priceOf(best), { lo: 0.34, hi: 12.12, exact: false });
  assert.equal(optionCode(best[0], 'DE'), 'SUDA-DE014');
});

test('no evidence: cheapest first, nothing marked likely; chosen version on top', () => {
  const ranked = rankOptions(versionOptions(rows), {});
  assert.equal(ranked[0].key, '846169');
  assert.deepEqual(bestOptions(ranked), []);
  assert.equal(rankOptions(versionOptions(rows), { vkey: '806154' })[0].key, '806154');
});

test('pack mode prefers the set', () => {
  const ranked = rankOptions(versionOptions(rows), { pack: { prefix: 'MP25', name: '2025 Mega-Pack Tin' } });
  assert.equal(bestOptions(ranked)[0].key, '846169');
});

test('odd values: one unusual sale', () => {
  assert.deepEqual([...oddValues({ avg1: 34.99, avg7: 2.12, avg30: 2.38, trend: 4.62 })], ['avg1']);
  assert.equal(oddValues({ avg1: 1, avg7: 1.1, avg30: 1, trend: 1 }).size, 0);
});
