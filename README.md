# Digitaler Kleiderschrank

Eine Web-App (PWA) fürs iPhone: Kleidung fotografieren, Hintergrund entfernen, Farben erkennen,
Outfits kombinieren und bewerten, Wäsche im Blick behalten.

- Nur HTML, CSS und JavaScript, ohne Framework und ohne Build-Schritt.
- Kein Server, keine Konten, keine API-Keys. Alles bleibt auf dem Handy (IndexedDB).
- Deine Fotos werden **nie** hochgeladen.
- Läuft offline, sobald die App einmal geöffnet wurde.

---

## 1. Lokal am Computer testen

Die App muss über einen kleinen Webserver laufen. Ein Doppelklick auf `index.html` (`file://`)
funktioniert nicht, weil Browser dort keine JavaScript-Module und keinen Service Worker erlauben.

Öffne im Ordner `kleiderschrank` ein Terminal und starte **eine** der folgenden Varianten:

```bash
# Variante A: Python (meist auf Mac/Linux schon installiert)
python3 -m http.server 8000        # Windows: py -m http.server 8000

# Variante B: Node.js
npx serve -l 8000
```

Dann im Browser öffnen: <http://localhost:8000>

Tipp: In Chrome oder Safari kannst du mit den Entwicklertools (F12 → Gerätesymbol) eine iPhone-Ansicht einstellen.

**Auf dem iPhone im selben WLAN:** `http://<IP-deines-PCs>:8000` funktioniert zum Ausprobieren der Oberfläche.
Offline-Modus, „Zum Home-Bildschirm“ als echte App und dauerhafter Speicher brauchen aber **HTTPS**.
Am einfachsten bekommst du HTTPS mit GitHub Pages (nächster Abschnitt).

---

## 2. Kostenlos auf GitHub Pages veröffentlichen (ohne Git-Kenntnisse)

1. Auf <https://github.com> ein kostenloses Konto anlegen und einloggen.
2. Oben rechts **„+“ → „New repository“**.
   - Name z. B. `kleiderschrank`
   - **Public** auswählen (GitHub Pages ist im Gratis-Tarif nur für öffentliche Repositories verfügbar)
   - **„Create repository“** klicken.
3. Auf der neuen Seite den Link **„uploading an existing file“** anklicken.
4. Den **Inhalt** des Ordners `kleiderschrank` hineinziehen, also `index.html`, `style.css`, `sw.js`,
   `manifest.json` sowie die Ordner `js` und `icons`. Nicht den Ordner selbst hineinziehen.
   `index.html` muss danach direkt auf der obersten Ebene liegen.
5. Unten **„Commit changes“** klicken.
6. Im Repository **Settings → Pages** öffnen und unter „Build and deployment“ einstellen:
   Source **„Deploy from a branch“**, Branch **`main`**, Ordner **`/ (root)`**, dann **Save**.
7. Ein bis zwei Minuten warten. Oben erscheint dann die Adresse, z. B.
   `https://DEIN-NAME.github.io/kleiderschrank/`

> Öffentlich ist dabei nur der **Programmcode**. Deine Kleidung, Fotos und Outfits liegen
> ausschließlich auf deinem Handy und landen nie bei GitHub.

### Auf dem iPhone installieren

1. Die Adresse in **Safari** öffnen.
2. Teilen-Symbol (Quadrat mit Pfeil) → **„Zum Home-Bildschirm“** → Hinzufügen.
3. Die App ab jetzt **nur noch über das Icon** starten.

> **Wichtig:** Safari und die Home-Bildschirm-App haben auf dem iPhone **getrennte Speicher**.
> Teile, die du im normalen Safari-Tab anlegst, siehst du in der installierten App nicht.
> Installiere die App also zuerst und benutze sie dann. Daten kannst du per Backup umziehen.

### Updates

Geänderte Dateien einfach erneut hochladen (Repository → „Add file“ → „Upload files“, gleiche Namen überschreiben).
Ist das Handy online, lädt die App beim nächsten Start automatisch die neue Version.
Fügst du **neue** Dateien hinzu, trag sie in `sw.js` in die Liste `SHELL` ein und zähl `VERSION` hoch,
damit sie auch offline verfügbar sind.

---

## 3. Ordnerstruktur

