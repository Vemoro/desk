# Desk verwenden und betreiben

## Ein Auftrag

1. Einen Kontakt und ein Projekt anlegen. Aufgaben im Kanban verteilen und den Projektstatus auf Planung setzen.
2. Personal und Inventar vormerken. Geplante Einkaufskosten und Verkaufspositionen erfassen. Die Verkaufspositionen können als CSV exportiert werden.
3. Eine Angebotsreferenz ergänzen. Bei eingerichteter Haben-Verbindung die ID des vorhandenen Angebots eintragen und abgleichen. Desk zeigt den Status des Angebots an und kann die Bestätigung übernehmen. Ohne Haben wird der Projektstatus von Hand gesetzt.
4. Nach der Bestätigung Ressourcen fest reservieren. Zeitliche Überschneidungen bei Personal und Geräten sowie Mengenüberschreitungen werden abgelehnt. Eine Freigabe entfernt die Reservierung. Bereits ausgegebene Geräte bleiben bis zur Rückgabe sichtbar.
5. Im Projektlager Wareneingang erfassen. Bei einer festen Reservierung kann das Team Geräte ausgeben und später zurücknehmen oder Verbrauchsmaterial ausbuchen. Die Bestandsübersicht zeigt beim Gerät die aktuell geltenden festen Vormerkungen. Die Ressourcenplanung berücksichtigt bei neuen Reservierungen das gewählte Zeitfenster.
6. Ist-Kosten importieren oder per Belegreferenz zuordnen. Im Controlling stehen Netto-Plan- und Ist-Kosten nebeneinander. Die in Haben oder einem anderen System erstellte Rechnung im Projekt referenzieren, dann den Projektstatus auf Abgerechnet setzen.

## Haben

`HABEN_URL` und `HABEN_TOKEN` auf dem Desk-Server setzen. Angebote benötigen Leserechte für Angebote. Ein Kontaktabgleich benötigt passend zum gewählten Vorgang Lese- oder Schreibrechte für Kontakte. Gemeinsam gepflegt werden Name, E-Mail und Telefon. Der Import legt neue Kontakte an, deren Namen und E-Mail-Adresse keinem unverknüpften Desk-Kontakt entsprechen. Bestehende Verknüpfungen werden einzeln abgeglichen. Bei abweichenden Änderungen auf beiden Seiten bleibt die Wahl beim Team.

Desk legt Angebote in der ersten Version über die manuelle Übergabe an Haben an. Der Abgleich verwendet die unterstützte Lese-API. Bei Belegkosten unterstützt Desk die Einzelzuordnung oder einen vorbereiteten CSV-Export. Pro Zeile sind `reference`, `name` und der Nettobetrag in `amount` erforderlich. `cost_center` ist optional. Verwende eine stabile Referenz je Belegzeile. Der Import erkennt die Kombination aus Quelle und Referenz wieder und zeigt fehlende Projektzuordnungen unter Ist-Kosten.

## Zammad

`ZAMMAD_URL`, `ZAMMAD_TOKEN` und die Ticketgruppe `ZAMMAD_GROUP` setzen. Der Zammad-Zugang benötigt für die Gruppe die passenden Agentenrechte. Desk verwendet das Ticket für den Nachrichtenverlauf und die Übergabe ausgehender Antworten. Der Versand bleibt in Zammad nachvollziehbar. PDF-Anhänge sind bis 5 MB möglich. Wenn das Ergebnis einer Sendung unklar ist, zuerst den gespeicherten Sendeversuch prüfen. Eine erneute Sendung ist eine ausdrückliche Aktion und sucht zuvor nach der Desk-Referenz im Ticket. Ohne Zammad sind Kommunikationslink und Notiz im Projekt verfügbar.

## Betrieb

