---
name: desk-layout
description: Leitet Desk-Layout und UI-Abnahme an und hilft bei neuen Bereichen, passende Design- oder Codevorgaben in Haben zu prüfen.
---

# Desk-Layout

Lies [Desk-Gestaltung](../../../DESIGN.md) und vergleiche die betroffene Ansicht mit einer verwandten Desk-Ansicht. Die Gestaltungsvorgaben in `DESIGN.md` sind verbindlich. Haben ist das Vorbild für Dichte, Gruppierung und Platzierung der Nebenfunktionen. Desk verwendet seine eigene blaue Farbwelt.

## Aufbau

- Nutze für Navigation und Seitenaufbau die vorhandenen Komponenten und Größen aus [Navigation](../../../src/ui/navigation.tsx) und [CSS](../../../src/app.css). Folge bei Gruppen, Rollen, Links und Schriftstufen den [Seitenleistenregeln](../../../DESIGN.md#seitenleiste).
- Der Seitenkopf nennt den Bereich. Die Arbeitsansicht priorisiert laufende Aufgaben und die nächste Hauptaktion. Zugehörige Daten stehen daneben oder mobil im Lesefluss darunter. Wiederverwende vorhandene Muster für Karten, Tabellen, Formulare und Dialoge.
- Bewahre die Lesereihenfolge und die Tastaturführung im kompakten Layout. Prüfe im geöffneten Handymenü sowohl Escape mit Fokus zum Menüknopf als auch die interne Navigation mit Fokus zum Hauptinhalt.

## Neue Bereiche ohne passende Desk-Regeln

Fehlt für einen neuen Bereich eine passende Design- oder Codevorgabe in Desk, prüfe vor der Umsetzung die einschlägigen Regeln und vergleichbare Stellen im [Haben-Repository](https://github.com/Speicherstadt/haben). Halte im zugehörigen PR als Vorschlag fest, welches Muster sich für Desk übernehmen lässt, wie es angepasst werden soll und warum es zum Desk-Ablauf passt. Verlinke die konkrete Quelle am geprüften Stand. Findest du kein passendes Muster, halte das Ergebnis kurz im PR fest.

## Abnahme

1. Sichere die Ausgangsansicht vor UI-Änderungen nach [desk-pr-screenshots](../desk-pr-screenshots/SKILL.md).
2. Prüfe die geänderte Ansicht in Hell und Dunkel auf Desktop und Smartphone mit denselben synthetischen Daten und demselben Bedienzustand. Bei der Seitenleiste gehört das geöffnete Handymenü in die Aufnahmen. Prüfe sichtbaren Fokus, aktive Ansicht, Rollen, Linkziele und vollständige Beschriftungen.
3. Halte bewusst vereinbarte Abweichungen vom Layout im PR fest. Ändert sich die Vorgabe dauerhaft, aktualisiere `DESIGN.md` im selben PR.
