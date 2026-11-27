---
name: desk-beitrag
description: Bereitet einen Desk-Pull-Request mit passender Git-Basis, Akzeptanzkriterien, Prüfungen und Updatehinweisen zur Einreichung vor.
---

# Desk-PR vorbereiten

Lies die [PR-Regeln](../../../docs/entwicklung.md#pull-requests) und nutze die [PR-Vorlage](../../../.github/pull_request_template.md).

1. Gleiche den Auftrag mit dem Issue ab. Wähle die passende Zielbasis, prüfe eigene und fremde Änderungen im Worktree und halte eine offene Vorarbeit mit PR-Nummer und Commit fest.
2. Lade bei UI-Änderungen vor Eingriffen [desk-pr-screenshots](../desk-pr-screenshots/SKILL.md). Führe die einschlägigen [Prüfungen](../desk-checks/SKILL.md) aus. Stage die Dateien, die zum Auftrag gehören, und kontrolliere den Diff.
3. Beschreibe Ergebnis, Akzeptanz, Basis, Stand der Prüfung und relevante Folgen für Daten, Konfiguration und Updates. Kennzeichne wesentliche KI-Unterstützung. Bei Verwendung von `gh pr create` kann die Beschreibung als Datei mit `--body-file` übergeben werden.
4. Prüfe vor einem autorisierten Push, ob der PR des Branches noch offen ist. Nutze für laufende Arbeit einen Entwurf. Ergänze die [Selbstprüfung](../desk-beitrag-pruefen/SKILL.md), die erforderlichen unabhängigen Reviews und die CI des aktuellen Heads. Aktualisiere die Beschreibung nach Änderungen am Umfang oder Prüfstand.
5. Prüfe vor „Ready for review“, Übergabe und Merge, ob die in der PR-Beschreibung verlinkten [Prüfkommentare](../../../docs/entwicklung.md#prüfnachweise-im-pull-request) den vorgelegten Stand abdecken.
