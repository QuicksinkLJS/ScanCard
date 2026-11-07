import test from 'node:test';
import assert from 'node:assert/strict';
import { addLife, addEvent, removeNote, lifeOf, ageText, LIFE_MAX } from '../js/life.js';

const D = 86400000, T0 = Date.UTC(2026, 10, 1);

test('a new card gets its "added" moment with pack and value', () => {
  const e = { id: 'a', name: 'X', added: T0, pack: { name: 'Phantom Nightmare' }, buy: { lo: 2, hi: 4 } };
  addLife(e, addEvent(e), T0);
  assert.deepEqual(e.life, [{ t: T0, k: 'add', how: 'pack', pack: 'Phantom Nightmare', value: 3 }]);
  const lines = lifeOf(e, { now: T0 + 100 * D, value: 4.5 });
  assert.equal(lines[0].text, 'Pulled from a pack: Phantom Nightmare');
  assert.equal(lines[0].sub, 'worth €3.00 then');
  const last = lines[lines.length - 1];
  assert.equal(last.k, 'now');
  assert.equal(last.text, 'Today: worth €4.50');
  assert.equal(last.sub, 'with you for 3 months · +50 % since then');
});

test('old entries without a story still get a start line', () => {
  const lines = lifeOf({ added: T0, buy: { lo: 1, hi: 1 } }, { now: T0 + 2 * D, value: 0.5 });
  assert.equal(lines[0].text, 'Came into your collection');
  assert.equal(lines[1].sub, 'with you for 2 days · −50 % since then');
  assert.equal(lifeOf({ added: T0 }, { now: T0 + 1000 }).at(-1).sub, 'new in your collection today');
});

test('version / copy changes within 10 minutes replace each other; same state twice is no news', () => {
  const e = {};
  addLife(e, { k: 'ver', v: 'A' }, T0);
  addLife(e, { k: 'ver', v: 'B' }, T0 + 60000);
  assert.deepEqual(e.life.map((x) => x.v), ['B']);
  addLife(e, { k: 'ver', v: 'B' }, T0 + D);
  assert.equal(e.life.length, 1);
  addLife(e, { k: 'copy', c: 'NM' }, T0 + D);
  addLife(e, { k: 'ver', v: 'C' }, T0 + 2 * D);
  assert.deepEqual(e.life.map((x) => x.k), ['ver', 'copy', 'ver']);
});

test('notes: trimmed, tag alone is fine, empty is ignored, removable', () => {
  const e = {};
  addLife(e, { k: 'note', x: '  pulled at the Regional  ', tag: 'pulled' }, T0);
  addLife(e, { k: 'note', tag: 'gift' }, T0 + 1);
  addLife(e, { k: 'note', x: '   ' }, T0 + 2);
  assert.equal(e.life.length, 2);
  assert.equal(e.life[0].x, 'pulled at the Regional');
  const lines = lifeOf(e, { now: T0 + 5 });
  const notes = lines.filter((l) => l.own);
  assert.deepEqual(notes.map((n) => [n.text, n.sub]), [['pulled at the Regional', 'Pulled it myself'], ['Got it as a gift', '']]);
  removeNote(e, T0);
  assert.equal(e.life.length, 1);
});

test('the story is capped, the first moment and the notes stay', () => {
  const e = {};
  addLife(e, { k: 'add', how: 'scan' }, T0);
  addLife(e, { k: 'note', x: 'keep me' }, T0 + 1);
  for (let i = 0; i < 80; i++) addLife(e, { k: i % 2 ? 'ver' : 'copy', v: `v${i}`, c: `c${i}` }, T0 + (i + 2) * D);
  assert.equal(e.life.length, LIFE_MAX);
  assert.equal(e.life[0].k, 'add');
  assert.ok(e.life.some((x) => x.x === 'keep me'));
});

test('ageText', () => {
  assert.equal(ageText(0), 'today');
  assert.equal(ageText(D), '1 day');
  assert.equal(ageText(45 * D), '1 month');
  assert.equal(ageText(800 * D), '2 years');
});
