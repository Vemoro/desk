---
name: desk-pr-screenshots
description: Erstellt vor und nach UI-Änderungen vergleichbare Desk-Screenshots mit synthetischen Daten, festem Git-Stand und passenden Gerätegrößen.
---

# Desk-Oberfläche vergleichen

Lies die [Gestaltungsregeln](../../../DESIGN.md#oberfläche-prüfen) und die [Prüfregeln](../../../docs/entwicklung.md#prüfungen-und-dokumentation). Halte Basis, geänderten Stand, Viewport, Theme, Testdaten und Bedienzustand fest.

1. Nimm die Ausgangsansicht vor der ersten Änderung auf. Wenn die Änderung schon besteht, starte den genauen Basiscommit in einem getrennten Worktree. Für eine neue Ansicht kennzeichne die fehlende Ausgangsansicht. Nutze pro Instanz eine eigene Demo-Datenbank mit demselben synthetischen Ausgangsdatensatz.
2. Erfasse Desktop in Hell und Dunkel sowie bei betroffener mobiler Bedienung zusätzlich Smartphone. Verwende in jeder Paarung dieselben Größen, Filter, geöffnete Bereiche und Scrollposition. Wenn die Ansicht vom Datum abhängt, nutze denselben festen Browserzeitpunkt.
3. Sieh die PNG-Dateien an und prüfe Inhalt und Lesbarkeit. Stelle die Bildpaare im PR gegenüber. Verwende GitHub-Anhänge, wenn ein dafür autorisiertes Werkzeug verfügbar ist. Ein freigegebener privater Ablageort mit Links auf einen festen Commit ist als Ausweichweg möglich.
4. Verifiziere Links mit dem vorgesehenen Zugriff auf das Repository und dokumentiere fehlende Aufnahmen mit Grund. Die für README und Doku bestimmten Bilder haben einen eigenen Prüfstand und Lauf.
