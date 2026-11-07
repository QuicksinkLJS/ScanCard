// English / German. The app is written in English; in German mode every text shown is translated
// on the fly (exact phrases, then patterns for texts with numbers). Switching reloads the app.

const KEY = 'cardscan-lang';
export const lang = (() => { try { return localStorage.getItem(KEY) || 'en'; } catch { return 'en'; } })();
export function setLang(l) { try { localStorage.setItem(KEY, l); } catch { /* ignore */ } location.reload(); }

const DE = {
  // tabs, headers
  'Scan': 'Scannen', 'Collection': 'Sammlung', 'Market': 'Markt', 'More': 'Mehr', 'Cards': 'Karten', 'Mastersets': 'Mastersets',
  'Decks': 'Decks', 'Wishlist': 'Wunschliste', 'Watchlist': 'Merkliste', 'Yu-Gi-Oh · beta': 'Yu-Gi-Oh · Beta',
  // scan screen
  'Scan cards': 'Karten scannen', 'Choose photo': 'Foto wählen', 'Several cards': 'Mehrere Karten', 'One card': 'Eine Karte',
  'Pack mode: off': 'Pack-Modus: aus', 'Pack mode: detect': 'Pack-Modus: erkennen', 'Scan mode': 'Scan-Modus',
  'Put 2–9 cards on a table, side by side, and take one photo. Works with any language.': 'Lege 2–9 Karten nebeneinander auf den Tisch und mach ein Foto. Klappt mit jeder Sprache.',
  'Hold one card inside the frame. Works with any language.': 'Halte eine Karte in den Rahmen. Klappt mit jeder Sprache.',
  'Add all': 'Alle hinzufügen', 'Scan more cards': 'Weitere Karten scannen', 'Share my pulls': 'Meine Pulls teilen',
  'Sort into piles': 'In Stapel sortieren', 'Hide piles': 'Stapel ausblenden', 'Cancel': 'Abbrechen', 'Take photo': 'Foto aufnehmen',
  'Looking for cards in the photo…': 'Suche Karten im Foto…', 'Recognising the card…': 'Erkenne die Karte…',
  'Taking a closer look at the unsure cards…': 'Schaue mir die unsicheren Karten genauer an…',
  'No separate cards found – read the photo as one card.': 'Keine einzelnen Karten gefunden – Foto als eine Karte gelesen.',
  'reading set code…': 'lese Set-Code…', 'set code not readable': 'Set-Code nicht lesbar', 'check': 'prüfen',
  'tap a card for details': 'Karte antippen für Details', 'added ✓': 'hinzugefügt ✓', 'Picture saved': 'Bild gespeichert',
  'Lay the cards flat, side by side, not overlapping': 'Karten flach nebeneinander legen, nicht überlappend',
  'Fit the card into the frame': 'Karte in den Rahmen bringen',
  'The camera could not be opened. Allow camera access, or use "Choose photo".': 'Die Kamera ließ sich nicht öffnen. Erlaube den Kamerazugriff oder nutze „Foto wählen“.',
  'Downloading the card recogniser (first time only)…': 'Lade die Kartenerkennung (nur beim ersten Mal)…',
  'Downloading card fingerprints (first time only)…': 'Lade Karten-Fingerabdrücke (nur beim ersten Mal)…',
  'Downloading the card finder (first time only)…': 'Lade den Kartenfinder (nur beim ersten Mal)…',
  'Starting the recogniser…': 'Starte die Erkennung…',
  'Bulk': 'Bulk', 'Keep': 'Behalten', 'Sell': 'Verkaufen', 'Check version': 'Version prüfen', 'price depends on the version': 'Preis hängt von der Version ab',
  // pack mode
  'Pack mode': 'Pack-Modus', 'Opening packs? Pick the set and the scanner only considers cards from it – faster and more accurate, and the price is the one of that set.': 'Packs öffnen? Wähle das Set, dann berücksichtigt der Scanner nur dessen Karten – schneller, genauer, und der Preis ist der aus diesem Set.',
  'Detect the set from the first cards': 'Set aus den ersten Karten erkennen', 'Turn pack mode off': 'Pack-Modus ausschalten',
  'Search a set, e.g. Phantom Nightmare or PHNI': 'Set suchen, z. B. Phantom Nightmare oder PHNI',
  'The set is taken from the first cards you scan': 'Das Set wird aus den ersten gescannten Karten bestimmt',
  'Packs in this photo': 'Packs in diesem Foto', 'One pack less': 'Ein Pack weniger', 'One pack more': 'Ein Pack mehr',
  // card page
  '‹ Back': '‹ Zurück', 'Loading prices…': 'Lade Preise…', 'Loading…': 'Lade…', 'Which version do you have?': 'Welche Version hast du?',
  'Wrong card?': 'Falsche Karte?', 'Type the right name': 'Richtigen Namen eingeben', 'Open on Cardmarket': 'Auf Cardmarket öffnen',
  'This version on Cardmarket': 'Diese Version auf Cardmarket', 'Find in this set on Cardmarket': 'In diesem Set auf Cardmarket suchen',
  'Add to collection': 'Zur Sammlung', 'Added ✓': 'Hinzugefügt ✓', 'Saved ✓ – save again': 'Gespeichert ✓ – erneut speichern',
  'Remove from collection': 'Aus der Sammlung entfernen', 'Not a card – remove from this scan': 'Keine Karte – aus diesem Scan entfernen',
  'Pick your version below for the exact price.': 'Wähle unten deine Version für den genauen Preis.',
  'No Cardmarket price found. This is often a card only printed in Japan or Korea.': 'Kein Cardmarket-Preis gefunden. Oft ist das eine Karte, die es nur in Japan oder Korea gibt.',
  'Set code not readable on the photo – choose the version yourself.': 'Set-Code auf dem Foto nicht lesbar – wähle die Version selbst.',
  'Japanese print: the OCG versions on Cardmarket are listed first.': 'Japanischer Druck: die OCG-Versionen auf Cardmarket stehen oben.',
  'Recognised from the artwork': 'Am Artwork erkannt', 'Not sure': 'Unsicher', '– check the name, or pick the right card below': '– prüfe den Namen oder wähle unten die richtige Karte',
  'Yesterday': 'Gestern', '7 days': '7 Tage', '30 days': '30 Tage', 'Trend': 'Trend', 'LIKELY': 'WAHRSCHEINLICH',
  '⚠ marks a value far from the others – usually one unusual sale.': '⚠ markiert einen Wert weit weg von den anderen – meist ein einzelner Ausreißer-Verkauf.',
  'Rarity unknown': 'Seltenheit unbekannt', 'Your photo': 'Dein Foto', '✨ View your card': '✨ Deine Karte ansehen',
  '☆ Watch price': '☆ Preis merken', '★ Watching': '★ Gemerkt', '♡ Wishlist': '♡ Wunschliste', 'Save': 'Speichern', 'Remove': 'Entfernen',
  'Target price €': 'Zielpreis €', 'Enter a target price': 'Gib einen Zielpreis ein', 'No card with that name.': 'Keine Karte mit diesem Namen.',
  'Added to your watchlist (Market tab)': 'Zur Merkliste hinzugefügt (Markt-Tab)', 'Removed from your watchlist': 'Von der Merkliste entfernt',
  'Removed from your wishlist': 'Von der Wunschliste entfernt', 'Added to your collection': 'Zur Sammlung hinzugefügt', 'Removed': 'Entfernt',
  'no price found': 'kein Preis gefunden', 'any version': 'beliebige Version', 'Tilt your phone or move your finger': 'Kipp dein Handy oder bewege den Finger',
  'Close': 'Schließen',
  // collection
  'Total value on Cardmarket': 'Gesamtwert auf Cardmarket', 'Most valuable': 'Die wertvollsten', 'Value per set': 'Wert pro Set',
  'Most valuable first': 'Wertvollste zuerst', 'Newest first': 'Neueste zuerst', '✨ Showcase – your best cards': '✨ Showcase – deine besten Karten',
  'Scanned cards you add show up here. Tap a card to check or correct it.': 'Gescannte Karten, die du hinzufügst, erscheinen hier. Tippe eine Karte an, um sie zu prüfen oder zu korrigieren.',
  'Version not chosen yet': 'Version noch nicht gewählt', 'Unchanged since added': 'Unverändert seit Hinzufügen', 'since added': 'seit Hinzufügen',
  // mastersets
  'Track a set': 'Set verfolgen', 'Set name, e.g. Original Artwork Collection': 'Set-Name, z. B. Original Artwork Collection',
  'Track a set and see which versions you still miss – every rarity and artwork counts once, any language.': 'Verfolge ein Set und sieh, welche Versionen dir fehlen – jede Seltenheit und jedes Artwork zählt einmal, Sprache egal.',
  'Missing': 'Fehlt', 'Have': 'Habe', 'All': 'Alle', 'All rarities': 'Alle Seltenheiten', 'Nothing here.': 'Hier ist nichts.',
  'Tap ○ to tick a card you have (any language counts). Cards in your collection with this exact version are ticked automatically.': 'Tippe ○, um eine Karte abzuhaken (jede Sprache zählt). Karten in deiner Sammlung mit genau dieser Version werden automatisch abgehakt.',
  'Stop tracking': 'Nicht mehr verfolgen', 'Set removed': 'Set entfernt', 'No set with that name.': 'Kein Set mit diesem Namen.', 'Complete! 🎉': 'Komplett! 🎉',
  'I have this': 'Habe ich',
  // decks
  'Import a deck': 'Deck importieren', 'Import': 'Importieren', 'Open .ydk file': '.ydk-Datei öffnen',
  'Import a deck and see which cards you already have and what the rest costs.': 'Importiere ein Deck und sieh, welche Karten du schon hast und was der Rest kostet.',
  "Paste a ydke:// link, a .ydk file's text or a list like “3x Ash Blossom & Joyous Spring”": 'Füge einen ydke://-Link, den Text einer .ydk-Datei oder eine Liste wie „3x Ash Blossom & Joyous Spring“ ein',
  'What to buy': 'Was kaufen', 'Cheapest': 'Am günstigsten', 'Max rarity': 'Höchste Seltenheit', 'Language': 'Sprache',
  'Condition at least': 'Zustand mindestens', '1st Edition only': 'Nur 1st Edition', 'Main deck': 'Main Deck', 'Extra deck': 'Extra Deck', 'Side deck': 'Side Deck',
  'cheapest version': 'günstigste Version', 'Copy as Cardmarket wants list': 'Als Cardmarket-Wants-Liste kopieren', 'Delete deck': 'Deck löschen',
  "You count as having a card when your collection has it in any version or language. Prices are Cardmarket trend prices of the version – they don't depend on language or condition, so take them as a guide.": 'Eine Karte zählt als vorhanden, wenn deine Sammlung sie in irgendeiner Version oder Sprache hat. Die Preise sind Cardmarket-Trendpreise der Version – sie hängen nicht von Sprache oder Zustand ab, also nur als Richtwert.',
  'Nothing missing': 'Nichts fehlt', 'Wants list copied': 'Wants-Liste kopiert', 'No cards found in that deck.': 'Keine Karten in diesem Deck gefunden.',
  'Card list not available – try again online.': 'Kartenliste nicht verfügbar – versuch es online nochmal.',
  'Any language': 'Jede Sprache', 'English': 'Englisch', 'German': 'Deutsch', 'French': 'Französisch', 'Italian': 'Italienisch', 'Spanish': 'Spanisch',
  'Portuguese': 'Portugiesisch', 'Japanese (OCG)': 'Japanisch (OCG)', 'Korean': 'Koreanisch', 'Mint': 'Mint', 'Near Mint': 'Near Mint', 'Excellent': 'Excellent',
  'Good': 'Good', 'Light Played': 'Light Played', 'Played': 'Played', 'Poor': 'Poor',
  'You have every card of this deck 🎉': 'Du hast alle Karten dieses Decks 🎉',
  // wishlist / watch
  'Tap “☆ Watch price” on any card to follow its price here.': 'Tippe bei einer Karte auf „☆ Preis merken“, um ihren Preis hier zu verfolgen.',
  'Tap “♡ Wishlist” on a card and set the price you want to pay. Cards at or below it are marked here.': 'Tippe bei einer Karte auf „♡ Wunschliste“ und gib deinen Wunschpreis ein. Karten zu diesem Preis oder darunter werden hier markiert.',
  'At your price!': 'Zu deinem Preis!',
  // market
  'Tops & flops': 'Tops & Flops', 'Short term': 'Kurzfristig', 'Stable trend': 'Stabiler Trend', 'Tops': 'Tops', 'Flops': 'Flops',
  'Market data not available.': 'Marktdaten nicht verfügbar.',
  // more
  'Find a card': 'Karte suchen', 'Card name, e.g. Dark Magician': 'Kartenname, z. B. Dark Magician', 'Look up a set code': 'Set-Code nachschlagen',
  'e.g. LOB-EN001': 'z. B. LOB-EN001', 'Look up': 'Suchen', 'Get the app': 'App holen', 'Install CardScan on this phone': 'CardScan auf diesem Handy installieren',
  'Download Android app (APK)': 'Android-App herunterladen (APK)', 'Or in Chrome: menu ⋮ → “Install app”. Works offline after the first start.': 'Oder in Chrome: Menü ⋮ → „App installieren“. Läuft nach dem ersten Start auch offline.',
  'Help the scanner learn': 'Hilf dem Scanner beim Lernen', 'Export training data': 'Trainingsdaten exportieren',
  'Every card you add or correct is kept on this phone as a training example (picture + right answer). Nothing is uploaded.': 'Jede Karte, die du hinzufügst oder korrigierst, bleibt als Trainingsbeispiel (Bild + richtige Antwort) auf diesem Handy. Nichts wird hochgeladen.',
  'Data': 'Daten', 'Clear collection': 'Sammlung leeren', 'Price data not available.': 'Preisdaten nicht verfügbar.',
  'Prices: Cardmarket price guide (EUR), updated daily. Card data:': 'Preise: Cardmarket-Preisguide (EUR), täglich aktualisiert. Kartendaten:', 'and': 'und',
  'No training examples yet. Add scanned cards to your collection first.': 'Noch keine Trainingsbeispiele. Füge zuerst gescannte Karten zur Sammlung hinzu.',
  'Remove all cards from your collection? Training examples stay.': 'Alle Karten aus der Sammlung entfernen? Trainingsbeispiele bleiben.',
  'New version – tap to update': 'Neue Version – zum Aktualisieren tippen', 'App language': 'App-Sprache',
  'My pulls': 'Meine Pulls',
  '. Prices are reference values, not live offers. Not affiliated with Konami or Cardmarket.': '. Preise sind Richtwerte, keine Live-Angebote. Nicht verbunden mit Konami oder Cardmarket.', 'CardScan · Cardmarket trend prices': 'CardScan · Cardmarket-Trendpreise',
};

