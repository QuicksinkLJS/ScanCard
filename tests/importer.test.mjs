import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, detect, readImport, fullCode, normCond, normLang, normDate, matchItem, matchAll, summary, entriesFrom, fileId } from '../js/importer.js';
import { lifeOf } from '../js/life.js';

// A tiny fake of api.js: two cards.
const DETAIL = {
  'blue eyes white dragon': [
    { set: 'Legend of Blue Eyes White Dragon', year: 2002, rarities: ['Ultra Rare'], codes: ['LOB-EN001', 'LOB-G001'], date: '2002-03-08', products: [{ id: 1, trend: 40, rarity: 'Ultra Rare' }] },
    { set: 'Quarter Century Stampede', year: 2024, rarities: ['Platinum Secret Rare', 'Quarter Century Secret Rare'], codes: ['RA04-EN001', 'RA04-DE001'], date: '2024-11-07',
      products: [{ id: 2, trend: 8, rarity: 'Platinum Secret Rare' }, { id: 3, trend: 30, rarity: 'Quarter Century Secret Rare' }] },
  ],
  'ash blossom joyous spring': [
    { set: 'Maximum Crisis', year: 2017, rarities: ['Secret Rare'], codes: ['MACR-EN036'], date: '2017-05-04', products: [{ id: 10, trend: 12, rarity: 'Secret Rare' }] },
  ],
};
const norm = (s) => s.toLowerCase().replace(/&/g, ' ').replace(/[^a-z]+/g, ' ').trim();
const NAMES = { 'blue eyes white dragon': 'Blue-Eyes White Dragon', 'ash blossom joyous spring': 'Ash Blossom & Joyous Spring' };
const CODES = { 'LOB-EN001': 'Blue-Eyes White Dragon', 'RA04-EN001': 'Blue-Eyes White Dragon', 'MACR-EN036': 'Ash Blossom & Joyous Spring' };
const api = {
  lookup: async (p) => { for (const c of [p.code, `${p.prefix}-EN${p.num}`]) if (CODES[c]) return { name: CODES[c] }; return null; },
  nameInfo: async (n) => (NAMES[norm(n)] ? { name: NAMES[norm(n)] } : null),
  cardDetail: async (n) => (DETAIL[norm(n)] || []).map((r) => ({ ...r, products: r.products.map((p) => ({ label: '', image: '', path: '', ...p })) })),
};

const DS = `"sep=,"
Folder Name,Quantity,Trade Quantity,Card Name,Set Code,Set Name,Card Number,Condition,Printing,Language,Price Bought,Date Bought,LOW,MID,MARKET
Binder,2,0,Blue-Eyes White Dragon,LOB,Legend of Blue Eyes White Dragon,EN001,NearMint,1st Edition,English,25.00,2023-05-01,1,2,3
Binder,1,0,"Ash Blossom & Joyous Spring",MACR,Maximum Crisis,EN036,LightlyPlayed,Unlimited,German,,,,,
Binder,1,0,Not A Real Card,XXX,Nothing,EN999,Mint,Unlimited,English,,,,,
`;

test('CSV: sep line, quotes with commas and escaped quotes, semicolons, tabs', () => {
  assert.equal(parseCsv(DS).sep, ',');
  assert.deepEqual(parseCsv('a;b\n"x;y";"say ""hi"""\n').rows, [['a', 'b'], ['x;y', 'say "hi"']]);
  assert.deepEqual(parseCsv('﻿a\tb\r\n1\t2').rows, [['a', 'b'], ['1', '2']]);
});

test('formats are recognised by their headers', () => {
  assert.equal(detect(['Folder Name', 'Quantity', 'Trade Quantity', 'Card Name']).format, 'Dragon Shield');
  assert.equal(detect(['Portfolio Name', 'Category', 'Set', 'Product Name', 'Card Number', 'Rarity', 'Quantity']).format, 'Collectr');
  assert.equal(detect(['Quantity', 'Name', 'Simple Name', 'Set', 'Card Number', 'Set Code', 'Printing', 'Condition']).format, 'TCGplayer');
  assert.equal(detect(['cardmarketId', 'quantity', 'name', 'set', 'language', 'condition', 'firstEdition', 'trendPrice']).format, 'Curio');
  assert.equal(detect(['Kartenname', 'Anzahl', 'Zustand']).format, 'Spreadsheet');
  assert.equal(detect(['foo', 'bar']).ok, false);
});

test('values: set codes, conditions, languages, dates', () => {
  assert.equal(fullCode({ setCode: 'LOB', number: 'EN001' }), 'LOB-EN001');
  assert.equal(fullCode({ number: 'lob-en001' }), 'LOB-EN001');
  assert.equal(fullCode({ setCode: 'LOB', number: '001' }), 'LOB-001');
  assert.equal(fullCode({ number: '4/102' }), '');
  assert.deepEqual(normCond('NearMint'), { cond: 'NM', first: null });
  assert.deepEqual(normCond('Near Mint 1st Edition'), { cond: 'NM', first: true });
  assert.deepEqual(normCond('Lightly Played Unlimited'), { cond: 'LP', first: false });
  assert.equal(normCond('Damaged').cond, 'PO');
  assert.equal(normLang('Japanese'), 'JP');
  assert.equal(normLang('ja'), 'JP');
  assert.equal(normLang('Deutsch'), 'DE');
  assert.equal(normLang('Klingon'), null);
  assert.equal(normDate('2023-05-01'), Date.UTC(2023, 4, 1));
  assert.equal(normDate('01.05.2023'), Date.UTC(2023, 4, 1));
  assert.equal(normDate('5/1/2023'), Date.UTC(2023, 4, 1));
  assert.equal(normDate('soon'), null);
});

