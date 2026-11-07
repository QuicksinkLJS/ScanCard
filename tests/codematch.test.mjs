import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levenshtein, codeTokens, matchCode, baseOf, languageFromText } from '../js/codematch.js';

test('levenshtein', () => {
  assert.equal(levenshtein('SUDA-014', 'SUDA-014'), 0);
  assert.equal(levenshtein('SUDA-014', 'SUDA-017'), 1);
  assert.equal(levenshtein('', 'abc'), 3);
});

test('tokens split language and number, fix digits', () => {
  const [t] = codeTokens('ATK/2500 SUDA-JPO14');
  assert.equal(t.base, 'SUDA-014');
  assert.equal(t.lang, 'JP');
  const [g] = codeTokens('LOB-G001');
  assert.equal(g.lang, 'G');
  assert.equal(g.base, 'LOB-001');
  const [na] = codeTokens('SDY-046');
  assert.equal(na.lang, '');
});

test('matches against the card\'s base codes despite reading errors', () => {
  const bases = ['MP25-265', 'SUDA-014'];
  assert.equal(matchCode('SUDA-DE014', bases).code, 'SUDA-DE014');
  assert.equal(matchCode('5UDA-KR0I4', bases).base, 'SUDA-014'); // S read as 5, 1 read as I
  assert.equal(matchCode('SUDA-KR0I4', bases).language.code, 'KR');
  assert.equal(matchCode('MP2S-EN265', bases).base, 'MP25-265');
  assert.equal(matchCode('PHNI-EN001', bases), null);
  assert.equal(matchCode('nothing here', bases), null);
});

test('base and language helpers', () => {
  assert.equal(baseOf('SUDA-DE014'), 'SUDA-014');
  assert.equal(baseOf('LOB-001'), 'LOB-001');
  assert.equal(languageFromText('xx DUNE-JP012 yy').code, 'JP');
  assert.equal(languageFromText('no code'), null);
  assert.equal(languageFromText('YACI1-1P026 (e').code, 'JP');
  assert.equal(languageFromText('SRL-GODo'), null);
});
