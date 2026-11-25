# Desk

**Projektverwaltung für kleine Teams, die Aufträge von der Anfrage bis zur Abrechnung organisieren.** In Desk erfasst du den Kundenkontakt, planst Aufgaben, Personal und Material und siehst, was der Auftrag kostet. Desk läuft auf deinem eigenen Server.

[Warum Desk?](#warum-desk) · [So läuft ein Auftrag](#so-läuft-ein-auftrag) · [Funktionen](#funktionen) · [Haben und Zammad](#haben-und-zammad) · [Schnellstart](#schnellstart)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/kanban-dunkel.png">
  <img src="docs/screenshots/kanban-hell.png" alt="Kanban einer Veranstaltungsbetreuung mit Aufgaben in Offen, In Arbeit, Prüfung und Erledigt" width="900">
</picture>

*Der fiktive Muster Auftragsservice bereitet eine Veranstaltungsbetreuung vor.*

> [!NOTE]
> Desk befindet sich in Entwicklung. Die erste öffentliche Version ist in Vorbereitung. [Roadmap](docs/roadmap.md) · [Release-Abnahme](docs/release-abnahme.md) · [Release-Notizen](CHANGELOG.md)

## Warum Desk?

Bei einem Auftrag greifen viele Entscheidungen ineinander. Ist das Angebot bestätigt? Wer steht am Einsatztag zur Verfügung? Welches Material ist noch frei? Welche Belege gehören zum Projekt? In Desk hängen diese Antworten am selben Auftrag. Das hilft bei einer Veranstaltungsbetreuung genauso wie bei einer Büroinstallation.

Desk führt die operative Arbeit zusammen. Angebote und Rechnungen erstellst du weiterhin in Haben oder in deinem Abrechnungssystem. Projektplanung, Lager und Controlling funktionieren auch mit manuell erfassten Angebots- und Rechnungsreferenzen.

## So läuft ein Auftrag

1. **Anfrage aufnehmen.** Lege den Kontakt und das Projekt an. Desk zeigt mögliche Kontaktdubletten und führt vom Kontaktdetail direkt zu den zugehörigen Projekten.
2. **Einsatz vorbereiten.** Verteile Aufgaben im Kanban, merke Personal und Inventar vor und kalkuliere Einkauf und Verkauf. Verkaufspositionen kannst du als CSV an die Angebotserstellung übergeben.
3. **Verbindlich planen.** Erfasse die Bestätigung oder lies den Status eines verknüpften Haben-Angebots ein. Bei der festen Reservierung prüft Desk, ob Personal und Material verfügbar sind.
4. **Auftrag ausführen und abschließen.** Erfasse Ausgabe, Rückgabe und Verbrauch, ordne Ist-Kosten zu und vergleiche sie mit der Kalkulation. Hinterlege die Rechnungsreferenz am Projekt.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/controlling-dunkel.png">
  <img src="docs/screenshots/controlling-hell.png" alt="Controlling mit geplanten Einkaufskosten, belegbezogenen Ist-Kosten, Abweichung und geplantem Verkauf" width="900">
</picture>

*Im Controlling des Musterauftrags stehen Kalkulation und zugeordnete Belege zusammen.*

## Funktionen

| Bereich | Was Desk abdeckt |
| --- | --- |
| CRM und Projekte | Kontakte, Projektstatus, Termine, Angebots- und Rechnungsreferenzen sowie Projektverlauf |
| Kanban und Wochenplanung | Aufgaben mit Verantwortlichen und Terminen sowie projektübergreifende Sicht auf Personal- und Inventarreservierungen |
| Kalkulation und Projektlager | Einkaufs- und Verkaufspositionen, physischer, reservierter und freier Bestand je Lagerort sowie Wareneingang, Ausgabe, Rückgabe und Verbrauch |
| Controlling | Plan- und Ist-Kosten, manuelle Belegzuordnung und CSV-Import |
| Team und API | Rollen für Administration und Mitarbeit, Anmeldung mit Passwort oder Passkey und eine versionierte REST-API mit widerrufbaren Tokens. Die OpenAPI-Beschreibung liegt unter `/api/v1/openapi.json`. |

Die Oberfläche ist auf Deutsch und bietet ein helles und dunkles Design. Auf dem Smartphone öffnest du die Navigation über das Menü. [Weitere Ansichten](docs/desk.md#ansichten) · [Navigation am Smartphone](docs/desk.md#navigation-am-smartphone)

## Haben und Zammad

**Haben für Angebote und Rechnungen.** Desk exportiert Verkaufspositionen als CSV, liest den Status verknüpfter Angebote und gleicht einzelne verknüpfte Kontakte auf Anstoß in beide Richtungen ab. In Haben erstellst du Angebot und Rechnung. [Haben](https://haben.app/) · [Desk-Anbindung und Kontaktabgleich](docs/desk.md#haben)

**Zammad für die Kommunikation.** Ein Projekt kann ein neues oder bestehendes Ticket verknüpfen. Desk zeigt den Verlauf und übergibt Antworten mit PDF-Anhang an Zammad. Ohne Anbindung hältst du Vorgangslink und Kommunikationsnotiz am Projekt fest. [Desk-Zammad-Anbindung](docs/desk.md#zammad)

## Schnellstart

Du brauchst die in `package.json` angegebene Bun-Version sowie PostgreSQL. Für die lokale Entwicklungsdatenbank kannst du Docker Compose verwenden.

1. Im Repository `docker compose up -d db` ausführen.
2. `.env.example` als `.env` kopieren. `DATABASE_URL` prüfen und `DESK_AUTH_SECRET` mit einem zufälligen Wert aus mindestens 32 Zeichen belegen.
3. `bun install --frozen-lockfile` und danach `bun run migrate` ausführen.
4. Ein eigenes Passwort als Umgebungsvariable `DESK_ADMIN_PASSWORD` setzen. Das Konto mit `bun run admin admin@example.test "Desk Admin"` anlegen.
5. `bun run dev --port 5173 --strictPort` starten und `http://localhost:5173` öffnen. Bei einem anderen Port `DESK_ORIGIN` an die Browseradresse anpassen.

[Installation und Betrieb](docs/desk.md#betrieb) · [Demo und Screenshots](docs/entwicklung.md#befehle-und-screenshot-workflow)

## Mitwirken

Desk steht unter der AGPL-3.0-only. Mit Zugriff auf das derzeit private Repository kannst du Fehler melden, Vorschläge einbringen oder einen Beitrag vorbereiten. [Mitwirken](CONTRIBUTING.md) · [Sicherheitsmeldungen](SECURITY.md) · [Entwicklungsregeln](docs/entwicklung.md) · [Lizenz](LICENSE)
