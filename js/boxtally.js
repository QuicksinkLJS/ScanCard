// Box tally: in pack mode, photos are added up – packs opened, what they cost, what was pulled, best pulls.
// Stored with the pack (cardscan-pack-v1, field "box"). Each photo counts once. No browser APIs (tested in Node).

export function addToBox(box, { photo, packs, booster, lo, hi, pulls = [] }) {
  const b = box ? { ...box, photos: [...box.photos], pulls: [...box.pulls] } : { photos: [], packs: 0, cost: 0, lo: 0, hi: 0, pulls: [] };
  if (b.photos.includes(photo)) return { box: b, added: false };
  b.photos.push(photo);
  b.packs += packs;
  b.cost = Math.round((b.cost + packs * booster) * 100) / 100;
  b.lo = Math.round((b.lo + lo) * 100) / 100;
  b.hi = Math.round((b.hi + hi) * 100) / 100;
  b.pulls = [...b.pulls, ...pulls].sort((x, y) => (y.hi ?? y.lo ?? 0) - (x.hi ?? x.lo ?? 0)).slice(0, 12);
  return { box: b, added: true };
}

// "+25 %" or "-12 % … +8 %" while versions are open
export function boxResult(b) {
  if (!b?.cost) return null;
  const pct = (v) => Math.round((v - b.cost) / b.cost * 100);
  return { lo: pct(b.lo), hi: pct(b.hi), win: b.lo >= b.cost, maybe: b.lo < b.cost && b.hi >= b.cost };
}
