# Desk Roadmap

Desk unterstützt kleine projektorientierte Teams mit CRM, Projekt- und Ressourcenplanung, Kanban, Kalkulation, Lagerwirtschaft, Controlling und einer REST-API. Der allgemeine Ablauf reicht von der Anfrage bis zur dokumentierten Rechnungsreferenz. Die fiktiven Musteraufträge Veranstaltungsbetreuung und Büroinstallation prüfen denselben Ablauf. [Vereinbarter Kern](https://github.com/Vemoro/desk/issues/1)

Haben ergänzt Angebot, Belegkosten und Abrechnung. Zammad ergänzt Ticketverkehr und Nachrichten. Ohne beide Anbindungen bleiben Projektarbeit, Kalkulation, Lager und Controlling nutzbar. Angelegte Links, Referenzen und Notizen helfen bei der Arbeit mit anderen Systemen.

Branchenspezifische Funktionen folgen nach dem allgemeinen Kern. Bestandsbewertung und Abschreibung liegen im Buchhaltungssystem. Umlagerung, Inventur, Mindestbestand, Bestellfreigabe und automatische Schichtoptimierung gehören nachgelagert auf die Roadmap.

## Board-Zustände

[Desk Roadmap auf GitHub](https://github.com/orgs/Vemoro/projects/2)

| Status | Bedingung |
| --- | --- |
| Später | Sinnvoller Umfang für eine spätere Ausbaustufe oder mit noch offenen Vorarbeiten |
| Geplant | Für Desk umsetzbarer Umfang mit geprüfter Issue-Fassung und nachvollziehbarer Abnahme |
| In Arbeit | Ausgewählte Umsetzung mit festgehaltenem Stand und offenem Arbeits- oder Prüfweg |
| Externe integrationen | Die Umsetzung braucht eine konkrete Änderung in einem anderen Projekt |
| Im nächsten Release | Die vollständige Umsetzung ist gemergt und für die nächste Auslieferung vorgesehen |
| Erledigt | Die Auslieferung ist nachvollziehbar belegt. Bei reiner Repository-Dokumentation kann der vereinbarte Auslieferungspunkt der Merge auf den Standardbranch sein. |

Setze bei Planung zuerst den Kernablauf und Risiken für Daten, Berechtigungen und die Wiederholbarkeit von Buchungen. Ein Desk-Adapter erhält eine eigene Aufgabe auf dem Desk-Board. Verlinke eine erforderliche externe Änderung mit dem vorhandenen externen Issue oder der belegten Schnittstellenlücke.

Die [Entwicklungsrunden](entwicklung.md#entwicklungsrunden-für-agenten) beschreiben die flexible Planung nach Nutzen, Risiken und Abhängigkeiten. Die [Neubewertung](neubewertung.md) beschreibt die einmalige Überprüfung des Bestands nach dem ersten Grundlagen-Merge.

## Issues übernehmen und freigeben

Schreibe `/übernehmen` oder `/uebernehmen` am Anfang einer Zeile in einem neuen Kommentar. Die Befehle gelten für offene, freie Issues mit aktiver Karte unter „Geplant“ oder „In Arbeit“. Wenn GitHub die Zuweisung bestätigt, steht die Karte unter „In Arbeit“. Mit `/freigeben` hebst du deine Zuweisung auf. Eine dadurch frei gewordene aktive Karte unter „In Arbeit“ geht nach „Geplant“ zurück. Befehle in Zitaten oder Codeblöcken bleiben ohne Wirkung.

Der tägliche Lauf erinnert bei Übernahmen per Bot, sobald 14 Tage ohne Rückmeldung verstrichen sind. Nach weiteren sieben Tagen ohne Rückmeldung gibt er das Issue frei. Ein Kommentar der zugewiesenen Person startet die Frist neu. Ein offener PR einschließlich Entwurf schützt die Aufgabe, wenn in seiner Beschreibung etwa `Refs #123` oder `Umgesetzt #123` steht. Manuelle Zuweisungen ohne Übernahmebefehl und GitHub-Collaborators dieses Repositorys sind von der automatischen Rückgabe ausgenommen. Für Pull Requests gilt der [Review- und Freigabeprozess](entwicklung.md#änderungen-prüfen).

### Automatik einrichten

Richte als Org-Owner eine GitHub App im Besitz von Vemoro ein. Deaktiviere den Webhook und erteile **Organization permissions → Projects: Read and write** sowie **Repository permissions → Issues: Read-only**. Installiere die App für `Vemoro/desk`. Hinterlege dort unter **Settings → Secrets and variables → Actions** die Client-ID als Variable `DESK_ROADMAP_APP_CLIENT_ID` und den vollständigen privaten App-Schlüssel als Secret `DESK_ROADMAP_APP_PRIVATE_KEY`. Der Workflow verwendet für das Board ein kurzlebiges Installationstoken. Issue-Zuweisungen und Kommentare laufen über das eigene `GITHUB_TOKEN` von GitHub Actions. [GitHub App registrieren](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app) · [GitHub Projects in Actions](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/automating-projects-using-actions)

Starte nach dem Merge den Workflow **Übernehmen** auf `main` mit aktivierter Option `probe`. Prüfe, dass die App-Anmeldung erfolgreich war. Das Protokoll zeigt fällige Erinnerungen und Rückgaben, ohne sie auszuführen. Prüfe die Schreibrechte anschließend mit beiden Kommentarbefehlen an einer freien Testkarte mit synthetischen Daten.

Desk hat den Haben-Ablauf am 26. November 2026 an die Statusfelder der Desk Roadmap angepasst. [Haben-Übernahme](https://github.com/Speicherstadt/haben/blob/379fce406a33d1ae251f54197d3e976866cc9731/scripts/board/uebernahme.ts) · [Haben-GitHub-Zugriff](https://github.com/Speicherstadt/haben/blob/379fce406a33d1ae251f54197d3e976866cc9731/scripts/board/github.ts) · [Haben-Lizenz](https://github.com/Speicherstadt/haben/blob/379fce406a33d1ae251f54197d3e976866cc9731/LICENSE)
