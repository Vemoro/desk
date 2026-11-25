# Release-Notizen

Jeder veröffentlichte Eintrag nennt Version und Datum. Er fasst Änderungen für Nutzende, Schritte für die Aktualisierung und bekannte Einschränkungen zusammen.

## 0.1.0.0 – unveröffentlicht

Desk ist eine selbst gehostete Projektverwaltung für kleine Teams. Die erste Version deckt den Ablauf von der Kundenanfrage bis zur dokumentierten Rechnungsreferenz ab. Dieser Entwurf bezieht sich auf den Anwendungskandidaten [`f7de6a0`](https://github.com/Vemoro/desk/commit/f7de6a0e3bec3d25e3bc0b1bb7f49071110f355b). [Abnahmeprotokoll](https://github.com/Vemoro/desk/issues/204)

### Projekte, Planung und Lager

- Kontakte, Projekte und Aufgaben im Kanban verwalten, Einkauf und Verkauf kalkulieren und belegbezogene Ist-Kosten Projekten zuordnen. Die Kontaktdetailansicht verlinkt zugehörige Projekte. Beim Anlegen von Kontakten weist Desk auf mögliche Dubletten hin. [Projektablauf](docs/desk.md#ein-auftrag) · [Kontakte und Projekte](https://github.com/Vemoro/desk/pull/76) · [Dublettenhinweis](https://github.com/Vemoro/desk/pull/72)
- Personal und Material im Projekt vormerken und die Belegung in der Wochenplanung einsehen. Das Projektlager zeigt je Lagerort, was physisch vorhanden, reserviert und frei ist. Geräte lassen sich anhand ihrer Inventarnummer unterscheiden. Wareneingang und Verbrauch können mit einer begründeten Gegenbuchung korrigiert werden. [Wochenplanung](https://github.com/Vemoro/desk/pull/261) · [Inventarnummern](https://github.com/Vemoro/desk/pull/258) · [Lagerkorrekturen](https://github.com/Vemoro/desk/pull/257)
- Der Projektverlauf hält Statuswechsel, Festlegungen und Freigaben von Reservierungen sowie Lagerbewegungen fest. Auf Smartphones öffnet sich die Navigation über **Menü**. [Projektverlauf](https://github.com/Vemoro/desk/pull/260) · [Handymenü](https://github.com/Vemoro/desk/pull/18)

### Konten, API und Anbindungen

- Unter **Mein Konto** können Nutzende das Passwort ändern, Passkeys verwalten und die installierte Desk-Version für einen Fehlerbericht kopieren. Ist im Build ein Git-Commit hinterlegt, wird er mit kopiert. Die Administration kann Teamkonten sperren und wieder freigeben. [Passkeys](docs/desk.md#passkeys) · [Passwort ändern](https://github.com/Vemoro/desk/pull/259) · [Kontozugriff](https://github.com/Vemoro/desk/pull/256) · [Versionsanzeige](https://github.com/Vemoro/desk/pull/227)
- Der laufende Dienst stellt seine OpenAPI-Beschreibung unter `/api/v1/openapi.json` bereit. Die Administration kann Desk-API-Tokens ausstellen und widerrufen. [Seitennavigation der REST-API](docs/desk.md#seitennavigation-der-rest-api)
- Haben und Zammad sind optional. Desk kann vorhandene Haben-Angebote verknüpfen, ihren Status lesen und Kontakte mit Haben abgleichen. Ohne Anbindungen lassen sich externe Vorgänge als Referenzen, Links und Notizen am Projekt erfassen. [Haben](docs/desk.md#haben) · [Zammad](docs/desk.md#zammad) · [Installationswege mit und ohne Zammad](docs/installation.md)
- Unter **Kommunikation** zeigt Desk im Projekt den Zammad-Verlauf und das Antwortfeld. Tickets lassen sich über einen Dialog anlegen oder verknüpfen. Die Suche filtert Betreff und Nachrichtentext der geladenen Nachrichten. Antworten können einen PDF-Anhang enthalten. [Kommunikationsansicht](https://github.com/Vemoro/desk/pull/274) · [Verlaufssuche](https://github.com/Vemoro/desk/pull/275)

### Installation und Aktualisierung

- Für eine Erstinstallation eine leere PostgreSQL-17-Datenbank migrieren und das erste Administrationskonto anlegen. Eine bestehende Zammad-Instanz lässt sich optional anbinden. Der gemeinsame Aufbau mit einer neuen Zammad-Instanz steht noch zur Abnahme aus. Der Desk-Lizenztext liegt auch im Laufzeit-Image. [Installation](docs/installation.md) · [Lizenzinventar](docs/lizenzinventar.md)
- Bei einer vorhandenen Desk-Entwicklungsinstanz den Dienst vor dem Wechsel anhalten, PostgreSQL und die Laufzeitkonfiguration sichern und die Wiederherstellung getrennt prüfen. Die neue Version erst nach erfolgreicher Migration starten. [Sicherung und Wiederanlauf](docs/sicherung.md#upgrade-und-wiederanlauf-proben)
- `DESK_AUTH_SECRET` dauerhaft setzen und für `DESK_ORIGIN` die tatsächliche Browseradresse verwenden. Das Team meldet sich nach dem Wechsel auf Better Auth neu an. Wurde Better Auth bereits migriert, die Sitzungen beider Versionen vor dem Wechsel gemäß Betriebsanleitung widerrufen. Passkeys gelten für den Host der Anmeldeadresse. [Update auf Better Auth](docs/desk.md#update-auf-better-auth)

### Bekannte Einschränkungen und offene Abnahme

- Angebote und Rechnungen entstehen in Haben oder im eingesetzten Abrechnungssystem. Desk übergibt Angebotspositionen als CSV. Ist-Kosten lassen sich per Belegreferenz zuordnen oder aus einer CSV übernehmen. Angebotsentwürfe und der Abruf projektbezogener Ist-Kosten in Haben sind offene Schnittstellenaufgaben. [Angebotsentwürfe](https://github.com/Vemoro/desk/issues/5) · [Projektbezogene Ist-Kosten](https://github.com/Vemoro/desk/issues/6)
- Ticketanlage, Verknüpfung und Verlauf wurden mit Desk-Build `b1538c0` auf der vorgesehenen Zammad-Testinstanz geprüft. Build `50e8868` lieferte eine Antwort mit PDF über einen isolierten SMTP-Testkanal aus. Der Empfang an einem separaten Postfach über den eingerichteten Mailkanal und die Abnahme von Kontaktabgleich und Angebotsstatus an der vorgesehenen Haben-Instanz stehen aus. [Abnahme des Release-Kandidaten](https://github.com/Vemoro/desk/issues/204)
