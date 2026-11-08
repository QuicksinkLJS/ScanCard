import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyDue, toDelete, backupReminder, fingerprint, KEEP, SNOOZE } from '../js/safety.js';

const H = 3600000, D = 24 * H, NOW = Date.UTC(2026, 10, 8, 15);

test('daily copy: due after 20 hours, never when nothing changed', () => {
  assert.equal(dailyDue([], NOW, 'a'), true);
  assert.equal(dailyDue([{ id: 1, t: NOW - 2 * H, reason: 'daily', fp: 'a' }], NOW, 'b'), false);
  assert.equal(dailyDue([{ id: 1, t: NOW - 21 * H, reason: 'daily', fp: 'a' }], NOW, 'b'), true);
  assert.equal(dailyDue([{ id: 1, t: NOW - 3 * D, reason: 'daily', fp: 'a' }], NOW, 'a'), false);
  // an import copy does not count as the daily one
  assert.equal(dailyDue([{ id: 1, t: NOW - H, reason: 'import', fp: 'x' }], NOW, 'b'), true);
  assert.notEqual(fingerprint('abc'), fingerprint('abd'));
});

test('keeps 7 days, 4 weeks, the newest event copies – and always the newest copy', () => {
  const snaps = [];
  for (let d = 0; d < 60; d++) snaps.push({ id: `d${d}`, t: NOW - d * D - H, reason: 'daily' });
  for (let i = 0; i < 8; i++) snaps.push({ id: `i${i}`, t: NOW - i * 3 * D - 2 * H, reason: 'import' });
  const gone = new Set(toDelete(snaps, NOW));
  const kept = snaps.filter((s) => !gone.has(s.id));
  assert.equal(kept.filter((s) => s.reason === 'import').length, KEEP.events);
  const days = kept.filter((s) => s.reason === 'daily');
  assert.ok(days.some((s) => s.id === 'd0'));
  assert.ok(days.filter((s) => NOW - s.t < 7 * D).length === 7);
  assert.ok(days.length <= KEEP.days + KEEP.weeks + 1);
  assert.ok(!days.some((s) => NOW - s.t > 6 * 7 * D));    // nothing older than ~5 weeks
  assert.deepEqual(toDelete([{ id: 'x', t: NOW - 100 * D, reason: 'daily' }], NOW), []);
});

test('backup reminder: only with 20+ cards, never backed up / a month / 50 new cards, not while snoozed', () => {
  assert.equal(backupReminder({ cards: 5, now: NOW }), null);
  assert.deepEqual(backupReminder({ cards: 30, now: NOW }), { never: true, cards: 30 });
  assert.equal(backupReminder({ cards: 30, lastFile: NOW - 3 * D, cardsAtFile: 30, now: NOW }), null);
  assert.equal(backupReminder({ cards: 30, lastFile: NOW - 31 * D, cardsAtFile: 30, now: NOW }).days, 31);
  assert.equal(backupReminder({ cards: 100, lastFile: NOW - 8 * D, cardsAtFile: 40, now: NOW }).newCards, 60);
  assert.equal(backupReminder({ cards: 100, lastFile: NOW - 8 * D, cardsAtFile: 90, now: NOW }), null);
  assert.equal(backupReminder({ cards: 30, snoozeUntil: NOW + SNOOZE, now: NOW }), null);
});
