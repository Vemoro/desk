# PostgreSQL sichern und eine Wiederherstellung prüfen

Desk nutzt PostgreSQL 17. Verwende `pg_dump` und `pg_restore` aus derselben Hauptversion. Ein Desk-Dump enthält die Daten und das Schema der Desk-Datenbank. PostgreSQL-Rollen sowie die Laufzeitkonfiguration des Dienstes werden separat bereitgestellt. Halte die passende Anwendungsversion, den Datenbankzugang, `DESK_ORIGIN` und die für diese Version gesetzten Secrets im vorgesehenen Konfigurations- oder Secret-Speicher verfügbar. Dumps und Zugangsdaten gehören außerhalb des Repositorys.

## Sicherung erstellen

Prüfe Host, Port und Datenbankname der Quelle anhand der Laufzeitkonfiguration. Lege das Archiv im geschützten Sicherungsverzeichnis ab. Die folgenden Befehle verwenden für echte Zugänge eine lokale libpq-Passwortdatei oder eine Passwortabfrage. Die Beispiele stehen für eine eigene Sicherung und eine leere, getrennte Prüfdatenbank.

```sh
psql --host=QUELLHOST --port=5432 --username=desk --dbname=QUELLDATENBANK --command='\conninfo'
pg_dump --host=QUELLHOST --port=5432 --username=desk --dbname=QUELLDATENBANK \
  --format=custom --file=/geschuetzter/pfad/desk.dump
pg_restore --list /geschuetzter/pfad/desk.dump
```

Prüfe Meldungen und Rückgabecode. Die Archivliste zeigt den Inhalt. Eine erfolgreiche Wiederherstellung prüft zusätzlich, ob sich die Daten tatsächlich einspielen lassen. [PostgreSQL 17 zu pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)

## In einer getrennten Datenbank wiederherstellen

Prüfe Host, Port und Datenbankname des Ziels. Verwende eine neu angelegte Datenbank und einen dafür berechtigten Benutzer. Führe die Befehle nur mit einem Archiv aus einer vertrauenswürdigen Quelle aus.

```sh
createdb --host=TESTHOST --port=5432 --username=desk desk_restore_demo &&
psql --host=TESTHOST --port=5432 --username=desk --dbname=desk_restore_demo --command='\conninfo'
```

Fahre nur fort, wenn die Datenbank neu angelegt wurde und die Ausgabe die vorgesehene Testverbindung bestätigt. Bei einer bereits vorhandenen Datenbank einen neuen Namen wählen.

```sh
pg_restore --host=TESTHOST --port=5432 --username=desk --dbname=desk_restore_demo \
  --single-transaction --exit-on-error --no-owner --no-privileges /geschuetzter/pfad/desk.dump
```

