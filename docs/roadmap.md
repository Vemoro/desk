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

Der [Rundentakt](entwicklung.md#entwicklungsrunden-für-agenten) beschreibt das Vorgehen bei fortlaufender Entwicklung. Die [Neubewertung](neubewertung.md) beschreibt die einmalige Überprüfung des Bestands nach dem ersten Grundlagen-Merge.
