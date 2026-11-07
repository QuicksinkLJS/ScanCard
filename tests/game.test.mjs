import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, GAME, pickGame, gameKey, cardPx, cardRatio } from '../js/game.js';
import { buildSnapshot, readSnapshot } from '../js/friends.js';

test('Yu-Gi-Oh! is the default and keeps its old storage keys and paths', () => {
  assert.equal(GAME.id, 'ygo');
  assert.equal(gameKey('cardscan-collection-v1'), 'cardscan-collection-v1');
  assert.equal(GAME.data, 'data/ygo');
  assert.equal(GAME.models, 'models/ygo');
  assert.deepEqual(cardPx(), { w: 590, h: 860 });
  assert.ok(Math.abs(cardRatio() - 59 / 86) < 1e-12);
});

test('pickGame: ?game= and the stored choice, unknown games fall back', () => {
  assert.equal(pickGame('?game=ygo', '').id, 'ygo');
  assert.equal(pickGame('?game=nope', 'nope').id, 'ygo');
  assert.equal(pickGame('', 'ygo').id, 'ygo');
});

test('a second game gets its own storage keys', () => {
  const pkm = { ...GAMES.ygo, id: 'pkm', keyPrefix: 'pkm-', cardMm: { w: 63, h: 88 } };
  assert.equal(gameKey('cardscan-collection-v1', pkm), 'cardscan-pkm-collection-v1');
  assert.deepEqual(cardPx(pkm), { w: 630, h: 880 });
});

test('friend snapshots carry the game; old snapshots count as Yu-Gi-Oh!', () => {
  const snap = buildSnapshot({ me: { id: 'a', name: 'A' }, collection: [], wish: [], tracked: [], ticks: {}, decks: [] });
  assert.equal(snap.g, 'ygo');
  assert.equal(readSnapshot(snap).game, 'ygo');
  const old = { ...snap }; delete old.g;
  assert.equal(readSnapshot(old).game, 'ygo');
});