// 7 Nov: undo, masterset choice, holo, rarity, reveal, beta features
Object.assign(DE, {
  '♥ On your wishlist': '♥ Auf der Wunschliste', 'Target price': 'Wunschpreis', 'Target price (any version)': 'Wunschpreis (jede Version)', 'No target': 'Kein Wunschpreis', 'No target price': 'Kein Wunschpreis',
  'Watching the price (Market › Watchlist) – set a target price below if you like': 'Preis gemerkt (Markt › Merkliste) – unten kannst du einen Wunschpreis setzen',
  'On your wishlist (Collection › Wishlist)': 'Auf deiner Wunschliste (Sammlung › Wunschliste)', 'Removed from your wishlist': 'Von der Wunschliste entfernt', 'Removed from your watchlist': 'Von der Merkliste entfernt',
  'Tap “♡ Wishlist” on a card you want. When you scan it later, it is marked. For a target price, use “☆ Watch price”.': 'Tippe bei einer Karte, die du haben willst, auf „♡ Wunschliste“. Scannst du sie später, wird sie markiert. Für einen Wunschpreis nutze „☆ Preis merken“.',
  'Tap “☆ Watch price” on any card to follow its price here – with a target price if you like; cards at or below it are marked.': 'Tippe bei einer Karte auf „☆ Preis merken“, um ihren Preis hier zu verfolgen – auf Wunsch mit Wunschpreis; Karten darunter werden markiert.',
  'Your copy': 'Dein Exemplar', 'Looking for': 'Gesucht', 'condition, language, 1st Edition': 'Zustand, Sprache, 1st Edition', 'any copy': 'jedes Exemplar',
  'Condition': 'Zustand', 'Condition at least': 'Zustand mindestens', 'Language': 'Sprache', 'Edition': 'Edition', 'Not set': 'Nicht gesetzt', 'Any': 'Egal', 'Any language': 'Jede Sprache',
  '1st Edition': '1st Edition', 'Unlimited': 'Unlimited', ' 1st Edition only': ' Nur 1st Edition', '1st Edition only': 'Nur 1st Edition',
  'Prices are per version – condition and language don\'t change them.': 'Preise gelten pro Version – Zustand und Sprache ändern sie nicht.',
  'OCG prints (Japanese, Korean, Asian English) have no 1st Edition.': 'OCG-Drucke (Japanisch, Koreanisch, Asian English) haben keine 1st Edition.',
  'Japanese (OCG)': 'Japanisch (OCG)', 'Korean (OCG)': 'Koreanisch (OCG)', 'Asian English (OCG)': 'Asian English (OCG)',
  'Singles': 'Einzelkarten', '♡ Missing cards to the wishlist': '♡ Fehlende Karten auf die Wunschliste', 'All missing cards are already on your wishlist': 'Alle fehlenden Karten sind schon auf deiner Wunschliste',
  '✓ in your collection': '✓ in deiner Sammlung', 'complete ✓': 'komplett ✓',
  'Set code, set or rarity, e.g. MP19 or QCSR': 'Set-Code, Set oder Seltenheit, z. B. MP19 oder QCSR',
  'read from the name': 'per Name erkannt', 'read from the text': 'per Kartentext erkannt',
  'Sort by': 'Sortieren nach', 'Set number': 'Set-Nummer', 'Value (high → low)': 'Wert (hoch → niedrig)', 'Value (low → high)': 'Wert (niedrig → hoch)',
  'Name (A–Z)': 'Name (A–Z)', 'Rarity (highest first)': 'Seltenheit (höchste zuerst)', 'Missing first': 'Fehlende zuerst',
  'Friends': 'Freunde', 'My QR code': 'Mein QR-Code', "Scan a friend's code": 'Code eines Freundes scannen', 'Your name for friends': 'Dein Name für Freunde',
  'Send as link instead': 'Stattdessen als Link schicken', 'Making your code…': 'Code wird erstellt…', 'one code': 'ein Code', 'Link copied': 'Link kopiert',
  "Show your QR code to a friend, or scan theirs – then you can look through each other's collections, binders and wishlists and ask for trades.": 'Zeig einem Freund deinen QR-Code oder scanne seinen – dann könnt ihr gegenseitig Sammlungen, Binder und Wunschlisten durchschauen und Tausch anfragen.',
  "Your friend opens CardScan › Collection › Friends › “Scan a friend's code”. They see everything: cards, binders, wishlist and decks – as of now.": 'Dein Freund öffnet CardScan › Sammlung › Freunde › „Code eines Freundes scannen“. Er sieht alles: Karten, Binder, Wunschliste und Decks – Stand jetzt.',
  "Hold the camera on your friend's code.": 'Halte die Kamera auf den Code deines Freundes.', 'That is not a CardScan code.': 'Das ist kein CardScan-Code.', 'Got it': 'Erkannt',
  'The camera could not be opened. Allow camera access, or ask your friend for the link.': 'Die Kamera ließ sich nicht öffnen. Erlaube den Kamerazugriff oder lass dir den Link schicken.',
  'That is your own code': 'Das ist dein eigener Code', 'That code could not be read – try again': 'Der Code konnte nicht gelesen werden – versuch es nochmal',
  'Not enough space on this phone for this collection': 'Nicht genug Speicher auf dem Handy für diese Sammlung', 'Rename': 'Umbenennen', 'Remove friend': 'Freund entfernen',
  'Ask for trade': 'Tausch anfragen', 'Singles': 'Einzelkarten', 'No cards yet.': 'Noch keine Karten.', 'Nothing on the wishlist.': 'Nichts auf der Wunschliste.', 'No decks.': 'Keine Decks.',
  'No mastersets tracked.': 'Keine Mastersets.', 'you have it': 'hast du', 'prices of today': 'Preise von heute',
  'Nothing from your wishlist – add cards you want with ♡.': 'Nichts von deiner Wunschliste – markiere Karten, die du willst, mit ♡.', 'None of your cards are on their wishlist.': 'Keine deiner Karten steht auf seiner Wunschliste.',
  'Big moment': 'Big Moment', 'Value · approx. last 30 days': 'Wert · ca. letzte 30 Tage', '30-day avg.': 'Ø 30 Tage', '7-day avg.': 'Ø 7 Tage',
  'yesterday': 'gestern', 'today': 'heute', '🂠 Draw test hand': '🂠 Testhand ziehen', '🂠 New test hand': '🂠 Neue Testhand', 'Draw again': 'Neu ziehen',
  '+1 card': '+1 Karte', 'Test hand': 'Testhand', 'No main deck': 'Kein Main Deck', 'Deck value (max rarity)': 'Deckwert (höchste Seltenheit)',
  'Deck value (cheapest versions)': 'Deckwert (günstigste Versionen)', 'On': 'An', 'Off': 'Aus',
  'A card worth €50 or more flies in full screen when you scan it.': 'Eine Karte ab €50 fliegt beim Scannen groß ins Bild.',
  'Undo': 'Rückgängig', 'Undone': 'Rückgängig gemacht', 'Ticked': 'Abgehakt', 'Tick removed': 'Haken entfernt',
  'Remove from collection': 'Aus der Sammlung entfernen', "Don't count for this set": 'Für dieses Set nicht zählen',
  'This tick comes from a card in your collection.': 'Dieser Haken kommt von einer Karte in deiner Sammlung.',
  'Removed from your collection': 'Aus der Sammlung entfernt', 'This card': 'Diese Karte',
  'choose rarity': 'Seltenheit wählen', 'On your wishlist': 'Auf der Wunschliste', 'Wishlist hit': 'Wunschliste: Treffer', 'Back online': 'Wieder online',
  "You're offline – scanning still works, prices are from your last visit.": 'Du bist offline – Scannen klappt trotzdem, die Preise sind vom letzten Besuch.', 'List': 'Liste', 'Binder': 'Binder', 'Share progress': 'Fortschritt teilen',
  'Swipe through the pages. Tap a card for details, hold it to leave it out of this set.': 'Wische durch die Seiten. Tippe eine Karte für Details an, halte sie gedrückt, um sie aus diesem Set herauszunehmen.',
  'Tap ○ to tick a card you have (any language counts). Cards in your collection with this exact version are ticked automatically. Hold a card to leave it out of this set.': 'Tippe ○, um eine Karte abzuhaken (jede Sprache zählt). Karten aus deiner Sammlung mit genau dieser Version werden automatisch abgehakt. Halte eine Karte gedrückt, um sie aus diesem Set herauszunehmen.',
  'Masterset': 'Masterset', 'CardScan · Masterset tracker': 'CardScan · Masterset-Tracker', 'left out': 'herausgenommen', '⚠ unusual': '⚠ ungewöhnlich', '⚠ unusual · Cardmarket ↗': '⚠ ungewöhnlich · Cardmarket ↗', 'Set code or set name, e.g. MP19': 'Set-Code oder Set-Name, z. B. MP19', 'No version matches.': 'Keine Version passt.', 'BETA channel': 'BETA-Kanal',
  'Best:': 'Beste:', 'Open one by one': 'Einzeln aufdecken', 'Skip': 'Überspringen', 'Tap the card': 'Karte antippen',
  'The last one – your best card': 'Die letzte – deine beste Karte', 'Tap for the next card': 'Tippen für die nächste Karte',
  'Tap to finish': 'Tippen zum Abschließen', 'Tap to close': 'Tippen zum Schließen',
  'Did you mean…?': 'Meintest du …?', 'current guess': 'aktueller Tipp',
  'Tilt your phone · tap for full screen': 'Handy kippen · tippen für Vollbild',
  'Official picture · tap for full screen': 'Offizielles Bild · tippen für Vollbild',
  'Your photo – pick your version below for the official picture': 'Dein Foto – wähle unten deine Version für das offizielle Bild',
});

