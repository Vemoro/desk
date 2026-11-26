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

Der Kommentarbefehl `/übernehmen` oder `/uebernehmen` gilt für offene, freie Issues mit aktiver Karte unter „Geplant“ oder „In Arbeit“. Wenn GitHub die Zuweisung bestätigt, steht die Karte unter „In Arbeit“. Mit `/freigeben` hebst du deine Zuweisung auf. Eine dadurch frei gewordene Karte unter „In Arbeit“ geht nach „Geplant“ zurück.

Bei der Übernahme per Bot folgt nach 14 Tagen ohne Kommentar eine Erinnerung und sieben Tage danach die automatische Rückgabe. Ein Kommentar der zugewiesenen Person startet die Frist neu. Ein offener PR einschließlich Entwurf schützt die Aufgabe, wenn in seiner Beschreibung etwa `Refs #123` oder `Umgesetzt #123` steht. Manuelle Zuweisungen ohne Übernahmebefehl und dem Repository zugeordnete Mitwirkende sind von der automatischen Rückgabe ausgenommen. Für Pull Requests gilt der [Review- und Freigabeprozess](entwicklung.md#änderungen-prüfen).

### Automatik einrichten

Hinterlege in `Vemoro/desk` unter **Settings → Secrets and variables → Actions** das Repository-Secret `DESK_ROADMAP_TOKEN`. Verwende einen zeitlich begrenzten Fine-grained PAT für den Ressourceninhaber `Vemoro` mit Zugriff auf `desk` und der Organisationsberechtigung **Projects: Read and write**. Das zugehörige Konto braucht Schreibzugriff auf die Desk Roadmap. GitHub Actions verwendet sein eigenes `GITHUB_TOKEN` für Issues und Kommentare. [GitHub Projects in Actions](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/automating-projects-using-actions)

Starte den Workflow **Übernehmen** auf `main` für die Erstprüfung mit aktivierter Option `probe`. Das Protokoll zeigt fällige Erinnerungen und Rückgaben, ohne sie auszuführen. Prüfe anschließend beide Kommentarbefehle an einer freien Testkarte mit synthetischen Daten. Der Zeitplan prüft übernommene Aufgaben täglich.

Die Automatik übernimmt die Kommentarbefehle und Fristen aus Haben und bindet sie an die Statusfelder der Desk Roadmap. [Haben-Workflow](https://github.com/Speicherstadt/haben/blob/379fce406a33d1ae251f54197d3e976866cc9731/.github/workflows/uebernehmen.yml) · [Haben-Lizenz](https://github.com/Speicherstadt/haben/blob/379fce406a33d1ae251f54197d3e976866cc9731/LICENSE)
