import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYdk, parseYdke, parseList, parseDeck, resolveDeck, allocate, pickVersion, wantsLines } from '../js/deck.js';

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

test('.ydk file', () => {
  const d = parseYdk('#created by me\n#main\n14558127\n14558127\n089631139\n#extra\n44508094\n!side\n14558127\n');
  assert.deepEqual(d, { main: ['14558127', '14558127', '89631139'], extra: ['44508094'], side: ['14558127'] });
});

test('ydke link', () => {
  const b64 = (ids) => Buffer.from(new Uint32Array(ids).buffer).toString('base64');
  const url = `ydke://${b64([14558127, 14558127, 89631139])}!${b64([44508094])}!${b64([])}!`;
  assert.deepEqual(parseYdke(url), { main: ['14558127', '14558127', '89631139'], extra: ['44508094'], side: [] });
  assert.deepEqual(parseDeck(url).extra, ['44508094']);
});

test('plain list with headers', () => {
  const d = parseList('Main Deck:\n3x Ash Blossom & Joyous Spring\n1 Dark Magician (V.2) (Legend of Blue Eyes)\nExtra:\nStardust Dragon');
  assert.deepEqual(d.main.map((x) => x.name), ['Ash Blossom & Joyous Spring', 'Ash Blossom & Joyous Spring', 'Ash Blossom & Joyous Spring', 'Dark Magician']);
  assert.deepEqual(d.extra, [{ name: 'Stardust Dragon' }]);
});

test('resolve and allocate owned copies across main and side', () => {
  const r = resolveDeck({ main: ['1', '1', '1', '2'], extra: [], side: ['1', '9'] }, { 1: 'Ash Blossom', 2: 'Dark Magician' });
  assert.deepEqual(r.main, [{ name: 'Ash Blossom', need: 3 }, { name: 'Dark Magician', need: 1 }]);
  assert.deepEqual(r.unknown, ['9']);
  const a = allocate(r, { ashblossom: 3 }, norm);
  assert.equal(a.main[0].have, 3);
  assert.equal(a.side[0].have, 0);
  assert.equal(a.need, 5);
  assert.equal(a.have, 3);
});

test('pick cheapest or highest rarity, language', () => {
  const opts = [
    { set: 'A', trend: 1, rarity: 'Common', rarities: [], codes: ['A-EN001'], variants: 1 },
    { set: 'B', trend: 30, rarity: 'Starlight Rare', rarities: [], codes: ['B-EN001'], variants: 2 },
    { set: 'B', trend: 3, rarity: 'Secret Rare', rarities: [], codes: ['B-EN001'], variants: 2 },
    { set: 'C (OCG)', trend: 0.5, rarity: '', rarities: ['Ultra Rare', 'Secret Rare'], codes: ['C-JP001'], variants: 2 },
  ];
  assert.equal(pickVersion(opts, { mode: 'cheap' }).set, 'C (OCG)');
  assert.equal(pickVersion(opts, { mode: 'cheap', lang: 'EN' }).set, 'A');
  assert.equal(pickVersion(opts, { mode: 'max' }).rarity, 'Starlight Rare');
  assert.equal(pickVersion(opts, { mode: 'max', lang: 'JP' }).set, 'C (OCG)');
});

test('wants list lines', () => {
  const rows = [
    { name: 'Ash Blossom', missing: 2, pick: { path: 'X/Ash-Blossom' }, exact: false },
    { name: 'Dark Magician', missing: 1, pick: { path: 'LOB/Dark-Magician-V2-Ultra-Rare' }, exact: true, expName: 'Legend of Blue Eyes White Dragon' },
    { name: 'Done', missing: 0 },
  ];
  assert.equal(wantsLines(rows), '2x Ash Blossom\n1x Dark Magician (V.2) (Legend of Blue Eyes White Dragon)');
});
