# An Desk mitwirken

Auch ohne Programmierkenntnisse kannst du mitwirken. Du kannst Fehler melden, die Doku verbessern oder einen Ablauf mit den Beispieldaten testen und deine Beobachtungen teilen.

Dieses Repository ist derzeit privat. Mit Repository-Zugriff kannst du Fehler und Vorschläge als GitHub-Issue erfassen. Um einen Pull Request einzureichen, brauchst du Schreibzugriff für deinen Branch. Die Regeln für Entwicklungsarbeit, Prüfung und Freigabe stehen in der [Entwicklungsdoku](docs/entwicklung.md).

## Fehler und Vorschläge melden

Sieh vor einem neuen Issue in den [offenen Issues](https://github.com/Vemoro/desk/issues) nach, ob das Thema bereits erfasst ist. Wenn du Zugriff auf die [Desk Roadmap](https://github.com/orgs/Vemoro/projects/2) hast, prüfe auch das Board. Ergänze neue Beobachtungen im bestehenden Issue.

- **Fehlerbericht:** Nenne den getesteten Stand, die Schritte zur Reproduktion sowie das erwartete und beobachtete Verhalten. Wenn es für den Fehler wichtig ist, ergänze Browser, Bildschirmgröße oder Fehlermeldung.
- **Vorschlag:** Beschreibe, wer die Funktion braucht, welchen Ablauf sie verbessert und woran sich das Ergebnis prüfen lässt. Bei mehreren Anliegen helfen getrennte Issues.
- Verwende fiktive oder anonymisierte Beispiele. Entferne Zugangsdaten und personenbezogene Details aus Beschreibungen, Logs und Screenshots.

Ein fiktiver Fehlerbericht könnte zum Beispiel „Kommunikationsnotiz fehlt nach Neuladen“ heißen. Zur Reproduktion öffnet die Testperson im Musterprojekt „Kommunikation“, trägt im Feld „Kommunikationsnotiz“ eine kurze Notiz ein und klickt auf „Verweis speichern“. Danach lädt sie die Seite neu, öffnet erneut „Kommunikation“ und prüft, ob die Notiz sichtbar ist.

## Eine Aufgabe übernehmen

Wenn du Zugriff auf die [Desk Roadmap](https://github.com/orgs/Vemoro/projects/2) hast, wähle dort eine freie Aufgabe aus „Geplant“. Über die [offenen Issues](https://github.com/Vemoro/desk/issues) kannst du auch direkt bei einer Aufgabe nachfragen, ob sie noch frei ist. Schreib im Issue kurz, welchen Teil du bearbeiten möchtest, und kläre offene Fragen zum Umfang und zur Abnahme.

## Einen Pull Request vorbereiten

1. Kläre das Ziel und die Abnahme im zugehörigen Issue. Arbeite auf einem eigenen Branch und halte Änderung, Tests und betroffene Doku zusammen.
2. Nutze die zur Änderung passenden lokalen Prüfungen und notiere das Ergebnis im PR. Führe Integrations- und Browser-Tests in einer getrennten Testinstanz mit synthetischen Daten aus. [Prüfbefehle und Beispieldaten](docs/entwicklung.md#befehle-und-screenshot-workflow)
3. Zeige bei UI-Änderungen dieselbe Ansicht vor und nach dem Eingriff. Verwende gleiche Beispieldaten und Viewports. Desktop braucht Hell und Dunkel. Wenn die mobile Bedienung betroffen ist, kommen Smartphone-Bilder hinzu. Bei einer neuen Ansicht zeigst du den Nachher-Stand und vermerkst, dass es kein Vorher-Bild gibt. [Screenshot-Workflow](docs/entwicklung.md#befehle-und-screenshot-workflow)
4. Nenne im PR Ergebnis, Issue, Prüfstatus und Hinweise zum Update. Kennzeichne wesentliche KI-Unterstützung. Selbstprüfung, unabhängiges Review und die Freigabe des Maintainers richten sich nach den vorhandenen Projektregeln. [Review und Freigabe](docs/entwicklung.md#änderungen-prüfen)

Für Beiträge mit Coding-Agenten gelten die vorhandenen Hinweise. [AGENTS.md](AGENTS.md) · [Entwicklungsdoku](docs/entwicklung.md)
