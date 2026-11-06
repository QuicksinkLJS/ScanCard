# So funktioniert CardScan

Diese Datei erklärt in einfachen Worten, wie die App aufgebaut ist und wie die Teile zusammenspielen.
Du musst nicht programmieren können, um sie zu verstehen.

## Das große Bild

Die App ist wie eine kleine Firma. Jede Datei hat einen Job:

| Datei | Wer das ist | Was die Datei macht |
| --- | --- | --- |
| `index.html` | Das Gebäude | Baut den Bildschirm: Knöpfe, Eingabefeld, Liste |
| `style.css` | Der Innenausstatter | Farben, Abstände, Schrift, Dunkelmodus |
| `js/app.js` | Der Chef | Entscheidet, was passiert, wenn du einen Knopf drückst, und verteilt die Arbeit |
| `js/ocr.js` | Die Lupe | Bereitet das Foto vor (Kontrast, Zoom, gerade drehen) und liest den Text |
| `js/parse.js` | Der Detektiv | Findet im gelesenen Text einen Set-Code wie `LOB-DE001`, korrigiert Lesefehler, erkennt die Sprache |
| `js/api.js` | Das Nachschlagewerk | Öffnet die passende Set-Datei (`data/ygo/LOB.json`) und holt Karte und Preise |
| `tools/build_data.py` | Die Preis-Fabrik | Verbindet Cardmarket-Preise mit Set-Codes (läuft bei GitHub, nicht auf dem Handy) |
| `tools/build_fingerprints.py` | Die Fingerabdruck-Fabrik | Berechnet für jedes Kartenbild einen „Fingerabdruck“ (läuft bei GitHub) |
| `.github/workflows/` | Die Wecker | Starten die Fabriken automatisch und veröffentlichen die App |
| `tests/` | Der Kontrolleur | Prüft vor jeder Veröffentlichung, ob Detektiv und Nachschlagewerk richtig arbeiten |

## Was beim Scannen passiert

1. Du machst ein Foto. **Der Chef** (`app.js`) gibt es an **die Lupe** (`ocr.js`).
2. Die Lupe macht das Bild kontrastreicher und liest allen Text darauf. Klappt das nicht, versucht sie es mit Zoom auf den Set-Code-Bereich und mit leicht gedrehtem Bild.
3. **Der Detektiv** (`parse.js`) sucht im Text nach etwas, das wie ein Set-Code aussieht:
   Buchstaben/Zahlen, Bindestrich, Sprachkürzel, dreistellige Nummer. Aus `LOB-DEO01` macht er `LOB-DE001` (O → 0).
   Am Kürzel erkennt er die Sprache: `DE` und `G` = Deutsch, `EN`, `E` oder nichts = Englisch, `JP` = Japanisch …
4. **Das Nachschlagewerk** (`api.js`) öffnet nur die Datei des Sets (z. B. `LOB.json`, ca. 10 KB) und sucht den Code.
5. Der Chef zeigt das Ergebnis an und färbt es: rot = kann über 10 € wert sein, gelb = 1–10 €, grau = unter 1 €.

## Woher die Preise kommen

Cardmarket stellt jeden Tag zwei Dateien kostenlos bereit:

- eine **Produktliste** (Produktnummer, Kartenname, Set-Nummer)
- einen **Preisguide** (Produktnummer → Trendpreis, 30-Tage-Schnitt, günstigstes Angebot)

Das Problem: Darin stehen **keine Set-Codes** wie `LOB-DE001`. Die Preis-Fabrik löst das so:

1. Aus einer offenen Kartendatenbank (YGOJSON, YGOPRODeck) kennt sie für jedes Set alle Codes, Kartennamen und das Erscheinungsdatum pro Sprache.
2. Sie sucht die Cardmarket-Ausgabe, in der möglichst viele derselben Kartennamen vorkommen.
3. Gibt es mehrere passende Ausgaben (Original und Neuauflage), nimmt sie die, deren Erscheinungsdatum zum Code passt.
   So bekommt `LOB-G001` (deutsches Original, 2003) einen anderen Preis als `LOB-DE001` (Neuauflage, 2023).
4. Gibt es mehrere Versionen im selben Set (verschiedene Seltenheiten), zeigt die App eine Preisspanne.

Jeden Morgen um 5:17 Uhr (UTC) wiederholt GitHub das automatisch mit frischen Preisen.

**Grenzen:** Die kostenlosen Cardmarket-Daten unterscheiden nicht nach Sprache und Zustand.
Japanische und koreanische Drucke gibt es auf Cardmarket meist nicht als eigene Produkte.

## Wie die Artwork-Erkennung funktionieren wird

Der Set-Code ist winzig und auf glänzenden Karten oft unleserlich. Deshalb kommt eine zweite Erkennung dazu:

1. Die **Fingerabdruck-Fabrik** lädt einmalig alle ca. 14.700 Kartenbilder und lässt ein Bildmodell (DINOv2) für jedes eine Liste
   aus 768 Zahlen berechnen (inzwischen gebaut, siehe Branch `assets`). Ähnliche Bilder bekommen ähnliche Zahlen, egal ob mit Glanz, Hülle oder etwas schief.
2. In der App schneidet der Chef das Artwork aus deinem Foto aus und lässt dasselbe Modell die Zahlen dafür berechnen.
3. Der ähnlichste Fingerabdruck ist die Karte. Das funktioniert in allen Sprachen, weil das Bild überall gleich ist.

## Was du gefahrlos ändern kannst

- **Farbgrenzen** (ab wann rot/gelb): in `js/parse.js`, Funktion `valueTier`. Die Zahlen `10` und `1` sind Euro.
- **Texte auf dem Bildschirm:** in `index.html` und in `js/app.js` (alles in Anführungszeichen).
- **Farben:** ganz oben in `style.css` (`--high` = rot, `--mid` = gelb …).

Nach einer Änderung auf GitHub läuft automatisch der Kontrolleur. Ist er grün, ist die neue Version 1–2 Minuten später online.
