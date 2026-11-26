# Desk-Gestaltung

## Farbe und Orientierung

Desk verwendet Blau für Navigation, Fokus und Primäraktionen in Hell und Dunkel. Grün bleibt die Markenfarbe von Haben. Fachzustände werden mit Text benannt und lassen sich ohne Farbe unterscheiden.

Verwende eine konsistente Icon-Komponente mit verständlichen Beschriftungen. Ein allein stehendes Symbol braucht einen zugänglichen Namen. Am Smartphone öffnet ein beschrifteter Menüknopf die Hauptnavigation. Der aktuelle Bereich bleibt erkennbar.

## Aktionen und Formulare

Prominente Aktionen entsprechen dem nächsten sinnvollen Schritt. Nebenaktionen bleiben erkennbar. Hat eine gefährliche Aktion bleibende Folgen, zeigt der Bestätigungsdialog die betroffenen Daten oder die konkrete Folge. Anordnung und Tab-Reihenfolge stimmen überein. Jedes Formularfeld hat ein zugängliches Label. Fokusmarkierungen, Texte und Bedienelemente brauchen ausreichenden Kontrast in beiden Themes.

Zeige Fehler, Lade- und Leerzustände am betroffenen Bereich. Formulare nennen den Grund, wenn eine Aktion nicht verfügbar ist. Daten bleiben nach Fehlern zur Korrektur verfügbar, soweit der Vorgang dies zulässt.

## Aufbau von Arbeitsbereichen

- Zeige beim Öffnen zuerst den aktuellen Arbeitsstand. In detailreichen Ansichten bekommen Inhalte wie ein Nachrichtenverlauf die breite Spalte. Zugehörige Daten und seltene Aktionen stehen daneben. Auf kleinen Bildschirmen folgt der Kontext im Lesefluss.
- Setze im leeren Zustand die nächste sinnvolle Aktion an den Ort, an dem ihr Ergebnis erscheint. Zeige bestehende Werte zum Lesen. Selten geöffnete Bearbeitungsformulare, etwa eine Ticketzuordnung, öffnen sich auf eine beschriftete Aktion im Dialog.
- Formular-Dialoge haben einen benannten Titel, fokussieren das erste relevante Feld und halten die Tastaturbedienung im Dialog. Escape schließt einen bearbeitbaren Dialog. Nach dem Schließen geht der Fokus an den Auslöser zurück, soweit dieser sichtbar bleibt. Fehler im Dialog erhalten die Eingabe.
- Bei Anbindungen richtet sich die Ansicht nach der Arbeit in Desk. Im Projekt liegt der Schwerpunkt auf Verlauf und Antwort. Die Anbindung bleibt an Ticketbezug und der Möglichkeit zum Wechsel in das externe System erkennbar.

## Raster und Schrift

`src/app.css` enthält die Farbrollen, die Schriftgrößen und die gemeinsame Höhe für Bedienelemente. Innenabstände, Außenabstände und Lücken folgen einem 4-Pixel-Raster. Ein-Pixel-Linien und ihr direkter Ausgleich an der Registerleiste folgen der Linienbreite. Schriftgrößen verwenden die Stufen 12, 13, 14, 16, 18, 24 und 28 Pixel. Beschriftungen und Tabellenköpfe stehen in Satzschreibung. Beträge und Kennzahlen verwenden gleich breite Ziffern. Kennungen und Code dürfen eine Festbreitenschrift verwenden.

## Bedienelemente und Seitenaufbau

- Karten und Seitenköpfe haben jeweils eine Hauptaktion. In Aktionszeilen steht sie am Ende. Abbrechen und andere Nebenaktionen stehen davor. Gefährliche Daueraktionen stehen am Anfang und fragen nach Bestätigung. Die Reihenfolge im Markup gibt die sichtbare Reihenfolge und die Tab-Reihenfolge vor.
- Knöpfe, Eingaben und Auswahllisten verwenden die gemeinsame Höhe. Am Smartphone bieten reguläre Ziele mindestens 44 × 44 Pixel. Kompakte Hilfs- und Tabellenaktionen sind anhand ihrer tatsächlich verfügbaren Fläche und ihres Abstands zu prüfen. Knöpfe erhalten einen äußeren Fokusring. An Feldern liegt der Fokusring innen am Rand.
- In Dialogen bleibt der Titel sichtbar und der Inhalt scrollbar. Am Smartphone folgen Dialoge der verfügbaren Bildschirmhöhe, auch mit Bildschirmtastatur. Nach Esc oder Abbrechen kehrt der Fokus zum Auslöser zurück. Unumkehrbare Bestätigungen öffnen zunächst mit Fokus auf der sicheren Aktion.
- Status und Rückmeldungen verbinden sichtbaren Text mit ihrer Farbrolle. Tabellenüberschriften bleiben den Zellen zugeordnet. Beträge sind in gleich breiten Ziffern rechts ausgerichtet. Ein Seitenkopf nennt den Bereich und zeigt die wichtigsten Aktionen und den aktuellen Arbeitsstand.
- Bei hinzugefügten Tastenkürzeln stimmen sichtbare Tastenbezeichnungen, zugängliche Namen und die jeweilige Plattform überein. Änderungen mit Bewegung respektieren die Systemeinstellung für reduzierte Bewegung.

## Übernahme aus Haben

Die Regeln für Farbe, Raster, Schrift, Bedienung, Formulare, Navigation, Status, Karten und Barrierefreiheit gelten für die entsprechenden Desk-Ansichten. Die Buchhaltungseditoren, der Firmenwechsel, die Befehlspalette und die Belegvorschau aus Haben haben in Desk derzeit keine entsprechende Funktion. Bei einer späteren Einführung gelten die zugehörigen Gestaltungsregeln. Die Schraffur kennzeichnet in der Projektkommunikation interne Notizen zusätzlich zu ihrer Textbeschriftung. Sie macht im Nachrichtenverlauf sichtbar, welche Beiträge intern bleiben.

[Gestaltungsregeln von Haben](https://github.com/Speicherstadt/haben/blob/34fff56798bdcb4b5b7f728cf38888b161f65094/DESIGN.md)

## Oberfläche prüfen

Prüfe die Änderung mit Tastatur sowie auf der betroffenen Bildschirmgröße. Bei Änderungen am Aussehen gehören reproduzierbare Vergleichsbilder ins Review. Der [Screenshot-Ablauf](.agents/skills/desk-pr-screenshots/SKILL.md) beschreibt die Aufnahme.
