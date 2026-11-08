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

test('German: version certainty', () => {
  assert.equal(translate('✓ Version: sure'), '✓ Version: sicher');
  assert.equal(translate('Set code LOB-G005 read on the card'), 'Set-Code LOB-G005 auf der Karte gelesen');
  assert.equal(translate('Set code RA04-DE107 read on the card – 2 versions fit'), 'Set-Code RA04-DE107 auf der Karte gelesen – 2 Versionen passen');
  assert.equal(translate('probably Secret Rare'), 'wahrscheinlich Secret Rare');
  assert.equal(translate('105 versions – Curio won\'t guess'), '105 Versionen – Curio rät nicht');
  assert.equal(translate('6 cards added to your collection · 2 with the version still open – pick it later'), '6 Karte(n) zur Sammlung hinzugefügt · 2 mit noch offener Version – später wählen');
});

test('German: data safety and import', () => {
  assert.equal(translate('Dragon Shield file'), 'Dragon Shield-Datei');
  assert.equal(translate('Left out: 2 other games · 1 watchlist entries'), 'Ausgelassen: 2 andere Spiele · 1 Merklisten-Einträge');
  assert.equal(translate('412 cards imported · 60 with the version still open'), '412 Karte(n) importiert · 60 mit noch offener Version');
  assert.equal(translate('Imported from Dragon Shield · Binder'), 'Importiert aus Dragon Shield · Binder');
  assert.equal(translate('Daily copy · 12 cards'), 'Tageskopie · 12 Karte(n)');
  assert.equal(translate('Import 3 cards'), '3 Karte(n) importieren');
});
