// Card lookup against the free YGOPRODeck API (https://ygoprodeck.com/api-guide/).
// Responses are cached locally so repeat scans don't hit the API again.

import { lookupCandidates } from './parse.js';

const BASE = 'https://db.ygoprodeck.com/api/v7';
const CACHE_KEY = 'cardscan-cache-v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function makeCache(storage) {
  let data = {};
  try { data = JSON.parse(storage?.getItem(CACHE_KEY) || '{}'); } catch { data = {}; }
  return {
    get(url) {
      const hit = data[url];
      return hit && Date.now() - hit.t < CACHE_TTL_MS ? hit.v : undefined;
    },
    set(url, v) {
      data[url] = { t: Date.now(), v };
      try { storage?.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* storage full or blocked */ }
    },
  };
}

export function createApi({ fetchFn = globalThis.fetch?.bind(globalThis), storage = globalThis.localStorage } = {}) {
  const cache = makeCache(storage);

  async function getJson(url) {
    const cached = cache.get(url);
    if (cached !== undefined) return cached;
    const res = await fetchFn(url);
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    const value = res.ok && body && !body.error ? body : null; // null = not found
    cache.set(url, value);
    return value;
  }

  // parsed = result of findSetCodes / parseManualCode
  async function lookup(parsed) {
    for (const code of lookupCandidates(parsed)) {
      const set = await getJson(`${BASE}/cardsetsinfo.php?setcode=${encodeURIComponent(code)}`);
      if (!set || !set.id) continue;

      const info = await getJson(`${BASE}/cardinfo.php?id=${set.id}`);
      const card = info?.data?.[0];
      if (!card) continue;

      const prints = (card.card_sets || []).filter((s) => s.set_code === code);
      const cmPrice = parseFloat(card.card_prices?.[0]?.cardmarket_price);

      let localName = null;
      if (parsed.language?.api) {
        try {
          const loc = await getJson(`${BASE}/cardinfo.php?id=${set.id}&language=${parsed.language.api}`);
          localName = loc?.data?.[0]?.name || null;
        } catch { /* translated name is optional */ }
      }

      return {
        id: card.id,
        name: card.name,
        localName,
        type: card.type,
        setName: set.set_name,
        dbCode: code,
        prints: prints.length
          ? prints.map((p) => ({ rarity: p.set_rarity, rarityCode: p.set_rarity_code, usd: parseFloat(p.set_price) }))
          : [{ rarity: set.set_rarity, rarityCode: '', usd: parseFloat(set.set_price) }],
        cardmarketFromEur: Number.isFinite(cmPrice) ? cmPrice : null,
        ygoprodeckUrl: card.ygoprodeck_url,
      };
    }
    return null;
  }

  return { lookup };
}
