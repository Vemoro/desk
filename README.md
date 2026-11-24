# Desk

Desk hilft kleinen projektorientierten Teams, Kundenaufträge von der Anfrage bis zur Abrechnung zu organisieren. Kontakte, Aufgaben, Ressourcen, Lager und Kosten laufen im Projekt zusammen.

Der allgemeine Desk-Kern ist in Entwicklung. Dieses Repository dokumentiert den aktuellen Funktionsumfang und den lokalen Einstieg.

## Vom Erstkontakt bis zur Abrechnung

1. Den Kontakt im CRM erfassen, ein Projekt anlegen und Aufgaben mit Termin und Zuständigkeit im Kanban verteilen.
2. Personal und Inventar vormerken sowie Einkauf und Verkauf kalkulieren. Nach der Auftragsbestätigung lassen sich Ressourcen fest buchen.
3. Im Projektlager Bestände je Lagerort prüfen und Wareneingang, Ausgabe, Rückgabe oder Verbrauch buchen.
4. Geplante Einkaufskosten mit den zugeordneten Ist-Kosten vergleichen. Angebots- und Rechnungsreferenzen am Projekt hinterlegen.

Projektarbeit, Kalkulation, Lager und Controlling stehen in Desk eigenständig zur Verfügung. Die REST-API stellt Kernressourcen über widerrufbare Tokens bereit. Ihre OpenAPI-Beschreibung liegt in der laufenden Instanz unter `/api/v1/openapi.json`.

### Optionale Anbindungen

- **Haben** erstellt Angebote und Rechnungen. Desk kann Verkaufspositionen als CSV für die Übergabe bereitstellen und ein vorhandenes Angebot über seine ID verknüpfen. Bei eingerichteter Anbindung liest Desk den Angebotsstatus ein. Kontakte lassen sich mit Haben abgleichen. Angebotsbestätigung und Referenzen können auch von Hand gepflegt werden.
- **Zammad** führt den Ticketverlauf und versendet Antworten aus dem Projekt. In Desk lässt sich ein vorhandenes Ticket verknüpfen oder ein neues anlegen. Ohne Zammad stehen ein Vorgangslink und eine Kommunikationsnotiz am Projekt zur Verfügung.

## Lokal starten

Für den lokalen Einstieg brauchst du Bun in der in `package.json` angegebenen Version und PostgreSQL. Die Compose-Datei stellt mit Docker Compose eine lokale Entwicklungsdatenbank bereit.

1. Im Repository `docker compose up -d db` ausführen.
2. `.env.example` als `.env` kopieren. `DATABASE_URL` prüfen und `DESK_ORIGIN` auf `http://127.0.0.1:3000` setzen.
3. `bun install --frozen-lockfile` und danach `bun run migrate` ausführen.
4. Ein eigenes Passwort als Umgebungsvariable `DESK_ADMIN_PASSWORD` setzen. Das Konto mit `bun run admin admin@example.test "Desk Admin"` anlegen.
5. `bun run dev --port 3000 --strictPort` ausführen und `http://127.0.0.1:3000` öffnen. Bei einem abweichenden Port `DESK_ORIGIN` und die Browseradresse entsprechend anpassen.

Für einen dauerhaften Betrieb gelten die Hinweise zu Build, Container, HTTPS und Sicherung. [Installation und Betrieb](docs/desk.md#betrieb)

## Einblick in die Demo

Die Bilder zeigen die Veranstaltungsbetreuung des fiktiven Muster Auftragsservice. Die Demo-Daten und Bilder lassen sich in einer separaten Testinstanz erzeugen. [Demo und Screenshots](docs/entwicklung.md#befehle-und-screenshot-workflow)

### Kanban

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/kanban-dunkel.png">
  <img src="docs/screenshots/kanban-hell.png" alt="Projekt-Kanban mit den Spalten Offen, In Arbeit, Prüfung und Erledigt">
</picture>

### Controlling

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/controlling-dunkel.png">
  <img src="docs/screenshots/controlling-hell.png" alt="Projektcontrolling mit geplanten Einkaufskosten, Ist-Kosten, Abweichung und zugehörigem Beleg">
</picture>

Weitere Ansichten, einschließlich des Projektlagers auf dem Smartphone, stehen in der Betriebsdoku. [Ansichten](docs/desk.md#ansichten)

## Mitwirken

Die Entwicklungsdoku beschreibt lokale Prüfungen, Reviews und Beiträge. Desk steht unter der AGPL-3.0-only. [Entwicklung und Beiträge](docs/entwicklung.md) · [Lizenz](LICENSE)
