import { test } from 'node:test';
import assert from 'node:assert/strict';

// holo.js touches the DOM on import; test the rarity mapping through a tiny DOM stub
globalThis.document = { getElementById: () => ({ addEventListener() {} }) };
const { holoKind } = await import('../js/holo.js');

test('rarity decides the effect', () => {
  assert.equal(holoKind('Common'), 'common');
  assert.equal(holoKind('Rare'), 'rare');
  assert.equal(holoKind('Super Rare'), 'super');
  assert.equal(holoKind('Ultra Rare'), 'ultra');
  assert.equal(holoKind('Secret Rare'), 'secret');
  assert.equal(holoKind('Ultimate Rare'), 'relief');
  assert.equal(holoKind('Starlight Rare'), 'rainbow');
  assert.equal(holoKind('Quarter Century Secret Rare'), 'rainbow');
  assert.equal(holoKind('Rarity unknown'), 'plain');
  assert.equal(holoKind(''), 'plain');
});
