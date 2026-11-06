# CardScan

Scan a trading card with your phone camera and see what it might be worth.

**Status:** proof of concept, Yu-Gi-Oh only, one card per photo.

## What it does

1. Take a photo of a card (or type its set code, e.g. `LOB-DE001`).
2. The app reads the set code with on-device text recognition ([Tesseract.js](https://github.com/naptha/tesseract.js)).
3. It detects the card language from the code (EN, DE, FR, IT, SP, PT; JP/KR are recognised but not supported yet) and looks for "1st Edition" text.
4. It looks the card up in the free [YGOPRODeck API](https://ygoprodeck.com/api-guide/) and shows:
   - a reference price for this exact print (TCGplayer, USD)
   - the cheapest version of the card on Cardmarket (EUR)
   - a colour: red over 10, amber 1–10, grey under 1
5. "Add to session" keeps a running list, e.g. while opening packs.

Prices are reference values, not live offers. Always check language and condition on Cardmarket.

## Run it

It's a static web app with no build step.

- **On GitHub Pages:** Settings → Pages → Source "Deploy from a branch" → `main` / `/ (root)`. The app is then at `https://<user>.github.io/<repo>/`.
- **Locally:** `python -m http.server` in this folder, then open http://localhost:8000.

On Android (Chrome): open the link, then menu → "Add to Home screen".

## Tests

```
npm test
```

Covers set-code parsing, OCR error correction, language detection and the lookup logic (with a mocked API).

## Project layout

| File | Purpose |
| --- | --- |
| `index.html`, `style.css` | The page |
| `js/app.js` | UI and scan flow |
| `js/ocr.js` | Image preparation and text recognition passes |
| `js/parse.js` | Set codes, languages, 1st Edition, value tiers |
| `js/api.js` | Card lookup with local caching |

## Roadmap

1. Proof of concept (this)
2. Bulk: up to 20 cards per photo, artwork recognition, colour-coded list
3. Native Android/iOS app (Capacitor), offline price data
4. More games (Pokémon, One Piece, Weiß Schwarz), more app languages and price sources

Card data from YGOPRODeck. Not affiliated with Konami, Cardmarket or TCGplayer.
