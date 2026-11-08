// Rarity teacher: what each Yu-Gi-Oh! rarity looks like, how to tell it from the ones it is mixed up with,
// and where your version stands among the versions of this card. No browser APIs (tested in Node).
//
// Sources (Nov 2026): TCGplayer "Understanding Yu-Gi-Oh! Rarities", cardprices.io rarity guide, misprint.com
// rarity guides, Samurai Sword Tokyo OCG rarity guide (QCSR / Prismatic), wargamer.com, Yugipedia (QCSR,
// Starlight Rare). Where sources differ in a detail, the text stays general. Looks vary a little by set and era.
//
// entry: {key, name, short, re (matches Cardmarket / CardTrader rarity names), look (holo.js effect), group,
//   name: how the card name looks, art: the artwork, more: other parts, tell: the quick check,
//   confuse: keys it is mixed up with, since, ocg (true = Japanese/Asian prints only)}

export const GROUPS = { base: 'No foil or little foil', foil: 'Foil', secret: 'Secret family', premium: 'Premium', special: 'Special sets' };

export const RARITIES = [
  { key: 'common', name: 'Common', short: 'C', re: /^common$/, look: 'common', group: 'base',
    name_: 'Plain black or white letters', art: 'No foil', more: '',
    tell: 'Nothing shines when you tilt it.', confuse: ['shortprint'], since: 'since 1999' },
  { key: 'shortprint', name: 'Short Print', short: 'SP', re: /^(super )?short print$/, look: 'common', group: 'base',
    name_: 'Like a Common', art: 'No foil', more: 'Printed less often than the Commons of its set.',
    tell: 'Looks exactly like a Common – only the set list tells.', confuse: ['common'], since: 'early sets' },
  { key: 'rare', name: 'Rare', short: 'R', re: /^rare$/, look: 'rare', group: 'base',
    name_: 'Silver foil', art: 'No foil', more: '',
    tell: 'Only the name shines – the picture stays flat.', confuse: ['super'], since: 'since 1999' },
  { key: 'super', name: 'Super Rare', short: 'SR', re: /^super rare$/, look: 'super', group: 'foil',
    name_: 'Plain letters, no foil', art: 'Holo foil', more: 'Newer cards: also the Level stars and Attribute in foil.',
    tell: 'Shiny picture, but a plain name.', confuse: ['rare', 'ultra'], since: 'since 1999' },
  { key: 'ultra', name: 'Ultra Rare', short: 'UR', re: /^ultra rare$/, look: 'ultra', group: 'foil',
    name_: 'Gold foil', art: 'Holo foil', more: 'Newer cards: also the Level stars and Attribute in foil.',
    tell: 'Shiny picture and a gold name.', confuse: ['super', 'gold'], since: 'since 1999' },
  { key: 'secret', name: 'Secret Rare', short: 'ScR', re: /^secret rare$/, look: 'secret', group: 'secret',
    name_: 'Rainbow-silver foil', art: 'Foil with fine diagonal lines', more: 'Attribute and Level stars in the same foil.',
    tell: 'Tilt it: the light runs in fine diagonal lines across the picture.', confuse: ['prismatic', 'platsecret', 'qcsr'], since: 'since 2002' },
  { key: 'prismatic', name: 'Prismatic Secret Rare', short: 'PScR', re: /^prismatic secret rare$/, look: 'prismatic', group: 'secret',
    name_: 'Speckled multi-colour foil', art: 'Foil with horizontal and vertical lines instead of diagonal ones', more: 'In Japan it looks much like a TCG Starlight Rare.',
    tell: 'The light runs in straight lines (across and down), not diagonally.', confuse: ['secret', 'qcsr', 'starlight'], since: 'TCG 2020s; in Japan the top Secret Rare since 2020, again after the QCSR years' },
  { key: 'platsecret', name: 'Platinum Secret Rare', short: 'PlScR', re: /^platinum secret rare$/, look: 'secret', group: 'secret',
    name_: 'Platinum (silver-grey) foil', art: 'Secret Rare foil (diagonal lines)', more: 'In Mega-Tins and the 25th anniversary Rarity Collections the foil covers nearly the whole card.',
    tell: 'Like a Secret Rare, but cooler, chrome-like – and a platinum name.', confuse: ['secret', 'extrasecret'], since: 'Mega-Tins, Rarity Collections' },
  { key: 'qcsr', name: 'Quarter Century Secret Rare', short: 'QCSR', re: /quarter century/, look: 'qcsr', group: 'premium',
    name_: 'Speckled champagne-gold foil', art: 'Secret foil over the whole card', more: 'A small "Yu-Gi-Oh! Card Game 25th Quarter Century" watermark in the text box.',
    tell: 'Look for the 25th anniversary watermark in the text box – no other rarity has it.', confuse: ['starlight', 'prismatic'], since: '2023–2025 (25th anniversary)' },
  { key: 'starlight', name: 'Starlight Rare', short: 'StR', re: /^starlight rare$/, look: 'starlight', group: 'premium',
    name_: 'White, in foil', art: 'Foil with fine glitter lines', more: 'Almost the whole card is foil: frame, name, picture. From 2026 (Chaos Origins) reportedly with a rainbow outer edge.',
    tell: 'The whole card glitters, the frame too – but there is no 25th watermark.', confuse: ['qcsr', 'prismatic'], since: 'since 2019 (Rising Rampage)' },
  { key: 'ultimate', name: 'Ultimate Rare', short: 'UtR', re: /^ultimate rare$/, look: 'relief', group: 'premium',
    name_: 'Gold foil', art: 'Raised, embossed relief', more: 'Frame, Attribute and Level stars are embossed too. In Japan called Relief.',
    tell: 'Run a finger over it: the picture and frame are raised.', confuse: ['collector', 'prismult'], since: 'since 2004 (Rise of Destiny)' },
  { key: 'prismult', name: 'Prismatic Ultimate Rare', short: 'PUtR', re: /^prismatic ultimate rare$/, look: 'relief', group: 'premium',
    name_: 'Foil', art: 'Raised relief with a rainbow prism layer', more: '',
    tell: 'Raised like an Ultimate Rare, but with a strong rainbow shimmer.', confuse: ['ultimate'], since: 'Rarity Collections (25th anniversary)' },
  { key: 'ghost', name: 'Ghost Rare', short: 'GR', re: /^ghost rare$/, look: 'ghost', group: 'premium',
    name_: 'Silver-white foil', art: 'Pale, almost white 3D hologram', more: 'In Japan: Holographic Rare.',
    tell: 'The monster looks pale and ghostly and seems to float in the card.', confuse: ['holographic'], since: 'since 2007 (Tactical Evolution)' },
  { key: 'collector', name: "Collector's Rare", short: 'CR', re: /^collector'?s rare$/, look: 'collector', group: 'premium',
    name_: 'Rainbow foil', art: 'Textured, etched foil; the main figure is raised', more: 'A fingerprint-like texture that catches the light roughly.',
    tell: 'Feels rough and textured, not smooth like normal foil.', confuse: ['ultimate', 'prismcollector'], since: 'since 2020 (Toon Chaos)' },
  { key: 'prismcollector', name: "Prismatic Collector's Rare", short: 'PCR', re: /^prismatic collector'?s rare$/, look: 'collector', group: 'premium',
    name_: 'Rainbow foil', art: "Collector's Rare texture plus a layer of sparkly dots", more: '',
    tell: "Like a Collector's Rare, but brighter with glitter dots on top.", confuse: ['collector'], since: 'Rarity Collections (25th anniversary)' },
  { key: 'gold', name: 'Gold Rare', short: 'GUR', re: /^gold rare$/, look: 'ultra', group: 'special',
    name_: 'Gold foil', art: 'Gold foil', more: 'The whole frame is gold.',
    tell: 'Gold frame around the card.', confuse: ['ultra', 'goldsecret', 'premiumgold'], since: 'Gold Series' },
  { key: 'premiumgold', name: 'Premium Gold Rare', short: 'PGR', re: /^premium gold rare$/, look: 'ultra', group: 'special',
    name_: 'Gold foil', art: 'Deep metallic gold', more: 'Nearly the whole card surface in textured gold.',
    tell: 'The whole card looks like gold metal.', confuse: ['gold'], since: 'Premium Gold sets' },
  { key: 'goldsecret', name: 'Gold Secret Rare', short: 'GScR', re: /^gold secret rare$/, look: 'secret', group: 'special',
    name_: 'Gold foil', art: 'Secret Rare foil (diagonal lines)', more: 'Gold frame.',
    tell: 'Gold frame and diagonal Secret lines in the picture.', confuse: ['gold'], since: 'Gold Series' },
  { key: 'ghostgold', name: 'Ghost/Gold Rare', short: 'GGR', re: /^ghost\/gold rare$/, look: 'ghost', group: 'special',
    name_: 'Gold foil', art: 'Ghost-style pale hologram', more: 'Gold frame.',
    tell: 'A ghostly picture in a gold frame.', confuse: ['ghost', 'gold'], since: 'Gold Series: Haunted Mine' },
  { key: 'platinum', name: 'Platinum Rare', short: 'PlR', re: /^platinum rare$/, look: 'ultra', group: 'special',
    name_: 'Platinum foil', art: 'Foil', more: 'Platinum frame. Only in the Noble Knights of the Round Table box.',
    tell: 'Platinum frame and name – only in that one box set.', confuse: ['platsecret'], since: 'Noble Knights of the Round Table' },
  { key: 'starfoil', name: 'Starfoil Rare', short: 'SFR', re: /^starfoil( rare)?$/, look: 'super', group: 'special',
    name_: 'Plain', art: 'Foil with a pattern of stars', more: 'Battle Pack sets.',
    tell: 'Star shapes in the foil, bigger than the dots of a Super Rare.', confuse: ['shatterfoil', 'super'], since: 'Battle Pack sets' },
  { key: 'shatterfoil', name: 'Shatterfoil Rare', short: 'SHR', re: /^shatterfoil( rare)?$/, look: 'super', group: 'special',
    name_: 'Plain', art: 'Foil like shattered glass', more: 'Battle Pack 3.',
    tell: 'Large angular pieces, like broken glass.', confuse: ['starfoil', 'mosaic'], since: 'Battle Pack 3' },
  { key: 'mosaic', name: 'Mosaic Rare', short: 'MSR', re: /^mosaic( rare)?$/, look: 'super', group: 'special',
    name_: 'Plain', art: 'Foil in square tiles', more: 'Battle Pack 2.',
    tell: 'A grid of small square tiles.', confuse: ['shatterfoil'], since: 'Battle Pack 2' },
  { key: 'parallel', name: 'Parallel Rare', short: 'PR', re: /parallel/, look: 'super', group: 'special',
    name_: 'As the base rarity (plain, silver or gold)', art: 'As the base rarity', more: 'A fine parallel-line foil over the whole card (Duel Terminal: often dots).',
    tell: 'The whole card has a soft, even shimmer on top.', confuse: ['common', 'super'], since: 'Japan, Duel Terminal, tins' },
  { key: 'extrasecret', name: 'Extra Secret Rare', short: 'EScR', re: /^extra secret rare$/, look: 'secret', group: 'secret', ocg: true,
    name_: 'Rainbow foil', art: 'Secret foil', more: 'Foil on everything except the text box and part of the picture.',
    tell: 'Almost the whole card shines, but the text box is plain.', confuse: ['platsecret'], since: 'Japan' },
  { key: '20thsecret', name: '20th Secret Rare', short: '20ScR', re: /^20th secret rare$/, look: 'secret', group: 'secret', ocg: true,
    name_: 'Red holographic foil', art: 'Secret Rare foil', more: '',
    tell: 'A red shimmering name.', confuse: ['secret'], since: 'Japan, 20th anniversary (2019–2020)' },
  { key: 'holographic', name: 'Holographic Rare', short: 'HGR', re: /^holographic rare$/, look: 'ghost', group: 'premium', ocg: true,
    name_: 'Silver foil', art: 'Pale 3D hologram', more: 'The Japanese Ghost Rare.',
    tell: 'Pale, ghostly picture.', confuse: ['ghost'], since: 'Japan' },
  { key: 'pharaoh', name: "Pharaoh's Rare", short: 'PhR', re: /pharaoh/, look: 'rainbow', group: 'special',
    name_: 'As Ultra or Secret Rare', art: 'Foil with an Egyptian hieroglyph pattern', more: '',
    tell: 'Hieroglyphs in the foil when you tilt it.', confuse: ['ultra', 'secret'], since: '25th anniversary sets' },
  { key: '10000', name: '10000 Secret Rare', short: '10KScR', re: /^10000 secret rare$/, look: 'qcsr', group: 'special',
    name_: 'Secret foil with gold', art: 'Secret foil', more: 'Only one card (card number ending in 10K).',
    tell: 'The card number ends in 10K.', confuse: ['secret'], since: 'Battles of Legend: Armageddon' },
  { key: 'grandmaster', name: 'Grand Master Rare', short: 'GMR', re: /^grand master rare$/, look: 'rainbow', group: 'premium', ocg: true,
    name_: 'Foil', art: 'Premium foil', more: 'A serial number on the card. Only some Ultra Rares of a set get it.',
    tell: 'Look for the serial number.', confuse: ['qcsr', 'prismatic'], since: 'Japan, since 2026' },
];
const BY_KEY = new Map(RARITIES.map((r) => [r.key, r]));
export const rarityByKey = (k) => BY_KEY.get(k) || null;