```
kleiderschrank/
├── index.html        Grundgerüst, iOS-Meta-Tags, Tab-Leiste
├── style.css         Gestaltung (mobile first, Safe-Area, Hell/Dunkel)
├── manifest.json     PWA-Infos (Name, Icons, Farben)
├── sw.js             Service Worker (offline)
├── icons/            App-Icons (inkl. apple-touch-icon)
├── models/           KI-Modell u2netp.onnx (optional, 4,5 MB)
└── js/
    ├── app.js        Start, Tabs, Schrank, Detailansicht, Teil hinzufügen, Wäsche, Einstellungen
    ├── config.js     Kategorien, Standard-Einstellungen, Bildgrößen
    ├── db.js         IndexedDB (Speichern/Laden), dauerhafter Speicher
    ├── store.js      App-Zustand + alle Schreibvorgänge
    ├── wardrobe.js   Tragen, Wäsche-Status, „diese Woche“ (Mo–So)
    ├── bgremove.js   Hintergrund entfernen (Flood-Fill, Werkzeuge, optional KI) + Editor
    ├── colors.js     Farberkennung (k-means), HSL, deutsche Farbnamen  ← Farb-Regeln
    ├── rating.js     Farb-Rating 0–10 mit Begründung                   ← Rating-Regeln
    ├── suggest.js    Ersatzteil-Vorschläge, „Überrasch mich“           ← Vorschlags-Regeln
    ├── outfit.js     Outfit-Builder und gespeicherte Outfits
    ├── backup.js     Export/Import aller Daten inkl. Bilder
    └── ui.js         kleine Helfer (Dialoge, Toast, Sheets)
```

## 4. Wo die Regeln stehen

Alle Stellschrauben stehen jeweils **oben in der Datei** als gut lesbares Objekt.
Werte ändern, Datei speichern, App neu laden.

| Was | Datei | Objekt | Beispiele |
|---|---|---|---|
| Farbnamen und neutral/bunt | `js/colors.js` | `FARBNAMEN` | Tabelle mit Farbton (h), Sättigung (s) und Helligkeit (l). Die **erste passende Zeile gewinnt**. `neutral: true` bedeutet „passt zu allem“ (z. B. Jeansblau, Beige, Marine). |
| Farberkennung | `js/colors.js` | `FARB_REGELN` | max. 3 Farben, Mindestanteil 10 %, wann ähnliche Töne verschmelzen |
| Farbkreis für Harmonien | `js/colors.js` | `rybHue()` | rechnet in den Maler-Farbkreis um (dort sind Rot/Grün, Blau/Orange, Gelb/Lila Gegenüber) |
| Rating | `js/rating.js` | `RATING_REGELN` | Punkte für „neutral + 1 Akzent“ (9), analog (8,5), komplementär (8), Ton-in-Ton (8); Abzug pro Farbe über 3; Gradzahlen für analog/komplementär |
| Vorschläge | `js/suggest.js` | `VORSCHLAG_REGELN` | Gewicht für „nie zusammen getragen“, „lange nicht getragen“, Zufallsanteil bei „Überrasch mich“, Pflicht-Slots |
| Freistellen | `js/bgremove.js` | `FREISTELL_REGELN` | Start-Toleranz/Automatik, wie stark Schatten ignoriert werden, KI-Modell |
| Wäsche-Grenzen | in der App unter **Mehr** | (Standard in `js/config.js`) | Oberteil 1×, Hose 3×, Jacke 5×, Schuhe/Accessoires nie |
| Kategorien | `js/config.js` | `KATEGORIEN` | Name, Mehrzahl, Emoji |

**Wie das Rating rechnet (Kurzfassung):** Pro Teil zählen die Hauptfarbe und Zweitfarben ab 25 % Fläche.
Neutraltöne werden getrennt. Bunte Farben mit ähnlichem Farbton werden zu einer Farbe zusammengefasst.
Dann gilt: nur neutral = 7, neutral + 1 Akzent = 9, Ton-in-Ton = 8, zwei Farben analog = 8,5 /
verwandt = 7 / komplementär = 8 / sonst 5, drei Farben je nach Harmonie 4,5–7,5, vier und mehr = 3,5.
Dazu kommen Zu- und Abschläge (neutrale Basis +0,5, Hell-Dunkel-Kontrast +0,5, mehr als 3 Farben −1,5 je Farbe,
zwei sehr knallige Komplementärfarben −1). Das Ergebnis wird auf 0–10 begrenzt und gerundet.

