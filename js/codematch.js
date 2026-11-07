// Matches what OCR read in the set-code area against the codes the recognised card was really printed with.
// No browser APIs, so it can be tested in Node.
//
// names.json gives every card its "base codes" (code without the language part), e.g. "SUDA-014".
// The printed code carries a language part that differs per print run (SUDA-EN014, SUDA-DE014, SUDA-JP014),
// so we compare without it and allow small reading errors (edit distance).

import { LANGUAGES, normalizeOcrText } from './parse.js';

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// OCR confuses these in the number part.
const DIGIT = { O: '0', Q: '0', D: '0', U: '0', I: '1', L: '1', T: '1', J: '1', Z: '2', S: '5', B: '8', G: '6', A: '4' };
const toDigits = (s) => s.split('').map((c) => DIGIT[c] ?? c).join('');

// Language part between dash and number. Two letters first, then one, then none.
const LANG_KEYS = Object.keys(LANGUAGES).sort((a, b) => b.length - a.length);

// Loose candidates from OCR text: PREFIX - [LANG] NNN, with the usual noise.
export function codeTokens(text) {
  const t = normalizeOcrText(text).replace(/[.,:;'"`´]/g, '');
  const re = /([A-Z0-9]{2,5})\s?-\s?([A-Z0-9]{3,6})(?![A-Z0-9])/g;
  const out = [];
  let m;
  while ((m = re.exec(t)) !== null) {
    const prefix = m[1];
    const rest = m[2];
    if (!/[A-Z]/.test(prefix)) continue;
    // split rest into language + 3-digit number
    for (const lk of LANG_KEYS) {
      if (lk && !rest.startsWith(lk)) continue;
      const num = toDigits(rest.slice(lk.length));
      if (!/^[0-9]{3}$/.test(num)) continue;
      out.push({ raw: m[0].trim(), prefix, lang: lk, num, base: `${prefix}-${num}`, language: LANGUAGES[lk] });
      break;
    }
    re.lastIndex = m.index + 1;
  }
  return out;
}

// Language of the card from the OCR text alone (useful even when the code itself doesn't match).
// OCR misreads of the language part: "1P"/"IP"/"JF" for JP, "KP"/"K R" for KR ...
const LANG_FIX = { '1P': 'JP', IP: 'JP', JF: 'JP', LP: 'JP', JR: 'JP', KP: 'KR', XR: 'KR', EM: 'EN', FN: 'EN', OE: 'DE', BE: 'DE' };

export function languageFromText(text) {
  const t = normalizeOcrText(text).replace(/\s+/g, '');
  const m = t.match(/[A-Z0-9]{2,6}-([A-Z1]{2})[0-9OQDILTZSBG]{3}/);
  if (!m) return null;
  const code = LANG_FIX[m[1]] || m[1];
  return LANGUAGES[code] && code.length === 2 ? LANGUAGES[code] : null;
}

// Best base code for this card, or null.
// bases: ["SUDA-014", "MP25-265", ...] from names.json
export function matchCode(text, bases) {
  const tokens = codeTokens(text);
  if (!tokens.length || !bases?.length) return null;
  let best = null;
  for (const tok of tokens) {
    for (const base of bases) {
      const d = levenshtein(tok.base, base);
      // allow one wrong character, two for long codes; the number part must be close
      const limit = base.length >= 9 ? 2 : 1;
      if (d > limit) continue;
      if (levenshtein(tok.num, base.slice(-3)) > 1) continue;
      if (!best || d < best.distance) best = { base, distance: d, token: tok };
    }
  }
  if (!best) return null;
  const { token } = best;
  const [prefix, num] = best.base.split('-');
  return {
    base: best.base,
    distance: best.distance,
    read: token.raw,
    lang: token.lang,
    language: token.language,
    code: `${prefix}-${token.lang}${num}`, // the printed code, with the corrected prefix/number
  };
}

// Strip the language part from a full code: "SUDA-DE014" -> "SUDA-014"
export function baseOf(code) {
  const m = /^([A-Z0-9]+)-[A-Z]{0,2}(\d{3})$/.exec(code);
  return m ? `${m[1]}-${m[2]}` : code;
}
