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

Nutze die Befehle der jeweiligen Zielbasis. Wenn auf dieser Basis die Desk-Anwendung vorhanden ist, gehören je nach Änderung `bun run build`, `bun run check`, `bun run migrate`, `bun run test` und bei betroffener Bedienung `bun run e2e` dazu. Integration und Browser verwenden getrennte PostgreSQL-Datenbanken mit `_test` beziehungsweise `_demo` und isolierte Testinstanzen. Setze für Anmelde- und Browserprüfungen ein eigenes `DESK_AUTH_SECRET` und die Testadresse in `DESK_ORIGIN`.

Die Anwendung erzeugt die TanStack-Routendatei beim ersten Build oder Entwicklungsstart. Für Browserfälle und Doku-Bilder lädt `bun run demo` mit `DESK_DEMO_PASSWORD` die synthetischen Beispieldaten des Muster Auftragsservice. `bunx playwright install chromium` installiert den Browser. Mit `DESK_E2E_URL` kann eine bereits gestartete isolierte Instanz verwendet werden.

`bun run docs:screenshots` schreibt Doku-Bilder nach `build/screenshots/`. Der manuell startbare Workflow „Doku-Screenshots erstellen“ stellt die Bilder als Artefakt bereit. Übernimm ausgewählte Bilder nach Sichtprüfung mit Alternativtext in die Doku.

Auf einem Stand mit Entwicklungsdoku allein prüfe die geänderten Regeln, Verweise, Skills und Beispiele. Halte dort offen fest, welche Anwendungstests mangels Anwendung auf dieser Zielbasis nicht laufen. Für Screenshots und Beispiele nutze fiktive oder anonymisierte Angaben. Zugangsdaten und personenbezogene Daten bleiben aus Repository, Issues, Prompts und Logs heraus.

Doku, Oberfläche und Beiträge werden auf Deutsch geschrieben, Code-Bezeichner auf Englisch. Eine Regel steht an einer maßgeblichen Stelle. Der Skill verweist dorthin und beschreibt den Ablauf. Vorher-Nachher-Bilder nutzen vollständige Git-Stände, gleiche Daten und Viewports sowie Hell, Dunkel und bei betroffener Bedienung Smartphone. Der [Screenshot-Skill](../.agents/skills/desk-pr-screenshots/SKILL.md) beschreibt Aufnahme und Veröffentlichung.

## Entwicklungsrunden für Agenten

Beginne mit dem höchsten belegten Nutzen für Desk. Prüfe vorhandene Issues, PRs und Abhängigkeiten, bevor du neue Arbeit anlegst. Bearbeite ein passendes bestehendes Issue weiter. Lege ein neues Issue an, wenn ein konkreter Bedarf einen eigenen Umfang und prüfbare Abnahmekriterien hat. Ein Umfang kann einen einzelnen PR oder mehrere fachlich begründete PRs brauchen.

Lass die aktuelle Fassung eines Issues vor dem Einordnen unter „Geplant“ durch einen frischen Agenten auf Bestand, Abgrenzung, Abhängigkeiten und Akzeptanz prüfen. Übergib Issue, Zielbasis und Prüfauftrag ohne den Entstehungsverlauf. Nach wesentlichen Änderungen folgt eine neue Prüfung. Ein PR ist nach Selbstprüfung, unabhängigem Review und grüner erforderlicher CI auf seinem aktuellen Stand prüfbereit. Bei betroffener Oberfläche gehören Vergleichsbilder zur Abnahme.

Die bisherige Viererfolge samt Startwert ist eine Orientierung für die Planung. Passe Aufgaben und Umfang an Priorität, Risiken, Abhängigkeiten und verfügbare Zeit für Tests und Reviews an. Kann ein geprüftes Issue sinnvoll umgesetzt werden, starte den PR direkt im vereinbarten Auftrag. Leert sich die umsetzbare Warteschlange, prüfe den Bestand und fülle sie mit geeigneten Aufgaben auf.

| Planungssituation | Richtwert für geprüfte Issues | Richtwert für prüfbereite PRs |
| --- | ---: | ---: |
| Start oder leere Warteschlange | 10 | 1 |
| Folgerunde 1 | 5 zusätzliche | 1 |
| Folgerunde 2 | 3 zusätzliche | 2 |
| Folgerunde 3 | 2 zusätzliche | 3 |
| Folgerunde 4 | 1 zusätzliches | 5 |

Halte nach abgeschlossenen PRs und bei einer Neuplanung kurz fest, was der Nutzer jetzt tun kann, welche Nachweise vorliegen, welche Abhängigkeiten und Entscheidungen offen sind und welcher Schritt als Nächstes sinnvoll ist. Nutze Board-Zahlen bei Bedarf, um die Warteschlange einzuschätzen. Halte sinnvolle Verbesserungen der Agenten-Doku fest. Für die einmalige [Neubewertung des Bestands](neubewertung.md) gelten die dort beschriebenen Regeln.

Die [Auswertung der Haben-Arbeitsweise](haben-uebernahme.md) dokumentiert die Herkunft der Regeln und die Entscheidungen für Desk.
