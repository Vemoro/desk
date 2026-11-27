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
| Navigation und Einstellungen | Marke und Menüpunkte mit Symbolnamen, eindeutige aktive Ansicht, beschriftetes Aufklappmenü am Smartphone. Einstellungsbereiche orientieren sich an vorhandenen Aufgaben in Desk. |
| Kennzahlen, Status, Seitenkopf und Karten | Gleich breite Ziffern, Statuswort mit Farbpunkt, aktuelle Informationen zuerst, Titel und passende Hauptaktion je Bereich. |
| Felder und Ablauf | Gemeinsames Feld mit Label, Hinweis und Fehlermeldung, Fokus auf dem ersten Fehler, deutsche Dateiauswahl mit Dateinamen, klare Rückmeldung bei gesperrten Aktionen. |
| Blätter am Handy und Barrierefreiheit | Dialoge und Bestätigungen werden bei kleiner Bildschirmhöhe und mit Tastatur geprüft. Desk hält die gemeinsame DOM- und Lesereihenfolge in Dialogen auch mobil ein. |

Buchhaltungseditoren, Firmenwechsel, Monatsauswahl und Belegvorschau erhalten eigene Gestaltungsregeln, sobald Desk eine entsprechende Funktion anbietet. Die Schraffur kennzeichnet interne Notizen zusätzlich zur Textbeschriftung. Sie macht im Nachrichtenverlauf sichtbar, welche Beiträge intern bleiben.

