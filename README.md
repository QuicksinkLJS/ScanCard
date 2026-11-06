# CardScan

Scan a trading card with your phone camera and see what it might be worth.

**Status:** proof of concept, Yu-Gi-Oh only, one card per photo.

## What it does

1. Take a photo of a card (or type its set code, e.g. `LOB-DE001`).
2. The app reads the set code with on-device text recognition ([Tesseract.js](https://github.com/naptha/tesseract.js)).
3. It detects the card language from the code (EN, DE, FR, IT, SP, PT; JP/KR are recognised but not supported yet) and looks for "1st Edition" text.
4. It looks the code up in the CardScan data pack and shows the **Cardmarket trend price in EUR** for that exact printing
   (30-day average and cheapest offer as well). If a code exists in several versions on Cardmarket
   (rarities, original vs reprint), it shows the range and every version with its year.
5. Colour: red if it can be worth over €10, amber €1–10, grey under €1.
6. "Add to session" keeps a running list, e.g. while opening packs.

Prices are reference values, not live offers. Always check language and condition on Cardmarket.

## Price data

Cardmarket's free price guide and product list have EUR prices per product but no set codes.
`tools/build_data.py` joins them with set data from [YGOJSON](https://github.com/iconmaster5326/YGOJSON)
(per-language code prefixes and release dates) and [YGOPRODeck](https://ygoprodeck.com/api-guide/) (newer sets):

1. Each set is matched to the Cardmarket expansions with the most overlapping card names.
2. Of those, the expansion listed closest to the printing's release date wins, so `LOB-G001` (2003) and `LOB-DE001` (2023 reprint) get different prices.
3. The result is one small file per set (`data/ygo/LOB.json`); the app only loads the set it scans.

The GitHub Action in `.github/workflows/deploy.yml` rebuilds the data every morning and deploys the site to GitHub Pages.
If the Cardmarket download fails it falls back to the copies in `tools/input/`.

## Run it

- **GitHub Pages:** Settings → Pages → Source **GitHub Actions**. Every push and the daily run deploy the app to `https://<user>.github.io/<repo>/`.
- **Locally:** build the data (see the workflow for the exact command), then `python -m http.server` and open http://localhost:8000.

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
| `js/api.js` | Lookup in the data pack |
| `tools/build_data.py` | Builds the data pack |

## Roadmap

1. Proof of concept (this)
2. Bulk: up to 20 cards per photo, artwork recognition, colour-coded list
3. Native Android/iOS app (Capacitor), offline price data
4. More games (Pokémon, One Piece, Weiß Schwarz), more app languages and price sources

Prices from Cardmarket's public price guide. Set data from YGOJSON and YGOPRODeck. Not affiliated with Konami or Cardmarket.
