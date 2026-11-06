// Pure parsing helpers. No browser APIs, so they can be tested in Node.

// Language part of a TCG set code -> language.
// Modern codes use two letters (LOB-DE001), old European prints one letter (LOB-G001),
// old North American prints none (LOB-001).
export const LANGUAGES = {
  '': { code: 'EN', name: 'English (NA)', supported: true },
  EN: { code: 'EN', name: 'English', supported: true },
  E: { code: 'EN', name: 'English (EU)', supported: true },
  DE: { code: 'DE', name: 'German', supported: true, api: 'de' },
  G: { code: 'DE', name: 'German', supported: true, api: 'de' },
  FR: { code: 'FR', name: 'French', supported: true, api: 'fr' },
  F: { code: 'FR', name: 'French', supported: true, api: 'fr' },
  IT: { code: 'IT', name: 'Italian', supported: true, api: 'it' },
  I: { code: 'IT', name: 'Italian', supported: true, api: 'it' },
  SP: { code: 'SP', name: 'Spanish', supported: true },
  S: { code: 'SP', name: 'Spanish', supported: true },
  PT: { code: 'PT', name: 'Portuguese', supported: true, api: 'pt' },
  P: { code: 'PT', name: 'Portuguese', supported: true, api: 'pt' },
  JP: { code: 'JP', name: 'Japanese (OCG)', supported: false },
  JA: { code: 'JP', name: 'Japanese (OCG)', supported: false },
  KR: { code: 'KR', name: 'Korean', supported: false },
  K: { code: 'KR', name: 'Korean', supported: false },
  AE: { code: 'AE', name: 'Asian English', supported: false },
};

// Characters OCR often confuses with digits.
const DIGIT_FIX = { O: '0', Q: '0', D: '0', I: '1', L: '1', T: '1', Z: '2', S: '5', B: '8', G: '6' };

export function normalizeOcrText(text) {
  return String(text || '')
    .toUpperCase()
    .replace(/[‐-―−_~=]/g, '-') // all kinds of dashes
    .replace(/[|]/g, 'I');
}

function fixDigits(s) {
  return s.split('').map((c) => DIGIT_FIX[c] ?? c).join('');
}

// Find everything in OCR text that looks like a set code, best guesses first.
export function findSetCodes(text) {
  const t = normalizeOcrText(text);
  const re = /(?:^|[^A-Z0-9])([A-Z0-9]{2,5})\s?-\s?([A-Z]{0,2})\s?([0-9OQDILTZSBG]{3})(?![A-Z0-9])/g;
  const found = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(t)) !== null) {
    const prefix = m[1];
    let lang = m[2];
    const num = fixDigits(m[3]);
    if (!/^[0-9]{3}$/.test(num)) continue;
    if (!/[A-Z]/.test(prefix)) continue; // prefixes always contain a letter
    if (!(lang in LANGUAGES)) {
      // e.g. "EM" read for "EN": keep the first letter if it is a known one-letter code
      if (lang.length === 2 && lang[0] in LANGUAGES) lang = lang[0];
      else continue;
    }
    const code = `${prefix}-${lang}${num}`;
    if (seen.has(code)) continue;
    seen.add(code);
    found.push({ code, prefix, lang, num, language: LANGUAGES[lang] });
    re.lastIndex = m.index + 1; // allow overlapping candidates
  }
  // Prefer codes with an explicit two-letter language part (modern prints).
  return found.sort((a, b) => (b.lang.length === 2) - (a.lang.length === 2));
}

// Parse a code the user typed by hand.
export function parseManualCode(input) {
  return findSetCodes(` ${input} `)[0] || null;
}

// The card database stores English codes. Same number = same card in all European languages.
export function lookupCandidates(parsed) {
  const { prefix, num } = parsed;
  return [`${prefix}-EN${num}`, `${prefix}-E${num}`, `${prefix}-${num}`];
}

export function detectFirstEdition(text) {
  const t = normalizeOcrText(text);
  return /1ST\s*ED|1\s*\.?\s*AUFLAGE|1R?E\s*[EÉ]DITION|1\s*[AªᵃO]?\s*EDIZIONE|1\s*[AªᵃO]?\s*EDICI|1\s*[AªᵃO]?\s*EDI[CÇ][AÃ]O|FIRST\s*EDITION/.test(t);
}

export function valueTier(eur) {
  if (eur == null || Number.isNaN(eur)) return 'unknown';
  if (eur >= 10) return 'high';
  if (eur >= 1) return 'mid';
  return 'low';
}

export function cardmarketSearchUrl(name) {
  return `https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${encodeURIComponent(name)}`;
}

// Same key as tools/build_data.py norm(): lower case letters and digits only, accents removed.
export function normName(name) {
  return String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}
