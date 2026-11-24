# Entwicklung an Desk

## Auftrag und Arbeitsstand

Prüfe vor einer Änderung [Produktumfang](roadmap.md), Status, Auftrag und erwartetes Ergebnis. Suche nach vorhandenen Lösungen und Abhängigkeiten. Bei einem Fehler belege am relevanten Stand, was aktuell passiert. Bei einer Integration gilt die Version der vorgesehenen Schnittstelle. Halte offene Entscheidungen des Maintainers in Issue oder PR fest.

Arbeite pro Thema auf einem eigenen Branch gegen die passende Git-Basis. Änderungen an `main` kommen über freigegebene Pull Requests. Wenn eine Vorarbeit in einem offenen PR steckt, nenne dessen Nummer, Basis und Head. Fremde Änderungen bleiben geschützt. Bestehende Routen, Daten und Exportformate sind Bestandteil der Abnahme, wenn die Änderung sie berührt.

## Umsetzung

Nutze vorhandene Komponenten und Abläufe, wenn ihr Verhalten passt. Halte Änderungen am Verhalten, passende Tests und die betroffene Nutzerdoku zusammen. Ein reproduzierbarer Bugfix beginnt mit einem Test, der aus dem erwarteten Grund fehlschlägt. Wähle Unit-Tests für Logik, Integrationstests für Datenbank und Schnittstellen und Browserfälle für kritische Bedienabläufe.

Behandle gespeicherte Geldbeträge in ganzen Cent. Prüfe bei Schreibvorgängen Wiederholungen, mögliche Konkurrenz und den Zustand nach einem Fehler. Ergänze beim Ändern der Datenbank eine neue Migration. Bereits angewendete Migrationen bleiben stabil. Änderungen an gespeicherten Daten brauchen eine Probe mit repräsentativem Altbestand und belegtem Wiederanlauf. Für die Oberfläche gelten die [Gestaltungsregeln](../DESIGN.md).

## Pull Requests

Nutze einen abgegrenzten Titel mit Bereich und betroffenen Issues. `Umgesetzt #…` kennzeichnet die vollständige Umsetzung, `Refs #…` einen Beitrag zu einem Teilumfang. Dokumentiere Ergebnis, Zielbasis, Prüfungen, betroffene Daten und Updatehinweise. Frage bei unklarem Abnahmekriterium nach der fachlichen Entscheidung. Kennzeichne wesentliche KI-Unterstützung im PR und nutze vorhandene Co-Autor-Trailer des Werkzeugs, wenn sie korrekt zuordenbar sind.

Verwende für laufende Arbeit einen Entwurf. Vor der Freigabe zur Prüfung müssen Selbstprüfung, unabhängiges Review und erforderliche CI für den aktuellen Stand vorliegen. Passe die PR-Beschreibung an, wenn sich Umfang oder Prüfnachweis ändern.

## Änderungen prüfen

1. **Selbstprüfung.** Der Autor prüft Passung zum Umfang, jedes Akzeptanzkriterium, fachliche Quellen, Wiederverwendung und die einfachste tragfähige Umsetzung. Er nennt offene Folgen für bestehende Daten, Schnittstellen, Rechte und Updates. Der Bericht nennt Basis, Head und Prüfnachweise.
2. **Unabhängiges Review.** Ein anderer Mensch oder ein frischer Agent erhält Issue, Zielbasis, Head, Diff und bei Bedarf den relevanten unveränderten Aufrufkontext. Gib ihm bei agentischem Review weder Entstehungsverlauf noch Selbstbewertung. Code und Markdown brauchen ihre jeweilige Prüfung. Wenn beide betroffen sind, prüft sie je eine unabhängige Person oder ein frischer Agent.
3. **Befunde und Nachprüfung.** Ein Codebefund nennt Datei, beobachtetes Verhalten und einen auf dem geprüften Stand fehlschlagenden Test. Fachliche Annahmen werden mit Quelle und Gegenprobe geprüft. Ist ein belastbarer automatisierter Nachweis technisch nicht möglich, dokumentiere die manuelle Reproduktion und die offene Grenze. Doku-Befunde brauchen eine Stelle und einen Abgleich mit Code, Befehlen oder Primärquelle. Trenne Vorschläge von Befunden. Wiederhole nach einer Änderung die einschlägige Prüfung und ordne sie dem neuen Head zu.
4. **Freigabe.** Der Maintainer entscheidet über Merge und Release. Änderungen an Anmeldung, Berechtigungen, Datenmigrationen, Lagerbuchungen, Kosten und schreibenden Anbindungen brauchen eine gezielte fachliche Prüfung der Folgen und Fehlerfälle. Unsicherheit über den fachlichen Sollzustand wird vor Freigabe entschieden.

