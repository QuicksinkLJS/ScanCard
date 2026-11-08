// Data safety: automatic copies of everything on this phone (taken daily and before anything that replaces
// or adds a lot: import, restoring a backup, clearing the collection), which ones to keep, and when to remind
// you to save a backup file. The copies live on this phone too – they protect against mistakes and bugs,
// not against a lost phone or cleared browser data; that is what the backup file is for.
// No browser APIs (tested in Node); the copies themselves are stored by safestore.js.

const HOUR = 3600000, DAY = 24 * HOUR;
export const KEEP = { events: 5, days: 7, weeks: 4 };   // at most 16 copies
export const DAILY_AFTER = 20 * HOUR;                   // a new daily copy at most every 20 hours

// Quick fingerprint of the data (to skip a copy when nothing changed).
export function fingerprint(text) {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${(h >>> 0).toString(16)}-${s.length}`;
}

// Is a daily copy due? snaps: [{id, t, reason, fp}] (any order)
export function dailyDue(snaps, now, fp) {
  const latest = [...snaps].sort((a, b) => b.t - a.t)[0];
  if (latest && latest.fp === fp) return false;                 // nothing changed since the last copy
  const daily = snaps.filter((s) => s.reason === 'daily').sort((a, b) => b.t - a.t)[0];
  return !daily || now - daily.t >= DAILY_AFTER;
}

// Which copies to delete: keep the newest few event copies (before import / restore / clear), the newest
// daily copy of each of the last 7 days, and one per week for 4 weeks. The newest copy always stays.
export function toDelete(snaps, now) {
  const sorted = [...snaps].sort((a, b) => b.t - a.t);
  const keep = new Set(sorted.slice(0, 1).map((s) => s.id));
  sorted.filter((s) => s.reason !== 'daily').slice(0, KEEP.events).forEach((s) => keep.add(s.id));
  const days = new Set(), weeks = new Set();
  for (const s of sorted.filter((x) => x.reason === 'daily')) {
    const age = now - s.t;
    const d = Math.floor(age / DAY), w = Math.floor(age / (7 * DAY));
    if (d < KEEP.days && !days.has(d)) { days.add(d); keep.add(s.id); }
    else if (w < KEEP.days / 7 + KEEP.weeks && d >= KEEP.days && !weeks.has(w)) { weeks.add(w); keep.add(s.id); }
  }
  return sorted.filter((s) => !keep.has(s.id)).map((s) => s.id);
}

// Remind to save a backup file? Only with a collection worth losing, never while snoozed.
// -> null | {never: true} | {days, newCards}
export const REMIND_FROM = 20;   // cards
export function backupReminder({ cards = 0, lastFile = null, cardsAtFile = null, snoozeUntil = 0, now = Date.now() } = {}) {
  if (cards < REMIND_FROM || now < snoozeUntil) return null;
  if (!lastFile) return { never: true, cards };
  const days = Math.floor((now - lastFile) / DAY);
  const newCards = Math.max(0, cards - (cardsAtFile ?? cards));
  if (days >= 30 || (days >= 7 && newCards >= 50)) return { days, newCards, cards };
  return null;
}
export const SNOOZE = 7 * DAY;

// Short label of a copy: reason in words.
export const REASONS = {
  daily: 'Daily copy', import: 'Before an import', restore: 'Before restoring', clear: 'Before clearing the collection', manual: 'Saved by hand',
};
