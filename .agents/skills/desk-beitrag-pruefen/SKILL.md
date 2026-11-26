---
name: desk-beitrag-pruefen
description: Prüft die Passung, fachliche Grundlage, Einfachheit und Vollständigkeit eines Desk-Pull-Requests als Selbstprüfung oder für die Maintainer-Entscheidung.
---

# Desk-Beitrag prüfen

Lies [Projektumfang](../../../docs/roadmap.md), [Prüfregeln](../../../docs/entwicklung.md#änderungen-prüfen) und bei UI-Änderungen [DESIGN.md](../../../DESIGN.md).

1. Passt die Aufgabe zum allgemeinen Desk-Kern und zu den Abnahmekriterien? Prüfe vorhandene Lösungen, offene Vorarbeiten und zusätzlichen Wartungsaufwand.
2. Stimmen fachliche Annahmen? Lies die maßgebliche Quelle und prüfe einen repräsentativen Fall sowie relevante Randfälle. Gib Datenmigration, Schreibzugriffen, Berechtigungen und Wiederholungsfällen die nötige Aufmerksamkeit.
3. Dient der Diff dem vereinbarten Ergebnis und nutzt er vorhandene Wege sinnvoll? Prüfe Auswirkungen auf bestehende Daten, API-Nutzende, Exporte und Bedienung.
4. Halte geprüfte Basis, Head, offene Fragen und Nachweise fest. Stelle pro nicht erfülltem Kriterium dar, was fehlt. Die Selbstprüfung ergänzt das unabhängige [Code-](../desk-tdd-review/SKILL.md) und [Doku-Review](../desk-doku-pruefen/SKILL.md). Fachliche Grundsatzentscheidungen und die Merge-Freigabe liegen beim Maintainer.
5. Veröffentliche die Selbstprüfung im PR nach den [Regeln für Prüfkommentare](../../../docs/entwicklung.md#prüfnachweise-im-pull-request). Aktualisiere den Kommentar, wenn sich der geprüfte Stand ändert.
