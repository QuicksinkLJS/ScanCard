// Reading a card by its printed text: the name bar (or the start of the effect text) is read with OCR and
// compared with every card name / effect in that language (data/ygo/text-<lang>.json, effect-<lang>.json).
// Helps where the picture alone is not enough: Ghost Rares (pale pictures), alternative artworks, glare.
// The matching is tested in Node; loading needs the API.

// Printed language (code from the set code) -> file and Tesseract language
export const TEXT_LANG = { EN: 'en', AE: 'en', DE: 'de', FR: 'fr', IT: 'it', SP: 'sp', PT: 'pt', JP: 'jp', KR: 'kr' };
export const TESS_LANG = { en: 'eng', de: 'eng', fr: 'eng', it: 'eng', sp: 'eng', pt: 'eng', jp: 'jpn', kr: 'kor' };

// Where to read on the cut-out card. The cut is not always exact (sleeves, neighbouring cards), so the name is
// searched in the whole top fifth; the effect text in the lower part.
export const NAME_BAR = { x: 0, y: 0, w: 1, h: 0.2 };
export const TEXT_BOX = { x: 0.04, y: 0.7, w: 0.92, h: 0.2 };

// Lower case, full-width -> normal, only letters and digits (any script)
export function normText(s) {
  return String(s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function grams(s) {
  const g = new Map();
  if (s.length < 2) { if (s) g.set(s, 1); return g; }
  for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); g.set(k, (g.get(k) || 0) + 1); }
  return g;
}
function overlap(a, b) {
  let n = 0;
  for (const [k, v] of a) { const w = b.get(k); if (w) n += Math.min(v, w); }
  return n;
}
const size = (g) => { let n = 0; for (const v of g.values()) n += v; return n; };

// Index of one language file: [{name (English), g (bigrams), n (bigram count)}]
export function buildIndex(file, key = 'n') {
  return (file[key] || []).map(([text, i]) => {
    const g = grams(normText(text));
    return { name: file.en[i], g, n: size(g) };
  }).filter((x) => x.n >= 1);
}

// Best matches for an OCR text. Score: mix of Dice similarity and how much of the candidate was found
// (the OCR text may carry junk around the name). Each English name only once.
export function matchText(text, index, k = 3) {
  const q = grams(normText(text));
  const qn = size(q);
  if (qn < 2) return [];
  const best = new Map();
  for (const e of index) {
    const o = overlap(q, e.g);
    if (!o) continue;
    const dice = (2 * o) / (qn + e.n);
    const cover = o / e.n;
    const score = 0.6 * dice + 0.4 * cover * Math.min(1, e.n / 4); // very short names must not win by being contained
    if (score > (best.get(e.name) || 0)) best.set(e.name, score);
  }
  return [...best].map(([name, score]) => ({ name, score: Math.round(score * 1000) / 1000 }))
    .sort((a, b) => b.score - a.score).slice(0, k);
}

// OCR text with several lines (e.g. reading aid above a Japanese name): each line and the whole text, best wins.
export function matchLines(text, index, k = 3) {
  const parts = [text, ...String(text || '').split(/\n+/).filter((l) => normText(l).length >= 2)];
  let best = [];
  for (const p of parts) {
    const m = matchText(p, index, k);
    if (m.length && (!best.length || m[0].score > best[0].score)) best = m;
  }
  return best;
}

// Only among some cards (the picture's candidates): a short, broken reading is enough to pick between them.
export function matchAmong(text, index, names, k = 3) {
  const set = new Set(names);
  return matchLines(text, index.filter((e) => set.has(e.name)), k);
}

// A reading is trusted when it is clearly good and clearly ahead of the next card.
export function decide(matches, { min = 0.62, margin = 0.08 } = {}) {
  const [a, b] = matches;
  if (!a || a.score < min) return null;
  if (b && a.score - b.score < margin) return null;
  return a;
}

// Loader with cache, per language and kind ('text' names, 'effect' effect texts)
export function createTextIndex(base = 'data/ygo', fetchFn = globalThis.fetch?.bind(globalThis)) {
  const cache = new Map();
  return function get(lang, kind = 'text') {
    const key = `${kind}-${lang}`;
    if (!cache.has(key)) {
      const p = fetchFn(`${base}/${key}.json`).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }).then((f) => buildIndex(f, kind === 'text' ? 'n' : 'e'));
      p.catch(() => cache.delete(key));
      cache.set(key, p);
    }
    return cache.get(key);
  };
}