// The entry for a rarity name from the data ("Quarter Century Secret Rare", "Prismatic Collector's Rare", …).
// Most specific first: prismatic/platinum/gold variants before the plain ones.
const ORDER = ['10000', '20thsecret', 'extrasecret', 'prismcollector', 'prismult', 'prismatic', 'platsecret', 'goldsecret', 'ghostgold', 'premiumgold', 'qcsr',
  'starlight', 'ultimate', 'ghost', 'holographic', 'collector', 'pharaoh', 'grandmaster', 'parallel', 'gold', 'platinum', 'starfoil', 'shatterfoil', 'mosaic',
  'secret', 'ultra', 'super', 'rare', 'shortprint', 'common'];
export function rarityOf(name) {
  const t = String(name || '').toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  if (!t) return null;
  for (const k of ORDER) { const r = BY_KEY.get(k); if (r.re.test(t)) return r; }
  return null;
}

// How to tell several rarities apart: one row per feature, one column per rarity (unknown names are skipped).
export function compareRarities(names) {
  const list = [];
  for (const n of names) { const r = rarityOf(n); if (r && !list.includes(r)) list.push(r); }
  return {
    list,
    rows: [
      { label: 'Name', values: list.map((r) => r.name_) },
      { label: 'Artwork', values: list.map((r) => r.art) },
      { label: 'Quick check', values: list.map((r) => r.tell) },
    ],
  };
}