// [pattern, German] for texts with numbers or names in them
const P = [
  [/^(\d+) cards? · (one code|(\d+) codes in turn – let your friend hold the camera on it)$/, (m, n, x, k) => `${n} Karten · ${k ? `${k} Codes nacheinander – dein Freund hält die Kamera drauf` : 'ein Code'}`],
  [/^Code (\d+) of (\d+)$/, 'Code $1 von $2'],
  [/^Got (\d+) of (\d+) codes – keep holding$/, '$1 von $2 Codes – weiter draufhalten'],
  [/^(.+)'s collection updated$/, 'Sammlung von $1 aktualisiert'],
  [/^(.+) added to your friends$/, '$1 ist jetzt in deinen Freunden'],
  [/^(.+) removed$/, '$1 entfernt'],
  [/^Value of (.+)'s collection$/, 'Wert der Sammlung von $1'],
  [/^Shared on (.+) · prices of today$/, 'Geteilt am $1 · Preise von heute'],
  [/^To see newer cards, ask (.+) to show you their code again\.$/, 'Für neuere Karten lass dir von $1 den Code nochmal zeigen.'],
  [/^(.+) has (\d+) from your wishlist$/, '$1 hat $2 von deiner Wunschliste'],
  [/^You have (\d+) that (.+) wants$/, 'Du hast $1, die $2 sucht'],
  [/^(\d+) cards · (\d+) sets? · shared (.+)$/, '$1 Karten · $2 Sets · geteilt $3'],
  [/^(\d+) trades?$/, '$1 Tausch'],
  [/^Trade( \d+)?$/, 'Tausch$1'], [/^Cards (\d+)$/, 'Karten $1'], [/^Binders (\d+)$/, 'Binder $1'], [/^Wishlist (\d+)$/, 'Wunschliste $1'],
  [/^(\d+) cards? on your wishlist \(Collection › Wishlist\)$/, '$1 Karte(n) auf deiner Wunschliste (Sammlung › Wunschliste)'],
  [/^(\d+) cards? removed from your wishlist$/, '$1 Karte(n) von der Wunschliste entfernt'],
  [/^(\d+) missing · from (.+)$/, '$1 fehlen · ab $2'],
  [/^(\d+) missing · approx\. (.+)$/, '$1 fehlen · ca. $2'],
  [/^looking for (.+)$/, 'gesucht: $1'],
  [/^(\d+) cards? on your watchlist at your target price – see Market › Watchlist$/, '$1 Karte(n) auf deiner Merkliste zum Wunschpreis – siehe Markt › Merkliste'],
  [/^Marked when it is (.+) or less$/, 'Markiert, wenn sie $1 oder weniger kostet'],
  [/^(\d+) of (\d+)$/, '$1 von $2'],
  [/^(.+): missing$/, '$1: fehlt'],
  [/^(.+): maybe missing$/, '$1: fehlt evtl.'],
  [/^Page (\d+) \/ (\d+)$/, 'Seite $1 / $2'],
  [/^Left out (\d+)$/, 'Herausgenommen $1'],
  [/^Left out of this set: (.*)$/, 'Aus dem Set herausgenommen: $1'],
  [/^Counts again: (.*)$/, 'Zählt wieder: $1'],
  [/^⚠ This trend is far above the recent averages – probably one unusual listing\. Totals use (.+) instead\.$/, '⚠ Dieser Trend liegt weit über den letzten Durchschnitten – wahrscheinlich ein einzelnes ungewöhnliches Angebot. Summen rechnen mit $1.'],
  [/^Masterset complete: (.+)!$/, 'Masterset komplett: $1!'],
  [/^Missing in your masterset (.+)$/, 'Fehlt in deinem Masterset $1'],
  [/^(\d+) cards? opened$/, '$1 Karte(n) aufgedeckt'],
  [/^Best: (.+)$/, 'Beste: $1'],
  [/^All (\d+)$/, 'Alle $1'],
  [/^choose rarity (\d+)$/, 'Seltenheit wählen $1'],
  [/^Pack: (.+)$/, 'Pack: $1'],
  [/^Pack mode: (.+)$/, 'Pack-Modus: $1'],
  [/^(\d+) cards? added to your collection$/, '$1 Karte(n) zur Sammlung hinzugefügt'],
  [/^(\d+) cards?$/, '$1 Karte(n)'],
  [/^Cardmarket set #(\d+)(.*)$/, 'Cardmarket-Set #$1$2'],
  [/^(\d+) rarities$/, '$1 Seltenheiten'],
  [/^(\d+) cards? · (\d+) to check · tap a card for details$/, '$1 Karte(n) · $2 zu prüfen · Karte antippen für Details'],
  [/^(\d+) cards? · tap a card for details$/, '$1 Karte(n) · Karte antippen für Details'],
  [/^Recognising (\d+) cards?…$/, 'Erkenne $1 Karte(n)…'],
  [/^Recognition failed: (.*)$/, 'Erkennung fehlgeschlagen: $1'],
  [/^(\d+) versions?$/, '$1 Versionen'],
  [/^(.*) · (\d+) versions$/, '$1 · $2 Versionen'],
  [/^(\d+) versions? fits? the set code$/, '$1 Version(en) passen zum Set-Code'],
  [/^(\d+) versions? fits? the pack$/, '$1 Version(en) passen zum Pack'],
  [/^(\d+) versions? fits? the card's language$/, '$1 Version(en) passen zur Sprache der Karte'],
  [/^(\d+) versions on Cardmarket$/, '$1 Versionen auf Cardmarket'],
  [/^Show all (\d+) versions$/, 'Alle $1 Versionen zeigen'],
  [/^Cardmarket trend price · offers from (.*)$/, 'Cardmarket-Trendpreis · Angebote ab $1'],
  [/^Set code read on the card:$/, 'Auf der Karte gelesener Set-Code:'],
  [/^\(read as (.*)\)\.$/, '(gelesen als $1).'],
  [/^(.+) print\. Cardmarket has no separate listing for it, so the prices are those of the European print of the same card – check before buying or selling\.$/, '$1 Druck. Cardmarket führt ihn nicht separat, daher sind die Preise die des europäischen Drucks derselben Karte – vor Kauf oder Verkauf prüfen.'],
  [/^Pack mode: (.*)\.$/, 'Pack-Modus: $1.'],
  [/^\(one of: (.*)\)$/, '(eine von: $1)'],
  [/^(.*) \(official\)$/, '$1 (offiziell)'],
  [/^♥ Wish ≤ (.*)$/, '♥ Wunsch ≤ $1'],
  [/^On your wishlist – marked when it is (.*) or less$/, 'Auf der Wunschliste – markiert, sobald sie $1 oder weniger kostet'],
  [/^(TCG|OCG): Unlimited$/, '$1: Unbegrenzt'],
  [/^(\d+) cards? · (\d+) without exact version \(shown as a range\)$/, '$1 Karte(n) · $2 ohne genaue Version (als Spanne)'],
  [/^(.*) since added$/, '$1 seit Hinzufügen'],
  [/^Missing (\d+) · approx\.$/, 'Fehlt $1 · ca.'],
  [/^on Cardmarket$/, 'auf Cardmarket'],
  [/^\((\d+) without price\)$/, '($1 ohne Preis)'],
  [/^(\d+)\/(\d+)( · ×\d)? · missing approx\. (.*)$/, '$1/$2$3 · fehlt ca. $4'],
  [/^(.*) · (\d+) versions$/, '$1 · $2 Versionen'],
  [/^(.*) · in collection$/, '$1 · in der Sammlung'],
  [/^Collect ×(\d) instead$/, 'Stattdessen ×$1 sammeln'],
  [/^Stop tracking (.*)\? Your ticks stay saved\.$/, '$1 nicht mehr verfolgen? Deine Haken bleiben gespeichert.'],
  [/^(\d+)\/(\d+) cards · Main (\d+) · Extra (\d+) · Side (\d+)$/, '$1/$2 Karten · Main $3 · Extra $4 · Side $5'],
  [/^(\d+) missing$/, '$1 fehlen'],
  [/^(\d+) cards? not recognised \(too new\?\)$/, '$1 Karte(n) nicht erkannt (zu neu?)'],
  [/^(.*) · cheapest version$/, '$1 · günstigste Version'],
  [/^Delete (.*)\?$/, '$1 löschen?'],
  [/^Copy this list:$/, 'Diese Liste kopieren:'],
  [/^On Cardmarket: Wants → create a list → paste into “Add a decklist”\. Then set$/, 'Auf Cardmarket: Wants → Liste anlegen → in „Add a decklist“ einfügen. Dann für alle Karten'],
  [/^, at least$/, ', mindestens'],
  [/^for all cards with the list's bulk modification\.$/, 'über die Sammelbearbeitung der Liste einstellen.'],
  [/^(.*) · target (.*)$/, '$1 · Ziel $2'],
  [/^(.*) on (\d+ \w+)$/, '$1 am $2'],
  [/^(\d+) cards? on your wishlist at your price – see Collection › Wishlist$/, '$1 Karte(n) auf deiner Wunschliste zu deinem Preis – siehe Sammlung › Wunschliste'],
  [/^Yesterday's average sale against the last 7 days\. Fast, but one odd sale can show up here\. Prices of (.*), cards from €2\.$/, 'Gestriger Durchschnittsverkauf gegen die letzten 7 Tage. Schnell, aber ein Ausreißer kann hier auftauchen. Preise vom $1, Karten ab 2 €.'],
  [/^Cardmarket trend against the 30-day average – the steadier movers\. Prices of (.*), cards from €2\.$/, 'Cardmarket-Trend gegen den 30-Tage-Schnitt – die stabileren Bewegungen. Preise vom $1, Karten ab 2 €.'],
  [/^No card found for (.*)\.$/, 'Keine Karte gefunden für $1.'],
  [/^Preparing (\d+) examples…$/, 'Bereite $1 Beispiele vor…'],
  [/^Export training data \((\d+)\)$/, 'Trainingsdaten exportieren ($1)'],
  [/^Prices of (.*) · (\d+) set codes · (\d+) cards in your collection$/, 'Preise vom $1 · $2 Set-Codes · $3 Karten in deiner Sammlung'],
  [/^pulled (.*) · (\d+) packs? (.*)$/, 'gezogen $1 · $2 Pack(s) $3'],
  [/^Booster (.*) on Cardmarket \((.*)\)$/, 'Booster $1 auf Cardmarket ($2)'],
  [/^(\d+) \/ (\d+) · swipe for the next$/, '$1 / $2 · wischen für die nächste'],
  [/^under €(.*)$/, 'unter €$1'], [/^over €(.*)$/, 'über €$1'],
  [/^(\d+) (cards?) · total$/, '$1 Karte(n) · gesamt'],
  [/^(\d+) (Sell|Keep|Bulk|Check version)$/, (m, n, k) => `${n} ${DE[k]}`],
  [/^(.*)\(([\d.]+) EUR\)$/, '$1($2 EUR)'],
];
const MONTHS = { Jan: 'Jan.', Feb: 'Feb.', Mar: 'März', Apr: 'Apr.', May: 'Mai', Jun: 'Juni', Jul: 'Juli', Aug: 'Aug.', Sept: 'Sept.', Sep: 'Sept.', Oct: 'Okt.', Nov: 'Nov.', Dec: 'Dez.',
  January: 'Januar', February: 'Februar', March: 'März', April: 'April', June: 'Juni', July: 'Juli', August: 'August', September: 'September', October: 'Oktober', November: 'November', December: 'Dezember' };

function one(core) {
  if (DE[core] != null) return DE[core];
  for (const [re, rep] of P) if (re.test(core)) return core.replace(re, rep);
  return null;
}

export function translate(text) {
  if (lang !== 'de' || !text) return text;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  const core = m[2].replace(/\s+/g, ' ');
  if (!core) return text;
  let out = one(core);
  if (out == null && core.includes(' · ')) { // "17 versions · reading set code…": part by part
    const parts = core.split(' · ');
    const tr = parts.map((x) => one(x));
    if (tr.some((x) => x != null)) out = parts.map((x, i) => tr[i] ?? x).join(' · ');
  }
  if (out == null) return text;
  out = out.replace(/\b(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\b/g, (x, d, mo) => `${d}. ${MONTHS[mo]}`);
  return m[1] + out + m[3];
}

export const t = translate;

const ATTRS = ['placeholder', 'aria-label', 'title'];
function translateNode(root) {
  if (root.nodeType === 3) {
    const v = translate(root.nodeValue);
    if (v !== root.nodeValue) root.nodeValue = v;
    return;
  }
  if (root.nodeType !== 1) return;
  for (const a of ATTRS) {
    if (root.hasAttribute?.(a)) { const v = translate(root.getAttribute(a)); if (v !== root.getAttribute(a)) root.setAttribute(a, v); }
  }
  if (root.tagName === 'SCRIPT' || root.tagName === 'STYLE') return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = w.nextNode();
  while (n) {
    if (n.nodeType === 3) { const v = translate(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
    else for (const a of ATTRS) if (n.hasAttribute(a)) { const v = translate(n.getAttribute(a)); if (v !== n.getAttribute(a)) n.setAttribute(a, v); }
    n = w.nextNode();
  }
}

// German mode: translate the page now and everything that is shown later.
export function startI18n() {
  document.documentElement.lang = lang;
  if (lang !== 'de') return;
  translateNode(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') translateNode(m.target);
      else for (const n of m.addedNodes) translateNode(n);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  // dialogs
  const c = window.confirm.bind(window), p = window.prompt.bind(window);
  window.confirm = (msg) => c(translate(msg));
  window.prompt = (msg, v) => p(translate(msg), v);
}
