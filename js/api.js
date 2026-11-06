// Card + price lookup from the CardScan data pack (data/ygo/<SET>.json).
// The pack joins Cardmarket's free price guide (EUR) with set codes; see tools/build_data.py.

import { lookupCandidates, normName } from './parse.js';

export function createApi({ fetchFn = globalThis.fetch?.bind(globalThis), base = 'data/ygo' } = {}) {
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
          const [trend, avg30, low] = pack.products[String(pid)] || [];
          return { id: pid, trend, avg30, low };
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
    const [display, min, max, rows] = entry;
    return { name: display, min, max, versions: rows.map(([set, year, lo, hi]) => ({ set, year, min: lo, max: hi })) };
  }

  return { lookup, knowsPrefix, index, nameInfo };
}
