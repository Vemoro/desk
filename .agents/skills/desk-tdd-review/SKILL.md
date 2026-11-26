---
name: desk-tdd-review
description: Prüft Desk-Code unabhängig gegen den angegebenen PR-Stand und belegt Verhaltensbefunde durch fehlschlagende Tests.
---

# Desk-Code unabhängig prüfen

Arbeite nach den [Review-Regeln](../../../docs/entwicklung.md#änderungen-prüfen). Verwende Auftrag, Issue, Zielbasis und genauen Head. Bei Voraussetzungs-PRs prüfe die tatsächlich relevante Basis und gegebenenfalls den aufrufenden unveränderten Code. Nutze eine [isolierte Testumgebung](../desk-checks/SKILL.md).

1. Lies den Diff und verfolge den normalen Aufrufweg. Prüfe realistische Randfälle, Altbestände, Rollen, wiederholte Requests und konkurrierende Operationen, soweit sie die Aufgabe berühren.
2. Reproduziere einen Befund mit einem gezielten Test, der auf dem geprüften Stand aus dem erwarteten Grund fehlschlägt. Notiere Test, betroffene Stelle, Beobachtung und Sollzustand. Markiere eine fachlich offene Annahme als Entscheidung. Einen Vorschlag zur Formulierung oder Struktur kennzeichnest du als Vorschlag.
3. Halte auch bei fehlenden Befunden fest, welche Fälle geprüft wurden. Nach einem Fix prüfe Rot und Grün am jeweiligen Stand, die relevanten Regressionstests und die CI für den neuen Head. Bei Dokumentationsänderungen gehört ein getrenntes [Doku-Review](../desk-doku-pruefen/SKILL.md) dazu.
4. Veröffentliche das Ergebnis als eigenen [Prüfkommentar im PR](../../../docs/entwicklung.md#prüfnachweise-im-pull-request), auch ohne Befund.