### Überlappende Änderungen

Prüfe bekannte Überschneidungen zunächst mit Git, etwa mit `git merge-tree --write-tree <Head-A> <Head-B>`. Prüfe das gemeinsame Verhalten in einem getrennten Worktree. Bei einem Wechsel der Zielbasis müssen Diff, Review und CI zum neuen Stand passen. Nenne die tatsächliche Abhängigkeit und die Prüfreihenfolge in der PR-Beschreibung.

## Prüfungen und Dokumentation

Ergebnis, Fehlschläge und Auslassungen mit Grund gehören in den PR. Eine Wiederholung des CI-Laufs braucht einen erkannten Grund. Behebe die Ursache eines Fehlers, erhalte Umfang und Strenge der Prüfungen und wiederhole die betroffene Prüfung.

### Befehle und Screenshot-Workflow

Nutze die Befehle der jeweiligen Zielbasis. Wenn auf dieser Basis die Desk-Anwendung vorhanden ist, gehören je nach Änderung `bun run build`, `bun run check`, `bun run migrate`, `bun run test` und bei betroffener Bedienung `bun run e2e` dazu. Integration und Browser verwenden getrennte PostgreSQL-Datenbanken mit `_test` beziehungsweise `_demo` und isolierte Testinstanzen.

Auf einem Stand mit Entwicklungsdoku allein prüfe die geänderten Regeln, Verweise, Skills und Beispiele. Halte dort offen fest, welche Anwendungstests mangels Anwendung auf dieser Zielbasis nicht laufen. Für Screenshots und Beispiele nutze fiktive oder anonymisierte Angaben. Zugangsdaten und personenbezogene Daten bleiben aus Repository, Issues, Prompts und Logs heraus.

Doku, Oberfläche und Beiträge werden auf Deutsch geschrieben, Code-Bezeichner auf Englisch. Eine Regel steht an einer maßgeblichen Stelle. Der Skill verweist dorthin und beschreibt den Ablauf. Vorher-Nachher-Bilder nutzen vollständige Git-Stände, gleiche Daten und Viewports sowie Hell, Dunkel und bei betroffener Bedienung Smartphone. Der [Screenshot-Skill](../.agents/skills/desk-pr-screenshots/SKILL.md) beschreibt Aufnahme und Veröffentlichung.

## Entwicklungsrunden für Agenten

Der fortlaufende Ablauf verwendet das mit dem Maintainer vereinbarte Soll. Jedes Issue wird vor „Geplant“ durch einen frischen Agenten auf Bestand, Abgrenzung, Abhängigkeiten und Akzeptanz geprüft. Übergib ihm Issue, Zielbasis und Prüfauftrag ohne den Entstehungsverlauf. Nach wesentlichen Änderungen folgt eine neue Prüfung. Beginne die PRs der Runde nach dem Issue-Soll. Ein PR zählt nach seiner Selbstprüfung, unabhängigen Prüfung und grüner erforderlicher CI für den aktuellen Stand. Bei betroffener Oberfläche zählen die Vergleichsbilder zur Abnahme.

| Runde | Für die Runde geprüfte Issues in „Geplant“ | PRs zur Freigabe bereit |
| --- | ---: | ---: |
| Start oder Neustart | 10 | 1 |
| Danach | 5 zusätzliche | 1 |
| Folgerunde | 3 zusätzliche | 2 |
| Folgerunde | 2 zusätzliche | 3 |
| Folgerunde | 1 zusätzliches | 5 |

Danach wiederholt sich die Reihe ab 5/1. Nur beim Leerlaufen der umsetzbaren Warteschlange beginnt sie erneut bei 10/1. Prüfe dabei vorhandene Karten, externe Hindernisse und offene Entscheidungen. Halte am Rundenende und nach abgeschlossenen PRs kurz den Stand, Belege, nächste Entscheidung und mögliche Verbesserungen der Agenten-Doku fest. Die erste [Neubewertung des Bestands](neubewertung.md) beginnt nach dem Grundlagen-Merge.

Die [Auswertung der Haben-Arbeitsweise](haben-uebernahme.md) dokumentiert die Herkunft der Regeln und die Entscheidungen für Desk.
