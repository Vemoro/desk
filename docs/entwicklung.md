# Entwicklung an Desk

## Aufgabe festlegen

Jede Umsetzung hat ein konkretes Ziel, einen abgegrenzten Umfang und prüfbare Akzeptanzkriterien. Beschreibe bei einem Fehler Ist-Zustand, erwartetes Verhalten und Reproduktion. Prüfe das aktuelle Verhalten im Code und in der Doku. Stütze Aussagen über Haben auf die aktuelle API-Beschreibung oder den Quellcode der relevanten Version.

Der Maintainer entscheidet, welche Funktionen zu Desk gehören und welche fachlichen Fragen vor dem Bauen geklärt werden müssen. Halte solche Entscheidungen mit ihrem Grund fest.

## Entwicklungsrunden für Agenten

Nutze diesen Takt, wenn der Maintainer fortlaufende Desk-Entwicklung beauftragt hat. Leite Ideen aus Nutzung, Roadmap, Code und Tests ab. Prüfe vorhandene Issues auf Überschneidungen und halte offene fachliche Entscheidungen fest.

| Runde | Geprüfte Issues in Geplant | PRs zur Freigabe bereit |
| --- | ---: | ---: |
| Start oder Neustart | auf 10 auffüllen | 1 |
| Regelrunde 1 | 5 zusätzliche | 1 |
| Regelrunde 2 | 3 zusätzliche | 2 |
| Regelrunde 3 | 2 zusätzliche | 3 |
| Regelrunde 4 | 1 zusätzliches | 5 |

Nach Regelrunde 4 folgt wieder Regelrunde 1. Wenn die Warteschlange keine umsetzbaren Aufgaben mehr enthält, beginne erneut mit dem Starttakt. Prüfe dafür Abhängigkeiten, fachliche Entscheidungen und bereits laufende Arbeiten. Aufgaben, die eine Änderung in einem anderen Projekt brauchen, gehören in „Externe integrationen“.

1. Schreibe pro Idee ein abgegrenztes Issue mit Ziel, beobachtetem Stand, Umfang, Abhängigkeiten und prüfbaren Akzeptanzkriterien. Verlinke vorhandene Aufgaben und bei Bedarf relevante Stellen in Code oder Doku.
2. Gib einem frischen Agenten das Issue, die Zielbasis und den Prüfauftrag ohne den Entstehungsverlauf. Er prüft Ist-Zustand, Abgrenzung, Abhängigkeiten und Akzeptanzkriterien und nennt Befunde mit Belegen. Arbeite die Befunde ein und lass wesentliche fachliche Änderungen erneut prüfen. Das Issue zählt, sobald seine geprüfte Fassung auf dem Board in „Geplant“ steht.
3. Beginne die PRs der Runde, sobald ihr Issue-Soll erfüllt ist. Ein PR zählt nach Selbstprüfung, unabhängigem Review und grünen CI-Prüfungen auf dem aktuellen Stand. Bei betroffener Oberfläche gehören die Bildschirmfotos in den PR. Stelle ihn danach zur Freigabe bereit. Merge und Release folgen der Freigabe durch den Maintainer.

Halte nach jedem PR und am Rundenende kurz fest, in welcher Runde du bist, wie viele Issues und PRs zum Soll zählen und welche Links dazugehören. Erfasse offene Entscheidungen, externe Abhängigkeiten, die nächste umsetzbare Priorität und mögliche Verbesserungen der Agenten-Doku. So lässt sich der Ablauf nach einem Kontextwechsel beim richtigen Schritt fortsetzen.

## Änderungen umsetzen

Arbeite pro Thema auf einem eigenen Branch. Nutze vorhandene Funktionen, wenn ihr Verhalten passt. Behandle Verhalten, Tests und betroffene Nutzerdoku im selben Pull Request. Die PR-Beschreibung nennt Ergebnis, Bezug zur Aufgabe, Prüfungen und Hinweise für ein Update. Kennzeichne wesentliche KI-Unterstützung im Pull Request.

Ein reproduzierbarer Bugfix beginnt mit einem Test, der aus dem erwarteten Grund fehlschlägt. Danach folgt der Fix. Bei neuen Funktionen prüfen Tests das vereinbarte Verhalten. Wähle die kleinste aussagekräftige Ebene: Logik als Unit-Test, Persistenz und Schnittstellen als Integrationstest, kritische Bedienabläufe über die Oberfläche. Änderungen an bestehenden Daten brauchen eine überprüfbare Migration und einen repräsentativen Altbestand als Testfall.

