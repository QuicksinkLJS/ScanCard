import { test } from 'node:test';
import assert from 'node:assert/strict';
import { versionOptions, rankOptions } from '../js/prices.js';
import { autoPick, certainty, narrow, quickChoices, rarityGuesses, rarityInfo, pickLabel, shortRarity, fitsLang, candidates } from '../js/sure.js';

// A western card with two sets (one with two rarities) and a Japanese/Korean set whose products have no rarity.
const rows = [
  { set: 'Quarter Century Stampede', year: 2024, date: '2024-11-07', rarities: ['Platinum Secret Rare', 'Quarter Century Secret Rare'],
    codes: ['RA04-EN107', 'RA04-DE107'], products: [{ id: 1, trend: 8, rarity: 'Platinum Secret Rare', image: 'a/1.jpg' }, { id: 2, trend: 27, rarity: 'Quarter Century Secret Rare', image: 'a/2.jpg' }] },
  { set: 'Legend of Blue Eyes', year: 2002, date: '2002-03-08', rarities: ['Ultra Rare'], codes: ['LOB-EN005', 'LOB-G005'], products: [{ id: 3, trend: 40 }] },
  { set: 'Limited Pack: Stamp Edition', year: 2025, date: '2025-06-01', rarities: ['Ultra Rare', 'Secret Rare', 'Prismatic Secret Rare'],
    codes: ['LPST-KR002', 'LPST-JP002'], products: [{ id: 4, trend: 1.5 }, { id: 5, trend: 27 }, { id: 6, trend: 4.5 }] },
  { set: 'Quarter Century Art Collection', year: 2025, date: '2025-04-01', rarities: ['Ultra Rare', 'Secret Rare', 'Quarter Century Secret Rare'],
    codes: ['QCAC-KR019', 'QCAC-JP019'], products: [{ id: 7, trend: 1 }, { id: 8, trend: 4 }, { id: 9, trend: 8 }, { id: 10, trend: 50 }] },
];
const rank = (s) => rankOptions(versionOptions(rows), { code: s.code, pack: s.pack, vkey: s.vkey, lang: s.lang || s.language?.code || null });

test('Curio picks a version by itself only with proof (set code / pack), never from the language alone', () => {
  assert.equal(autoPick(rank({ code: { code: 'LOB-G005', base: 'LOB-005' } })), '3');
  assert.equal(autoPick(rank({ pack: { prefix: 'LOB', name: 'Legend of Blue Eyes' } })), '3');
  assert.equal(autoPick(rank({ code: { code: 'RA04-DE107', base: 'RA04-107' } })), null);   // two rarities share the code
  assert.equal(autoPick(rank({ language: { code: 'DE' } })), null);                          // language only
  assert.equal(autoPick(rank({})), null);
});

test('levels: sure with proof, picked by you, check for an unproven pick, few / open otherwise', () => {
  const code = { code: 'LOB-G005', base: 'LOB-005' };
  let c = certainty(rank({ code, vkey: '3' }), { code, vkey: '3' });
  assert.equal(c.level, 'sure');
  assert.match(c.why, /LOB-G005/);
  assert.equal(certainty(rank({ vkey: '3' }), { vkey: '3', vby: 'user' }).level, 'picked');
  assert.equal(certainty(rank({ vkey: '3' }), { vkey: '3' }).level, 'check');               // e.g. picked by an older Curio
  c = certainty(rank({ code: { code: 'RA04-DE107', base: 'RA04-107' } }), { code: { code: 'RA04-DE107', base: 'RA04-107' } });
  assert.equal(c.level, 'few');
  assert.deepEqual(c.picks.map((o) => o.key).sort(), ['1', '2']);
  c = certainty(rank({}), {});
  assert.equal(c.level, 'open');
  assert.equal(c.picks.length, 3);
  assert.equal(c.left, 10);
  assert.equal(certainty([], {}).level, 'none');
});

test('quick pick: language and rarity narrow the versions; a filter that leaves nothing is ignored', () => {
  const r = rank({});
  assert.deepEqual(narrow(r, { lang: 'KR' }).list.map((o) => o.set).filter((v, i, a) => a.indexOf(v) === i).sort(), ['Limited Pack: Stamp Edition', 'Quarter Century Art Collection']);
  const de = narrow(r, { lang: 'DE', rarity: 'Quarter Century Secret Rare' });
  assert.deepEqual(de.list.map((o) => o.key), ['2']);
  assert.equal(de.byRarity, 'exact');
  const none = narrow(r, { lang: 'FR' });
  assert.deepEqual(none.ignored, ['lang']);
  assert.equal(none.list.length, r.length);
  // Japanese + QCSR: the Art Collection has 4 products for 3 rarities -> no guess, only "could be"
  const jp = narrow(r, { lang: 'JP', rarity: 'Quarter Century Secret Rare' });
  assert.equal(jp.byRarity, 'maybe');
  assert.deepEqual(jp.list.map((o) => o.key).sort(), ['10', '7', '8', '9']);
});

test('rarity by price: as many products as rarities -> cheapest = lowest rarity (a guess, never picked by itself)', () => {
  const r = rank({});
  const g = rarityGuesses(r);
  assert.equal(g.get('4'), 'Ultra Rare');            // 1.5
  assert.equal(g.get('6'), 'Secret Rare');           // 4.5
  assert.equal(g.get('5'), 'Prismatic Secret Rare'); // 27
  assert.equal(g.has('7'), false);                   // 4 products, 3 rarities
  const o = r.find((x) => x.key === '5');
  assert.deepEqual(rarityInfo(o, g), { exact: '', guess: 'Prismatic Secret Rare', maybe: o.rarities });
  assert.equal(pickLabel(o, g), 'probably Prismatic Secret Rare');
  const jp = certainty(r, { lang: 'JP' }, { rarity: 'Prismatic Secret Rare' });
  assert.equal(jp.level, 'few');
  assert.equal(jp.byRarity, 'guess');
  assert.deepEqual(jp.picks.map((x) => x.key), ['5']);
});

test('chips: languages printed, rarities of what is left, 1st Edition only outside the OCG', () => {
  const r = rank({});
  const all = quickChoices(r);
  assert.deepEqual(all.langs, ['EN', 'DE', 'JP', 'KR']);
  assert.equal(all.first, true);
  const jp = quickChoices(r, { lang: 'JP' });
  assert.deepEqual(jp.rarities, ['Ultra Rare', 'Secret Rare', 'Prismatic Secret Rare', 'Quarter Century Secret Rare']);
  assert.equal(jp.first, false);
  // with a set code read, only that set's rarities
  const code = { code: 'RA04-DE107', base: 'RA04-107' };
  assert.deepEqual(quickChoices(rank({ code })).rarities, ['Platinum Secret Rare', 'Quarter Century Secret Rare']);
  assert.equal(candidates(rank({ code })).length, 2);
});

test('helpers', () => {
  assert.equal(shortRarity('Quarter Century Secret Rare'), 'QCSR');
  assert.equal(shortRarity('Secret Rare'), 'Secret');
  assert.equal(shortRarity(''), '');
  const lob = rank({}).find((o) => o.key === '3');
  assert.ok(fitsLang(lob, 'DE'));
  assert.ok(!fitsLang(lob, 'JP'));
  assert.ok(fitsLang(null, 'JP'));
});

test('a version taken over from an import counts as decided', () => {
  const c = certainty(rank({ vkey: '3' }), { vkey: '3', vby: 'import' });
  assert.equal(c.level, 'picked');
  assert.match(c.why, /import/);
});
