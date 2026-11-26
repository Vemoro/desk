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
- Ein Status zeigt einen Farbpunkt und eine eindeutige Bezeichnung. Ergänze bei Bedarf eine kurze Erklärung unter dem Statuswort. Rückmeldungen verbinden sichtbaren Text mit ihrer Farbrolle. Tabellenüberschriften bleiben den Zellen zugeordnet. Beträge sind in gleich breiten Ziffern rechts ausgerichtet. Ein Seitenkopf nennt den Bereich und zeigt die wichtigsten Aktionen und den aktuellen Arbeitsstand.
- Bei hinzugefügten Tastenkürzeln stimmen sichtbare Tastenbezeichnungen, zugängliche Namen und die jeweilige Plattform überein. Änderungen mit Bewegung respektieren die Systemeinstellung für reduzierte Bewegung.

## Übernahme aus Haben

| Bereich in Haben | Anwendung in Desk |
| --- | --- |
| Farbe, Schrift und Abstände | Blaue Akzente in beiden Themes, neutrale Dunkelflächen, 4-Pixel-Raster, Schriftstufen, kontrastreiche Fokus- und Feldrahmen. |
| Knöpfe und Rückfragen | Hauptaktion ans Ende, klar erkennbare Gefahraktionen, Rückfrage bei bleibenden Folgen. „Abbrechen“ erhält den ersten Fokus. |
| Navigation und Einstellungen | Marke und Menüpunkte mit Symbolnamen, eindeutige aktive Ansicht, beschriftetes Aufklappmenü am Smartphone. Eine künftige Einstellungen-Navigation folgt dem Haben-Muster mit Namen und kurzer Inhaltsangabe. |
| Kennzahlen, Status, Seitenkopf und Karten | Gleich breite Ziffern, Statuswort mit Farbpunkt, aktuelle Informationen zuerst, Titel und passende Hauptaktion je Bereich. |
| Felder und Ablauf | Gemeinsames Feld mit Label, Hinweis und Fehlermeldung, Fokus auf dem ersten Fehler, deutsche Dateiauswahl mit Dateinamen, klare Rückmeldung bei gesperrten Aktionen. |
| Blätter am Handy und Barrierefreiheit | Dialoge und Bestätigungen werden bei kleiner Bildschirmhöhe und mit Tastatur geprüft. Desk hält die gemeinsame DOM- und Lesereihenfolge in Dialogen auch mobil ein. |

Buchhaltungseditoren, Firmenwechsel, Befehlspalette, Monatsauswahl und Belegvorschau erhalten die zugehörigen Gestaltungsregeln, sobald Desk eine entsprechende Funktion anbietet. Die Schraffur kennzeichnet interne Notizen zusätzlich zur Textbeschriftung. Sie macht im Nachrichtenverlauf sichtbar, welche Beiträge intern bleiben.

Die vollständige Bestandsabnahme vor 0.2.0.0 umfasst die Gestaltung und die Feldbedienung. [Gestaltungsabnahme](https://github.com/Vemoro/desk/issues/218) · [Feldabnahme](https://github.com/Vemoro/desk/issues/219)

[Gestaltungsregeln von Haben](https://github.com/Speicherstadt/haben/blob/34fff56798bdcb4b5b7f728cf38888b161f65094/DESIGN.md)

## Oberfläche prüfen

Prüfe die Änderung mit Tastatur sowie auf der betroffenen Bildschirmgröße. Bei Änderungen am Aussehen gehören reproduzierbare Vergleichsbilder ins Review. Der [Screenshot-Ablauf](.agents/skills/desk-pr-screenshots/SKILL.md) beschreibt die Aufnahme.

Der Axe-Lauf prüft ausgewählte Zustände in Chromium auf automatisierbare WCAG-AA-Kriterien. Er erfasst Anmeldung, Übersicht, Projektliste, Musterprojekt mit Kanban, Ressourcen, Controlling und Zammad-Editor sowie Lager, Woche, Kontakte, Konto, Einstellungen, Ist-Kosten und den Sperrdialog. Er läuft für Hell und Dunkel auf Desktop und Smartphone. Ergänze die Ergebnisse um eine Tastatur- und Sichtprüfung. Teste bei Feldern den Zugang zum ersten Fehler, seine Behebung und den Tastaturfokus nach dem Schließen eines Dialogs.

Textfelder, Auswahllisten und mehrzeilige Eingaben verwenden `Field`. `bun run check:fields` prüft, ob native Feld-Tags innerhalb von `Field` stehen und einen JSX-Spread verwenden. Der Browserlauf prüft die wirksamen zugänglichen Namen. Die beiden einzeln zugelassenen Checkboxen für freie Lagerbestände und andere Browsersitzungen behalten direkt zugeordnete Labels.

Eine geführte Aufgabe mit fester Reihenfolge zeigt eine geordnete Liste. `aria-current="step"` kennzeichnet den aktuellen Schritt und ein Textlabel die erledigten Schritte. Projektzustände und Kanban-Spalten bleiben als solche erkennbar, weil sie auch bei wechselnder Reihenfolge den Arbeitsstand abbilden.
