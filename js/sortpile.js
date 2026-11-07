// Sort suggestion for a pile of cards: bulk (< €0.50), keep, sell (> €5). No browser APIs (tested in Node).
export const BULK_MAX = 0.5;
export const SELL_MIN = 5;

// price: {lo, hi} – a range means the version is not known yet
export function pileOf(price) {
  if (!price || price.lo == null) return 'check';
  const lo = price.lo, hi = price.hi ?? lo;
  if (hi < BULK_MAX) return 'bulk';
  if (lo > SELL_MIN) return 'sell';
  if (Math.abs(hi - lo) < 0.005 || (lo >= BULK_MAX && hi <= SELL_MIN)) return 'keep';
  return 'check';
}

export const PILES = {
  bulk: { label: 'Bulk', hint: `under €${BULK_MAX.toFixed(2)}` },
  keep: { label: 'Keep', hint: `€${BULK_MAX.toFixed(2)}–${SELL_MIN}` },
  sell: { label: 'Sell', hint: `over €${SELL_MIN}` },
  check: { label: 'Check version', hint: 'price depends on the version' },
};
