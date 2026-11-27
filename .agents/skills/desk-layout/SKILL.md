---
name: desk-layout
description: Setzt die Desk-Regeln für Seitenleiste, Navigation, Typografie und Arbeitsbereiche bei Änderungen an der Oberfläche um und hilft bei der Layout-Abnahme.
---

# Desk-Layout

Lies [Desk-Gestaltung](../../../DESIGN.md) und vergleiche die betroffene Ansicht mit einer verwandten Desk-Ansicht. Die Gestaltungsvorgaben in `DESIGN.md` sind verbindlich. Haben ist das Vorbild für Dichte, Gruppierung und Platzierung der Nebenfunktionen. Desk verwendet seine eigene blaue Farbwelt.

## Aufbau

- Nutze für Navigation und Seitenaufbau die vorhandenen Komponenten und Größen aus [Navigation](../../../src/ui/navigation.tsx) und [CSS](../../../src/app.css). Ordne fachliche Ziele den sichtbaren Arbeitsgruppen zu. Konto, administrative Einstellungen und Hilfslinks gehören in den Fußbereich. Ergänze bei neuen Funktionen eine Gruppe erst, wenn vorhandene Gruppen fachlich nicht passen.
- Lass die aktive Ansicht sichtbar und die Buildversion auch außerhalb der Kontoseite erreichbar. Verwende für den ausgelieferten Quellstand die konfigurierte Quellcode-URL. Der allgemeinere Repository-Link trägt die Bezeichnung „Desk-Projekt auf GitHub“.
- Der Seitenkopf nennt den Bereich. Die Arbeitsansicht priorisiert laufende Aufgaben und die nächste Hauptaktion. Zugehörige Daten stehen daneben oder mobil im Lesefluss darunter. Wiederverwende vorhandene Muster für Karten, Tabellen, Formulare und Dialoge.
- Bewahre die Lesereihenfolge und die Tastaturführung im kompakten Layout. Ein geöffnetes Handymenü lässt sich mit Escape schließen. Nach interner Navigation geht der Fokus zum Hauptinhalt. Richte reguläre mobile Bedienziele am 44-Pixel-Mindestmaß aus.

## Abnahme

1. Sichere die Ausgangsansicht vor UI-Änderungen nach [desk-pr-screenshots](../desk-pr-screenshots/SKILL.md).
2. Prüfe die geänderte Ansicht in Hell und Dunkel auf Desktop und Smartphone mit denselben synthetischen Daten und demselben Bedienzustand. Bei der Seitenleiste gehört das geöffnete Handymenü in die Aufnahmen. Prüfe sichtbaren Fokus, aktive Ansicht, Rollen, Linkziele und vollständige Beschriftungen.
3. Halte bewusst vereinbarte Abweichungen vom Layout im PR fest. Ändert sich die Vorgabe dauerhaft, aktualisiere `DESIGN.md` im selben PR.
