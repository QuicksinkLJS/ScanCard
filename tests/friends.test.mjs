import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, encodeSnapshot, decodeSnapshot, splitParts, createCollector, readSnapshot, friendOwned, matchTrades, suggestOffer } from '../js/friends.js';

const codes = new Map([['Blue-Eyes White Dragon', 89631139], ['Dark Magician', 46986414]]);
const snap = buildSnapshot({
  me: { id: 'me123', name: 'Chris' },
  collection: [
    { name: 'Blue-Eyes White Dragon', vkey: '913900', cond: 'NM', lang: 'JP' },
    { name: 'Blue-Eyes White Dragon', vkey: '913900', cond: 'NM', lang: 'JP' },
    { name: 'Dark Magician', vkey: null, first: true },
    { name: 'No Passcode Card', vkey: '880001', language: { code: 'KR' } },
  ],
  wish: [{ name: 'Dark Magician', vkey: null, group: 'single' }, { name: 'Ash', vkey: '5', group: 'deck', deck: { name: 'Branded' }, lang: 'any' }],
  tracked: [{ exp: 6786, name: 'YAC1', target: 2, hidden: ['1', '2'] }],
  ticks: { 913901: 1, 913902: 0 },
  decks: [{ name: 'Deck 1', cards: { main: [{ name: 'Dark Magician', need: 3 }], extra: [], side: [] } }],
  toCode: (n) => codes.get(n) ?? n,
});

test('a snapshot survives encoding, splitting into QR parts (any order) and reading', async () => {
  const data = await encodeSnapshot(snap);
  const parts = splitParts(data, 'me123', 40);
  assert.ok(parts.length > 1);
  const add = createCollector();
  let r;
  for (const p of [...parts].reverse()) r = add(p);
  assert.equal(r.done, true);
  const f = readSnapshot(await decodeSnapshot(r.data), (c) => [...codes].find(([, v]) => v === c)?.[0]);
  assert.equal(f.name, 'Chris');
  const be = f.collection.find((e) => e.name === 'Blue-Eyes White Dragon');
  assert.deepEqual([be.vkey, be.count, be.cond, be.lang], ['913900', 2, 'NM', 'JP']);
  assert.equal(f.collection.find((e) => e.name === 'Dark Magician').first, true);
  assert.equal(f.collection.find((e) => e.name === 'No Passcode Card').lang, 'KR');
  assert.deepEqual(f.wish.map((w) => [w.name, w.deck]), [['Dark Magician', ''], ['Ash', 'Branded']]);
  assert.deepEqual(f.sets[0], { exp: 6786, name: 'YAC1', target: 2, hidden: ['1', '2'] });
  assert.equal(f.decks[0].cards[0].need, 3);
  assert.deepEqual(friendOwned(f), { 913900: 2, 880001: 1, 913901: 1 });
  assert.equal(add('hello'), null);
});

test('trade matches and a fair offer', () => {
  const m = matchTrades({
    mine: [{ name: 'Stardust Dragon', vkey: '1' }, { name: 'Ash', vkey: '2' }],
    myWish: [{ name: 'Blue-Eyes White Dragon', vkey: null }, { name: 'Dark Magician', vkey: '99' }],
    theirs: [{ name: 'blue-eyes white dragon', vkey: '7' }, { name: 'Dark Magician', vkey: '98' }],
    theirWish: [{ name: 'Ash', vkey: null }],
  });
  assert.deepEqual(m.forMe.map((x) => x.card.vkey), ['7']); // the wished Dark Magician version does not match
  assert.deepEqual(m.forThem.map((x) => x.card.name), ['Ash']);
  const o = suggestOffer(20, [{ v: 15 }, { v: 6 }, { v: 40 }, { v: 3 }], (c) => c.v);
  assert.deepEqual(o.cards.map((c) => c.v), [15, 6]);
  assert.equal(o.value, 21);
});
