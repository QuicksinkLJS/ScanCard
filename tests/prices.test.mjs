import { test } from 'node:test';
import assert from 'node:assert/strict';
import { versionOptions, rankOptions, bestOptions, priceOf, oddValues, optionCode } from '../js/prices.js';

const rows = [
  { set: '2025 Mega-Pack Tin', year: 2025, date: '2025-09-04', rarities: ['Ultra Rare'], codes: ['MP25-EN265', 'MP25-DE265'],
    products: [{ id: 846169, trend: 0.14, avg30: 0.21, low: 0.02, avg1: 0.05, avg7: 0.14 }] },
  { set: 'Supreme Darkness', year: 2025, date: '2025-01-23', rarities: ['Ultra Rare', 'Quarter Century Secret Rare'], codes: ['SUDA-KR014', 'SUDA-DE014'],
    products: [{ id: 806048, trend: 0.34 }, { id: 806154, trend: 12.12, avg1: 14, avg7: 12.21, avg30: 12.93 }] },
  { set: 'Supreme Darkness', year: 2025, date: '2025-01-23', rarities: [], codes: ['SUDA-EN014'], products: [{ id: 806048, trend: 0.34 }] },
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

test('OCG versions first for a Japanese card', () => {
  const ocg = [...rows, { set: 'Original Artwork Collection (OCG)', year: 2026, date: '2026-09-28', rarities: [], codes: [],
    products: [{ id: 913868, trend: 0.07 }, { id: 913869, trend: 1.14 }] }];
  const ranked = rankOptions(versionOptions(ocg), { lang: 'JP' });
  assert.deepEqual(bestOptions(ranked).map((o) => o.key), ['913868', '913869']);
  assert.equal(rankOptions(versionOptions(ocg), { lang: 'DE' })[0].set, 'Original Artwork Collection (OCG)'); // newest first, not preferred
  assert.deepEqual(bestOptions(rankOptions(versionOptions(ocg), { lang: 'DE' })), []);
});

test('no evidence: newest release first, nothing marked likely; chosen version on top', () => {
  const ranked = rankOptions(versionOptions(rows), {});
  assert.equal(ranked[0].key, '846169'); // Mega-Pack Tin, Sept 2025
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

test('version filter: set code, set name, rarity', async () => {
  const { filterOptions } = await import('../js/prices.js');
  const opts = [
    { set: 'Mega Pack 2019', codes: ['MP19-EN001'], rarity: 'Ultra Rare', label: '', rarities: ['Ultra Rare'] },
    { set: 'Tin of Ancient Battles 2009', codes: ['TN09-EN002', 'TN09-DE002'], rarity: 'Secret Rare', label: '', rarities: [] },
    { set: 'Legend of Blue Eyes', codes: ['LOB-EN001'], rarity: 'Ultra Rare', label: '', rarities: [] },
  ];
  assert.deepEqual(filterOptions(opts, 'mp19').map((o) => o.set), ['Mega Pack 2019']);
  assert.deepEqual(filterOptions(opts, 'TN09-DE').map((o) => o.set), ['Tin of Ancient Battles 2009']);
  assert.deepEqual(filterOptions(opts, 'lobEN001').map((o) => o.set), ['Legend of Blue Eyes']);
  assert.deepEqual(filterOptions(opts, 'blue eyes').map((o) => o.set), ['Legend of Blue Eyes']);
  assert.equal(filterOptions(opts, 'secret').length, 1);
  assert.equal(filterOptions(opts, '').length, 3);
});

test('version filter: rarity short forms put exactly that rarity first', async () => {
  const { filterOptions } = await import('../js/prices.js');
  const opts = [
    { set: 'A', codes: ['A-EN1'], rarity: 'Ultra Rare', label: '', rarities: ['Ultra Rare'] },
    { set: 'B', codes: ['B-KR1'], rarity: '', label: '', rarities: ['Ultra Rare', 'Quarter Century Secret Rare'] },
    { set: 'C', codes: ['C-EN1'], rarity: 'Quarter Century Secret Rare', label: '', rarities: ['Quarter Century Secret Rare'] },
    { set: 'D', codes: ['D-EN1'], rarity: 'Secret Rare', label: '', rarities: ['Secret Rare'] },
    { set: 'E', codes: ['E-EN1'], rarity: 'Prismatic Secret Rare', label: '', rarities: [] },
  ];
  const sets = (q) => filterOptions(opts, q).map((o) => o.set).join('');
  for (const q of ['QCSR', 'qcr', 'quarter century', 'Quarter Century Secret Rare', '25th']) assert.equal(sets(q), 'CB', q);
  assert.equal(sets('ScR'), 'D');
  assert.equal(sets('secret rare'), 'D');
  assert.equal(sets('UR'), 'AB');
  assert.equal(sets('psr'), 'E');
  assert.equal(sets('mp19'), '');
});

test('outlier trend (Sky Striker €8975) stays out of ranges and sums', async () => {
  const { fairTrend, priceOf } = await import('../js/prices.js');
  const { progress } = await import('../js/mastercalc.js');
  const sky = { trend: 8975, avg1: 2.5, avg7: 3.1, avg30: 2.9, low: 1.5 };
  assert.deepEqual(fairTrend(sky), { v: 2.9, odd: true });
  assert.equal(fairTrend({ trend: 30, avg1: 28, avg7: 31, avg30: 26 }).odd, false);
  assert.equal(fairTrend({ trend: 12, avg1: 2, avg7: 3 }).odd, false); // small amounts: no alarm
  const p = priceOf([sky, { trend: 5 }]);
  assert.equal(p.hi, 5); assert.equal(p.outlier, true);
  // set entries only have trend + low
  assert.equal(fairTrend({ trend: 900, low: 2 }).odd, true);
  assert.equal(fairTrend({ trend: 115, low: 5 }).odd, false);
  assert.equal(fairTrend({ trend: 40, low: 1 }).odd, false);
  assert.equal(progress([{ key: 'a', trend: 900, low: 2 }, { key: 'b', trend: 3 }], {}).missingValue, 5);
});
