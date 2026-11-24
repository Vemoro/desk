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
createdb --host=TESTHOST --port=5432 --username=desk desk_restore_demo
psql --host=TESTHOST --port=5432 --username=desk --dbname=desk_restore_demo --command='\conninfo'
pg_restore --host=TESTHOST --port=5432 --username=desk --dbname=desk_restore_demo \
  --single-transaction --exit-on-error --no-owner --no-privileges /geschuetzter/pfad/desk.dump
```

Das Ziel benötigt eigene Rollen und Berechtigungen. `--no-owner` und `--no-privileges` lassen Eigentümer und Grants aus der Quelle beim Prüfrestore aus. [PostgreSQL 17 zu pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html)

## Probelauf mit Muster Auftragsservice

Lege in einem isolierten PostgreSQL-17-Dienst zuerst eine neue Quelle namens `desk_backup_demo` an. Setze deren lokale `DATABASE_URL` und führe `bun run migrate` und `bun run demo` aus. `bun run demo` benötigt dafür `DESK_DEMO_PASSWORD`. Führe Sicherung und Wiederherstellung wie oben aus. Prüfe, dass das Ziel `desk_restore_demo` ist und die Quelle `desk_backup_demo` bleibt.

Starte dieselbe Anwendungsversion mit der `DATABASE_URL` des Ziels und einer eigenen lokalen `DESK_ORIGIN`. Wenn die getestete Version Better Auth nutzt, setze ein separates Test-Secret in `DESK_AUTH_SECRET`. Starte aus einem Arbeitsverzeichnis ohne produktive `.env` und ohne geerbte Haben- oder Zammad-Konfiguration. Setze `HABEN_URL`, `HABEN_TOKEN`, `ZAMMAD_URL` und `ZAMMAD_TOKEN` für den Testprozess ausdrücklich auf leer. In PowerShell 7.5 bleiben mit `$env:HABEN_URL=''` gesetzte Leerwerte erhalten.

1. Mit dem Demo-Konto anmelden. Der authentifizierte Aufruf von `/api/v1/integrations` muss `haben: false` und `zammad: false` ergeben.
2. Das Projekt **Veranstaltungsbetreuung im Kulturhaus** öffnen und seine externe Angebotsreferenz **ANG-K-102** im Überblick prüfen.
3. Im Projektlager den Wareneingang **Mobiles Technikset** mit Menge **1** prüfen. Über die authentifizierten Endpunkte `/api/v1/movements` und `/api/v1/locations` lässt sich die Lagerort-ID dem **Hauptlager** zuordnen.

Halte Quelle, Ziel, verwendete Anwendungsversion, Ergebnis und Zeitpunkt fest. Zugangsdaten und Archiv bleiben im geschützten Arbeitsbereich.
