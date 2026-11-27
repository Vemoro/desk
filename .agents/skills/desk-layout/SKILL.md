---
name: desk-layout
description: Leitet Desk-Seitenleiste, Seitenaufbau, Typografie und UI-Abnahme an und prüft Vorbilder in Haben für neue Bereiche ohne passende Design- oder Codevorgaben.
---

# Desk-Layout

Lies [Desk-Gestaltung](../../../DESIGN.md) und vergleiche die betroffene Ansicht mit einer verwandten Desk-Ansicht. Die Gestaltungsvorgaben in `DESIGN.md` sind verbindlich. Haben ist das Vorbild für Dichte, Gruppierung und Platzierung der Nebenfunktionen. Desk verwendet seine eigene blaue Farbwelt.

## Aufbau

- Nutze für Navigation und Seitenaufbau die vorhandenen Komponenten und Größen aus [Navigation](../../../src/ui/navigation.tsx) und [CSS](../../../src/app.css). Folge bei Gruppen, Rollen, Links und Schriftstufen den [Seitenleistenregeln](../../../DESIGN.md#seitenleiste).
- Der Seitenkopf nennt den Bereich. Die Arbeitsansicht priorisiert laufende Aufgaben und die nächste Hauptaktion. Zugehörige Daten stehen daneben oder mobil im Lesefluss darunter. Wiederverwende vorhandene Muster für Karten, Tabellen, Formulare und Dialoge.
- Bewahre die Lesereihenfolge und die Tastaturführung im kompakten Layout. Prüfe im geöffneten Handymenü sowohl Escape mit Fokus zum Menüknopf als auch die interne Navigation mit Fokus zum Hauptinhalt.

## Neue Bereiche ohne passende Desk-Regeln

Führe den [Haben-Abgleich](../../../docs/entwicklung.md#auftrag-und-arbeitsstand) durch. Prüfe bei Gestaltungsfragen zuerst Habens `DESIGN.md` und die betroffene Komponente, bei Codefragen die einschlägige Entwicklungsregel und einen vergleichbaren Aufrufweg. Beschreibe im PR-Vorschlag das gefundene Muster, die nötige Anpassung und den Nutzen für Desk.

## Abnahme

1. Sichere die Ausgangsansicht vor UI-Änderungen nach [desk-pr-screenshots](../desk-pr-screenshots/SKILL.md).
2. Prüfe die geänderte Ansicht in Hell und Dunkel auf Desktop und Smartphone mit denselben synthetischen Daten und demselben Bedienzustand. Bei der Seitenleiste gehört das geöffnete Handymenü in die Aufnahmen. Prüfe sichtbaren Fokus, aktive Ansicht, Rollen, Linkziele und vollständige Beschriftungen.
3. Halte bewusst vereinbarte Abweichungen vom Layout im PR fest. Ändert sich die Vorgabe dauerhaft, aktualisiere `DESIGN.md` im selben PR.