test('Dragon Shield file: rows -> items', () => {
  const d = readImport(DS);
  assert.equal(d.format, 'Dragon Shield');
  assert.equal(d.items.length, 3);
  const [bewd, ash] = d.items;
  assert.equal(bewd.code, 'LOB-EN001');
  assert.equal(bewd.qty, 2);
  assert.equal(bewd.cond, 'NM');
  assert.equal(bewd.first, true);
  assert.equal(bewd.lang, 'EN');
  assert.equal(bewd.paid, 25);
  assert.equal(bewd.folder, 'Binder');
  assert.equal(ash.name, 'Ash Blossom & Joyous Spring');
  assert.equal(ash.cond, 'LP');
  assert.equal(ash.first, false);
  assert.equal(ash.lang, 'DE');
});

test('Collectr-style file: other games and watchlist rows are left out', () => {
  const c = readImport(`Portfolio Name,Category,Set,Product Name,Card Number,Rarity,Grade,Card Condition,Average Cost Paid,Quantity,Watchlist,Date Added
Main,Yu-Gi-Oh!,Quarter Century Stampede,Blue-Eyes White Dragon,RA04-EN001,Quarter Century Secret Rare,,Near Mint,"$29.99",1,false,2025-01-02
Main,Pokemon,Base Set,Charizard,4/102,Holo Rare,PSA 9,,300,1,false,
Main,Yu-Gi-Oh!,Maximum Crisis,Ash Blossom & Joyous Spring,MACR-EN036,Secret Rare,,,,1,true,
`);
  assert.equal(c.format, 'Collectr');
  assert.deepEqual(c.items.map((i) => i.skip || ''), ['', 'other game', 'watchlist']);
  assert.equal(c.items[0].paid, 29.99);
});

test('matching: set code + rarity decide the version; open when they do not; unknown cards are reported', async () => {
  const d = readImport(DS);
  const m = await matchAll(d.items, api);
  assert.equal(m[0].status, 'ok');
  assert.equal(m[0].name, 'Blue-Eyes White Dragon');
  assert.equal(m[0].vkey, '1');                     // LOB-EN001: one version
  assert.equal(m[0].by, 'code');
  assert.equal(m[1].vkey, '10');                    // MACR-EN036
  assert.equal(m[2].status, 'missing');
  // code shared by two rarities: open without rarity, decided with it
  const open = await matchItem({ code: 'RA04-EN001', qty: 1 }, api);
  assert.equal(open.vkey, null);
  const qcsr = await matchItem({ code: 'RA04-EN001', rarity: 'QCSR', qty: 1 }, api);
  assert.equal(qcsr.vkey, '3');
  assert.equal(qcsr.vby, 'import');
  // name only: open (several prints); set name + rarity decide
  assert.equal((await matchItem({ name: 'Blue-Eyes White Dragon', qty: 1 }, api)).vkey, null);
  assert.equal((await matchItem({ name: 'Blue-Eyes White Dragon', set: 'Quarter Century Stampede', rarity: 'Platinum Secret Rare', qty: 1 }, api)).vkey, '2');
  // printed only once: the name is enough
  assert.equal((await matchItem({ name: 'Ash Blossom & Joyous Spring', qty: 1 }, api)).by, 'only');
  // a Cardmarket id from Curio's own sell list
  assert.equal((await matchItem({ name: 'Blue-Eyes White Dragon', cmid: '3', qty: 1 }, api)).by, 'id');
  // name and code disagree: the name wins, version open, reported
  const c = await matchItem({ name: 'Ash Blossom & Joyous Spring', code: 'LOB-EN001', qty: 1 }, api);
  assert.equal(c.name, 'Ash Blossom & Joyous Spring');
  assert.equal(c.conflict, true);
  assert.equal(c.code, null);
  const s = summary(m);
  assert.deepEqual([s.rows, s.found, s.copies, s.sure, s.open, s.missing.length], [3, 2, 3, 3, 0, 1]);
});

test('entries: one per copy, your copy, life story says where it came from', async () => {
  const m = await matchAll(readImport(DS).items, api);
  let n = 0;
  const out = entriesFrom(m, { source: 'Dragon Shield', now: Date.UTC(2026, 10, 8), newId: () => `id${n++}`, price: () => ({ lo: 40, hi: 40, exact: true }) });
  assert.equal(out.length, 3);
  const e = out[0];
  assert.equal(e.name, 'Blue-Eyes White Dragon');
  assert.equal(e.vkey, '1');
  assert.equal(e.vby, 'import');
  assert.equal(e.cond, 'NM');
  assert.equal(e.first, true);
  assert.equal(e.added, Date.UTC(2023, 4, 1));
  assert.equal(e.src, 'import');
  const story = lifeOf(e, { now: Date.UTC(2026, 10, 8), value: 40 });
  assert.equal(story[0].text, 'Imported from Dragon Shield · Binder');
  assert.match(story[0].sub, /you paid €25.00/);
  assert.notEqual(fileId(DS), fileId(DS + ' '));
});
