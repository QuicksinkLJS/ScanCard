import { test } from 'node:test';
import assert from 'node:assert/strict';

// holo.js touches the DOM on import; test the rarity mapping through a tiny DOM stub
globalThis.document = { getElementById: () => ({ addEventListener() {} }) };
globalThis.__holo = await import('../js/holo.js');
const { holoKind } = globalThis.__holo;

test('rarity decides the effect', () => {
  assert.equal(holoKind('Common'), 'common');
  assert.equal(holoKind('Rare'), 'rare');
  assert.equal(holoKind('Super Rare'), 'super');
  assert.equal(holoKind('Ultra Rare'), 'ultra');
  assert.equal(holoKind('Secret Rare'), 'secret');
  assert.equal(holoKind('Ultimate Rare'), 'relief');
  assert.equal(holoKind('Starlight Rare'), 'starlight');
  assert.equal(holoKind('Quarter Century Secret Rare'), 'qcsr');
  assert.equal(holoKind('Ghost Rare'), 'ghost');
  assert.equal(holoKind("Collector's Rare"), 'collector');
  assert.equal(holoKind('Prismatic Secret Rare'), 'prismatic');
  assert.equal(holoKind('Platinum Secret Rare'), 'secret');
  assert.equal(holoKind('Rarity unknown'), 'plain');
  assert.equal(holoKind(''), 'plain');
});

test('each rarity shines in its own areas', () => {
  const { holoCardHTML } = globalThis.__holo;
  const areas = (k) => [...holoCardHTML({ src: 'x.jpg', kind: k }).matchAll(/h-shine a-(\w+) fx-([\w-]+)/g)].map((m) => `${m[1]}:${m[2]}`).join(' ');
  assert.equal(areas('rare'), 'name:silver');
  assert.equal(areas('super'), 'art:tint art:rainbow');
  assert.equal(areas('ultra'), 'art:tint art:rainbow name:gold');
  assert.equal(areas('secret'), 'art:tint art:secret name:silver');
  assert.equal(areas('relief'), 'all:relief all:gold-metal all:glitter-soft');
  assert.equal(areas('ghost'), 'art:tint art:ghost art:glitter-soft');
  assert.ok(holoCardHTML({ src: 'https://x/418250-blue-eyes-original-artwork-collection-ocg.png', kind: 'ultra' }).includes('lay-manga'));
  assert.equal(areas('common'), '');
  assert.equal(holoCardHTML({ src: 'x.jpg', kind: 'ultra', shine: false }).includes('h-shine'), false);
});
