import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progress } from '../js/mastercalc.js';

test('masterset progress counts each version once per wanted copy; no trend price = not counted', () => {
  const entries = [{ key: '1', trend: 10 }, { key: '2', trend: 2 }, { key: '3', trend: null, low: 999 }];
  assert.deepEqual(progress(entries, { 1: 3, 3: 1 }), { have: 2, total: 3, missingValue: 2, unpriced: 0 });
  assert.deepEqual(progress(entries, { 1: 3 }, 2), { have: 2, total: 6, missingValue: 4, unpriced: 1 });
});

test('sorting a set: number (natural), value, name, rarity, missing first', async () => {
  const { sortEntries } = await import('../js/mastercalc.js');
  const E = [
    { name: 'C card', code: 'YAC1-JP010', trend: 5, rarity: 'Ultra Rare', key: 'a' },
    { name: 'A card', code: 'YAC1-JP002', trend: null, rarity: 'Secret Rare', key: 'b' },
    { name: 'B card', code: 'YAC1-JP100', trend: 40, rarity: '', key: 'c' },
    { name: 'D card', code: '', trend: 1, rarity: 'Common', key: 'd' },
  ];
  const rank = (r) => ({ 'Common': 0, 'Ultra Rare': 10, 'Secret Rare': 20 }[r] ?? -1);
  const keys = (by, o = {}) => sortEntries(E, by, { rank, ...o }).map((e) => e.key).join('');
  assert.equal(keys('number'), 'bacd');
  assert.equal(keys('value'), 'cadb');
  assert.equal(keys('value-asc'), 'dacb');
  assert.equal(keys('name'), 'bcad');
  assert.equal(keys('rarity'), 'badc');
  assert.equal(keys('missing', { have: (e) => (e.key === 'b' ? 1 : 0) }), 'acdb');
});

test('set numbers from the card data when Cardmarket has none', async () => {
  const { fillCodes } = await import('../js/mastercalc.js');
  const infos = new Map([['Aqua Madoor', { bases: ['BE1-109', 'LOB-027', 'LOB-021'] }], ['Armaill', { bases: ['LOB-055'] }], ['Neo', { bases: [] }]]);
  const out = fillCodes([{ name: 'Aqua Madoor', code: '' }, { name: 'Armaill', code: '' }, { name: 'Neo', code: '' }], infos);
  assert.deepEqual(out.map((e) => e.code), ['LOB-021', 'LOB-055', '']);
  assert.deepEqual(fillCodes([{ name: 'X', code: '' }], new Map()).map((e) => e.code), ['']);
});
