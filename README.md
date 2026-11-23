# Desk

Desk organisiert kundenbezogene Aufträge von der Anfrage bis zur Abrechnung. Ein Projekt verbindet Kontakte, Kanban, Personal- und Zeitplanung, Projektlager, Kalkulation und Ist-Kosten. Haben kann Angebote und Abrechnung übernehmen. Zammad kann den Nachrichtenverlauf und Versand übernehmen.

## Lokal starten

Bun und PostgreSQL werden benötigt. Für eine lokale Entwicklungsdatenbank liegt eine Compose-Datei bei.

1. `docker compose up -d db`
2. `.env.example` als `.env` kopieren, die Datenbankadresse prüfen und `DESK_AUTH_SECRET` mit einem zufälligen Wert aus mindestens 32 Zeichen belegen.
3. `bun install --frozen-lockfile` und `bun run migrate`
4. `DESK_ADMIN_PASSWORD` im Prozess setzen, dann `bun run admin admin@example.test "Desk Admin"`.
5. `bun run dev` starten und die von Vite ausgegebene Adresse öffnen. `DESK_ORIGIN` muss dieser Adresse entsprechen.

[Benutzung und Betrieb](docs/desk.md) · [Entwicklung und Screenshots](docs/entwicklung.md) · [AGPL-3.0](LICENSE)

## Einblick

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/kanban-dunkel.png">
  <img src="docs/screenshots/kanban-hell.png" alt="Kanban mit vier Aufgabenständen im Projekt von Muster Auftragsservice">
</picture>
