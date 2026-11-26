# Einen Desk-Release-Kandidaten prüfen

Halte im Prüfprotokoll den vollständigen Git-Commit, die verwendeten Bun- und PostgreSQL-Versionen, die isolierte Testumgebung und das Datum fest. Verknüpfe den CI-Lauf für denselben Stand und die Ergebnisse der praktischen Abnahme. Wenn ein Schritt offenbleibt, nenne den fehlenden Zugang, die Abhängigkeit oder den beobachteten Fehler. Zugangsdaten, echte Belege und personenbezogene Daten bleiben außerhalb des Protokolls.

| Prüfung | Erwartetes Ergebnis |
| --- | --- |
| Build und Erstinstallation | Aus einem frischen Checkout bauen und eine leere PostgreSQL-Datenbank migrieren. Das erste Administrationskonto anlegen, den gebauten Dienst starten und die Anmeldung prüfen. Wenn ein Containerimage zur Veröffentlichung vorgesehen ist, dieselbe Prüfung mit diesem Image durchführen. |
| Installierbare Web-App | Den bereitgestellten HTTPS-Kandidaten in Chrome oder Edge unter Windows und in Chrome unter Android mit der regulären PWA-Installationsaktion im frischen Browserprofil installieren. In Safari unter iOS **Zu Home-Bildschirm hinzufügen** mit **Als Web-App öffnen** verwenden. Über das blaue Desk-Symbol starten, im App-Fenster ohne Browserleiste anmelden und ein synthetisches Musterprojekt öffnen. Browser, Betriebssystem und Ergebnis je Plattform festhalten. |
| Beide Musteraufträge ohne Anbindungen | Je eine Veranstaltungsbetreuung und eine Büroinstallation vom Kontakt über Aufgaben, Planung, Kalkulation und Lager bis zur Rechnungsreferenz durchspielen. Prüfe die deaktivierten Anbindungen über `/api/v1/integrations`. Erstelle für die Freigabe die vorgesehenen Bilder und prüfe die Ansichten. |
| Wiederholung von Buchungen | Eine Übertragung mit unklarer Antwort erneut auslösen. Bei Wareneingang, Ausgabe, Rückgabe, Verbrauch und Vormerkungen denselben Vorgangsschlüssel verwenden. Bei Ist-Kosten dieselbe Kombination aus Quelle und Belegreferenz erneut importieren. Jeweils prüfen, dass genau eine fachliche Buchung entsteht. |
| Buchung am richtigen Lagerort | Denselben Artikel für ein Projekt an zwei Lagerorten reservieren. Im Buchungsformular den beabsichtigten Eintrag auswählen. Prüfe, ob die Bewegung den gewählten Ort verändert und ob dieser im Verlauf sichtbar ist. |
| Upgrade und Wiederanlauf | Einen synthetischen Bestand der unterstützten Ausgangsversion sichern. Den Restore mit Migration zum Kandidaten und den Wiederanlauf der Ausgangsversion getrennt erproben. Im migrierten Bestand Projekt, Buchungen und Belegzuordnungen prüfen. Beim ersten Release dokumentieren, welcher Entwicklungsstand als Ausgang dient. |
| Haben | Im simulierten Dienst den Angebotsstatus und den Kontaktabgleich prüfen. Für die Abnahme der vorgesehenen Haben-Version ein autorisiertes Testkonto und ausdrücklich dafür angelegte Beispieldaten verwenden. Rechte und tatsächlich unterstützte API-Vorgänge festhalten. |
| Zammad | Im simulierten Dienst einen unklaren Versand mit einem bereits verknüpften Ticket erproben. Für die Abnahme an Zammad ein Testticket, die vorgesehene Ticketgruppe und ein Testpostfach verwenden. Szenarien für Ticketanlage und Verknüpfung prüfen, den Verlauf lesen und die Zustellung einer Antwort mit PDF prüfen. |
| Codegröße ab 0.2.0.0 | `bun run check:code-size --release` am Kandidaten ausführen. Dateien und Funktionen halten die Grenzen ohne Übergangsausnahmen ein. Die Anwendungs-CI prüft die vierstellige `deskVersion` am selben Git-Stand. |
| Gestaltung und Bedienung ab 0.2.0.0 | `bun run check:fields` sowie `bun x playwright test --project=core e2e/design.spec.ts e2e/accessibility.spec.ts` am selben Kandidaten ausführen. Beide Themes auf Desktop und Smartphone prüfen. Halte Screenshot-Paare, Tastaturbedienung, Fokus, Feldfehler, Touchziele und Dialoge im Freigabeprotokoll fest. |
| Freigabe | Den geprüften Stand im PR dokumentieren. Offene Befunde und externe Grenzen erfassen. Die Entscheidung über Merge und Release liegt beim Maintainer. |

