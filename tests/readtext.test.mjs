import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normText, buildIndex, matchText, matchLines, matchAmong, decide } from '../js/readtext.js';

const file = {
  en: ['Blue-Eyes White Dragon', 'Stardust Dragon', 'Dark Magician', 'Dark Elf', 'Ash Blossom & Joyous Spring', 'Malefic Stardust Dragon'],
  n: [['青眼の白龍', 0], ['スターダスト・ドラゴン', 1], ['ブラック・マジシャン', 2], ['ダーク・エルフ', 3], ['灰流うらら', 4], ['Sin スターダスト・ドラゴン', 5],
    ['Blue-Eyes White Dragon', 0], ['Stardust Dragon', 1], ['Dark Magician', 2], ['Dark Elf', 3]],
};
const ix = buildIndex(file);

test('text is normalised across scripts and widths', () => {
  assert.equal(normText('Ｓｔａｒｄｕｓｔ・Dragon!'), 'stardustdragon');
  assert.equal(normText('灰流 うらら'), '灰流うらら');
});

test('names are found from broken OCR, in any script', () => {
  assert.equal(matchText('STARDUST DRAG0N |', ix)[0].name, 'Stardust Dragon');
  assert.equal(matchText('灰流うら', ix)[0].name, 'Ash Blossom & Joyous Spring');
  assert.equal(matchLines('ブルーアイズ・ホワイト・ドラゴン\n青眼の白龍', ix)[0].name, 'Blue-Eyes White Dragon');
  assert.equal(decide(matchText('Stardust Dragon', ix))?.name, 'Stardust Dragon');
});

test('unclear readings are not trusted; among the picture\'s candidates a broken reading is enough', () => {
  assert.equal(decide(matchText('xq', ix)), null);
  assert.equal(decide(matchText('Stardust', ix), { min: 0.85, margin: 0.12 }), null); // a new card needs a very clear reading
  const among = matchAmong('DARK MAGIC', ix, ['Dark Magician', 'Stardust Dragon']);
  assert.equal(decide(among, { min: 0.45, margin: 0.08 })?.name, 'Dark Magician');
});
