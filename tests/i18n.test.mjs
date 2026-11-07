import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => 'de', setItem() {} };
const { translate } = await import('../js/i18n.js');

test('German: exact phrases and patterns, spaces kept', () => {
  assert.equal(translate('Add to collection'), 'Zur Sammlung');
  assert.equal(translate('  Scan cards\n'), '  Karten scannen\n');
  assert.equal(translate('Recognising 5 cards…'), 'Erkenne 5 Karte(n)…');
  assert.equal(translate('Missing 343 · approx. '), 'Fehlt 343 · ca. ');
  assert.equal(translate(' on Cardmarket'), ' auf Cardmarket');
  assert.equal(translate('Legacy of Destruction · €10.00 on 7 Nov'), 'Legacy of Destruction · €10.00 am 7. Nov.');
  assert.equal(translate('2 Sell'), '2 Verkaufen');
  assert.equal(translate('Blue-Eyes White Dragon'), 'Blue-Eyes White Dragon');
});
