# BürgerBus Wehr

Digitale Fahrgastinformation für den ehrenamtlichen Bürgerbus der Stadt Wehr (Baden).

- Phase 1 (fertig): Karte + Fahrplan-Simulation, siehe README.md
- Phase 2: Live-GPS (Tracker → Server → WebSocket → Karte)
- Phase 3: 3D-Fahrzeug auf der Karte

## Regeln
- Zielgruppe sind oft ältere Fahrgäste: große Schrift, hoher Kontrast, einfache Sprache, alles auf Deutsch.
- `index.html` wird erzeugt: Änderungen in `src/app.html` bzw. `tools/build.py`, dann `python3 tools/build.py && python3 tools/bundle.py`.
- Fahrplandaten nur aus dem offiziellen Fahrplan der Stadt übernehmen; Abweichungen im README unter „Offene Punkte“ vermerken.
- API-Schlüssel nie ins Repo. Browser-Tokens (z. B. Karten) nur mit URL-Beschränkung und über Umgebungsvariablen.
- Datenschutz: GPS-Position nur während der Dienstzeit, keine Fahrerdaten, Verlauf kurz halten.

## Skills
Projekt-Skills liegen in `.claude/skills/<name>/SKILL.md` und werden in jeder Claude-Code-Sitzung (lokal und in der Cloud) automatisch geladen.
