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

test('lookup falls back to the NA code and filters prints', async () => {
  const calls = [];
  const responses = {
    'cardsetsinfo.php?setcode=SDY-EN046': { error: 'not found' },
    'cardsetsinfo.php?setcode=SDY-E046': { error: 'not found' },
    'cardsetsinfo.php?setcode=SDY-046': { id: 123, name: 'Test Card', set_name: 'Starter Deck: Yugi', set_code: 'SDY-046', set_rarity: 'Common', set_price: '1.5' },
    'cardinfo.php?id=123': { data: [{ id: 123, name: 'Test Card', card_prices: [{ cardmarket_price: '2.10' }],
      card_sets: [
        { set_code: 'SDY-046', set_rarity: 'Common', set_price: '1.5' },
        { set_code: 'LOB-EN010', set_rarity: 'Ultra Rare', set_price: '30' },
      ] }] },
    'cardinfo.php?id=123&language=de': { data: [{ name: 'Testkarte' }] },
  };
  const fetchFn = async (url) => {
    calls.push(url);
    const key = Object.keys(responses).find((k) => url.endsWith(k));
    const body = responses[key] ?? { error: 'nope' };
    return { ok: !body.error, json: async () => body };
  };
  const api = createApi({ fetchFn, storage: null });
  const card = await api.lookup(parseManualCode('SDY-G046'));
  assert.equal(card.name, 'Test Card');
  assert.equal(card.localName, 'Testkarte');
  assert.equal(card.prints.length, 1);
  assert.equal(card.prints[0].rarity, 'Common');
  assert.equal(card.cardmarketFromEur, 2.1);
  assert.equal(calls.length, 5);
});