Die Bestandsabnahme für 0.2.0.0 prüft das bisherige Gestaltungsraster und die Feldbedienung. [Gestaltungsabnahme](https://github.com/Vemoro/desk/issues/218) · [Feldabnahme](https://github.com/Vemoro/desk/issues/219)

[Gestaltungsregeln von Haben](https://github.com/Speicherstadt/haben/blob/e3ece9cbc19c4b649d35693fd13e27bbf49a1f3a/DESIGN.md)

## Regeln für Arbeitsansichten

Diese Regeln gehören ab 0.2.0.0 zum Desk-Design. Die Aufgaben für die Anpassung bestehender Ansichten sind im Meilenstein 0.3.0.0 geplant. Regeln für später benötigte Bedienelemente gelten, sobald diese eingesetzt werden. [Meilenstein 0.3.0.0](https://github.com/Vemoro/desk/milestone/3)

### Einstellungen

- Gliedere die Einstellungen nach Aufgaben wie Team, API-Zugriff und Integrationen. Name und kurze Inhaltsangabe helfen bei der Wahl. Aktiven Bereich und Berechtigungen zeigt die Navigation konsistent.
- Am Desktop steht die Bereichsliste neben dem Inhalt. Am Smartphone öffnet die Liste den gewählten Bereich mit sichtbarem Rückweg. Direktlinks, Neuladen und Browser-Zurück erhalten die Navigation. Beim Öffnen führt der Fokus zum Bereichstitel, beim Rückweg zur Liste zum zuvor gewählten Eintrag, sofern er noch existiert.

### Seitenköpfe, Karten und leere Listen

- In vergleichbaren Ansichten steht der Seitenkopf vor dem Arbeitsinhalt. Er zeigt den Titel und vorhandene Hauptaktionen. Ein Zustand des ganzen Objekts steht beim Titel. Bei fixierten Kopf- oder Aktionsleisten bleiben angesprungene oder fokussierte Inhalte sichtbar.
- Ein echter Leerstand nennt, was hier entsteht. Wenn die Person anlegen darf, führt er zur passenden Aktion. Ein Filter ohne Treffer nennt die Einschränkung und bietet das Zurücksetzen an. Ladefehler zeigen den betroffenen Bereich und lassen sich dort wiederholen, wenn der Vorgang wiederholbar ist.
- Eine Karte bündelt genau den zusammengehörigen Inhalt. Wenn ein Dialog schon die umgebende Fläche bildet, erhält das Formular darin keinen zusätzlichen Kartenrahmen. Bei Auswahlkarten bleiben Auswahl und Fokus separat erkennbar. Kennzahlen erhalten Einheit oder Zeitraum, wenn der Wert sonst mehrdeutig ist.

### Aktionen in Listen und Tabellen

- Platziere Aktionen am Ende der Zeile. Die häufige Aktion bleibt direkt erreichbar. Seltene Aktionen können in ein gemeinsames Menü am Ende, wenn mehrere Aktionen anfallen. Stehen eine Hauptaktion und eine gefährliche Daueraktion gemeinsam in einer Zeile, steht die gefährliche Aktion zu Beginn der Aktionsgruppe. Ein Inhaltslink bleibt in seiner Zelle. Eine irreversible Aktion verwendet den gemeinsamen Bestätigungsdialog.
- Reicht ein Symbol allein, bekommt es einen zugänglichen Namen mit Objektbezug, sobald mehrere gleichartige Aktionen sichtbar sind. Der Menüauslöser und seine Inhalte werden per Tastatur bedient. Escape gibt den Fokus an den Auslöser zurück. Wenn eine Zeile verschwindet, erhält ein sinnvoller Nachfolger den Fokus.
- Bietet dieselbe Aufgabe mehrere Wege, benennt der Auslöser die Aufgabe. Braucht ein Weg eine weitere Entscheidung, kann ein eigener Dialog die Optionen und ihre Folgen erklären. Eine sichtbare, vorübergehend gesperrte Option nennt den Grund an der Option.
- Auf schmalen Ansichten behält jede Zeile ihre Zuordnung von Bezeichnung, Wert und Aktionen. Halte zusätzliche Bedienelemente aus einem übergeordneten anklickbaren Bereich heraus, damit Zeilenauswahl und Aktion unabhängig bedienbar bleiben.

### Voraussetzungen, Felder und Auswahl

- Bei fehlenden oder ungültigen Formulareingaben bleibt die Hauptaktion erreichbar. Die Prüfung beim Absenden erklärt den Fehler am zugehörigen Feld und führt den Fokus zum ersten korrigierbaren Fehler. Ein fachlicher Sperrgrund steht unmittelbar bei der Aktion und ist mit ihr zugänglich verknüpft. Liegt die Ursache an anderer Stelle, verweise auf den für die Rolle erreichbaren Weg zur Behebung. Bei laufenden Aktionen benennt die Oberfläche den Vorgang.
- Kleine feste Listen verwenden native Auswahlelemente. Bei wachsenden Objektlisten wie Kontakten oder Artikeln verwende ein durchsuchbares Feld mit klaren Trefferbezeichnungen und unterscheidbarem Kontext. Auswahl, Abbruch und leere Treffer funktionieren per Tastatur und Touch. Pflicht und optionale Auswahl folgen der gemeinsamen Feldlogik.
- Seltene Angaben können einklappen. Ein Fehler in einem eingeklappten Bereich macht das betroffene Feld zugänglich, bevor der Fokus dorthin geht. Hinweise und Fehlermeldungen gehören zum Feld, ohne Teil seines Namens zu werden.
- Dateiauswahl innerhalb eines Formulars zeigt den Dateinamen vor dem Absenden. Ein eigenständiger Sofort-Upload ist als Aktion benannt und meldet den Fortschritt oder Ausgang. Verwende für beide Wege den nativen Dateidialog.

### Status und Handlungsbedarf

- Verwende gemeinsame Statusrollen für Projekt, Reservierung und Versand. Der sichtbare Kurztext nennt den fachlichen Zustand. Eine zusätzliche Zeile nennt bei Bedarf den Grund, Termin oder die nächste Aktion, sofern die Information für die Entscheidung fehlt.
- Wartezustände bleiben visuell ruhig. Markiere klaren Handlungsbedarf und hebe akute Fälle wie überschrittene Fristen oder fehlgeschlagene Vorgänge sichtbar hervor. Die Fachlogik bestimmt die Stufe. Punkt und Farbe ergänzen verständlichen Text.
- Kennzeichnungen wie Rolle und Kategorie bleiben Merkmale. In Listen bleibt die Zuordnung des Status zur Zeile auch am Smartphone eindeutig.

### Mobile Bestätigungen

- Verwende den gemeinsamen Bestätigungsdialog. Sein Titel benennt das betroffene Objekt und der Text erklärt die Folge. Am Smartphone kann die Bestätigung am unteren Bildschirmrand stehen. Der Inhalt scrollt, während Abbrechen und Bestätigen erreichbar bleiben. Berücksichtige den unteren sicheren Bildschirmrand.
- Abbrechen bekommt zuerst den Fokus. Escape, Abbrechen und eine gegebenenfalls angebotene Wischgeste haben dieselbe Bedeutung. Die Tab-Reihenfolge folgt der sichtbaren Reihenfolge. Formular-Dialoge folgen weiterhin ihrem eigenen Eingabeablauf.

### Tastenkürzel und Suche

- Weise neue Kürzel im zugehörigen Menü oder Auslöser aus. Passe Steuertasten an die Plattform an und verwende Tasten, die auf deutschsprachigen Tastaturen direkt erreichbar sind.
- Die globale Suche zeigt erlaubte Ziele, beschriftete Treffer und ausreichenden Kontext für die Auswahl. Neu eingeführte Kürzel verdrängen weder Eingaben noch den geöffneten Dialog. [Navigation für 0.3.0.0](https://github.com/Vemoro/desk/issues/230)

## Oberfläche prüfen

Prüfe die Änderung mit Tastatur sowie auf der betroffenen Bildschirmgröße. Bei Änderungen am Aussehen gehören reproduzierbare Vergleichsbilder ins Review. Der [Screenshot-Ablauf](.agents/skills/desk-pr-screenshots/SKILL.md) beschreibt die Aufnahme.

Der Axe-Lauf prüft ausgewählte Zustände in Chromium auf automatisierbare WCAG-AA-Kriterien. Er erfasst Anmeldung, Übersicht, Projektliste, Musterprojekt mit Kanban, Ressourcen, Controlling und Zammad-Editor sowie Lager, Woche, Kontakte, Konto, Einstellungen, Ist-Kosten und den Sperrdialog. Er läuft für Hell und Dunkel auf Desktop und Smartphone. Ergänze die Ergebnisse um eine Tastatur- und Sichtprüfung. Teste bei Feldern den Zugang zum ersten Fehler, seine Behebung und den Tastaturfokus nach dem Schließen eines Dialogs.

Textfelder, Auswahllisten und mehrzeilige Eingaben verwenden `Field`. `bun run check:fields` prüft, ob native Feld-Tags die Attribute des `Field`-Callbacks per Spread erhalten. Der Browserlauf prüft die zugänglichen Namen. Die beiden einzeln zugelassenen Checkboxen für freie Lagerbestände und andere Browsersitzungen behalten direkt zugeordnete Labels.

Eine geführte Aufgabe mit fester Reihenfolge zeigt eine geordnete Liste. `aria-current="step"` kennzeichnet den aktuellen Schritt und ein Textlabel die erledigten Schritte. Projektzustände und Kanban-Spalten bleiben als solche erkennbar, weil sie auch bei wechselnder Reihenfolge den Arbeitsstand abbilden.
