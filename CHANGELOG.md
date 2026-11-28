# Release-Notizen

Jeder veröffentlichte Eintrag nennt Version und Datum. Er fasst Änderungen für Nutzende, Schritte für die Aktualisierung und bekannte Einschränkungen zusammen.

## 0.3.0.0

Desk erleichtert die Navigation und die tägliche Arbeit mit Projekten, Reservierungen, Lagerbewegungen und Belegen. Die Desktop-Seitenleiste lässt sich einklappen. Auf kleinen Bildschirmen bleiben die Aktionen in Bestätigungsdialogen beim Scrollen sichtbar.

### Projekte und Planung

- Öffne Arbeitsbereiche, Projekte und Kontakte über die globale Suche mit Strg+K oder ⌘ K. Zusätzliche Angaben helfen, gleichnamige Treffer zu unterscheiden.
- Filtere Kanban-Aufgaben nach Titel, Zuständigkeit oder Fälligkeit. Die Übersicht zeigt anstehende und überfällige Aufgaben, und die Projektliste hebt überfällige aktive Projekte hervor.
- Grenze Reservierungen im Projekt nach Kalendertag, Ressource oder Lagerort ein. Die Tabelle zeigt die Dauer und noch ausgegebene Mengen. Vor der endgültigen Freigabe zeigt Desk die betroffene Ressource und den Zeitraum, bei Inventar auch den Lagerort.
- Durchsuche längere Listen bei der Auswahl von Interessenten, Artikeln und Projekten. In den Ist-Kosten speichert Desk die Zuordnung erst nach bestätigter Auswahl.

### Projektlager und Controlling

- Erfasse beim Wareneingang optional eine Lieferscheinreferenz. Lagerbewegungen lassen sich nach Datum, Lagerort und Projekt eingrenzen, nach Artikel oder Lieferschein durchsuchen und als CSV exportieren.
- Prüfe die Netto-Einkaufs- und Verkaufssummen in der Kalkulation und die Angebotspositionen vor dem CSV-Export.
- Prüfe beim Ist-Kosten-Import die Belege und ihre Projektzuordnungen in einer Vorschau. Im Projekt lässt sich die Ist-Kosten-Teilsumme auf die aktuell sichtbaren Belege eingrenzen.

### Projektkommunikation

- Hinweise bei unklarem oder abgelehntem Zammad-Versand zeigen den nächsten Schritt. Aktionen stehen beim jeweiligen Sendeversuch. Gleichnamige Versuche lassen sich anhand des Zeitpunkts unterscheiden.

### Aktualisierung

Sichere vor dem Update die Datenbank und die Laufzeitkonfiguration. Führe vor dem Start die Migration `011_delivery_reference.sql` aus. Sie ergänzt das Feld für die optionale Lieferscheinreferenz. [Installation](docs/installation.md) · [Sicherung und Wiederanlauf](docs/sicherung.md)

