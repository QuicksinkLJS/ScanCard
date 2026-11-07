// Masterset numbers (no browser APIs, tested in Node).
// entries: [{key, trend}], owned: {key: copies}, target: copies wanted per entry
// Only trend prices count: the lowest offer of a rarely sold card is often a placeholder (€999…).
export function progress(entries, owned, target = 1) {
  let have = 0, missingValue = 0, unpriced = 0;
  for (const e of entries) {
    const n = Math.min(owned[e.key] || 0, target);
    have += n;
    if (n < target) {
      if (e.trend == null) unpriced++;
      else missingValue += (target - n) * e.trend;
    }
  }
  return { have, total: entries.length * target, missingValue, unpriced };
}
