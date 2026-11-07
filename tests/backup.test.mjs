import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBackup, readBackup, restoreBackup, collectionCsv, sellCsv, csv } from '../js/backup.js';

function store(init = {}) {
  const m = new Map(Object.entries(init));
  return { get length() { return m.size; }, key: (i) => [...m.keys()][i], getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

test('backup holds all CardScan data (not the language setting) and restores with undo', () => {
  const s = store({ 'cardscan-collection-v1': '[{"name":"A"},{"name":"B"}]', 'cardscan-wish-v1': '[]', 'cardscan-lang': 'de', other: 'x' });
  const b = readBackup(JSON.stringify(makeBackup(s)));
  assert.equal(b.cards, 2);
  assert.deepEqual(Object.keys(b.data).sort(), ['cardscan-collection-v1', 'cardscan-wish-v1']);
  const s2 = store({ 'cardscan-collection-v1': '[]', 'cardscan-friends-v1': '[1]', 'cardscan-lang': 'en' });
  const before = restoreBackup(b, s2);
  assert.equal(s2.getItem('cardscan-collection-v1'), '[{"name":"A"},{"name":"B"}]');
  assert.equal(s2.getItem('cardscan-friends-v1'), null);
  assert.equal(s2.getItem('cardscan-lang'), 'en');
  restoreBackup(before, s2);
  assert.equal(s2.getItem('cardscan-friends-v1'), '[1]');
  assert.throws(() => readBackup('{"app":"Other"}'));
});

test('CSV quoting, collection list and sell list', () => {
  assert.equal(csv([['a', 'b;c', 'd"e']], ';'), 'a;"b;c";"d""e"');
  const list = [
    { name: 'Blue-Eyes', vkey: '1', cond: 'NM', lang: 'JP', price: { lo: 44.31, set: 'YAC1', label: 'Ultra Rare' } },
    { name: 'Blue-Eyes', vkey: '1', cond: 'NM', lang: 'JP', price: { lo: 44.31 } },
    { name: 'Blue-Eyes', vkey: '1', cond: 'EX', language: { code: 'JP' }, price: { lo: 44.31 } },
    { name: 'Ash', vkey: null },
  ];
  assert.match(collectionCsv(list).split('\r\n')[1], /^Blue-Eyes;YAC1;not chosen;;Japanese;Near Mint;;44,31;1;$/);
  const all = sellCsv(list);
  assert.equal(all.rows, 2); assert.equal(all.skipped, 1);
  assert.match(all.text, /\r\n1,2,Blue-Eyes,YAC1,Japanese,NM,false,44.31/);
  const dbl = sellCsv(list, { onlyDoubles: true });
  assert.equal(dbl.rows, 2); // one NM kept, one NM + one EX listed
  assert.doesNotMatch(dbl.text, /\r\n1,2,/);
});