Prüfe, ob `pg_restore` erfolgreich beendet wurde, bevor du Desk mit der wiederhergestellten Datenbank startest. Das Ziel benötigt eigene Rollen und Berechtigungen. `--no-owner` und `--no-privileges` lassen Eigentümer und Grants aus der Quelle beim Prüfrestore aus. Vor einer Freigabe an Nutzende die [Vorgaben für wiederhergestellte Sitzungen](desk.md#update-auf-better-auth) ausführen. [PostgreSQL 17 zu pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html)

## Probelauf mit Muster Auftragsservice

Lege in einem isolierten PostgreSQL-17-Dienst zuerst eine neue Quelle namens `desk_backup_demo` an. Setze deren lokale `DATABASE_URL`. Prüfe vor `bun run migrate` und `bun run demo`, dass Host, Port und Datenbankname in dieser Variable zur mit `psql` geprüften Testquelle passen. Führe die beiden Befehle erst danach aus. `bun run demo` benötigt dafür `DESK_DEMO_PASSWORD`. Führe Sicherung und Wiederherstellung wie oben aus. Prüfe, dass das Ziel `desk_restore_demo` ist und die Quelle `desk_backup_demo` bleibt.

Verwende für die Probe einen getrennten Checkout derselben Anwendungsversion ohne produktive `.env`. Setze die `DATABASE_URL` des Ziels und ein separates Test-Secret in `DESK_AUTH_SECRET`. Setze `NITRO_HOST=127.0.0.1` und verwende einen freien `NITRO_PORT`, zum Beispiel `4184`. Setze `DESK_ORIGIN` auf die passende Adresse, im Beispiel `http://127.0.0.1:4184`. Setze `HABEN_URL`, `HABEN_TOKEN`, `ZAMMAD_URL` und `ZAMMAD_TOKEN` für den Testprozess ausdrücklich auf leer. In PowerShell 7.5 bleiben mit `$env:HABEN_URL=''` gesetzte Leerwerte erhalten. Führe `bun install --frozen-lockfile`, `bun run build` und `bun run start` aus.

1. Mit dem Demo-Konto anmelden. Der authentifizierte Aufruf von `/api/v1/integrations` muss `haben: false` und `zammad: false` ergeben.
2. Das Projekt **Veranstaltungsbetreuung im Kulturhaus** öffnen und seine externe Angebotsreferenz **ANG-K-102** im Überblick prüfen.
3. Im Projektlager den Wareneingang **Mobiles Technikset** mit Menge **1** prüfen. Über die authentifizierten Endpunkte `/api/v1/movements` und `/api/v1/locations` lässt sich die Lagerort-ID dem **Hauptlager** zuordnen.

Halte Quelle, Ziel, verwendete Anwendungsversion, Ergebnis und Zeitpunkt fest. Zugangsdaten und Archiv bleiben im geschützten Arbeitsbereich.

## Upgrade und Wiederanlauf proben

Sichere die Testdaten auf dem Ausgangsstand. Stelle dasselbe Vorab-Archiv in zwei neu angelegten Datenbanken wieder her. Verwende pro Desk-Instanz den zugehörigen Checkout, einen eigenen Loopback-Port und die passende `DESK_ORIGIN` wie im Probelauf. Setze die Integrationsvariablen in beiden Instanzen auf leer.

1. Setze im Checkout der Zielversion `DATABASE_URL` auf die erste Wiederherstellung. Prüfe die Verbindung und führe `bun run migrate` aus. Vergleiche das Ergebnis von `SELECT name FROM desk_migrations ORDER BY name;` mit den erwarteten Migrationsdateien des Zielstands. Starte die Zielversion mit dieser Datenbank. Prüfe Anmeldung, Integrationsstatus und die Daten des Beispielauftrags.
2. Starte die Ausgangsversion mit ihrer Laufzeitkonfiguration und setze `DATABASE_URL` auf die zweite, aus dem Vorab-Archiv wiederhergestellte Datenbank. Prüfe Anmeldung, Integrationsstatus, Migrationsstand und den Zugriff auf Projekt und Beleg.

### Erste Probe am 24. November 2026

Die Quelle war Desk-Kern [`b7a69f4`](https://github.com/Vemoro/desk/commit/b7a69f4b644c74296bca895f1c6c4f6babff9b42). Das Upgrade-Ziel war [`f7f865a`](https://github.com/Vemoro/desk/commit/f7f865a96325df1e0c25d391c7b2c4fbc2ce3167). Die Sicherung und beide Wiederherstellungen liefen mit PostgreSQL 17.12 in einer lokalen Testumgebung. Das Archiv wurde im Custom-Format erstellt und mit `--single-transaction --exit-on-error --no-owner --no-privileges` wiederhergestellt.

| Prüfung | Ergebnis |
| --- | --- |
| Zielversion | `001_core.sql` und `002_delivery_reference.sql` waren registriert. Die Anmeldung war erfolgreich und die Integrationsabfrage meldete Haben und Zammad als deaktiviert. |
| Projekt und Lager | Die authentifizierte REST-API lieferte „Büroinstallation Westflügel“ mit dem Kontakt „Kontor West“, fünf Aufgaben und dem zugeordneten Beleg `E-K-103` über 62,90 €. Der vorhandene Wareneingang „Mobiles Technikset“ mit Menge 1 hatte `delivery_reference: null`. |
| Wiederanlauf | In der zweiten Wiederherstellung war nur `001_core.sql` registriert. Die Ausgangsversion erlaubte die Anmeldung und lieferte Projekt und Beleg mit derselben Zuordnung. Beide Integrationen waren deaktiviert. |

### Vorgangsschlüssel nach einer Wiederherstellung prüfen

Wiederhole die Upgrade- und Wiederanlaufprobe mit einem Stand, der Vorgangsschlüssel für Lagerbewegungen und Vormerkungen unterstützt. Vergleiche nach der Migration die vorhandenen Reservierungen und Bewegungen sowie physischen, reservierten und freien Bestand am selben Musterartikel und Lagerort.

1. Sende im aktualisierten Teststand als Demo-Konto je einen Wareneingang an `POST /api/v1/movements` und eine Vormerkung an `POST /api/v1/reservations`. Verwende pro Vorgang einen eigenen `Idempotency-Key` und halte Eingabe, ursprüngliche Antwort-ID und Bestandszahlen fest.
2. Sichere diese aktualisierte Datenbank und stelle sie in einer weiteren neuen Testdatenbank wieder her. Starte dieselbe Zielversion mit dieser Datenbank. Melde dasselbe synthetische Konto an.
3. Sende die beiden Anfragen mit denselben Angaben und Schlüsseln erneut. Beide Antworten sollen HTTP 201 mit den ursprünglichen IDs liefern. Vergleiche die gespeicherten Bewegungen und Vormerkungen sowie die Bestandszahlen mit dem Stand nach der ersten Buchung.

#### Probe auf `4f77d81`

Quelle war [`b7a69f4`](https://github.com/Vemoro/desk/commit/b7a69f4b644c74296bca895f1c6c4f6babff9b42), Ziel war [`4f77d81`](https://github.com/Vemoro/desk/commit/4f77d81b874ceeeaec9decc35a3d1438076ad6bc) mit den Vorgangsschlüsseln für Lagerbewegungen und Vormerkungen. Beide Desk-Stände liefen mit Bun 1.4.5. Alle Wiederherstellungen liefen mit PostgreSQL 17.12, getrennten lokalen Instanzen und deaktivierten Anbindungen. Die Archive wurden im Custom-Format erstellt und mit den oben dokumentierten Restore-Optionen eingespielt.

| Schritt | Soll | Ist |
| --- | --- | --- |
| Upgrade und Wiederanlauf | Vorhandene Reservierungen, Bewegungen und Bestandszahlen bleiben erhalten. | Alle vorhandenen Bewegungs- und Vormerkungs-IDs, ihre Zuordnungen und die Bestandszahlen stimmten in beiden Wiederherstellungen überein. Die Ausgangsversion verwendete `001_core.sql`. Im Zielstand waren zusätzlich `002_better_auth.sql`, `003_stock_write_requests.sql` und `004_passkeys.sql` registriert. |
| Buchung auf dem Zielstand | Ein Wareneingang über zwei Einheiten und eine Personalvormerkung ergeben je einen neuen Eintrag. | Der physische Bestand von „Kabelbinder, Packung“ im Hauptlager stieg auf 20 Einheiten. Der Wareneingang und die Personalvormerkung für „Büroinstallation Westflügel“ erhöhten die Gesamtzahlen auf vier Bewegungen und fünf Vormerkungen. |
| Restore und Wiederholung | Beide gespeicherten Antworten sind nach Wiederherstellung mit denselben Schlüsseln abrufbar. | Beide Antworten lieferten HTTP 201 mit den ursprünglichen IDs. Die Anzahl blieb bei vier Bewegungen und fünf Vormerkungen. Für „Kabelbinder, Packung“ im Hauptlager blieben 20 physische, sechs reservierte und 14 freie Einheiten erhalten. Alle vier Migrationen waren registriert. |
