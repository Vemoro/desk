# Entwicklung an Desk

## Auftrag und Arbeitsstand

Prüfe vor einer Änderung [Produktumfang](roadmap.md), Status, Auftrag und erwartetes Ergebnis. Suche nach vorhandenen Lösungen und Abhängigkeiten. Bei einem Fehler belege am relevanten Stand, was aktuell passiert. Bei einer Integration gilt die Version der vorgesehenen Schnittstelle. Halte offene Entscheidungen des Maintainers in Issue oder PR fest.

Arbeite pro Thema auf einem eigenen Branch gegen die passende Git-Basis. Änderungen an `main` kommen über freigegebene Pull Requests. Wenn eine Vorarbeit in einem offenen PR steckt, nenne dessen Nummer, Basis und Head. Fremde Änderungen bleiben geschützt. Bestehende Routen, Daten und Exportformate sind Bestandteil der Abnahme, wenn die Änderung sie berührt.

## Umsetzung

Nutze vorhandene Komponenten und Abläufe, wenn ihr Verhalten passt. Halte Änderungen am Verhalten, passende Tests und die betroffene Nutzerdoku zusammen. Ein reproduzierbarer Bugfix beginnt mit einem Test, der aus dem erwarteten Grund fehlschlägt. Wähle Unit-Tests für Logik, Integrationstests für Datenbank und Schnittstellen und Browserfälle für kritische Bedienabläufe.

Behandle gespeicherte Geldbeträge in ganzen Cent. Prüfe bei Schreibvorgängen Wiederholungen, mögliche Konkurrenz und den Zustand nach einem Fehler. Ergänze beim Ändern der Datenbank eine neue Migration. Bereits angewendete Migrationen bleiben stabil. Änderungen an gespeicherten Daten brauchen eine Probe mit repräsentativem Altbestand und belegtem Wiederanlauf. Für die Oberfläche gelten die [Gestaltungsregeln](../DESIGN.md).

## Issue-Review vor der Planung

Ein umsetzbares Issue erklärt das konkrete Problem, belegt den aktuellen Stand und begründet die Lösungswahl. Die Abnahme nennt beobachtbare Ergebnisse und die Randfälle, die für den betroffenen Ablauf relevant sind. Umfang und Länge richten sich nach der Aufgabe. [Issue schreiben](../.agents/skills/desk-issue-schreiben/SKILL.md)