// Where a version stands among all versions of this card: its rarity among the rarities the card was printed in
// (lowest first), and its price against the cheapest version of the same set and against all versions.
// opts: versionOptions/rankOptions result; rank: prices.rarityRank
export function standing(opts, chosen, rank) {
  const rarityOfOpt = (o) => o.rarity || (o.variants <= 1 && o.rarities?.length === 1 ? o.rarities[0] : '');
  const mine = rarityOfOpt(chosen);
  if (!chosen || !mine) return null;
  // count real rarities only (the data also has odd names like "Ultra Rare 019"), one per kind
  const known = new Map();
  for (const r of opts.map(rarityOfOpt).filter(Boolean)) { const e = rarityOf(r); if (e && !known.has(e.key)) known.set(e.key, r); }
  const mineKey = rarityOf(mine)?.key;
  if (mineKey && !known.has(mineKey)) known.set(mineKey, mine);
  const all = [...known.values()].sort((a, b) => rank(a) - rank(b));
  const pos = all.findIndex((r) => rarityOf(r)?.key === mineKey);
  const sameSet = opts.filter((o) => o.set === chosen.set && rarityOfOpt(o) && o.trend != null);
  const cheapest = sameSet.length ? sameSet.reduce((a, b) => (b.trend < a.trend ? b : a)) : null;
  const factor = cheapest && cheapest.key !== chosen.key && chosen.trend != null && cheapest.trend > 0 ? chosen.trend / cheapest.trend : null;
  const priced = opts.filter((o) => o.trend != null).sort((a, b) => b.trend - a.trend);
  const priceRank = chosen.trend != null ? priced.findIndex((o) => o.key === chosen.key) + 1 : 0;
  return {
    rarity: mine, rarities: all, pos: pos + 1, of: all.length, top: pos === all.length - 1 && all.length > 1,
    setRarities: [...new Set(sameSet.map(rarityOfOpt))].sort((a, b) => rank(a) - rank(b)),
    factor: factor && factor >= 1.5 ? Math.round(factor * 10) / 10 : null, cheapest: factor ? rarityOfOpt(cheapest) : '',
    priceRank, priced: priced.length,
  };
}

// One line about the standing, e.g. "The rarest of 3 rarities this card was printed in · 4× the price of the Ultra Rare in this set"
export function standingText(s) {
  if (!s) return '';
  const parts = [];
  if (s.of > 1) parts.push(s.top ? `The rarest of the ${s.of} rarities this card has` : `Rarity ${s.pos} of ${s.of} for this card (lowest first)`);
  if (s.factor) parts.push(`${String(s.factor).replace(/\.0$/, '')}× the price of the ${s.cheapest} in this set`);
  if (s.priceRank === 1 && s.priced > 2) parts.push('the most expensive version of this card');
  return parts.join(' · ');
}