- Für die Produktion `bun run build` ausführen, die Migrationen mit `bun run migrate` anwenden und `bun run start` starten. Alternativ mit dem Dockerfile bauen und den Container neben einer bereitgestellten PostgreSQL-Instanz betreiben.
- `DESK_ORIGIN` auf die externe HTTPS-Adresse setzen. Den Dienst hinter einem HTTPS-Reverse-Proxy betreiben. Für eine Demo eine separate Datenbank mit dem Suffix `_demo` verwenden.
- Teamkonten und widerrufbare API-Tokens stehen in den Einstellungen. Der API-Vertrag ist unter `/api/v1/openapi.json` verfügbar. Schreibende Tickets, Kontakte und andere Vorgänge laufen über die jeweils eingerichteten Serverzugänge.
- PostgreSQL sichern. Vor einem Update die Wiederherstellung in einer getrennten Instanz prüfen. Für Desktop und Smartphone dieselbe HTTPS-Adresse verwenden.

### Update auf Better Auth

Vor dem Update den bisherigen Desk-Dienst anhalten. PostgreSQL sichern und die Wiederherstellung in einer getrennten Instanz prüfen. Für den neuen Dienst `DESK_AUTH_SECRET` als dauerhaftes Secret setzen. Einen zufälligen Wert erzeugt `bun -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. Rechte auf die Ausgabe beschränken. `DESK_ORIGIN` muss zur aufgerufenen Adresse passen.

Die Migration `002_better_auth.sql` übernimmt vorhandene Passwort-Hashes und stellt Better Auth die Konten über `auth_users` bereit. Die UUIDs, Rollen, Zuordnungen und API-Tokens bleiben erhalten. Das Team meldet sich nach dem Update einmal neu an. Eine Sitzung läuft nach zwölf Stunden ab. Konten legt die Administration weiterhin in Desk oder über `bun run admin` an.

Für den Rückweg den neuen Dienst anhalten. Nach einer bereits angewandten Migration vor jedem Wechsel zur anderen Anwendungsversion die Sitzungen beider Versionen in der Desk-Datenbank widerrufen.

```sql
BEGIN;
DELETE FROM auth_sessions;
DELETE FROM sessions;
COMMIT;
```

Danach das vorherige Anwendungsimage mit derselben Datenbank starten oder den neuen Dienst erneut ausrollen. Das Team meldet sich nach jedem Versionswechsel neu an. Die alten Passwort-Hashes und die seit dem Update geschriebenen Geschäftsdaten bleiben erhalten. Ein älteres Komplettbackup stellt den Stand zum Sicherungszeitpunkt wieder her. Beim Zurückspielen in die produktive Instanz auch die Sitzungstabelle des wiederhergestellten Stands leeren.

### Passkeys

Unter **Mein Konto → Passkeys** können Mitarbeitende und Administration eigene Passkeys benennen und einrichten. Auf der Anmeldeseite startet **Mit Passkey anmelden** die Freigabe im Browser. Das bestehende Passwort kann weiterhin verwendet werden. Beim Entfernen eines Passkeys endet seine Verwendung in Desk. Der Browser oder Passwortmanager kann den lokalen Eintrag weiterhin anzeigen.

Passkeys gelten für den Host in `DESK_ORIGIN`. In Produktion ist eine HTTPS-Adresse erforderlich, für lokale Tests unterstützt der Browser `http://localhost`. Bei einem Wechsel auf einen anderen Host richten Mitarbeitende ihre Passkeys dort neu ein. Anmeldungen mit bestehenden Passwörtern bleiben möglich. Vor dem Update auf die Version mit Passkeys `003_passkeys.sql` über `bun run migrate` anwenden.

## Ansichten

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="screenshots/controlling-dunkel.png">
  <img src="screenshots/controlling-hell.png" alt="Controlling mit geplanten Einkaufskosten, Ist-Kosten und der Abweichung">
</picture>

[Projektlager auf dem Smartphone, hell](screenshots/projektlager-hell-handy.png) · [Projektlager auf dem Smartphone, dunkel](screenshots/projektlager-dunkel-handy.png)
