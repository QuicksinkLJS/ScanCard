// Card + price lookup from the Curio data pack (data/ygo/<SET>.json).
// The pack joins Cardmarket's free price guide (EUR) with set codes; see tools/build_data.py.

import { lookupCandidates, normName } from './parse.js';
import { GAME } from './game.js';

// Same rule as bucket_of() in tools/build_data.py
export const bucketOf = (k) => (k.slice(0, 2) || '_').padEnd(2, '_');

export function createApi({ fetchFn = globalThis.fetch?.bind(globalThis), base = GAME.data } = {}) {
  let indexPromise = null;
  const setFiles = new Map();

  async function getJson(url) {
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }

  function index() {
    if (!indexPromise) {
      indexPromise = getJson(`${base}/index.json`).then((ix) => ({ ...ix, known: new Set(ix.sets) }));
      indexPromise.catch(() => { indexPromise = null; });
    }
    return indexPromise;
  }

  async function setFile(prefix) {
    if (!setFiles.has(prefix)) {
      const p = getJson(`${base}/${prefix}.json`);
      setFiles.set(prefix, p);
      p.catch(() => setFiles.delete(prefix));
    }
    return setFiles.get(prefix);
  }

  // Is this set prefix in the pack at all? Used to throw out OCR noise early.
  async function knowsPrefix(prefix) {
    return (await index()).known.has(prefix);
  }

  function expand(pack, code, entry) {
    const [nameIdx, versionIdxs] = entry;
    const versions = versionIdxs.map((i) => {
      const [setIdx, year, rarityIdxs, expansion, pids] = pack.versions[i];
      return {
        set: pack.sets[setIdx],
        year,
        rarities: rarityIdxs.map((r) => pack.rarities[r]),
        expansion,
        products: pids.map((pid) => {
          const [trend, avg30, low, avg1, avg7] = pack.products[String(pid)] || [];
          return { id: pid, trend, avg30, low, avg1, avg7 };
        }),
      };
    });
    const trends = versions.flatMap((v) => v.products.map((p) => p.trend)).filter((t) => t != null);
    return {
      code,
      name: pack.names[nameIdx],
      versions,
      min: trends.length ? Math.min(...trends) : null,
      max: trends.length ? Math.max(...trends) : null,
      exact: versions.length === 1 && versions[0].products.length === 1,
      pricesDate: pack.prices,
    };
  }

  // parsed = result of findSetCodes / parseManualCode
  async function lookup(parsed) {
    if (!(await knowsPrefix(parsed.prefix))) return null;
    const pack = await setFile(parsed.prefix);
    for (const code of [parsed.code, ...lookupCandidates(parsed)]) {
      const entry = pack.cards[code];
      if (entry) return { ...expand(pack, code, entry), matchedCode: code };
    }
    return null;
  }

  // Price summary for a card name (what the artwork recogniser returns).
  let namesPromise = null;
  async function nameInfo(name) {
    if (!namesPromise) {
      namesPromise = getJson(`${base}/names.json`);
      namesPromise.catch(() => { namesPromise = null; });
    }
    const entry = (await namesPromise)[normName(name)];
    if (!entry) return null;
    const [display, min, max, rows, bases, ban] = entry;
    return {
      name: display, min, max, bases: bases || [],
      ban: ban ? { tcg: ban[0] || null, ocg: ban[1] || null } : null,
      versions: rows.map(([set, year, lo, hi]) => ({ set, year, min: lo, max: hi })),
    };
  }

  let moversPromise = null;
  function movers() {
    if (!moversPromise) { moversPromise = getJson(`${base}/movers.json`); moversPromise.catch(() => { moversPromise = null; }); }
    return moversPromise;
  }

  // Every printing of a card, for the card page (data/ygo/cards/<first two letters>.json).
  const buckets = new Map();
  async function cardDetail(name) {
    const k = normName(name);
    const b = bucketOf(k);
    if (!buckets.has(b)) {
      const p = getJson(`${base}/cards/${b}.json`);
      buckets.set(b, p);
      p.catch(() => buckets.delete(b));
    }
    const rows = (await buckets.get(b))[k];
    if (!rows) return [];
    return rows.map(([set, year, rarities, codes, products, date, expansion], i) => ({
      key: `${i}`,
      set, year, rarities, codes, date: date || (year ? `${year}-01-01` : null), expansion: expansion ?? null,
      products: products.map(([id, trend, avg30, low, avg1, avg7, label, rarity, code, image, path]) => ({
        id, trend, avg30, low, avg1, avg7,
        label: label || '', rarity: rarity || '', image: image || '', path: path || '',
      })),
    }));
  }

  // [{prefix, name, year, count}] for pack mode
  let setsPromise = null;
  function sets() {
    if (!setsPromise) {
      setsPromise = getJson(`${base}/sets.json`).then((rows) => rows.map(([prefix, name, date, count, names]) => ({
        prefix, name, date, year: date ? Number(date.slice(0, 4)) : null, count, names,
      })));
      setsPromise.catch(() => { setsPromise = null; });
    }
    return setsPromise;
  }

  // Card names (normalised) printed in a set, for pack mode.
  async function setCardNames(prefix, setName) {
    if (prefix.startsWith('#')) { // Cardmarket-only set: names come with the set list
      const row = (await sets()).find((x) => x.prefix === prefix);
      return new Set(row?.names || []);
    }
    const pack = await setFile(prefix);
    const out = new Set();
    for (const [nameIdx, versionIdxs] of Object.values(pack.cards)) {
      if (!setName || versionIdxs.some((i) => pack.sets[pack.versions[i][0]] === setName)) out.add(normName(pack.names[nameIdx]));
    }
    return out;
  }

  // All display names, for search by name.
  async function allNames() {
    if (!namesPromise) {
      namesPromise = getJson(`${base}/names.json`);
      namesPromise.catch(() => { namesPromise = null; });
    }
    return Object.values(await namesPromise).map((e) => e[0]);
  }

  // {set name: [booster trend, box trend, booster product id]} for the pack balance
  let boostersPromise = null;
  function boosters() {
    if (!boostersPromise) {
      boostersPromise = getJson(`${base}/boosters.json`);
      boostersPromise.catch(() => { boostersPromise = null; });
    }
    return boostersPromise;
  }
  async function boosterPrice(setName) {
    const b = (await boosters().catch(() => ({})))[setName];
    return b ? { booster: b[0], box: b[1], id: b[2] } : null;
  }

  // Mastersets: [{exp, name, date, count}] and the entries of one expansion
  let expPromise = null;
  function expansions() {
    if (!expPromise) {
      expPromise = getJson(`${base}/expansions.json`).then((rows) => rows.map(([exp, name, date, count]) => ({ exp, name, date, count })));
      expPromise.catch(() => { expPromise = null; });
    }
    return expPromise;
  }
  const setEntriesCache = new Map();
  function setEntries(exp) {
    if (!setEntriesCache.has(exp)) {
      const p = getJson(`${base}/sets/${exp}.json`).then((rows) => rows.map(([name, label, rarity, id, trend, low, path, image, code]) => ({
        name, label, rarity, id, key: String(id), trend, low, path, image, code, expansion: exp,
      })));
      setEntriesCache.set(exp, p);
      p.catch(() => setEntriesCache.delete(exp));
    }
    return setEntriesCache.get(exp);
  }

  let pcPromise = null;
  function passcodes() {
    if (!pcPromise) { pcPromise = getJson(`${base}/passcodes.json`); pcPromise.catch(() => { pcPromise = null; }); }
    return pcPromise;
  }

  return { passcodes, expansions, setEntries, boosterPrice, lookup, knowsPrefix, index, nameInfo, movers, cardDetail, sets, setCardNames, allNames };
}
