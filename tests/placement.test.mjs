import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binderSpot, deckNeeds, shortSet } from '../js/placement.js';

test('binder pocket: page, pocket, row and column (9 per page)', () => {
  const entries = Array.from({ length: 30 }, (_, i) => ({ key: String(100 + i) }));
  assert.deepEqual(binderSpot(entries, 100), { index: 0, page: 1, pocket: 1, row: 1, col: 1 });
  assert.deepEqual(binderSpot(entries, '115'), { index: 15, page: 2, pocket: 7, row: 3, col: 1 });
  assert.equal(binderSpot(entries, '999'), null);
});

test('deck needs: copies owned count against the decks in order', () => {
  const decks = [
    { name: 'Branded', cards: { main: [{ name: 'Ash Blossom & Joyous Spring', need: 3 }], extra: [], side: [] } },
    { name: 'Snake-Eye', cards: { main: [{ name: 'Ash Blossom & Joyous Spring', need: 2 }, { name: 'Snake-Eye Ash', need: 1 }], extra: [], side: [] } },
  ];
  const n = deckNeeds(decks, { 'ash blossom & joyous spring': 3, 'snake-eye ash': 1 });
  assert.deepEqual(n.get('ash blossom & joyous spring'), ['Snake-Eye']);
  assert.equal(n.has('snake-eye ash'), false);
  assert.equal(shortSet('Original Artwork Collection (OCG)'), 'OAC');
  assert.equal(shortSet('Rarity Collection 5'), 'RC5');
  assert.equal(shortSet('Legend of Blue Eyes'), 'Legend of Blue Eyes'.length <= 16 ? 'Legend of Blue Eyes' : 'LOBE');
});