Die PWA-Geräteabnahme auf einem iPhone bleibt offen. [Issue #85](https://github.com/Vemoro/desk/issues/85)

## 0.2.0.0

Desk 0.2.0.0 verbessert die tägliche Arbeit in der Projektliste, im Kanban und in der Projektkommunikation. Die Oberfläche verwendet ein einheitliches Raster, verständliche Feldmeldungen und nachprüfbare Tastaturführung in Hell und Dunkel.

### Highlights

- Karten im Kanban mit Maus, Touch oder Tastatur umordnen. Desk speichert die Reihenfolge je Projekt und Spalte. Karten lassen sich aus der Spalte anlegen und im Dialog bearbeiten.
- Projekte nach Kontakt, Status und Fälligkeit filtern, nach Projekttermin sortieren und über Angebotsreferenz, Rechnungsreferenz oder Kostenstelle suchen. Projektansichten können direkt verlinkt werden.
- Offene Ausgaben nach Artikel filtern, die Trefferzahl sehen und direkt zum zugehörigen Projekt wechseln. Lagerbewegungen lassen sich nach Bewegungsart und Projektbezug filtern. Fehlende Referenzen sind vor einem Projektstatuswechsel sichtbar.
- Im Projekt unter **Kommunikation** den Zeitpunkt des letzten Zammad-Sendeversuchs sehen und bei unklarem Ausgang zuerst den gespeicherten Versuch prüfen. Der Entwurf bleibt erhalten. Die PDF-Auswahl zeigt den vollständigen Dateinamen.
- Optional per OpenID Connect mit einem vorhandenen Desk-Konto anmelden. Passwort und Passkey bleiben verfügbar. Für die gemeinsame Anmeldung registrierst du Desk und Zammad als eigene Clients am selben Identitätsanbieter. [OpenID Connect einrichten](docs/desk.md#openid-connect-für-vorhandene-konten-vorbereiten)
- Eingabefehler stehen direkt am Feld und die Tastatur springt zum ersten Fehler. Projektstatus sind mit Text und Farbpunkt gekennzeichnet. Beim Widerruf eines API-Tokens, Entfernen eines Passkeys und Sperren eines Teamkontos zeigt Desk vorab die Auswirkungen.

### Aktualisierung

Sichere die Desk-Datenbank und die Laufzeitkonfiguration. Migriere vor dem ersten Start auf den neuen Stand. Die Migration `010_kanban_order.sql` ergänzt die gespeicherte Reihenfolge der Kanban-Karten. [Installation](docs/installation.md) · [Sicherung und Wiederanlauf](docs/sicherung.md)

Die separat offene PWA-Geräteabnahme auf einem echten iPhone bleibt in [#85](https://github.com/Vemoro/desk/issues/85) dokumentiert. Desk läuft für den allgemeinen Projektablauf mit optionalen Haben- und Zammad-Anbindungen.

## 0.1.0.0 (2026-11-26)

Desk ist eine selbst gehostete Projektverwaltung für kleine Teams. Die erste Version begleitet einen Auftrag von der Kundenanfrage über Planung, Kalkulation und Projektlager bis zur dokumentierten Rechnungsreferenz. Quellarchiv und Prüfsumme stehen im [GitHub-Release](https://github.com/Vemoro/desk/releases/tag/v0.1.0.0) bereit. [Abnahmeprotokoll](https://github.com/Vemoro/desk/issues/65)

### Projekte, Planung und Lager

- Kontakte, Projekte und Aufgaben im Kanban verwalten, Einkauf und Verkauf kalkulieren und belegbezogene Ist-Kosten Projekten zuordnen. Die Kontaktdetailansicht verlinkt zugehörige Projekte. Beim Anlegen von Kontakten weist Desk auf mögliche Dubletten hin. [Projektablauf](docs/desk.md#ein-auftrag) · [Kontakte und Projekte](https://github.com/Vemoro/desk/commit/474db214ef9e42aec6eb47f642f097aa9f25a850) · [Dublettenhinweis](https://github.com/Vemoro/desk/commit/6f54ebb4b12ec7428aaa38c5edac602fa3be6be0)
- Personal und Material im Projekt vormerken und die Belegung in der Wochenplanung einsehen. Das Projektlager zeigt je Lagerort, was physisch vorhanden, reserviert und frei ist. Geräte lassen sich anhand ihrer Inventarnummer unterscheiden. Wareneingang und Verbrauch können mit einer begründeten Gegenbuchung korrigiert werden. [Wochenplanung](https://github.com/Vemoro/desk/commit/68935756c9cb99430dcfa67cc8a610fadbe438c5) · [Inventarnummern](https://github.com/Vemoro/desk/commit/371bb61be824ba72b9cb7ddb89d217166af565ba) · [Lagerkorrekturen](https://github.com/Vemoro/desk/commit/8e2812a010ac13608956c85efce01265884a563c)
- Der Projektverlauf hält Statuswechsel, Festlegungen und Freigaben von Reservierungen sowie Lagerbewegungen fest. Auf Smartphones öffnet sich die Navigation über **Menü**. [Projektverlauf](https://github.com/Vemoro/desk/commit/e9cd3ed469ed606b4593ce3c000baba8b5451e1e) · [Handymenü](https://github.com/Vemoro/desk/commit/cf8a4d487ce03d891762536a10e1681aa61be64a)
- Die Kontaktsuche findet auch Telefonnummern. Bei Vormerkungen für Personal und Inventar zeigt Desk die Browser-Zeitzone an und prüft Beginn und Ende vor dem Speichern. [Kontaktsuche](https://github.com/Vemoro/desk/commit/f2d6cdf9c6bb8bb0e8b0c119d44836e34097ffea) · [Zeitraum](https://github.com/Vemoro/desk/commit/96f2b8c4c46539b4870477f96fdcee07197c0cb6) · [Zeitzone](https://github.com/Vemoro/desk/commit/fedbd00f1a0b8960be6c31a462e1ad502da1c176)

### Kommunikation und Anbindungen

- Die Projektkommunikation zeigt den Ticketverlauf und kennzeichnet ein- und ausgehende E-Mails sowie interne Notizen. Die Suche filtert Betreff und Text der geladenen Nachrichten. Bei einer eingehenden E-Mail mit eindeutiger Antwortadresse und gültiger Nachrichtenkennung öffnet **Antworten** den Editor mit Empfänger und Betreff. Zammad verschickt die E-Mail als Antwort auf die ausgewählte Nachricht. Dieser Bezug bleibt bei einer Wiederholung erhalten. PDF-Anhänge sind bis 5 MB möglich. [Zammad im Projekt](docs/desk.md#zammad) · [Artikelbezogene Antworten](https://github.com/Vemoro/desk/commit/3a9d8659b5a0304f7a281b9e682ea5fca317d4b7)
- Im verknüpften Ticket stehen Absender, Zeitpunkt und Aktionen direkt am Beitrag. In der zweispaltigen Ansicht scrollt der Verlauf separat. Unter dem Verlauf erscheint zunächst die interne Notiz. Beim Antworten oder Weiterleiten nimmt der E-Mail-Editor ihren Platz ein. Nach dem Schließen oder erfolgreichen Versand erscheint der Notizentwurf wieder. Interne Notizen haben einen schraffierten Rand. Du kannst aus Beiträgen zitieren und die Notiz direkt in Zammad speichern. **Text weiterleiten** übernimmt den Nachrichtentext einer E-Mail in einen neuen Entwurf. Anhänge mit Download-Symbol lassen sich direkt am Beitrag herunterladen. [Ticketbereich](docs/desk.md#zammad) · [Schreibfläche](https://github.com/Vemoro/desk/commit/4db8e303c065f6a7a5c9df620d459aa25843e0b3) · [Anhänge](https://github.com/Vemoro/desk/commit/b087c3db733646a8d571de3de17235948d719e82)
- Tickets lassen sich per Dialog anlegen oder zuordnen. Bei unklarem Versand bleiben die übermittelten Angaben im geöffneten Editor gesperrt. Sobald ein Sendeversuch angezeigt wird, lässt sich sein Status im Projekt prüfen. [Versand prüfen](docs/desk.md#zammad)
- Haben und Zammad sind optional. Desk kann vorhandene Haben-Angebote verknüpfen, ihren Status lesen und Kontakte mit Haben abgleichen. Ohne Anbindungen lassen sich externe Vorgänge als Referenzen, Links und Notizen am Projekt erfassen. [Haben](docs/desk.md#haben) · [Installation mit und ohne Zammad](docs/installation.md)

### Konten und API

- Unter **Mein Konto** können Nutzende das Passwort ändern, Passkeys verwalten und die installierte Desk-Version für einen Fehlerbericht kopieren. Ist im Build ein Git-Commit hinterlegt, wird er mit kopiert. Die Administration kann Teamkonten sperren und wieder freigeben. [Passkeys](docs/desk.md#passkeys) · [Passwort ändern](https://github.com/Vemoro/desk/commit/da9e2351ea2644a2f8ba86bcf3521b5ad95b8431) · [Kontozugriff](https://github.com/Vemoro/desk/commit/c2635f21fb0e28878ec14380e0e85aa6834068a4) · [Versionsanzeige](https://github.com/Vemoro/desk/commit/2b1104d4ae0bbfeb560e6c7549954d1c347ce5c4)
- Der laufende Dienst stellt seine OpenAPI-Beschreibung unter `/api/v1/openapi.json` bereit. Die Administration kann Desk-API-Tokens ausstellen und widerrufen. [Seitennavigation der REST-API](docs/desk.md#seitennavigation-der-rest-api)

### Installation und Aktualisierung

- Die Installation als Web-App und der Start im eigenen Fenster sind unter Windows und Android bestätigt. Die Abnahme auf einem echten iPhone steht aus. [Geräteabnahme](https://github.com/Vemoro/desk/issues/85) [Desk als Web-App installieren](docs/desk.md#desk-als-web-app-installieren)
- Für eine Erstinstallation eine leere PostgreSQL-17-Datenbank migrieren und das erste Administrationskonto anlegen. Zammad lässt sich optional anbinden. Die Installationsdoku beschreibt den mit Desk geprüften Aufbau einer neuen Zammad-Instanz und ihre getrennte Sicherung. Der Desk-Lizenztext liegt auch im Laufzeit-Image. [Installation](docs/installation.md) · [Lizenzinventar](docs/lizenzinventar.md)
- Bei einer vorhandenen Desk-Entwicklungsinstanz den Dienst vor dem Wechsel anhalten, PostgreSQL und die Laufzeitkonfiguration sichern und die Wiederherstellung getrennt prüfen. Die neue Version erst nach erfolgreicher Migration starten. [Sicherung und Wiederanlauf](docs/sicherung.md#upgrade-und-wiederanlauf-proben)
- Führe vor dem Start die Migrationen `008_zammad_reply.sql` und `009_zammad_internal_notes.sql` aus. Desk speichert damit den Bezug auf die beantwortete Nachricht und hält Sendeversuche für interne Notizen getrennt fest. Ein Desk-Stand vor Einführung von Migration 008 sendet die gespeicherte Antwortreferenz bei einem erneuten Versuch nicht mit. Kläre offene artikelbezogene Versuche vor dem Rückwechsel oder wiederhole sie später mit einem Stand, der die Referenz mitsendet. Lass bei offenen Notizversuchen die Ticketverknüpfung bestehen, damit du sie nach der Rückkehr zum neuen Stand prüfen kannst. [Zammad und Rückwechsel](docs/desk.md#zammad)
- `DESK_AUTH_SECRET` dauerhaft setzen und für `DESK_ORIGIN` die tatsächliche Browseradresse verwenden. Das Team meldet sich nach dem Wechsel auf Better Auth neu an. Wurde Better Auth bereits migriert, die Sitzungen beider Versionen vor dem Wechsel gemäß Betriebsanleitung widerrufen. Passkeys gelten für den Host der Anmeldeadresse. [Update auf Better Auth](docs/desk.md#update-auf-better-auth)

### Bekannte Einschränkungen und offene Abnahme

- Angebote und Rechnungen entstehen in Haben oder im eingesetzten Abrechnungssystem. Desk übergibt Angebotspositionen als CSV. Ist-Kosten lassen sich per Belegreferenz zuordnen oder aus einer CSV übernehmen. Angebotsentwürfe und der Abruf projektbezogener Ist-Kosten in Haben sind offene Schnittstellenaufgaben. [Angebotsentwürfe](https://github.com/Vemoro/desk/issues/5) · [Projektbezogene Ist-Kosten](https://github.com/Vemoro/desk/issues/6)
- Artikelbezogene Antworten mit PDF wurden mit Zammad 7.2.3-0015 und 7.3.0-0001 in isolierten Testumgebungen geprüft. Der Empfang einer PDF-Testmail über den eingerichteten Zammad-Mailkanal wurde auf dem Layout-Teststand bestätigt. Kontaktabgleich und Angebotsstatus wurden mit synthetischen Daten auf der getrennten Vemoro-Testinstanz von Haben abgenommen. [Bestätigter PDF-Empfang](https://github.com/Vemoro/desk/issues/65) · [Haben-Abnahme](https://github.com/Vemoro/desk/issues/65)