## Änderungen prüfen

1. **Selbstprüfung.** Vor der Review-Freigabe gleicht der Autor den Diff mit Auftrag, Akzeptanzkriterien und Quellen ab. Er prüft, ob es eine einfachere Lösung gibt und ob sich bestehende Daten oder Schnittstellen wie vorgesehen verhalten.
2. **Unabhängiges Review.** Ein anderer Mensch oder ein frischer Agent erhält den Auftrag, die Akzeptanzkriterien und den Diff gegen die Zielbasis. Bei agentischem Review fehlt der Verlauf der Umsetzung und die Bewertung des Autors. Ein Befund zum Programmverhalten nennt Datei, Test und beobachtete Abweichung. Der Test muss auf dem geprüften Stand fehlschlagen. Doku-Befunde belegen die Abweichung anhand des Codes oder einer Quelle. Fachliche Annahmen mit unklarer Grundlage werden als offene Entscheidung kenntlich gemacht.
3. **Freigabe.** Prüfungen und Review beziehen sich auf den Stand, der gemergt werden soll. Der Maintainer entscheidet über Merge und Release. Für Änderungen an Berechtigungen, Migrationen bestehender Daten und Schreibzugriffen auf Haben prüft er zusätzlich die vorgesehenen Auswirkungen und den Umgang mit Fehlerfällen.

## Prüfungen und Dokumentation

Verwende lokal und in der CI dieselben dokumentierten Prüfkommandos. Notiere im Pull Request, was erfolgreich war, was fehlschlug und was mit welchem Grund ausgelassen wurde. Integrationstests laufen mit eigener Datenbank und Testinstanz. Beispiele, Logs und Screenshots verwenden synthetische oder anonymisierte Daten. Zugangsdaten bleiben aus Repository, Issues, Prompts und Logs heraus.

Nutze Deutsch für Doku, Oberfläche und Beiträge im Repository, Englisch für Bezeichner im Code. Eine Regel hat eine maßgebliche Stelle. Agenten-Einstiege verlinken dorthin. Sobald sich ein Ablauf wiederholt, kann ein Skill die Schritte, Eingaben und erwarteten Ergebnisse festhalten. Dokumentiere Befehle, sobald sie im Repo ausführbar sind.

Die Regeln orientieren sich an [Habens Agentic Engineering](https://haben.app/agentic-engineering.html), [Entwicklungsdokumentation](https://haben.app/entwicklung.html) und [Beitragsregeln](https://haben.app/mitwirken.html).

## Befehle und Screenshot-Workflow

- `bun run build` baut den Dienst. `bun run check` prüft die TypeScript-Typen. Die TanStack-Routendatei entsteht beim ersten Build oder Entwicklungsstart.
- `bun run migrate` richtet die konfigurierte PostgreSQL-Datenbank ein. `bun run test` benötigt eine getrennte Datenbank mit dem Suffix `_test`.
- `bun run demo` benötigt eine getrennte Datenbank mit dem Suffix `_demo` und `DESK_DEMO_PASSWORD`. Die Beispieldaten gehören zum fiktiven Muster Auftragsservice. `bunx playwright install chromium` installiert den Browser. Danach laufen `bun run e2e` und `bun run docs:screenshots` gegen die Demo-Datenbank. `DESK_E2E_URL` kann eine bereits gestartete Testinstanz angeben.
- Bei UI-Änderungen die betroffene Ansicht vor der Änderung aufnehmen. Danach dieselben Daten, dieselbe Ansicht und dieselbe Größe verwenden. Desktop in Hell und Dunkel aufnehmen. Bei betroffener mobiler Bedienung zusätzlich Smartphone. Im Pull Request Vorher und Nachher gegenüberstellen. Bei einer neuen Ansicht den Nachher-Stand zeigen und den fehlenden Ausgangsstand kennzeichnen.
- `bun run docs:screenshots` erzeugt die Doku-Bilder unter `build/screenshots/`. Der manuell startbare Workflow „Doku-Screenshots erstellen“ stellt das gleiche Ergebnis als Artefakt bereit. Gewählte Bilder nach Sichtprüfung und mit Alternativtext in README oder Doku übernehmen.

Desk verwendet Blau für Navigation, Fokus, Primäraktionen und hervorgehobene Status. Die Regel gilt für Hell- und Dunkelmodus. Grün ist der Oberfläche von Haben vorbehalten.
