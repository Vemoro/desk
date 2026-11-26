# Arbeitsweise von Haben für Desk

Verglichen wurden Haben auf `daff6cdf5b28f24f229b4fa7f2ed1c678d961a65` und Desk auf `8baa3e024b0bf196c613510afc11755e10ab8ab4`. Auf Desks Standardbranch lagen zu diesem Zeitpunkt die ersten Entwicklungsregeln und der Agenten-Einstieg. Weiterführende Doku und Skills waren auf offenen Branches verteilt. Diese Auswertung bündelt die geeigneten Regeln als Grundlage für den ersten Merge. [Haben-Stand](https://github.com/Speicherstadt/haben/tree/daff6cdf5b28f24f229b4fa7f2ed1c678d961a65) · [Desk-Ausgangsstand](https://github.com/Vemoro/desk/tree/8baa3e024b0bf196c613510afc11755e10ab8ab4)

## Agenten-Einstiege und Projektdoku

| Haben | Entscheidung für Desk |
| --- | --- |
| `AGENTS.md` und `CLAUDE.md` | Kurze Einstiege mit denselben Regeln für Menschen und Agenten. Desk verweist von beiden Einstiegen auf die projektnativen Skills unter `.agents/skills/`. |
| `docs/entwicklung.md`, `docs/mitwirken.md`, `docs/agentic-engineering.md` | Eine maßgebliche Desk-Entwicklungsdoku und ein Beitragsleitfaden. Übernommen werden klarer Auftrag, Quellenabgleich, isolierte Prüfung, Selbstprüfung, frisches Review und Freigabe durch den Maintainer. Der beim Grundlagen-Merge vereinbarte Rundentakt diente als Ausgangspunkt. Die [Entwicklungsregeln](entwicklung.md#entwicklungsrunden-für-agenten) beschreiben die aktuelle Planung. |
| `docs/roadmap.md` und Board-Referenzen | Produktgrenzen und echte Desk-Board-Status dokumentieren. Desk führt „Externe integrationen“ und priorisiert den gemeinsamen Kern für unterschiedliche Einsatzbereiche. |
| `DESIGN.md` | Konsistente Icons, verständliche Zustände, Tastaturführung, sichere Rückfragen und Vergleichsbilder sind passend. Desk bleibt blau und hält mobile Navigation als eigenes Abnahmekriterium fest. Habens Komponentenpfade, Maße und Belegeditor-Regeln sind produktspezifisch. |
| `ACCESSIBILITY.md` | Beschriftung, Tastaturfokus, Kontrast und Verständlichkeit ohne Farbe sind für Desk relevant und stehen in `DESIGN.md`. Aussagen zur Konformität brauchen eine eigene Desk-Abnahme. |
| `README.md` und Nutzerhandbuch | Beitragseinstieg und technische Regeln bleiben getrennt. Die Produktdarstellung und reproduzierbare Doku-Bilder liegen in [PR Nr. 183](https://github.com/Vemoro/desk/commit/47dc7cddbe41e1e9d4a589f3586c29ff19ff415c) und [PR Nr. 195](https://github.com/Vemoro/desk/commit/d0936ec7417b3bc9c8a1e06898fa039da5430718) zur Prüfung. |
| Architektur, Module, Migrationen und fachliche Konventionen | Reproduzierbare Migrationen, Isolation, verlässliche Daten und Schnittstellen sowie Cent-Beträge sind passend. Desk verwendet eigene API-, Buchungs- und Projektkonventionen. GoBD-Siegel, Drizzle-Generatoren, ELSTER und unveränderte Haben-Paketgrenzen setzen eine andere Anwendung voraus. |
| `CODE_OF_CONDUCT.md`, `SECURITY.md`, `LICENSE`, `NOTICE` | Das sachliche, belegte Review steht im Beitragsleitfaden. Meldekanal und Umgang mit vertraulichen Sicherheitsmeldungen bleiben Entscheidungen für [Issue #54](https://github.com/Vemoro/desk/issues/54). Lizenz, Herkunft und erforderliche Zuschreibungen für übernommenen Code, Bilder oder Text werden in [Issue #50](https://github.com/Vemoro/desk/issues/50) geprüft. Eine öffentliche Beschwerdestelle braucht bestätigte Zuständigkeit. |

[Agenten-Einstieg](https://github.com/Speicherstadt/haben/blob/daff6cdf5b28f24f229b4fa7f2ed1c678d961a65/AGENTS.md) · [Claude-Einstieg](https://github.com/Speicherstadt/haben/blob/daff6cdf5b28f24f229b4fa7f2ed1c678d961a65/CLAUDE.md) · [Habens Beitragsregeln](https://haben.app/mitwirken.html) · [Habens Entwicklung](https://haben.app/entwicklung.html) · [Habens Agentic Engineering](https://haben.app/agentic-engineering.html) · [Habens Gestaltung](https://github.com/Speicherstadt/haben/blob/daff6cdf5b28f24f229b4fa7f2ed1c678d961a65/DESIGN.md)

[Habens Barrierefreiheitsregeln](https://github.com/Speicherstadt/haben/blob/daff6cdf5b28f24f229b4fa7f2ed1c678d961a65/ACCESSIBILITY.md) · [Habens Zuschreibungshinweise](https://github.com/Speicherstadt/haben/blob/daff6cdf5b28f24f229b4fa7f2ed1c678d961a65/NOTICE)

## Alle 14 Haben-Skills

| Haben-Skill | Entscheidung |
| --- | --- |
| `issue-schreiben` | [Desk-Issue-Skill](../.agents/skills/desk-issue-schreiben/SKILL.md) mit Ist-Stand, Dublettensuche, Abnahme und frischem Review. |
| `board-pflegen` | [Desk-Board-Skill](../.agents/skills/desk-board-pflegen/SKILL.md) für belegte Einordnung, externe Abhängigkeiten und Checkups. |
| `beitrag` | [Desk-Beitragsskill](../.agents/skills/desk-beitrag/SKILL.md) für Branch, Entwurf, Beschreibung und Freigabe. Die tatsächliche Zielbasis eines gestapelten PRs ist Teil der Abnahme. |
| `beitrag-pruefen` | [Desk-Beitragsprüfung](../.agents/skills/desk-beitrag-pruefen/SKILL.md) für Passung, fachliche Grundlage, Umsetzung und Regeln. Die Entscheidung über Umfang und Merge liegt beim Maintainer. |
| `checks` | [Desk-Prüf-Skill](../.agents/skills/desk-checks/SKILL.md) mit den Befehlen des jeweiligen Zielstands, getrennter Datenbank und dokumentierten Auslassungen. |
| `tdd-review` | [Desk-Code-Review](../.agents/skills/desk-tdd-review/SKILL.md) mit frischem Prüfer und reproduzierbarem Befund gegen den PR-Head. |
| `doku-pruefen` | [Desk-Doku-Review](../.agents/skills/desk-doku-pruefen/SKILL.md) mit eigenem Quellenabgleich, Linkprüfung und eindeutigem Ort je Regel. |
| `pr-screenshots` | [Desk-Screenshot-Skill](../.agents/skills/desk-pr-screenshots/SKILL.md) für die genaue Basis sowie Vergleichsbilder nach Theme und Gerät. Habens öffentliches Bilder-Repository bleibt Habens Infrastruktur. |
| `prs-abarbeiten` | [Desk-PR-Prüfung](../.agents/skills/desk-prs-pruefen/SKILL.md) für eine belegte Reihenfolge und getrennte Bewertung. Keine automatische Merge-Freigabe durch die Sortierung. |
| `release` | Freigabe durch den Maintainer und genau geprüfter Stand gelten jetzt. Ein ausführender Release-Skill setzt einen beschlossenen Veröffentlichungsweg, [Release-Notizen #55](https://github.com/Vemoro/desk/issues/55) und die [Release-Abnahme #65](https://github.com/Vemoro/desk/issues/65) voraus. |
| `fork-pushen` | Bei einem späteren externen Beitragsweg erneut prüfen. Habens Cloud-Fork-Workaround passt nicht zum derzeit privaten Desk-Ablauf. |
| `belegvorlage` | Typst, PDF/A, E-Rechnungen und Habens Feldvertrag betreffen Belege in Haben. Desk übergibt Projekt- und Angebotsdaten über die vereinbarte Schnittstelle. |
| `jahreswerte` | Amtliche Werte für Lohn, Steuern, Kontenrahmen und ERiC bleiben in Haben. Das Prinzip der belegten Primärquelle gilt auch für Desk. |
| `schnellsuche-erweitern` | Habens Befehlspalette und ihre Buchhaltungs-Suchgruppen haben in Desk keine entsprechende Implementierungsbasis. Rechteprüfung und Suchtests bleiben eine Vorlage für eine spätere gemeinsame Suche. |

[Habens Skills mit Referenzdateien](https://github.com/Speicherstadt/haben/tree/daff6cdf5b28f24f229b4fa7f2ed1c678d961a65/.claude/skills)

## GitHub-Workflows und Prüfinfrastruktur

- **Issue-Formulare und PR-Beschreibung.** Die zwei vorhandenen Vorschläge aus PR Nr. 217 werden auf den Grundlagenstand vorgezogen und verwenden die vorhandenen Labels `bug` und `enhancement`. Die Desk-Formate bleiben kurz. Die Repository-Sichtbarkeit bestimmt, welche Pflichtvalidierung GitHub durchsetzt.
- **CI, Doku und PR-Regeln.** Im ersten Merge prüfen wir Whitespace, lokale Doku-Verweise und die Einbindung der Skills in der CI. Habens fachliche und technische Regeln wie Modulgrenzen, Drizzle, Biome und Dokumentationsgenerator werden einzeln auf eine passende Desk-Prüfung abgebildet, wenn es die nötige Struktur gibt. Langfristigen Prüfnachweis liefern die zum jeweiligen Code-Stand gehörenden Tests. Die bestehende Desk-Anwendungs-CI gehört zum [Kern-PR Nr. 7](https://github.com/Vemoro/desk/commit/1875bd4f2fc69fb011c3c012a01ba3d07ac22784).
- **Board, Übernahme und automatische Kommentare.** Die Statusregeln und der Ablauf für Dubletten und Abhängigkeiten werden übernommen. Schreibende Automatisierung, automatische Zuweisung, Erinnerungen und Kommentar-Bots kommen erst nach einer Entscheidung über Rechte und tatsächliche Abläufe in Betracht.
- **Release, Versionsanhebung und Ankündigung.** Das Release soll auf einen belegten Stand zurückführen und klar machen, welche Änderungen ausgeliefert wurden. Habens Tag-, Issue-, Discord- und Paket-Workflows setzen andere Veröffentlichungswege voraus. Der erste Grundlagen-Merge richtet keinen Release- oder Veröffentlichungsworkflow ein.
- **CI-Images, Abhängigkeiten, Doku-Bilder und Jahreswerte.** Gepinnte Abhängigkeiten und überprüfte Updates passen. Eigene CI-Images, Renovate-Regeln und Doku-Publishing brauchen eine separate Entscheidung. Die reproduzierbaren Desk-Bilder sind in [PR Nr. 195](https://github.com/Vemoro/desk/commit/d0936ec7417b3bc9c8a1e06898fa039da5430718) vorbereitet. Jahreswerte und der separate GoBD-Kern bleiben in Haben.

[Habens Workflows](https://github.com/Speicherstadt/haben/tree/daff6cdf5b28f24f229b4fa7f2ed1c678d961a65/.github/workflows) · [Habens PR-Prüfskripte](https://github.com/Speicherstadt/haben/tree/daff6cdf5b28f24f229b4fa7f2ed1c678d961a65/scripts/pr-regeln)

## Erster Merge

Die Arbeitsgrundlage ist ein eigenständiger PR gegen `main`. Mehrere offene Desk-PRs enthalten Vorarbeiten zu denselben Themen, darunter Nr. 24, Nr. 146, [Nr. 188](https://github.com/Vemoro/desk/commit/1d05f0d58bbba3a24eb1dcf936a4323a3c90a577), Nr. 196, Nr. 217, Nr. 235, Nr. 239 und Nr. 242. Die Entscheidung über Weiterführen oder Ersetzen gehört zur [anschließenden Neubewertung](neubewertung.md).
