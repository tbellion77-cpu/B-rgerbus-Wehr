# BürgerBus Wehr – Phase 1 (Prototyp)

Interaktive Karte aller fünf Bürgerbus-Linien mit einem Bus, der sich **nach dem echten Fahrplan** bewegt
(Stand März 2024, Quelle: „BürgerBus Wehr – Ihr Fahrplan“ auf wehr.de).

Öffnen: `index.html` direkt im Browser. Kein Server, kein API-Schlüssel, keine Kosten.

## Was die Seite kann

- Alle 5 Linien als Routen auf der Karte, 54 Haltestellen (anklickbar)
- **Live**: Position, wo der Bus laut Fahrplan gerade sein müsste (Mo/Mi/Fr vormittags, Di/Do nachmittags)
- **Simulation**: Wochentag und Uhrzeit frei wählen, Zeitraffer 1×/20×/60×
- Haltestellen-Tafel: nächste Abfahrten mit Linie und nächstem Halt
- Groß lesbare Schrift (Atkinson Hyperlegible – entwickelt für Menschen mit Sehschwäche), Hell/Dunkel, Handy-tauglich

## Technik

| Teil | Wahl | Grund |
|---|---|---|
| Karte | MapLibre GL + OpenFreeMap (OSM) | frei, kein Token, keine Kosten, DSGVO-freundlicher als Google/Mapbox |
| Routen | OSRM (einmalig beim Bauen) | Straßengenaue Linienführung zwischen den Halten |
| Haltestellen | OpenStreetMap / Nominatim | Kreuzungen der im Fahrplan genannten Straßen |

## Dateien

```
index.html          fertige Seite (erzeugt, nicht von Hand ändern)
src/app.html        Oberfläche und Simulationslogik
data/network.json   Haltestellen, Linien, Fahrzeiten, Routengeometrie
data/stops.raw.json Ergebnis der Geokodierung
tools/resolve.py    Haltestellen geokodieren       → data/stops.raw.json
tools/build.py      Fahrplan + Routen zusammenbauen → data/network.json
tools/bundle.py     alles in eine Datei packen      → index.html
```

Neuer Fahrplan: Minuten-Offsets in `tools/build.py` (`L = {...}`) und Rundenstarts (`rounds`) anpassen,
dann `python3 tools/build.py && python3 tools/bundle.py`.

## Neue App (`web/`) – Live-Karte im Graphit-Design

Eigenständige Next.js-App (statischer Export, läuft auf jedem Webspace) mit derselben Datenquelle `data/network.json`.

- Haltestelle suchen oder „Nähe“ → nächste Abfahrten → Abfahrt antippen → Bus live verfolgen
  („Strecke“ von oben oder „Mitfahren 3D“ mit Gelände). Direktlinks: `/?halt=hauptstr`, `/?linie=3`
- Fährt der Bus gerade nicht, spielt die Seite den nächsten Betriebstag im Zeitraffer ab (Pause/Echtzeit)
- 3D-Bus (schlichter Kleinbus aus Grundformen, keine Marken) und 3D-Haltestellenschilder (three.js)
- Feiertage Baden-Württemberg werden berechnet (kein Betrieb)
- QR-Aushänge je Haltestelle zum Drucken: `/aushang` (Ziel-Adresse über `NEXT_PUBLIC_SITE_URL`)
- Karte ohne API-Schlüssel: **Luftbild** = Orthophotos 20 cm des LGL BW, einmalig für das Bediengebiet
  vorberechnet (`npm run luftbild`, z12–z18, ca. 26 MB in `web/public/luftbild`, Lizenz dl-de/by-2-0),
  darüber Straßennamen von OpenFreeMap; **Karte** = OpenFreeMap (OSM); Gelände: Terrain Tiles (AWS Open Data)

```
cd web
npm install
npm run dev        # http://localhost:5610
npm run build      # statische Seite in web/out
npm run luftbild   # nur nötig, wenn sich das Bediengebiet ändert
```

## Offene Punkte – bitte mit dem Bürgerbus-Team klären

1. **Lage dieser 13 Haltestellen ist geschätzt** (auf der Karte gestrichelt):
   Wehr Hauptstr./Seniorenresidenz, Elektro-Center, Enkendorfstraße Haltestelle SBG, Buchenweg/Am Hölzle,
   Meierhof-/Hachbergstr., Anfang Zelgstraße, Zelgstraße Realschule, Mettler-/Blumenweg/Görlitzer Straße,
   Seeboden-/Bandolstraße, Fa. Henkel, KulTurm/Kiga St. Michael, Kinderarzt/Basler Straße, Goethestr./Abzw. Schmadstr.
   Am einfachsten: einmal mitfahren und an jedem Halt die Position mit dem Handy notieren.
2. **Linie 5, letzte Zeile**: Elektro-Center und Hauptstraße stehen beide mit x.32 im Fahrplan (vermutlich Druckfehler, sonst x.33).
3. **Feiertage**: Der Bus fährt an Feiertagen nicht – die Seite kennt noch keinen Feiertagskalender (Baden-Württemberg).
4. **Ist der Fahrplan von März 2024 noch aktuell?**
5. Routen zwischen den Halten sind die kürzesten Straßenwege – die tatsächliche Fahrweise kann abweichen.
   Mit den GPS-Daten aus Phase 2 lassen sie sich exakt nachzeichnen.

## Ausblick

**Phase 2 – Live-GPS.** Ein GPS-Tracker im Bus (z. B. Teltonika FMC-Serie, ca. 60–100 € + IoT-SIM) oder eine
Fahrer-App auf einem Diensthandy sendet alle 5–10 s die Position. Kleiner Server (Node) empfängt per MQTT oder HTTP,
speichert in PostgreSQL/PostGIS und schickt per WebSocket an die Karte. Die Fahrplan-Simulation bleibt als Rückfall,
wenn kein Signal da ist. Vorab mit Stadt/Datenschutz klären: Position nur während der Dienstzeit senden, keine
Fahrerdaten speichern, Verlauf nach kurzer Frist löschen.

**Phase 3 – 3D.** MapLibre kann 3D-Gebäude und über eine Custom-Layer ein Three.js-Modell (`.glb`) anzeigen.
Ein generisches Kleinbus-Modell in Silber genügt; Fotos mit Kennzeichen oder Werbeflächen der Sponsoren gehören
nicht in die Textur, ohne die Rechte zu klären.
