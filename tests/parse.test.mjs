import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findSetCodes, parseManualCode, lookupCandidates, detectFirstEdition, valueTier,
} from '../js/parse.js';
import { createApi } from '../js/api.js';

test('finds modern codes and their language', () => {
  const [c] = findSetCodes('Blue-Eyes White Dragon\nLOB-DE001\n1. Auflage');
  assert.equal(c.code, 'LOB-DE001');
  assert.equal(c.language.code, 'DE');
});

test('fixes typical OCR mistakes in the number', () => {
  assert.equal(findSetCodes('ROTA-EN0O5')[0].code, 'ROTA-EN005');
  assert.equal(findSetCodes('mp22–en1l7')[0].code, 'MP22-EN117');
  assert.equal(findSetCodes('LOB - EN 001')[0].code, 'LOB-EN001');
});

test('old European and North American codes', () => {
  const g = findSetCodes('SDK-G001')[0];
  assert.equal(g.language.code, 'DE');
  assert.equal(g.code, 'SDK-G001');
  const na = findSetCodes('SDY-046')[0];
  assert.equal(na.language.name, 'English (NA)');
});

test('ignores ATK/DEF numbers and plain words', () => {
  assert.deepEqual(findSetCodes('ATK/3000 DEF/2500 89631139'), []);
  assert.deepEqual(findSetCodes('Dragon-Type Effect'), []);
});

test('Japanese and Korean are detected but marked unsupported', () => {
  assert.equal(findSetCodes('LOB-JP001')[0].language.supported, false);
  assert.equal(findSetCodes('LOB-KR001')[0].language.code, 'KR');
});

test('manual input and lookup candidates', () => {
  const p = parseManualCode('lob-de001');
  assert.deepEqual(lookupCandidates(p), ['LOB-EN001', 'LOB-E001', 'LOB-001']);
  assert.equal(parseManualCode('hello'), null);
});

test('first edition in several languages', () => {
  assert.ok(detectFirstEdition('1st Edition'));
  assert.ok(detectFirstEdition('1. Auflage'));
  assert.ok(detectFirstEdition('1re Édition'));
  assert.ok(!detectFirstEdition('Limited Edition'));
});

test('value tiers', () => {
  assert.equal(valueTier(0.2), 'low');
  assert.equal(valueTier(4), 'mid');
  assert.equal(valueTier(12), 'high');
});

test('lookup reads the set file, exact code first, then English fallbacks', async () => {
  const files = {
    'data/ygo/index.json': { sets: ['LOB', 'RA01'] },
    'data/ygo/LOB.json': {
      prices: '2026-11-06', names: ['Blue-Eyes White Dragon'], sets: ['Legend of Blue Eyes White Dragon'],
      rarities: ['Ultra Rare'], products: { 706688: [36.48, 37.6, 22], 577481: [106.97, 121.15, 66] },
      versions: [[0, 2023, [0], 5339, [706688]], [0, 2002, [0], 4411, [577481]]],
      cards: { 'LOB-DE001': [0, [0]], 'LOB-G001': [0, [1]], 'LOB-EN001': [0, [0, 1]] },
    },
  };
  const fetchFn = async (url) => ({ ok: url in files, status: url in files ? 200 : 404, json: async () => files[url] });
  const api = createApi({ fetchFn });

  const de = await api.lookup(parseManualCode('LOB-DE001'));
  assert.equal(de.name, 'Blue-Eyes White Dragon');
  assert.ok(de.exact);
  assert.equal(de.versions[0].year, 2023);
  assert.equal(de.min, 36.48);

  const g = await api.lookup(parseManualCode('LOB-G001'));
  assert.equal(g.versions[0].year, 2002);

  const en = await api.lookup(parseManualCode('LOB-EN001'));
  assert.ok(!en.exact);
  assert.equal(en.min, 36.48);
  assert.equal(en.max, 106.97);

  const fr = await api.lookup(parseManualCode('LOB-FR001')); // not in file -> English fallback
  assert.equal(fr.matchedCode, 'LOB-EN001');

  assert.equal(await api.lookup(parseManualCode('XYZ-EN001')), null); // unknown set
});
