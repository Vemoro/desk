# Entwicklung an Desk

## Aufgabe festlegen

Jede Umsetzung hat ein konkretes Ziel, einen abgegrenzten Umfang und prüfbare Akzeptanzkriterien. Beschreibe bei einem Fehler Ist-Zustand, erwartetes Verhalten und Reproduktion. Prüfe das aktuelle Verhalten im Code und in der Doku. Stütze Aussagen über Haben auf die aktuelle API-Beschreibung oder den Quellcode der relevanten Version.

Der Maintainer entscheidet, welche Funktionen zu Desk gehören und welche fachlichen Fragen vor dem Bauen geklärt werden müssen. Halte solche Entscheidungen mit ihrem Grund fest.

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