**Wie Vorschläge entstehen:** Das „schwächste Teil“ ist zuerst eines, das in der Wäsche ist oder diese Woche
getragen wurde, sonst das Teil, ohne das das Rating am stärksten steigt. Als Ersatz kommen nur Teile derselben
Kategorie infrage, die nicht in der Wäsche und diese Woche nicht getragen sind. Die Farben dürfen dabei nicht
schlechter werden. Bewertet wird nach Farb-Rating + Bonus für „nie / lange nicht zusammen getragen“
+ Bonus für „selbst lange nicht getragen“ + kleiner Bonus für „frisch gewaschen“.
„Zusammen getragen“ heißt: am selben Tag als getragen eingetragen.

---

## 5. Ehrliche Grenzen

**Hintergrund entfernen ohne KI**
- Funktioniert gut bei **ruhigem, einfarbigem Hintergrund** mit Kontrast zum Teil, z. B. Shirt auf Bett, Boden oder Tür.
- Schwierig bis unmöglich: weißes Teil auf weißem Grund, gemusterter Teppich, Teil ragt über den Bildrand,
  Kleidung am Körper getragen, starke Schatten.
- Löcher, die nicht mit dem Rand verbunden sind (z. B. zwischen Arm und Körper), musst du mit dem **Zauberstab** antippen.
- Feine Kanten (Fransen, Fell, Schnürsenkel) werden nicht perfekt. Mit dem Finger ist die Pinsel-Genauigkeit
  begrenzt, es gibt keinen Zoom.
- **Tipp:** Teil flach auf einen einfarbigen, kontrastreichen Untergrund legen, gleichmäßiges Licht, von oben fotografieren,
  mit etwas Rand rundherum.

**Optionales KI-Modell („Besser“)**
- Kleines Modell *U²-Netp* (4,5 MB, Apache-2.0, liegt im Ordner `models/`). Dazu kommt beim ersten Mal die Laufzeit
  *onnxruntime-web* (ca. 11 MB) von cdn.jsdelivr.net. Danach ist alles im Browser-Cache und läuft offline.
  Der Server sieht nur deine IP-Adresse, **nicht deine Fotos**. Die Berechnung passiert komplett auf dem Handy (wenige Sekunden).
- Braucht nur wenig Arbeitsspeicher (das große Modell RMBG-1.4 hat auf dem iPhone die Seite zum Absturz gebracht und wurde ersetzt).
- Das Ergebnis ist gröber als bei großen Modellen. Mit Radierer und Pinsel nachbessern.

**Farben und Rating**
- Licht und Kamera verfälschen Farben. Ein weißes Shirt im Schatten wird schnell „Hellgrau“. Farben lassen sich in der
  Detailansicht von Hand korrigieren (Farbe, Name, neutral/Farbe).
- Bei Mustern (Streifen, Karos, Prints) werden nur die 1–3 häufigsten Farben erkannt, das Muster selbst nicht.
- Das Rating ist eine **einfache Faustregel** zu Farbharmonie. Schnitt, Material, Stil, Anlass und Wetter
  kennt es nicht. Geschmack ist individuell, deshalb sind alle Regeln anpassbar.

**Speicher und Daten**
- Daten liegen nur auf diesem einen Gerät. Es gibt **keinen Sync** zwischen Geräten.
- iOS kann Daten von Web-Apps löschen, wenn der Speicher knapp wird, oder wenn du die App vom Home-Bildschirm löschst.
  Die App fragt nach dauerhaftem Speicher, das ist aber keine Garantie. **Mach regelmäßig ein Backup**
  (Mehr → Backup erstellen → „In Dateien sichern“ oder iCloud Drive).
- Bilder werden auf max. 800 px verkleinert. Pro Teil fallen etwa 300–600 KB an, 100 Teile ergeben also etwa 50 MB.
  Ein Backup mit vielen Teilen kann groß werden und braucht beim Einlesen einen Moment.

**Sonstiges**
- „Heute getragen“ zählt pro Tag nur einmal. Die Wäsche-Automatik zählt also Tragetage, nicht Anzieh-Vorgänge.
- „Diese Woche getragen“ graut standardmäßig alle Kategorien aus, auch Schuhe. Wenn du Schuhe täglich trägst,
  schalte das unter **Mehr** für Schuhe/Accessoires aus.
- Getestet wurde in Chrome mit simulierter iPhone-Ansicht (390 × 844, Touch), hell und dunkel, online und offline.
  Auf einem echten iPhone mit Safari ist die App **nicht** getestet. Kleinigkeiten wie Farbwähler oder Teilen-Dialog
  können je nach iOS-Version anders aussehen. Benötigt wird iOS 15.4 oder neuer.
