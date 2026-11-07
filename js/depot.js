// The collection as a portfolio: value now, value when added, best cards, value per set. No browser APIs (tested in Node).

// One number for a price that may be a range (version not chosen yet): the middle.
export function mid(p) {
  if (!p || p.lo == null) return null;
  return p.hi == null ? p.lo : (p.lo + p.hi) / 2;
}

// Change of one entry since it was added, in % (null if unknown).
export function changeOf(e) {
  const now = mid(e.price), then = mid(e.buy);
  if (now == null || !then) return null;
  return (now - then) / then * 100;
}

// Set name for grouping: the chosen version's set, else the label's first part.
export function setOf(e) {
  if (e.price?.set) return e.price.set;
  return 'Version not chosen yet';
}

export function portfolio(list, top = 5) {
  let value = 0, cost = 0, withBuy = 0, lo = 0, hi = 0;
  for (const e of list) {
    lo += e.price?.lo || 0;
    hi += e.price?.hi || 0;
    const v = mid(e.price), b = mid(e.buy);
    if (v != null && b != null) { value += v; cost += b; withBuy++; }
  }
  const sets = new Map();
  for (const e of list) {
    const k = setOf(e);
    const s = sets.get(k) || { set: k, value: 0, count: 0 };
    s.value += mid(e.price) || 0;
    s.count++;
    sets.set(k, s);
  }
  return {
    lo, hi,
    change: withBuy ? value - cost : null,
    pct: withBuy && cost ? (value - cost) / cost * 100 : null,
    top: [...list].filter((e) => mid(e.price)).sort((a, b) => mid(b.price) - mid(a.price)).slice(0, top),
    bySet: [...sets.values()].sort((a, b) => b.value - a.value),
  };
}

export const pctText = (p) => (p == null ? '' : `${p >= 0 ? '+' : '−'}${Math.abs(p) < 10 ? Math.abs(p).toFixed(1) : Math.round(Math.abs(p))} %`);
