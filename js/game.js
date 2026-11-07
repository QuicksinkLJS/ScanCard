// Game packs: what differs between card games lives here, so another game (Pokémon, Magic) is a new entry,
// not a rewrite. Only Yu-Gi-Oh! exists for now, and it keeps every storage key and path it had before.
//
// Still per game but not moved here yet (move them when the second game comes):
//   rarity → foil look: holo.js holoKind/LOOK · rarity words for the version search: prices.js RARITY_WORDS
//   OCG / 1st Edition rules: copy.js · deck files and rules: deck.js · set code reading: codematch.js
//   tilt scan rarity guess: tilt.js guessRarity · data pack builder: tools/build_data.py
//
// Note: the beta deploy rewrites the literals 'data/ygo' and 'models/ygo' in js/*.js to '../…' – keep them
// written exactly like that (single quotes) in this file.

export const GAMES = {
  ygo: {
    id: 'ygo',
    name: 'Yu-Gi-Oh!',
    data: 'data/ygo',          // data pack (prices, versions, names, texts)
    models: 'models/ygo',      // card finder + recogniser + fingerprints
    cardMm: { w: 59, h: 86 },  // card size in millimetres
    cardmarket: 'https://www.cardmarket.com/en/YuGiOh/Products',
    // artwork window per card layout, as share of the card (also the foil areas in style.css)
    artBox: {
      normal: { x1: 0.116, x2: 0.884, y1: 0.179, y2: 0.708 },
      pendulum: { x1: 0.064, x2: 0.936, y1: 0.176, y2: 0.63 },
      manga: { x1: 0.076, x2: 0.926, y1: 0.174, y2: 0.76 },
    },
    // storage keys stay as they were (no prefix) so existing collections keep working
    keyPrefix: '',
  },
};

export const DEFAULT_GAME = 'ygo';
const GAME_KEY = 'cardscan-game';

// The game the app runs as: ?game=… or the stored choice, else Yu-Gi-Oh!
export function pickGame(search = globalThis.location?.search || '', stored = readStored()) {
  const q = /[?&]game=([a-z0-9]+)/.exec(search)?.[1];
  if (q && GAMES[q]) return GAMES[q];
  if (stored && GAMES[stored]) return GAMES[stored];
  return GAMES[DEFAULT_GAME];
}
function readStored() { try { return globalThis.localStorage?.getItem(GAME_KEY) || ''; } catch { return ''; } }

export const GAME = pickGame();

// Storage key of this game: 'cardscan-collection-v1' for Yu-Gi-Oh!, 'cardscan-pkm-collection-v1' for a game
// with keyPrefix 'pkm-'. App-wide keys (language, game choice, "me") don't go through this.
export function gameKey(key, game = GAME) {
  return game.keyPrefix ? key.replace(/^cardscan-/, `cardscan-${game.keyPrefix}`) : key;
}

// card size in pixels for cut-outs (10 px per mm) and its width : height
export const cardPx = (game = GAME, perMm = 10) => ({ w: game.cardMm.w * perMm, h: game.cardMm.h * perMm });
export const cardRatio = (game = GAME) => game.cardMm.w / game.cardMm.h;

// CSS: the card shape everywhere (aspect-ratio: var(--card-ar))
export function applyGameStyle(game = GAME, root = globalThis.document?.documentElement) {
  root?.style.setProperty('--card-ar', `${game.cardMm.w} / ${game.cardMm.h}`);
  root?.setAttribute('data-game', game.id);
}