Ein frischer Agent ohne Entstehungsverlauf prüft die aktuelle Fassung. Plane ein Issue erst mit dem Urteil **Bereit für Geplant** für diese Fassung ein. Der Workflow zur Übernahme kann eine bereits zugewiesene Aufgabe nach „Geplant“ zurückgeben. Prüfe bei der Wiederaufnahme, ob der vorhandene Nachweis noch gilt, und hole fehlende Begründung und Prüfung vor der Fortsetzung nach. Halte am veröffentlichten Issue Urteil, Basis und Befunde fest. Identifiziere die geprüfte Fassung über eine eindeutige Revision oder den Fingerabdruck der Prüfdatei. Wenn sich Ansatz, Umfang oder Abnahme wesentlich ändern, folgt eine neue unabhängige Prüfung. [Issue unabhängig prüfen](../.agents/skills/desk-issue-pruefen/SKILL.md) · [Übernahme und Rückgabe](roadmap.md#issues-übernehmen-und-freigeben)

## Pull Requests

Nutze einen abgegrenzten Titel mit Bereich und betroffenen Issues. `Umgesetzt #…` kennzeichnet die vollständige Umsetzung, `Refs #…` einen Beitrag zu einem Teilumfang. Dokumentiere Ergebnis, Zielbasis, Prüfungen, betroffene Daten und Updatehinweise. Frage bei unklarem Abnahmekriterium nach der fachlichen Entscheidung. Kennzeichne wesentliche KI-Unterstützung im PR und nutze vorhandene Co-Autor-Trailer des Werkzeugs, wenn sie korrekt zuordenbar sind.

Verwende für laufende Arbeit einen Entwurf. Vor der Freigabe zur Prüfung müssen Selbstprüfung, unabhängiges Review und erforderliche CI für den aktuellen Stand vorliegen. Passe die PR-Beschreibung an, wenn sich Umfang oder Prüfnachweis ändern.

## Änderungen prüfen

1. **Selbstprüfung.** Zur Prüfung des eigenen Beitrags gehören Passung zum Umfang, jedes Akzeptanzkriterium, fachliche Quellen, Wiederverwendung und die einfachste tragfähige Umsetzung. Der Bericht nennt Basis, Head, Prüfnachweise und offene Folgen für bestehende Daten, Schnittstellen, Rechte und Updates.
2. **Unabhängiges Review.** Ein anderer Mensch oder ein frischer Agent erhält Issue, Zielbasis, Head, Diff und bei Bedarf den relevanten unveränderten Aufrufkontext. Gib ihm bei agentischem Review weder Entstehungsverlauf noch Selbstbewertung. Code und Markdown brauchen ihre jeweilige Prüfung. Wenn beide betroffen sind, prüft sie je eine unabhängige Person oder ein frischer Agent.
3. **Befunde und Nachprüfung.** Ein Codebefund nennt Datei, beobachtetes Verhalten und einen auf dem geprüften Stand fehlschlagenden Test. Fachliche Annahmen werden mit Quelle und Gegenprobe geprüft. Ist ein belastbarer automatisierter Nachweis technisch nicht möglich, dokumentiere die manuelle Reproduktion und die offene Grenze. Doku-Befunde brauchen eine Stelle und einen Abgleich mit Code, Befehlen oder Primärquelle. Trenne Vorschläge von Befunden. Wiederhole nach einer Änderung die einschlägige Prüfung und ordne sie dem neuen Head zu.
4. **Freigabe.** Der Maintainer entscheidet über Merge und Release. Änderungen an Anmeldung, Berechtigungen, Datenmigrationen, Lagerbuchungen, Kosten und schreibenden Anbindungen brauchen eine gezielte fachliche Prüfung der Folgen und Fehlerfälle. Unsicherheit über den fachlichen Sollzustand wird vor Freigabe entschieden.

### Prüfnachweise im Pull Request

Veröffentliche die **Selbstprüfung** als eigenen Kommentar. Halte darin Passung, Akzeptanzkriterien mit Belegen, fachliche Quellen, Einfachheit, Regelverstöße und offene Entscheidungen fest. Bei agentischer Umsetzung erfolgt diese Prüfung in einer frischen Session ohne Entstehungsverlauf. Für jedes anschließende unabhängige Review erhält eine weitere frische Session oder eine andere Person den Auftrag nach Schritt 2.

Veröffentliche **Unabhängiges Code-Review** und **Unabhängige Doku-Prüfung** jeweils als eigenen Kommentar, auch bei einem Ergebnis ohne Befunde. Nenne in jedem Prüfkommentar Zielbasis, geprüften Head, Umfang, Befunde, gelaufene und ausgelassene Checks mit Grund sowie offene Punkte. Belege einen behobenen Befund mit Fix-Commit und Nachprüfung. Bei einem neuen Head oder einer neuen Zielbasis ergänze den Kommentar mit einem belegten Nachtrag oder einem erneuten Review. Ergebnisse eines frischen Agenten können unter demselben GitHub-Konto erscheinen. Kennzeichne, wer geprüft hat und ob du dessen Bericht zusammenfasst.

Verlinke die Kommentare in der PR-Beschreibung. Prüfe diese Links und den abgedeckten Stand vor „Ready for review“, vor Übergabe auf dem Freigabeboard und vor dem Merge. Fehlt ein erforderlicher Kommentar oder belegt er nur einen älteren Stand, hole die Prüfung und den Nachweis vor dem jeweiligen Schritt nach.

Für die fiktive „Büroinstallation Westflügel“ verbessert ein PR die Projektsuche und passt ihre Anleitung an. Die Tabelle zeigt Auszüge aus den erforderlichen Prüfkommentaren. Die PR-Beschreibung verlinkt jeden dieser Kommentare.

| Kommentar | Beispiel für Code und Doku | Beispiel für einen reinen Doku-PR |
| --- | --- | --- |
| Selbstprüfung | Die Suche findet das Projekt über die Kostenstelle wie im Issue verlangt. | Die Anleitung erklärt den bereits vorhandenen Suchweg. |
| Unabhängiges Code-Review | Der Browserfall findet das Projekt über die Kostenstelle und erhält die übrigen Filter. | Entfällt. |
| Unabhängige Doku-Prüfung | Die Anleitung stimmt mit Feldbeschriftung, Suchverhalten und verlinkter Projektliste überein. | Feldbeschriftung, Schritte und Link stimmen. |

[Habens Selbstprüfung](https://github.com/Speicherstadt/haben/blob/4dd9603df8ecc2f08ac790897b627afe5a0619cd/.claude/skills/beitrag-pruefen/references/selbstpruefung.md) · [Habens Code-Review im PR](https://github.com/Speicherstadt/haben/pull/1945) · [Habens Doku-Prüfung im PR](https://github.com/Speicherstadt/haben/pull/1942)

### Überlappende Änderungen

Prüfe bekannte Überschneidungen zunächst mit Git, etwa mit `git merge-tree --write-tree <Head-A> <Head-B>`. Prüfe das gemeinsame Verhalten in einem getrennten Worktree. Bei einem Wechsel der Zielbasis müssen Diff, Review und CI zum neuen Stand passen. Nenne die tatsächliche Abhängigkeit und die Prüfreihenfolge in der PR-Beschreibung.

## Prüfungen und Dokumentation

Ergebnis, Fehlschläge und Auslassungen mit Grund gehören in den PR. Eine Wiederholung des CI-Laufs braucht einen erkannten Grund. Behebe die Ursache eines Fehlers, erhalte Umfang und Strenge der Prüfungen und wiederhole die betroffene Prüfung.

Der Workflow **Prüfungen** meldet den Check `desk` bei Pull Requests und Pushes auf `main`. **Arbeitsgrundlage** meldet den Check `doku` bei passenden Pfaden im Pull Request und bei Pushes auf `main`. Wird ein Entwurf zur Prüfung freigegeben, gelten dieselben Kriterien wie beim Öffnen eines PRs.

Sobald die manuell startbaren Workflows auf `main` liegen, können Beitragende mit Repository-Schreibzugriff bei fehlendem automatischem Lauf **Actions → Run workflow** verwenden. Wähle den Branch mit dem aktuellen Prüfkandidaten und der manuell startbaren Workflow-Version. Halte den geprüften Commit und den Lauf im PR fest. Der manuelle Doku-Lauf prüft Leerzeichen gegen den direkten Vorgänger. Prüfe bei mehreren Commits den gesamten PR-Diff zusätzlich mit `git diff --check <Zielbranch>...HEAD`. Verwende den aktuellen Remote-Ref des Zielbranches, beispielsweise `origin/main`. Die GitHub-Freigabe für Workflow-Läufe aus Forks gilt auch weiterhin für automatische PR-Läufe.

### Befehle und Screenshot-Workflow

Nutze die Befehle der jeweiligen Zielbasis. Wenn auf dieser Basis die Desk-Anwendung vorhanden ist, gehören je nach Änderung `bun run build`, `bun run check`, `bun run migrate`, `bun run test` und bei betroffener Bedienung `bun run e2e` dazu. Integration und Browser verwenden getrennte PostgreSQL-Datenbanken mit `_test` beziehungsweise `_demo` und isolierte Testinstanzen. Setze für Anmelde- und Browserprüfungen ein eigenes `DESK_AUTH_SECRET` und die Testadresse in `DESK_ORIGIN`.

Neue Browserfälle unter `e2e` mit der Endung `.spec.ts` werden von `bun run e2e` automatisch im Projekt `core` erfasst. `screenshots.spec.ts` und `runtime-image.spec.ts` laufen in ihren eigenen Playwright-Projekten. Bei einem Basiswechsel älterer PRs prüfe die neuen Tests mit `bun x playwright test --list --project core` und übernimm die automatische Auswahl aus `main`.

Die Anwendung erzeugt die TanStack-Routendatei beim ersten Build oder Entwicklungsstart. Für Browserfälle und Doku-Bilder lädt `bun run demo` mit `DESK_DEMO_PASSWORD` die synthetischen Beispieldaten des Muster Auftragsservice. `bunx playwright install chromium` installiert den Browser. Mit `DESK_E2E_URL` kann eine bereits gestartete isolierte Instanz verwendet werden.

`bun run docs:screenshots` schreibt Doku-Bilder nach `build/screenshots/`. In `veranstaltungsbetreuung/` und `bueroinstallation/` liegen pro Musterauftrag `kanban-<theme>.png`, `ressourcenplanung-<theme>.png` und `controlling-<theme>.png`. Die projektübergreifenden Aufnahmen `projektlager-<theme>.png`, `projektlager-<theme>-handy.png` und `navigation-<theme>-handy-offen.png` liegen direkt im Ausgabeordner. `<theme>` steht für `hell` oder `dunkel`.

Der manuell startbare Workflow „Doku-Screenshots erstellen“ stellt die Bilder mit derselben Verzeichnisstruktur als Artefakt bereit. Änderungen am Workflow oder Screenshot-Test lösen ihn im PR aus. Übernimm ausgewählte Bilder nach Sichtprüfung mit Alternativtext in die Doku.

`bash scripts/check-runtime-image.sh` prüft das Docker-Laufzeitimage mit einer eigenen PostgreSQL-Datenbank und synthetischen Daten. Lokal brauchst du Git, Bash, Docker, OpenSSL, curl, die in `package.json` angegebene Bun-Version sowie `bun install --frozen-lockfile` und `bunx playwright install chromium`. Die Probe baut aus einem Git-Archiv des ausgecheckten Commits, migriert im Runtime-Image und prüft nach der Kontoanlage Bereitschaft, Browseranmeldung, Projektliste und Desk-Version. Bei Abschluss oder Abbruch entfernt sie den Teststack. Mit `DESK_RUNTIME_TEST_PORT` lässt sich der voreingestellte lokale Port 4180 ändern. Ein über `DESK_RUNTIME_IMAGE` vorgegebenes Image muss für einen erfolgreichen Lauf den aktuellen Commit als Build-Angabe enthalten.

Auf einem Stand mit Entwicklungsdoku allein prüfe die geänderten Regeln, Verweise, Skills und Beispiele. Halte dort offen fest, welche Anwendungstests mangels Anwendung auf dieser Zielbasis nicht laufen. Für Screenshots und Beispiele nutze fiktive oder anonymisierte Angaben. Zugangsdaten und personenbezogene Daten bleiben aus Repository, Issues, Prompts und Logs heraus.

Doku, Oberfläche und Beiträge werden auf Deutsch geschrieben, Code-Bezeichner auf Englisch. Eine Regel steht an einer maßgeblichen Stelle. Der Skill verweist dorthin und beschreibt den Ablauf. Vorher-Nachher-Bilder nutzen vollständige Git-Stände, gleiche Daten und Viewports sowie Hell, Dunkel und bei betroffener Bedienung Smartphone. Der [Screenshot-Skill](../.agents/skills/desk-pr-screenshots/SKILL.md) beschreibt Aufnahme und Veröffentlichung.

### Projektliste für einen PR vergleichen

Starte die beiden zu prüfenden Git-Stände auf unterschiedlichen lokalen Ports. Verwende je Instanz eine eigene, frisch angelegte PostgreSQL-Datenbank mit Suffix `_demo`. Führe je Instanz `bun run migrate` und `bun run demo` mit demselben `DESK_DEMO_PASSWORD` aus. Setze die zum Port passende `DESK_ORIGIN` und lasse echte Integrationen aus. Verwende direkte Loopback-Adressen. Der Aufruf folgt keinen Weiterleitungen.

Führe den Vergleich im Checkout aus, der `review:screenshots` enthält. Verwende dort installiertes Playwright-Chromium und dasselbe `DESK_DEMO_PASSWORD` wie für die Demo-Datenbanken.

```sh
bun run review:screenshots http://localhost:4193 http://localhost:4194
bun run review:screenshots --nur-nachher http://localhost:4194
```

Der Vergleich erzeugt acht Bilder der Projektliste mit fester Uhrzeit auf Desktop und Smartphone in Hell und Dunkel. Bei `--nur-nachher` reicht eine Instanz. Der Aufruf erzeugt vier Nachher-Bilder. Das Terminal nennt den neuen Ausgabeordner unter `build/screenshots/`. Verlinke die gesichteten Bildpaare im PR. Bei einer neuen Ansicht vermerke den fehlenden Ausgangsstand. [PR-Screenshot-Workflow](../.agents/skills/desk-pr-screenshots/SKILL.md)

## Entwicklungsrunden für Agenten

Beginne mit dem höchsten belegten Nutzen für Desk. Prüfe vorhandene Issues, PRs und Abhängigkeiten, bevor du neue Arbeit anlegst. Bearbeite ein passendes bestehendes Issue weiter. Lege ein neues Issue an, wenn ein konkreter Bedarf einen eigenen Umfang und prüfbare Abnahmekriterien hat. Ein Umfang kann einen einzelnen PR oder mehrere fachlich begründete PRs brauchen.

Wende für neue und wiederaufgenommene Aufgaben das [Issue-Review](#issue-review-vor-der-planung) an. Ein PR ist nach Selbstprüfung, unabhängigem Review und grüner erforderlicher CI auf seinem aktuellen Stand prüfbereit. Bei betroffener Oberfläche gehören Vergleichsbilder zur Abnahme.

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
