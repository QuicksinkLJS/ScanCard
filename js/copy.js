// One physical copy of a card: condition, language, 1st Edition.
// For collection cards (what you own) and wishlist cards (what you are looking for). No browser APIs (tested in Node).
//
// The OCG (Japanese, Korean, Asian English prints) has no 1st Edition – the switch is not offered there.

export const CONDS = [['MT', 'Mint'], ['NM', 'Near Mint'], ['EX', 'Excellent'], ['GD', 'Good'], ['LP', 'Light Played'], ['PL', 'Played'], ['PO', 'Poor']];
export const LANGS = [['EN', 'English'], ['DE', 'German'], ['FR', 'French'], ['IT', 'Italian'], ['SP', 'Spanish'], ['PT', 'Portuguese'], ['JP', 'Japanese (OCG)'], ['KR', 'Korean (OCG)'], ['AE', 'Asian English (OCG)']];
const OCG_LANGS = new Set(['JP', 'KR', 'AE']);

// A version from the OCG: OCG expansions, or sets whose only codes are Japanese/Korean/Asian-English prints.
export function isOcgOption(o) {
  if (!o) return false;
  if (/\(OCG\)/.test(o.set || '')) return true;
  const codes = o.codes || [];
  return codes.some((c) => /-(JP|KR|AE)\d/.test(c)) && !codes.some((c) => /-(EN|E|DE|G|FR|F|IT|I|SP|S|PT|P)\d/.test(c));
}

// Is a 1st Edition possible for this language / version?
export function hasFirstEdition({ lang = null, option = null } = {}) {
  if (lang && OCG_LANGS.has(lang)) return false;
  if (option && isOcgOption(option)) return false;
  return true;
}

// The language of a collection card: set by hand, else read from the set code.
export const langOf = (e) => e?.lang || e?.language?.code || e?.code?.language?.code || '';

// Short text: "NM · German · 1st"
export function copyText(c = {}, { wish = false } = {}) {
  const parts = [];
  const lang = wish ? c.lang : langOf(c);
  if (c.cond) parts.push(wish ? `${c.cond}+` : c.cond);
  if (lang && lang !== 'any') parts.push(LANGS.find((l) => l[0] === lang)?.[1].replace(/ \(OCG\)$/, '') || lang);
  if (c.first === true) parts.push('1st');
  else if (c.first === false && !wish) parts.push('Unlimited');
  return parts.join(' · ');
}

// Does an offer meet what a wish asks for? (condition at least, language, 1st)
export function meetsWish(wish, copy) {
  const rank = (k) => CONDS.findIndex((x) => x[0] === k);
  if (wish.cond && copy.cond && rank(copy.cond) > rank(wish.cond)) return false;
  if (wish.lang && wish.lang !== 'any' && copy.lang && copy.lang !== wish.lang) return false;
  if (wish.first === true && copy.first === false) return false;
  return true;
}
