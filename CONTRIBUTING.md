# An Desk mitwirken

Du kannst Abläufe mit Beispieldaten testen, Fehler melden, die Doku verbessern oder an einer Funktion mitarbeiten. Desk ist derzeit ein privates Repository. Mit Repository-Zugriff kannst du Issues melden. Für einen Branch oder PR gelten die vorhandenen GitHub-Berechtigungen.

## Fehler und Vorschläge

Prüfe die [vorhandenen Issues](https://github.com/Vemoro/desk/issues) und die [Desk Roadmap](https://github.com/orgs/Vemoro/projects/2). Ergänze eine neue Beobachtung im bestehenden Issue, wenn sie dieselbe Aufgabe betrifft. Über die [Issue-Auswahl](https://github.com/Vemoro/desk/issues/new/choose) findest du Formulare für Fehler und Verbesserungsvorschläge.

Bei einem Fehler helfen der geprüfte Stand, reproduzierbare Schritte sowie erwartetes und beobachtetes Verhalten. Bei einem Vorschlag beschreibe, wer die Änderung braucht, welchen Ablauf sie verbessert und woran sich das Ergebnis prüfen lässt. Beispiele und Screenshots verwenden synthetische oder anonymisierte Angaben. Melde vertrauliche Informationen über einen vom Maintainer bestätigten privaten Weg.

### Beispiel für einen Fehlerbericht

Der fiktive Bericht „Kommunikationsnotiz fehlt nach dem Neuladen“ lässt sich mit einer lokalen Demo ohne Zammad prüfen:

1. Getesteten Commit notieren und das Musterprojekt „Büroinstallation Westflügel“ öffnen.
2. Unter **Kommunikation** die **Kommunikationsnotiz** „Musterübergabe am Dienstag“ eintragen und **Verweis speichern** wählen.
3. Die Seite neu laden und **Kommunikation** erneut öffnen. Im Formular für Fehlerberichte als Erwartung festhalten, dass die Notiz sichtbar bleibt. Als Beobachtung eintragen, was tatsächlich zu sehen ist.

[Lokale Demo und Beispieldaten](docs/entwicklung.md#befehle-und-screenshot-workflow)

## Beiträge vorbereiten

1. Kläre bei einer freien Aufgabe aus „Geplant“ mit dem Maintainer, welchen Teil du übernehmen willst. Schreibe Rückmeldungen zur Sache und belege sie mit dem betroffenen Stand oder der einschlägigen Regel.
2. Arbeite auf einem eigenen Branch und führe die passenden Prüfungen mit synthetischen Daten aus. Bei Änderungen an der Oberfläche gehören vergleichbare Vorher- und Nachher-Bilder zum PR. [Prüfbefehle und Screenshot-Workflow](docs/entwicklung.md#befehle-und-screenshot-workflow)
3. Nutze die PR-Vorlage für Ergebnis, Issue, Prüfnachweise und Updatehinweise. Kennzeichne wesentliche KI-Unterstützung. Die Entwicklungsdoku beschreibt den Ablauf für Entwurf, Selbstprüfung, unabhängiges Review, CI und Freigabe. [Pull Requests](docs/entwicklung.md#pull-requests) · [Review und Freigabe](docs/entwicklung.md#änderungen-prüfen)

Für den Einsatz von Coding-Agenten gilt [AGENTS.md](AGENTS.md).
