# So funktioniert CardScan

Diese Datei erklärt in einfachen Worten, wie die App aufgebaut ist und wie die Teile zusammenspielen.
Du musst nicht programmieren können, um sie zu verstehen.

## Das große Bild

Die App ist wie eine kleine Firma. Jede Datei hat einen Job:

| Datei | Wer das ist | Was die Datei macht |
| --- | --- | --- |
| `index.html` | Das Gebäude | Baut die vier Bildschirme (Scan, Collection, Market, More), die Kartenseite und die Kamera |
| `style.css` | Der Innenausstatter | Farben, Abstände, Schrift, Dunkelmodus |
| `js/app.js` | Der Chef | Reiter, Knöpfe, Sammlung, Markt, Export – verteilt die Arbeit |
| `js/scan.js` | Der Scanner | Foto → Karten finden → erkennen → Set-Codes lesen → Liste, teuerste zuerst, Markierungen auf dem Foto |
| `js/detect.js` | Der Kartenfinder | Findet alle Karten im Foto (eigenes Modell, `models/ygo/detector.onnx`) und schneidet sie gerade aus |
| `js/recognize.js` | Das Gedächtnis | Erkennt die Karte am Artwork (Fingerabdrücke, `models/ygo/`) |
| `js/ocr.js` | Die Lupe | Liest den Set-Code im kleinen Bereich unter dem Artwork |
| `js/codematch.js` | Der Abgleicher | Vergleicht das Gelesene mit den Codes, die es für diese Karte wirklich gibt (Lesefehler erlaubt) |
| `js/cardpage.js` | Die Kartenseite | Versionen, Preise gestern/7/30 Tage/Trend, Turnierstatus, Korrektur |
| `js/prices.js` | Der Buchhalter | Welche Version ist wahrscheinlich, welcher Preis gilt, welche Werte sind Ausreißer |
| `js/store.js` | Das Lager | Sammlung (localStorage) und Trainingsbeispiele (IndexedDB) auf dem Handy |
| `js/parse.js` | Der Detektiv | Set-Code-Muster, Sprachen, Namen vereinheitlichen |
| `js/api.js` | Das Nachschlagewerk | Lädt die Daten-Dateien unter `data/ygo/` |
| `tools/build_data.py` | Die Preis-Fabrik | Verbindet Cardmarket-Preise mit Set-Codes (läuft täglich bei GitHub) |
| `.github/workflows/` | Der Wecker | Baut die Daten jeden Morgen neu und veröffentlicht die App |
| `tests/` | Der Kontrolleur | Prüft vor jeder Veröffentlichung Detektiv, Abgleicher und Buchhalter |

## Was beim Scannen passiert

1. Du legst mehrere Karten nebeneinander und machst ein Foto (volle Kamera-Auflösung).
2. **Der Kartenfinder** sucht alle Karten im Foto, auch schräg liegende, und schneidet jede gerade aus.
   Ist das Modell nicht da oder findet nichts, wird das Foto als eine Karte gelesen.
3. **Das Gedächtnis** erkennt jede Karte am Artwork – egal welche Sprache. Es merkt sich auch, ob die Karte auf dem Kopf lag.
4. Die Liste erscheint sofort mit Preisspanne (alle Versionen dieser Karte), teuerste zuerst, und farbigen Nummern auf dem Foto.
5. Danach liest **die Lupe** Karte für Karte den Set-Code. **Der Abgleicher** vergleicht ihn mit den Codes, die es für diese Karte gibt
   (`SUDA-DE014`, `SUDA-JP014` … – die Sprache wird ignoriert, ein falsch gelesenes Zeichen ist erlaubt). Passt er, wird der Preis genauer.
6. Auf der Kartenseite wählst du bei Bedarf die genaue Version; die wahrscheinlichste steht oben.

Im **Pack-Modus** wählst du das Set (oder lässt es an den ersten Karten erkennen). Dann kommen nur Karten aus diesem Set in Frage.

Alles, was du in die Sammlung übernimmst oder korrigierst, wird als **Trainingsbeispiel** (Bild + richtige Antwort) auf dem Handy gespeichert.
Unter „More“ kannst du es exportieren, um das Modell später damit nachzutrainieren. Es zählt immer nur deine letzte Auswahl.

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

## Wie die Artwork-Erkennung funktioniert

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
