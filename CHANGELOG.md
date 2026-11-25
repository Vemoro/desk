# Release-Notizen

Jeder veröffentlichte Eintrag nennt Version und Datum. Er fasst Änderungen für Nutzende, Schritte für die Aktualisierung und bekannte Einschränkungen zusammen. Zugehörige Änderungen sind direkt verlinkt.

## Unveröffentlicht

Der Entwurf für die erste Freigabe enthält die Änderungen bis zum geprüften Entwicklungsstand [`939c5b2`](https://github.com/Vemoro/desk/commit/939c5b20cc698750141f495b80463ab3dd4977d8). Die Freigabe steht aus. [Prüfplan für einen Release-Kandidaten](docs/release-abnahme.md)

### Änderungen für Nutzende

- Desk verwaltet Kontakte und Projekte von der Anfrage bis zur Rechnungsreferenz. Teams bearbeiten Aufgaben im Kanban, planen Personal und Material, buchen Lagerbewegungen je Lagerort und vergleichen geplante mit belegbezogenen Ist-Kosten. [Projektablauf und Betriebsdoku](docs/desk.md) · [PR #7](https://github.com/Vemoro/desk/pull/7)
- Die Navigation öffnet sich auf dem Smartphone über **Menü**. Unter **Mein Konto** können Nutzende Passkeys verwalten und die Desk-Version für einen Fehlerbericht kopieren. Enthält der Build eine Commit-Angabe, lässt sie sich zusammen mit der Version kopieren. [Handymenü](https://github.com/Vemoro/desk/pull/18) · [Passkeys](https://github.com/Vemoro/desk/pull/32) · [Versionsanzeige](https://github.com/Vemoro/desk/pull/227)
- Die Administration kann den Lesezugriff auf ein Zammad-Testticket und dessen Verlauf in den Einstellungen prüfen. Bei ungültigen Basisadressen nennt Desk die betroffene Anbindung. [Zammad-Lesetest](https://github.com/Vemoro/desk/pull/193) · [Konfigurationsfehler](https://github.com/Vemoro/desk/pull/219)

### Aktualisierung und Betrieb

- Sichere PostgreSQL und die Laufzeitkonfiguration. Prüfe die Wiederherstellung getrennt. Halte den bisherigen Dienst vor dem Versionswechsel an. Wende die Migrationen mit dem neuen Auslieferungsstand an, bevor der aktualisierte Dienst für Nutzende startet. [Sicherung und Wiederanlauf](docs/sicherung.md)
- Nach bereits angewendeter Migration `002_better_auth.sql` widerrufe beim Versionswechsel die Sitzungen beider Versionen nach der Betriebsanleitung. Das Team meldet sich neu an. Beim ersten Wechsel auf Better Auth ist ebenfalls eine neue Anmeldung erforderlich. Setze `DESK_AUTH_SECRET` dauerhaft und verwende für `DESK_ORIGIN` die tatsächliche Browseradresse. Passkeys gelten für den Host dieser Adresse. [Update auf Better Auth](docs/desk.md#update-auf-better-auth) · [Passkeys](docs/desk.md#passkeys)

### Bekannte Einschränkungen

- Angebote und Rechnungen entstehen in Haben oder einem anderen Abrechnungssystem. Desk kann Angebotspositionen als CSV übergeben und vorhandene Angebote verknüpfen. Ist-Kosten lassen sich per Belegreferenz zuordnen oder als CSV übernehmen. [Angebotsentwürfe in Haben](https://github.com/Vemoro/desk/issues/5) · [Projektbezogene Ist-Kosten in Haben](https://github.com/Vemoro/desk/issues/6)
- Die Abnahme am vorgesehenen Haben und Zammad wird im Release-Prüfprotokoll nachgehalten. [Abnahme des Release-Kandidaten](https://github.com/Vemoro/desk/issues/204)
