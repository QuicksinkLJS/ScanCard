import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RARITIES, rarityOf, rarityByKey, compareRarities, standing, standingText } from '../js/rarities.js';
import { rarityRank } from '../js/prices.js';

test('every rarity name from the data finds the most specific entry', () => {
  const k = (n) => rarityOf(n)?.key;
  assert.equal(k('Quarter Century Secret Rare'), 'qcsr');
  assert.equal(k('Prismatic Secret Rare'), 'prismatic');
  assert.equal(k('Platinum Secret Rare'), 'platsecret');
  assert.equal(k('Secret Rare'), 'secret');
  assert.equal(k("Collector's Rare"), 'collector');
  assert.equal(k('Collector’s Rare'), 'collector');
  assert.equal(k("Prismatic Collector's Rare"), 'prismcollector');
  assert.equal(k('Prismatic Ultimate Rare'), 'prismult');
  assert.equal(k('Ultimate Rare'), 'ultimate');
  assert.equal(k('Ultra Parallel Rare'), 'parallel');
  assert.equal(k('Gold Secret Rare'), 'goldsecret');
  assert.equal(k('Ghost/Gold Rare'), 'ghostgold');
  assert.equal(k('Starlight Rare'), 'starlight');
  assert.equal(k('Super Short Print'), 'shortprint');
  assert.equal(k('Ultra Rare'), 'ultra');
  assert.equal(k('Rare'), 'rare');
  assert.equal(rarityOf('Something new'), null);
  assert.equal(rarityOf(''), null);
});

test('entries are complete and their mix-ups exist', () => {
  for (const r of RARITIES) {
    for (const f of ['key', 'name', 'short', 'name_', 'art', 'tell', 'since', 'look', 'group']) assert.ok(r[f], `${r.key}.${f}`);
    for (const c of r.confuse) assert.ok(rarityByKey(c), `${r.key} confuses unknown ${c}`);
    // the demo effect is one holo.js knows (same as the card page would pick)
    assert.ok(['common', 'rare', 'super', 'ultra', 'secret', 'qcsr', 'starlight', 'prismatic', 'relief', 'ghost', 'collector', 'rainbow'].includes(r.look), r.key);
  }
  assert.equal(rarityOf('Quarter Century Secret Rare').look, 'qcsr');
  assert.match(rarityOf('Quarter Century Secret Rare').tell, /watermark/);
});

test('compare: one column per known rarity, rows name / artwork / quick check', () => {
  const c = compareRarities(['Secret Rare', 'Prismatic Secret Rare', 'Nonsense', 'Secret Rare']);
  assert.deepEqual(c.list.map((r) => r.key), ['secret', 'prismatic']);
  assert.deepEqual(c.rows.map((r) => r.label), ['Name', 'Artwork', 'Quick check']);
  assert.equal(c.rows[1].values.length, 2);
});

test('standing: rarity among the card\'s rarities, price against the cheapest of the same set', () => {
  const opts = [
    { key: '1', set: 'Quarter Century Stampede', rarity: 'Platinum Secret Rare', trend: 8 },
    { key: '2', set: 'Quarter Century Stampede', rarity: 'Quarter Century Secret Rare', trend: 32 },
    { key: '3', set: 'Legend of Blue Eyes', rarity: 'Ultra Rare', trend: 40 },
    { key: '4', set: 'Some OCG set', rarity: '', rarities: ['Ultra Rare', 'Secret Rare'], variants: 2, trend: 1 },
  ];
  const s = standing(opts, opts[1], rarityRank);
  assert.equal(s.top, true);
  assert.equal(s.of, 3);
  assert.equal(s.factor, 4);
  assert.equal(s.cheapest, 'Platinum Secret Rare');
  assert.equal(s.priceRank, 2);
  assert.equal(standingText(s), 'The rarest of the 3 rarities this card has · 4× the price of the Platinum Secret Rare in this set');
  const u = standing(opts, opts[2], rarityRank);
  assert.equal(standingText(u), 'Rarity 1 of 3 for this card (lowest first) · the most expensive version of this card');
  assert.equal(standing(opts, opts[3], rarityRank), null);   // rarity unknown
});
