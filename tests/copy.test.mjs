import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasFirstEdition, isOcgOption, copyText, meetsWish, langOf } from '../js/copy.js';

test('OCG prints have no 1st Edition', () => {
  assert.equal(hasFirstEdition({ lang: 'JP' }), false);
  assert.equal(hasFirstEdition({ lang: 'KR' }), false);
  assert.equal(hasFirstEdition({ lang: 'AE' }), false);
  assert.equal(hasFirstEdition({ lang: 'DE' }), true);
  assert.equal(hasFirstEdition({}), true);
  assert.equal(hasFirstEdition({ option: { set: 'Original Artwork Collection (OCG)', codes: ['YAC1-JP001'] } }), false);
  assert.equal(hasFirstEdition({ option: { set: 'Limited Pack', codes: ['LPST-KR003'] } }), false);
  assert.equal(hasFirstEdition({ option: { set: 'Rarity Collection 5', codes: ['RA05-EN085', 'RA05-DE085'] } }), true);
  assert.equal(isOcgOption({ set: 'X', codes: ['ABC-JP001', 'ABC-EN001'] }), false);
});

test('short text of a copy and of a wish', () => {
  assert.equal(copyText({ cond: 'NM', lang: 'DE', first: true }), 'NM · German · 1st');
  assert.equal(copyText({ first: false, language: { code: 'JP' } }), 'Japanese · Unlimited');
  assert.equal(copyText({ cond: 'EX', lang: 'any', first: true }, { wish: true }), 'EX+ · 1st');
  assert.equal(copyText({}), '');
  assert.equal(langOf({ language: { code: 'KR' } }), 'KR');
  assert.equal(langOf({ lang: 'DE', language: { code: 'KR' } }), 'DE');
});

test('an offer meets a wish', () => {
  assert.equal(meetsWish({ cond: 'EX' }, { cond: 'NM' }), true);
  assert.equal(meetsWish({ cond: 'EX' }, { cond: 'LP' }), false);
  assert.equal(meetsWish({ lang: 'DE' }, { lang: 'EN' }), false);
  assert.equal(meetsWish({ lang: 'any', first: true }, { lang: 'EN', first: false }), false);
});