Die [Betriebsdoku](desk.md#betrieb) beschreibt Start, Migration und Sicherung. Die [Entwicklungsdoku](entwicklung.md#befehle-und-screenshot-workflow) nennt die Befehle für Build, Tests und Bilder. Die [Release-Notizen](../CHANGELOG.md) fassen die Änderungen für Nutzende zusammen.

## Quellpaket des Kandidaten

Für Desk 0.1.0.0 stehen das geprüfte Quellarchiv und `SHA256SUMS` unter **Assets** bereit. Erzeuge neue Kandidaten im öffentlichen Repository lokal wie unten beschrieben. Der Workflow **Desk-Quellpaket prüfen** ist auf private Repositories und Commits aus der Historie von `main` beschränkt. [Desk 0.1.0.0](https://github.com/Vemoro/desk/releases/tag/v0.1.0.0)

Mit Git und Python 3.11 oder neuer kannst du das Paket lokal erzeugen. Führe die Befehle in Bash vom Stamm eines Checkouts aus, der das Paketierungsskript und den Kandidatencommit enthält. Setze `commit` auf die vollständige ID des Kandidaten.

```sh
commit=5b10099dde361ba058efbcd11fdbfff98c0592ab
output=$(mktemp -d)
python3 scripts/package-release-source.py "$commit" "$output"
(cd "$output"/desk-*-"$commit" && sha256sum -c SHA256SUMS)
```

Für ein heruntergeladenes Artefakt führe `sha256sum -c SHA256SUMS` im Paketordner aus. Der Dateiname nennt die Desk-Version aus `package.json` des archivierten Stands. Das Skript gleicht Pfade und Dateiinhalte mit Git ab. Trage Commit, Dateiname und SHA-256 des gewählten Pakets in das Abnahmeprotokoll ein. Der Workflow erzeugt ein Prüfartefakt und hat Leserechte für Git-Inhalte. Veröffentlichung und Quellen zu mitgelieferten Binärdateien werden separat freigegeben. [Download von Actions-Artefakten](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts) · [Lizenzprüfung](https://github.com/Vemoro/desk/issues/50)

## Kandidaten aus mehreren PRs zusammenstellen

Erfasse die Zusammensetzung als Teil des [Abnahmeprotokolls aus #65](https://github.com/Vemoro/desk/issues/65). Prüfe Überschneidungen zuerst mit `git merge-tree` und das gemeinsame Verhalten in einem isolierten Worktree. Die [Entwicklungsdoku für überlappende Änderungen](entwicklung.md#überlappende-änderungen) beschreibt die Zusammenführungsprüfung.

| Feld | Eintrag für die Prüfung |
| --- | --- |
| Ausgang und Kandidat | Vollständiger Git-Commit der Ausgangsbasis und des zusammengesetzten Stands, Datum und Prüfbranch |
| Enthaltene PRs | Je PR Nummer, Basisbranch und Basiscommit, Head-Branch und Head-Commit sowie der übernommene Commit |
| Reihenfolge und Konflikte | Abhängigkeiten, betroffene Dateien, Auflösung und erhaltenes Verhalten dokumentieren |
| Prüfläufe | Einzel-CI je PR verlinken. Gemeinsame Befehle, Umgebung und Ergebnis dem Kandidatencommit zuordnen. |
| Externe Abhängigkeiten und offene Abnahme | Integrationen, benötigte Testzugänge, Fehler und ausstehende Schritte mit Bezug zu den Abnahmekriterien |

### Kombinationsprobe mit drei offenen PRs

Am 25. November 2026 lagen Bestätigungsdialoge, Dublettenhinweis und Projektlinks am Kontakt als drei offene, gestapelte PRs vor. Die Basis der Probe war der damalige `main`-Commit [`efb78a89d79ee3cd7eb0edc90c0bcfa06a051629`](https://github.com/Vemoro/desk/commit/efb78a89d79ee3cd7eb0edc90c0bcfa06a051629). Der gemeinsame Stand im getrennten Worktree war [`7478c137179507cf988343bbc2b7ac5726e473ec`](https://github.com/Vemoro/desk/commit/7478c137179507cf988343bbc2b7ac5726e473ec).

| Reihenfolge | PR-Basis | Ursprünglicher Head | Commit im Probestand | Einzel-CI |
| --- | --- | --- | --- | --- |
| 1. [Nr. 68 Bestätigungsdialoge](https://github.com/Vemoro/desk/commit/64e1683e14266f3ce95aaabdfd654bf8b136e9ed) | `feat/refresh-after-save` · `c251725a91218acd7aa7c1401b404e6f5b6fe925` | `feat/confirmation-dialogs` · `1e44532c4843af0cf855a2186b815de0dff0a8ae` | [`52f629e`](https://github.com/Vemoro/desk/commit/52f629ee39aaf2abb14ed0d6ea91b16bf1d2eb27) | Erfolgreich |
| 2. [Nr. 72 Kontaktdubletten](https://github.com/Vemoro/desk/commit/6f54ebb4b12ec7428aaa38c5edac602fa3be6be0) | `feat/confirmation-dialogs` · `1e44532c4843af0cf855a2186b815de0dff0a8ae` | `feat/contact-duplicates` · `0abaa34b0af458795eaa84efcc77712a8d8bdaf8` | [`46590d9`](https://github.com/Vemoro/desk/commit/46590d9647bdd53c333ff8c1a5f006673b1f008f) | Erfolgreich |
| 3. [Nr. 76 Projektlinks am Kontakt](https://github.com/Vemoro/desk/commit/474db214ef9e42aec6eb47f642f097aa9f25a850) | `feat/contact-duplicates` · `0abaa34b0af458795eaa84efcc77712a8d8bdaf8` | `feat/contact-projects` · `d1661de83c4daeba49a3b04442e659d117f07c0c` | [`7478c13`](https://github.com/Vemoro/desk/commit/7478c137179507cf988343bbc2b7ac5726e473ec) | Erfolgreich |

Die Basis von Nr. 68 war bereits über PR Nr. 62 in `main`. Nr. 72 nutzt den Bestätigungsdialog aus Nr. 68. Nr. 76 baut auf der Kontaktdetailansicht aus Nr. 72 auf. Daher wurden die drei Head-Commits einzeln und in dieser Reihenfolge mit `git cherry-pick -x` übernommen. Die Vorprüfung lässt sich je Schritt mit `git merge-tree --write-tree --merge-base=<PR-Basiscommit> <bisheriger Probestand> <PR-Head>` nachvollziehen. [PR Nr. 62](https://github.com/Vemoro/desk/commit/7ade12074e29367286e482892ccacf604721b0f4)

- Bei **Nr. 68** kollidierten `playwright.config.ts`, `src/ui/projects.tsx` und `src/ui/widgets.tsx`. Die Testkonfiguration behielt die vorhandenen Tests. Kalkulation und die aktuelle Zammad-Ansicht erhielten die Dialoge. Die Sitzungsprüfung vor Folgeaktionen, der Projektverlauf, die Buchungslogik und das Lösen einer Zammad-Verknüpfung blieben erhalten.
- Bei **Nr. 72** kollidierten `playwright.config.ts` und `src/ui/desk.tsx`. Der Dublettenhinweis nutzt den Dialog aus Nr. 68. Beim Speichern übernimmt die Oberfläche das Ergebnis nur in der Sitzung, aus der der Aufruf stammt. Der Haben-Abgleich nutzt weiterhin den bestehenden Ablauf.
- Bei **Nr. 76** kollidierten `playwright.config.ts` und `src/ui/desk.tsx`. Die neuen Projektlinks kommen aus der Kontaktdetailansicht. Wochenplanung, Navigation und die Übergabe des Kontos an das Projektlager bleiben aus der aktuellen Basis erhalten.

Den aufgelösten Stand kannst du aus dem Repository in einem neuen Worktree öffnen:

```bash
git fetch origin refs/heads/review/release-candidate-248
git worktree add --detach ../desk-kandidat-248 7478c137179507cf988343bbc2b7ac5726e473ec
```

Die Einzel-CI oben prüfte die ursprünglichen PR-Heads an ihren jeweiligen Basen. Die gemeinsame Prüfung lief lokal auf dem zusammengesetzten Stand mit Bun 1.4.5 und PostgreSQL 17.12. `bun run build`, `bun run check`, `bun run migrate` und `bun run test` bestanden, darunter 60 Bun-Tests. `bun run e2e` lief gegen den gebauten Dienst mit einer separaten Demo-Datenbank und bestand mit 51 Chromium-Fällen. Die Suite enthält beide Musteraufträge. Die Fälle zu Kalkulationsdialogen, Zammad-Sendeversuchen, Kontaktdubletten und Projektlinks verwenden simulierte Antworten der Desk-API. Die Haben-Integrationstests verwenden einen simulierten Dienst. `bash scripts/check-runtime-image.sh` bestätigte die Migration einer leeren Datenbank, die Anlage der Administration, Anmeldung und Anzeige des Kandidatencommits.

Für eine Freigabe stehen eine vollständige Wiederanlaufprobe mit gesichertem Altbestand, die vorgesehenen Doku-Bilder und die Abnahme mit autorisiertem Testzugang an Haben und Zammad aus. Der Prüfbranch `review/release-candidate-248` hält den zusammengesetzten Stand für die Reproduktion fest. Die drei ursprünglichen PRs bleiben Gegenstand ihrer eigenen Freigabe.

## Probe am Entwicklungsstand vom 25. November 2026

Geprüft wurde [`d0d3117281a75bf9aa463679795a7b6214dcc6a0`](https://github.com/Vemoro/desk/commit/d0d3117281a75bf9aa463679795a7b6214dcc6a0) auf `main`. Der Lauf verwendete Bun 1.4.5 und PostgreSQL 17.12. Fachtests, Browser/Doku-Bilder und Containerproben liefen mit getrennten lokalen Datenbanken und synthetischen Daten. Die Browserfälle liefen gegen den lokal gebauten Dienst, Erstinstallation und Wiederanlauf in lokalen Laufzeitimages.

| Prüfung | Ergebnis der Probe |
| --- | --- |
| Build und Erstinstallation | Installieren mit eingefrorenem Lockfile, Build, Typprüfung und 13 Fach- und Integrationstests erfolgreich. Im lokal gebauten Docker-Image liefen Migrationen 001 bis 004 und die Admin-CLI auf einer leeren Datenbank. Nach der Anmeldung waren die Projektliste leer und die Passkey-Einrichtung erreichbar. |
| Beide Musteraufträge ohne Anbindungen | Die Browserfälle legten je eine Veranstaltungsbetreuung und eine Büroinstallation neu an und führten sie bis zu „Abgerechnet“ mit Rechnungsreferenz. Die Suite mit 31 Chromium-Fällen war erfolgreich. Die authentifizierte Integrationsabfrage meldete Haben und Zammad als deaktiviert. Der separate Screenshot-Lauf lieferte in Hell und Dunkel Ansichten aus der Demo „Veranstaltungsbetreuung im Kulturhaus“ sowie aus Projektlager und Navigation. |
| Wiederholung von Buchungen | Fachtests belegen die unveränderte Buchungs-ID bei erneut gesendetem Wareneingang, Verbrauch, Ausgabe, Rückgabe sowie neuer Personal- und Inventarvormerkung. Browsertests simulieren eine verlorene Antwort bei Verbrauch sowie Personal- und Inventarvormerkung. Der Fachtest für erneuten Kostenimport prüft die Deduplizierung je Quelle und Referenz. |
| Buchung am richtigen Lagerort | Die Geräteausgabe belastete auf Desktop und Smartphone nur den gewählten Lagerort. Getrennte Browsertests prüfen die eindeutige Beschriftung der Buchungsoptionen und den Lagerort im Bewegungsverlauf. |
| Upgrade und Wiederanlauf | Ausgang war [`565f852`](https://github.com/Vemoro/desk/commit/565f852d11a80d2b0e0893ff5f8d8a2409f2406a) mit Migrationen 001 bis 003. Aus demselben Dump starteten zwei getrennte Datenbanken. Auf einer wurde ausschließlich 004 ergänzt und der Kandidat gestartet. Auf der anderen lief die Ausgangsversion wieder an. Anmeldung und beide Musterprojekte waren erreichbar. Projekte, Bewegungen, Reservierungen und die Projektzuordnung der Belege wurden mit dem Ausgang verglichen. [Ergänzende Bestandsprobe für Passkeys](https://github.com/Vemoro/desk/commit/d0d3117281a75bf9aa463679795a7b6214dcc6a0) |
| Haben | Angebotsstatus und beidseitige Kontaktänderungen im simulierten Dienst geprüft. Die Abnahme an der vorgesehenen Instanz steht aus. Für sie sind ein autorisierter Testzugang und synthetische Beispieldaten erforderlich. Desk übergibt Angebotspositionen per CSV und erfasst Ist-Kosten über Zuordnung oder CSV. Extern offen sind das Anlegen von Angebotsentwürfen und der Abruf projektbezogener Ist-Kosten. [Issue #5](https://github.com/Vemoro/desk/issues/5) · [Issue #6](https://github.com/Vemoro/desk/issues/6) |
| Zammad | Der simulierte Test fand den unklaren Sendeversuch im Verlauf wieder. Ticketanlage, Verknüpfung, Verlauf und PDF-Zustellung wurden an einem früheren Kernstand gegen die Testinstanz geprüft. Die Wiederholung am Kandidaten mit live angebundenem Testticket und Testpostfach steht aus. [Frühere Probe in PR Nr. 7](https://github.com/Vemoro/desk/commit/1875bd4f2fc69fb011c3c012a01ba3d07ac22784) |
| Freigabe | Der lokale Probelauf ist abgeschlossen. Die Abnahme an den vorgesehenen Haben- und Zammad-Instanzen steht aus. |

## Nachprüfung auf `3bb6ef2`

Die Nachprüfung bezieht sich auf [`3bb6ef2b70f2048f948fd18d6547e50b33a69669`](https://github.com/Vemoro/desk/commit/3bb6ef2b70f2048f948fd18d6547e50b33a69669). Die historischen GitHub-Prüfläufe wurden am 25. November 2026 gestartet. Der lokale Wiederanlauf lief mit Bun 1.4.5, PostgreSQL 17.12 und getrennten synthetischen Datenbanken.

| Prüfung | Ergebnis |
| --- | --- |
| Build und Erstinstallation | Build, Typprüfung und 23 Fachtests bestanden. Im Laufzeitimage wurden eine leere PostgreSQL-Datenbank migriert und das erste Administrationskonto angelegt. Chromium bestätigte die Anmeldung, eine leere Projektliste und die angezeigte Commit-ID. |
| Beide Musteraufträge ohne Anbindungen | Beide Browserfälle führten die Aufträge vom Kontakt bis zur Rechnungsreferenz. Die Suite mit 32 Chromium-Fällen bestand. Bei der lokalen Upgrade- und Restore-Probe meldete die authentifizierte Integrationsabfrage in allen Prüfinstanzen Haben und Zammad als deaktiviert. Das geprüfte Artefakt enthält 18 PNGs einschließlich beider Musteraufträge, Projektlager und Handynavigation in Hell und Dunkel. |
| Wiederholung und Lagerort | Fach- und Browserfälle prüfen Vorgangsschlüssel, den wiederholten Belegimport und die Geräteausgabe am ausgewählten Lagerort. Lokal behielten ein Wareneingang und eine Personalvormerkung nach dem Restore ihre ursprünglichen IDs. Vier Bewegungen, fünf Vormerkungen und 20 physische, sechs reservierte sowie 14 freie Einheiten am Musterlagerort blieben erhalten. |
| Upgrade und Wiederanlauf | Ausgang war [`43586fc`](https://github.com/Vemoro/desk/commit/43586fcc950894d15b72e34c9f55ad89550ad6ce). Die getrennt wiederhergestellte Ausgangsversion behielt `001_core.sql`. Auf dem Kandidaten lagen die Migrationen 001 bis 004 vor. Login, Projekt, Aufgaben, Belegzuordnung und Lagerdaten waren nach der Wiederherstellung verfügbar. [Sicherung und Prüfrestore](sicherung.md#upgrade-und-wiederanlauf-proben) |
| Haben | Der simulierte Dienst prüft Angebotsstatus und Kontaktänderungen in beide Richtungen. Die Abnahme von Status, Kontaktabgleich und Rechten an der vorgesehenen Haben-Version bleibt offen. Für diese Nachprüfung stand kein autorisierter Testzugang mit Beispieldaten zur Verfügung. Die externen Schnittstellen für Angebotsentwürfe und projektbezogene Ist-Kosten bleiben offen. [Issue #5](https://github.com/Vemoro/desk/issues/5) · [Issue #6](https://github.com/Vemoro/desk/issues/6) |
| Zammad | Die Simulation bestätigte den Lesetest, die Ticketanlage, die Verknüpfung und die Übergabe von Anhangbytes. Ein unklarer Versand wurde im Verlauf wiedergefunden. Eine Gegenprobe zeigte, dass Desk beim Verknüpfen eine abweichende Ticket-ID aus der Antwort speichern kann. Die Probe an der vorgesehenen Instanz einschließlich PDF-Zustellung im Testpostfach bleibt ausstehend. Für diese Nachprüfung stand kein autorisierter Testzugang zur Verfügung. [Befund zur Ticket-ID](https://github.com/Vemoro/desk/issues/79) |
| Freigabe | Die Abnahme der vorgesehenen Haben- und Zammad-Instanzen sowie der Befund zur Verknüpfung sind offen. [Issue #65](https://github.com/Vemoro/desk/issues/65) · [Issue #79](https://github.com/Vemoro/desk/issues/79) |

## Probe auf `474db21`

Am 25. November 2026 geprüft wurde `main` auf [`474db214ef9e42aec6eb47f642f097aa9f25a850`](https://github.com/Vemoro/desk/commit/474db214ef9e42aec6eb47f642f097aa9f25a850) einschließlich [Nr. 68](https://github.com/Vemoro/desk/commit/64e1683e14266f3ce95aaabdfd654bf8b136e9ed), [Nr. 72](https://github.com/Vemoro/desk/commit/6f54ebb4b12ec7428aaa38c5edac602fa3be6be0) und [Nr. 76](https://github.com/Vemoro/desk/commit/474db214ef9e42aec6eb47f642f097aa9f25a850). Die Prüfungen liefen in isolierten Datenbanken mit synthetischen Daten. Für die Wiederherstellungsprobe kamen lokale Container aus den jeweiligen Checkouts mit Bun 1.4.5 und PostgreSQL 17.12 zum Einsatz. Anwendungs-CI, Arbeitsgrundlage und Doku-Bilder wurden gegen denselben vollständigen Commit ausgeführt. Anwendungs-CI · Doku-CI · 18 Doku-Screenshots

| Prüfung | Ergebnis |
| --- | --- |
| Build und Erstinstallation | Build, Typprüfung und 60 Bun-Tests mit 653 Assertions sind grün. Die CI migrierte eine leere Datenbank im Laufzeitimage bis einschließlich `007_project_history.sql`, legte die erste Administration an und prüfte Anmeldung und Commitanzeige. |
| Beide Musteraufträge ohne Anbindungen | Die Suite mit 58 Chromium-Fällen enthält beide Abläufe vom Kontakt bis zur Rechnungsreferenz. Die authentifizierte Integrationsabfrage meldete in den wiederhergestellten Instanzen Haben und Zammad als deaktiviert. Die 18 visuell geprüften PNGs zeigen Kanban, Ressourcenplanung und Controlling für beide Musteraufträge sowie Projektlager und mobile Navigation in Hell und Dunkel. |
| Upgrade und Wiederanlauf | Die Quelle [`43586fc`](https://github.com/Vemoro/desk/commit/43586fcc950894d15b72e34c9f55ad89550ad6ce) mit `001_core.sql` lieferte ein Custom-Archiv. Zwei getrennte Kopien starteten mit der Ausgangsversion beziehungsweise nach Migration auf 001 bis 007 mit dem Kandidaten. Anmeldung, beide Musterprojekte, Aufgaben, zugeordneter Beleg und Bestandsdaten wurden geprüft. Auf dem Kandidaten erschien außerdem ein neuer Statuswechsel im Projektverlauf. |
| Wiederholung und Lagerort | Nach dem erneuten Restore der aktualisierten Datenbank lieferten ein Wareneingang und eine Personalvormerkung mit denselben Vorgangsschlüsseln die ursprünglichen IDs. Es blieben vier Bewegungen, fünf Vormerkungen und 20 physische, sechs reservierte und 14 freie Einheiten am geprüften Lagerort. Der Statuswechsel blieb im Projektverlauf erhalten. Doppelte Kostenimporte und Geräteausgaben am ausgewählten Lagerort sind durch die Fach- und Browserfälle abgedeckt. |
| Haben | Simulierte API-Antworten prüfen Angebotsstatus und Kontaktänderungen in beide Richtungen. Das veröffentlichte Schema der vorgesehenen Instanz führt lesende Angebotsrouten und in den Belegantworten keine erkennbare Kostenstellenzuordnung. Die Abnahme von Rechten und Kontaktabgleich an der Instanz benötigt einen autorisierten Testzugang und synthetische Beispieldaten. Angebotsentwürfe und projektbezogene Ist-Kosten bleiben externe Abhängigkeiten. [Haben-API-Dokumentation](https://haben.app/api.html) · [Issue #5](https://github.com/Vemoro/desk/issues/5) · [Issue #6](https://github.com/Vemoro/desk/issues/6) |
| Zammad | Die Simulation prüft Anlage, passende und abweichende Ticket-ID, Lesetest, PDF-Anhang im API-Aufruf und Wiederauffinden eines unklaren Sendeversuchs. Der frühere Ticket-ID-Befund ist im Kandidaten korrigiert. Die vorgesehene Testinstanz und ihre aktive Mailanbindung waren administrativ erkennbar. Für diese Probe stand kein verwendbarer Ticket-Token mit freigegebenem Weg zur Bestätigung der Testmail bereit. Verknüpfung, Verlauf und PDF-Zustellung an der Testinstanz bleiben offen. [Issue #79](https://github.com/Vemoro/desk/issues/79) |
| Freigabe | Die lokale Kandidatenprobe ist abgeschlossen. Die Live-Abnahme der beiden Anbindungen steht aus. [Issue #65](https://github.com/Vemoro/desk/issues/65) |
