// Life story of a card in your collection: when it came, from which pack, the version you picked, your copy,
// and moments you add yourself ("pulled it at the Regional", "gift from Max"). Stored as a new field "life"
// on the collection entry (old app versions ignore it and keep it). No browser APIs – tested in Node.
//
// event: { t: time (ms), k: kind, ... }
//   add  {how: 'scan' | 'pack' | 'manual', pack?: set name, value?: € (middle of the price range)}
//   ver  {v: version label}            copy {c: "NM · Japanese · 1st"}
//   note {x: text, tag?: 'pulled' | 'gift' | 'trade' | 'bought' | 'event'}
//   pass {id: passport id}  (card passport recorded, passui.js)

export const LIFE_MAX = 40;          // events kept per card (oldest notes stay, oldest automatic ones go first)
const MERGE_MS = 10 * 60 * 1000;     // changing version / copy again within 10 minutes replaces the last change
export const NOTE_MAX = 140;

export const TAGS = {
  pulled: 'Pulled it myself',
  gift: 'Got it as a gift',
  trade: 'Traded for it',
  bought: 'Bought it',
  event: 'At an event',
};

const mid = (p) => (p && p.lo != null ? (p.hi != null ? (p.lo + p.hi) / 2 : p.lo) : null);
const round2 = (v) => (v == null ? undefined : Math.round(v * 100) / 100);

// Adds an event to the entry (changes and returns it).
export function addLife(entry, ev, now = Date.now()) {
  if (!entry || !ev?.k) return entry;
  const e = { t: ev.t ?? now, ...ev };
  if (e.k === 'note') {
    e.x = String(e.x || '').trim().slice(0, NOTE_MAX);
    if (!e.x && !e.tag) return entry;
    if (!e.x) delete e.x;
  }
  for (const k of Object.keys(e)) if (e[k] === undefined || e[k] === '') delete e[k];
  const life = Array.isArray(entry.life) ? [...entry.life] : [];
  const last = life[life.length - 1];
  if (last && last.k === e.k && (e.k === 'ver' || e.k === 'copy') && e.t - last.t < MERGE_MS) life.pop();
  // same as the last state of that kind: nothing new
  const prevSame = [...life].reverse().find((x) => x.k === e.k);
  if (prevSame && ((e.k === 'ver' && prevSame.v === e.v) || (e.k === 'copy' && prevSame.c === e.c))) { entry.life = life; return entry; }
  life.push(e);
  while (life.length > LIFE_MAX) {
    const i = life.findIndex((x, j) => j > 0 && x.k !== 'note');   // keep the first event and the notes
    life.splice(i > 0 ? i : 1, 1);
  }
  entry.life = life;
  return entry;
}

// The "came into the collection" event for a new entry.
export function addEvent(entry, { how } = {}) {
  return { k: 'add', how: how || (entry.pack ? 'pack' : 'scan'), pack: entry.pack?.name || undefined, value: round2(mid(entry.buy || entry.price)) };
}

export function removeNote(entry, t) {
  if (Array.isArray(entry?.life)) entry.life = entry.life.filter((x) => !(x.k === 'note' && x.t === t));
  return entry;
}

const DAY = 86400000;
// How long it has been with you: "3 days", "5 months", "2 years"
export function ageText(ms) {
  const d = Math.max(0, Math.floor(ms / DAY));
  if (d < 1) return 'today';
  if (d < 31) return `${d} day${d > 1 ? 's' : ''}`;
  const m = Math.floor(d / 30.44);
  if (m < 12) return `${m} month${m > 1 ? 's' : ''}`;
  const y = Math.floor(d / 365.25);
  return `${y} year${y > 1 ? 's' : ''}`;
}

// The story as lines to show, oldest first: [{t, k, text, sub, own (user note), tag}]
// Entries from before the story existed get their "added" line from entry.added / entry.pack / entry.buy.
// value: today's price (€), for the closing line.
export function lifeOf(entry, { now = Date.now(), value = null, eur = (v) => `€${v.toFixed(2)}` } = {}) {
  if (!entry) return [];
  const life = Array.isArray(entry.life) ? [...entry.life] : [];
  if (!life.some((x) => x.k === 'add')) life.unshift({ t: entry.added || entry.buy?.date || now, ...addEvent(entry), old: true });
  life.sort((a, b) => a.t - b.t);
  const out = life.map((x) => {
    switch (x.k) {
      case 'add': return { t: x.t, k: 'add', text: x.how === 'pack' ? (x.pack ? `Pulled from a pack: ${x.pack}` : 'Pulled from a pack') : 'Came into your collection',
        sub: x.value != null ? `worth ${eur(x.value)} then` : '' };
      case 'ver': return { t: x.t, k: 'ver', text: `Version: ${x.v}`, sub: '' };
      case 'copy': return { t: x.t, k: 'copy', text: `Your copy: ${x.c}`, sub: '' };
      case 'pass': return { t: x.t, k: 'pass', text: 'Card passport recorded', sub: x.id || '' };
      case 'note': return { t: x.t, k: 'note', text: x.x || TAGS[x.tag] || '', sub: x.x && x.tag ? TAGS[x.tag] : '', own: true, tag: x.tag || '' };
      default: return null;
    }
  }).filter(Boolean);
  const first = out[0]?.t ?? now;
  const add = life.find((x) => x.k === 'add');
  let sub = '';
  if (value != null && add?.value) {
    const p = ((value - add.value) / add.value) * 100;
    sub = Math.abs(p) < 0.5 ? 'same as then' : `${p > 0 ? '+' : '−'}${Math.abs(p) < 10 ? Math.abs(p).toFixed(1) : Math.round(Math.abs(p))} % since then`;
  }
  const age = ageText(now - first);
  out.push({ t: now, k: 'now', text: value != null ? `Today: worth ${eur(value)}` : 'Today', sub: [age === 'today' ? 'new in your collection today' : `with you for ${age}`, sub].filter(Boolean).join(' · ') });
  return out;
}
