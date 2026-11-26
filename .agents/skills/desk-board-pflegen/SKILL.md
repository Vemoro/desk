---
name: desk-board-pflegen
description: Prüft Issues und Karten auf der Desk Roadmap und aktualisiert die vereinbarte Einordnung mit nachvollziehbarem Beleg.
---

# Desk Roadmap pflegen

Lies die [Bedingungen der Board-Status](../../../docs/roadmap.md#board-zustände). Verwende das Desk-Project von Vemoro und die Issue-Nummer aus `Vemoro/desk`.

```sh
gh project item-list 2 --owner Vemoro --limit 250 --format json
gh issue view <nummer> --repo Vemoro/desk --json title,state,projectItems
```

Ermittle zunächst fehlende Karten, ungeprüfte Aufgaben und auffällige Diskrepanzen zu den zugehörigen PRs. Die Project-Ansicht und die Issue-Abfrage ergänzen sich. Prüfe bei Listenlimits weitere Seiten oder die Board-Suche. Gleiche vor „Geplant“ den [Issue-Prüfnachweis](../../../docs/entwicklung.md#issue-review-vor-der-planung) mit der aktuellen Fassung ab. Belege die übrige Einordnung durch Umfang, Review, PR, Release oder die konkrete externe Abhängigkeit. Ein vorhandener Desk-Adapter bleibt eine Desk-Aufgabe.

Ändere Karten im autorisierten Auftrag mit dem verfügbaren GitHub-Werkzeug. Prüfe danach den Status am betroffenen Issue. Falls Schreibrechte oder Project-Zugriff fehlen, übergib die belegte Einordnung als Vorschlag. Erhalte vorhandene Zuweisungen und Prioritäten, bis der Maintainer eine Änderung entschieden hat. Der [Checkup](../../../docs/entwicklung.md#entwicklungsrunden-für-agenten) erfasst offene Entscheidungen und die nächste umsetzbare Aufgabe.
