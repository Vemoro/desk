# An Desk mitwirken

Dieses Repository ist derzeit privat. Wer Zugriff hat, kann Fehler und Vorschläge als GitHub-Issue erfassen und Änderungen als Pull Request einreichen. Die Regeln für Entwicklungsarbeit, Prüfung und Freigabe stehen in der [Entwicklungsdoku](docs/entwicklung.md).

## Fehler und Vorschläge melden

- **Fehlerbericht:** Nenne den getesteten Stand, die Schritte zur Reproduktion sowie das erwartete und beobachtete Verhalten. Wenn es für den Fehler wichtig ist, ergänze Browser, Bildschirmgröße oder Fehlermeldung.
- **Vorschlag:** Beschreibe, wer die Funktion braucht, welchen Ablauf sie verbessert und woran sich das Ergebnis prüfen lässt. Bei mehreren Anliegen helfen getrennte Issues.
- Verwende fiktive oder anonymisierte Beispiele. Entferne Zugangsdaten und personenbezogene Details aus Beschreibungen, Logs und Screenshots.

Ein fiktiver Fehlerbericht könnte zum Beispiel „Kommunikationsnotiz fehlt nach Neuladen“ heißen. Als Reproduktion öffnet die Testperson im Musterprojekt den Bereich Kommunikation, speichert eine kurze Notiz und lädt die Seite neu. Im Bericht steht, ob die Notiz danach sichtbar ist und was stattdessen zu sehen war.

## Einen Pull Request vorbereiten

1. Kläre das Ziel und die Abnahme im zugehörigen Issue. Arbeite auf einem eigenen Branch und halte Änderung, Tests und betroffene Doku zusammen.
2. Nutze die zur Änderung passenden lokalen Prüfungen und notiere das Ergebnis im PR. Führe Integrations- und Browser-Tests in einer getrennten Testinstanz mit synthetischen Daten aus. [Prüfbefehle und Beispieldaten](docs/entwicklung.md#befehle-und-screenshot-workflow)
3. Zeige bei UI-Änderungen dieselbe Ansicht vor und nach dem Eingriff. Verwende gleiche Beispieldaten und Viewports. Desktop braucht Hell und Dunkel. Wenn die mobile Bedienung betroffen ist, kommen Smartphone-Bilder hinzu. [Screenshot-Workflow](docs/entwicklung.md#befehle-und-screenshot-workflow)
4. Nenne im PR Ergebnis, Issue, Prüfstatus und Hinweise zum Update. Kennzeichne wesentliche KI-Unterstützung. Selbstprüfung, unabhängiges Review und die Freigabe des Maintainers richten sich nach den vorhandenen Projektregeln. [Review und Freigabe](docs/entwicklung.md#änderungen-prüfen)

Für Beiträge mit Coding-Agenten gelten die vorhandenen Hinweise. [AGENTS.md](AGENTS.md) · [Entwicklungsdoku](docs/entwicklung.md)
