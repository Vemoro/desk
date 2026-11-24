---
name: desk-checks
description: Plant und führt Desk-Prüfungen gegen den vorgesehenen Git-Stand mit isolierten Datenbanken, freien Ports und nachvollziehbaren Ergebnissen aus.
---

# Desk-Prüfungen ausführen

Verwende die [Prüfregeln](../../../docs/entwicklung.md#prüfungen-und-dokumentation) und die Befehle des konkreten Zielstands. Lies `package.json` und die GitHub-Workflows, falls vorhanden. Ein reiner Doku-Stand verlangt Quellen, ausführbare Beispiele, relative Links und eine saubere Git-Änderung.

Bei einem Anwendungsstand verwende die dort festgelegte Bun-Version. Gewöhnliche Prüfungen sind `bun install --frozen-lockfile`, `bun run build`, `bun run check`, `bun run migrate` und `bun run test`. Verwende für Fachdaten eine eigene Testdatenbank mit Endung `_test`. Wähle bei einem gezielten Review den betroffenen Test zusätzlich einzeln.

Für Browserprüfungen nutze eine getrennte `_demo`-Datenbank, feste lokale Adressen und synthetische Demo-Daten. Prüfe vorher laufende Container und lokale Listener. Ein anderer Compose-Projektname ändert den veröffentlichten Host-Port alleine nicht. Wenn Fremdintegrationen deaktiviert sein sollen, setze ihre Zugangsumgebungsvariablen im Testprozess ausdrücklich leer, falls Bun lokale `.env`-Werte nachladen kann. Nutze `DESK_E2E_URL` für eine bereits gestartete Instanz. Der [Screenshot-Skill](../desk-pr-screenshots/SKILL.md) beschreibt die Bildaufnahme.

Beende nach der Prüfung nur die eigens gestarteten Testdienste. Notiere Befehle, Stand, Resultate und Gründe für ausgelassene Prüfungen im PR.
